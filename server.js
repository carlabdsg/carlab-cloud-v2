const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'carlab-dev-secret';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador Carlab';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@carlab.local').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123*';
const DEFAULT_COMPANIES = (process.env.DEFAULT_COMPANIES || 'Autobuses Norte de Sinaloa,Carlab Demo,Transportes del Pacífico').split(',').map(s => s.trim()).filter(Boolean);
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || '';
const TWILIO_TEMPLATE_REPORTE_RECIBIDO = process.env.TWILIO_TEMPLATE_REPORTE_RECIBIDO || 'HXf82c1dd49abe680d58751a33d5958231';
const TWILIO_TEMPLATE_REPORTE_ACEPTADO = process.env.TWILIO_TEMPLATE_REPORTE_ACEPTADO || 'HX0f3a3bb0752a83fbe3da0b28b9f5e845';
const TWILIO_TEMPLATE_REPORTE_RECHAZADO = process.env.TWILIO_TEMPLATE_REPORTE_RECHAZADO || 'HX4efb59223fc5c0c0db7a74c048a3ea56';
const TWILIO_TEMPLATE_REPORTE_EN_PROCESO = process.env.TWILIO_TEMPLATE_REPORTE_EN_PROCESO || 'HX04df965e5751508b211392f600b44305';
const TWILIO_TEMPLATE_REPORTE_ESPERA_REFACCION = process.env.TWILIO_TEMPLATE_REPORTE_ESPERA_REFACCION || 'HXa41b065576aaf1140087bb2b5e34775d';
const TWILIO_TEMPLATE_REPORTE_TERMINADO = process.env.TWILIO_TEMPLATE_REPORTE_TERMINADO || 'HX3dc80afa6862fd5f0479410f92742278';
const TWILIO_TEMPLATE_SCHEDULE_REQUEST = process.env.TWILIO_TEMPLATE_SCHEDULE_REQUEST || process.env.TWILIO_TEMPLATE_PROGRAMAR || '';

const ROLE_SUPERVISOR_FLOTAS = 'supervisor_flotas';
const SUPERVISOR_ROLES = ['supervisor', ROLE_SUPERVISOR_FLOTAS];
const BOARD_ROLES = ['admin','operativo','supervisor', ROLE_SUPERVISOR_FLOTAS];
const ALL_MANAGED_ROLES = ['admin','operador','operativo','supervisor', ROLE_SUPERVISOR_FLOTAS];
const FLEET_ALLOWED_ROLES = ['admin','operativo','supervisor', ROLE_SUPERVISOR_FLOTAS];

