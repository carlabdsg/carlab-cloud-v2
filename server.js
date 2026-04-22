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
const TWILIO_TEMPLATE_SUPERVISOR_REPORTE = process.env.TWILIO_TEMPLATE_SUPERVISOR_REPORTE || '';

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
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true,
  keepAlive: true,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (error) => {
  console.error('PG pool error:', error?.message || error);
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
  const normalizeJsonArray = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch (_error) {
        return [];
      }
    }
    return [];
  };
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
    evidencias: normalizeJsonArray(row.evidencias),
    evidenciasRefaccion: normalizeJsonArray(row.evidencias_refaccion),
    firma: typeof row.firma === 'string' ? row.firma : '',
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
  const reportsLast30d = Number(row.reports_last_30d || 0);
  const recurrenceLevel = reportsLast30d >= 4 ? 'high' : reportsLast30d >= 2 ? 'medium' : 'normal';
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
    statusAuto: row.status_auto || 'ok',
    effectiveStatus: row.effective_status || row.status_auto || 'ok',
    manualStatus: row.manual_status || null,
    openReportsCount: Number(row.open_reports_count || 0),
    pendingPartsCount: Number(row.pending_parts_count || 0),
    criticalReportsCount: Number(row.critical_reports_count || 0),
    warningReportsCount: Number(row.warning_reports_count || 0),
    reportsLast30d,
    recurrenceLevel,
    costoRefacciones: Number(row.costo_refacciones || 0),
    costoManoObra: Number(row.costo_mano_obra || 0),
    costoTotal: Number(row.costo_total || 0),
    reportesCount: Number(row.reportes_count || 0),
    lastReportAt: row.last_report_at || null,
    lastOpenReportAt: row.last_open_report_at || null,
    lastOperationalChangeAt: row.last_operational_change_at || null,
    lastRefaccionAt: row.last_refaccion_at || null,
    lastScheduleAt: row.last_schedule_at || null,
    lastCampaignAt: row.last_campaign_at || null,
    lastMovementAt: row.last_movement_at || null,
    createdAt: row.created_at
  };
}

const OPEN_VALIDACION_STATUSES = ['nueva', 'pendiente de revisión', 'aceptada'];
const OPEN_OPERATIVO_STATUSES = ['sin iniciar', 'programada', 'en proceso', 'espera refacción'];
const CRITICAL_OPERATIVO_STATUSES = ['en proceso', 'espera refacción'];
const CLOSED_OPERATIVO_STATUSES = ['terminada', 'rechazada'];

