const fs = require('fs');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const JWT_SECRET = process.env.JWT_SECRET || 'carlab-dev-secret';
const DATABASE_URL = process.env.DATABASE_URL;
const hotfixPool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false }
}) : null;

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}
function phoneDigits(value) { return String(value || '').replace(/\D/g, ''); }
function isValidMxPhone(value) {
  const digits = phoneDigits(value);
  return digits.length === 10 || (digits.startsWith('52') && digits.length === 12) || (digits.startsWith('521') && digits.length === 13);
}
function fail(res, message) { return res.status(400).json({ error: message }); }

function validatePublicOperator(req, res, next) {
  const { email, telefono, password } = req.body || {};
  if (!isValidEmail(email)) return fail(res, 'Correo inválido.');
  if (!isValidMxPhone(telefono)) return fail(res, 'Teléfono inválido. Usa 10 dígitos MX o formato 52/521.');
  if (String(password || '').length < 8) return fail(res, 'La contraseña debe tener al menos 8 caracteres.');
  return next();
}
function validateCompany(req, res, next) {
  const { email, telefono } = req.body || {};
  if (email && !isValidEmail(email)) return fail(res, 'Correo de empresa inválido.');
  if (telefono && !isValidMxPhone(telefono)) return fail(res, 'Teléfono de empresa inválido. Usa 10 dígitos MX o formato 52/521.');
  return next();
}
function validateUser(req, res, next) {
  const { email, telefono, password } = req.body || {};
  const isPatch = req.method === 'PATCH';
  if (email && !isValidEmail(email)) return fail(res, 'Correo de usuario inválido.');
  if (telefono && !isValidMxPhone(telefono)) return fail(res, 'Teléfono de usuario inválido. Usa 10 dígitos MX o formato 52/521.');
  if ((!isPatch || password) && String(password || '').length < 8) return fail(res, 'La contraseña debe tener al menos 8 caracteres.');
  return next();
}

function currentUser(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}
function sameCompanySql(column, index) {
  return `LOWER(REGEXP_REPLACE(TRIM(COALESCE(${column},'')), '\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM(COALESCE($${index},'')), '\\s+', ' ', 'g'))`;
}
function scheduleRow(row) {
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
    originalText: '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function operatorHotfix(req, res, next) {
  const user = currentUser(req);
  if (!user || user.role !== 'operador') return next();

  const empresa = String(user.empresa || '').trim();
  if (!empresa) return res.status(403).json({ error: 'Tu usuario operador no tiene empresa asignada.' });

  try {
    // Seguridad: nunca aceptar una empresa enviada desde el navegador.
    if (req.method === 'POST' && req.path === '/api/garantias') {
      req.body = { ...(req.body || {}), empresa };
      return next();
    }

    // Endpoint exclusivo para poblar unidades en la agenda del operador.
    if (req.method === 'GET' && req.path === '/api/operator/units') {
      const result = await hotfixPool.query(
        `SELECT id, empresa, numero_economico, numero_obra, marca, modelo, anio, kilometraje
         FROM fleet_units
         WHERE ${sameCompanySql('empresa', 1)}
         ORDER BY numero_economico ASC`,
        [empresa]
      );
      return res.json(result.rows.map(r => ({
        id: r.id, empresa: r.empresa, numeroEconomico: r.numero_economico,
        numeroObra: r.numero_obra || '', marca: r.marca || '', modelo: r.modelo || '',
        anio: r.anio || '', kilometraje: r.kilometraje || ''
      })));
    }

    // El operador ve exclusivamente agenda de su empresa, incluyendo ingresos manuales.
    if (req.method === 'GET' && req.path === '/api/schedules') {
      const result = await hotfixPool.query(
        `SELECT sr.id, sr.garantia_id, sr.status, sr.notes, sr.requested_at, sr.proposed_at,
                sr.confirmed_at, sr.scheduled_for, sr.created_at, sr.updated_at,
                COALESCE(g.folio, sr.folio_manual) AS folio,
                COALESCE(g.numero_economico, sr.numero_economico) AS numero_economico,
                COALESCE(g.empresa, sr.empresa) AS empresa,
                COALESCE(g.contacto_nombre, sr.contacto_nombre) AS contacto_nombre,
                COALESCE(g.telefono, sr.telefono) AS telefono
         FROM schedule_requests sr
         LEFT JOIN garantias g ON g.id = sr.garantia_id
         WHERE ${sameCompanySql('COALESCE(g.empresa, sr.empresa)', 1)}
         ORDER BY COALESCE(sr.scheduled_for, sr.proposed_at, sr.requested_at) ASC
         LIMIT 500`,
        [empresa]
      );
      return res.json(result.rows.map(scheduleRow));
    }

    // Permite al operador agendar manualmente, siempre dentro de su empresa.
    if (req.method === 'POST' && req.path === '/api/schedules/manual') {
      const unidad = String(req.body?.unidad || '').trim();
      const telefono = phoneDigits(req.body?.telefono || '');
      const folio = String(req.body?.folio || '').trim();
      const contacto = String(req.body?.contactoNombre || user.nombre || '').trim();
      const notes = String(req.body?.notes || '').trim();
      const scheduledFor = req.body?.scheduledFor ? new Date(req.body.scheduledFor) : null;
      if (!unidad || !scheduledFor || Number.isNaN(scheduledFor.getTime())) {
        return res.status(400).json({ error: 'Completa unidad y fecha válida.' });
      }

      const unitCheck = await hotfixPool.query(
        `SELECT numero_economico FROM fleet_units
         WHERE ${sameCompanySql('empresa', 1)} AND TRIM(numero_economico) = TRIM($2)
         LIMIT 1`,
        [empresa, unidad]
      );
      if (!unitCheck.rowCount) return res.status(403).json({ error: 'La unidad no pertenece a tu empresa.' });

      const id = global.crypto?.randomUUID?.() || `${Date.now()}-${Math.floor(Math.random()*1e6)}`;
      const saved = await hotfixPool.query(
        `INSERT INTO schedule_requests
          (id, garantia_id, telefono, status, notes, scheduled_for, confirmed_at,
           empresa, numero_economico, contacto_nombre, folio_manual)
         VALUES ($1,NULL,$2,'confirmed',$3,$4,NOW(),$5,$6,$7,$8)
         RETURNING *`,
        [id, telefono, notes, scheduledFor.toISOString(), empresa, unidad, contacto, folio]
      );
      return res.status(201).json(scheduleRow({
        ...saved.rows[0], folio, numero_economico: unidad, empresa, contacto_nombre: contacto, telefono
      }));
    }
  } catch (error) {
    console.error('[HOTFIX OPERADOR]', error);
    return res.status(500).json({ error: 'No se pudo completar la operación del operador.' });
  }
  return next();
}