if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function cryptoRandomId() {
  return global.crypto?.randomUUID?.() || `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

function normalizeMxPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('521') && digits.length >= 13) return digits;
  if (digits.startsWith('52') && digits.length === 12) return `521${digits.slice(2)}`;
  if (digits.length === 10) return `521${digits}`;
    return digits;
}

function buildWhatsappTo(raw) {
  const normalized = normalizeMxPhone(raw);
  return normalized ? `whatsapp:+${normalized}` : '';
}

function buildWhatsappFrom(raw) {
  const value = String(raw || '').trim().replace(/\s+/g, '');
  if (!value) return '';
  if (value.startsWith('whatsapp:')) {
    const body = value.slice('whatsapp:'.length).replace(/\s+/g, '');
    return body.startsWith('+') ? `whatsapp:${body}` : `whatsapp:+${body.replace(/^\+?/, '')}`;
  }
  return value.startsWith('+') ? `whatsapp:${value}` : `whatsapp:+${value.replace(/^\+?/, '')}`;
}

async function sendWhatsAppTemplate({ telefono, contentSid, variables }) {
  const from = buildWhatsappFrom(TWILIO_WHATSAPP_NUMBER);
  if (!twilioClient || !from || !contentSid) return;
  const to = buildWhatsappTo(telefono);
  if (!to) return;
  await twilioClient.messages.create({
    from,
    to,
    contentSid,
    contentVariables: JSON.stringify(variables || {}),
  });
}

async function sendWhatsAppText({ telefono, body }) {
  const from = buildWhatsappFrom(TWILIO_WHATSAPP_NUMBER);
  if (!twilioClient || !from || !body) return;
  const to = buildWhatsappTo(telefono);
  if (!to) return;
  await twilioClient.messages.create({ from, to, body });
}

function parseScheduleText(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?[\s,.-]+(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!match) return null;
  let [, dd, mm, yy, hh, min, mer] = match;
  const now = new Date();
  let year = yy ? Number(yy.length === 2 ? `20${yy}` : yy) : now.getFullYear();
  let hour = Number(hh);
  const minute = Number(min);
  if (mer) {
    mer = mer.toLowerCase();
    if (mer === 'pm' && hour < 12) hour += 12;
    if (mer === 'am' && hour === 12) hour = 0;
  }
  const date = new Date(year, Number(mm) - 1, Number(dd), hour, minute);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), text };
}

function scheduleSummary(row) {
  const noteText = String(row.notes || '');
  const originalMatch = noteText.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?[\s,.-]+\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
  const originalText = originalMatch ? originalMatch[1] : '';
  return {
    id: row.id,
    garantiaId: row.garantia_id,
    folio: row.folio || '',
    unidad: row.numero_economico || '',
    empresa: row.empresa || '',
    contactoNombre: row.contacto_nombre || '',
    telefono: row.telefono || '',
    status: row.status,
    requestedAt: row.requested_at,
    proposedAt: row.proposed_at,
    confirmedAt: row.confirmed_at,
    scheduledFor: row.scheduled_for,
    originalText,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function notifyGarantiaWhatsApp(eventName, garantia) {
  if (!garantia || !garantia.telefono) return;
  const eventMap = {
    created: TWILIO_TEMPLATE_REPORTE_RECIBIDO,
    accepted: TWILIO_TEMPLATE_REPORTE_ACEPTADO,
    rejected: TWILIO_TEMPLATE_REPORTE_RECHAZADO,
    in_process: TWILIO_TEMPLATE_REPORTE_EN_PROCESO,
    waiting_parts: TWILIO_TEMPLATE_REPORTE_ESPERA_REFACCION,
    finished: TWILIO_TEMPLATE_REPORTE_TERMINADO,
  };
  const contentSid = eventMap[eventName];
  if (!contentSid) return;
  try {
    await sendWhatsAppTemplate({
      telefono: garantia.telefono,
      contentSid,
      variables: {
        folio: garantia.folio || '',
        unidad: garantia.numero_economico || garantia.numeroEconomico || '',
        empresa: garantia.empresa || '',
        falla: garantia.descripcion_fallo || garantia.descripcionFallo || '',
        motivo: garantia.motivo_decision || garantia.motivoDecision || '',
        refaccion: garantia.detalle_refaccion || garantia.detalleRefaccion || '',
      },
    });
  } catch (error) {
    console.error(`Error enviando WhatsApp (${eventName}):`, error.message);
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, nombre: user.nombre, empresa: user.empresa || '', telefono: user.telefono || '' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function sanitizeUser(row) {
  return {
    id: row.id,
    folio: row.folio || '',
    nombre: row.nombre,
    email: row.email,
    role: row.role,
    activo: row.activo,
    empresa: row.empresa || '',
    telefono: row.telefono || '',
    createdAt: row.created_at,
  };
}

function mapGarantia(row) {
  return {
    id: row.id,
    folio: row.folio || '',
    numeroObra: row.numero_obra,
    modelo: row.modelo,
    numeroEconomico: row.numero_economico,
    empresa: row.empresa,
    kilometraje: row.kilometraje || '',
    contactoNombre: row.contacto_nombre || '',
    telefono: row.telefono || '',
    tipoIncidente: row.tipo_incidente,
    descripcionFallo: row.descripcion_fallo || '',
    solicitaRefaccion: row.solicita_refaccion,
    detalleRefaccion: row.detalle_refaccion || '',
    refaccionStatus: row.refaccion_status || 'pendiente',
    refaccionAsignada: row.refaccion_asignada || '',
    estatusValidacion: row.estatus_validacion,
    estatusOperativo: row.estatus_operativo,
    motivoDecision: row.motivo_decision || '',
    observacionesOperativo: row.observaciones_operativo || '',
    evidencias: row.evidencias || [],
    evidenciasRefaccion: row.evidencias_refaccion || [],
    firma: row.firma || '',
    reportadoPorNombre: row.reportado_por_nombre || '',
    reportadoPorEmail: row.reportado_por_email || '',
    revisadoPorNombre: row.revisado_por_nombre || '',
    revisadoPorEmail: row.revisado_por_email || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    closedAt: row.closed_at,
  };
}

function mapCompany(row) {
  return {
    id: row.id,
    folio: row.folio || '',
    nombre: row.nombre,
    contacto: row.contacto || '',
    telefono: row.telefono || '',
    email: row.email || '',
    notas: row.notas || '',
    activo: row.activo,
    createdAt: row.created_at,
  };
}

function mapRegistrationRequest(row) {
  return {
    id: row.id,
    folio: row.folio || '',
    nombre: row.nombre,
    email: row.email,
    telefono: row.telefono || '',
    empresa: row.empresa || '',
    numeroEconomico: row.numero_economico || '',
    status: row.status,
    motivo: row.motivo || '',
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}


function mapFleetUnit(row) {
  return {
    id: row.id,
    empresa: row.empresa,
    nombreFlota: row.nombre_flota || '',
    numeroEconomico: row.numero_economico,
    numeroObra: row.numero_obra || '',
    marca: row.marca || '',
    modelo: row.modelo || '',
    anio: row.anio || '',
    kilometraje: row.kilometraje || '',
    polizaActiva: !!row.poliza_activa,
    campaignActiva: !!row.campaign_activa,
    estatusOperativo: row.estatus_operativo || 'sin actividad',
    costoRefacciones: Number(row.costo_refacciones || 0),
    costoManoObra: Number(row.costo_mano_obra || 0),
    costoTotal: Number(row.costo_total || 0),
    lastReportAt: row.last_report_at || null,
    createdAt: row.created_at
  };
}

function mapFleetCost(row) {
  return {
    id: row.id,
    fleetUnitId: row.fleet_unit_id,
    garantiaId: row.garantia_id || '',
    tipo: row.tipo,
    concepto: row.concepto || '',
    monto: Number(row.monto || 0),
    createdAt: row.created_at,
    createdByNombre: row.created_by_nombre || ''
  };
}


function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'No autorizado.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o vencida.' });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
    next();
  };
}

async function addAuditLog(garantiaId, userId, accion, detalle) {
  await pool.query(
    `INSERT INTO audit_logs (garantia_id, user_id, accion, detalle)
     VALUES ($1,$2,$3,$4)`,
    [garantiaId, userId, accion, detalle]
  );
}

async function nextGarantiaFolio() {
  const result = await pool.query("SELECT COUNT(*)::int AS total FROM garantias");
  const next = (result.rows[0]?.total || 0) + 1;
  return `GAR-${String(next).padStart(5, '0')}`;
}


async function tryBackfillLegacyReports() {
  const hasGarantias = await pool.query("SELECT to_regclass('public.garantias') AS name");
  if (!hasGarantias.rows[0]?.name) return;
  const total = await pool.query('SELECT COUNT(*)::int AS total FROM garantias');
  if ((total.rows[0]?.total || 0) > 0) return;
  const candidates = ['reports','reportes','warranties','garantias_old'];
  for (const table of candidates) {
    const exists = await pool.query('SELECT to_regclass($1) AS name', [`public.${table}`]);
    if (!exists.rows[0]?.name) continue;
    try {
      const rows = await pool.query(`SELECT * FROM ${table} ORDER BY created_at DESC NULLS LAST LIMIT 300`);
      for (const row of rows.rows) {
        const id = row.id || cryptoRandomId();
        const folio = row.folio || `LEG-${String(Math.floor(Math.random()*99999)).padStart(5,'0')}`;
        await pool.query(
          `INSERT INTO garantias (
            id, folio, numero_obra, modelo, numero_economico, empresa, kilometraje, contacto_nombre, telefono,
            tipo_incidente, descripcion_fallo, solicita_refaccion, detalle_refaccion, estatus_validacion,
            estatus_operativo, evidencias, evidencias_refaccion, firma, reportado_por_nombre, reportado_por_email,
            created_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,$20,
            COALESCE($21,NOW()), COALESCE($22,NOW())
          ) ON CONFLICT (id) DO NOTHING`,
          [
            id,
            folio,
            row.numero_obra || row.numeroobra || row.numeroObra || row.obra || 'SIN-OBRA',
            row.modelo || row.bus_model || row.tipo || 'Sin modelo',
            row.numero_economico || row.numeroeconomico || row.numeroEconomico || row.unidad || row.economico || 'SIN-UNIDAD',
            row.empresa || row.company || 'Sin empresa',
            row.kilometraje || '',
            row.contacto_nombre || row.contacto || row.operador || '',
            normalizeMxPhone(row.telefono || row.phone || ''),
            row.tipo_incidente || row.tipoIncidente || 'falla',
            row.descripcion_fallo || row.descripcion || row.falla || row.detalle || 'Registro histórico recuperado',
            !!(row.solicita_refaccion || row.refaccion),
            row.detalle_refaccion || row.refaccion_detalle || '',
            row.estatus_validacion || row.validacion || 'aceptada',
            row.estatus_operativo || row.operativo || 'sin iniciar',
            JSON.stringify(Array.isArray(row.evidencias) ? row.evidencias : []),
            JSON.stringify(Array.isArray(row.evidencias_refaccion) ? row.evidencias_refaccion : []),
            row.firma || '',
            row.reportado_por_nombre || row.creado_por || 'Migración histórica',
            row.reportado_por_email || '',
            row.created_at || row.fecha_creacion || null,
            row.updated_at || row.fecha_actualizacion || row.created_at || null,
          ]
        );
      }
      console.log(`Backfill histórico intentado desde tabla legacy: ${table}`);
      break;
    } catch (error) {
      console.error(`No se pudo migrar historial desde ${table}:`, error.message);
    }
  }
}

async function ensureUsersRoleConstraint() {
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'users' AND c.conname = 'users_role_check'
      ) THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
      END IF;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin','operador','operativo','supervisor','supervisor_flotas'))
  `).catch(() => {});
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE,
      contacto TEXT,
      telefono TEXT,
      email TEXT,
      notas TEXT,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','operador','operativo','supervisor','supervisor_flotas')),
      empresa TEXT,
      telefono TEXT,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS registration_requests (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT,
      empresa TEXT NOT NULL,
      numero_economico TEXT,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','aprobada','rechazada')),
      motivo TEXT,
      reviewed_by_id TEXT REFERENCES users(id),
      reviewed_by_nombre TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS garantias (
      id TEXT PRIMARY KEY,
      numero_obra TEXT NOT NULL,
      modelo TEXT NOT NULL,
      numero_economico TEXT NOT NULL,
      empresa TEXT NOT NULL,
      kilometraje TEXT,
      contacto_nombre TEXT,
      telefono TEXT,
      tipo_incidente TEXT NOT NULL CHECK (tipo_incidente IN ('daño','falla','sin daño')),
      descripcion_fallo TEXT,
      solicita_refaccion BOOLEAN NOT NULL DEFAULT FALSE,
      detalle_refaccion TEXT,
      estatus_validacion TEXT NOT NULL DEFAULT 'nueva' CHECK (estatus_validacion IN ('nueva','pendiente de revisión','aceptada','rechazada')),
      estatus_operativo TEXT NOT NULL DEFAULT 'sin iniciar' CHECK (estatus_operativo IN ('sin iniciar','en proceso','espera refacción','terminada')),
      motivo_decision TEXT,
      observaciones_operativo TEXT,
      evidencias JSONB NOT NULL DEFAULT '[]'::jsonb,
      evidencias_refaccion JSONB NOT NULL DEFAULT '[]'::jsonb,
      firma TEXT,
      reportado_por_id TEXT REFERENCES users(id),
      reportado_por_nombre TEXT,
      reportado_por_email TEXT,
      revisado_por_id TEXT REFERENCES users(id),
      revisado_por_nombre TEXT,
      revisado_por_email TEXT,
      reviewed_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      garantia_id TEXT REFERENCES garantias(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      accion TEXT NOT NULL,
      detalle TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS schedule_requests (
      id TEXT PRIMARY KEY,
      garantia_id TEXT REFERENCES garantias(id) ON DELETE CASCADE,
      telefono TEXT,
      status TEXT NOT NULL DEFAULT 'waiting_operator' CHECK (status IN ('waiting_operator','proposed','confirmed','rejected','cancelled')),
      notes TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      proposed_at TIMESTAMPTZ,
      confirmed_at TIMESTAMPTZ,
      scheduled_for TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_schedule_requests_garantia_id ON schedule_requests(garantia_id);
    CREATE INDEX IF NOT EXISTS idx_schedule_requests_telefono ON schedule_requests(telefono);
    CREATE INDEX IF NOT EXISTS idx_schedule_requests_status ON schedule_requests(status);
    CREATE INDEX IF NOT EXISTS idx_schedule_requests_scheduled_for ON schedule_requests(scheduled_for);
    CREATE TABLE IF NOT EXISTS fleet_units (
      id TEXT PRIMARY KEY,
      empresa TEXT NOT NULL,
      nombre_flota TEXT,
      numero_economico TEXT NOT NULL,
      numero_obra TEXT,
      marca TEXT,
      modelo TEXT,
      anio TEXT,
      kilometraje TEXT,
      poliza_activa BOOLEAN NOT NULL DEFAULT FALSE,
      campaign_activa BOOLEAN NOT NULL DEFAULT FALSE,
      manual_status TEXT CHECK (manual_status IN ('operando','en_taller','detenida','programada')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (empresa, numero_economico)
    );

    CREATE TABLE IF NOT EXISTS fleet_cost_entries (
      id TEXT PRIMARY KEY,
      fleet_unit_id TEXT NOT NULL REFERENCES fleet_units(id) ON DELETE CASCADE,
      garantia_id TEXT REFERENCES garantias(id) ON DELETE SET NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('refaccion','mano_obra')),
      concepto TEXT,
      monto NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_by_id TEXT REFERENCES users(id),
      created_by_nombre TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_fleet_units_empresa ON fleet_units(empresa);
    CREATE INDEX IF NOT EXISTS idx_fleet_units_numero_economico ON fleet_units(numero_economico);
    CREATE INDEX IF NOT EXISTS idx_fleet_cost_entries_unit ON fleet_cost_entries(fleet_unit_id);
    CREATE INDEX IF NOT EXISTS idx_fleet_cost_entries_garantia ON fleet_cost_entries(garantia_id);

    ALTER TABLE garantias ADD COLUMN IF NOT EXISTS fleet_unit_id TEXT;
    ALTER TABLE fleet_units ADD COLUMN IF NOT EXISTS manual_status TEXT;
    ALTER TABLE fleet_units ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE users ADD COLUMN IF NOT EXISTS empresa TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS contacto TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS telefono TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS notas TEXT;
    ALTER TABLE garantias ADD COLUMN IF NOT EXISTS folio TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS telefono TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE garantias ADD COLUMN IF NOT EXISTS kilometraje TEXT;
    ALTER TABLE garantias ADD COLUMN IF NOT EXISTS contacto_nombre TEXT;
    ALTER TABLE garantias ADD COLUMN IF NOT EXISTS telefono TEXT;
    ALTER TABLE garantias ADD COLUMN IF NOT EXISTS refaccion_status TEXT NOT NULL DEFAULT 'pendiente';
    ALTER TABLE garantias ADD COLUMN IF NOT EXISTS refaccion_asignada TEXT;
    ALTER TABLE garantias ADD COLUMN IF NOT EXISTS refaccion_updated_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_reg_requests_status ON registration_requests(status);
    CREATE INDEX IF NOT EXISTS idx_garantias_estatus_validacion ON garantias(estatus_validacion);
    CREATE INDEX IF NOT EXISTS idx_garantias_estatus_operativo ON garantias(estatus_operativo);
    CREATE INDEX IF NOT EXISTS idx_garantias_reportado_por_id ON garantias(reportado_por_id);
    CREATE INDEX IF NOT EXISTS idx_garantias_numero_economico ON garantias(numero_economico);
  `);

  await ensureUsersRoleConstraint();

  for (const name of DEFAULT_COMPANIES) {
    await pool.query(
      `INSERT INTO companies (id, nombre, activo)
       VALUES ($1,$2,TRUE)
       ON CONFLICT (nombre) DO NOTHING`,
      [cryptoRandomId(), name]
    );
  }

  await tryBackfillLegacyReports();

  const existingAdmin = await pool.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [ADMIN_EMAIL]);
  if (!existingAdmin.rowCount) {
    const adminId = cryptoRandomId();
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (id, nombre, email, password_hash, role, activo)
       VALUES ($1,$2,$3,$4,'admin',TRUE)`,
      [adminId, ADMIN_NAME, ADMIN_EMAIL, hash]
    );
    console.log(`Admin inicial creado: ${ADMIN_EMAIL}`);
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    res.json({ ok: true, db: result.rows[0].now });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'No hubo conexión con la base.' });
  }
});