function computeFleetAutoStatusFromReports(reports = []) {
  let hasCritical = false;
  let hasWarning = false;
  let openReportsCount = 0;
  let criticalReportsCount = 0;
  let warningReportsCount = 0;
  let lastOpenReportAt = null;

  reports.forEach((report) => {
    const estatusOperativo = String(report.estatus_operativo || '').trim().toLowerCase();
    const estatusValidacion = String(report.estatus_validacion || '').trim().toLowerCase();
    const isClosed = CLOSED_OPERATIVO_STATUSES.includes(estatusOperativo);
    const isOpen =
      !isClosed &&
      (OPEN_OPERATIVO_STATUSES.includes(estatusOperativo) || OPEN_VALIDACION_STATUSES.includes(estatusValidacion) || (!estatusOperativo && !estatusValidacion));
    if (!isOpen) return;
    openReportsCount += 1;
    const createdAt = report.created_at ? new Date(report.created_at).getTime() : 0;
    if (!lastOpenReportAt || createdAt > new Date(lastOpenReportAt).getTime()) lastOpenReportAt = report.created_at;
    if (CRITICAL_OPERATIVO_STATUSES.includes(estatusOperativo)) {
      hasCritical = true;
      criticalReportsCount += 1;
    } else {
      hasWarning = true;
      warningReportsCount += 1;
    }
  });

  const statusAuto = hasCritical ? 'critical' : hasWarning ? 'warning' : 'ok';
  return { statusAuto, openReportsCount, criticalReportsCount, warningReportsCount, lastOpenReportAt };
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

function normalizeIdentityValue(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function findSupervisorFlotasByEmpresa(empresa, db = pool) {
  const company = String(empresa || '').trim();
  if (!company) return null;
  const result = await db.query(
    `SELECT id, nombre, email, telefono, empresa
     FROM users
     WHERE role = $1
       AND deleted_at IS NULL
       AND activo = TRUE
       AND ${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql('$2')}
     ORDER BY created_at DESC NULLS LAST
     LIMIT 1`,
    [ROLE_SUPERVISOR_FLOTAS, company]
  );
  if (!result.rowCount) return null;
  return {
    id: result.rows[0].id,
    nombre: result.rows[0].nombre || '',
    email: result.rows[0].email || '',
    telefono: result.rows[0].telefono || '',
    empresa: result.rows[0].empresa || '',
  };
}

async function notifySupervisorFlotasReport(garantia, options = {}) {
  if (!garantia || !String(garantia.empresa || '').trim()) return { ok: false, reason: 'no_supervisor' };
  const supervisor = await findSupervisorFlotasByEmpresa(garantia.empresa);
  if (!supervisor) return { ok: false, reason: 'no_supervisor' };
  if (!String(supervisor.telefono || '').trim()) return { ok: false, reason: 'no_phone' };
  if (!TWILIO_TEMPLATE_SUPERVISOR_REPORTE) return { ok: false, reason: 'no_template' };

  const folio = String(garantia.folio || '').trim() || String(garantia.id || '').trim() || 'SIN-FOLIO';
  const unidad = String(garantia.numeroEconomico || garantia.numero_economico || '').trim() || String(garantia.numeroObra || garantia.numero_obra || '').trim() || 'SIN-UNIDAD';
  const empresa = String(garantia.empresa || '').trim() || String(supervisor.empresa || '').trim() || 'SIN-EMPRESA';
  const incidencia = String(garantia.tipoIncidente || garantia.tipo_incidente || garantia.descripcionFallo || garantia.descripcion_fallo || '').trim()
    || String(garantia.detalleRefaccion || garantia.detalle_refaccion || '').trim()
    || 'Sin detalle';
  const estatus = String(garantia.estatusValidacion || garantia.estatus_validacion || garantia.estatusOperativo || garantia.estatus_operativo || '').trim() || 'nueva';

  try {
    await sendWhatsAppTemplate({
      telefono: supervisor.telefono,
      contentSid: TWILIO_TEMPLATE_SUPERVISOR_REPORTE,
      variables: {
        1: folio,
        2: unidad,
        3: empresa,
        4: incidencia,
        5: estatus,
      },
    });
    if (options.manual) {
      console.log(`[whatsapp][manual][supervisor] enviado reporte=${folio} empresa="${empresa}" supervisor="${supervisor.email || supervisor.id}"`);
    } else {
      console.log(`[whatsapp][auto][supervisor] enviado reporte=${folio} empresa="${empresa}" supervisor="${supervisor.email || supervisor.id}"`);
    }
    return { ok: true, supervisor, telefono: supervisor.telefono };
  } catch (error) {
    if (options.manual) {
      console.error(`[whatsapp][manual][supervisor] fallo reporte=${folio} empresa="${empresa}":`, error?.message || error);
    } else {
      console.error(`[whatsapp][auto][supervisor] fallo reporte=${folio} empresa="${empresa}":`, error?.message || error);
    }
    return { ok: false, reason: 'twilio_error', error: error?.message || String(error || 'Error enviando WhatsApp') };
  }
}

const SQL_IDENTITY_TRANSLATE_FROM = 'ÁÀÄÂÃÅáàäâãåÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç';
const SQL_IDENTITY_TRANSLATE_TO = 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc';
function normalizedIdentitySql(valueSqlExpression) {
  return `lower(regexp_replace(translate(COALESCE(${valueSqlExpression}, ''), '${SQL_IDENTITY_TRANSLATE_FROM}', '${SQL_IDENTITY_TRANSLATE_TO}'), '[^a-zA-Z0-9]+','','g'))`;
}

function identityEqualsSql(leftExpression, rightExpression) {
  return `${normalizedIdentitySql(leftExpression)} = ${normalizedIdentitySql(rightExpression)}`;
}

function unitIdentityMatchSql(companyExpression, unitExpression, companyParamExpression, unitParamExpression) {
  return `${identityEqualsSql(companyExpression, companyParamExpression)} AND ${identityEqualsSql(unitExpression, unitParamExpression)}`;
}

async function findFleetUnitIdByIdentity(empresa, numeroEconomico, db = pool) {
  const result = await db.query(
    `SELECT id
     FROM fleet_units
     WHERE ${unitIdentityMatchSql('empresa', 'numero_economico', '$1', '$2')}
     ORDER BY updated_at DESC
     LIMIT 1`,
    [empresa || '', numeroEconomico || '']
  );
  return result.rowCount ? result.rows[0].id : null;
}

async function backfillFleetUnitIdForGarantiasByIdentity(empresa, numeroEconomico, fleetUnitId, db = pool) {
  if (!fleetUnitId) return 0;
  const result = await db.query(
    `UPDATE garantias
     SET fleet_unit_id = $3, updated_at = NOW()
     WHERE fleet_unit_id IS NULL
       AND ${unitIdentityMatchSql('empresa', 'numero_economico', '$1', '$2')}`,
    [empresa || '', numeroEconomico || '', fleetUnitId]
  );
  return result.rowCount || 0;
}

let campaignGroupColumnsCache = null;

async function getCampaignGroupColumns() {
  if (campaignGroupColumnsCache) return campaignGroupColumnsCache;
  const result = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_groups'
  `);
  const names = new Set(result.rows.map(r => String(r.column_name || '').toLowerCase()));
  campaignGroupColumnsCache = {
    nombre: names.has('nombre'),
    campaign_nombre: names.has('campaign_nombre'),
    campaign_name: names.has('campaign_name'),
  };
  return campaignGroupColumnsCache;
}

function buildCampaignGroupNameUpdate(columns, nombre, startIndex = 1) {
  const clean = String(nombre || '').trim();
  const sets = [];
  const values = [];
  const push = (column) => {
    values.push(clean);
    sets.push(`${column} = $${startIndex + values.length - 1}`);
  };
  if (columns.nombre) push('nombre');
  if (columns.campaign_nombre) push('campaign_nombre');
  if (columns.campaign_name) push('campaign_name');
  return { sets, values };
}

async function syncQuoteToFleetCosts(quoteId, actor = {}) {
  const quoteQ = await pool.query(`SELECT * FROM work_quotes WHERE id = $1`, [quoteId]);
  if (!quoteQ.rowCount) return { synced: false, reason: 'quote_not_found' };
  const quote = quoteQ.rows[0];
  const company = normalizeIdentityValue(quote.company_name);
  const unit = normalizeIdentityValue(quote.unit_number);
  let fleetUnitId = null;
  let garantiaId = quote.garantia_id || null;

  if (garantiaId) {
    const gq = await pool.query(`SELECT fleet_unit_id, empresa, numero_economico FROM garantias WHERE id = $1`, [garantiaId]);
    if (gq.rowCount) {
      fleetUnitId = gq.rows[0].fleet_unit_id || null;
      if (!fleetUnitId) {
        fleetUnitId = await findFleetUnitIdByIdentity(gq.rows[0].empresa || quote.company_name || '', gq.rows[0].numero_economico || quote.unit_number || '');
        if (fleetUnitId) {
          await pool.query(`UPDATE garantias SET fleet_unit_id = $2 WHERE id = $1`, [garantiaId, fleetUnitId]);
        }
      }
    }
  }
  if (!fleetUnitId) {
    fleetUnitId = await findFleetUnitIdByIdentity(quote.company_name || '', quote.unit_number || '');
  }
  if (!fleetUnitId) return { synced: false, reason: 'fleet_unit_not_found' };

  await pool.query(`DELETE FROM fleet_cost_entries WHERE source_quote_id = $1`, [quoteId]);
  if (quote.payment_status !== 'pagada') return { synced: false, reason: 'quote_not_paid', fleetUnitId };

  const itemsQ = await pool.query(`SELECT * FROM work_quote_items WHERE quote_id = $1 ORDER BY created_at ASC`, [quoteId]);
  const allowed = {'refaccion':'refaccion','mano_obra':'mano_obra'}
  for (const item of itemsQ.rows) {
    const tipo = allowed[item.type];
    if (!tipo) continue;
    const amount = Number(item.total || 0);
    if (!Number.isFinite(amount)) continue;
    await pool.query(`INSERT INTO fleet_cost_entries (id, fleet_unit_id, garantia_id, tipo, concepto, monto, created_by_id, created_by_nombre, source_quote_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [cryptoRandomId(), fleetUnitId, garantiaId, tipo, item.description || '', amount, actor.id || quote.created_by || null, actor.nombre || actor.name || 'Cobranza', quoteId]);
  }
  return { synced: true, fleetUnitId };
}

async function markFleetCampaignFlagsForCompany(companyName) {
  const company = String(companyName || '').trim();
  if (!company) return;
  await pool.query(`UPDATE fleet_units fu
    SET campaign_activa = EXISTS (
      SELECT 1 FROM campaign_units cu
      JOIN campaign_groups cg ON cg.id = cu.campaign_group_id
      WHERE ${unitIdentityMatchSql('cu.empresa', 'cu.numero_economico', 'fu.empresa', 'fu.numero_economico')}
        AND cu.status <> 'realizada'
    ), updated_at = NOW()
    WHERE ${identityEqualsSql('fu.empresa', '$1')}`, [company]);
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

async function nextGarantiaFolio(client = pool) {
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [71000]);
  const result = await client.query(`
    SELECT folio
    FROM garantias
    WHERE folio IS NOT NULL AND folio <> ''
    ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT 2000
  `);
  let maxNum = 0;
  for (const row of result.rows) {
    const raw = String(row?.folio || '').trim().toUpperCase();
    if (!raw.startsWith('GAR-')) continue;
    const numericPart = raw.slice(4).replace(/[^0-9]/g, '');
    if (!numericPart) continue;
    const parsed = Number.parseInt(numericPart, 10);
    if (Number.isFinite(parsed) && parsed > maxNum) maxNum = parsed;
  }
  let next = maxNum + 1;
  let folio = `GAR-${String(next).padStart(5, '0')}`;
  for (;;) {
    const exists = await client.query(`SELECT 1 FROM garantias WHERE folio = $1 LIMIT 1`, [folio]);
    if (!exists.rowCount) return folio;
    next += 1;
    folio = `GAR-${String(next).padStart(5, '0')}`;
  }
}

async function nextManagedFolio(kind, client = pool) {
  const key = kind === 'quote' ? 'quote' : 'sale';
  const config = key === 'quote'
    ? { table: 'work_quotes', prefix: 'COB', lockKey: 71001 }
    : { table: 'direct_sales', prefix: 'VTA', lockKey: 71002 };
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [config.lockKey]);
  const result = await client.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(folio, '\\D', '', 'g'), '')::int), 0) AS max_num
     FROM ${config.table}
     WHERE folio ~ $1`,
    [`^${config.prefix}-[0-9]+$`]
  );
  const next = Number(result.rows[0]?.max_num || 0) + 1;
  return `${config.prefix}-${String(next).padStart(5, '0')}`;
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
    ALTER TABLE schedule_requests ALTER COLUMN garantia_id DROP NOT NULL;
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
    ALTER TABLE fleet_cost_entries ADD COLUMN IF NOT EXISTS source_quote_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_fleet_cost_entries_source_quote ON fleet_cost_entries(source_quote_id);

    CREATE TABLE IF NOT EXISTS campaign_groups (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      empresa TEXT NOT NULL,
      notas TEXT,
      created_by_id TEXT REFERENCES users(id),
      created_by_nombre TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE campaign_groups ADD COLUMN IF NOT EXISTS nombre TEXT;
    ALTER TABLE campaign_groups ADD COLUMN IF NOT EXISTS campaign_nombre TEXT;
    ALTER TABLE campaign_groups ADD COLUMN IF NOT EXISTS campaign_name TEXT;
    ALTER TABLE campaign_groups ADD COLUMN IF NOT EXISTS empresa TEXT;
    ALTER TABLE campaign_groups ADD COLUMN IF NOT EXISTS notas TEXT;
    ALTER TABLE campaign_groups ADD COLUMN IF NOT EXISTS created_by_id TEXT;
    ALTER TABLE campaign_groups ADD COLUMN IF NOT EXISTS created_by_nombre TEXT;
    ALTER TABLE campaign_groups ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE campaign_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    UPDATE campaign_groups
    SET nombre = COALESCE(NULLIF(nombre, ''), campaign_nombre)
    WHERE COALESCE(nombre, '') = '' AND COALESCE(campaign_nombre, '') <> '';
    UPDATE campaign_groups
    SET campaign_nombre = COALESCE(NULLIF(campaign_nombre, ''), nombre)
    WHERE COALESCE(campaign_nombre, '') = '' AND COALESCE(nombre, '') <> '';
    UPDATE campaign_groups
    SET campaign_name = COALESCE(NULLIF(campaign_name, ''), NULLIF(campaign_nombre, ''), nombre)
    WHERE COALESCE(campaign_name, '') = '' AND (COALESCE(campaign_nombre, '') <> '' OR COALESCE(nombre, '') <> '');
    UPDATE campaign_groups
    SET nombre = COALESCE(NULLIF(nombre, ''), NULLIF(campaign_name, ''), campaign_nombre)
    WHERE COALESCE(nombre, '') = '' AND (COALESCE(campaign_name, '') <> '' OR COALESCE(campaign_nombre, '') <> '');
    UPDATE campaign_groups
    SET campaign_nombre = COALESCE(NULLIF(campaign_nombre, ''), NULLIF(campaign_name, ''), nombre)
    WHERE COALESCE(campaign_nombre, '') = '' AND (COALESCE(campaign_name, '') <> '' OR COALESCE(nombre, '') <> '');

    CREATE TABLE IF NOT EXISTS campaign_units (
      id TEXT PRIMARY KEY,
      campaign_group_id TEXT NOT NULL REFERENCES campaign_groups(id) ON DELETE CASCADE,
      empresa TEXT NOT NULL,
      numero_economico TEXT NOT NULL,
      evidencia JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'sin_programar' CHECK (status IN ('sin_programar','programada','realizada')),
      notas TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (campaign_group_id, empresa, numero_economico)
    );
    CREATE INDEX IF NOT EXISTS idx_campaign_groups_empresa ON campaign_groups(empresa);
    CREATE INDEX IF NOT EXISTS idx_campaign_units_group ON campaign_units(campaign_group_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_units_empresa_numero ON campaign_units(empresa, numero_economico);

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
    CREATE INDEX IF NOT EXISTS idx_garantias_folio ON garantias(folio);
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
  try {
    let query = `
      SELECT
        id, folio, numero_obra, modelo, numero_economico, empresa, kilometraje, contacto_nombre, telefono,
        tipo_incidente, descripcion_fallo, solicita_refaccion, detalle_refaccion, refaccion_status, refaccion_asignada,
        estatus_validacion, estatus_operativo, motivo_decision, observaciones_operativo,
        reportado_por_nombre, reportado_por_email, revisado_por_nombre, revisado_por_email,
        created_at, updated_at, reviewed_at, closed_at
      FROM garantias
    `;
    const params = [];
    const where = [];
    if (req.user.role === 'operador') {
      params.push(req.user.id);
      where.push(`reportado_por_id = $${params.length}`);
    }
    if (SUPERVISOR_ROLES.includes(req.user.role)) {
      params.push(req.user.empresa || '');
      where.push(`${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql(`$${params.length}`)}`);
    }
    const requestedLimit = Number(req.query.limit || 300);
    const safeLimit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 50), 1000) : 300;
    if (where.length) query += ' WHERE ' + where.join(' AND ');
    params.push(safeLimit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    const result = await pool.query(query, params);
    res.json(result.rows.map(mapGarantia));
  } catch (error) {
    console.error('Error leyendo garantias:', error?.message || error);
    res.json([]);
  }
});

app.get('/api/garantias/:id', authRequired, async (req, res) => {
  try {
    const params = [req.params.id];
    const where = ['id = $1'];
    if (req.user.role === 'operador') {
      params.push(req.user.id);
      where.push(`reportado_por_id = $${params.length}`);
    }
    if (SUPERVISOR_ROLES.includes(req.user.role)) {
      params.push(req.user.empresa || '');
      where.push(`${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql(`$${params.length}`)}`);
    }
    const result = await pool.query(`SELECT * FROM garantias WHERE ${where.join(' AND ')} LIMIT 1`, params);
    if (!result.rowCount) return res.status(404).json({ error: 'Reporte no encontrado.' });
    res.json(mapGarantia(result.rows[0]));
  } catch (error) {
    console.error('Error leyendo garantía:', error?.message || error);
    res.status(500).json({ error: 'No se pudo cargar el reporte.' });
  }
});

app.post('/api/garantias', authRequired, requireRoles('operador', 'admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body;
    const id = cryptoRandomId();
    const required = [body.numeroObra, body.modelo, body.numeroEconomico, body.empresa, body.tipoIncidente, body.descripcionFallo];
    if (required.some(v => !String(v || '').trim())) {
      return res.status(400).json({ error: 'Faltan campos obligatorios del reporte.' });
    }
    await client.query('BEGIN');
    const folio = await nextGarantiaFolio(client);
    const duplicated = await client.query(`SELECT 1 FROM garantias WHERE folio = $1 LIMIT 1`, [folio]);
    if (duplicated.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No se pudo reservar un folio único. Intenta nuevamente.' });
    }
    const fleetUnitId = await findFleetUnitIdByIdentity(body.empresa, body.numeroEconomico, client);
    const result = await client.query(
      `INSERT INTO garantias (
        id, folio, numero_obra, modelo, numero_economico, empresa, kilometraje, contacto_nombre, telefono, tipo_incidente,
        descripcion_fallo, solicita_refaccion, detalle_refaccion,
        estatus_validacion, estatus_operativo,
        evidencias, evidencias_refaccion, firma,
        reportado_por_id, reportado_por_nombre, reportado_por_email, fleet_unit_id,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'nueva','sin iniciar',$14::jsonb,$15::jsonb,$16,$17,$18,$19,$20,NOW()
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
        fleetUnitId,
      ]
    );
    await client.query('COMMIT');
    await addAuditLog(id, req.user.id, 'crear_reporte', `Reporte creado por ${req.user.nombre}`);
    notifyGarantiaWhatsApp('created', result.rows[0]).catch(() => {});
    notifySupervisorFlotasReport(result.rows[0], { manual: false, requestedBy: req.user })
      .then((outcome) => {
        if (!outcome?.ok) {
          console.warn(`[whatsapp][auto][supervisor] sin envio reporte=${result.rows[0].folio || result.rows[0].id} reason=${outcome?.reason || 'unknown'}`);
        }
      })
      .catch((error) => {
        console.error(`[whatsapp][auto][supervisor] error no controlado reporte=${result.rows[0].folio || result.rows[0].id}:`, error?.message || error);
      });
    res.status(201).json(mapGarantia(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error creando reporte:', error);
    res.status(500).json({ error: 'No se pudo crear el reporte.' });
  } finally {
    client.release();
  }
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

    const fleetUnitId = await findFleetUnitIdByIdentity(payload.empresa, payload.numeroEconomico);
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
        fleet_unit_id = COALESCE($16, fleet_unit_id),
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
        payload.firma,
        fleetUnitId
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

app.post('/api/garantias/:id/remind-supervisor', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const found = await pool.query('SELECT * FROM garantias WHERE id = $1 LIMIT 1', [req.params.id]);
    if (!found.rowCount) return res.status(404).json({ ok: false, error: 'Reporte no encontrado.' });
    const garantia = found.rows[0];
    const outcome = await notifySupervisorFlotasReport(garantia, { manual: true, requestedBy: req.user });

    if (outcome.ok) {
      const adminName = req.user?.nombre || req.user?.email || req.user?.id || 'Admin';
      const empresaName = garantia.empresa || outcome.supervisor?.empresa || '';
      const folio = garantia.folio || garantia.id || '';
      await addAuditLog(
        garantia.id,
        req.user.id,
        'recordatorio_supervisor_whatsapp',
        `Admin ${adminName} envió recordatorio al supervisor de la empresa ${empresaName} para reporte ${folio}`
      );
      return res.json({ ok: true, message: 'Recordatorio enviado al supervisor de flota.' });
    }

    if (outcome.reason === 'no_supervisor') {
      console.warn(`[whatsapp][manual][supervisor] reporte=${garantia.folio || garantia.id} sin supervisor para empresa="${garantia.empresa || ''}"`);
      return res.status(400).json({ ok: false, reason: outcome.reason, error: 'No hay supervisor de flota ligado a esta empresa.' });
    }
    if (outcome.reason === 'no_phone') {
      console.warn(`[whatsapp][manual][supervisor] reporte=${garantia.folio || garantia.id} supervisor sin telefono empresa="${garantia.empresa || ''}"`);
      return res.status(400).json({ ok: false, reason: outcome.reason, error: 'El supervisor de flota no tiene teléfono registrado.' });
    }
    if (outcome.reason === 'no_template') {
      console.warn(`[whatsapp][manual][supervisor] reporte=${garantia.folio || garantia.id} sin template configurada`);
      return res.status(400).json({ ok: false, reason: outcome.reason, error: 'No está configurada la plantilla de WhatsApp para supervisor.' });
    }

    console.error(`[whatsapp][manual][supervisor] reporte=${garantia.folio || garantia.id} fallo twilio`);
    return res.status(502).json({ ok: false, reason: 'twilio_error', error: 'No se pudo enviar el WhatsApp al supervisor.' });
  } catch (error) {
    console.error('Error enviando recordatorio al supervisor:', error?.message || error);
    return res.status(500).json({ ok: false, error: 'No se pudo enviar el WhatsApp al supervisor.' });
  }
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
  const params = [req.params.numeroEconomico];
  const where = [`${normalizedIdentitySql('numero_economico')} = ${normalizedIdentitySql('$1')}`];
  if (SUPERVISOR_ROLES.includes(req.user.role)) {
    params.push(req.user.empresa || '');
    where.push(`${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql(`$${params.length}`)}`);
  }
  const result = await pool.query(`SELECT * FROM garantias WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, params);
  res.json(result.rows.map(mapGarantia));
});


app.get('/api/schedules', authRequired, requireRoles('admin', 'operativo', 'supervisor', 'supervisor_flotas', 'operador'), async (req, res) => {
  try {
    const date = String(req.query.date || '').trim();
    const futureOnly = ['1', 'true', 'yes'].includes(String(req.query.futureOnly || '').toLowerCase());
    const requestedLimit = Number(req.query.limit || 300);
    const safeLimit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 50), 1000) : 300;
    const params = [];
    const where = [];
    if (date) {
      params.push(date);
      where.push(`DATE(sr.scheduled_for AT TIME ZONE 'UTC') = $${params.length}`);
    }
    if (futureOnly) {
      where.push(`COALESCE(sr.scheduled_for, sr.proposed_at, sr.requested_at) >= NOW() - INTERVAL '1 day'`);
    }
    if (SUPERVISOR_ROLES.includes(req.user.role)) {
      params.push(req.user.empresa || '');
      where.push(`${normalizedIdentitySql('COALESCE(g.empresa, sr.empresa)')} = ${normalizedIdentitySql(`$${params.length}`)}`);
    }
    if (req.user.role === 'operador') {
      params.push(req.user.id);
      where.push(`g.reportado_por_id = $${params.length}`);
    }
    params.push(safeLimit);
    const result = await pool.query(`
      SELECT sr.id, sr.garantia_id, sr.status, sr.notes, sr.requested_at, sr.proposed_at, sr.confirmed_at, sr.scheduled_for, sr.created_at, sr.updated_at,
        COALESCE(g.folio, sr.folio_manual) AS folio,
        COALESCE(g.numero_economico, sr.numero_economico) AS numero_economico,
        COALESCE(g.empresa, sr.empresa) AS empresa,
        COALESCE(g.contacto_nombre, sr.contacto_nombre) AS contacto_nombre,
        COALESCE(g.telefono, sr.telefono) AS telefono
      FROM schedule_requests sr
      LEFT JOIN garantias g ON g.id = sr.garantia_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY COALESCE(sr.scheduled_for, sr.proposed_at, sr.requested_at) ASC
      LIMIT $${params.length}
    `, params);
    res.json(result.rows.map(scheduleSummary));
  } catch (error) {
    console.error('Error leyendo agenda:', error?.message || error);
    res.json([]);
  }
});

app.post('/api/schedules/manual', authRequired, requireRoles('admin','operativo'), async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error guardando ingreso manual:', error);
    res.status(500).json({ error: 'No se pudo programar el ingreso manual.' });
  }
});

app.post('/api/garantias/:id/request-schedule', authRequired, requireRoles('admin', 'operativo', 'supervisor_flotas'), async (req, res) => {
  const current = await pool.query('SELECT * FROM garantias WHERE id = $1', [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Garantía no encontrada.' });
  const garantia = current.rows[0];
  if (req.user.role === 'supervisor_flotas' && normalizeIdentityValue(garantia.empresa || '') !== normalizeIdentityValue(req.user.empresa || '')) {
    return res.status(403).json({ error: 'No puedes programar reportes de otra empresa.' });
  }
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
    whereGarantias.push(`${normalizedIdentitySql('g.empresa')} = ${normalizedIdentitySql(`$${params.length}`)}`);
    whereSchedules.push(`${normalizedIdentitySql('g.empresa')} = ${normalizedIdentitySql(`$${params.length}`)}`);
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
    where.push(`${normalizedIdentitySql('fu.empresa')} = ${normalizedIdentitySql(`$${params.length}`)}`);
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
               WHERE ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', 'fu.empresa', 'fu.numero_economico')}
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
  try {
    const params = [];
    const where = [];
    if (SUPERVISOR_ROLES.includes(req.user.role)) {
      params.push(req.user.empresa || '');
      where.push(`${normalizedIdentitySql('fu.empresa')} = ${normalizedIdentitySql(`$${params.length}`)}`);
    }
    const result = await pool.query(`
    WITH unit_scope AS (
      SELECT fu.*,
        ${normalizedIdentitySql('fu.empresa')} AS empresa_key,
        ${normalizedIdentitySql('fu.numero_economico')} AS unidad_key
      FROM fleet_units fu
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ),
    garantia_stats AS (
      SELECT
        us.id AS fleet_unit_id,
        COUNT(g.*)::int AS reportes_count,
        COUNT(*) FILTER (
          WHERE g.id IS NOT NULL
            AND COALESCE(LOWER(TRIM(g.estatus_operativo)), '') NOT IN ('terminada','rechazada')
            AND (
              COALESCE(LOWER(TRIM(g.estatus_operativo)), '') IN ('sin iniciar','programada','en proceso','espera refacción')
              OR COALESCE(LOWER(TRIM(g.estatus_validacion)), '') IN ('nueva','pendiente de revisión','aceptada')
            )
        )::int AS open_reports_count,
        COUNT(*) FILTER (
          WHERE g.id IS NOT NULL
            AND COALESCE(LOWER(TRIM(g.estatus_operativo)), '') IN ('en proceso','espera refacción')
            AND COALESCE(LOWER(TRIM(g.estatus_operativo)), '') NOT IN ('terminada','rechazada')
        )::int AS critical_reports_count,
        COUNT(*) FILTER (
          WHERE g.id IS NOT NULL
            AND COALESCE(LOWER(TRIM(g.estatus_operativo)), '') NOT IN ('terminada','rechazada')
            AND COALESCE(LOWER(TRIM(g.estatus_operativo)), '') NOT IN ('en proceso','espera refacción')
            AND (
              COALESCE(LOWER(TRIM(g.estatus_operativo)), '') IN ('sin iniciar','programada')
              OR COALESCE(LOWER(TRIM(g.estatus_validacion)), '') IN ('nueva','pendiente de revisión','aceptada')
            )
        )::int AS warning_reports_count,
        MAX(g.created_at) AS last_report_at,
        MAX(g.created_at) FILTER (
          WHERE COALESCE(LOWER(TRIM(g.estatus_operativo)), '') NOT IN ('terminada','rechazada')
        ) AS last_open_report_at,
        MAX(g.updated_at) FILTER (WHERE COALESCE(g.estatus_operativo, '') <> '') AS last_operational_change_at,
        MAX(COALESCE(g.refaccion_updated_at, g.updated_at)) FILTER (WHERE g.solicita_refaccion = TRUE) AS last_refaccion_at,
        COUNT(*) FILTER (
          WHERE g.solicita_refaccion = TRUE
            AND COALESCE(LOWER(TRIM(g.refaccion_status)), 'pendiente') <> 'instalada'
            AND COALESCE(LOWER(TRIM(g.estatus_operativo)), '') NOT IN ('terminada','rechazada')
        )::int AS pending_parts_count,
        COUNT(*) FILTER (WHERE g.created_at >= NOW() - INTERVAL '30 days')::int AS reports_last_30d,
        (ARRAY_AGG(g.estatus_operativo ORDER BY g.created_at DESC))[1] AS ultimo_estatus_operativo
      FROM unit_scope us
      LEFT JOIN garantias g
        ON ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', 'us.empresa', 'us.numero_economico')}
      GROUP BY us.id
    ),
    campaign_stats AS (
      SELECT
        us.id AS fleet_unit_id,
        BOOL_OR(cu.status <> 'realizada') AS campaign_activa,
        MAX(cu.updated_at) AS last_campaign_at
      FROM unit_scope us
      LEFT JOIN campaign_units cu ON ${unitIdentityMatchSql('cu.empresa', 'cu.numero_economico', 'us.empresa', 'us.numero_economico')}
      GROUP BY us.id
    ),
    schedule_stats AS (
      SELECT
        us.id AS fleet_unit_id,
        MAX(COALESCE(sr.updated_at, sr.requested_at, sr.scheduled_for)) AS last_schedule_at
      FROM unit_scope us
      LEFT JOIN schedule_requests sr ON ${unitIdentityMatchSql("COALESCE(sr.empresa, '')", "COALESCE(sr.numero_economico, '')", 'us.empresa', 'us.numero_economico')}
      GROUP BY us.id
    ),
    cost_stats AS (
      SELECT
        fce.fleet_unit_id,
        COALESCE(SUM(CASE WHEN fce.tipo='refaccion' THEN fce.monto ELSE 0 END),0) AS costo_refacciones,
        COALESCE(SUM(CASE WHEN fce.tipo='mano_obra' THEN fce.monto ELSE 0 END),0) AS costo_mano_obra,
        COALESCE(SUM(fce.monto),0) AS costo_total
      FROM fleet_cost_entries fce
      GROUP BY fce.fleet_unit_id
    )
    SELECT us.*,
      COALESCE(us.manual_status, CASE WHEN COALESCE(cs.campaign_activa, false) THEN 'campaña activa' ELSE gs.ultimo_estatus_operativo END, 'sin actividad') AS estatus_operativo,
      CASE
        WHEN COALESCE(gs.pending_parts_count, 0) > 0 THEN 'critical'
        WHEN COALESCE(gs.open_reports_count, 0) > 0 THEN 'warning'
        ELSE 'ok'
      END AS status_auto,
      CASE
        WHEN COALESCE(NULLIF(TRIM(us.manual_status), ''), '') <> '' THEN us.manual_status
        ELSE CASE
          WHEN COALESCE(gs.pending_parts_count, 0) > 0 THEN 'critical'
          WHEN COALESCE(gs.open_reports_count, 0) > 0 THEN 'warning'
          ELSE 'ok'
        END
      END AS effective_status,
      COALESCE(gs.last_report_at, NULL) AS last_report_at,
      COALESCE(gs.last_open_report_at, NULL) AS last_open_report_at,
      COALESCE(gs.last_operational_change_at, NULL) AS last_operational_change_at,
      COALESCE(gs.last_refaccion_at, NULL) AS last_refaccion_at,
      COALESCE(ss.last_schedule_at, NULL) AS last_schedule_at,
      COALESCE(cs.last_campaign_at, NULL) AS last_campaign_at,
      GREATEST(
        COALESCE(gs.last_report_at, 'epoch'::timestamptz),
        COALESCE(gs.last_operational_change_at, 'epoch'::timestamptz),
        COALESCE(gs.last_refaccion_at, 'epoch'::timestamptz),
        COALESCE(ss.last_schedule_at, 'epoch'::timestamptz),
        COALESCE(cs.last_campaign_at, 'epoch'::timestamptz)
      ) AS last_movement_at,
      COALESCE(gs.reportes_count, 0) AS reportes_count,
      COALESCE(gs.open_reports_count, 0) AS open_reports_count,
      COALESCE(gs.pending_parts_count, 0) AS pending_parts_count,
      COALESCE(gs.critical_reports_count, 0) AS critical_reports_count,
      COALESCE(gs.warning_reports_count, 0) AS warning_reports_count,
      COALESCE(gs.reports_last_30d, 0) AS reports_last_30d,
      COALESCE(ct.costo_refacciones, 0) AS costo_refacciones,
      COALESCE(ct.costo_mano_obra, 0) AS costo_mano_obra,
      COALESCE(ct.costo_total, 0) AS costo_total
    FROM unit_scope us
    LEFT JOIN garantia_stats gs ON gs.fleet_unit_id = us.id
    LEFT JOIN campaign_stats cs ON cs.fleet_unit_id = us.id
    LEFT JOIN schedule_stats ss ON ss.fleet_unit_id = us.id
    LEFT JOIN cost_stats ct ON ct.fleet_unit_id = us.id
    ORDER BY us.empresa ASC, us.numero_economico ASC
    `, params);
    res.json(result.rows.map(mapFleetUnit));
  } catch (error) {
    console.error('Error leyendo unidades de flota:', error?.message || error);
    res.json([]);
  }
});

app.get('/api/fleet/analytics', authRequired, requireRoles('admin','operativo','supervisor','supervisor_flotas'), async (req, res) => {
  try {
    const params = [];
    const where = [];
    if (SUPERVISOR_ROLES.includes(req.user.role)) {
      params.push(req.user.empresa || '');
      where.push(`${normalizedIdentitySql('fu.empresa')} = ${normalizedIdentitySql(`$${params.length}`)}`);
    }

    const baseAnalyticsQuery = `
      WITH unit_scope AS (
        SELECT fu.*,
          ${normalizedIdentitySql('fu.empresa')} AS empresa_key,
          ${normalizedIdentitySql('fu.numero_economico')} AS unidad_key
        FROM fleet_units fu
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ),
      garantia_stats AS (
        SELECT
          us.id AS fleet_unit_id,
          COUNT(g.*)::int AS reportes_count,
          COUNT(*) FILTER (
            WHERE g.id IS NOT NULL
              AND COALESCE(LOWER(TRIM(g.estatus_operativo)), '') NOT IN ('terminada','rechazada')
              AND (
                COALESCE(LOWER(TRIM(g.estatus_operativo)), '') IN ('sin iniciar','programada','en proceso','espera refacción')
                OR COALESCE(LOWER(TRIM(g.estatus_validacion)), '') IN ('nueva','pendiente de revisión','aceptada')
              )
          )::int AS open_reports_count,
          COUNT(*) FILTER (
            WHERE g.id IS NOT NULL
              AND COALESCE(LOWER(TRIM(g.estatus_operativo)), '') IN ('en proceso','espera refacción')
              AND COALESCE(LOWER(TRIM(g.estatus_operativo)), '') NOT IN ('terminada','rechazada')
          )::int AS critical_reports_count,
          COUNT(*) FILTER (
            WHERE g.id IS NOT NULL
              AND COALESCE(LOWER(TRIM(g.estatus_operativo)), '') NOT IN ('terminada','rechazada')
              AND COALESCE(LOWER(TRIM(g.estatus_operativo)), '') NOT IN ('en proceso','espera refacción')
              AND (
                COALESCE(LOWER(TRIM(g.estatus_operativo)), '') IN ('sin iniciar','programada')
                OR COALESCE(LOWER(TRIM(g.estatus_validacion)), '') IN ('nueva','pendiente de revisión','aceptada')
              )
          )::int AS warning_reports_count,
          COUNT(*) FILTER (
            WHERE g.solicita_refaccion = TRUE
              AND COALESCE(LOWER(TRIM(g.refaccion_status)), 'pendiente') <> 'instalada'
              AND COALESCE(LOWER(TRIM(g.estatus_operativo)), '') NOT IN ('terminada','rechazada')
          )::int AS pending_parts_count,
          MAX(g.created_at) AS last_report_at,
          MAX(g.created_at) FILTER (
            WHERE COALESCE(LOWER(TRIM(g.estatus_operativo)), '') NOT IN ('terminada','rechazada')
          ) AS last_open_report_at,
          MAX(COALESCE(g.refaccion_updated_at, g.updated_at)) FILTER (WHERE g.solicita_refaccion = TRUE) AS last_refaccion_at,
          COUNT(*) FILTER (WHERE g.created_at >= NOW() - INTERVAL '30 days')::int AS reports_last_30d
        FROM unit_scope us
        LEFT JOIN garantias g ON ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', 'us.empresa', 'us.numero_economico')}
        GROUP BY us.id
      ),
      cost_stats AS (
        SELECT fce.fleet_unit_id, COALESCE(SUM(fce.monto),0) AS costo_total
        FROM fleet_cost_entries fce
        GROUP BY fce.fleet_unit_id
      ),
      unit_kpis AS (
        SELECT
          us.id,
          us.empresa,
          us.numero_economico,
          us.modelo,
          us.manual_status,
          COALESCE(gs.open_reports_count, 0) AS open_reports_count,
          COALESCE(gs.pending_parts_count, 0) AS pending_parts_count,
          COALESCE(gs.critical_reports_count, 0) AS critical_reports_count,
          COALESCE(gs.warning_reports_count, 0) AS warning_reports_count,
          COALESCE(gs.reportes_count, 0) AS reportes_count,
          COALESCE(gs.reports_last_30d, 0) AS reports_last_30d,
          gs.last_report_at,
          gs.last_open_report_at,
          gs.last_refaccion_at,
          COALESCE(ct.costo_total, 0) AS costo_total,
          CASE
            WHEN COALESCE(gs.pending_parts_count, 0) > 0 THEN 'critical'
            WHEN COALESCE(gs.open_reports_count, 0) > 0 THEN 'warning'
            ELSE 'ok'
          END AS status_auto
        FROM unit_scope us
        LEFT JOIN garantia_stats gs ON gs.fleet_unit_id = us.id
        LEFT JOIN cost_stats ct ON ct.fleet_unit_id = us.id
      )
    `;

    const [summaryQ, topQ, trendQ] = await Promise.all([
      pool.query(`
        ${baseAnalyticsQuery}
        SELECT
          COUNT(*)::int AS total_units,
          COUNT(*) FILTER (WHERE status_auto = 'critical')::int AS critical_units,
          COUNT(*) FILTER (WHERE status_auto = 'warning')::int AS warning_units,
          COUNT(*) FILTER (WHERE status_auto = 'ok')::int AS ok_units,
          COALESCE(SUM(open_reports_count),0)::int AS open_reports,
          COALESCE(SUM(pending_parts_count),0)::int AS critical_open_reports,
          COUNT(*) FILTER (WHERE reports_last_30d >= 2)::int AS units_with_recurrence,
          ROUND(COALESCE(AVG(open_reports_count), 0)::numeric, 2) AS avg_open_reports_per_unit
        FROM unit_kpis
      `, params),
      pool.query(`
        ${baseAnalyticsQuery}
        SELECT
          uk.id AS unit_id,
          uk.numero_economico,
          uk.empresa,
          uk.modelo,
          uk.status_auto,
          COALESCE(NULLIF(TRIM(uk.manual_status), ''), uk.status_auto) AS effective_status,
          uk.open_reports_count,
          uk.pending_parts_count,
          uk.critical_reports_count,
          uk.reports_last_30d AS total_reports_last_30d,
          uk.last_report_at,
          uk.last_open_report_at,
          uk.last_refaccion_at,
          uk.costo_total
        FROM unit_kpis uk
        ORDER BY
          CASE WHEN uk.status_auto = 'critical' THEN 0 WHEN uk.status_auto = 'warning' THEN 1 ELSE 2 END ASC,
          COALESCE(uk.last_open_report_at, uk.last_refaccion_at, uk.last_report_at) ASC NULLS LAST,
          uk.open_reports_count DESC,
          uk.costo_total DESC
        LIMIT 10
      `, params),
      pool.query(`
        WITH days AS (
          SELECT generate_series((CURRENT_DATE - INTERVAL '13 days')::date, CURRENT_DATE::date, INTERVAL '1 day')::date AS day
        ),
        scoped_reports AS (
          SELECT DISTINCT g.id, g.created_at::date AS day
          FROM garantias g
          JOIN fleet_units fu ON ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', 'fu.empresa', 'fu.numero_economico')}
          ${SUPERVISOR_ROLES.includes(req.user.role) ? `WHERE ${normalizedIdentitySql('fu.empresa')} = ${normalizedIdentitySql('$1')}` : ''}
        )
        SELECT d.day::text AS day, COALESCE(COUNT(sr.day),0)::int AS reports
        FROM days d
        LEFT JOIN scoped_reports sr ON sr.day = d.day
        GROUP BY d.day
        ORDER BY d.day ASC
      `, SUPERVISOR_ROLES.includes(req.user.role) ? [req.user.empresa || ''] : []),
    ]);

    const summary = summaryQ.rows[0] || {};
    const topProblemUnits = (topQ.rows || []).map((row) => ({
      unitId: row.unit_id,
      numeroEconomico: row.numero_economico || '',
      empresa: row.empresa || '',
      modelo: row.modelo || '',
      statusAuto: row.status_auto || 'ok',
      effectiveStatus: row.effective_status || row.status_auto || 'ok',
      openReportsCount: Number(row.open_reports_count || 0),
      pendingPartsCount: Number(row.pending_parts_count || 0),
      criticalReportsCount: Number(row.critical_reports_count || 0),
      totalReportsLast30d: Number(row.total_reports_last_30d || 0),
      recurrenceLevel: Number(row.total_reports_last_30d || 0) >= 4 ? 'high' : Number(row.total_reports_last_30d || 0) >= 2 ? 'medium' : 'normal',
      lastReportAt: row.last_report_at || null,
      lastOpenReportAt: row.last_open_report_at || null,
      lastRefaccionAt: row.last_refaccion_at || null,
      costoTotal: Number(row.costo_total || 0),
    }));

    res.json({
      totalUnits: Number(summary.total_units || 0),
      criticalUnits: Number(summary.critical_units || 0),
      warningUnits: Number(summary.warning_units || 0),
      okUnits: Number(summary.ok_units || 0),
      openReports: Number(summary.open_reports || 0),
      criticalOpenReports: Number(summary.critical_open_reports || 0),
      unitsWithRecurrence: Number(summary.units_with_recurrence || 0),
      avgOpenReportsPerUnit: Number(summary.avg_open_reports_per_unit || 0),
      topProblemUnits,
      recentTrend: (trendQ.rows || []).map(row => ({ day: row.day, reports: Number(row.reports || 0) })),
    });
  } catch (error) {
    console.error('Error leyendo analytics de flota:', error?.message || error);
    res.status(500).json({
      totalUnits: 0, criticalUnits: 0, warningUnits: 0, okUnits: 0,
      openReports: 0, criticalOpenReports: 0, unitsWithRecurrence: 0, avgOpenReportsPerUnit: 0,
      topProblemUnits: [], recentTrend: []
    });
  }
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
  await backfillFleetUnitIdForGarantiasByIdentity(empresa, numeroEconomico, result.rows[0].id);
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
  await backfillFleetUnitIdForGarantiasByIdentity(empresa, numeroEconomico, result.rows[0].id);
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
  try {
    const params = [req.params.id];
    let extra = '';
    if (SUPERVISOR_ROLES.includes(req.user.role)) {
      params.push(req.user.empresa || '');
      extra = ` AND ${normalizedIdentitySql('fu.empresa')} = ${normalizedIdentitySql(`$${params.length}`)}`;
    }
    let unit = await pool.query(`
    SELECT fu.*,
      COALESCE((SELECT SUM(CASE WHEN tipo='refaccion' THEN monto ELSE 0 END) FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = fu.id),0) AS costo_refacciones,
      COALESCE((SELECT SUM(CASE WHEN tipo='mano_obra' THEN monto ELSE 0 END) FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = fu.id),0) AS costo_mano_obra,
      COALESCE((SELECT SUM(monto) FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = fu.id),0) AS costo_total
    FROM fleet_units fu WHERE fu.id = $1 ${extra}
    `, params);
    if (!unit.rowCount) {
      const altParams = [req.params.id];
      if (SUPERVISOR_ROLES.includes(req.user.role)) altParams.push(req.user.empresa || '');
      unit = await pool.query(`
        SELECT fu.*,
          COALESCE((SELECT SUM(CASE WHEN tipo='refaccion' THEN monto ELSE 0 END) FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = fu.id),0) AS costo_refacciones,
          COALESCE((SELECT SUM(CASE WHEN tipo='mano_obra' THEN monto ELSE 0 END) FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = fu.id),0) AS costo_mano_obra,
          COALESCE((SELECT SUM(monto) FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = fu.id),0) AS costo_total
        FROM fleet_units fu
        WHERE ${identityEqualsSql('fu.numero_economico', '$1')}
        ${SUPERVISOR_ROLES.includes(req.user.role) ? `AND ${normalizedIdentitySql('fu.empresa')} = ${normalizedIdentitySql('$2')}` : ""}
        ORDER BY fu.updated_at DESC
        LIMIT 1
      `, altParams);
    }
    if (!unit.rowCount) return res.json({ unit: null, stats: { reports: 0, costs: 0, campaigns: 0, parts: 0, images: 0, schedules: 0 } });
    const u = unit.rows[0];
    const statsQ = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM garantias g WHERE ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', '$1', '$2')}) AS reports,
        (SELECT COUNT(*)::int FROM fleet_cost_entries fce WHERE fce.fleet_unit_id = $3) AS costs,
        (SELECT COUNT(*)::int FROM campaign_units cu WHERE ${unitIdentityMatchSql('cu.empresa', 'cu.numero_economico', '$1', '$2')}) AS campaigns,
        (SELECT COUNT(*)::int FROM garantias g WHERE g.solicita_refaccion = TRUE AND COALESCE(g.refaccion_status,'pendiente') <> 'instalada' AND ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', '$1', '$2')}) AS parts,
        (SELECT COUNT(*)::int FROM schedule_requests sr WHERE ${unitIdentityMatchSql('COALESCE(sr.empresa, \'\')', 'COALESCE(sr.numero_economico, \'\')', '$1', '$2')} AND COALESCE(sr.status,'') <> 'cancelled') AS schedules
    `, [u.empresa, u.numero_economico, u.id]);
    const stats = statsQ.rows[0] || {};
    res.json({
      unit: mapFleetUnit(u),
      stats: {
        reports: Number(stats.reports || 0),
        costs: Number(stats.costs || 0),
        campaigns: Number(stats.campaigns || 0),
        parts: Number(stats.parts || 0),
        images: 0,
        schedules: Number(stats.schedules || 0),
      }
    });
  } catch (error) {
    console.error('Error leyendo detalle de unidad:', error?.message || error);
    res.json({ unit: null, stats: { reports: 0, costs: 0, campaigns: 0, parts: 0, images: 0, schedules: 0 } });
  }
});

