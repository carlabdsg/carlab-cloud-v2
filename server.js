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


process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});


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

function computeCommercialTotals(items = [], discount = 0, iva = 0, anticipo = 0) {
  const subtotal = Number(items.reduce((sum, item) => sum + Number(item.total || (Number(item.qty || 0) * Number(item.unitPrice || item.unit_price || 0)) || 0), 0).toFixed(2));
  const safeDiscount = Math.max(0, Number(discount || 0));
  const base = Math.max(0, subtotal - safeDiscount);
  const ivaPercent = Math.max(0, Number(iva || 0));
  const ivaAmount = Number((base * (ivaPercent / 100)).toFixed(2));
  const total = Number((base + ivaAmount).toFixed(2));
  const safeAnticipo = Math.max(0, Number(anticipo || 0));
  const saldo = Number(Math.max(0, total - safeAnticipo).toFixed(2));
  return { subtotal, discount: Number(safeDiscount.toFixed(2)), iva: ivaPercent, ivaAmount, total, anticipo: Number(safeAnticipo.toFixed(2)), saldo };
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
    reportesCount: Number(row.reportes_count || 0),
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


function mapStockPart(row) {
  return {
    id: row.id,
    nombre: row.nombre || '',
    sku: row.sku || '',
    proveedor: row.proveedor || '',
    stockActual: Number(row.stock_actual || 0),
    stockMinimo: Number(row.stock_minimo || 0),
    costoUnitario: Number(row.costo_unitario || 0),
    precioVenta: Number(row.precio_venta || 0),
    ubicacion: row.ubicacion || '',
    notas: row.notas || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    movimientos: Number(row.movimientos || 0),
    ultimoMovimientoAt: row.ultimo_movimiento_at || null
  };
}

function mapStockMovement(row) {
  return {
    id: row.id,
    stockPartId: row.stock_part_id,
    tipo: row.tipo,
    cantidad: Number(row.cantidad || 0),
    unidad: row.unidad || '',
    empresa: row.empresa || '',
    garantiaFolio: row.garantia_folio || '',
    notas: row.notas || '',
    createdAt: row.created_at,
    partName: row.nombre || '',
    sku: row.sku || ''
  };
}

function mapWorkQuote(row) {
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    id: row.id,
    folio: row.folio || '',
    garantiaId: row.garantia_id || '',
    companyName: row.company_name || '',
    unitNumber: row.unit_number || '',
    clientName: row.client_name || '',
    clientPhone: row.client_phone || '',
    status: row.status || 'borrador',
    paymentStatus: row.payment_status || 'pendiente_pago',
    subtotal: Number(row.subtotal || 0),
    discount: Number(row.discount || 0),
    iva: Number(row.iva || 0),
    total: Number(row.total || 0),
    anticipo: Number(row.anticipo || 0),
    saldo: Number(row.saldo || 0),
    notes: row.notes || '',
    paymentMethod: row.payment_method || '',
    paymentReference: row.payment_reference || '',
    dueAt: row.due_at || null,
    sentAt: row.sent_at || null,
    approvedAt: row.approved_at || null,
    paidAt: row.paid_at || null,
    createdBy: row.created_by || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    reportFolio: row.report_folio || '',
    reportDescription: row.report_description || '',
    reportValidation: row.report_validation || '',
    reportOperational: row.report_operational || '',
    items: items.map(item => ({
      id: item.id,
      quoteId: item.quote_id || row.id,
      type: item.type || 'extra',
      description: item.description || '',
      qty: Number(item.qty || 0),
      unitPrice: Number(item.unit_price || item.unitPrice || 0),
      total: Number(item.total || 0),
      stockPartId: item.stock_part_id || item.stockPartId || '',
      stockPartName: item.stock_part_name || item.stockPartName || '',
      createdAt: item.created_at || null,
    })),
  };
}