app.get('/api/public/companies', async (_req, res) => {
  const result = await pool.query('SELECT * FROM companies WHERE activo = TRUE ORDER BY nombre ASC');
  res.json(result.rows.map(mapCompany));
});

app.post('/api/public/register-operator', async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const telefono = normalizeMxPhone(req.body.telefono);
  const empresa = String(req.body.empresa || '').trim();
  const numeroEconomico = String(req.body.numeroEconomico || '').trim();
  const password = String(req.body.password || '');

  if (!nombre || !email || !telefono || !empresa || !password) {
    return res.status(400).json({ error: 'Completa nombre, correo, teléfono, empresa y contraseña.' });
  }

  const company = await pool.query('SELECT id FROM companies WHERE nombre = $1 AND activo = TRUE', [empresa]);
  if (!company.rowCount) {
    return res.status(400).json({ error: 'La empresa no está dada de alta en el sistema.' });
  }

  const existingUser = await pool.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
  if (existingUser.rowCount) {
    return res.status(400).json({ error: 'Ese correo ya tiene acceso. Inicia sesión.' });
  }

  const pending = await pool.query('SELECT id FROM registration_requests WHERE email = $1 AND status = $2', [email, 'pendiente']);
  if (pending.rowCount) {
    return res.status(400).json({ error: 'Ya existe una solicitud pendiente con ese correo.' });
  }

  const hash = await bcrypt.hash(password, 10);
  const id = cryptoRandomId();
  const result = await pool.query(
    `INSERT INTO registration_requests (
      id, nombre, email, telefono, empresa, numero_economico, password_hash, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente') RETURNING *`,
    [id, nombre, email, telefono, empresa, numeroEconomico, hash]
  );

  res.status(201).json({ ok: true, message: 'Solicitud enviada. Un administrador debe aprobar tu acceso.', request: mapRegistrationRequest(result.rows[0]) });
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
  }

  const result = await pool.query('SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
  const user = result.rows[0];
  if (!user || !user.activo) {
    return res.status(401).json({ error: 'Usuario no encontrado o inactivo.' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta.' });

  const token = signToken(user);
  res.json({ token, user: sanitizeUser(user) });
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json({ user: sanitizeUser(result.rows[0]) });
});

app.get('/api/companies', authRequired, requireRoles('admin'), async (_req, res) => {
  const result = await pool.query('SELECT * FROM companies ORDER BY nombre ASC');
  res.json(result.rows.map(mapCompany));
});

app.post('/api/companies', authRequired, requireRoles('admin'), async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const contacto = String(req.body.contacto || '').trim();
  const telefono = normalizeMxPhone(req.body.telefono);
  const email = String(req.body.email || '').trim().toLowerCase();
  const notas = String(req.body.notas || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre de la empresa es obligatorio.' });

  const result = await pool.query(
    `INSERT INTO companies (id, nombre, contacto, telefono, email, notas, activo)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE)
     ON CONFLICT (nombre) DO UPDATE SET contacto = EXCLUDED.contacto, telefono = EXCLUDED.telefono, email = EXCLUDED.email, notas = EXCLUDED.notas, activo = TRUE
     RETURNING *`,
    [cryptoRandomId(), nombre, contacto, telefono, email, notas]
  );
  res.status(201).json(mapCompany(result.rows[0]));
});

app.patch('/api/companies/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const contacto = String(req.body.contacto || '').trim();
  const telefono = normalizeMxPhone(req.body.telefono);
  const email = String(req.body.email || '').trim().toLowerCase();
  const notas = String(req.body.notas || '').trim();
  const activo = req.body.activo !== false;
  if (!nombre) return res.status(400).json({ error: 'El nombre de la empresa es obligatorio.' });
  const exists = await pool.query('SELECT id FROM companies WHERE nombre = $1 AND id <> $2', [nombre, req.params.id]);
  if (exists.rowCount) return res.status(400).json({ error: 'Ya existe otra empresa con ese nombre.' });
  const result = await pool.query(
    `UPDATE companies SET nombre = $2, contacto = $3, telefono = $4, email = $5, notas = $6, activo = $7
     WHERE id = $1 RETURNING *`,
    [req.params.id, nombre, contacto, telefono, email, notas, activo]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Empresa no encontrada.' });
  res.json(mapCompany(result.rows[0]));
});

app.delete('/api/companies/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const company = await pool.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
  if (!company.rowCount) return res.status(404).json({ error: 'Empresa no encontrada.' });
  const linked = await pool.query('SELECT COUNT(*)::int AS total FROM garantias WHERE empresa = $1', [company.rows[0].nombre]);
  if ((linked.rows[0]?.total || 0) > 0) {
    return res.status(400).json({ error: 'Esta empresa ya tiene historial. Mejor desactívala.' });
  }
  await pool.query('DELETE FROM companies WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

app.patch('/api/companies/:id/deactivate', authRequired, requireRoles('admin'), async (req, res) => {
  const result = await pool.query('UPDATE companies SET activo = FALSE WHERE id = $1 RETURNING *', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Empresa no encontrada.' });
  res.json(mapCompany(result.rows[0]));
});

app.get('/api/registration-requests', authRequired, requireRoles('admin'), async (_req, res) => {
  const result = await pool.query('SELECT * FROM registration_requests ORDER BY created_at DESC');
  res.json(result.rows.map(mapRegistrationRequest));
});

app.patch('/api/registration-requests/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const status = String(req.body.status || '').trim();
  const motivo = String(req.body.motivo || '').trim();

  if (!['aprobada', 'rechazada'].includes(status)) {
    return res.status(400).json({ error: 'Acción inválida para solicitud.' });
  }

  const current = await pool.query('SELECT * FROM registration_requests WHERE id = $1', [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  const row = current.rows[0];
  if (row.status !== 'pendiente') {
    return res.status(400).json({ error: 'La solicitud ya fue procesada.' });
  }

  if (status === 'aprobada') {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [row.email]);
    if (exists.rowCount) {
      await pool.query(
        `UPDATE registration_requests
         SET status = 'rechazada', motivo = $2, reviewed_by_id = $3, reviewed_by_nombre = $4, reviewed_at = NOW()
         WHERE id = $1`,
        [row.id, 'El correo ya existe como usuario.', req.user.id, req.user.nombre]
      );
      return res.status(400).json({ error: 'Ese correo ya existe como usuario.' });
    }

    await pool.query(
      `INSERT INTO users (id, nombre, email, password_hash, role, empresa, telefono, activo)
       VALUES ($1,$2,$3,$4,'operador',$5,$6,TRUE)`,
      [cryptoRandomId(), row.nombre, row.email, row.password_hash, row.empresa, row.telefono || '']
    );
  }

  const result = await pool.query(
    `UPDATE registration_requests
     SET status = $2, motivo = $3, reviewed_by_id = $4, reviewed_by_nombre = $5, reviewed_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [req.params.id, status, motivo, req.user.id, req.user.nombre]
  );
  res.json(mapRegistrationRequest(result.rows[0]));
});

app.get('/api/users', authRequired, requireRoles('admin'), async (_req, res) => {
  const result = await pool.query('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC');
  res.json(result.rows.map(sanitizeUser));
});

app.post('/api/users', authRequired, requireRoles('admin'), async (req, res) => {
  await ensureUsersRoleConstraint();
  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = String(req.body.role || '').trim();
  const empresa = String(req.body.empresa || '').trim();
  const telefono = String(req.body.telefono || '').trim();

  if (!nombre || !email || !password || !ALL_MANAGED_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Datos de usuario incompletos o inválidos.' });
  }
  if (['operador','supervisor','supervisor_flotas'].includes(role) && !empresa) {
    return res.status(400).json({ error: 'Ese rol necesita empresa ligada.' });
  }

  const exists = await pool.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
  if (exists.rowCount) return res.status(400).json({ error: 'Ese correo ya existe.' });

  const userId = cryptoRandomId();
  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (id, nombre, email, password_hash, role, empresa, telefono, activo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
     RETURNING *`,
    [userId, nombre, email, hash, role, empresa, telefono]
  );

  res.status(201).json(sanitizeUser(result.rows[0]));
});

app.patch('/api/users/:id', authRequired, requireRoles('admin'), async (req, res) => {
  await ensureUsersRoleConstraint();
  const current = await pool.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const currentUser = current.rows[0];
  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = String(req.body.role || '').trim();
  const password = String(req.body.password || '');
  const empresa = String(req.body.empresa || '').trim();
  const telefono = String(req.body.telefono || '').trim();

  if (!nombre || !email || !ALL_MANAGED_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Datos de usuario incompletos o inválidos.' });
  }
  if (['operador','supervisor','supervisor_flotas'].includes(role) && !empresa) {
    return res.status(400).json({ error: 'Ese rol necesita empresa ligada.' });
  }

  const exists = await pool.query('SELECT id FROM users WHERE email = $1 AND id <> $2 AND deleted_at IS NULL', [email, req.params.id]);
  if (exists.rowCount) return res.status(400).json({ error: 'Ese correo ya existe.' });

  let passwordHash = currentUser.password_hash;
  if (password) passwordHash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    `UPDATE users
     SET nombre = $2, email = $3, role = $4, password_hash = $5, empresa = $6, telefono = $7
     WHERE id = $1
     RETURNING *`,
    [req.params.id, nombre, email, role, passwordHash, empresa, telefono]
  );

  res.json(sanitizeUser(result.rows[0]));
});

app.delete('/api/users/:id', authRequired, requireRoles('admin'), async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'No puedes borrarte a ti mismo.' });

  const current = await pool.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (current.rows[0].role === 'admin') return res.status(400).json({ error: 'No se puede borrar un admin desde aquí.' });

  const deletedEmail = `eliminado_${Date.now()}_${current.rows[0].email}`;
  await pool.query(
    `UPDATE users SET activo = FALSE, deleted_at = NOW(), email = $2, nombre = $3 WHERE id = $1`,
    [req.params.id, deletedEmail, `[Eliminado] ${current.rows[0].nombre}`]
  );

  res.json({ ok: true });
});

app.get('/api/garantias', authRequired, async (req, res) => {
  let query = 'SELECT * FROM garantias';
  const params = [];
  const where = [];
  if (req.user.role === 'operador') {
    params.push(req.user.id);
    where.push(`reportado_por_id = $${params.length}`);
  }
  if (SUPERVISOR_ROLES.includes(req.user.role)) {
    params.push(req.user.empresa || '');
    where.push(`empresa = $${params.length}`);
  }
  if (where.length) query += ' WHERE ' + where.join(' AND ');
  query += ' ORDER BY created_at DESC';
  const result = await pool.query(query, params);
  res.json(result.rows.map(mapGarantia));
});

app.post('/api/garantias', authRequired, requireRoles('operador', 'admin'), async (req, res) => {
  const body = req.body;
  const id = cryptoRandomId();
  const folio = await nextGarantiaFolio();
  const required = [body.numeroObra, body.modelo, body.numeroEconomico, body.empresa, body.tipoIncidente, body.descripcionFallo];
  if (required.some(v => !String(v || '').trim())) {
    return res.status(400).json({ error: 'Faltan campos obligatorios del reporte.' });
  }

  const result = await pool.query(
    `INSERT INTO garantias (
      id, folio, numero_obra, modelo, numero_economico, empresa, kilometraje, contacto_nombre, telefono, tipo_incidente,
      descripcion_fallo, solicita_refaccion, detalle_refaccion,
      estatus_validacion, estatus_operativo,
      evidencias, evidencias_refaccion, firma,
      reportado_por_id, reportado_por_nombre, reportado_por_email,
      updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'nueva','sin iniciar',$14::jsonb,$15::jsonb,$16,$17,$18,$19,NOW()
    ) RETURNING *`,
    [
      id,
      folio,
      body.numeroObra,
      body.modelo,
      body.numeroEconomico,
      body.empresa,
      body.kilometraje || '',
      body.contactoNombre || '',
      normalizeMxPhone(body.telefono),
      body.tipoIncidente,
      body.descripcionFallo,
      !!body.solicitaRefaccion,
      body.detalleRefaccion || '',
      JSON.stringify(body.evidencias || []),
      JSON.stringify(body.evidenciasRefaccion || []),
      body.firma || '',
      req.user.id,
      req.user.nombre,
      req.user.email,
    ]
  );

  await addAuditLog(id, req.user.id, 'crear_reporte', `Reporte creado por ${req.user.nombre}`);
  notifyGarantiaWhatsApp('created', result.rows[0]).catch(() => {});
  res.status(201).json(mapGarantia(result.rows[0]));
});

app.patch('/api/garantias/:id/review', authRequired, requireRoles('operativo', 'admin'), async (req, res) => {
  const estatusValidacion = String(req.body.estatusValidacion || '').trim();
  const observacionesOperativo = String(req.body.observacionesOperativo || '').trim();
  const motivoDecision = String(req.body.motivoDecision || '').trim();
  if (!['pendiente de revisión', 'aceptada', 'rechazada'].includes(estatusValidacion)) {
    return res.status(400).json({ error: 'Estatus de validación inválido.' });
  }
  if (estatusValidacion === 'rechazada' && !motivoDecision) {
    return res.status(400).json({ error: 'Debes escribir motivo de rechazo.' });
  }
  const current = await pool.query('SELECT * FROM garantias WHERE id = $1', [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Garantía no encontrada.' });

  const newOperational = estatusValidacion === 'aceptada' && current.rows[0].estatus_operativo === 'sin iniciar'
    ? 'en proceso'
    : current.rows[0].estatus_operativo;

  const result = await pool.query(
    `UPDATE garantias SET
      estatus_validacion = $2,
      estatus_operativo = $3,
      observaciones_operativo = $4,
      motivo_decision = $5,
      revisado_por_id = $6,
      revisado_por_nombre = $7,
      revisado_por_email = $8,
      reviewed_at = NOW(),
      updated_at = NOW(),
      closed_at = CASE WHEN $3 = 'terminada' THEN NOW() ELSE closed_at END
     WHERE id = $1
     RETURNING *`,
    [req.params.id, estatusValidacion, newOperational, observacionesOperativo, motivoDecision, req.user.id, req.user.nombre, req.user.email]
  );

  await addAuditLog(req.params.id, req.user.id, 'revision', `${req.user.nombre} cambió a ${estatusValidacion}`);
  if (estatusValidacion === 'aceptada') notifyGarantiaWhatsApp('accepted', result.rows[0]).catch(() => {});
  if (estatusValidacion === 'rechazada') notifyGarantiaWhatsApp('rejected', result.rows[0]).catch(() => {});
  res.json(mapGarantia(result.rows[0]));
});

app.patch('/api/garantias/:id/operational', authRequired, requireRoles('operativo', 'admin'), async (req, res) => {
  const estatusOperativo = String(req.body.estatusOperativo || '').trim();
  const observacionesOperativo = String(req.body.observacionesOperativo || '').trim();
  if (!['sin iniciar', 'en proceso', 'espera refacción', 'terminada'].includes(estatusOperativo)) {
    return res.status(400).json({ error: 'Estatus operativo inválido.' });
  }

  const current = await pool.query('SELECT * FROM garantias WHERE id = $1', [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Garantía no encontrada.' });
  if (current.rows[0].estatus_validacion !== 'aceptada') {
    return res.status(400).json({ error: 'Solo una garantía aceptada puede pasar a flujo operativo.' });
  }

  const result = await pool.query(
    `UPDATE garantias SET
      estatus_operativo = $2,
      observaciones_operativo = COALESCE(NULLIF($3,''), observaciones_operativo),
      updated_at = NOW(),
      closed_at = CASE WHEN $2 = 'terminada' THEN NOW() ELSE NULL END
     WHERE id = $1
     RETURNING *`,
    [req.params.id, estatusOperativo, observacionesOperativo]
  );

  await addAuditLog(req.params.id, req.user.id, 'estatus_operativo', `${req.user.nombre} cambió operativo a ${estatusOperativo}`);
  if (estatusOperativo === 'en proceso') notifyGarantiaWhatsApp('in_process', result.rows[0]).catch(() => {});
  if (estatusOperativo === 'espera refacción') notifyGarantiaWhatsApp('waiting_parts', result.rows[0]).catch(() => {});
  if (estatusOperativo === 'terminada') notifyGarantiaWhatsApp('finished', result.rows[0]).catch(() => {});
  res.json(mapGarantia(result.rows[0]));
});

app.delete('/api/garantias/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const current = await pool.query('SELECT * FROM garantias WHERE id = $1', [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Garantía no encontrada.' });
  await addAuditLog(req.params.id, req.user.id, 'eliminar_reporte', `Admin ${req.user.nombre} eliminó el reporte`);
  await pool.query('DELETE FROM garantias WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/audit/:garantiaId', authRequired, requireRoles('admin', 'operativo', 'supervisor', 'supervisor_flotas'), async (req, res) => {
  const result = await pool.query(
    `SELECT a.*, u.nombre AS user_nombre, u.email AS user_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.garantia_id = $1
     ORDER BY a.created_at DESC`,
    [req.params.garantiaId]
  );
  res.json(result.rows);
});

app.get('/api/history/unit/:numeroEconomico', authRequired, requireRoles('admin', 'operativo', 'supervisor', 'supervisor_flotas'), async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM garantias WHERE numero_economico = $1 ORDER BY created_at DESC`,
    [req.params.numeroEconomico]
  );
  res.json(result.rows.map(mapGarantia));
});


app.get('/api/schedules', authRequired, requireRoles('admin', 'operativo', 'supervisor', 'supervisor_flotas', 'operador'), async (req, res) => {
  const date = String(req.query.date || '').trim();
  const params = [];
  let where = [];
  if (date) {
    params.push(date);
    where.push(`DATE(sr.scheduled_for AT TIME ZONE 'UTC') = $${params.length}`);
  }
  if (SUPERVISOR_ROLES.includes(req.user.role)) {
    params.push(req.user.empresa || '');
    where.push(`g.empresa = $${params.length}`);
  }
  if (req.user.role === 'operador') {
    params.push(req.user.id);
    where.push(`g.reportado_por_id = $${params.length}`);
  }
  const result = await pool.query(`
    SELECT sr.*, g.folio, g.numero_economico, g.empresa, g.contacto_nombre
    FROM schedule_requests sr
    JOIN garantias g ON g.id = sr.garantia_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY COALESCE(sr.scheduled_for, sr.proposed_at, sr.requested_at) ASC
  `, params);
  res.json(result.rows.map(scheduleSummary));
});

app.post('/api/garantias/:id/request-schedule', authRequired, requireRoles('admin', 'operativo', 'supervisor_flotas'), async (req, res) => {
  const current = await pool.query('SELECT * FROM garantias WHERE id = $1', [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Garantía no encontrada.' });
  const garantia = current.rows[0];
  if (garantia.estatus_validacion !== 'aceptada') return res.status(400).json({ error: 'Solo las garantías aceptadas pueden programarse.' });
  const scheduleExisting = await pool.query(`SELECT * FROM schedule_requests WHERE garantia_id = $1 AND status IN ('waiting_operator','proposed','confirmed') ORDER BY created_at DESC LIMIT 1`, [req.params.id]);
  let schedule;
  if (scheduleExisting.rowCount) {
    schedule = scheduleExisting.rows[0];
  } else {
    const created = await pool.query(`INSERT INTO schedule_requests (id, garantia_id, telefono, status, notes) VALUES ($1,$2,$3,'waiting_operator',$4) RETURNING *`, [cryptoRandomId(), req.params.id, garantia.telefono || '', `Solicitud enviada por ${req.user.nombre}`]);
    schedule = created.rows[0];
  }
  try {
    if (TWILIO_TEMPLATE_SCHEDULE_REQUEST) {
      await sendWhatsAppTemplate({
        telefono: garantia.telefono,
        contentSid: TWILIO_TEMPLATE_SCHEDULE_REQUEST,
        variables: { 1: garantia.folio || '' }
      });
    } else {
      const bodyText = `CARLAB GARANTIAS\n\nTu reporte ${garantia.folio} fue aceptado. Responde con la fecha propuesta para ingresar la unidad al taller en formato DD/MM/AAAA HH:MM.\n\nEjemplo: 28/03/2026 09:30`;
      await sendWhatsAppText({ telefono: garantia.telefono, body: bodyText });
    }
  } catch (error) {
    console.error('Error solicitando programacion WhatsApp:', error.message);
  }
  await addAuditLog(req.params.id, req.user.id, 'solicitar_programacion', `${req.user.nombre} solicitó fecha de ingreso por WhatsApp`);
  const joined = await pool.query(`SELECT sr.*, g.folio, g.numero_economico, g.empresa, g.contacto_nombre FROM schedule_requests sr JOIN garantias g ON g.id = sr.garantia_id WHERE sr.id = $1`, [schedule.id]);
  res.status(201).json(scheduleSummary(joined.rows[0]));
});

app.patch('/api/schedules/:id/confirm', authRequired, requireRoles('admin', 'operativo'), async (req, res) => {
  const status = String(req.body.status || 'confirmed').trim();
  const notes = String(req.body.notes || '').trim();
  const found = await pool.query(`SELECT sr.*, g.folio, g.numero_economico, g.empresa, g.telefono FROM schedule_requests sr JOIN garantias g ON g.id = sr.garantia_id WHERE sr.id = $1`, [req.params.id]);
  if (!found.rowCount) return res.status(404).json({ error: 'Programación no encontrada.' });
  const current = found.rows[0];
  const scheduledFor = req.body.scheduledFor ? new Date(req.body.scheduledFor) : (current.scheduled_for ? new Date(current.scheduled_for) : null);

  if (status === 'confirmed' && scheduledFor) {
    const busy = await pool.query(
      `SELECT sr.id FROM schedule_requests sr
       WHERE sr.id <> $1
         AND sr.status = 'confirmed'
         AND DATE(sr.scheduled_for AT TIME ZONE 'UTC') = DATE($2::timestamptz AT TIME ZONE 'UTC')
         AND TO_CHAR(sr.scheduled_for AT TIME ZONE 'UTC','HH24:MI') = TO_CHAR($2::timestamptz AT TIME ZONE 'UTC','HH24:MI')
       LIMIT 1`,
      [req.params.id, scheduledFor.toISOString()]
    );
    if (busy.rowCount) {
      const recommended = new Date(scheduledFor.getTime() + 60*60*1000);
      return res.status(409).json({
        error: 'Ese horario ya está ocupado.',
        recommended: recommended.toISOString()
      });
    }
  }

  const result = await pool.query(
    `UPDATE schedule_requests
     SET status = $2,
         scheduled_for = $3,
         confirmed_at = CASE WHEN $2 = 'confirmed' THEN NOW() ELSE confirmed_at END,
         notes = COALESCE(NULLIF($4,''), notes),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [req.params.id, status, scheduledFor, notes]
  );

  const finalDate = scheduledFor || current.scheduled_for || current.proposed_at;
  if (status === 'confirmed' && finalDate) {
    try {
      const when = current.notes && /\d/.test(current.notes)
        ? (String(current.notes).split(': ').slice(1).join(': ') || new Date(finalDate).toLocaleString('es-MX'))
        : new Date(finalDate).toLocaleString('es-MX');
      await sendWhatsAppText({ telefono: current.telefono, body: `CARLAB GARANTIAS\n\nQuedo confirmada la cita del reporte ${current.folio || 'GAR-—'} para la unidad ${current.numero_economico} el ${when}. Te esperamos en taller.` });
    } catch (error) { console.error('Error confirmando cita por WhatsApp:', error.message); }
  }
  if (status === 'rejected') {
    try {
      await sendWhatsAppText({ telefono: current.telefono, body: `CARLAB GARANTIAS\n\nLa fecha propuesta para la unidad ${current.numero_economico} no quedó disponible. Responde con otra opción en formato DD/MM/AAAA HH:MM.` });
    } catch (error) { console.error('Error rechazando cita por WhatsApp:', error.message); }
  }
  const joined = await pool.query(`SELECT sr.*, g.folio, g.numero_economico, g.empresa, g.contacto_nombre, g.telefono FROM schedule_requests sr JOIN garantias g ON g.id = sr.garantia_id WHERE sr.id = $1`, [req.params.id]);
  res.json(scheduleSummary(joined.rows[0]));
});

app.post('/api/whatsapp/incoming', async (req, res) => {
  const from = String(req.body.From || '').replace(/^whatsapp:/i, '').replace(/\D/g, '');
  const body = String(req.body.Body || '').trim();
  if (!from || !body) return res.type('text/xml').send('<Response></Response>');
  const pending = await pool.query(`
    SELECT sr.*, g.id AS garantia_id, g.folio, g.numero_economico, g.empresa, g.contacto_nombre, g.telefono
    FROM schedule_requests sr
    JOIN garantias g ON g.id = sr.garantia_id
    WHERE sr.telefono = $1 AND sr.status IN ('waiting_operator','rejected')
    ORDER BY sr.updated_at DESC LIMIT 1
  `, [normalizeMxPhone(from)]);
  if (!pending.rowCount) return res.type('text/xml').send('<Response></Response>');
  const parsed = parseScheduleText(body);
  if (!parsed) {
    try { await sendWhatsAppText({ telefono: from, body: 'CARLAB GARANTIAS\n\nNo pude leer la fecha. Envia por favor DD/MM/AAAA HH:MM, por ejemplo 28/03/2026 09:30.' }); } catch {}
    return res.type('text/xml').send('<Response></Response>');
  }
  const schedule = pending.rows[0];
  await pool.query(`UPDATE schedule_requests SET status = 'proposed', proposed_at = $2, scheduled_for = $2, notes = $3, updated_at = NOW() WHERE id = $1`, [schedule.id, parsed.iso, `Propuesta recibida por WhatsApp: ${parsed.text}`]);
  await addAuditLog(schedule.garantia_id, null, 'propuesta_programacion', `Operador propuso ${parsed.text} por WhatsApp`);
  try { await sendWhatsAppText({ telefono: from, body: `CARLAB GARANTIAS\n\nRecibimos tu propuesta para el reporte ${schedule.folio || 'GAR-—'} de la unidad ${schedule.numero_economico}: ${parsed.text}. En cuanto la confirme operaciones, te avisamos por aqui.` }); } catch {}
  res.type('text/xml').send('<Response></Response>');
});

app.post('/webhook/whatsapp', async (req, res) => {
  req.url = '/api/whatsapp/incoming';
  return app._router.handle(req, res, () => {});
});

app.post('/api/whatsapp/status', async (req, res) => {
  console.log('WhatsApp status callback:', { sid: req.body.MessageSid, status: req.body.MessageStatus, to: req.body.To });
  res.json({ ok: true });
});


app.get('/api/notifications', authRequired, requireRoles('admin','operativo','supervisor','supervisor_flotas','operador'), async (req, res) => {
  const params = [];
  let whereGarantias = [];
  let whereSchedules = [];
  if (SUPERVISOR_ROLES.includes(req.user.role)) {
    params.push(req.user.empresa || '');
    whereGarantias.push(`g.empresa = $${params.length}`);
    whereSchedules.push(`g.empresa = $${params.length}`);
  }
  if (req.user.role === 'operador') {
    params.push(req.user.id);
    whereGarantias.push(`g.reportado_por_id = $${params.length}`);
    whereSchedules.push(`g.reportado_por_id = $${params.length}`);
  }
  const newReports = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM garantias g
    ${whereGarantias.length ? `WHERE ${whereGarantias.join(' AND ')} AND g.estatus_validacion = 'nueva'` : `WHERE g.estatus_validacion = 'nueva'`}
  `, params);
  const pendingSchedules = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM schedule_requests sr
    JOIN garantias g ON g.id = sr.garantia_id
    ${whereSchedules.length ? `WHERE ${whereSchedules.join(' AND ')} AND sr.status IN ('waiting_operator','proposed')` : `WHERE sr.status IN ('waiting_operator','proposed')`}
  `, params);
  const todaySchedules = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM schedule_requests sr
    JOIN garantias g ON g.id = sr.garantia_id
    ${whereSchedules.length ? `WHERE ${whereSchedules.join(' AND ')} AND DATE(sr.scheduled_for AT TIME ZONE 'UTC') = CURRENT_DATE` : `WHERE DATE(sr.scheduled_for AT TIME ZONE 'UTC') = CURRENT_DATE`}
  `, params);
  res.json({
    newReports: newReports.rows[0]?.count || 0,
    pendingSchedules: pendingSchedules.rows[0]?.count || 0,
    todaySchedules: todaySchedules.rows[0]?.count || 0
  });
});


app.get('/api/fleet/summary', authRequired, requireRoles('admin','operativo','supervisor','supervisor_flotas'), async (req, res) => {
  const params = [];
  const where = [];
  if (SUPERVISOR_ROLES.includes(req.user.role)) {
    params.push(req.user.empresa || '');
    where.push(`fu.empresa = $${params.length}`);
  }
  const totalQ = await pool.query(`SELECT COUNT(*)::int AS total FROM fleet_units fu ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`, params);
  const sem = await pool.query(`
    WITH base AS (
      SELECT fu.id, fu.empresa, fu.numero_economico,
             COALESCE(fu.manual_status,(
               SELECT CASE
                 WHEN g.estatus_operativo = 'terminada' THEN 'operando'
                 WHEN g.estatus_operativo = 'en proceso' THEN 'en_taller'
                 WHEN g.estatus_operativo = 'espera refacción' THEN 'detenida'
                 WHEN g.estatus_validacion = 'aceptada' THEN 'programada'
                 ELSE 'operando'
               END
               FROM garantias g
               WHERE g.empresa = fu.empresa AND g.numero_economico = fu.numero_economico
               ORDER BY g.created_at DESC
               LIMIT 1
             ), 'operando') AS status
      FROM fleet_units fu
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    )
    SELECT status, COUNT(*)::int AS total FROM base GROUP BY status
  `, params);
  const grouped = Object.fromEntries(sem.rows.map(r => [r.status, r.total]));
  res.json({
    total: totalQ.rows[0]?.total || 0,
    operando: grouped.operando || 0,
    enTaller: grouped.en_taller || 0,
    detenidas: grouped.detenida || 0,
    programadas: grouped.programada || 0
  });
});

app.get('/api/fleet/units', authRequired, requireRoles('admin','operativo','supervisor','supervisor_flotas'), async (req, res) => {
  const params = [];
  const where = [];
  if (SUPERVISOR_ROLES.includes(req.user.role)) {
    params.push(req.user.empresa || '');
    where.push(`fu.empresa = $${params.length}`);
  }
  const result = await pool.query(`
    SELECT fu.*,
      COALESCE(fu.manual_status,(
        SELECT g.estatus_operativo
        FROM garantias g
        WHERE g.empresa = fu.empresa AND g.numero_economico = fu.numero_economico
        ORDER BY g.created_at DESC
        LIMIT 1
      ), 'sin actividad') AS estatus_operativo,
      (
        SELECT MAX(g.created_at)
        FROM garantias g
        WHERE g.empresa = fu.empresa AND g.numero_economico = fu.numero_economico
      ) AS last_report_at,
      COALESCE((SELECT COUNT(*) FROM garantias g WHERE g.empresa = fu.empresa AND g.numero_economico = fu.numero_economico),0) AS reportes_count,
      COALESCE((SELECT SUM(CASE WHEN tipo='refaccion' THEN monto ELSE 0 END) FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = fu.id),0) AS costo_refacciones,
      COALESCE((SELECT SUM(CASE WHEN tipo='mano_obra' THEN monto ELSE 0 END) FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = fu.id),0) AS costo_mano_obra,
      COALESCE((SELECT SUM(monto) FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = fu.id),0) AS costo_total
    FROM fleet_units fu
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY fu.empresa ASC, fu.numero_economico ASC
  `, params);
  res.json(result.rows.map(mapFleetUnit));
});

app.post('/api/fleet/units', authRequired, requireRoles('admin','operativo'), async (req, res) => {
  const body = req.body || {};
  const empresa = String(body.empresa || '').trim();
  const numeroEconomico = String(body.numeroEconomico || '').trim();
  if (!empresa || !numeroEconomico) return res.status(400).json({ error: 'Empresa y número económico son obligatorios.' });
  const result = await pool.query(`
    INSERT INTO fleet_units (
      id, empresa, nombre_flota, numero_economico, numero_obra, marca, modelo, anio, kilometraje, poliza_activa, campaign_activa
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (empresa, numero_economico) DO UPDATE SET
      nombre_flota = EXCLUDED.nombre_flota,
      numero_obra = EXCLUDED.numero_obra,
      marca = EXCLUDED.marca,
      modelo = EXCLUDED.modelo,
      anio = EXCLUDED.anio,
      kilometraje = EXCLUDED.kilometraje,
      poliza_activa = EXCLUDED.poliza_activa,
      campaign_activa = EXCLUDED.campaign_activa,
      updated_at = NOW()
    RETURNING *
  `, [
    cryptoRandomId(),
    empresa,
    String(body.nombreFlota || '').trim(),
    numeroEconomico,
    String(body.numeroObra || '').trim(),
    String(body.marca || '').trim(),
    String(body.modelo || '').trim(),
    String(body.anio || '').trim(),
    String(body.kilometraje || '').trim(),
    !!body.polizaActiva,
    !!body.campaignActiva
  ]);
  res.status(201).json(mapFleetUnit(result.rows[0]));
});

app.patch('/api/fleet/units/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const current = await pool.query('SELECT * FROM fleet_units WHERE id = $1', [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Unidad no encontrada.' });
  const body = req.body || {};
  const empresa = String(body.empresa || '').trim();
  const numeroEconomico = String(body.numeroEconomico || '').trim();
  if (!empresa || !numeroEconomico) return res.status(400).json({ error: 'Empresa y número económico son obligatorios.' });
  const result = await pool.query(`
    UPDATE fleet_units
    SET empresa=$2, nombre_flota=$3, numero_economico=$4, numero_obra=$5, marca=$6, modelo=$7, anio=$8, kilometraje=$9,
        poliza_activa=$10, campaign_activa=$11, manual_status=COALESCE($12, manual_status), updated_at=NOW()
    WHERE id=$1
    RETURNING *
  `,[req.params.id, empresa, String(body.nombreFlota||'').trim(), numeroEconomico, String(body.numeroObra||'').trim(), String(body.marca||'').trim(), String(body.modelo||'').trim(), String(body.anio||'').trim(), String(body.kilometraje||'').trim(), !!body.polizaActiva, !!body.campaignActiva, body.manualStatus ? String(body.manualStatus).trim() : null]);
  res.json(mapFleetUnit(result.rows[0]));
});

app.patch('/api/fleet/units/:id/status', authRequired, requireRoles('admin'), async (req, res) => {
  const status = String(req.body.status || '').trim();
  if (!['operando','en_taller','detenida','programada',''].includes(status)) return res.status(400).json({ error: 'Estado inválido.' });
  const result = await pool.query(`UPDATE fleet_units SET manual_status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id, status || null]);
  if (!result.rowCount) return res.status(404).json({ error: 'Unidad no encontrada.' });
  res.json(mapFleetUnit(result.rows[0]));
});

