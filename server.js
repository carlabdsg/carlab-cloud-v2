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
const TWILIO_TEMPLATE_POLIZA_VENCE = process.env.TWILIO_TEMPLATE_POLIZA_VENCE || '';
const TWILIO_TEMPLATE_CAMPANA = process.env.TWILIO_TEMPLATE_CAMPANA || '';

if (!DATABASE_URL) { console.error('Falta DATABASE_URL'); process.exit(1); }
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function cryptoRandomId() { return global.crypto?.randomUUID?.() || `${Date.now()}-${Math.floor(Math.random() * 1e6)}`; }
const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

function normalizeMxPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('521') && digits.length >= 13) return digits;
  if (digits.startsWith('52') && digits.length === 12) return `521${digits.slice(2)}`;
  if (digits.length === 10) return `521${digits}`;
  return digits;
}
function buildWhatsappTo(raw) { const n = normalizeMxPhone(raw); return n ? `whatsapp:+${n}` : ''; }
function buildWhatsappFrom(raw) {
  const v = String(raw || '').trim().replace(/\s+/g, '');
  if (!v) return '';
  if (v.startsWith('whatsapp:')) { const b = v.slice(9).replace(/\s+/g, ''); return b.startsWith('+') ? `whatsapp:${b}` : `whatsapp:+${b}`; }
  return v.startsWith('+') ? `whatsapp:${v}` : `whatsapp:+${v}`;
}
async function sendWhatsAppTemplate({ telefono, contentSid, variables }) {
  const from = buildWhatsappFrom(TWILIO_WHATSAPP_NUMBER);
  if (!twilioClient || !from || !contentSid) return;
  const to = buildWhatsappTo(telefono);
  if (!to) return;
  await twilioClient.messages.create({ from, to, contentSid, contentVariables: JSON.stringify(variables || {}) });
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
  let year = yy ? Number(yy.length === 2 ? `20${yy}` : yy) : new Date().getFullYear();
  let hour = Number(hh);
  if (mer) { mer = mer.toLowerCase(); if (mer === 'pm' && hour < 12) hour += 12; if (mer === 'am' && hour === 12) hour = 0; }
  const date = new Date(year, Number(mm) - 1, Number(dd), hour, Number(min));
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), text };
}
function scheduleSummary(row) {
  const noteText = String(row.notes || '');
  const m = noteText.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?[\s,.-]+\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
  return { id: row.id, garantiaId: row.garantia_id, folio: row.folio || '', unidad: row.numero_economico || '', empresa: row.empresa || '', contactoNombre: row.contacto_nombre || '', telefono: row.telefono || '', status: row.status, requestedAt: row.requested_at, proposedAt: row.proposed_at, confirmedAt: row.confirmed_at, scheduledFor: row.scheduled_for, originalText: m ? m[1] : '', notes: row.notes || '', createdAt: row.created_at, updatedAt: row.updated_at };
}
async function notifyGarantiaWhatsApp(evt, g) {
  if (!g || !g.telefono) return;
  const map = { created: TWILIO_TEMPLATE_REPORTE_RECIBIDO, accepted: TWILIO_TEMPLATE_REPORTE_ACEPTADO, rejected: TWILIO_TEMPLATE_REPORTE_RECHAZADO, in_process: TWILIO_TEMPLATE_REPORTE_EN_PROCESO, waiting_parts: TWILIO_TEMPLATE_REPORTE_ESPERA_REFACCION, finished: TWILIO_TEMPLATE_REPORTE_TERMINADO };
  const sid = map[evt]; if (!sid) return;
  try { await sendWhatsAppTemplate({ telefono: g.telefono, contentSid: sid, variables: { folio: g.folio || '', unidad: g.numero_economico || '', empresa: g.empresa || '', falla: g.descripcion_fallo || '', motivo: g.motivo_decision || '', refaccion: g.detalle_refaccion || '' } }); }
  catch (e) { console.error(`WA ${evt}:`, e.message); }
}
async function notifyPolizaVence(unidad, dias, telefono) {
  if (!telefono) return;
  try {
    if (TWILIO_TEMPLATE_POLIZA_VENCE) { await sendWhatsAppTemplate({ telefono, contentSid: TWILIO_TEMPLATE_POLIZA_VENCE, variables: { unidad, dias: String(dias) } }); }
    else { await sendWhatsAppText({ telefono, body: `CARLAB GARANTIAS\n\nAviso: La póliza de la unidad ${unidad} vence en ${dias} días. Favor de renovarla.` }); }
  } catch (e) { console.error('WA poliza:', e.message); }
}
async function notifyCampana(unidad, empresa, campana, telefono) {
  if (!telefono) return;
  try {
    if (TWILIO_TEMPLATE_CAMPANA) { await sendWhatsAppTemplate({ telefono, contentSid: TWILIO_TEMPLATE_CAMPANA, variables: { unidad, empresa, campana } }); }
    else { await sendWhatsAppText({ telefono, body: `CARLAB GARANTIAS\n\nCampaña de mantenimiento: La unidad ${unidad} de ${empresa} está incluida en la campaña "${campana}". Favor de programar su ingreso.` }); }
  } catch (e) { console.error('WA campana:', e.message); }
}
function signToken(u) { return jwt.sign({ id: u.id, email: u.email, role: u.role, nombre: u.nombre, empresa: u.empresa || '', telefono: u.telefono || '' }, JWT_SECRET, { expiresIn: '7d' }); }
function sanitizeUser(r) { return { id: r.id, nombre: r.nombre, email: r.email, role: r.role, activo: r.activo, empresa: r.empresa || '', telefono: r.telefono || '', createdAt: r.created_at }; }
function mapGarantia(r) { return { id: r.id, folio: r.folio || '', numeroObra: r.numero_obra, modelo: r.modelo, numeroEconomico: r.numero_economico, empresa: r.empresa, kilometraje: r.kilometraje || '', contactoNombre: r.contacto_nombre || '', telefono: r.telefono || '', tipoIncidente: r.tipo_incidente, descripcionFallo: r.descripcion_fallo || '', solicitaRefaccion: r.solicita_refaccion, detalleRefaccion: r.detalle_refaccion || '', estatusValidacion: r.estatus_validacion, estatusOperativo: r.estatus_operativo, motivoDecision: r.motivo_decision || '', observacionesOperativo: r.observaciones_operativo || '', evidencias: r.evidencias || [], evidenciasRefaccion: r.evidencias_refaccion || [], firma: r.firma || '', reportadoPorNombre: r.reportado_por_nombre || '', reportadoPorEmail: r.reportado_por_email || '', revisadoPorNombre: r.revisado_por_nombre || '', revisadoPorEmail: r.revisado_por_email || '', createdAt: r.created_at, updatedAt: r.updated_at, reviewedAt: r.reviewed_at, closedAt: r.closed_at }; }
function mapCompany(r) { return { id: r.id, nombre: r.nombre, contacto: r.contacto || '', telefono: r.telefono || '', email: r.email || '', notas: r.notas || '', activo: r.activo, createdAt: r.created_at }; }
function mapUnit(r) { return { id: r.id, numeroEconomico: r.numero_economico, marca: r.marca, modelo: r.modelo, anio: r.anio, empresa: r.empresa, placas: r.placas || '', vin: r.vin || '', color: r.color || '', capacidad: r.capacidad || '', kilometraje: r.kilometraje || 0, estatus: r.estatus, notas: r.notas || '', activo: r.activo, createdAt: r.created_at, updatedAt: r.updated_at }; }
function mapPoliza(r) { return { id: r.id, unitId: r.unit_id, numeroEconomico: r.numero_economico, empresa: r.empresa, tipoPoliza: r.tipo_poliza, proveedor: r.proveedor || '', numeroPoliza: r.numero_poliza || '', fechaInicio: r.fecha_inicio, fechaFin: r.fecha_fin, monto: r.monto || 0, coberturas: r.coberturas || '', notas: r.notas || '', activa: r.activa, createdAt: r.created_at }; }
function mapPart(r) { return { id: r.id, nombre: r.nombre, numeroParte: r.numero_parte || '', marca: r.marca || '', descripcion: r.descripcion || '', precioUnitario: r.precio_unitario || 0, stockActual: r.stock_actual || 0, stockMinimo: r.stock_minimo || 0, ubicacion: r.ubicacion || '', compatibilidad: r.compatibilidad || '', activo: r.activo, createdAt: r.created_at, updatedAt: r.updated_at }; }
function mapPartMovement(r) { return { id: r.id, partId: r.part_id, partNombre: r.part_nombre || '', tipo: r.tipo, cantidad: r.cantidad, precioUnitario: r.precio_unitario || 0, total: r.total || 0, garantiaId: r.garantia_id || '', garantiaFolio: r.garantia_folio || '', unitNumeroEconomico: r.unit_numero_economico || '', notas: r.notas || '', realizadoPorNombre: r.realizado_por_nombre || '', createdAt: r.created_at }; }
function mapCampana(r) { return { id: r.id, nombre: r.nombre, descripcion: r.descripcion || '', tipo: r.tipo, marcas: r.marcas || [], empresas: r.empresas || [], fechaInicio: r.fecha_inicio, fechaFin: r.fecha_fin, activa: r.activa, notas: r.notas || '', creadoPorNombre: r.creado_por_nombre || '', createdAt: r.created_at, updatedAt: r.updated_at }; }
function mapRequest(r) { return { id: r.id, nombre: r.nombre, email: r.email, telefono: r.telefono || '', empresa: r.empresa || '', numeroEconomico: r.numero_economico || '', status: r.status, motivo: r.motivo || '', createdAt: r.created_at, reviewedAt: r.reviewed_at }; }