app.get('/api/fleet/units/:id/details', authRequired, requireRoles('admin','operativo','supervisor','supervisor_flotas'), async (req, res) => {
  try {
    const unit = await pool.query(`SELECT * FROM fleet_units WHERE id = $1 ${SUPERVISOR_ROLES.includes(req.user.role) ? `AND ${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql('$2')}` : ''} LIMIT 1`, SUPERVISOR_ROLES.includes(req.user.role) ? [req.params.id, req.user.empresa || ''] : [req.params.id]);
    if (!unit.rowCount) return res.json({ reports: [], costs: [], campaigns: [], schedules: [], parts: [] });
    const u = unit.rows[0];
    await backfillFleetUnitIdForGarantiasByIdentity(u.empresa, u.numero_economico, u.id);
    const reportsCompanyGuard = SUPERVISOR_ROLES.includes(req.user.role)
      ? `AND ${normalizedIdentitySql('g.empresa')} = ${normalizedIdentitySql('$2')}`
      : '';
    const [reports, costs, schedules, parts] = await Promise.all([
      pool.query(`
        SELECT *
        FROM garantias g
        WHERE (
          g.fleet_unit_id = $1
          OR (
            ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', '$2', '$3')}
          )
        )
        ${reportsCompanyGuard}
        ORDER BY
          CASE WHEN g.fleet_unit_id = $1 THEN 0 ELSE 1 END,
          g.created_at DESC
        LIMIT 100
      `, [u.id, u.empresa, u.numero_economico]),
      pool.query(`SELECT * FROM fleet_cost_entries WHERE fleet_unit_id = $1 ORDER BY created_at DESC LIMIT 200`, [u.id]),
      pool.query(`SELECT id, status, notes, requested_at, proposed_at, confirmed_at, scheduled_for, created_at, updated_at, empresa, numero_economico FROM schedule_requests WHERE ${unitIdentityMatchSql('COALESCE(empresa, \'\')', 'COALESCE(numero_economico, \'\')', '$1', '$2')} AND COALESCE(status,'') <> 'cancelled' ORDER BY COALESCE(scheduled_for, proposed_at, requested_at) ASC LIMIT 50`, [u.empresa, u.numero_economico]),
      pool.query(`SELECT id, folio, detalle_refaccion, refaccion_status, refaccion_asignada, refaccion_updated_at, updated_at, evidencias_refaccion FROM garantias WHERE solicita_refaccion = TRUE AND COALESCE(refaccion_status, 'pendiente') <> 'instalada' AND ${unitIdentityMatchSql('empresa', 'numero_economico', '$1', '$2')} ORDER BY COALESCE(refaccion_updated_at, updated_at) DESC LIMIT 50`, [u.empresa, u.numero_economico]),
    ]);
    let campaigns = { rows: [] };
    try {
      campaigns = await pool.query(`SELECT cu.*, COALESCE(cg.nombre, cg.campaign_nombre, cg.campaign_name, '') AS campaign_nombre FROM campaign_units cu JOIN campaign_groups cg ON cg.id = cu.campaign_group_id WHERE ${unitIdentityMatchSql('cu.empresa', 'cu.numero_economico', '$1', '$2')} ORDER BY cu.updated_at DESC LIMIT 50`, [u.empresa, u.numero_economico]);
    } catch {}
    res.json({
      reports: reports.rows.map(mapGarantia),
      costs: costs.rows.map(mapFleetCost),
      campaigns: campaigns.rows.map(r => ({ id:r.id, campaignGroupId:r.campaign_group_id, nombre:r.campaign_nombre || '', empresa:r.empresa || '', numeroEconomico:r.numero_economico || '', status:r.status || 'sin_programar', evidencia:Array.isArray(r.evidencia)?r.evidencia:[], notas:r.notas || '', updatedAt:r.updated_at })),
      schedules: schedules.rows.map(row => ({
        id: row.id,
        status: row.status || '',
        notes: row.notes || '',
        requestedAt: row.requested_at || null,
        proposedAt: row.proposed_at || null,
        confirmedAt: row.confirmed_at || null,
        scheduledFor: row.scheduled_for || null,
        updatedAt: row.updated_at || null,
      })),
      parts: parts.rows.map(row => ({ id: row.id, folio: row.folio || '', detalleRefaccion: row.detalle_refaccion || '', refaccionStatus: row.refaccion_status || 'pendiente', refaccionAsignada: row.refaccion_asignada || '', refaccionUpdatedAt: row.refaccion_updated_at, updatedAt: row.updated_at, evidenciasRefaccion: Array.isArray(row.evidencias_refaccion) ? row.evidencias_refaccion : [] })),
    });
  } catch (error) {
    console.error('Error leyendo bloques de detalle flota:', error?.message || error);
    res.json({ reports: [], costs: [], campaigns: [], schedules: [], parts: [] });
  }
});