app.delete('/api/fleet/units/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const result = await pool.query('DELETE FROM fleet_units WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Unidad no encontrada.' });
  res.json({ ok: true });
});

app.get('/api/fleet/units/:id', authRequired, requireRoles('admin','operativo','supervisor','supervisor_flotas'), async (req, res) => {
  const params = [req.params.id];
  let extra = '';
  if (SUPERVISOR_ROLES.includes(req.user.role)) {
    params.push(req.user.empresa || '');
    extra = ` AND fu.empresa = $${params.length}`;
  }
  const unit = await pool.query(`
    SELECT fu.*,
      COALESCE((SELECT SUM(CASE WHEN tipo='refaccion' THEN monto ELSE 0 END) FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = fu.id),0) AS costo_refacciones,
      COALESCE((SELECT SUM(CASE WHEN tipo='mano_obra' THEN monto ELSE 0 END) FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = fu.id),0) AS costo_mano_obra,
      COALESCE((SELECT SUM(monto) FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = fu.id),0) AS costo_total
    FROM fleet_units fu WHERE fu.id = $1 ${extra}
  `, params);
  if (!unit.rowCount) return res.status(404).json({ error: 'Unidad no encontrada.' });
  const u = unit.rows[0];
  const reports = await pool.query(`
    SELECT * FROM garantias
    WHERE empresa = $1 AND numero_economico = $2
    ORDER BY created_at DESC
  `, [u.empresa, u.numero_economico]);
  const costs = await pool.query(`
    SELECT * FROM fleet_cost_entries
    WHERE fleet_unit_id = $1
    ORDER BY created_at DESC
  `, [u.id]);
  res.json({
    unit: mapFleetUnit(u),
    reports: reports.rows.map(mapGarantia),
    costs: costs.rows.map(mapFleetCost)
  });
});