function authRequired(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autorizado.' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { return res.status(401).json({ error: 'Sesión inválida o vencida.' }); }
}
function requireRoles(...roles) { return (req, res, next) => { if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Sin permiso.' }); next(); }; }
async function addAuditLog(gid, uid, accion, detalle) { try { await pool.query(`INSERT INTO audit_logs (garantia_id,user_id,accion,detalle) VALUES ($1,$2,$3,$4)`, [gid, uid, accion, detalle]); } catch {} }
async function nextFolio() { const r = await pool.query("SELECT COUNT(*)::int AS n FROM garantias"); return `GAR-${String((r.rows[0]?.n || 0) + 1).padStart(5, '0')}`; }

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY,nombre TEXT NOT NULL UNIQUE,contacto TEXT,telefono TEXT,email TEXT,notas TEXT,activo BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,nombre TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('admin','operador','operativo','supervisor','cliente_flota')),empresa TEXT,telefono TEXT,activo BOOLEAN NOT NULL DEFAULT TRUE,deleted_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS registration_requests (id TEXT PRIMARY KEY,nombre TEXT NOT NULL,email TEXT NOT NULL,telefono TEXT,empresa TEXT NOT NULL,numero_economico TEXT,password_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN('pendiente','aprobada','rechazada')),motivo TEXT,reviewed_by_id TEXT REFERENCES users(id),reviewed_by_nombre TEXT,reviewed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS garantias (id TEXT PRIMARY KEY,folio TEXT,numero_obra TEXT NOT NULL,modelo TEXT NOT NULL,numero_economico TEXT NOT NULL,empresa TEXT NOT NULL,kilometraje TEXT,contacto_nombre TEXT,telefono TEXT,tipo_incidente TEXT NOT NULL CHECK(tipo_incidente IN('daño','falla','sin daño')),descripcion_fallo TEXT,solicita_refaccion BOOLEAN NOT NULL DEFAULT FALSE,detalle_refaccion TEXT,estatus_validacion TEXT NOT NULL DEFAULT 'nueva' CHECK(estatus_validacion IN('nueva','pendiente de revisión','aceptada','rechazada')),estatus_operativo TEXT NOT NULL DEFAULT 'sin iniciar' CHECK(estatus_operativo IN('sin iniciar','en proceso','espera refacción','terminada')),motivo_decision TEXT,observaciones_operativo TEXT,evidencias JSONB NOT NULL DEFAULT '[]'::jsonb,evidencias_refaccion JSONB NOT NULL DEFAULT '[]'::jsonb,firma TEXT,reportado_por_id TEXT REFERENCES users(id),reportado_por_nombre TEXT,reportado_por_email TEXT,revisado_por_id TEXT REFERENCES users(id),revisado_por_nombre TEXT,revisado_por_email TEXT,reviewed_at TIMESTAMPTZ,closed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY,garantia_id TEXT REFERENCES garantias(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id),accion TEXT NOT NULL,detalle TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS schedule_requests (id TEXT PRIMARY KEY,garantia_id TEXT REFERENCES garantias(id) ON DELETE CASCADE,telefono TEXT,status TEXT NOT NULL DEFAULT 'waiting_operator' CHECK(status IN('waiting_operator','proposed','confirmed','rejected','cancelled')),notes TEXT,requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),proposed_at TIMESTAMPTZ,confirmed_at TIMESTAMPTZ,scheduled_for TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS units (id TEXT PRIMARY KEY,numero_economico TEXT NOT NULL,marca TEXT NOT NULL,modelo TEXT NOT NULL,anio INT,empresa TEXT NOT NULL,placas TEXT,vin TEXT,color TEXT,capacidad TEXT,kilometraje INT DEFAULT 0,estatus TEXT NOT NULL DEFAULT 'activo' CHECK(estatus IN('activo','en taller','baja','inactivo')),notas TEXT,activo BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(numero_economico,empresa));
    CREATE TABLE IF NOT EXISTS policies (id TEXT PRIMARY KEY,unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,numero_economico TEXT NOT NULL,empresa TEXT NOT NULL,tipo_poliza TEXT NOT NULL CHECK(tipo_poliza IN('garantia_fabricante','garantia_extendida','seguro','mantenimiento','otro')),proveedor TEXT,numero_poliza TEXT,fecha_inicio DATE NOT NULL,fecha_fin DATE NOT NULL,monto NUMERIC(12,2) DEFAULT 0,coberturas TEXT,notas TEXT,activa BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS parts (id TEXT PRIMARY KEY,nombre TEXT NOT NULL,numero_parte TEXT,marca TEXT,descripcion TEXT,precio_unitario NUMERIC(12,2) DEFAULT 0,stock_actual INT DEFAULT 0,stock_minimo INT DEFAULT 0,ubicacion TEXT,compatibilidad TEXT,activo BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS part_movements (id TEXT PRIMARY KEY,part_id TEXT REFERENCES parts(id) ON DELETE CASCADE,part_nombre TEXT,tipo TEXT NOT NULL CHECK(tipo IN('entrada','salida','ajuste')),cantidad INT NOT NULL,precio_unitario NUMERIC(12,2) DEFAULT 0,total NUMERIC(12,2) DEFAULT 0,garantia_id TEXT REFERENCES garantias(id) ON DELETE SET NULL,garantia_folio TEXT,unit_numero_economico TEXT,notas TEXT,realizado_por_id TEXT REFERENCES users(id),realizado_por_nombre TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS campanas (id TEXT PRIMARY KEY,nombre TEXT NOT NULL,descripcion TEXT,tipo TEXT NOT NULL CHECK(tipo IN('preventivo','correctivo','recall','inspeccion','otro')),marcas JSONB DEFAULT '[]'::jsonb,empresas JSONB DEFAULT '[]'::jsonb,fecha_inicio DATE,fecha_fin DATE,activa BOOLEAN NOT NULL DEFAULT TRUE,notas TEXT,creado_por_id TEXT REFERENCES users(id),creado_por_nombre TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS campana_units (id TEXT PRIMARY KEY,campana_id TEXT REFERENCES campanas(id) ON DELETE CASCADE,unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,numero_economico TEXT,empresa TEXT,notificado BOOLEAN DEFAULT FALSE,estatus TEXT DEFAULT 'pendiente' CHECK(estatus IN('pendiente','en_proceso','completado','omitido')),notas TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(campana_id,unit_id));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS empresa TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS telefono TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS contacto TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS telefono TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS notas TEXT;
    ALTER TABLE garantias ADD COLUMN IF NOT EXISTS folio TEXT;
    ALTER TABLE garantias ADD COLUMN IF NOT EXISTS kilometraje TEXT;
    ALTER TABLE garantias ADD COLUMN IF NOT EXISTS contacto_nombre TEXT;
    ALTER TABLE garantias ADD COLUMN IF NOT EXISTS telefono TEXT;
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_garantias_estatus_validacion ON garantias(estatus_validacion);
    CREATE INDEX IF NOT EXISTS idx_garantias_estatus_operativo ON garantias(estatus_operativo);
    CREATE INDEX IF NOT EXISTS idx_garantias_reportado_por_id ON garantias(reportado_por_id);
    CREATE INDEX IF NOT EXISTS idx_garantias_numero_economico ON garantias(numero_economico);
    CREATE INDEX IF NOT EXISTS idx_garantias_empresa ON garantias(empresa);
    CREATE INDEX IF NOT EXISTS idx_units_empresa ON units(empresa);
    CREATE INDEX IF NOT EXISTS idx_policies_unit_id ON policies(unit_id);
    CREATE INDEX IF NOT EXISTS idx_policies_fecha_fin ON policies(fecha_fin);
    CREATE INDEX IF NOT EXISTS idx_schedule_requests_garantia_id ON schedule_requests(garantia_id);
    CREATE INDEX IF NOT EXISTS idx_schedule_requests_status ON schedule_requests(status);
  `);
  for (const n of DEFAULT_COMPANIES) await pool.query(`INSERT INTO companies(id,nombre,activo) VALUES($1,$2,TRUE) ON CONFLICT(nombre) DO NOTHING`, [cryptoRandomId(), n]);
  const ea = await pool.query('SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL', [ADMIN_EMAIL]);
  if (!ea.rowCount) { const h = await bcrypt.hash(ADMIN_PASSWORD, 10); await pool.query(`INSERT INTO users(id,nombre,email,password_hash,role,activo) VALUES($1,$2,$3,$4,'admin',TRUE)`, [cryptoRandomId(), ADMIN_NAME, ADMIN_EMAIL, h]); console.log(`Admin creado: ${ADMIN_EMAIL}`); }
}

// HEALTH
app.get('/api/health', async (_req, res) => { try { const r = await pool.query('SELECT NOW()'); res.json({ ok: true, db: r.rows[0].now }); } catch (e) { res.status(500).json({ ok: false }); } });

// PUBLIC
app.get('/api/public/companies', async (_req, res) => { const r = await pool.query('SELECT * FROM companies WHERE activo=TRUE ORDER BY nombre'); res.json(r.rows.map(mapCompany)); });
app.post('/api/public/register-operator', async (req, res) => {
  const { nombre, email: rawEmail, telefono: rawTel, empresa, numeroEconomico, password } = req.body;
  const email = String(rawEmail || '').trim().toLowerCase();
  const telefono = normalizeMxPhone(rawTel);
  if (!nombre || !email || !telefono || !empresa || !password) return res.status(400).json({ error: 'Completa todos los campos.' });
  const co = await pool.query('SELECT id FROM companies WHERE nombre=$1 AND activo=TRUE', [empresa]);
  if (!co.rowCount) return res.status(400).json({ error: 'La empresa no está registrada.' });
  if ((await pool.query('SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL', [email])).rowCount) return res.status(400).json({ error: 'Ese correo ya tiene acceso.' });
  if ((await pool.query('SELECT id FROM registration_requests WHERE email=$1 AND status=$2', [email, 'pendiente'])).rowCount) return res.status(400).json({ error: 'Ya hay una solicitud pendiente.' });
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query(`INSERT INTO registration_requests(id,nombre,email,telefono,empresa,numero_economico,password_hash,status) VALUES($1,$2,$3,$4,$5,$6,$7,'pendiente') RETURNING *`, [cryptoRandomId(), nombre, email, telefono, empresa, numeroEconomico || '', hash]);
  res.status(201).json({ ok: true, message: 'Solicitud enviada. Un administrador debe aprobar tu acceso.', request: mapRequest(r.rows[0]) });
});

// AUTH
app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña obligatorios.' });
  const r = await pool.query('SELECT * FROM users WHERE email=$1 AND deleted_at IS NULL', [email]);
  const u = r.rows[0];
  if (!u || !u.activo) return res.status(401).json({ error: 'Usuario no encontrado o inactivo.' });
  if (!await bcrypt.compare(password, u.password_hash)) return res.status(401).json({ error: 'Contraseña incorrecta.' });
  res.json({ token: signToken(u), user: sanitizeUser(u) });
});
app.get('/api/auth/me', authRequired, async (req, res) => {
  const r = await pool.query('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL', [req.user.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json({ user: sanitizeUser(r.rows[0]) });
});

// COMPANIES
app.get('/api/companies', authRequired, requireRoles('admin'), async (_req, res) => { const r = await pool.query('SELECT * FROM companies ORDER BY nombre'); res.json(r.rows.map(mapCompany)); });
app.post('/api/companies', authRequired, requireRoles('admin'), async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Nombre obligatorio.' });
  const r = await pool.query(`INSERT INTO companies(id,nombre,contacto,telefono,email,notas,activo) VALUES($1,$2,$3,$4,$5,$6,TRUE) ON CONFLICT(nombre) DO UPDATE SET contacto=EXCLUDED.contacto,telefono=EXCLUDED.telefono,email=EXCLUDED.email,notas=EXCLUDED.notas,activo=TRUE RETURNING *`, [cryptoRandomId(), nombre, req.body.contacto || '', normalizeMxPhone(req.body.telefono), String(req.body.email || '').toLowerCase(), req.body.notas || '']);
  res.status(201).json(mapCompany(r.rows[0]));
});
app.patch('/api/companies/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Nombre obligatorio.' });
  if ((await pool.query('SELECT id FROM companies WHERE nombre=$1 AND id<>$2', [nombre, req.params.id])).rowCount) return res.status(400).json({ error: 'Ya existe otra empresa con ese nombre.' });
  const r = await pool.query(`UPDATE companies SET nombre=$2,contacto=$3,telefono=$4,email=$5,notas=$6,activo=$7 WHERE id=$1 RETURNING *`, [req.params.id, nombre, req.body.contacto || '', normalizeMxPhone(req.body.telefono), String(req.body.email || '').toLowerCase(), req.body.notas || '', req.body.activo !== false]);
  if (!r.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  res.json(mapCompany(r.rows[0]));
});
app.delete('/api/companies/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const c = await pool.query('SELECT * FROM companies WHERE id=$1', [req.params.id]);
  if (!c.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  const linked = await pool.query('SELECT COUNT(*)::int AS n FROM garantias WHERE empresa=$1', [c.rows[0].nombre]);
  if ((linked.rows[0]?.n || 0) > 0) return res.status(400).json({ error: 'Tiene historial. Desactívala mejor.' });
  await pool.query('DELETE FROM companies WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});
app.patch('/api/companies/:id/deactivate', authRequired, requireRoles('admin'), async (req, res) => {
  const r = await pool.query('UPDATE companies SET activo=FALSE WHERE id=$1 RETURNING *', [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  res.json(mapCompany(r.rows[0]));
});

// REGISTRATION REQUESTS
app.get('/api/registration-requests', authRequired, requireRoles('admin'), async (_req, res) => { const r = await pool.query('SELECT * FROM registration_requests ORDER BY created_at DESC'); res.json(r.rows.map(mapRequest)); });
app.patch('/api/registration-requests/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const status = String(req.body.status || '').trim();
  if (!['aprobada','rechazada'].includes(status)) return res.status(400).json({ error: 'Acción inválida.' });
  const cur = await pool.query('SELECT * FROM registration_requests WHERE id=$1', [req.params.id]);
  if (!cur.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  const row = cur.rows[0];
  if (row.status !== 'pendiente') return res.status(400).json({ error: 'Ya fue procesada.' });
  if (status === 'aprobada') {
    if ((await pool.query('SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL', [row.email])).rowCount) {
      await pool.query(`UPDATE registration_requests SET status='rechazada',motivo=$2,reviewed_by_id=$3,reviewed_by_nombre=$4,reviewed_at=NOW() WHERE id=$1`, [row.id, 'Correo ya existe.', req.user.id, req.user.nombre]);
      return res.status(400).json({ error: 'Ese correo ya existe.' });
    }
    await pool.query(`INSERT INTO users(id,nombre,email,password_hash,role,empresa,telefono,activo) VALUES($1,$2,$3,$4,'operador',$5,$6,TRUE)`, [cryptoRandomId(), row.nombre, row.email, row.password_hash, row.empresa, row.telefono || '']);
  }
  const r = await pool.query(`UPDATE registration_requests SET status=$2,motivo=$3,reviewed_by_id=$4,reviewed_by_nombre=$5,reviewed_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, status, req.body.motivo || '', req.user.id, req.user.nombre]);
  res.json(mapRequest(r.rows[0]));
});

// USERS
app.get('/api/users', authRequired, requireRoles('admin'), async (_req, res) => { const r = await pool.query('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC'); res.json(r.rows.map(sanitizeUser)); });
app.post('/api/users', authRequired, requireRoles('admin'), async (req, res) => {
  const { nombre, email, password, role, empresa, telefono } = req.body;
  if (!nombre || !email || !password || !['operador','operativo','supervisor','admin','cliente_flota'].includes(role)) return res.status(400).json({ error: 'Datos incompletos.' });
  if ((await pool.query('SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL', [email.toLowerCase()])).rowCount) return res.status(400).json({ error: 'Ese correo ya existe.' });
  const h = await bcrypt.hash(password, 10);
  const r = await pool.query(`INSERT INTO users(id,nombre,email,password_hash,role,empresa,telefono,activo) VALUES($1,$2,$3,$4,$5,$6,$7,TRUE) RETURNING *`, [cryptoRandomId(), nombre, email.toLowerCase(), h, role, empresa || '', telefono || '']);
  res.status(201).json(sanitizeUser(r.rows[0]));
});
app.patch('/api/users/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const cur = await pool.query('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
  if (!cur.rowCount) return res.status(404).json({ error: 'No encontrado.' });
  const { nombre, email, role, password, empresa, telefono } = req.body;
  if (!nombre || !email || !['operador','operativo','supervisor','admin','cliente_flota'].includes(role)) return res.status(400).json({ error: 'Datos inválidos.' });
  if ((await pool.query('SELECT id FROM users WHERE email=$1 AND id<>$2 AND deleted_at IS NULL', [email.toLowerCase(), req.params.id])).rowCount) return res.status(400).json({ error: 'Correo ya existe.' });
  let h = cur.rows[0].password_hash;
  if (password) h = await bcrypt.hash(password, 10);
  const r = await pool.query(`UPDATE users SET nombre=$2,email=$3,role=$4,password_hash=$5,empresa=$6,telefono=$7 WHERE id=$1 RETURNING *`, [req.params.id, nombre, email.toLowerCase(), role, h, empresa || '', telefono || '']);
  res.json(sanitizeUser(r.rows[0]));
});
app.delete('/api/users/:id', authRequired, requireRoles('admin'), async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'No puedes borrarte.' });
  const cur = await pool.query('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
  if (!cur.rowCount) return res.status(404).json({ error: 'No encontrado.' });
  if (cur.rows[0].role === 'admin') return res.status(400).json({ error: 'No se borra un admin desde aquí.' });
  await pool.query(`UPDATE users SET activo=FALSE,deleted_at=NOW(),email=$2,nombre=$3 WHERE id=$1`, [req.params.id, `eliminado_${Date.now()}_${cur.rows[0].email}`, `[Eliminado] ${cur.rows[0].nombre}`]);
  res.json({ ok: true });
});