const routeGuards = {
  'POST /api/public/register-operator': validatePublicOperator,
  'POST /api/companies': validateCompany,
  'PATCH /api/companies/:id': validateCompany,
  'POST /api/users': validateUser,
  'PATCH /api/users/:id': validateUser,
};

function injectAuditFixes(html) {
  let output = String(html || '');
  if (!output.includes('/audit-fixes.css')) {
    output = output.replace('<link rel="stylesheet" href="/style.min.css" />',
      '<link rel="stylesheet" href="/style.min.css" />\n  <link rel="stylesheet" href="/audit-fixes.css" />');
  }
  output = output.replace('<input id="regPassword" type="password" required />',
    '<input id="regPassword" type="password" autocomplete="new-password" minlength="8" required />');
  output = output.replace('<section id="dashboardView" class="hidden shell">',
    '<section id="dashboardView" class="hidden shell">\n      <button id="mobileMenuBtn" class="mobile-menu-btn" type="button" aria-expanded="false">Menú</button>');
  output = output.replace('<input id="userPassword" type="text" required />',
    '<input id="userPassword" type="password" autocomplete="new-password" minlength="8" required />');
  if (!output.includes('/audit-fixes.js')) {
    output = output.replace('<script src="/app.min.js"></script>',
      '<script src="/app.min.js"></script>\n  <script src="/audit-fixes.js"></script>');
  }
  return output;
}
function auditHtmlMiddleware(req, res, next) {
  if (req.method !== 'GET' || !['/', '/index.html'].includes(req.path)) return next();
  const filePath = path.join(process.cwd(), 'public', 'index.html');
  fs.readFile(filePath, 'utf8', (error, html) => {
    if (error) return next(error);
    res.type('html').send(injectAuditFixes(html));
  });
}
function wrapStaticInjection() {
  const originalUse = express.application.use;
  let injected = false;
  express.application.use = function guardedUse(...args) {
    const includesStatic = args.some((arg) => arg && arg.name === 'serveStatic');
    if (!injected && includesStatic) {
      injected = true;
      originalUse.call(this, operatorHotfix);
      originalUse.call(this, auditHtmlMiddleware);
    }
    return originalUse.call(this, ...args);
  };
}
function wrapRoute(methodName) {
  const original = express.application[methodName];
  express.application[methodName] = function guardedRoute(routePath, ...handlers) {
    const guard = routeGuards[`${methodName.toUpperCase()} ${routePath}`];
    if (!guard || handlers.includes(guard)) return original.call(this, routePath, ...handlers);
    const insertAt = Math.max(0, handlers.length - 1);
    return original.call(this, routePath, ...handlers.slice(0, insertAt), guard, ...handlers.slice(insertAt));
  };
}
wrapRoute('post');
wrapRoute('patch');
wrapStaticInjection();