app.post('/api/fleet/units/:id/costs', authRequired, requireRoles('admin'), async (req, res) => {
  const unit = await pool.query('SELECT * FROM fleet_units WHERE id = $1', [req.params.id]);
  if (!unit.rowCount) return res.status(404).json({ error: 'Unidad no encontrada.' });
  const tipo = String(req.body.tipo || '').trim();
  const concepto = String(req.body.concepto || '').trim();
  const monto = Number(req.body.monto || 0);
  const garantiaId = String(req.body.garantiaId || '').trim() || null;
  if (!['refaccion','mano_obra'].includes(tipo) || !monto) return res.status(400).json({ error: 'Costo inválido.' });
  const result = await pool.query(`
    INSERT INTO fleet_cost_entries (id, fleet_unit_id, garantia_id, tipo, concepto, monto, created_by_id, created_by_nombre)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
  `, [cryptoRandomId(), req.params.id, garantiaId, tipo, concepto, monto, req.user.id, req.user.nombre]);
  res.status(201).json(mapFleetCost(result.rows[0]));
});




app.get('/api/parts/pending', authRequired, requireRoles('admin','supervisor_flotas'), async (req, res) => {
  try {
    const params = [];
    const where = [
      `solicita_refaccion = TRUE`,
      `COALESCE(estatus_operativo, 'sin iniciar') <> 'terminada'`,
      `COALESCE(refaccion_status, 'pendiente') <> 'instalada'`
    ];
    if (req.user.role === 'supervisor_flotas') {
      params.push(req.user.empresa || '');
      where.push(`empresa = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT * FROM garantias WHERE ${where.join(' AND ')} ORDER BY updated_at DESC, created_at DESC`,
      params
    );
    res.json(result.rows.map(mapGarantia));
  } catch (error) {
    console.error('Error cargando refacciones pendientes:', error);
    res.status(500).json({ error: 'No se pudieron cargar las refacciones pendientes.' });
  }
});

app.patch('/api/parts/:id', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const detalleRefaccion = String(req.body.detalleRefaccion || '').trim();
    const refaccionAsignada = String(req.body.refaccionAsignada || '').trim();
    const refaccionStatus = String(req.body.refaccionStatus || 'pendiente').trim();
    const allowed = ['pendiente','asignada','en_compra','recibida','instalada'];
    if (!allowed.includes(refaccionStatus)) {
      return res.status(400).json({ error: 'Estado de refacción inválido.' });
    }
    const result = await pool.query(
      `UPDATE garantias
       SET detalle_refaccion = $2,
           refaccion_asignada = $3,
           refaccion_status = $4,
           refaccion_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, detalleRefaccion, refaccionAsignada, refaccionStatus]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Registro no encontrado.' });
    await addAuditLog(req.params.id, req.user.id, 'refaccion_actualizada', `Refacción ${refaccionStatus}: ${refaccionAsignada || detalleRefaccion || 'sin detalle'}`);
    res.json(mapGarantia(result.rows[0]));
  } catch (error) {
    console.error('Error actualizando refacción:', error);
    res.status(500).json({ error: 'No se pudo actualizar la refacción.' });
  }
});

app.patch('/api/schedules/:id/reschedule', authRequired, requireRoles('admin','operativo','supervisor_flotas'), async (req, res) => {
  try {
    const scheduledFor = req.body.scheduledFor ? new Date(req.body.scheduledFor) : null;
    const reason = String(req.body.reason || '').trim();
    if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) return res.status(400).json({ error: 'Fecha inválida.' });

    const found = await pool.query(
      `SELECT sr.*, g.empresa
       FROM schedule_requests sr
       JOIN garantias g ON g.id = sr.garantia_id
       WHERE sr.id = $1`,
      [req.params.id]
    );
    if (!found.rowCount) return res.status(404).json({ error: 'Programación no encontrada.' });

    const current = found.rows[0];
    if (req.user.role === 'supervisor_flotas' && current.empresa !== (req.user.empresa || '')) {
      return res.status(403).json({ error: 'No puedes reprogramar citas de otra empresa.' });
    }

    await pool.query(
      `UPDATE schedule_requests
       SET scheduled_for = $2,
           status = 'confirmed',
           confirmed_at = NOW(),
           notes = CASE WHEN COALESCE(notes, '') = '' THEN $3 ELSE notes || E'\n' || $3 END,
           updated_at = NOW()
       WHERE id = $1`,
      [req.params.id, scheduledFor.toISOString(), reason ? `Reprogramada: ${reason}` : 'Reprogramada manualmente']
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Error reprogramando cita:', error);
    res.status(500).json({ error: 'No se pudo reprogramar la cita.' });
  }
});

app.patch('/api/schedules/:id/cancel', authRequired, requireRoles('admin','operativo','supervisor_flotas'), async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();

    const found = await pool.query(
      `SELECT sr.*, g.empresa
       FROM schedule_requests sr
       JOIN garantias g ON g.id = sr.garantia_id
       WHERE sr.id = $1`,
      [req.params.id]
    );
    if (!found.rowCount) return res.status(404).json({ error: 'Programación no encontrada.' });

    const current = found.rows[0];
    if (req.user.role === 'supervisor_flotas' && current.empresa !== (req.user.empresa || '')) {
      return res.status(403).json({ error: 'No puedes cancelar citas de otra empresa.' });
    }

    await pool.query(
      `UPDATE schedule_requests
       SET status = 'cancelled',
           scheduled_for = NULL,
           notes = CASE WHEN COALESCE(notes, '') = '' THEN $2 ELSE notes || E'\n' || $2 END,
           updated_at = NOW()
       WHERE id = $1`,
      [req.params.id, reason ? `Cancelada: ${reason}` : 'Cancelada manualmente']
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Error cancelando cita:', error);
    res.status(500).json({ error: 'No se pudo cancelar la cita.' });
  }
});


app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`CARLAB CLOUD V3 Fase 3 corriendo en puerto ${PORT}`));
  })
  .catch((error) => {
    console.error('No se pudo inicializar la base:', error);
    process.exit(1);
  });
