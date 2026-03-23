const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'carlab-dev-secret';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador Carlab';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@carlab.local').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123*';
const DEFAULT_COMPANIES = (process.env.DEFAULT_COMPANIES || 'Autobuses Norte de Sinaloa,Carlab Demo,Transportes del Pacífico').split(',').map(s => s.trim()).filter(Boolean);

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

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, nombre: user.nombre },
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
      role TEXT NOT NULL CHECK (role IN ('admin','operador','operativo','supervisor')),
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

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_reg_requests_status ON registration_requests(status);
    CREATE INDEX IF NOT EXISTS idx_garantias_estatus_validacion ON garantias(estatus_validacion);
    CREATE INDEX IF NOT EXISTS idx_garantias_estatus_operativo ON garantias(estatus_operativo);
    CREATE INDEX IF NOT EXISTS idx_garantias_reportado_por_id ON garantias(reportado_por_id);
    CREATE INDEX IF NOT EXISTS idx_garantias_numero_economico ON garantias(numero_economico);
  `);

  for (const name of DEFAULT_COMPANIES) {
    await pool.query(
      `INSERT INTO companies (id, nombre, activo)
       VALUES ($1,$2,TRUE)
       ON CONFLICT (nombre) DO NOTHING`,
      [cryptoRandomId(), name]
    );
  }

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

let dbReady = false;
let dbInitError = null;

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'carlab-cloud-v2',
    dbReady,
    dbInitError: dbInitError ? 'db_init_failed' : null
  });
});

app.get('/api/public/companies', async (_req, res) => {
  const result = await pool.query('SELECT * FROM companies WHERE activo = TRUE ORDER BY nombre ASC');
  res.json(result.rows.map(mapCompany));
});

app.post('/api/public/register-operator', async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const telefono = String(req.body.telefono || '').trim();
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
  const telefono = String(req.body.telefono || '').trim();
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
  const telefono = String(req.body.telefono || '').trim();
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
  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = String(req.body.role || '').trim();
  const empresa = String(req.body.empresa || '').trim();
  const telefono = String(req.body.telefono || '').trim();

  if (!nombre || !email || !password || !['operador', 'operativo', 'supervisor', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Datos de usuario incompletos o inválidos.' });
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
  const current = await pool.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const currentUser = current.rows[0];
  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = String(req.body.role || '').trim();
  const password = String(req.body.password || '');
  const empresa = String(req.body.empresa || '').trim();
  const telefono = String(req.body.telefono || '').trim();

  if (!nombre || !email || !['operador', 'operativo', 'supervisor', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Datos de usuario incompletos o inválidos.' });
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
  if (req.user.role === 'operador') {
    query += ' WHERE reportado_por_id = $1';
    params.push(req.user.id);
  } else if (req.user.role === 'supervisor') {
    query += ' WHERE empresa = $1';
    params.push(req.user.empresa || '');
  }
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
      body.telefono || '',
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
  res.json(mapGarantia(result.rows[0]));
});

app.delete('/api/garantias/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const current = await pool.query('SELECT * FROM garantias WHERE id = $1', [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Garantía no encontrada.' });
  await addAuditLog(req.params.id, req.user.id, 'eliminar_reporte', `Admin ${req.user.nombre} eliminó el reporte`);
  await pool.query('DELETE FROM garantias WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/audit/:garantiaId', authRequired, requireRoles('admin', 'operativo', 'supervisor'), async (req, res) => {
  if (req.user.role === 'supervisor') {
    const allowed = await pool.query('SELECT id FROM garantias WHERE id = $1 AND empresa = $2', [req.params.garantiaId, req.user.empresa || '']);
    if (!allowed.rowCount) return res.status(403).json({ error: 'No tienes acceso a esta garantía.' });
  }
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

app.get('/api/history/unit/:numeroEconomico', authRequired, requireRoles('admin', 'operativo', 'supervisor'), async (req, res) => {
  let sql = 'SELECT * FROM garantias WHERE numero_economico = $1';
  const params = [req.params.numeroEconomico];
  if (req.user.role === 'supervisor') {
    sql += ' AND empresa = $2';
    params.push(req.user.empresa || '');
  }
  sql += ' ORDER BY created_at DESC';
  const result = await pool.query(sql, params);
  res.json(result.rows.map(mapGarantia));
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CARLAB CLOUD V3 Fase 3 corriendo en puerto ${PORT}`);
  initDb()
    .then(() => {
      dbReady = true;
      console.log('Base de datos inicializada.');
    })
    .catch((error) => {
      dbInitError = error;
      console.error('No se pudo inicializar la base:', error);
    });
});
