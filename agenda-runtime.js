const express = require('express');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: false,
  keepAlive: true,
  ssl: { rejectUnauthorized: false }
}) : null;

const originalPost = express.application.post;
const originalPatch = express.application.patch;

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function allowedManual(req, res) {
  if (!['admin', 'operativo', 'supervisor_flotas', 'operador'].includes(req.user?.role)) {
    res.status(403).json({ error: 'No tienes permiso para registrar ingresos manuales.' });
    return false;
  }
  return true;
}

function allowedActions(req, res) {
  if (!['admin', 'operativo', 'supervisor_flotas'].includes(req.user?.role)) {
    res.status(403).json({ error: 'No tienes permiso para modificar la agenda.' });
    return false;
  }
  return true;
}

function companyAllowed(req, company) {
  return req.user?.role !== 'supervisor_flotas' || normalize(company) === normalize(req.user?.empresa);
}

function summary(row) {
  return {
    id: row.id,
    garantiaId: row.garantia_id,
    folio: row.folio || row.folio_manual || '',
    unidad: row.numero_economico || '',
    empresa: row.empresa || '',
    contactoNombre: row.contacto_nombre || '',
    telefono: row.telefono || '',
    status: row.status,
    requestedAt: row.requested_at,
    proposedAt: row.proposed_at,
    confirmedAt: row.confirmed_at,
    scheduledFor: row.scheduled_for,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function findSchedule(id) {
  const result = await pool.query(`
    SELECT sr.*,
      COALESCE(g.folio, sr.folio_manual) AS folio,
      COALESCE(g.numero_economico, sr.numero_economico) AS numero_economico,
      COALESCE(g.empresa, sr.empresa) AS empresa,
      COALESCE(g.contacto_nombre, sr.contacto_nombre) AS contacto_nombre,
      COALESCE(g.telefono, sr.telefono) AS telefono
    FROM schedule_requests sr
    LEFT JOIN garantias g ON g.id = sr.garantia_id
    WHERE sr.id = $1
  `, [id]);
  return result.rows[0] || null;
}

async function slotBusy(id, scheduledFor) {
  const result = await pool.query(`
    SELECT id FROM schedule_requests
    WHERE id <> $1 AND status = 'confirmed'
      AND DATE(scheduled_for AT TIME ZONE 'UTC') = DATE($2::timestamptz AT TIME ZONE 'UTC')
      AND TO_CHAR(scheduled_for AT TIME ZONE 'UTC','HH24:MI') = TO_CHAR($2::timestamptz AT TIME ZONE 'UTC','HH24:MI')
    LIMIT 1
  `, [id, scheduledFor.toISOString()]);
  return result.rowCount > 0;
}

express.application.post = function patchedPost(path, ...handlers) {
  if (path !== '/api/schedules/manual') return originalPost.call(this, path, ...handlers);
  const authRequired = handlers[0];
  return originalPost.call(this, path, authRequired, async (req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: 'Base de datos no disponible.' });
      if (!allowedManual(req, res)) return;
      const requestedCompany = String(req.body.empresa || '').trim();
      const restrictedRole = ['supervisor_flotas', 'operador'].includes(req.user.role);
      const company = restrictedRole ? String(req.user.empresa || '').trim() : requestedCompany;
      const unit = String(req.body.unidad || '').trim();
      const scheduledFor = req.body.scheduledFor ? new Date(req.body.scheduledFor) : null;
      if (!company || !unit || !scheduledFor || Number.isNaN(scheduledFor.getTime())) {
        return res.status(400).json({ error: 'Completa empresa, unidad y fecha válida.' });
      }
      const unitCheck = await pool.query(`
        SELECT id FROM fleet_units
        WHERE REGEXP_REPLACE(LOWER(COALESCE(empresa,'')), '[^a-z0-9]', '', 'g') = REGEXP_REPLACE(LOWER($1), '[^a-z0-9]', '', 'g')
          AND REGEXP_REPLACE(LOWER(COALESCE(numero_economico,'')), '[^a-z0-9]', '', 'g') = REGEXP_REPLACE(LOWER($2), '[^a-z0-9]', '', 'g')
        LIMIT 1
      `, [company, unit]);
      if (!unitCheck.rowCount) return res.status(403).json({ error: 'La unidad no pertenece a tu empresa.' });
      const result = await pool.query(`
        INSERT INTO schedule_requests
          (id, garantia_id, telefono, status, notes, scheduled_for, proposed_at, empresa, numero_economico, contacto_nombre, folio_manual)
        VALUES ($1, NULL, $2, 'proposed', $3, $4, NOW(), $5, $6, $7, $8)
        RETURNING *
      `, [global.crypto.randomUUID(), String(req.body.telefono || '').replace(/\D/g,''), String(req.body.notes || '').trim(), scheduledFor.toISOString(), company, unit, String(req.body.contactoNombre || '').trim(), String(req.body.folio || '').trim()]);
      res.status(201).json(summary(result.rows[0]));
    } catch (error) {
      console.error('[Agenda runtime] manual:', error);
      res.status(500).json({ error: 'No se pudo registrar la programación manual.' });
    }
  });
};

express.application.patch = function patchedPatch(path, ...handlers) {
  if (!['/api/schedules/:id/confirm', '/api/schedules/:id/cancel', '/api/schedules/:id/reschedule'].includes(path)) {
    return originalPatch.call(this, path, ...handlers);
  }
  const authRequired = handlers[0];
  const action = path.split('/').pop();
  return originalPatch.call(this, path, authRequired, async (req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: 'Base de datos no disponible.' });
      if (!allowedActions(req, res)) return;
      const current = await findSchedule(req.params.id);
      if (!current) return res.status(404).json({ error: 'Programación no encontrada.' });
      if (!companyAllowed(req, current.empresa)) return res.status(403).json({ error: 'No puedes modificar programaciones de otra empresa.' });

      if (action === 'cancel') {
        const result = await pool.query(`UPDATE schedule_requests SET status='cancelled', notes=COALESCE(NULLIF($2,''),notes), updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, String(req.body.notes || 'Cancelada').trim()]);
        return res.json(summary(result.rows[0]));
      }

      const scheduledFor = req.body.scheduledFor ? new Date(req.body.scheduledFor) : (current.scheduled_for ? new Date(current.scheduled_for) : null);
      if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) return res.status(400).json({ error: 'Fecha y hora inválidas.' });
      if (await slotBusy(req.params.id, scheduledFor)) return res.status(409).json({ error: 'Ese horario ya está ocupado.' });

      if (action === 'reschedule') {
        const result = await pool.query(`UPDATE schedule_requests SET status='proposed', scheduled_for=$2, proposed_at=NOW(), confirmed_at=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, scheduledFor.toISOString()]);
        return res.json(summary(result.rows[0]));
      }

      const result = await pool.query(`UPDATE schedule_requests SET status='confirmed', scheduled_for=$2, confirmed_at=NOW(), notes=COALESCE(NULLIF($3,''),notes), updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, scheduledFor.toISOString(), String(req.body.notes || '').trim()]);
      return res.json(summary(result.rows[0]));
    } catch (error) {
      console.error(`[Agenda runtime] ${action}:`, error);
      res.status(500).json({ error: 'No se pudo actualizar la programación.' });
    }
  });
};

console.log('[Agenda runtime] acciones manuales activadas');