app.get('/api/fleet/units/:id/reports', authRequired, requireRoles('admin','operativo','supervisor','supervisor_flotas'), async (req, res) => {
  try {
    const unit = await pool.query(`SELECT * FROM fleet_units WHERE id = $1 ${SUPERVISOR_ROLES.includes(req.user.role) ? `AND ${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql('$2')}` : ''} LIMIT 1`, SUPERVISOR_ROLES.includes(req.user.role) ? [req.params.id, req.user.empresa || ''] : [req.params.id]);
    if (!unit.rowCount) return res.json([]);
    const u = unit.rows[0];
    await backfillFleetUnitIdForGarantiasByIdentity(u.empresa, u.numero_economico, u.id);
    const reportsCompanyGuard = SUPERVISOR_ROLES.includes(req.user.role)
      ? `AND ${normalizedIdentitySql('g.empresa')} = ${normalizedIdentitySql('$2')}`
      : '';
    const reports = await pool.query(`
      SELECT g.id, g.folio, g.descripcion_fallo, g.estatus_validacion, g.estatus_operativo, g.created_at, g.updated_at, g.evidencias, g.evidencias_refaccion
      FROM garantias g
      WHERE (
        g.fleet_unit_id = $1
        OR (
          ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', '$2', '$3')}
        )
      )
      ${reportsCompanyGuard}
      ORDER BY
        CASE WHEN g.fleet_unit_id = $1 THEN 0 ELSE 1 END,
        g.created_at DESC
      LIMIT 100
    `, [u.id, u.empresa, u.numero_economico]);
    res.json(reports.rows.map(row => ({
      id: row.id,
      folio: row.folio || '',
      descripcionFallo: row.descripcion_fallo || '',
      estatusValidacion: row.estatus_validacion || '',
      estatusOperativo: row.estatus_operativo || '',
      evidencias: Array.isArray(row.evidencias) ? row.evidencias.filter(Boolean) : [],
      evidenciasRefaccion: Array.isArray(row.evidencias_refaccion) ? row.evidencias_refaccion.filter(Boolean) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    console.error('Error leyendo reportes de unidad:', error?.message || error);
    res.json([]);
  }
});

app.get('/api/fleet/units/:id/activity', authRequired, requireRoles('admin','operativo','supervisor','supervisor_flotas'), async (req, res) => {
  try {
    const unit = await pool.query(`SELECT * FROM fleet_units WHERE id = $1 ${SUPERVISOR_ROLES.includes(req.user.role) ? `AND ${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql('$2')}` : ''} LIMIT 1`, SUPERVISOR_ROLES.includes(req.user.role) ? [req.params.id, req.user.empresa || ''] : [req.params.id]);
    if (!unit.rowCount) return res.json([]);
    const u = unit.rows[0];
    const activity = await pool.query(`
      WITH feed AS (
        SELECT 'reporte'::text AS tipo, COALESCE(g.folio,'GAR-—') AS titulo, COALESCE(g.descripcion_fallo,'Reporte levantado') AS detalle, g.created_at AS fecha
        FROM garantias g
        WHERE g.fleet_unit_id = $1
           OR (g.fleet_unit_id IS NULL
             AND ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', '$2', '$3')})
        ORDER BY g.created_at DESC
        LIMIT 3
      )
      SELECT * FROM feed
      UNION ALL
      SELECT 'refaccion', COALESCE(g.folio,'GAR-—'), COALESCE(g.detalle_refaccion,'Refacción actualizada'), COALESCE(g.refaccion_updated_at,g.updated_at)
      FROM garantias g
      WHERE g.solicita_refaccion = TRUE
        AND (g.fleet_unit_id = $1
          OR (g.fleet_unit_id IS NULL
            AND ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', '$2', '$3')}))
      ORDER BY 4 DESC
      LIMIT 3
    `, [u.id, u.empresa, u.numero_economico]);
    const schedules = await pool.query(`
      SELECT 'agenda'::text AS tipo, COALESCE(status,'programada') AS titulo, COALESCE(notes,'Movimiento de agenda') AS detalle, COALESCE(updated_at,requested_at) AS fecha
      FROM schedule_requests
      WHERE ${unitIdentityMatchSql('COALESCE(empresa, \'\')', 'COALESCE(numero_economico, \'\')', '$1', '$2')}
      ORDER BY COALESCE(updated_at,requested_at) DESC
      LIMIT 2
    `, [u.empresa, u.numero_economico]);
    const campaigns = await pool.query(`
      SELECT 'campaña'::text AS tipo, COALESCE(cg.nombre, cg.campaign_nombre, cg.campaign_name,'Campaña') AS titulo, COALESCE(cu.status,'sin_programar') AS detalle, cu.updated_at AS fecha
      FROM campaign_units cu
      JOIN campaign_groups cg ON cg.id = cu.campaign_group_id
      WHERE ${unitIdentityMatchSql('cu.empresa', 'cu.numero_economico', '$1', '$2')}
      ORDER BY cu.updated_at DESC
      LIMIT 2
    `, [u.empresa, u.numero_economico]);
    const costs = await pool.query(`SELECT 'costo'::text AS tipo, COALESCE(tipo,'costo') AS titulo, COALESCE(concepto,'Costo registrado') AS detalle, created_at AS fecha FROM fleet_cost_entries WHERE fleet_unit_id = $1 ORDER BY created_at DESC LIMIT 2`, [u.id]);
    const merged = [...activity.rows, ...schedules.rows, ...campaigns.rows, ...costs.rows]
      .filter(r => r.fecha)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 8);
    res.json(merged.map(r => ({ tipo: r.tipo, titulo: r.titulo, detalle: r.detalle, fecha: r.fecha })));
  } catch (error) {
    console.error('Error leyendo actividad de unidad:', error?.message || error);
    res.json([]);
  }
});

app.get('/api/fleet/units/:id/evidence', authRequired, requireRoles('admin','operativo','supervisor','supervisor_flotas'), async (req, res) => {
  try {
    const unit = await pool.query(`SELECT * FROM fleet_units WHERE id = $1 ${SUPERVISOR_ROLES.includes(req.user.role) ? `AND ${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql('$2')}` : ''} LIMIT 1`, SUPERVISOR_ROLES.includes(req.user.role) ? [req.params.id, req.user.empresa || ''] : [req.params.id]);
    if (!unit.rowCount) return res.json([]);
    const u = unit.rows[0];
    const rows = await pool.query(`
      WITH report_imgs AS (
        SELECT jsonb_array_elements_text(COALESCE(g.evidencias, '[]'::jsonb)) AS img
        FROM garantias g
        WHERE g.fleet_unit_id = $1
           OR (g.fleet_unit_id IS NULL
             AND ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', '$2', '$3')})
        LIMIT 18
      ),
      ref_imgs AS (
        SELECT jsonb_array_elements_text(COALESCE(g.evidencias_refaccion, '[]'::jsonb)) AS img
        FROM garantias g
        WHERE g.fleet_unit_id = $1
           OR (g.fleet_unit_id IS NULL
             AND ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', '$2', '$3')})
        LIMIT 18
      )
      SELECT DISTINCT img FROM (
        SELECT img FROM report_imgs
        UNION ALL
        SELECT img FROM ref_imgs
      ) z
      WHERE COALESCE(img,'') <> ''
      LIMIT 24
    `, [u.id, u.empresa, u.numero_economico]);
    res.json(rows.rows.map(r => r.img).filter(Boolean));
  } catch (error) {
    console.error('Error leyendo evidencias de unidad:', error?.message || error);
    res.json([]);
  }
});

app.get('/api/fleet/units/:id/campaigns', authRequired, requireRoles('admin','operativo','supervisor','supervisor_flotas'), async (req, res) => {
  try {
    const unit = await pool.query(`SELECT * FROM fleet_units WHERE id = $1 ${SUPERVISOR_ROLES.includes(req.user.role) ? `AND ${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql('$2')}` : ''} LIMIT 1`, SUPERVISOR_ROLES.includes(req.user.role) ? [req.params.id, req.user.empresa || ''] : [req.params.id]);
    if (!unit.rowCount) return res.json([]);
    const u = unit.rows[0];
    const campaigns = await pool.query(`
      SELECT cu.*, COALESCE(cg.nombre, cg.campaign_nombre, cg.campaign_name, '') AS campaign_nombre
      FROM campaign_units cu
      JOIN campaign_groups cg ON cg.id = cu.campaign_group_id
      WHERE ${unitIdentityMatchSql('cu.empresa', 'cu.numero_economico', '$1', '$2')}
      ORDER BY cu.updated_at DESC
      LIMIT 50
    `, [u.empresa, u.numero_economico]);
    res.json(campaigns.rows.map(r => ({ id:r.id, campaignGroupId:r.campaign_group_id, nombre:r.campaign_nombre || '', empresa:r.empresa || '', numeroEconomico:r.numero_economico || '', status:r.status || 'sin_programar', evidencia:Array.isArray(r.evidencia)?r.evidencia:[], notas:r.notas || '', updatedAt:r.updated_at })));
  } catch (error) {
    console.error('Error leyendo campañas de unidad:', error?.message || error);
    res.json([]);
  }
});

app.get('/api/fleet/units/:id/schedules', authRequired, requireRoles('admin','operativo','supervisor','supervisor_flotas'), async (req, res) => {
  try {
    const unit = await pool.query(`SELECT * FROM fleet_units WHERE id = $1 ${SUPERVISOR_ROLES.includes(req.user.role) ? `AND ${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql('$2')}` : ''} LIMIT 1`, SUPERVISOR_ROLES.includes(req.user.role) ? [req.params.id, req.user.empresa || ''] : [req.params.id]);
    if (!unit.rowCount) return res.json([]);
    const u = unit.rows[0];
    const schedules = await pool.query(`
      SELECT id, status, notes, requested_at, proposed_at, confirmed_at, scheduled_for, created_at, updated_at
      FROM schedule_requests
      WHERE ${unitIdentityMatchSql('COALESCE(empresa, \'\')', 'COALESCE(numero_economico, \'\')', '$1', '$2')}
        AND COALESCE(status,'') <> 'cancelled'
      ORDER BY COALESCE(scheduled_for, proposed_at, requested_at) ASC
      LIMIT 40
    `, [u.empresa, u.numero_economico]);
    res.json(schedules.rows.map(row => ({ id: row.id, status: row.status || '', notes: row.notes || '', requestedAt: row.requested_at || null, proposedAt: row.proposed_at || null, confirmedAt: row.confirmed_at || null, scheduledFor: row.scheduled_for || null, updatedAt: row.updated_at || null })));
  } catch (error) {
    console.error('Error leyendo agenda de unidad:', error?.message || error);
    res.json([]);
  }
});

app.get('/api/fleet/units/:id/parts', authRequired, requireRoles('admin','operativo','supervisor','supervisor_flotas'), async (req, res) => {
  try {
    const unit = await pool.query(`SELECT * FROM fleet_units WHERE id = $1 ${SUPERVISOR_ROLES.includes(req.user.role) ? `AND ${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql('$2')}` : ''} LIMIT 1`, SUPERVISOR_ROLES.includes(req.user.role) ? [req.params.id, req.user.empresa || ''] : [req.params.id]);
    if (!unit.rowCount) return res.json([]);
    const u = unit.rows[0];
    const parts = await pool.query(`
      SELECT id, folio, detalle_refaccion, refaccion_status, refaccion_asignada, refaccion_updated_at, updated_at, evidencias_refaccion
      FROM garantias g
      WHERE g.solicita_refaccion = TRUE
        AND COALESCE(g.refaccion_status, 'pendiente') <> 'instalada'
        AND (g.fleet_unit_id = $1
          OR (g.fleet_unit_id IS NULL
            AND ${unitIdentityMatchSql('g.empresa', 'g.numero_economico', '$2', '$3')}))
      ORDER BY COALESCE(refaccion_updated_at, updated_at) DESC
      LIMIT 50
    `, [u.id, u.empresa, u.numero_economico]);
    res.json(parts.rows.map(row => ({ id: row.id, folio: row.folio || '', detalleRefaccion: row.detalle_refaccion || '', refaccionStatus: row.refaccion_status || 'pendiente', refaccionAsignada: row.refaccion_asignada || '', refaccionUpdatedAt: row.refaccion_updated_at, updatedAt: row.updated_at, evidenciasRefaccion: Array.isArray(row.evidencias_refaccion) ? row.evidencias_refaccion : [] })));
  } catch (error) {
    console.error('Error leyendo refacciones de unidad:', error?.message || error);
    res.json([]);
  }
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





app.get('/api/campaigns', authRequired, requireRoles('admin','operativo','supervisor_flotas'), async (req, res) => {
  try {
    const params = [];
    const where = [];
    if (req.user.role === 'supervisor_flotas') {
      params.push(req.user.empresa || '');
      where.push(identityEqualsSql('cg.empresa', `$${params.length}`));
    }
    const groups = await pool.query(`
      SELECT cg.*, COALESCE(cg.nombre, cg.campaign_nombre, cg.campaign_name, '') AS nombre_resuelto, COUNT(cu.id)::int AS unidades,
             COUNT(*) FILTER (WHERE cu.status = 'sin_programar')::int AS sin_programar,
             COUNT(*) FILTER (WHERE cu.status = 'programada')::int AS programadas,
             COUNT(*) FILTER (WHERE cu.status = 'realizada')::int AS realizadas
      FROM campaign_groups cg
      LEFT JOIN campaign_units cu ON cu.campaign_group_id = cg.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      GROUP BY cg.id
      ORDER BY cg.updated_at DESC, cg.created_at DESC
    `, params);
    res.json(groups.rows.map(r => ({ id:r.id, nombre:r.nombre || r.campaign_nombre || r.campaign_name || '', empresa:r.empresa || '', notas:r.notas || '', unidades:Number(r.unidades||0), sinProgramar:Number(r.sin_programar||0), programadas:Number(r.programadas||0), realizadas:Number(r.realizadas||0), createdAt:r.created_at, updatedAt:r.updated_at })));
  } catch (error) {
    console.error('Error leyendo campañas:', error?.message || error);
    res.json([]);
  }
});

app.post('/api/campaigns', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const empresa = String(req.body.empresa || '').trim();
    const notas = String(req.body.notas || '').trim();
    if (!nombre || !empresa) return res.status(400).json({ error:'Nombre y empresa son obligatorios.' });
    const columns = await getCampaignGroupColumns();
    const id = cryptoRandomId();
    const nameCols = [];
    const values = [id];
    const pushValue = (column, value) => { values.push(value); nameCols.push(column); };
    if (columns.nombre) pushValue('nombre', nombre);
    if (columns.campaign_nombre) pushValue('campaign_nombre', nombre);
    if (columns.campaign_name) pushValue('campaign_name', nombre);
    if (!nameCols.length) return res.status(500).json({ error:'No hay columnas de nombre disponibles en campaign_groups.' });
    values.push(empresa, notas, req.user.id, req.user.nombre);
    const baseIndex = 1 + nameCols.length;
    const result = await pool.query(`
      INSERT INTO campaign_groups (id, ${nameCols.join(', ')}, empresa, notas, created_by_id, created_by_nombre)
      VALUES ($1, ${nameCols.map((_, idx) => `$${idx + 2}`).join(', ')}, $${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})
      RETURNING *
    `, values);
    res.status(201).json(result.rows[0]);
  } catch (error) { console.error('Error creando campaña:', error); res.status(500).json({ error:'No se pudo crear la campaña.' }); }
});

app.patch('/api/campaigns/:id', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const empresa = String(req.body.empresa || '').trim();
    const notas = String(req.body.notas || '').trim();
    if (!nombre || !empresa) return res.status(400).json({ error:'Nombre y empresa son obligatorios.' });
    const columns = await getCampaignGroupColumns();
    const nameUpdate = buildCampaignGroupNameUpdate(columns, nombre, 2);
    const values = [req.params.id, ...nameUpdate.values, empresa, notas];
    const setClauses = [...nameUpdate.sets];
    setClauses.push(`empresa = $${values.length - 1}`);
    setClauses.push(`notas = $${values.length}`);
    setClauses.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE campaign_groups SET ${setClauses.join(', ')} WHERE id=$1 RETURNING *`, values);
    if (!result.rowCount) return res.status(404).json({ error:'Campaña no encontrada.' });
    await markFleetCampaignFlagsForCompany(empresa);
    res.json(result.rows[0]);
  } catch (error) { console.error('Error actualizando campaña:', error); res.status(500).json({ error:'No se pudo actualizar la campaña.' }); }
});


app.delete('/api/campaigns/:id', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const existing = await pool.query(`SELECT * FROM campaign_groups WHERE id=$1`, [req.params.id]);
    if (!existing.rowCount) return res.status(404).json({ error:'Campaña no encontrada.' });
    const empresa = existing.rows[0].empresa || '';
    await pool.query(`DELETE FROM campaign_groups WHERE id=$1`, [req.params.id]);
    await markFleetCampaignFlagsForCompany(empresa);
    res.json({ ok:true });
  } catch (error) {
    console.error('Error eliminando campaña:', error);
    res.status(500).json({ error:'No se pudo eliminar la campaña.' });
  }
});

app.get('/api/campaigns/:id/units', authRequired, requireRoles('admin','operativo','supervisor_flotas'), async (req, res) => {
  try {
    const group = await pool.query(`SELECT * FROM campaign_groups WHERE id = $1`, [req.params.id]);
    if (!group.rowCount) return res.status(404).json({ error:'Campaña no encontrada.' });
    if (req.user.role === 'supervisor_flotas' && normalizeIdentityValue(group.rows[0].empresa) !== normalizeIdentityValue(req.user.empresa || '')) return res.status(403).json({ error:'Sin acceso a esta campaña.' });
    const units = await pool.query(`
      WITH garantia_stats AS (
        SELECT
          ${normalizedIdentitySql('g.empresa')} AS empresa_key,
          ${normalizedIdentitySql('g.numero_economico')} AS unidad_key,
          COUNT(*)::int AS reportes_count,
          MAX(g.created_at) AS last_report_at
        FROM garantias g
        GROUP BY 1,2
      )
      SELECT cu.*, fu.id AS fleet_unit_id, fu.numero_obra, fu.marca, fu.modelo, fu.anio, fu.kilometraje, fu.poliza_activa,
             COALESCE(gs.reportes_count,0) AS reportes_count,
             gs.last_report_at AS last_report_at
      FROM campaign_units cu
      LEFT JOIN fleet_units fu ON ${unitIdentityMatchSql('fu.empresa', 'fu.numero_economico', 'cu.empresa', 'cu.numero_economico')}
      LEFT JOIN garantia_stats gs ON gs.empresa_key = ${normalizedIdentitySql('cu.empresa')} AND gs.unidad_key = ${normalizedIdentitySql('cu.numero_economico')}
      WHERE cu.campaign_group_id = $1
      ORDER BY cu.updated_at DESC, cu.numero_economico ASC`, [req.params.id]);
    res.json({ group: { id:group.rows[0].id, nombre:(group.rows[0].nombre || group.rows[0].campaign_nombre || group.rows[0].campaign_name || ''), empresa:group.rows[0].empresa, notas:group.rows[0].notas || '' }, units: units.rows.map(r => ({ id:r.id, campaignGroupId:r.campaign_group_id, empresa:r.empresa || '', numeroEconomico:r.numero_economico || '', status:r.status || 'sin_programar', evidencia:Array.isArray(r.evidencia)?r.evidencia:[], notas:r.notas || '', fleetUnitId:r.fleet_unit_id || '', numeroObra:r.numero_obra || '', marca:r.marca || '', modelo:r.modelo || '', anio:r.anio || '', kilometraje:r.kilometraje || '', polizaActiva:!!r.poliza_activa, reportesCount:Number(r.reportes_count||0), lastReportAt:r.last_report_at || null, updatedAt:r.updated_at })) });
  } catch (error) { console.error('Error leyendo unidades de campaña:', error); res.status(500).json({ error:'No se pudieron cargar las unidades de campaña.' }); }
});

app.post('/api/campaigns/:id/units', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const group = await pool.query(`SELECT * FROM campaign_groups WHERE id = $1`, [req.params.id]);
    if (!group.rowCount) return res.status(404).json({ error:'Campaña no encontrada.' });
    const empresa = String(req.body.empresa || group.rows[0].empresa || '').trim();
    const numeroEconomico = String(req.body.numeroEconomico || '').trim();
    const status = String(req.body.status || 'sin_programar').trim();
    const notas = String(req.body.notas || '').trim();
    const evidencia = Array.isArray(req.body.evidencia) ? req.body.evidencia.filter(Boolean) : [];
    if (!empresa || !numeroEconomico) return res.status(400).json({ error:'Empresa y unidad son obligatorias.' });
    if (!['sin_programar','programada','realizada'].includes(status)) return res.status(400).json({ error:'Estado inválido.' });
    const result = await pool.query(`INSERT INTO campaign_units (id, campaign_group_id, empresa, numero_economico, evidencia, status, notas) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
      ON CONFLICT (campaign_group_id, empresa, numero_economico) DO UPDATE SET evidencia = EXCLUDED.evidencia, status = EXCLUDED.status, notas = EXCLUDED.notas, updated_at = NOW() RETURNING *`, [cryptoRandomId(), req.params.id, empresa, numeroEconomico, JSON.stringify(evidencia), status, notas]);
    await markFleetCampaignFlagsForCompany(empresa);
    res.status(201).json(result.rows[0]);
  } catch (error) { console.error('Error guardando unidad de campaña:', error); res.status(500).json({ error:'No se pudo guardar la unidad en campaña.' }); }
});

app.patch('/api/campaigns/units/:unitId', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const status = String(req.body.status || 'sin_programar').trim();
    const notas = String(req.body.notas || '').trim();
    const evidencia = Array.isArray(req.body.evidencia) ? req.body.evidencia.filter(Boolean) : null;
    if (!['sin_programar','programada','realizada'].includes(status)) return res.status(400).json({ error:'Estado inválido.' });
    const result = await pool.query(`UPDATE campaign_units SET status=$2, notas=$3, evidencia=COALESCE($4::jsonb, evidencia), updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.unitId, status, notas, evidencia ? JSON.stringify(evidencia) : null]);
    if (!result.rowCount) return res.status(404).json({ error:'Unidad de campaña no encontrada.' });
    await markFleetCampaignFlagsForCompany(result.rows[0].empresa);
    res.json(result.rows[0]);
  } catch (error) { console.error('Error actualizando unidad de campaña:', error); res.status(500).json({ error:'No se pudo actualizar la unidad de campaña.' }); }
});