function mapDirectSale(row) {
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    id: row.id,
    folio: row.folio || '',
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    companyName: row.company_name || '',
    unitNumber: row.unit_number || '',
    status: row.status || 'cerrada',
    paymentStatus: row.payment_status || 'pendiente',
    subtotal: Number(row.subtotal || 0),
    total: Number(row.total || 0),
    notes: row.notes || '',
    paymentMethod: row.payment_method || '',
    paymentReference: row.payment_reference || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    items: items.map(item => ({
      id: item.id,
      saleId: item.sale_id || row.id,
      stockPartId: item.stock_part_id || '',
      description: item.description || '',
      qty: Number(item.qty || 0),
      unitPrice: Number(item.unit_price || item.unitPrice || 0),
      total: Number(item.total || 0),
      stockPartName: item.stock_part_name || '',
      createdAt: item.created_at || null,
    })),
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

async function nextManagedFolio(kind) {
  const map = {
    quote: { table: 'work_quotes', prefix: 'COB' },
    sale: { table: 'direct_sales', prefix: 'VTA' },
  };
  const cfg = map[kind];
  if (!cfg) throw new Error('Tipo de folio no soportado.');
  const result = await pool.query(`SELECT COUNT(*)::int AS total FROM ${cfg.table}`);
  const next = (result.rows[0]?.total || 0) + 1;
  return `${cfg.prefix}-${String(next).padStart(5, '0')}`;
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
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
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
    ALTER TABLE schedule_requests ADD COLUMN IF NOT EXISTS empresa TEXT;
    ALTER TABLE schedule_requests ADD COLUMN IF NOT EXISTS numero_economico TEXT;
    ALTER TABLE schedule_requests ADD COLUMN IF NOT EXISTS contacto_nombre TEXT;
    ALTER TABLE schedule_requests ADD COLUMN IF NOT EXISTS folio_manual TEXT;
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
    CREATE INDEX IF NOT EXISTS idx_garantias_refacciones_pendientes ON garantias (empresa, refaccion_status, created_at) WHERE solicita_refaccion = TRUE;
    CREATE TABLE IF NOT EXISTS parts_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa TEXT NOT NULL,
      numero_economico TEXT,
      solicitud TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendiente',
      requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      evidence_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_parts (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      sku TEXT,
      proveedor TEXT,
      stock_actual NUMERIC(12,2) NOT NULL DEFAULT 0,
      stock_minimo NUMERIC(12,2) NOT NULL DEFAULT 0,
      costo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
      precio_venta NUMERIC(12,2) NOT NULL DEFAULT 0,
      ubicacion TEXT,
      notas TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      stock_part_id TEXT NOT NULL REFERENCES stock_parts(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida_unidad','venta_directa','ajuste')),
      cantidad NUMERIC(12,2) NOT NULL DEFAULT 0,
      unidad TEXT,
      empresa TEXT,
      garantia_folio TEXT,
      notas TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS work_quotes (
      id TEXT PRIMARY KEY,
      folio TEXT NOT NULL UNIQUE,
      garantia_id TEXT,
      company_name TEXT,
      unit_number TEXT,
      client_name TEXT,
      client_phone TEXT,
      status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','enviada','pendiente_autorizacion','autorizada','rechazada','cancelada')),
      payment_status TEXT NOT NULL DEFAULT 'pendiente_pago' CHECK (payment_status IN ('pendiente_pago','anticipo_recibido','pago_parcial','pagada','cancelada')),
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount NUMERIC(12,2) NOT NULL DEFAULT 0,
      iva NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      anticipo NUMERIC(12,2) NOT NULL DEFAULT 0,
      saldo NUMERIC(12,2) NOT NULL DEFAULT 0,
      notes TEXT,
      payment_method TEXT,
      payment_reference TEXT,
      due_at DATE,
      sent_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS work_quote_items (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL REFERENCES work_quotes(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('mano_obra','refaccion','extra')),
      description TEXT NOT NULL,
      qty NUMERIC(12,2) NOT NULL DEFAULT 1,
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      stock_part_id TEXT REFERENCES stock_parts(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS direct_sales (
      id TEXT PRIMARY KEY,
      folio TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      company_name TEXT,
      unit_number TEXT,
      status TEXT NOT NULL DEFAULT 'cerrada' CHECK (status IN ('borrador','cerrada','cancelada')),
      payment_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (payment_status IN ('pendiente','pagado_parcial','pagada','cancelada')),
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      notes TEXT,
      payment_method TEXT,
      payment_reference TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS direct_sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES direct_sales(id) ON DELETE CASCADE,
      stock_part_id TEXT REFERENCES stock_parts(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      qty NUMERIC(12,2) NOT NULL DEFAULT 1,
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE parts_requests ADD COLUMN IF NOT EXISTS evidence_photos JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE INDEX IF NOT EXISTS idx_parts_requests_empresa ON parts_requests(empresa);
    CREATE INDEX IF NOT EXISTS idx_parts_requests_status ON parts_requests(status);
    CREATE INDEX IF NOT EXISTS idx_parts_requests_updated_at ON parts_requests(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stock_parts_nombre ON stock_parts(LOWER(nombre));
    CREATE INDEX IF NOT EXISTS idx_stock_parts_sku ON stock_parts(sku);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_part ON stock_movements(stock_part_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);
    ALTER TABLE work_quotes DROP CONSTRAINT IF EXISTS work_quotes_garantia_id_fkey;
    ALTER TABLE work_quotes ALTER COLUMN garantia_id TYPE TEXT USING garantia_id::TEXT;
    CREATE INDEX IF NOT EXISTS idx_work_quotes_garantia ON work_quotes(garantia_id);
    CREATE INDEX IF NOT EXISTS idx_work_quotes_status ON work_quotes(status, payment_status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_work_quote_items_quote ON work_quote_items(quote_id);
    CREATE INDEX IF NOT EXISTS idx_direct_sales_status ON direct_sales(status, payment_status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_direct_sale_items_sale ON direct_sale_items(sale_id);
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


app.patch('/api/garantias/:id', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const body = req.body || {};
    const payload = {
      numeroObra: String(body.numeroObra || '').trim(),
      modelo: String(body.modelo || '').trim(),
      numeroEconomico: String(body.numeroEconomico || '').trim(),
      empresa: String(body.empresa || '').trim(),
      kilometraje: String(body.kilometraje || '').trim(),
      contactoNombre: String(body.contactoNombre || '').trim(),
      telefono: normalizeMxPhone(body.telefono || ''),
      tipoIncidente: String(body.tipoIncidente || '').trim(),
      descripcionFallo: String(body.descripcionFallo || '').trim(),
      solicitaRefaccion: !!body.solicitaRefaccion,
      detalleRefaccion: String(body.detalleRefaccion || '').trim(),
      evidencias: Array.isArray(body.evidencias) ? body.evidencias : [],
      evidenciasRefaccion: Array.isArray(body.evidenciasRefaccion) ? body.evidenciasRefaccion : [],
      firma: String(body.firma || '').trim()
    };
    const required = [payload.numeroObra, payload.modelo, payload.numeroEconomico, payload.empresa, payload.tipoIncidente, payload.descripcionFallo];
    if (required.some(v => !v)) {
      return res.status(400).json({ error: 'Faltan campos obligatorios del reporte.' });
    }

    const current = await pool.query('SELECT * FROM garantias WHERE id = $1', [req.params.id]);
    if (!current.rowCount) return res.status(404).json({ error: 'Reporte no encontrado.' });

    const result = await pool.query(
      `UPDATE garantias SET
        numero_obra = $2,
        modelo = $3,
        numero_economico = $4,
        empresa = $5,
        kilometraje = $6,
        contacto_nombre = $7,
        telefono = $8,
        tipo_incidente = $9,
        descripcion_fallo = $10,
        solicita_refaccion = $11,
        detalle_refaccion = $12,
        evidencias = $13::jsonb,
        evidencias_refaccion = $14::jsonb,
        firma = $15,
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        payload.numeroObra,
        payload.modelo,
        payload.numeroEconomico,
        payload.empresa,
        payload.kilometraje,
        payload.contactoNombre,
        payload.telefono,
        payload.tipoIncidente,
        payload.descripcionFallo,
        payload.solicitaRefaccion,
        payload.detalleRefaccion,
        JSON.stringify(payload.evidencias || []),
        JSON.stringify(payload.evidenciasRefaccion || []),
        payload.firma
      ]
    );

    await addAuditLog(req.params.id, req.user.id, 'editar_reporte', `${req.user.nombre} editó el reporte ${result.rows[0].folio || ''}`.trim());
    res.json(mapGarantia(result.rows[0]));
  } catch (error) {
    console.error('Error actualizando reporte:', error);
    res.status(500).json({ error: 'No se pudo actualizar el reporte.' });
  }
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
  try {
    const date = String(req.query.date || '').trim();
    const params = [];
    let where = [];
    if (date) {
      params.push(date);
      where.push(`DATE(sr.scheduled_for AT TIME ZONE 'UTC') = $${params.length}`);
    }
    if (SUPERVISOR_ROLES.includes(req.user.role)) {
      params.push(req.user.empresa || '');
      where.push(`COALESCE(g.empresa, sr.empresa) = $${params.length}`);
    }
    if (req.user.role === 'operador') {
      params.push(req.user.id);
      where.push(`g.reportado_por_id = $${params.length}`);
    }
    const result = await pool.query(`
      SELECT sr.*,
        COALESCE(g.folio, sr.folio_manual) AS folio,
        COALESCE(g.numero_economico, sr.numero_economico) AS numero_economico,
        COALESCE(g.empresa, sr.empresa) AS empresa,
        COALESCE(g.contacto_nombre, sr.contacto_nombre) AS contacto_nombre,
        COALESCE(g.telefono, sr.telefono) AS telefono
      FROM schedule_requests sr
      LEFT JOIN garantias g ON g.id = sr.garantia_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY COALESCE(sr.scheduled_for, sr.proposed_at, sr.requested_at) ASC
    `, params);
    res.json(result.rows.map(scheduleSummary));
  } catch (error) {
    console.error('Error leyendo agenda:', error);
    res.status(500).json({ error: 'No se pudo cargar la agenda.' });
  }
});

app.post('/api/schedules/manual', authRequired, requireRoles('admin','operativo'), async (req, res) => {
  const empresa = String(req.body.empresa || '').trim();
  const unidad = String(req.body.unidad || '').trim();
  const telefono = normalizeMxPhone(req.body.telefono || '');
  const folioManual = String(req.body.folio || '').trim();
  const contactoNombre = String(req.body.contactoNombre || '').trim();
  const scheduledFor = req.body.scheduledFor ? new Date(req.body.scheduledFor) : null;
  const notes = String(req.body.notes || '').trim();
  if (!empresa || !unidad || !scheduledFor || Number.isNaN(scheduledFor.getTime())) return res.status(400).json({ error: 'Completa empresa, unidad y fecha válida.' });
  const result = await pool.query(`
    INSERT INTO schedule_requests (id, garantia_id, telefono, status, notes, scheduled_for, confirmed_at, empresa, numero_economico, contacto_nombre, folio_manual)
    VALUES ($1,NULL,$2,'confirmed',$3,$4,NOW(),$5,$6,$7,$8)
    RETURNING *
  `, [cryptoRandomId(), telefono, notes, scheduledFor.toISOString(), empresa, unidad, contactoNombre, folioManual]);
  res.status(201).json(scheduleSummary(result.rows[0]));
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
  const joined = await pool.query(`SELECT sr.*, g.folio, g.numero_economico, g.empresa, g.contacto_nombre FROM schedule_requests sr LEFT JOIN garantias g ON g.id = sr.garantia_id WHERE sr.id = $1`, [schedule.id]);
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
  const monto = Number(req.body.monto);
  const garantiaId = String(req.body.garantiaId || '').trim() || null;
  if (!['refaccion','mano_obra'].includes(tipo) || Number.isNaN(monto) || monto < 0) return res.status(400).json({ error: 'Costo inválido.' });
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
      `COALESCE(refaccion_status, 'pendiente') <> 'instalada'`,
      `COALESCE(estatus_operativo, 'sin iniciar') <> 'terminada'`
    ];
    if (req.user.role === 'supervisor_flotas') {
      params.push(req.user.empresa || '');
      where.push(`empresa = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT
         id, folio, numero_obra, modelo, numero_economico, empresa,
         detalle_refaccion, refaccion_status, refaccion_asignada, evidencias_refaccion,
         estatus_operativo, created_at, updated_at, refaccion_updated_at
       FROM garantias
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(refaccion_updated_at, updated_at, created_at) DESC`,
      params
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      folio: row.folio || '',
      numeroObra: row.numero_obra || '',
      modelo: row.modelo || '',
      numeroEconomico: row.numero_economico || '',
      empresa: row.empresa || '',
      detalleRefaccion: row.detalle_refaccion || '',
      refaccionStatus: row.refaccion_status || 'pendiente',
      refaccionAsignada: row.refaccion_asignada || '',
      estatusOperativo: row.estatus_operativo || 'sin iniciar',
      evidenciasRefaccion: row.evidencias_refaccion || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      refaccionUpdatedAt: row.refaccion_updated_at
    })));
  } catch (error) {
    console.error('Error cargando refacciones pendientes:', error);
    res.status(500).json({ error: 'No se pudieron cargar las refacciones pendientes.' });
  }
});

app.patch('/api/garantias/:id/parts', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const detalleRefaccion = String(req.body.detalleRefaccion || '').trim();
    const refaccionStatus = String(req.body.refaccionStatus || 'pendiente').trim();
    const refaccionAsignada = String(req.body.refaccionAsignada || '').trim();
    const evidenciasRefaccion = Array.isArray(req.body.evidenciasRefaccion) ? req.body.evidenciasRefaccion.filter(Boolean) : null;

    if (!['pendiente','asignada','en_compra','recibida','instalada'].includes(refaccionStatus)) {
      return res.status(400).json({ error: 'Estado de refacción inválido.' });
    }

    const result = await pool.query(
      `UPDATE garantias
       SET detalle_refaccion = $2,
           refaccion_status = $3,
           refaccion_asignada = $4,
           evidencias_refaccion = COALESCE($5::jsonb, evidencias_refaccion),
           refaccion_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, detalleRefaccion, refaccionStatus, refaccionAsignada, evidenciasRefaccion ? JSON.stringify(evidenciasRefaccion) : null]
    );

    if (!result.rowCount) return res.status(404).json({ error: 'Garantía no encontrada.' });
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


app.get('/api/fleet/units/:id/costs', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, tipo, concepto, monto, created_at
       FROM fleet_cost_entries
       WHERE fleet_unit_id = $1
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error leyendo costos de unidad:', error);
    res.status(500).json({ error: 'No se pudieron leer los costos.' });
  }
});

app.patch('/api/fleet/costs/:id', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const tipo = String(req.body.tipo || '').trim();
    const concepto = String(req.body.concepto || '').trim();
    const monto = Number(req.body.monto);
    if (!tipo || !concepto || Number.isNaN(monto) || monto < 0) {
      return res.status(400).json({ error: 'Datos de costo inválidos.' });
    }
    const result = await pool.query(
      `UPDATE fleet_cost_entries
       SET tipo = $2, concepto = $3, monto = $4
       WHERE id = $1
       RETURNING id, fleet_unit_id, tipo, concepto, monto, created_at`,
      [req.params.id, tipo, concepto, monto]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Costo no encontrado.' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando costo:', error);
    res.status(500).json({ error: 'No se pudo actualizar el costo.' });
  }
});

app.delete('/api/fleet/costs/:id', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM fleet_cost_entries
       WHERE id = $1
       RETURNING id, fleet_unit_id`,
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Costo no encontrado.' });
    res.json({ ok: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('Error eliminando costo:', error);
    res.status(500).json({ error: 'No se pudo eliminar el costo.' });
  }
});

app.get('/api/parts/requests', authRequired, requireRoles('admin','supervisor_flotas'), async (req, res) => {
  try {
    const params = [];
    const where = [];
    if (req.user.role === 'supervisor_flotas') {
      params.push(req.user.empresa || '');
      where.push(`empresa = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT id, empresa, numero_economico, solicitud, status, notes, evidence_photos, created_at, updated_at
       FROM parts_requests
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY updated_at DESC, created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error leyendo solicitudes independientes de refacción:', error);
    res.status(500).json({ error: 'No se pudieron leer las solicitudes.' });
  }
});

app.post('/api/parts/requests', authRequired, requireRoles('admin','supervisor_flotas'), async (req, res) => {
  try {
    const empresa = String(req.body.empresa || req.user.empresa || '').trim();
    const numeroEconomico = String(req.body.numeroEconomico || '').trim();
    const solicitud = String(req.body.solicitud || '').trim();
    const notes = String(req.body.notes || '').trim();
    const evidencePhotos = Array.isArray(req.body.evidencePhotos) ? req.body.evidencePhotos.filter(Boolean) : [];
    if (!empresa || !solicitud) return res.status(400).json({ error: 'Empresa y solicitud son obligatorias.' });
    const result = await pool.query(
      `INSERT INTO parts_requests (empresa, numero_economico, solicitud, status, requested_by, notes, evidence_photos)
       VALUES ($1,$2,$3,'pendiente',$4,$5,$6::jsonb)
       RETURNING id, empresa, numero_economico, solicitud, status, notes, evidence_photos, created_at, updated_at`,
      [empresa, numeroEconomico, solicitud, req.user.id, notes, JSON.stringify(evidencePhotos)]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creando solicitud independiente de refacción:', error);
    res.status(500).json({ error: 'No se pudo crear la solicitud.' });
  }
});


app.patch('/api/parts/requests/:id', authRequired, requireRoles('admin','supervisor_flotas'), async (req, res) => {
  try {
    const status = String(req.body.status || '').trim() || 'pendiente';
    const notes = String(req.body.notes || '').trim();
    const evidencePhotos = Array.isArray(req.body.evidencePhotos) ? req.body.evidencePhotos.filter(Boolean) : null;
    const allowed = ['pendiente', 'pedida', 'asignada', 'recibida', 'instalada', 'cancelada', 'cerrada'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Estatus inválido.' });

    const params = [req.params.id, status, notes, evidencePhotos ? JSON.stringify(evidencePhotos) : null];
    let where = 'id = $1';
    if (req.user.role === 'supervisor_flotas') {
      params.push(req.user.empresa || '');
      where += ` AND empresa = $${params.length}`;
    }

    const result = await pool.query(
      `UPDATE parts_requests
       SET status = $2, notes = $3, evidence_photos = COALESCE($4::jsonb, evidence_photos), updated_at = NOW()
       WHERE ${where}
       RETURNING id, empresa, numero_economico, solicitud, status, notes, evidence_photos, created_at, updated_at`,
      params
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Solicitud no encontrada.' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando solicitud independiente de refacción:', error);
    res.status(500).json({ error: 'No se pudo actualizar la solicitud.' });
  }
});


app.get('/api/stock/parts', authRequired, requireRoles('admin'), async (_req, res) => {
  try {
    const parts = await pool.query(
      `SELECT sp.*, 
              COUNT(sm.id)::int AS movimientos,
              MAX(sm.created_at) AS ultimo_movimiento_at
       FROM stock_parts sp
       LEFT JOIN stock_movements sm ON sm.stock_part_id = sp.id
       GROUP BY sp.id
       ORDER BY LOWER(sp.nombre) ASC, sp.created_at DESC`
    );
    const movements = await pool.query(
      `SELECT sm.*, sp.nombre, sp.sku
       FROM stock_movements sm
       JOIN stock_parts sp ON sp.id = sm.stock_part_id
       ORDER BY sm.created_at DESC
       LIMIT 120`
    );
    res.json({ parts: parts.rows.map(mapStockPart), movements: movements.rows.map(mapStockMovement) });
  } catch (error) {
    console.error('Error leyendo stock:', error);
    res.status(500).json({ error: 'No se pudo cargar el stock.' });
  }
});

app.post('/api/stock/parts', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const sku = String(req.body.sku || '').trim();
    const proveedor = String(req.body.proveedor || '').trim();
    const stockActual = Number(req.body.stockActual || 0);
    const stockMinimo = Number(req.body.stockMinimo || 0);
    const costoUnitario = Number(req.body.costoUnitario || 0);
    const precioVenta = Number(req.body.precioVenta || 0);
    const ubicacion = String(req.body.ubicacion || '').trim();
    const notas = String(req.body.notas || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre de refacción requerido.' });
    const result = await pool.query(
      `INSERT INTO stock_parts (id, nombre, sku, proveedor, stock_actual, stock_minimo, costo_unitario, precio_venta, ubicacion, notas, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [cryptoRandomId(), nombre, sku, proveedor, stockActual, stockMinimo, costoUnitario, precioVenta, ubicacion, notas, req.user.id]
    );
    res.status(201).json(mapStockPart(result.rows[0]));
  } catch (error) {
    console.error('Error creando refacción de stock:', error);
    res.status(500).json({ error: 'No se pudo crear la refacción.' });
  }
});

app.patch('/api/stock/parts/:id', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const sku = String(req.body.sku || '').trim();
    const proveedor = String(req.body.proveedor || '').trim();
    const stockMinimo = Number(req.body.stockMinimo || 0);
    const costoUnitario = Number(req.body.costoUnitario || 0);
    const precioVenta = Number(req.body.precioVenta || 0);
    const ubicacion = String(req.body.ubicacion || '').trim();
    const notas = String(req.body.notas || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre de refacción requerido.' });
    const result = await pool.query(
      `UPDATE stock_parts
       SET nombre = $2, sku = $3, proveedor = $4, stock_minimo = $5, costo_unitario = $6, precio_venta = $7, ubicacion = $8, notas = $9, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, nombre, sku, proveedor, stockMinimo, costoUnitario, precioVenta, ubicacion, notas]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Refacción no encontrada.' });
    res.json(mapStockPart(result.rows[0]));
  } catch (error) {
    console.error('Error actualizando refacción de stock:', error);
    res.status(500).json({ error: 'No se pudo actualizar la refacción.' });
  }
});

app.post('/api/stock/parts/:id/movements', authRequired, requireRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tipo = String(req.body.tipo || '').trim();
    const cantidad = Number(req.body.cantidad || 0);
    const unidad = String(req.body.unidad || '').trim();
    const empresa = String(req.body.empresa || '').trim();
    const garantiaFolio = String(req.body.garantiaFolio || '').trim();
    const notas = String(req.body.notas || '').trim();
    if (!['entrada','salida_unidad','venta_directa','ajuste'].includes(tipo)) return res.status(400).json({ error: 'Tipo de movimiento inválido.' });
    if (Number.isNaN(cantidad) || cantidad <= 0) return res.status(400).json({ error: 'Cantidad inválida.' });

    const found = await client.query(`SELECT * FROM stock_parts WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!found.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Refacción no encontrada.' });
    }
    const part = found.rows[0];
    let next_stock = Number(part.stock_actual || 0);
    if (tipo === 'entrada') next_stock += cantidad;
    else if (tipo === 'ajuste') next_stock = cantidad;
    else next_stock -= cantidad;
    if (next_stock < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Stock insuficiente para esa salida.' });
    }
    await client.query(`UPDATE stock_parts SET stock_actual = $2, updated_at = NOW() WHERE id = $1`, [req.params.id, next_stock]);
    const mov = await client.query(
      `INSERT INTO stock_movements (id, stock_part_id, tipo, cantidad, unidad, empresa, garantia_folio, notas, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [cryptoRandomId(), req.params.id, tipo, cantidad, unidad, empresa, garantiaFolio, notas, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ movement: mapStockMovement({ ...mov.rows[0], nombre: part.nombre, sku: part.sku }), stockActual: next_stock });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error registrando movimiento de stock:', error);
    res.status(500).json({ error: 'No se pudo registrar el movimiento.' });
  } finally {
    client.release();
  }
});

async function fetchQuotesForAdmin() {
  const result = await pool.query(`
    SELECT q.*, g.folio AS report_folio, g.descripcion_fallo AS report_description, g.estatus_validacion AS report_validation, g.estatus_operativo AS report_operational,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', qi.id,
                 'quote_id', qi.quote_id,
                 'type', qi.type,
                 'description', qi.description,
                 'qty', qi.qty,
                 'unit_price', qi.unit_price,
                 'total', qi.total,
                 'stock_part_id', qi.stock_part_id,
                 'stock_part_name', sp.nombre,
                 'created_at', qi.created_at
               ) ORDER BY qi.created_at ASC
             ) FILTER (WHERE qi.id IS NOT NULL), '[]'::json
           ) AS items
    FROM work_quotes q
    LEFT JOIN garantias g ON g.id = q.garantia_id
    LEFT JOIN work_quote_items qi ON qi.quote_id = q.id
    LEFT JOIN stock_parts sp ON sp.id = qi.stock_part_id
    GROUP BY q.id, g.folio, g.descripcion_fallo, g.estatus_validacion, g.estatus_operativo
    ORDER BY q.updated_at DESC
  `);
  return result.rows.map(mapWorkQuote);
}

async function fetchDirectSalesForAdmin() {
  const result = await pool.query(`
    SELECT s.*,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', si.id,
                 'sale_id', si.sale_id,
                 'stock_part_id', si.stock_part_id,
                 'description', si.description,
                 'qty', si.qty,
                 'unit_price', si.unit_price,
                 'total', si.total,
                 'stock_part_name', sp.nombre,
                 'created_at', si.created_at
               ) ORDER BY si.created_at ASC
             ) FILTER (WHERE si.id IS NOT NULL), '[]'::json
           ) AS items
    FROM direct_sales s
    LEFT JOIN direct_sale_items si ON si.sale_id = s.id
    LEFT JOIN stock_parts sp ON sp.id = si.stock_part_id
    GROUP BY s.id
    ORDER BY s.updated_at DESC
  `);
  return result.rows.map(mapDirectSale);
}

app.get('/api/cobranza/overview', authRequired, requireRoles('admin'), async (_req, res) => {
  try {
    const [quotes, sales, readyReports, stock] = await Promise.all([
      fetchQuotesForAdmin(),
      fetchDirectSalesForAdmin(),
      pool.query(`SELECT COUNT(*)::int AS total FROM garantias WHERE estatus_operativo = 'terminada'`),
      pool.query(`SELECT COALESCE(SUM(stock_actual * costo_unitario),0)::numeric(12,2) AS valor, COUNT(*)::int AS catalogo FROM stock_parts`),
    ]);
    res.json({
      quotes: {
        total: quotes.length,
        pendingAuthorization: quotes.filter(q => ['enviada','pendiente_autorizacion'].includes(q.status)).length,
        pendingPayment: quotes.filter(q => ['pendiente_pago','anticipo_recibido','pago_parcial'].includes(q.paymentStatus)).length,
        paid: quotes.filter(q => q.paymentStatus === 'pagada').length,
        amountOpen: quotes.filter(q => q.paymentStatus !== 'pagada').reduce((sum,q) => sum + Number(q.saldo || q.total || 0), 0),
      },
      directSales: {
        total: sales.length,
        amount: sales.reduce((sum,s) => sum + Number(s.total || 0), 0),
      },
      finishedReports: readyReports.rows[0]?.total || 0,
      stock: {
        catalog: stock.rows[0]?.catalogo || 0,
        value: Number(stock.rows[0]?.valor || 0),
      }
    });
  } catch (error) {
    console.error('Error cargando overview de cobranza:', error);
    res.status(500).json({ error: 'No se pudo cargar cobranza.' });
  }
});

app.get('/api/cobranza/quotes', authRequired, requireRoles('admin'), async (_req, res) => {
  try {
    res.json(await fetchQuotesForAdmin());
  } catch (error) {
    console.error('Error cargando cotizaciones:', error);
    res.status(500).json({ error: 'No se pudieron cargar las cotizaciones.' });
  }
});

app.post('/api/cobranza/quotes/from-report/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM work_quotes WHERE garantia_id = $1`, [req.params.id]);
    if (existing.rowCount) {
      await client.query('COMMIT');
      const quotes = await fetchQuotesForAdmin();
      return res.json(quotes.find(q => q.id === existing.rows[0].id));
    }
    const report = await client.query(`SELECT * FROM garantias WHERE id = $1`, [req.params.id]);
    if (!report.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reporte no encontrado.' });
    }
    const g = report.rows[0];
    const folio = await nextManagedFolio('quote');
    const quoteId = cryptoRandomId();
    await client.query(
      `INSERT INTO work_quotes (id, folio, garantia_id, company_name, unit_number, client_name, client_phone, status, payment_status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'borrador','pendiente_pago',$8)`,
      [quoteId, folio, g.id, g.empresa || '', g.numero_economico || '', g.contacto_nombre || '', g.telefono || '', req.user.id]
    );
    const defaultItems = [
      { type:'mano_obra', description:`Servicio correctivo ${g.folio || ''} · unidad ${g.numero_economico || ''}`.trim(), qty:1, unitPrice:0 },
    ];
    if (g.detalle_refaccion || g.refaccion_asignada) {
      defaultItems.push({ type:'refaccion', description:g.refaccion_asignada || g.detalle_refaccion || 'Refacción ligada al reporte', qty:1, unitPrice:0 });
    }
    for (const item of defaultItems) {
      const total = Number(item.qty || 0) * Number(item.unitPrice || 0);
      await client.query(
        `INSERT INTO work_quote_items (id, quote_id, type, description, qty, unit_price, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [cryptoRandomId(), quoteId, item.type, item.description, item.qty, item.unitPrice, total]
      );
    }
    await client.query('COMMIT');
    const quotes = await fetchQuotesForAdmin();
    const created = quotes.find(q => q.id === quoteId);
    if (g.id) await addAuditLog(g.id, req.user.id, 'preparar_cobro', `Cobranza ${folio} creada desde reporte.`);
    res.status(201).json(created);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando cobranza desde reporte:', error);
    res.status(500).json({ error: 'No se pudo preparar la cobranza.' });
  } finally {
    client.release();
  }
});

app.patch('/api/cobranza/quotes/:id', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const status = String(req.body.status || 'borrador').trim();
    const paymentStatus = String(req.body.paymentStatus || 'pendiente_pago').trim();
    if (!['borrador','enviada','pendiente_autorizacion','autorizada','rechazada','cancelada'].includes(status)) return res.status(400).json({ error:'Estado comercial inválido.' });
    if (!['pendiente_pago','anticipo_recibido','pago_parcial','pagada','cancelada'].includes(paymentStatus)) return res.status(400).json({ error:'Estado de pago inválido.' });
    const currentItems = await pool.query(`SELECT total FROM work_quote_items WHERE quote_id = $1`, [req.params.id]);
    const recomputed = computeCommercialTotals(currentItems.rows.map(r => ({ total:r.total })), req.body.discount, req.body.iva, req.body.anticipo);
    const result = await pool.query(
      `UPDATE work_quotes
       SET company_name = $2,
           unit_number = $3,
           client_name = $4,
           client_phone = $5,
           status = $6,
           payment_status = $7,
           discount = $8,
           iva = $9,
           total = $10,
           anticipo = $11,
           saldo = $12,
           subtotal = $13,
           notes = $14,
           payment_method = $15,
           payment_reference = $16,
           due_at = $17,
           sent_at = CASE WHEN $6 IN ('enviada','pendiente_autorizacion') THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
           approved_at = CASE WHEN $6 = 'autorizada' THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
           paid_at = CASE WHEN $7 = 'pagada' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, String(req.body.companyName || '').trim(), String(req.body.unitNumber || '').trim(), String(req.body.clientName || '').trim(), normalizeMxPhone(req.body.clientPhone || ''), status, paymentStatus, recomputed.discount, recomputed.iva, recomputed.total, recomputed.anticipo, recomputed.saldo, recomputed.subtotal, String(req.body.notes || '').trim(), String(req.body.paymentMethod || '').trim(), String(req.body.paymentReference || '').trim(), req.body.dueAt || null]
    );
    if (!result.rowCount) return res.status(404).json({ error:'Cobranza no encontrada.' });
    const quotes = await fetchQuotesForAdmin();
    const quote = quotes.find(q => q.id === req.params.id);
    if (quote?.garantiaId) await addAuditLog(quote.garantiaId, req.user.id, 'actualizar_cobro', `Cobranza ${quote.folio} actualizada.`);
    res.json(quote);
  } catch (error) {
    console.error('Error actualizando cobranza:', error);
    res.status(500).json({ error:'No se pudo actualizar la cobranza.' });
  }
});

app.put('/api/cobranza/quotes/:id/items', authRequired, requireRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT * FROM work_quotes WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!found.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error:'Cobranza no encontrada.' });
    }
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    await client.query(`DELETE FROM work_quote_items WHERE quote_id = $1`, [req.params.id]);
    const normalized = [];
    for (const item of items) {
      const description = String(item.description || '').trim();
      const type = String(item.type || 'extra').trim();
      const qty = Number(item.qty || 0);
      const unitPrice = Number(item.unitPrice || 0);
      if (!description || qty <= 0) continue;
      const total = Number((qty * unitPrice).toFixed(2));
      normalized.push({ total });
      await client.query(
        `INSERT INTO work_quote_items (id, quote_id, type, description, qty, unit_price, total, stock_part_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [cryptoRandomId(), req.params.id, ['mano_obra','refaccion','extra'].includes(type) ? type : 'extra', description, qty, unitPrice, total, item.stockPartId || null]
      );
    }
    const totals = computeCommercialTotals(normalized, req.body.discount, req.body.iva, req.body.anticipo);
    await client.query(
      `UPDATE work_quotes SET subtotal = $2, discount = $3, iva = $4, total = $5, anticipo = $6, saldo = $7, updated_at = NOW() WHERE id = $1`,
      [req.params.id, totals.subtotal, totals.discount, totals.iva, totals.total, totals.anticipo, totals.saldo]
    );
    await client.query('COMMIT');
    const quotes = await fetchQuotesForAdmin();
    res.json(quotes.find(q => q.id === req.params.id));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error guardando conceptos de cobranza:', error);
    res.status(500).json({ error:'No se pudieron guardar los conceptos.' });
  } finally {
    client.release();
  }
});

app.get('/api/cobranza/direct-sales', authRequired, requireRoles('admin'), async (_req, res) => {
  try {
    res.json(await fetchDirectSalesForAdmin());
  } catch (error) {
    console.error('Error cargando ventas directas:', error);
    res.status(500).json({ error:'No se pudieron cargar las ventas.' });
  }
});

app.post('/api/cobranza/direct-sales', authRequired, requireRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const customerName = String(req.body.customerName || 'Mostrador').trim() || 'Mostrador';
    const customerPhone = normalizeMxPhone(req.body.customerPhone || '');
    const companyName = String(req.body.companyName || '').trim();
    const unitNumber = String(req.body.unitNumber || '').trim();
    const notes = String(req.body.notes || '').trim();
    const paymentStatus = ['pendiente','pagado_parcial','pagada','cancelada'].includes(String(req.body.paymentStatus || 'pendiente')) ? String(req.body.paymentStatus) : 'pendiente';
    const paymentMethod = String(req.body.paymentMethod || '').trim();
    const paymentReference = String(req.body.paymentReference || '').trim();
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const preparedItems = [];
    const folio = await nextManagedFolio('sale');
    const saleId = cryptoRandomId();
    let subtotal = 0;
    for (const item of items) {
      const qty = Number(item.qty || 0);
      const rawPartId = String(item.stockPartId || '').trim();
      const descriptionSeed = String(item.description || '').trim();
      if (qty <= 0) continue;
      let stockPartId = rawPartId || null;
      let stockPart = null;
      if (stockPartId) {
        const locked = await client.query(`SELECT * FROM stock_parts WHERE id = $1 FOR UPDATE`, [stockPartId]);
        if (locked.rowCount) stockPart = locked.rows[0];
        else stockPartId = null;
      }
      const description = descriptionSeed || stockPart?.nombre || 'Venta directa';
      let unitPrice = Number(item.unitPrice || 0);
      if (stockPart && unitPrice <= 0) unitPrice = Number(stockPart.precio_venta || stockPart.costo_unitario || 0);
      if (!description || unitPrice < 0) continue;
      if (stockPart) {
        const nextStock = Number(stockPart.stock_actual || 0) - qty;
        if (nextStock < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error:`Stock insuficiente para ${stockPart.nombre}.` });
        }
        await client.query(`UPDATE stock_parts SET stock_actual = $2, updated_at = NOW() WHERE id = $1`, [stockPart.id, nextStock]);
        await client.query(
          `INSERT INTO stock_movements (id, stock_part_id, tipo, cantidad, unidad, empresa, garantia_folio, notas, created_by)
           VALUES ($1,$2,'venta_directa',$3,$4,$5,$6,$7,$8)`,
          [cryptoRandomId(), stockPart.id, qty, unitNumber, companyName, folio, `Venta directa ${folio} · ${customerName}${notes ? ` · ${notes}` : ''}`, req.user.id]
        );
      }
      const total = Number((qty * unitPrice).toFixed(2));
      subtotal += total;
      preparedItems.push([stockPart ? stockPart.id : stockPartId, description, qty, unitPrice, total]);
    }
    if (!preparedItems.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error:'Captura al menos un concepto válido para la venta.' });
    }
    await client.query(
      `INSERT INTO direct_sales (id, folio, customer_name, customer_phone, company_name, unit_number, status, payment_status, subtotal, total, notes, payment_method, payment_reference, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'cerrada',$7,$8,$8,$9,$10,$11,$12)`,
      [saleId, folio, customerName, customerPhone, companyName, unitNumber, paymentStatus, subtotal, notes, paymentMethod, paymentReference, req.user.id]
    );
    for (const tuple of preparedItems) {
      const [stockPartId, description, qty, unitPrice, total] = tuple;
      await client.query(
        `INSERT INTO direct_sale_items (id, sale_id, stock_part_id, description, qty, unit_price, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [cryptoRandomId(), saleId, stockPartId || null, description, qty, unitPrice, total]
      );
    }
    await client.query('COMMIT');
    const sales = await fetchDirectSalesForAdmin();
    res.status(201).json(sales.find(s => s.id === saleId));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando venta directa:', error);
    res.status(500).json({ error:error?.message || 'No se pudo crear la venta.' });
  } finally {
    client.release();
  }
});

app.patch('/api/cobranza/direct-sales/:id', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE direct_sales
       SET status = $2,
           payment_status = $3,
           payment_method = $4,
           payment_reference = $5,
           notes = $6,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, ['borrador','cerrada','cancelada'].includes(String(req.body.status || 'cerrada')) ? String(req.body.status) : 'cerrada', ['pendiente','pagado_parcial','pagada','cancelada'].includes(String(req.body.paymentStatus || 'pendiente')) ? String(req.body.paymentStatus) : 'pendiente', String(req.body.paymentMethod || '').trim(), String(req.body.paymentReference || '').trim(), String(req.body.notes || '').trim()]
    );
    if (!result.rowCount) return res.status(404).json({ error:'Venta no encontrada.' });
    const sales = await fetchDirectSalesForAdmin();
    res.json(sales.find(s => s.id === req.params.id));
  } catch (error) {
    console.error('Error actualizando venta directa:', error);
    res.status(500).json({ error:'No se pudo actualizar la venta.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`CARLAB CLOUD V3 Fase Pro 3 corriendo en puerto ${PORT}`));
  })
  .catch((error) => {
    console.error('No se pudo inicializar la base:', error);
    process.exit(1);
  });