// GARANTIAS
app.get('/api/garantias', authRequired, async (req, res) => {
  let q = 'SELECT * FROM garantias'; const p = [];
  if (req.user.role === 'operador') { q += ' WHERE reportado_por_id=$1'; p.push(req.user.id); }
  else if (req.user.role === 'cliente_flota') { q += ' WHERE empresa=$1'; p.push(req.user.empresa); }
  q += ' ORDER BY created_at DESC';
  res.json((await pool.query(q, p)).rows.map(mapGarantia));
});
app.post('/api/garantias', authRequired, requireRoles('operador','admin'), async (req, res) => {
  const b = req.body;
  if ([b.numeroObra,b.modelo,b.numeroEconomico,b.empresa,b.tipoIncidente,b.descripcionFallo].some(v => !String(v||'').trim())) return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  const id = cryptoRandomId(); const folio = await nextFolio();
  const r = await pool.query(`INSERT INTO garantias(id,folio,numero_obra,modelo,numero_economico,empresa,kilometraje,contacto_nombre,telefono,tipo_incidente,descripcion_fallo,solicita_refaccion,detalle_refaccion,estatus_validacion,estatus_operativo,evidencias,evidencias_refaccion,firma,reportado_por_id,reportado_por_nombre,reportado_por_email,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'nueva','sin iniciar',$14::jsonb,$15::jsonb,$16,$17,$18,$19,NOW()) RETURNING *`,
    [id,folio,b.numeroObra,b.modelo,b.numeroEconomico,b.empresa,b.kilometraje||'',b.contactoNombre||'',normalizeMxPhone(b.telefono),b.tipoIncidente,b.descripcionFallo,!!b.solicitaRefaccion,b.detalleRefaccion||'',JSON.stringify(b.evidencias||[]),JSON.stringify(b.evidenciasRefaccion||[]),b.firma||'',req.user.id,req.user.nombre,req.user.email]);
  await addAuditLog(id, req.user.id, 'crear_reporte', `Creado por ${req.user.nombre}`);
  notifyGarantiaWhatsApp('created', r.rows[0]).catch(()=>{});
  try { const u = await pool.query('SELECT id FROM units WHERE numero_economico=$1 AND empresa=$2 AND activo=TRUE', [b.numeroEconomico,b.empresa]); if (u.rowCount && b.kilometraje) await pool.query('UPDATE units SET kilometraje=$1,updated_at=NOW() WHERE id=$2',[parseInt(b.kilometraje)||0,u.rows[0].id]); } catch {}
  res.status(201).json(mapGarantia(r.rows[0]));
});
app.patch('/api/garantias/:id/review', authRequired, requireRoles('operativo','admin'), async (req, res) => {
  const ev = String(req.body.estatusValidacion||'').trim();
  if (!['pendiente de revisión','aceptada','rechazada'].includes(ev)) return res.status(400).json({ error: 'Estatus inválido.' });
  if (ev==='rechazada' && !req.body.motivoDecision) return res.status(400).json({ error: 'Motivo de rechazo requerido.' });
  const cur = await pool.query('SELECT * FROM garantias WHERE id=$1', [req.params.id]);
  if (!cur.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  const newOp = ev==='aceptada' && cur.rows[0].estatus_operativo==='sin iniciar' ? 'en proceso' : cur.rows[0].estatus_operativo;
  const r = await pool.query(`UPDATE garantias SET estatus_validacion=$2,estatus_operativo=$3,observaciones_operativo=$4,motivo_decision=$5,revisado_por_id=$6,revisado_por_nombre=$7,revisado_por_email=$8,reviewed_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *`,
    [req.params.id,ev,newOp,req.body.observacionesOperativo||'',req.body.motivoDecision||'',req.user.id,req.user.nombre,req.user.email]);
  await addAuditLog(req.params.id, req.user.id, 'revision', `${req.user.nombre} → ${ev}`);
  if (ev==='aceptada') notifyGarantiaWhatsApp('accepted', r.rows[0]).catch(()=>{});
  if (ev==='rechazada') notifyGarantiaWhatsApp('rejected', r.rows[0]).catch(()=>{});
  res.json(mapGarantia(r.rows[0]));
});
app.patch('/api/garantias/:id/operational', authRequired, requireRoles('operativo','admin'), async (req, res) => {
  const eo = String(req.body.estatusOperativo||'').trim();
  if (!['sin iniciar','en proceso','espera refacción','terminada'].includes(eo)) return res.status(400).json({ error: 'Estatus inválido.' });
  const cur = await pool.query('SELECT * FROM garantias WHERE id=$1', [req.params.id]);
  if (!cur.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  if (cur.rows[0].estatus_validacion !== 'aceptada') return res.status(400).json({ error: 'Solo aceptadas.' });
  const r = await pool.query(`UPDATE garantias SET estatus_operativo=$2,observaciones_operativo=COALESCE(NULLIF($3,''),observaciones_operativo),updated_at=NOW(),closed_at=CASE WHEN $2='terminada' THEN NOW() ELSE NULL END WHERE id=$1 RETURNING *`, [req.params.id,eo,req.body.observacionesOperativo||'']);
  await addAuditLog(req.params.id, req.user.id, 'estatus_operativo', `${req.user.nombre} → ${eo}`);
  if (eo==='en proceso') notifyGarantiaWhatsApp('in_process', r.rows[0]).catch(()=>{});
  if (eo==='espera refacción') notifyGarantiaWhatsApp('waiting_parts', r.rows[0]).catch(()=>{});
  if (eo==='terminada') notifyGarantiaWhatsApp('finished', r.rows[0]).catch(()=>{});
  res.json(mapGarantia(r.rows[0]));
});
app.delete('/api/garantias/:id', authRequired, requireRoles('admin'), async (req, res) => {
  if (!(await pool.query('SELECT id FROM garantias WHERE id=$1', [req.params.id])).rowCount) return res.status(404).json({ error: 'No encontrada.' });
  await addAuditLog(req.params.id, req.user.id, 'eliminar', `Admin ${req.user.nombre}`);
  await pool.query('DELETE FROM garantias WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});
app.get('/api/audit/:gid', authRequired, requireRoles('admin','operativo','supervisor'), async (req, res) => {
  const r = await pool.query(`SELECT a.*,u.nombre AS user_nombre,u.email AS user_email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.garantia_id=$1 ORDER BY a.created_at DESC`, [req.params.gid]);
  res.json(r.rows);
});
app.get('/api/history/unit/:num', authRequired, async (req, res) => {
  let q = 'SELECT * FROM garantias WHERE numero_economico=$1'; const p = [req.params.num];
  if (req.user.role === 'cliente_flota') { q += ' AND empresa=$2'; p.push(req.user.empresa); }
  q += ' ORDER BY created_at DESC';
  res.json((await pool.query(q, p)).rows.map(mapGarantia));
});

// SCHEDULES
app.get('/api/schedules', authRequired, async (req, res) => {
  const date = String(req.query.date||'').trim(); const p = []; const w = [];
  if (date) { p.push(date); w.push(`DATE(sr.scheduled_for AT TIME ZONE 'UTC')=$${p.length}`); }
  if (['supervisor','cliente_flota'].includes(req.user.role)) { p.push(req.user.empresa||''); w.push(`g.empresa=$${p.length}`); }
  if (req.user.role==='operador') { p.push(req.user.id); w.push(`g.reportado_por_id=$${p.length}`); }
  const r = await pool.query(`SELECT sr.*,g.folio,g.numero_economico,g.empresa,g.contacto_nombre FROM schedule_requests sr JOIN garantias g ON g.id=sr.garantia_id ${w.length?`WHERE ${w.join(' AND ')}`:''}  ORDER BY COALESCE(sr.scheduled_for,sr.proposed_at,sr.requested_at) ASC`, p);
  res.json(r.rows.map(scheduleSummary));
});
app.post('/api/garantias/:id/request-schedule', authRequired, requireRoles('admin','operativo'), async (req, res) => {
  const cur = await pool.query('SELECT * FROM garantias WHERE id=$1', [req.params.id]);
  if (!cur.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  const g = cur.rows[0];
  if (g.estatus_validacion !== 'aceptada') return res.status(400).json({ error: 'Solo aceptadas.' });
  const ex = await pool.query(`SELECT * FROM schedule_requests WHERE garantia_id=$1 AND status IN('waiting_operator','proposed','confirmed') LIMIT 1`, [req.params.id]);
  let s = ex.rows[0];
  if (!s) { const c = await pool.query(`INSERT INTO schedule_requests(id,garantia_id,telefono,status,notes) VALUES($1,$2,$3,'waiting_operator',$4) RETURNING *`, [cryptoRandomId(),req.params.id,g.telefono||'',`Solicitud por ${req.user.nombre}`]); s = c.rows[0]; }
  try {
    if (TWILIO_TEMPLATE_SCHEDULE_REQUEST) { await sendWhatsAppTemplate({ telefono: g.telefono, contentSid: TWILIO_TEMPLATE_SCHEDULE_REQUEST, variables: { 1: g.folio||'' } }); }
    else { await sendWhatsAppText({ telefono: g.telefono, body: `CARLAB GARANTIAS\n\nTu reporte ${g.folio} fue aceptado. Propón la fecha para ingresar tu unidad al taller: DD/MM/AAAA HH:MM\n\nEj: 28/05/2026 09:30` }); }
  } catch (e) { console.error('WA sched:', e.message); }
  await addAuditLog(req.params.id, req.user.id, 'solicitar_programacion', `${req.user.nombre} solicitó fecha`);
  const j = await pool.query(`SELECT sr.*,g.folio,g.numero_economico,g.empresa,g.contacto_nombre FROM schedule_requests sr JOIN garantias g ON g.id=sr.garantia_id WHERE sr.id=$1`, [s.id]);
  res.status(201).json(scheduleSummary(j.rows[0]));
});
app.patch('/api/schedules/:id/confirm', authRequired, requireRoles('admin','operativo'), async (req, res) => {
  const status = String(req.body.status||'confirmed').trim();
  const found = await pool.query(`SELECT sr.*,g.folio,g.numero_economico,g.empresa,g.telefono FROM schedule_requests sr JOIN garantias g ON g.id=sr.garantia_id WHERE sr.id=$1`, [req.params.id]);
  if (!found.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  const cur = found.rows[0];
  const sf = req.body.scheduledFor ? new Date(req.body.scheduledFor) : (cur.scheduled_for ? new Date(cur.scheduled_for) : null);
  if (status==='confirmed' && sf) {
    const busy = await pool.query(`SELECT id FROM schedule_requests WHERE id<>$1 AND status='confirmed' AND DATE(scheduled_for AT TIME ZONE 'UTC')=DATE($2::timestamptz AT TIME ZONE 'UTC') AND TO_CHAR(scheduled_for AT TIME ZONE 'UTC','HH24:MI')=TO_CHAR($2::timestamptz AT TIME ZONE 'UTC','HH24:MI') LIMIT 1`, [req.params.id,sf.toISOString()]);
    if (busy.rowCount) { const rec = new Date(sf.getTime()+3600000); return res.status(409).json({ error: 'Horario ocupado.', recommended: rec.toISOString() }); }
  }
  const r = await pool.query(`UPDATE schedule_requests SET status=$2,scheduled_for=$3,confirmed_at=CASE WHEN $2='confirmed' THEN NOW() ELSE confirmed_at END,notes=COALESCE(NULLIF($4,''),notes),updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id,status,sf,req.body.notes||'']);
  if (status==='confirmed' && sf) { try { await sendWhatsAppText({ telefono: cur.telefono, body: `CARLAB GARANTIAS\n\nCita confirmada: Reporte ${cur.folio||'—'}, Unidad ${cur.numero_economico}. Fecha: ${new Date(sf).toLocaleString('es-MX')}. ¡Te esperamos!` }); } catch {} }
  if (status==='rejected') { try { await sendWhatsAppText({ telefono: cur.telefono, body: `CARLAB GARANTIAS\n\nFecha no disponible para unidad ${cur.numero_economico}. Propón otra: DD/MM/AAAA HH:MM` }); } catch {} }
  const j = await pool.query(`SELECT sr.*,g.folio,g.numero_economico,g.empresa,g.contacto_nombre,g.telefono FROM schedule_requests sr JOIN garantias g ON g.id=sr.garantia_id WHERE sr.id=$1`, [r.rows[0].id]);
  res.json(scheduleSummary(j.rows[0]));
});

// UNITS
app.get('/api/units', authRequired, async (req, res) => {
  const empresa = req.query.empresa||''; let q = 'SELECT * FROM units WHERE activo=TRUE'; const p = [];
  if (req.user.role==='cliente_flota') { p.push(req.user.empresa); q += ` AND empresa=$${p.length}`; }
  else if (empresa) { p.push(empresa); q += ` AND empresa=$${p.length}`; }
  q += ' ORDER BY empresa ASC,numero_economico ASC';
  const units = (await pool.query(q, p)).rows.map(mapUnit);
  if (!units.length) return res.json([]);
  const nums = units.map(u=>u.numeroEconomico);
  const [stats, polizas] = await Promise.all([
    pool.query(`SELECT numero_economico,COUNT(*)::int AS total,COUNT(*) FILTER(WHERE estatus_validacion='nueva')::int AS nuevos,COUNT(*) FILTER(WHERE estatus_operativo NOT IN('terminada','sin iniciar'))::int AS activos FROM garantias WHERE numero_economico=ANY($1) GROUP BY numero_economico`, [nums]),
    pool.query(`SELECT numero_economico,fecha_fin,activa FROM policies WHERE numero_economico=ANY($1) AND activa=TRUE`, [nums]),
  ]);
  const sm = {}; stats.rows.forEach(s=>{sm[s.numero_economico]=s;});
  const pm = {}; polizas.rows.forEach(p=>{if(!pm[p.numero_economico]||new Date(p.fecha_fin)>new Date(pm[p.numero_economico].fecha_fin))pm[p.numero_economico]=p;});
  const now = new Date();
  res.json(units.map(u=>{
    const s=sm[u.numeroEconomico]||{}; const pol=pm[u.numeroEconomico];
    let semaforo='verde'; if(s.nuevos>0)semaforo='rojo'; else if(s.activos>0)semaforo='amarillo';
    let polizaStatus='sin_poliza';
    if(pol){const d=Math.ceil((new Date(pol.fecha_fin)-now)/86400000); polizaStatus=d<0?'vencida':d<=30?'por_vencer':'vigente';}
    return{...u,semaforo,totalReportes:s.total||0,reportesActivos:s.activos||0,reportesNuevos:s.nuevos||0,polizaStatus};
  }));
});
app.get('/api/units/:id', authRequired, async (req, res) => {
  const r = await pool.query('SELECT * FROM units WHERE id=$1', [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  const unit = mapUnit(r.rows[0]);
  if (req.user.role==='cliente_flota' && unit.empresa!==req.user.empresa) return res.status(403).json({ error: 'Acceso denegado.' });
  const [reportes,polizas,movs,campanas] = await Promise.all([
    pool.query('SELECT * FROM garantias WHERE numero_economico=$1 ORDER BY created_at DESC', [unit.numeroEconomico]),
    pool.query('SELECT * FROM policies WHERE unit_id=$1 ORDER BY fecha_fin DESC', [unit.id]),
    pool.query(`SELECT pm.*,p.nombre AS part_nombre FROM part_movements pm LEFT JOIN parts p ON p.id=pm.part_id WHERE pm.unit_numero_economico=$1 ORDER BY pm.created_at DESC LIMIT 30`, [unit.numeroEconomico]),
    pool.query(`SELECT c.nombre,cu.estatus FROM campana_units cu JOIN campanas c ON c.id=cu.campana_id WHERE cu.unit_id=$1`, [unit.id]),
  ]);
  const gastoRefacciones = movs.rows.filter(m=>m.tipo==='salida').reduce((s,m)=>s+parseFloat(m.total||0),0);
  res.json({ unit, reportes: reportes.rows.map(mapGarantia), polizas: polizas.rows.map(mapPoliza), partMovements: movs.rows.map(mapPartMovement), campanas: campanas.rows, gastoRefacciones });
});
app.post('/api/units', authRequired, requireRoles('admin','operativo'), async (req, res) => {
  const { numeroEconomico,marca,modelo,anio,empresa,placas,vin,color,capacidad,kilometraje,notas } = req.body;
  if (!numeroEconomico||!marca||!modelo||!empresa) return res.status(400).json({ error: 'Número económico, marca, modelo y empresa son obligatorios.' });
  if ((await pool.query('SELECT id FROM units WHERE numero_economico=$1 AND empresa=$2 AND activo=TRUE',[numeroEconomico,empresa])).rowCount) return res.status(400).json({ error: 'Esa unidad ya existe para esa empresa.' });
  const r = await pool.query(`INSERT INTO units(id,numero_economico,marca,modelo,anio,empresa,placas,vin,color,capacidad,kilometraje,notas,activo,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,NOW()) RETURNING *`,
    [cryptoRandomId(),numeroEconomico,marca,modelo,anio||null,empresa,placas||'',vin||'',color||'',capacidad||'',parseInt(kilometraje)||0,notas||'']);
  res.status(201).json(mapUnit(r.rows[0]));
});
app.patch('/api/units/:id', authRequired, requireRoles('admin','operativo'), async (req, res) => {
  const cur = await pool.query('SELECT * FROM units WHERE id=$1', [req.params.id]);
  if (!cur.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  const { numeroEconomico,marca,modelo,anio,empresa,placas,vin,color,capacidad,kilometraje,estatus,notas } = req.body;
  if (!numeroEconomico||!marca||!modelo||!empresa) return res.status(400).json({ error: 'Campos obligatorios faltantes.' });
  if ((await pool.query('SELECT id FROM units WHERE numero_economico=$1 AND empresa=$2 AND id<>$3 AND activo=TRUE',[numeroEconomico,empresa,req.params.id])).rowCount) return res.status(400).json({ error: 'Ya existe otra unidad con ese número en esa empresa.' });
  const r = await pool.query(`UPDATE units SET numero_economico=$2,marca=$3,modelo=$4,anio=$5,empresa=$6,placas=$7,vin=$8,color=$9,capacidad=$10,kilometraje=$11,estatus=$12,notas=$13,updated_at=NOW() WHERE id=$1 RETURNING *`,
    [req.params.id,numeroEconomico,marca,modelo,anio||null,empresa,placas||'',vin||'',color||'',capacidad||'',parseInt(kilometraje)||0,estatus||'activo',notas||'']);
  res.json(mapUnit(r.rows[0]));
});
app.delete('/api/units/:id', authRequired, requireRoles('admin'), async (req, res) => { await pool.query('UPDATE units SET activo=FALSE,updated_at=NOW() WHERE id=$1', [req.params.id]); res.json({ ok: true }); });

// POLICIES
app.get('/api/policies', authRequired, async (req, res) => {
  const { unitId,empresa } = req.query; let q='SELECT * FROM policies WHERE 1=1'; const p=[];
  if (req.user.role==='cliente_flota') { p.push(req.user.empresa); q+=` AND empresa=$${p.length}`; }
  else if (empresa) { p.push(empresa); q+=` AND empresa=$${p.length}`; }
  if (unitId) { p.push(unitId); q+=` AND unit_id=$${p.length}`; }
  q+=' ORDER BY fecha_fin DESC';
  res.json((await pool.query(q,p)).rows.map(mapPoliza));
});
app.post('/api/policies', authRequired, requireRoles('admin','operativo'), async (req, res) => {
  const { unitId,numeroEconomico,empresa,tipoPoliza,proveedor,numeroPoliza,fechaInicio,fechaFin,monto,coberturas,notas } = req.body;
  if (!unitId||!numeroEconomico||!empresa||!tipoPoliza||!fechaInicio||!fechaFin) return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  const r = await pool.query(`INSERT INTO policies(id,unit_id,numero_economico,empresa,tipo_poliza,proveedor,numero_poliza,fecha_inicio,fecha_fin,monto,coberturas,notas,activa) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE) RETURNING *`,
    [cryptoRandomId(),unitId,numeroEconomico,empresa,tipoPoliza,proveedor||'',numeroPoliza||'',fechaInicio,fechaFin,parseFloat(monto)||0,coberturas||'',notas||'']);
  res.status(201).json(mapPoliza(r.rows[0]));
});
app.patch('/api/policies/:id', authRequired, requireRoles('admin','operativo'), async (req, res) => {
  const { tipoPoliza,proveedor,numeroPoliza,fechaInicio,fechaFin,monto,coberturas,notas,activa } = req.body;
  const r = await pool.query(`UPDATE policies SET tipo_poliza=$2,proveedor=$3,numero_poliza=$4,fecha_inicio=$5,fecha_fin=$6,monto=$7,coberturas=$8,notas=$9,activa=$10 WHERE id=$1 RETURNING *`,
    [req.params.id,tipoPoliza,proveedor||'',numeroPoliza||'',fechaInicio,fechaFin,parseFloat(monto)||0,coberturas||'',notas||'',activa!==false]);
  if (!r.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  res.json(mapPoliza(r.rows[0]));
});
app.delete('/api/policies/:id', authRequired, requireRoles('admin'), async (req, res) => { await pool.query('DELETE FROM policies WHERE id=$1', [req.params.id]); res.json({ ok: true }); });
app.post('/api/policies/check-alerts', authRequired, requireRoles('admin'), async (req, res) => {
  const r = await pool.query(`SELECT p.*,comp.telefono AS tel FROM policies p LEFT JOIN companies comp ON comp.nombre=p.empresa WHERE p.activa=TRUE AND p.fecha_fin BETWEEN NOW() AND NOW()+INTERVAL '30 days'`);
  let sent = 0;
  for (const pol of r.rows) {
    const dias = Math.ceil((new Date(pol.fecha_fin) - new Date()) / 86400000);
    if (pol.tel) { await notifyPolizaVence(pol.numero_economico, dias, pol.tel); sent++; }
  }
  res.json({ ok: true, alertsEnviadas: sent });
});

// PARTS
app.get('/api/parts', authRequired, requireRoles('admin','operativo','supervisor'), async (_req,res) => { res.json((await pool.query('SELECT * FROM parts WHERE activo=TRUE ORDER BY nombre')).rows.map(mapPart)); });
app.post('/api/parts', authRequired, requireRoles('admin','operativo'), async (req, res) => {
  const { nombre,numeroParte,marca,descripcion,precioUnitario,stockActual,stockMinimo,ubicacion,compatibilidad } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre obligatorio.' });
  const r = await pool.query(`INSERT INTO parts(id,nombre,numero_parte,marca,descripcion,precio_unitario,stock_actual,stock_minimo,ubicacion,compatibilidad,activo,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,NOW()) RETURNING *`,
    [cryptoRandomId(),nombre,numeroParte||'',marca||'',descripcion||'',parseFloat(precioUnitario)||0,parseInt(stockActual)||0,parseInt(stockMinimo)||0,ubicacion||'',compatibilidad||'']);
  res.status(201).json(mapPart(r.rows[0]));
});
app.patch('/api/parts/:id', authRequired, requireRoles('admin','operativo'), async (req, res) => {
  const { nombre,numeroParte,marca,descripcion,precioUnitario,stockMinimo,ubicacion,compatibilidad } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre obligatorio.' });
  const r = await pool.query(`UPDATE parts SET nombre=$2,numero_parte=$3,marca=$4,descripcion=$5,precio_unitario=$6,stock_minimo=$7,ubicacion=$8,compatibilidad=$9,updated_at=NOW() WHERE id=$1 RETURNING *`,
    [req.params.id,nombre,numeroParte||'',marca||'',descripcion||'',parseFloat(precioUnitario)||0,parseInt(stockMinimo)||0,ubicacion||'',compatibilidad||'']);
  if (!r.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  res.json(mapPart(r.rows[0]));
});
app.delete('/api/parts/:id', authRequired, requireRoles('admin'), async (req,res) => { await pool.query('UPDATE parts SET activo=FALSE WHERE id=$1', [req.params.id]); res.json({ ok: true }); });
app.get('/api/parts/low-stock', authRequired, requireRoles('admin','operativo'), async (_req,res) => { res.json((await pool.query('SELECT * FROM parts WHERE activo=TRUE AND stock_actual<=stock_minimo ORDER BY nombre')).rows.map(mapPart)); });
app.get('/api/parts/:id/movements', authRequired, requireRoles('admin','operativo','supervisor'), async (req,res) => {
  res.json((await pool.query('SELECT pm.*,p.nombre AS part_nombre FROM part_movements pm LEFT JOIN parts p ON p.id=pm.part_id WHERE pm.part_id=$1 ORDER BY pm.created_at DESC', [req.params.id])).rows.map(mapPartMovement));
});
app.post('/api/parts/:id/movements', authRequired, requireRoles('admin','operativo'), async (req, res) => {
  const { tipo,cantidad,precioUnitario,garantiaId,garantiaFolio,unitNumeroEconomico,notas } = req.body;
  if (!tipo||!cantidad) return res.status(400).json({ error: 'Tipo y cantidad requeridos.' });
  const p = await pool.query('SELECT * FROM parts WHERE id=$1 AND activo=TRUE', [req.params.id]);
  if (!p.rowCount) return res.status(404).json({ error: 'Refacción no encontrada.' });
  const part = p.rows[0]; const qty = parseInt(cantidad); const price = parseFloat(precioUnitario)||part.precio_unitario;
  let newStock = part.stock_actual;
  if (tipo==='entrada') newStock+=qty;
  else if (tipo==='salida') { if (part.stock_actual < qty) return res.status(400).json({ error: `Stock insuficiente. Disponible: ${part.stock_actual}` }); newStock-=qty; }
  else newStock=qty;
  await pool.query('UPDATE parts SET stock_actual=$1,updated_at=NOW() WHERE id=$2', [newStock,req.params.id]);
  const r = await pool.query(`INSERT INTO part_movements(id,part_id,part_nombre,tipo,cantidad,precio_unitario,total,garantia_id,garantia_folio,unit_numero_economico,notas,realizado_por_id,realizado_por_nombre) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [cryptoRandomId(),req.params.id,part.nombre,tipo,qty,price,price*qty,garantiaId||null,garantiaFolio||'',unitNumeroEconomico||'',notas||'',req.user.id,req.user.nombre]);
  res.status(201).json(mapPartMovement(r.rows[0]));
});

// CAMPANAS
app.get('/api/campanas', authRequired, requireRoles('admin','operativo','supervisor'), async (_req,res) => { res.json((await pool.query('SELECT * FROM campanas ORDER BY created_at DESC')).rows.map(mapCampana)); });
app.post('/api/campanas', authRequired, requireRoles('admin'), async (req, res) => {
  const { nombre,descripcion,tipo,marcas,empresas,fechaInicio,fechaFin,notas } = req.body;
  if (!nombre||!tipo) return res.status(400).json({ error: 'Nombre y tipo obligatorios.' });
  const r = await pool.query(`INSERT INTO campanas(id,nombre,descripcion,tipo,marcas,empresas,fecha_inicio,fecha_fin,notas,creado_por_id,creado_por_nombre,updated_at) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,NOW()) RETURNING *`,
    [cryptoRandomId(),nombre,descripcion||'',tipo,JSON.stringify(marcas||[]),JSON.stringify(empresas||[]),fechaInicio||null,fechaFin||null,notas||'',req.user.id,req.user.nombre]);
  const c = r.rows[0];
  if ((marcas?.length)||(empresas?.length)) {
    let uq='SELECT * FROM units WHERE activo=TRUE'; const up=[];
    if (marcas?.length) { up.push(marcas); uq+=` AND marca=ANY($${up.length})`; }
    if (empresas?.length) { up.push(empresas); uq+=` AND empresa=ANY($${up.length})`; }
    const us = await pool.query(uq, up);
    for (const u of us.rows) { try { await pool.query(`INSERT INTO campana_units(id,campana_id,unit_id,numero_economico,empresa) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [cryptoRandomId(),c.id,u.id,u.numero_economico,u.empresa]); } catch {} }
  }
  res.status(201).json(mapCampana(c));
});
app.get('/api/campanas/:id/units', authRequired, requireRoles('admin','operativo','supervisor'), async (req,res) => {
  const r = await pool.query(`SELECT cu.*,u.marca,u.modelo,u.anio FROM campana_units cu LEFT JOIN units u ON u.id=cu.unit_id WHERE cu.campana_id=$1 ORDER BY cu.empresa,cu.numero_economico`, [req.params.id]);
  res.json(r.rows);
});
app.patch('/api/campanas/:id/units/:uid', authRequired, requireRoles('admin','operativo'), async (req,res) => {
  const r = await pool.query(`UPDATE campana_units SET estatus=$1,notas=$2 WHERE campana_id=$3 AND unit_id=$4 RETURNING *`, [req.body.estatus||'pendiente',req.body.notas||'',req.params.id,req.params.uid]);
  res.json(r.rows[0]);
});
app.post('/api/campanas/:id/notify', authRequired, requireRoles('admin'), async (req,res) => {
  const c = await pool.query('SELECT * FROM campanas WHERE id=$1', [req.params.id]);
  if (!c.rowCount) return res.status(404).json({ error: 'No encontrada.' });
  const units = await pool.query(`SELECT cu.*,comp.telefono AS tel FROM campana_units cu LEFT JOIN companies comp ON comp.nombre=cu.empresa WHERE cu.campana_id=$1 AND cu.notificado=FALSE`, [req.params.id]);
  let sent = 0;
  for (const u of units.rows) { if (u.tel) { await notifyCampana(u.numero_economico,u.empresa,c.rows[0].nombre,u.tel); await pool.query('UPDATE campana_units SET notificado=TRUE WHERE id=$1',[u.id]); sent++; } }
  res.json({ ok: true, notificadas: sent });
});

// ANALYTICS
app.get('/api/analytics', authRequired, requireRoles('admin','operativo','supervisor'), async (req, res) => {
  const empresa = req.query.empresa||''; const p=[]; let w='';
  if (empresa) { p.push(empresa); w=`WHERE empresa=$${p.length}`; }
  const [byStatus,byMonth,byEmpresa,byMarca,byTipo,repeatUnits,costoRef,stockTotal,unitsCount] = await Promise.all([
    pool.query(`SELECT estatus_validacion,COUNT(*)::int AS count FROM garantias ${w} GROUP BY estatus_validacion ORDER BY count DESC`, p),
    pool.query(`SELECT TO_CHAR(DATE_TRUNC('month',created_at),'YYYY-MM') AS mes,COUNT(*)::int AS count FROM garantias ${w} GROUP BY mes ORDER BY mes DESC LIMIT 12`, p),
    pool.query(`SELECT empresa,COUNT(*)::int AS count FROM garantias ${w} GROUP BY empresa ORDER BY count DESC LIMIT 10`, p),
    pool.query(`SELECT modelo,COUNT(*)::int AS count FROM garantias ${w} GROUP BY modelo ORDER BY count DESC LIMIT 10`, p),
    pool.query(`SELECT tipo_incidente,COUNT(*)::int AS count FROM garantias ${w} GROUP BY tipo_incidente ORDER BY count DESC`, p),
    pool.query(`SELECT numero_economico,empresa,COUNT(*)::int AS count FROM garantias ${w} GROUP BY numero_economico,empresa HAVING COUNT(*)>1 ORDER BY count DESC LIMIT 10`, p),
    pool.query(`SELECT COALESCE(SUM(total),0)::numeric AS total FROM part_movements WHERE tipo='salida'`),
    pool.query(`SELECT COALESCE(SUM(stock_actual*precio_unitario),0)::numeric AS total FROM parts WHERE activo=TRUE`),
    pool.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE estatus='activo')::int AS activos,COUNT(*) FILTER(WHERE estatus='en taller')::int AS en_taller FROM units WHERE activo=TRUE`),
  ]);
  res.json({ byStatus:byStatus.rows, byMonth:byMonth.rows, byEmpresa:byEmpresa.rows, byMarca:byMarca.rows, byTipo:byTipo.rows, repeatUnits:repeatUnits.rows, costoRefacciones:parseFloat(costoRef.rows[0]?.total||0), valorInventario:parseFloat(stockTotal.rows[0]?.total||0), unitsStats:unitsCount.rows[0] });
});

// NOTIFICATIONS
app.get('/api/notifications', authRequired, async (req, res) => {
  const p=[]; const wg=[]; const ws=[];
  if (['supervisor','cliente_flota'].includes(req.user.role)) { p.push(req.user.empresa||''); wg.push(`g.empresa=$${p.length}`); ws.push(`g.empresa=$${p.length}`); }
  if (req.user.role==='operador') { p.push(req.user.id); wg.push(`g.reportado_por_id=$${p.length}`); ws.push(`g.reportado_por_id=$${p.length}`); }
  const isAdmin = ['admin','operativo'].includes(req.user.role);
  const [nr,ps,ts,ls,ep] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM garantias g ${wg.length?`WHERE ${wg.join(' AND ')} AND g.estatus_validacion='nueva'`:`WHERE g.estatus_validacion='nueva'`}`, p),
    pool.query(`SELECT COUNT(*)::int AS c FROM schedule_requests sr JOIN garantias g ON g.id=sr.garantia_id ${ws.length?`WHERE ${ws.join(' AND ')} AND sr.status IN('waiting_operator','proposed')`:`WHERE sr.status IN('waiting_operator','proposed')`}`, p),
    pool.query(`SELECT COUNT(*)::int AS c FROM schedule_requests sr JOIN garantias g ON g.id=sr.garantia_id ${ws.length?`WHERE ${ws.join(' AND ')} AND DATE(sr.scheduled_for AT TIME ZONE 'UTC')=CURRENT_DATE`:`WHERE DATE(sr.scheduled_for AT TIME ZONE 'UTC')=CURRENT_DATE`}`, p),
    isAdmin ? pool.query(`SELECT COUNT(*)::int AS c FROM parts WHERE activo=TRUE AND stock_actual<=stock_minimo`) : Promise.resolve({rows:[{c:0}]}),
    isAdmin ? pool.query(`SELECT COUNT(*)::int AS c FROM policies WHERE activa=TRUE AND fecha_fin BETWEEN NOW() AND NOW()+INTERVAL '30 days'`) : Promise.resolve({rows:[{c:0}]}),
  ]);
  res.json({ newReports:nr.rows[0]?.c||0, pendingSchedules:ps.rows[0]?.c||0, todaySchedules:ts.rows[0]?.c||0, lowStock:ls.rows[0]?.c||0, expiringPolicies:ep.rows[0]?.c||0 });
});

// WHATSAPP
app.post('/api/whatsapp/incoming', async (req, res) => {
  const from = String(req.body.From||'').replace(/^whatsapp:/i,'').replace(/\D/g,'');
  const body = String(req.body.Body||'').trim();
  if (!from||!body) return res.type('text/xml').send('<Response></Response>');
  const pending = await pool.query(`SELECT sr.*,g.id AS gid,g.folio,g.numero_economico,g.empresa,g.telefono FROM schedule_requests sr JOIN garantias g ON g.id=sr.garantia_id WHERE sr.telefono=$1 AND sr.status IN('waiting_operator','rejected') ORDER BY sr.updated_at DESC LIMIT 1`, [normalizeMxPhone(from)]);
  if (!pending.rowCount) return res.type('text/xml').send('<Response></Response>');
  const parsed = parseScheduleText(body);
  if (!parsed) { try { await sendWhatsAppText({ telefono: from, body: 'CARLAB GARANTIAS\n\nFormato no reconocido. Usa: DD/MM/AAAA HH:MM — Ej: 28/05/2026 09:30' }); } catch {} return res.type('text/xml').send('<Response></Response>'); }
  const s = pending.rows[0];
  await pool.query(`UPDATE schedule_requests SET status='proposed',proposed_at=$2,scheduled_for=$2,notes=$3,updated_at=NOW() WHERE id=$1`, [s.id,parsed.iso,`Propuesta WA: ${parsed.text}`]);
  await addAuditLog(s.gid, null, 'propuesta_programacion', `Propuso ${parsed.text} por WA`);
  try { await sendWhatsAppText({ telefono: from, body: `CARLAB GARANTIAS\n\nRecibimos tu propuesta para ${s.folio||'—'} / Unidad ${s.numero_economico}: ${parsed.text}. Te confirmamos en breve.` }); } catch {}
  res.type('text/xml').send('<Response></Response>');
});
app.post('/webhook/whatsapp', (req, res) => { req.url='/api/whatsapp/incoming'; return app._router.handle(req, res, ()=>{}); });
app.post('/api/whatsapp/status', (req, res) => { console.log('WA status:', req.body.MessageSid, req.body.MessageStatus); res.json({ ok: true }); });

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initDb().then(() => app.listen(PORT, () => console.log(`CARLAB CLOUD V4 :${PORT}`))).catch(e => { console.error(e); process.exit(1); });