app.delete('/api/campaigns/units/:unitId', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM campaign_units WHERE id=$1 RETURNING *`, [req.params.unitId]);
    if (!result.rowCount) return res.status(404).json({ error:'Unidad de campaña no encontrada.' });
    await markFleetCampaignFlagsForCompany(result.rows[0].empresa);
    res.json({ ok:true });
  } catch (error) { console.error('Error eliminando unidad de campaña:', error); res.status(500).json({ error:'No se pudo eliminar la unidad de campaña.' }); }
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
      where.push(`${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql(`$${params.length}`)}`);
    }
    const result = await pool.query(
      `SELECT
         id, folio, numero_obra, modelo, numero_economico, empresa,
         detalle_refaccion, refaccion_status, refaccion_asignada,
         COALESCE(jsonb_array_length(evidencias_refaccion),0)::int AS evidencias_count,
         COALESCE((
           SELECT jsonb_agg(v)
           FROM (
             SELECT value AS v
             FROM jsonb_array_elements_text(COALESCE(evidencias_refaccion, '[]'::jsonb))
             LIMIT 3
           ) p
         ), '[]'::jsonb) AS evidencias_preview,
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
      evidenciasRefaccion: [],
      evidenciasPreview: Array.isArray(row.evidencias_preview) ? row.evidencias_preview : [],
      evidenciasCount: Number(row.evidencias_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      refaccionUpdatedAt: row.refaccion_updated_at
    })));
  } catch (error) {
    console.error('Error cargando refacciones pendientes:', error);
    res.status(500).json({ error: 'No se pudieron cargar las refacciones pendientes.' });
  }
});

app.get('/api/parts/pending/:id', authRequired, requireRoles('admin','supervisor_flotas'), async (req, res) => {
  try {
    const params = [req.params.id];
    let whereEmpresa = '';
    if (req.user.role === 'supervisor_flotas') {
      params.push(req.user.empresa || '');
      whereEmpresa = ` AND ${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql(`$${params.length}`)}`;
    }
    const result = await pool.query(`SELECT id, evidencias_refaccion FROM garantias WHERE id = $1 ${whereEmpresa} LIMIT 1`, params);
    if (!result.rowCount) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json({ id: result.rows[0].id, evidenciasRefaccion: Array.isArray(result.rows[0].evidencias_refaccion) ? result.rows[0].evidencias_refaccion : [] });
  } catch (error) {
    console.error('Error leyendo detalle de refacciones:', error?.message || error);
    res.status(500).json({ error: 'No se pudo leer detalle de refacciones.' });
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
    if (req.user.role === 'supervisor_flotas' && normalizeIdentityValue(current.empresa || '') !== normalizeIdentityValue(req.user.empresa || '')) {
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
    if (req.user.role === 'supervisor_flotas' && normalizeIdentityValue(current.empresa || '') !== normalizeIdentityValue(req.user.empresa || '')) {
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

app.delete('/api/stock/parts/:id', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const moves = await pool.query(`SELECT COUNT(*)::int AS total FROM stock_movements WHERE stock_part_id = $1`, [req.params.id]);
    if (Number(moves.rows[0]?.total || 0) > 0) return res.status(400).json({ error:'La refacción ya tiene movimientos y no se puede eliminar.' });
    const result = await pool.query(`DELETE FROM stock_parts WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error:'Refacción no encontrada.' });
    res.json({ ok:true });
  } catch (error) { console.error('Error eliminando refacción de stock:', error); res.status(500).json({ error:'No se pudo eliminar la refacción.' }); }
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
    const folio = await nextManagedFolio('quote', client);
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
    if (quote) await syncQuoteToFleetCosts(req.params.id, req.user);
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
    await syncQuoteToFleetCosts(req.params.id, req.user);
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

app.delete('/api/cobranza/quotes/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT * FROM work_quotes WHERE id = $1`, [req.params.id]);
    if (!found.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error:'Cobranza no encontrada.' }); }
    await client.query(`DELETE FROM quote_payments WHERE quote_id = $1`, [req.params.id]).catch(() => {});
    await client.query(`DELETE FROM work_quote_items WHERE quote_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM work_quotes WHERE id = $1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok:true });
  } catch (error) { await client.query('ROLLBACK'); console.error('Error eliminando cobranza:', error); res.status(500).json({ error:'No se pudo eliminar la cobranza.' }); } finally { client.release(); }
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
    const customerName = String(req.body.customerName || '').trim() || 'Mostrador';
    const customerPhone = normalizeMxPhone(req.body.customerPhone || '');
    const companyName = String(req.body.companyName || '').trim();
    const unitNumber = String(req.body.unitNumber || '').trim();
    const notes = String(req.body.notes || '').trim();
    const paymentStatus = ['pendiente','pagado_parcial','pagada','cancelada'].includes(String(req.body.paymentStatus || 'pendiente')) ? String(req.body.paymentStatus) : 'pendiente';
    const paymentMethod = String(req.body.paymentMethod || '').trim();
    const paymentReference = String(req.body.paymentReference || '').trim();
    const items = (Array.isArray(req.body.items) ? req.body.items : []).map(item => ({
      stockPartId: String(item.stockPartId || '').trim(),
      description: String(item.description || '').trim(),
      qty: Number(item.qty || 0),
      unitPrice: Number(item.unitPrice || 0)
    })).filter(item => item.description && item.qty > 0);
    if (!items.length) { await client.query('ROLLBACK'); return res.status(400).json({ error:'Agrega al menos un concepto válido.' }); }
    const folio = await nextManagedFolio('sale', client);
    const saleId = cryptoRandomId();
    await client.query(`INSERT INTO direct_sales (id, folio, customer_name, customer_phone, company_name, unit_number, status, payment_status, subtotal, total, notes, payment_method, payment_reference, created_by) VALUES ($1,$2,$3,$4,$5,$6,'cerrada',$7,0,0,$8,$9,$10,$11)`, [saleId, folio, customerName, customerPhone, companyName, unitNumber, paymentStatus, notes, paymentMethod, paymentReference, req.user.id]);
    let subtotal = 0;
    for (const item of items) {
      let unitPrice = Number(item.unitPrice || 0);
      const qty = Number(item.qty || 0);
      const stockPartId = item.stockPartId || null;
      if (stockPartId) {
        const locked = await client.query(`SELECT * FROM stock_parts WHERE id = $1 FOR UPDATE`, [stockPartId]);
        if (!locked.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ error:'Una refacción ya no existe en stock.' }); }
        const part = locked.rows[0];
        if (!unitPrice) unitPrice = Number(part.precio_venta || part.costo_unitario || 0);
        const nextStock = Number(part.stock_actual || 0) - qty;
        if (nextStock < 0) { await client.query('ROLLBACK'); return res.status(400).json({ error:`Stock insuficiente para ${part.nombre}.` }); }
        await client.query(`UPDATE stock_parts SET stock_actual = $2, updated_at = NOW() WHERE id = $1`, [stockPartId, nextStock]);
        await client.query(`INSERT INTO stock_movements (id, stock_part_id, tipo, cantidad, unidad, empresa, garantia_folio, notas, created_by) VALUES ($1,$2,'venta_directa',$3,$4,$5,$6,$7,$8)`, [cryptoRandomId(), stockPartId, qty, unitNumber, companyName, folio, `Venta directa ${folio} · ${customerName}${notes ? ` · ${notes}` : ''}`, req.user.id]);
      }
      const total = Number((qty * unitPrice).toFixed(2));
      subtotal += total;
      await client.query(`INSERT INTO direct_sale_items (id, sale_id, stock_part_id, description, qty, unit_price, total) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [cryptoRandomId(), saleId, stockPartId, item.description, qty, unitPrice, total]);
    }
    await client.query(`UPDATE direct_sales SET subtotal = $2, total = $2, updated_at = NOW() WHERE id = $1`, [saleId, subtotal]);
    await client.query('COMMIT');
    const sales = await fetchDirectSalesForAdmin();
    res.status(201).json(sales.find(s => s.id === saleId));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando venta directa:', error);
    res.status(500).json({ error:'No se pudo crear la venta.' });
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
