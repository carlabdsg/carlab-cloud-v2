"use strict";
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const catalog = require("./catalog");
const fleet = require("./fleet");
const maintenanceCalendar = require("./calendar");
const inventory = require("./inventory");
const officialParts = require("./official-parts");
const reports = require("./reports");
const incidents = require("./incidents");
const qrIntakes = require("./qr-intakes");
const notificationSchema = `
CREATE TABLE IF NOT EXISTS ac_notifications (
 id BIGSERIAL PRIMARY KEY, event_key TEXT NOT NULL UNIQUE, brand TEXT NOT NULL,
 audience TEXT NOT NULL DEFAULT 'all', kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
 target_type TEXT NOT NULL, target_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ac_notifications_brand_idx ON ac_notifications(brand,id DESC);
CREATE TABLE IF NOT EXISTS ac_notification_reads (
 notification_id BIGINT NOT NULL REFERENCES ac_notifications(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL, read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(notification_id,user_id)
);`;
const schema = `
CREATE TABLE IF NOT EXISTS ac_requests (
 id TEXT PRIMARY KEY, number BIGSERIAL UNIQUE, client_key TEXT NOT NULL,
 kind TEXT NOT NULL, brand TEXT NOT NULL, operator_company TEXT NOT NULL, unit TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'recibida', payload JSONB NOT NULL, service_id TEXT,
 version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(created_by,client_key)
);
ALTER TABLE ac_requests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE ac_requests ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE ac_requests ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
CREATE INDEX IF NOT EXISTS ac_requests_brand_idx ON ac_requests(brand,created_at DESC);
CREATE INDEX IF NOT EXISTS ac_requests_service_idx ON ac_requests(service_id);
CREATE INDEX IF NOT EXISTS ac_requests_live_identity_idx ON ac_requests(brand,LOWER(TRIM(operator_company)),LOWER(TRIM(unit)),created_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS ac_request_events (
 id BIGSERIAL PRIMARY KEY, request_id TEXT NOT NULL REFERENCES ac_requests(id),
 actor TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, details JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ac_inventory_events (
 id TEXT PRIMARY KEY, stock_part_id TEXT NOT NULL, stock_movement_id TEXT NOT NULL,
 client_key TEXT NOT NULL, actor TEXT NOT NULL, request_id TEXT, kind TEXT NOT NULL,
 quantity NUMERIC(12,2) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(actor,client_key)
);`;
const stages = {
  recibida: "Recibida",
  en_revision: "En revisión",
  programada: "Programada",
  orden_creada: "Orden creada",
  atendida: "Atendida",
  aprobada: "Aprobada",
  espera_compra: "Espera de compra",
  entregada: "Entregada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};
const transitions = {
  service: {
    recibida: ["en_revision", "programada", "rechazada", "cancelada"],
    en_revision: ["programada", "rechazada", "cancelada"],
    programada: ["en_revision", "cancelada"],
  },
  part: {
    recibida: [
      "en_revision",
      "aprobada",
      "espera_compra",
      "rechazada",
      "cancelada",
    ],
    en_revision: ["aprobada", "espera_compra", "rechazada", "cancelada"],
    aprobada: ["espera_compra", "entregada", "cancelada"],
    espera_compra: ["aprobada", "cancelada"],
  },
};
function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
function text(v, max = 4000) {
  if (v == null) return "";
  if (typeof v !== "string" || v.length > max) fail("Texto inválido.");
  return v.trim();
}
function brand(v) {
  const s = text(v, 30);
  if (!Object.hasOwn(catalog.brands, s))
    fail("Selecciona Hispacold o Eberspächer.");
  return s;
}
function userBrand(u) {
  const s = String(u.empresa || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (s === "hispacold") return "hispacold";
  if (["eberspacher", "eberspaecher"].includes(s)) return "eberspaecher";
  fail("El usuario no tiene una marca válida asignada.", 403);
}
function quantity(v) {
  if (!["number", "string"].includes(typeof v) || v === "")
    fail("Cantidad inválida.");
  const n = Number(v);
  if (
    !Number.isFinite(n) ||
    n <= 0 ||
    n > 99999999 ||
    Math.abs(n * 100 - Math.round(n * 100)) > 1e-6
  )
    fail("Usa una cantidad positiva con hasta dos decimales.");
  return n;
}
function amount(v) {
  if (v == null || v === "") return 0;
  if (!["number", "string"].includes(typeof v)) fail("Importe inválido.");
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 99999999) fail("Importe inválido.");
  return Math.round(n * 100) / 100;
}
function day(v) {
  const s = text(v, 10);
  if (!s) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    fail("Fecha inválida.");
  return s;
}
function key(v) {
  const s = text(v, 100);
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(s))
    fail("Identificador de solicitud inválido.");
  return s;
}
function image(v) {
  const s = text(v, 1800000);
  if (s && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(s))
    fail("Usa una imagen JPEG o PNG.");
  return s;
}
function page(q) {
  const offset = Number(q.offset || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000000)
    fail("Página inválida.");
  return offset;
}
function safeUser(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    role: u.role,
    empresa: u.empresa,
    telefono: u.telefono || "",
    activo: u.activo,
    scopeType: u.scope_type || "brand",
    companyId: u.company_id || null,
    company: u.company || null,
  };
}
async function notice(
  db,
  {
    eventKey,
    brand,
    kind,
    title,
    body,
    targetType,
    targetId,
    audience = "all",
  },
) {
  await db.query(
    `INSERT INTO ac_notifications(event_key,brand,audience,kind,title,body,target_type,target_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(event_key) DO NOTHING`,
    [eventKey, brand, audience, kind, title, body, targetType, targetId],
  );
}
async function orderNotice(db, row, previous) {
  const b = row.payload.brand || "hispacold",
    folio = "HC-" + String(row.number).padStart(6, "0");
  if (!previous)
    await notice(db, {
      eventKey: "order-created:" + row.id,
      brand: b,
      kind: "order_created",
      title: "Nueva orden · " + folio,
      body: `${row.company} · Unidad ${row.unit}`,
      targetType: "order",
      targetId: row.id,
    });
  else if (previous.status !== row.status)
    await notice(db, {
      eventKey: `order-status:${row.id}:${row.version}`,
      brand: b,
      kind: "order_status",
      title: `${folio} · ${catalog.statuses[row.status]}`,
      body: `${row.company} · Unidad ${row.unit}`,
      targetType: "order",
      targetId: row.id,
    });
}
function register(
  app,
  { pool, authRequired, ensureServices, validate, mapRow, scheduleCTE },
) {
  const router = express.Router();
  let ready;
  const init = () =>
    ready ||
    (ready = ensureServices()
      .then(() => pool.query(schema))
      .then(() => inventory.init(pool))
      .then(() => officialParts.init(pool))
      .then(() => pool.query(fleet.schema))
      .then(() => pool.query(incidents.schema))
      .then(() => pool.query(qrIntakes.schema))
      .then(() =>
        pool.query(
          `CREATE TABLE IF NOT EXISTS ac_supervisor_access(user_id TEXT PRIMARY KEY REFERENCES users(id), scope_type TEXT NOT NULL CHECK(scope_type IN ('brand','fleet')), company_id TEXT REFERENCES ac_fleet_companies(id), CHECK((scope_type='brand' AND company_id IS NULL) OR (scope_type='fleet' AND company_id IS NOT NULL)));`,
        ),
      )
      .catch((e) => {
        ready = null;
        throw e;
      }));
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
  router.use(
    authRequired,
    wrap(async (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      if (!["admin", "supervisor_ac"].includes(req.user.role))
        fail("Acceso exclusivo de administrador o Supervisor AC.", 403);
      const r = await pool.query(
        "SELECT id,nombre,email,role,empresa,telefono,activo FROM users WHERE id=$1 AND activo=TRUE AND deleted_at IS NULL",
        [req.user.id],
      );
      const u = r.rows[0];
      if (!u || u.role !== req.user.role)
        fail(
          "La cuenta cambió o está inactiva. Inicia sesión nuevamente.",
          403,
        );
      req.acUser = u;
      req.acAdmin = u.role === "admin";
      await init();
      const access = req.acAdmin
        ? null
        : (
            await pool.query(
              "SELECT a.scope_type,a.company_id,c.name AS company FROM ac_supervisor_access a LEFT JOIN ac_fleet_companies c ON c.id=a.company_id WHERE a.user_id=$1",
              [u.id],
            )
          ).rows[0];
      req.acCompany = access?.scope_type === "fleet" ? access.company : null;
      req.acCompanyId =
        access?.scope_type === "fleet" ? access.company_id : null;
      if (access?.scope_type === "fleet" && !req.acCompany)
        fail("La cuenta no tiene una empresa válida asignada.", 403);
      req.acBrand = req.acAdmin || req.acCompany ? null : userBrand(u);
      if (
        ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
        (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
      )
        fail("Formulario inválido.");
      next();
    }),
  );
  const admin = (req, res, next) => {
    if (!req.acAdmin)
      return res
        .status(403)
        .json({ error: "Solo Carlab puede realizar esta acción." });
    next();
  };
  const allowed = (req, b, company) => {
    if (req.acAdmin) return;
    if (
      req.acCompany
        ? String(company || "")
            .trim()
            .toLowerCase() !== req.acCompany.trim().toLowerCase()
        : b !== req.acBrand
    )
      fail("Registro no encontrado.", 404);
  };
  async function transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await fn(client);
      await client.query("COMMIT");
      return r;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  function redact(r, req) {
    if (req.acAdmin) return r;
    const d = { ...r.data };
    delete d.total;
    d.parts = (d.parts || []).map((p) => ({
      kind: p.kind,
      description: p.description,
      reference: p.reference,
      quantity: p.quantity,
    }));
    delete d.sourceOrderId;
    return {
      ...r,
      data: d,
      permissions: { costs: false, manageOrders: false },
    };
  }
  function requestRow(r) {
    const result = {
      id: r.id,
      folio:
        r.payload.incidentFolio ||
        (r.kind === "service" ? "SAC-" : "RAC-") +
          String(r.number).padStart(6, "0"),
      incident: !!r.payload.incident,
      kind: r.kind,
      brand: r.brand,
      company: r.operator_company,
      unit: r.unit,
      status:
        r.order_status === "completado" && !r.order_deleted
          ? "atendida"
          : r.status,
      data: r.payload,
      version: r.version,
      serviceId: r.order_deleted || !r.order_status ? null : r.service_id,
      serviceStatus: r.order_deleted ? null : r.order_status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      createdBy: r.created_by,
      deletedAt: r.deleted_at || null,
      deletedBy: r.deleted_by || null,
      deletionReason: r.deletion_reason || "",
    };
    return result;
  }
  async function requestDetail(req, id) {
    const r = await pool.query(
      `SELECT r.*,s.status AS order_status,s.deleted_at AS order_deleted FROM ac_requests r LEFT JOIN hc_services s ON s.id=r.service_id AND LOWER(TRIM(s.company))=LOWER(TRIM(r.operator_company)) AND LOWER(TRIM(s.unit))=LOWER(TRIM(r.unit)) AND COALESCE(s.payload->>'brand','hispacold')=r.brand WHERE r.id=$1`,
      [id],
    );
    if (!r.rows[0]) fail("Solicitud no encontrada.", 404);
    allowed(req, r.rows[0].brand, r.rows[0].operator_company);
    if (r.rows[0].deleted_at && !req.acAdmin)
      fail("Solicitud no encontrada.", 404);
    const ev = await pool.query(
      "SELECT actor_name,action,details,created_at FROM ac_request_events WHERE request_id=$1 ORDER BY id DESC",
      [id],
    );
    return { ...requestRow(r.rows[0]), events: ev.rows };
  }
  qrIntakes.registerAdmin(router, { pool, admin, wrap, transaction, notice });
  const incidentOps = incidents.register(router, {
    pool,
    wrap,
    admin,
    allowed,
    transaction,
    fail,
    text,
    day,
    key,
    image,
    page,
    notice,
  });
  fleet.register(router, {
    pool,
    wrap,
    admin,
    allowed,
    transaction,
    fail,
    text,
    brand,
    day,
    page,
    notice,
  });
  officialParts.register(router, { pool, wrap, admin, fail, text, brand });
  reports.register(router, { pool, wrap, fail, text, brand, day, transaction });
  maintenanceCalendar.register(router, {
    pool,
    wrap,
    fail,
    text,
    brand,
    day,
    page,
    scheduleCTE,
  });
  router.get(
    "/me",
    wrap(async (req, res) =>
      res.json({
        user: {
          ...safeUser(req.acUser),
          brand: req.acBrand,
          scopeType: req.acCompany ? "fleet" : "brand",
          companyId: req.acCompanyId,
          company: req.acCompany,
        },
        brands: catalog.brands,
        stages,
        transitions: req.acAdmin ? transitions : {},
        serviceTypes: Object.fromEntries(
          Object.entries(catalog.types).filter(([k]) => k !== "express"),
        ),
        permissions: {
          manageOrders: req.acAdmin,
          manageInventory: req.acAdmin,
          manageUsers: req.acAdmin,
          viewLibrary: req.acAdmin,
        },
      }),
    ),
  );
  router.get(
    "/catalog",
    wrap(async (req, res) => {
      // The external portal needs labels for orders/PDFs, not the technical library.
      if (!req.acAdmin)
        return res.json({
          brands: req.acBrand
            ? { [req.acBrand]: catalog.brands[req.acBrand] }
            : catalog.brands,
          types: catalog.types,
          statuses: catalog.statuses,
          brandCatalogs: {},
          manuals: [],
        });
      const selected = req.acAdmin
        ? Object.keys(catalog.brands)
        : [req.acBrand];
      const saved = await pool.query("SELECT id FROM hc_manuals");
      const ids = new Set(saved.rows.map((x) => x.id));
      const catalogs = Object.fromEntries(
        selected.map((b) => [b, catalog.forBrand(b)]),
      );
      res.json({
        brands: Object.fromEntries(selected.map((b) => [b, catalog.brands[b]])),
        types: catalog.types,
        statuses: catalog.statuses,
        brandCatalogs: catalogs,
        manuals: selected.flatMap((b) =>
          catalog.forBrand(b).manuals.map((m) => ({
            ...m,
            available:
              ids.has(m.id) ||
              require("fs").existsSync(
                require("path").join(
                  __dirname,
                  "../../private/hispacold-manuals",
                  m.id + ".pdf",
                ),
              ),
          })),
        ),
      });
    }),
  );
  router.get(
    "/manuals/:id",
    admin,
    wrap(async (req, res) => {
      const m = catalog.allManuals.find((m) => m.id === req.params.id);
      if (!m) fail("Manual no encontrado.", 404);
      allowed(req, m.brand);
      const r = await pool.query("SELECT pdf FROM hc_manuals WHERE id=$1", [
        m.id,
      ]);
      let pdf = r.rows[0]?.pdf;
      if (!pdf) {
        const p = require("path").join(
          __dirname,
          "../../private/hispacold-manuals",
          m.id + ".pdf",
        );
        if (require("fs").existsSync(p)) pdf = require("fs").readFileSync(p);
      }
      if (!pdf) fail("El administrador debe importar este manual.", 404);
      res.type("application/pdf").send(Buffer.from(pdf));
    }),
  );
  router.get(
    "/orders",
    wrap(async (req, res) => {
      const params = [],
        where = ["deleted_at IS NULL"];
      if (req.acBrand) {
        params.push(req.acBrand);
        where.push(`COALESCE(payload->>'brand','hispacold')=$${params.length}`);
      } else if (req.query.brand) {
        params.push(brand(req.query.brand));
        where.push(`COALESCE(payload->>'brand','hispacold')=$${params.length}`);
      }
      if (req.acCompany) {
        params.push(req.acCompany);
        where.push(`LOWER(TRIM(company))=LOWER(TRIM($${params.length}))`);
      }
      if (req.query.q) {
        params.push("%" + text(req.query.q, 180) + "%");
        where.push(
          `(company||' '||unit||' HC-'||LPAD(number::text,6,'0')) ILIKE $${params.length}`,
        );
      }
      if (req.query.status) {
        if (!Object.hasOwn(catalog.statuses, req.query.status))
          fail("Estado inválido.");
        params.push(req.query.status);
        where.push(`status=$${params.length}`);
      }
      const w = where.join(" AND "),
        count = await pool.query(
          `SELECT COUNT(*)::int total FROM hc_services WHERE ${w}`,
          params,
        ),
        offset = page(req.query);
      const r = await pool.query(
        `SELECT id,number,type,status,company,unit,service_date,next_date,version,deleted_at,deleted_by,delete_reason,created_at,updated_at,jsonb_build_object('brand',payload->'brand','attention',payload->'attention','technician',payload->'technician','symptoms',payload->'symptoms','result',payload->'result') AS payload FROM hc_services WHERE ${w} ORDER BY service_date DESC,number DESC LIMIT 25 OFFSET $${params.length + 1}`,
        [...params, offset],
      );
      res.json({
        items: r.rows.map((row) => {
          const m = mapRow(row, false);
          delete m.total;
          return {
            ...m,
            technician: row.payload.technician || "",
            symptoms: row.payload.symptoms || "",
            result: row.payload.result || "",
          };
        }),
        total: count.rows[0].total,
        offset,
      });
    }),
  );
  router.get(
    "/orders/:id",
    wrap(async (req, res) => {
      const r = await pool.query(
        "SELECT * FROM hc_services WHERE id=$1 AND deleted_at IS NULL",
        [req.params.id],
      );
      if (!r.rows[0]) fail("Orden no encontrada.", 404);
      allowed(req, r.rows[0].payload.brand || "hispacold", r.rows[0].company);
      const ev = await pool.query(
        "SELECT actor_name,action,details,created_at FROM hc_events WHERE service_id=$1 ORDER BY id DESC",
        [req.params.id],
      );
      res.json(redact({ ...mapRow(r.rows[0]), events: ev.rows }, req));
    }),
  );
  router.get(
    "/units",
    wrap(async (req, res) => {
      if (req.acAdmin) {
        const r = await pool.query(
          "SELECT empresa AS company,numero_economico AS unit,modelo AS model FROM fleet_units UNION SELECT c.name AS company,u.unit,u.model FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id WHERE u.active=TRUE ORDER BY company,unit",
        );
        return res.json(r.rows);
      }
      const r = await pool.query(
        `SELECT DISTINCT company,unit,brand FROM (SELECT c.name AS company,u.unit,u.brand FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id WHERE u.active=TRUE UNION SELECT company,unit,COALESCE(payload->>'brand','hispacold') FROM hc_services WHERE deleted_at IS NULL UNION SELECT operator_company AS company,unit,brand FROM ac_requests WHERE deleted_at IS NULL) x WHERE ($1::text IS NULL OR brand=$1) AND ($2::text IS NULL OR LOWER(TRIM(company))=LOWER(TRIM($2))) ORDER BY company,unit,brand LIMIT 1000`,
        [req.acBrand, req.acCompany],
      );
      res.json(r.rows);
    }),
  );
  router.get(
    "/upcoming",
    wrap(async (req, res) => {
      const today = day(req.query.today);
      if (!today) fail("Selecciona el día de consulta.");
      const p = [today],
        w = ["$1::date IS NOT NULL", "next_date IS NOT NULL"];
      if (req.acBrand) {
        p.push(req.acBrand);
        w.push(`brand=$${p.length}`);
      }
      if (req.acCompany) {
        p.push(req.acCompany);
        w.push(`LOWER(TRIM(company))=LOWER(TRIM($${p.length}))`);
      }
      const r = await pool.query(
        scheduleCTE +
          `SELECT * FROM latest WHERE ${w.join(" AND ")} ORDER BY next_date,company,unit LIMIT 100`,
        p,
      );
      res.json({
        items: r.rows.map((r) => {
          const item = mapRow(r, false);
          return { ...item, overdue: item.nextDate < today };
        }),
        today,
      });
    }),
  );
  router.get(
    "/users",
    admin,
    wrap(async (req, res) => {
      const r = await pool.query(
        "SELECT u.*,a.scope_type,a.company_id,c.name AS company FROM users u LEFT JOIN ac_supervisor_access a ON a.user_id=u.id LEFT JOIN ac_fleet_companies c ON c.id=a.company_id WHERE u.role='supervisor_ac' AND u.deleted_at IS NULL ORDER BY u.nombre",
      );
      res.json(r.rows.map(safeUser));
    }),
  );
  async function saveUser(req, id) {
    const scopeType = req.body.scopeType || "brand";
    if (!["brand", "fleet"].includes(scopeType))
      fail("Selecciona el tipo de supervisor.");
    const companyId =
      scopeType === "fleet" ? text(req.body.companyId, 100) : null;
    const b = scopeType === "brand" ? brand(req.body.brand) : null,
      nombre = text(req.body.nombre, 180),
      email = text(req.body.email, 254).toLowerCase(),
      password = req.body.password == null ? "" : req.body.password,
      telefono = text(req.body.telefono, 80);
    if (typeof password !== "string" || password.length > 128)
      fail("Contraseña inválida.");
    if (
      !nombre ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      (!id && password.length < 8) ||
      (password && password.length < 8)
    )
      fail(
        "Completa nombre, correo válido y contraseña de al menos 8 caracteres.",
      );
    const hash = password ? await bcrypt.hash(password, 10) : null;
    return transaction(async (client) => {
      const company =
        scopeType === "fleet"
          ? (
              await client.query(
                "SELECT name FROM ac_fleet_companies WHERE id=$1",
                [companyId],
              )
            ).rows[0]
          : null;
      if (scopeType === "fleet" && !company)
        fail("Selecciona una empresa registrada en Flotas AC.");
      const affiliation = company ? company.name : catalog.brands[b];
      let old;
      if (id) {
        const r = await client.query(
          "SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
          [id],
        );
        old = r.rows[0];
        if (!old || old.role !== "supervisor_ac")
          fail(
            "Crea un usuario nuevo para Supervisor AC; este acceso no corresponde a ese rol.",
            404,
          );
      }
      const exists = await client.query(
        "SELECT id FROM users WHERE email=$1 AND id<>$2",
        [email, id || ""],
      );
      if (exists.rows.length) fail("Ese correo ya está registrado.", 409);
      let r;
      if (old)
        r = await client.query(
          "UPDATE users SET nombre=$2,email=$3,password_hash=$4,empresa=$5,telefono=$6,activo=$7 WHERE id=$1 RETURNING *",
          [
            id,
            nombre,
            email,
            hash || old.password_hash,
            affiliation,
            telefono,
            req.body.activo !== false,
          ],
        );
      else
        r = await client.query(
          `INSERT INTO users(id,nombre,email,password_hash,role,empresa,telefono,activo) VALUES($1,$2,$3,$4,'supervisor_ac',$5,$6,$7) RETURNING *`,
          [
            crypto.randomUUID(),
            nombre,
            email,
            hash,
            affiliation,
            telefono,
            req.body.activo !== false,
          ],
        );
      await client.query(
        "INSERT INTO ac_supervisor_access(user_id,scope_type,company_id) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET scope_type=EXCLUDED.scope_type,company_id=EXCLUDED.company_id",
        [r.rows[0].id, scopeType, companyId],
      );
      return safeUser({
        ...r.rows[0],
        scope_type: scopeType,
        company_id: companyId,
        company: company?.name,
      });
    });
  }
  router.post(
    "/users",
    admin,
    wrap(async (req, res) => res.status(201).json(await saveUser(req))),
  );
  router.patch(
    "/users/:id",
    admin,
    wrap(async (req, res) => res.json(await saveUser(req, req.params.id))),
  );
  router.get(
    "/requests",
    wrap(async (req, res) => {
      const deleted = req.query.deleted === "true";
      if (deleted && !req.acAdmin)
        fail("Solo Carlab puede consultar las solicitudes eliminadas.", 403);
      const p = [],
        w = [
          deleted ? "r.deleted_at IS NOT NULL" : "r.deleted_at IS NULL",
          "NOT EXISTS(SELECT 1 FROM ac_incidents i WHERE i.request_id=r.id)",
        ];
      if (req.acBrand) {
        p.push(req.acBrand);
        w.push(`r.brand=$${p.length}`);
      } else if (req.query.brand) {
        p.push(brand(req.query.brand));
        w.push(`r.brand=$${p.length}`);
      }
      if (req.acCompany) {
        p.push(req.acCompany);
        w.push(`LOWER(TRIM(r.operator_company))=LOWER(TRIM($${p.length}))`);
      }
      if (req.query.kind) {
        if (!["service", "part"].includes(req.query.kind))
          fail("Tipo inválido.");
        p.push(req.query.kind);
        w.push(`r.kind=$${p.length}`);
      }
      if (req.query.pending === "true")
        w.push(
          `r.status NOT IN ('atendida','entregada','rechazada','cancelada') AND NOT (COALESCE(s.status,'')='completado' AND s.deleted_at IS NULL)`,
        );
      if (req.query.status) {
        if (!stages[req.query.status]) fail("Estado inválido.");
        p.push(req.query.status);
        w.push(
          `(CASE WHEN r.kind='service' AND s.status='completado' AND s.deleted_at IS NULL THEN 'atendida' ELSE r.status END)=$${p.length}`,
        );
      }
      const where = w.length ? "WHERE " + w.join(" AND ") : "",
        offset = page(req.query);
      const count = await pool.query(
        `SELECT COUNT(*)::int total FROM ac_requests r LEFT JOIN hc_services s ON s.id=r.service_id AND LOWER(TRIM(s.company))=LOWER(TRIM(r.operator_company)) AND LOWER(TRIM(s.unit))=LOWER(TRIM(r.unit)) AND COALESCE(s.payload->>'brand','hispacold')=r.brand ${where}`,
        p,
      );
      if (req.query.summary === "true")
        return res.json({ total: count.rows[0].total });
      const r = await pool.query(
        `SELECT r.id,r.number,r.client_key,r.kind,r.brand,r.operator_company,r.unit,r.status,r.payload - 'evidence' AS payload,r.service_id,r.version,r.created_by,r.updated_by,r.created_at,r.updated_at,r.deleted_at,r.deleted_by,r.deletion_reason,s.status AS order_status,s.deleted_at AS order_deleted FROM ac_requests r LEFT JOIN hc_services s ON s.id=r.service_id AND LOWER(TRIM(s.company))=LOWER(TRIM(r.operator_company)) AND LOWER(TRIM(s.unit))=LOWER(TRIM(r.unit)) AND COALESCE(s.payload->>'brand','hispacold')=r.brand ${where} ORDER BY r.created_at DESC,r.number DESC LIMIT 25 OFFSET $${p.length + 1}`,
        [...p, offset],
      );
      res.json({
        items: r.rows.map(requestRow),
        total: count.rows[0].total,
        offset,
      });
    }),
  );
  router.get(
    "/requests/:id",
    wrap(async (req, res) => res.json(await requestDetail(req, req.params.id))),
  );
  router.post(
    "/requests",
    wrap(async (req, res) => {
      const b = req.acBrand || brand(req.body.brand),
        kind = text(req.body.kind, 20),
        company = text(req.body.company, 180),
        unit = text(req.body.unit, 80),
        clientKey = key(req.body.clientKey);
      if (!["service", "part"].includes(kind) || !company || !unit)
        fail("Selecciona tipo, empresa operadora y unidad.");
      allowed(req, b, company);
      if (req.acBrand && req.body.brand && req.body.brand !== req.acBrand)
        fail("Solo puedes solicitar servicios de tu marca.", 403);
      if (req.body.fleetUnitId) {
        const fleetUnit = await pool.query(
          "SELECT u.brand,u.unit,c.name AS company FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id WHERE u.id=$1 AND u.active=TRUE",
          [text(req.body.fleetUnitId, 100)],
        );
        const target = fleetUnit.rows[0];
        if (
          !target ||
          target.brand !== b ||
          target.company !== company ||
          target.unit !== unit
        )
          fail(
            "La unidad seleccionada no está disponible para esta solicitud.",
            404,
          );
      }
      const description = text(req.body.description, 4000),
        priority = text(req.body.priority || "normal", 20);
      if (!description || !["normal", "alta", "urgente"].includes(priority))
        fail("Describe la solicitud y selecciona prioridad.");
      const payload = {
        description,
        priority,
        location: text(req.body.location, 300),
        contact: text(req.body.contact, 200),
        preferredDate: day(req.body.preferredDate),
        partId: "",
        partName: "",
        reference: "",
        quantity: null,
        evidence: [],
      };
      if (req.body.evidence) {
        if (!Array.isArray(req.body.evidence) || req.body.evidence.length > 4)
          fail("Puedes adjuntar hasta cuatro fotos.");
        payload.evidence = req.body.evidence.map((p) => ({
          data: image(p.data),
          caption: text(p.caption, 300),
        }));
        if (payload.evidence.some((p) => !p.data)) fail("Foto vacía.");
      }
      payload.orderId = text(req.body.orderId, 100);
      payload.orderFolio = "";
      if (payload.orderId) {
        const order = await pool.query(
          "SELECT * FROM hc_services WHERE id=$1 AND deleted_at IS NULL",
          [payload.orderId],
        );
        const row = order.rows[0];
        if (
          !row ||
          (row.payload.brand || "hispacold") !== b ||
          row.company !== company ||
          row.unit !== unit
        )
          fail(
            "La orden no coincide con la marca, empresa y unidad de la solicitud.",
            404,
          );
        payload.orderFolio = mapRow(row).folio;
      }
      if (kind === "part") {
        payload.quantity = quantity(req.body.quantity);
        payload.partId = text(req.body.partId, 100);
        if (payload.partId) {
          const r = await pool.query(
            `SELECT s.id,s.nombre,s.sku,p.brands FROM ac_stock_parts s JOIN ac_stock_profiles p ON p.stock_part_id=s.id WHERE s.id=$1`,
            [payload.partId],
          );
          if (!r.rows[0] || !r.rows[0].brands.includes(b))
            fail("Refacción no disponible para esa marca.", 404);
          payload.partName = r.rows[0].nombre;
          payload.reference = r.rows[0].sku || "";
        } else {
          payload.partName = text(req.body.partName, 300);
          payload.reference = text(req.body.reference, 120);
          if (!payload.partName)
            fail("Selecciona o describe la refacción solicitada.");
        }
      }
      const result = await transaction(async (client) => {
        const r = await client.query(
          `INSERT INTO ac_requests(id,client_key,kind,brand,operator_company,unit,payload,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) ON CONFLICT(created_by,client_key) DO NOTHING RETURNING *`,
          [
            crypto.randomUUID(),
            clientKey,
            kind,
            b,
            company,
            unit,
            JSON.stringify(payload),
            req.acUser.id,
          ],
        );
        if (!r.rows.length) {
          const previous = await client.query(
            "SELECT * FROM ac_requests WHERE created_by=$1 AND client_key=$2",
            [req.acUser.id, clientKey],
          );
          allowed(
            req,
            previous.rows[0].brand,
            previous.rows[0].operator_company,
          );
          if (previous.rows[0].brand !== b || previous.rows[0].kind !== kind)
            fail("El identificador pertenece a otra solicitud.", 409);
          if (previous.rows[0].deleted_at)
            fail(
              "La solicitud fue eliminada. Solicita su recuperación al administrador.",
              409,
            );
          return { ...requestRow(previous.rows[0]), replayed: true };
        }
        const row = r.rows[0],
          item = requestRow(row);
        await client.query(
          `INSERT INTO ac_request_events(request_id,actor,actor_name,action,details) VALUES($1,$2,$3,'creacion',$4)`,
          [
            row.id,
            req.acUser.id,
            req.acUser.nombre,
            JSON.stringify({ status: "recibida" }),
          ],
        );
        await notice(client, {
          eventKey: "request-created:" + row.id,
          brand: b,
          kind: kind === "part" ? "part_request" : "service_request",
          title: `Nueva solicitud ${item.folio}`,
          body: `${company} · Unidad ${unit} · ${kind === "part" ? payload.partName : description.slice(0, 180)}`,
          targetType: "request",
          targetId: row.id,
        });
        return item;
      });
      res.status(result.replayed ? 200 : 201).json(result);
    }),
  );
  // A request is a separate record: archiving never modifies its linked order.
  async function setRequestDeleted(req, res, restore) {
    const reason = text(req.body.reason, 1000);
    if (!restore && !reason) fail("Indica el motivo de eliminación.");
    await transaction(async (client) => {
      const {
        rows: [row],
      } = await client.query(
        "SELECT * FROM ac_requests WHERE id=$1 FOR UPDATE",
        [req.params.id],
      );
      if (!row || row.kind !== "service")
        fail("Solicitud de servicio no encontrada.", 404);
      if (row.payload.incident)
        fail("Gestiona este registro desde Reportes AC.", 409);
      if (row.version !== req.body.version)
        fail(
          "Otra sesión actualizó esta solicitud. Recarga antes de continuar.",
          409,
        );
      if (restore ? !row.deleted_at : !!row.deleted_at)
        fail(
          restore
            ? "La solicitud ya está activa."
            : "La solicitud ya fue eliminada.",
          409,
        );
      await client.query(
        restore
          ? "UPDATE ac_requests SET deleted_at=NULL,deleted_by=NULL,deletion_reason=NULL,version=version+1,updated_by=$2,updated_at=NOW() WHERE id=$1"
          : "UPDATE ac_requests SET deleted_at=NOW(),deleted_by=$2,deletion_reason=$3,version=version+1,updated_by=$2,updated_at=NOW() WHERE id=$1",
        restore ? [row.id, req.acUser.id] : [row.id, req.acUser.id, reason],
      );
      await client.query(
        "INSERT INTO ac_request_events(request_id,actor,actor_name,action,details) VALUES($1,$2,$3,$4,$5)",
        [
          row.id,
          req.acUser.id,
          req.acUser.nombre,
          restore ? "restauracion" : "eliminacion",
          JSON.stringify({
            notes: restore
              ? "Solicitud recuperada; conserva su estado y orden vinculada."
              : reason,
          }),
        ],
      );
    });
    res.json(await requestDetail(req, req.params.id));
  }
  router.delete(
    "/requests/:id",
    admin,
    wrap((req, res) => setRequestDeleted(req, res, false)),
  );
  router.post(
    "/requests/:id/restore",
    admin,
    wrap((req, res) => setRequestDeleted(req, res, true)),
  );
  router.patch(
    "/requests/:id",
    admin,
    wrap(async (req, res) => {
      await transaction(async (client) => {
        const r = await client.query(
          "SELECT * FROM ac_requests WHERE id=$1 FOR UPDATE",
          [req.params.id],
        );
        const row = r.rows[0];
        if (!row) fail("Solicitud no encontrada.", 404);
        if (row.payload.incident)
          fail("Gestiona este registro desde Reportes AC.", 409);
        if (row.deleted_at)
          fail("Recupera la solicitud antes de modificarla.", 409);
        if (row.version !== req.body.version)
          fail("Otra sesión actualizó esta solicitud. Recarga.", 409);
        const status = text(req.body.status, 30),
          notes = text(req.body.notes, 3000);
        if (!transitions[row.kind]?.[row.status]?.includes(status))
          fail("Ese cambio de estado no está permitido.");
        if (
          ["rechazada", "cancelada", "espera_compra"].includes(status) &&
          !notes
        )
          fail("Registra el motivo o seguimiento.");
        const payload = {
          ...row.payload,
          reply: notes,
          scheduledDate:
            day(req.body.scheduledDate) || row.payload.scheduledDate || null,
        };
        if (status === "programada" && !payload.scheduledDate)
          fail("Selecciona la fecha propuesta.");
        if (row.kind === "part" && req.body.partId) {
          const p = await client.query(
            "SELECT s.nombre,s.sku,p.brands FROM ac_stock_parts s JOIN ac_stock_profiles p ON p.stock_part_id=s.id WHERE s.id=$1",
            [text(req.body.partId, 100)],
          );
          if (!p.rows[0]?.brands.includes(row.brand))
            fail("La pieza no está habilitada para esta marca.");
          payload.partId = req.body.partId;
          payload.partName = p.rows[0].nombre;
          payload.reference = p.rows[0].sku || "";
        }

        if (status === "entregada") {
          let partId = text(req.body.partId || payload.partId, 100);
          if (!partId)
            fail("Vincula la refacción al inventario antes de entregar.");
          const profile = await client.query(
            "SELECT brands FROM ac_stock_profiles WHERE stock_part_id=$1",
            [partId],
          );
          if (!profile.rows[0]?.brands.includes(row.brand))
            fail("La pieza no está habilitada para esta marca.");
          const stock = await client.query(
            "SELECT * FROM ac_stock_parts WHERE id=$1 FOR UPDATE",
            [partId],
          );
          if (!stock.rows[0]) fail("La pieza ya no existe.", 404);
          const qty = quantity(payload.quantity);
          if (Number(stock.rows[0].stock_actual) < qty)
            fail(
              "Existencia insuficiente. Registra la entrada o espera de compra.",
            );
          const movId = crypto.randomUUID();
          await client.query(
            "UPDATE ac_stock_parts SET stock_actual=stock_actual-$2,updated_at=NOW() WHERE id=$1",
            [partId, qty],
          );
          await client.query(
            `INSERT INTO ac_stock_movements(id,stock_part_id,tipo,cantidad,empresa,unidad,garantia_folio,notas,created_by) VALUES($1,$2,'salida_unidad',$3,$4,$5,$6,$7,$8)`,
            [
              movId,
              partId,
              qty,
              row.operator_company,
              row.unit,
              payload.orderFolio || requestRow(row).folio,
              "Entrega de refacción AC · " + notes,
              req.acUser.id,
            ],
          );
          await client.query(
            `INSERT INTO ac_inventory_events(id,stock_part_id,stock_movement_id,client_key,actor,request_id,kind,quantity) VALUES($1,$2,$3,$4,$5,$6,'entrega',$7)`,
            [
              crypto.randomUUID(),
              partId,
              movId,
              "deliver-" + row.id,
              req.acUser.id,
              row.id,
              qty,
            ],
          );
          payload.partId = partId;
          payload.partName = stock.rows[0].nombre;
          payload.reference = stock.rows[0].sku || "";
        }
        const update = await client.query(
          "UPDATE ac_requests SET status=$2,payload=$3,version=version+1,updated_by=$4,updated_at=NOW() WHERE id=$1 RETURNING *",
          [row.id, status, JSON.stringify(payload), req.acUser.id],
        );
        await client.query(
          `INSERT INTO ac_request_events(request_id,actor,actor_name,action,details) VALUES($1,$2,$3,'seguimiento',$4)`,
          [
            row.id,
            req.acUser.id,
            req.acUser.nombre,
            JSON.stringify({
              from: row.status,
              status,
              notes,
              version: update.rows[0].version,
            }),
          ],
        );
        await notice(client, {
          eventKey: `request-status:${row.id}:${update.rows[0].version}`,
          brand: row.brand,
          kind: "request_status",
          title: `${requestRow(row).folio} · ${stages[status]}`,
          body: `${row.operator_company} · Unidad ${row.unit}${notes ? " · " + notes.slice(0, 180) : ""}`,
          targetType: "request",
          targetId: row.id,
        });
      });
      res.json(await requestDetail(req, req.params.id));
    }),
  );
  router.post(
    "/requests/:id/create-order",
    admin,
    wrap(async (req, res) => {
      const result = await transaction(async (client) => {
        const r = await client.query(
          "SELECT * FROM ac_requests WHERE id=$1 FOR UPDATE",
          [req.params.id],
        );
        const row = r.rows[0];
        if (!row || row.kind !== "service")
          fail("Solicitud de servicio no encontrada.", 404);
        if (row.deleted_at)
          fail("Recupera la solicitud antes de crear una orden.", 409);
        await incidentOps.beforeOrder(client, req, row);
        if (row.service_id) {
          const old = await client.query(
            "SELECT * FROM hc_services WHERE id=$1",
            [row.service_id],
          );
          if (!old.rows[0] || old.rows[0].deleted_at)
            fail(
              "La orden vinculada está en papelera. Recupérala antes de continuar.",
              409,
            );
          return { ...mapRow(old.rows[0]), replayed: true };
        }
        if (row.version !== req.body.version)
          fail("Otra sesión actualizó la solicitud. Recarga.", 409);
        if (["rechazada", "cancelada"].includes(row.status))
          fail("La solicitud está cerrada.");
        const d = validate({
          formVersion: 3,
          brand: row.brand,
          attention: text(req.body.attention || "normal", 20),
          type: text(req.body.type, 30),
          maintenancePlan:
            req.body.type === "preventivo"
              ? catalog.forBrand(row.brand).periodicPlan.id
              : undefined,
          status: "borrador",
          company: row.operator_company,
          unit: row.unit,
          serviceDate: day(req.body.serviceDate),
          interval:
            req.body.interval ||
            Object.keys(catalog.forBrand(row.brand).intervals)[0],
          symptoms: row.payload.description,
          priority: row.payload.priority,
          technician: req.acUser.nombre,
          eventKind: req.body.attention === "express" ? "urgencia" : "",
          eventLocation: row.payload.location,
          eventContact: row.payload.contact,
          evidence: row.payload.evidence.map((p, i) => ({
            id: crypto.randomUUID(),
            name: "Solicitud-" + (i + 1) + ".jpg",
            caption: p.caption,
            data: p.data,
            phase: "antes",
          })),
        });
        const s = await client.query(
          `INSERT INTO hc_services(id,type,status,company,unit,service_date,next_date,payload,created_by,updated_by,client_key) VALUES($1,$2,$3,$4,$5,$6,NULL,$7,$8,$8,$9) RETURNING *`,
          [
            crypto.randomUUID(),
            d.type,
            d.status,
            d.company,
            d.unit,
            d.serviceDate,
            JSON.stringify(d),
            req.acUser.id,
            row.payload.incident
              ? "incident-" + row.id + "-" + row.version
              : "request-" + row.id,
          ],
        );
        const order = s.rows[0];
        await client.query(
          `INSERT INTO hc_events(service_id,actor_id,actor_name,action,details) VALUES($1,$2,$3,'creacion',$4)`,
          [
            order.id,
            req.acUser.id,
            req.acUser.nombre,
            JSON.stringify({
              version: 1,
              to: "borrador",
              request: requestRow(row).folio,
            }),
          ],
        );
        await client.query(
          `UPDATE ac_requests SET service_id=$2,status='orden_creada',version=version+1,updated_by=$3,updated_at=NOW() WHERE id=$1`,
          [row.id, order.id, req.acUser.id],
        );
        await client.query(
          `INSERT INTO ac_request_events(request_id,actor,actor_name,action,details) VALUES($1,$2,$3,'orden_creada',$4)`,
          [
            row.id,
            req.acUser.id,
            req.acUser.nombre,
            JSON.stringify({
              status: "orden_creada",
              folio: mapRow(order).folio,
            }),
          ],
        );
        await orderNotice(client, order);
        await incidentOps.afterOrder(client, req, row);
        return mapRow(order);
      });
      res.status(result.replayed ? 200 : 201).json(result);
    }),
  );
  router.get(
    "/parts",
    wrap(async (req, res) => {
      const p = [],
        w = [];
      const b = !req.acBrand
        ? req.query.brand
          ? brand(req.query.brand)
          : null
        : req.acBrand;
      if (b) {
        p.push(JSON.stringify([b]));
        w.push("p.brands @> $1::jsonb");
      }
      if (req.query.q) {
        p.push("%" + text(req.query.q, 180) + "%");
        w.push(
          `(s.nombre||' '||COALESCE(s.sku,'')||' '||p.models) ILIKE $${p.length}`,
        );
      }
      if (req.query.family) {
        const family = text(req.query.family, 30);
        if (
          !["efficient", "recambios", "cotizaciones", "custom"].includes(family)
        )
          fail("Origen inválido.");
        if (family === "custom") w.push("o.reference IS NULL");
        else {
          p.push(
            officialParts.data.parts
              .filter((v) => v.families.includes(family))
              .map((v) => v.key),
          );
          w.push(`o.reference=ANY($${p.length}::text[])`);
        }
      }
      const where = w.length ? "WHERE " + w.join(" AND ") : "",
        r = await pool.query(
          `SELECT s.*,p.brands,p.models,p.image,o.reference AS official_key FROM ac_stock_parts s JOIN ac_stock_profiles p ON p.stock_part_id=s.id LEFT JOIN ac_official_parts o ON o.stock_part_id=s.id AND o.reference=UPPER(TRIM(s.sku)) ${where} ORDER BY s.nombre LIMIT 500`,
          p,
        );
      res.json(
        r.rows.map((x) => ({
          id: x.id,
          name: x.nombre,
          reference: x.sku || "",
          brands: x.brands,
          models: x.models,
          image: x.image,
          available: Number(x.stock_actual) > 0,
          official:
            x.brands.includes("hispacold") &&
            (req.acAdmin || req.acBrand === "hispacold")
              ? officialParts.metadata(x.official_key)
              : null,
          ...(req.acAdmin
            ? {
                stock: Number(x.stock_actual),
                minimum: Number(x.stock_minimo),
                cost: Number(x.costo_unitario),
                price: Number(x.precio_venta),
                location: x.ubicacion || "",
                supplier: x.proveedor || "",
                notes: x.notas || "",
              }
            : {}),
        })),
      );
    }),
  );
  async function savePart(req, id) {
    const name = text(req.body.name, 300),
      reference = text(req.body.reference, 120),
      brands = req.body.brands;
    if (
      !Array.isArray(brands) ||
      brands.length < 1 ||
      brands.length > 2 ||
      new Set(brands).size !== brands.length
    )
      fail("Selecciona al menos una marca compatible.");
    brands.forEach(brand);
    const models = text(req.body.models, 1000),
      photo = image(req.body.image);
    if (req.body.stockPartId)
      fail("El almacén AC es independiente. Registra una nueva refacción AC.");
    if (!name) fail("Nombre de la refacción obligatorio.");
    const minimum = amount(req.body.minimum),
      cost = amount(req.body.cost),
      price = amount(req.body.price);
    return transaction(async (client) => {
      let actualId = id;
      if (actualId) {
        const r = await client.query(
          "SELECT id FROM ac_stock_parts WHERE id=$1 FOR UPDATE",
          [actualId],
        );
        if (!r.rows.length) fail("Refacción no encontrada.", 404);
        if (id) {
          if (!name) fail("Nombre obligatorio.");
          await client.query(
            `UPDATE ac_stock_parts SET nombre=$2,sku=$3,stock_minimo=$4,costo_unitario=$5,precio_venta=$6,ubicacion=$7,proveedor=$8,notas=$9,updated_at=NOW() WHERE id=$1`,
            [
              actualId,
              name,
              reference,
              minimum,
              cost,
              price,
              text(req.body.location, 200),
              text(req.body.supplier, 200),
              text(req.body.notes, 2000),
            ],
          );
        }
      } else {
        actualId = crypto.randomUUID();
        await client.query(
          `INSERT INTO ac_stock_parts(id,nombre,sku,stock_actual,stock_minimo,costo_unitario,precio_venta,ubicacion,proveedor,notas,created_by) VALUES($1,$2,$3,0,$4,$5,$6,$7,$8,$9,$10)`,
          [
            actualId,
            name,
            reference,
            minimum,
            cost,
            price,
            text(req.body.location, 200),
            text(req.body.supplier, 200),
            text(req.body.notes, 2000),
            req.acUser.id,
          ],
        );
      }
      await client.query(
        `INSERT INTO ac_stock_profiles(stock_part_id,brands,models,image) VALUES($1,$2,$3,$4) ON CONFLICT(stock_part_id) DO UPDATE SET brands=EXCLUDED.brands,models=EXCLUDED.models,image=EXCLUDED.image,updated_at=NOW()`,
        [actualId, JSON.stringify(brands), models, photo],
      );
      return { id: actualId };
    });
  }
  router.post(
    "/parts",
    admin,
    wrap(async (req, res) => res.status(201).json(await savePart(req))),
  );
  router.patch(
    "/parts/:id",
    admin,
    wrap(async (req, res) => res.json(await savePart(req, req.params.id))),
  );
  router.get(
    "/parts/:id/movements",
    admin,
    wrap(async (req, res) => {
      const r = await pool.query(
        `SELECT m.*,u.nombre AS actor FROM ac_stock_movements m LEFT JOIN users u ON u.id=m.created_by WHERE m.stock_part_id=$1 ORDER BY m.created_at DESC LIMIT 100`,
        [req.params.id],
      );
      res.json(r.rows);
    }),
  );
  router.post(
    "/parts/:id/movements",
    admin,
    wrap(async (req, res) => {
      const kind = text(req.body.kind, 30),
        qty = quantity(req.body.quantity),
        clientKey = key(req.body.clientKey),
        notes = text(req.body.notes, 1000);
      if (!["entrada", "devolucion"].includes(kind) || !notes)
        fail("Selecciona entrada o devolución y registra el motivo.");
      const result = await transaction(async (client) => {
        const part = await client.query(
          "SELECT s.* FROM ac_stock_parts s JOIN ac_stock_profiles p ON p.stock_part_id=s.id WHERE s.id=$1 FOR UPDATE OF s",
          [req.params.id],
        );
        if (!part.rows.length) fail("Refacción AC no encontrada.", 404);
        const previous = await client.query(
          "SELECT * FROM ac_inventory_events WHERE actor=$1 AND client_key=$2",
          [req.acUser.id, clientKey],
        );
        if (previous.rows.length) {
          const v = previous.rows[0];
          if (
            v.stock_part_id !== req.params.id ||
            v.kind !== kind ||
            Number(v.quantity) !== qty
          )
            fail("Ese identificador pertenece a otro movimiento.", 409);
          return { stock: Number(part.rows[0].stock_actual), replayed: true };
        }
        const id = crypto.randomUUID();
        await client.query(
          "UPDATE ac_stock_parts SET stock_actual=stock_actual+$2,updated_at=NOW() WHERE id=$1",
          [req.params.id, qty],
        );
        await client.query(
          `INSERT INTO ac_stock_movements(id,stock_part_id,tipo,cantidad,notas,created_by) VALUES($1,$2,$6,$3,$4,$5)`,
          [
            id,
            req.params.id,
            qty,
            `${kind === "devolucion" ? "Devolución" : "Entrada"} AC · ${notes}`,
            req.acUser.id,
            kind,
          ],
        );
        await client.query(
          `INSERT INTO ac_inventory_events(id,stock_part_id,stock_movement_id,client_key,actor,kind,quantity) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            crypto.randomUUID(),
            req.params.id,
            id,
            clientKey,
            req.acUser.id,
            kind,
            qty,
          ],
        );
        return {
          stock: Number((Number(part.rows[0].stock_actual) + qty).toFixed(2)),
        };
      });
      res.json(result);
    }),
  );
  const notificationParams = (req) =>
    req.acAdmin ? [] : [req.acCompany || req.acBrand];
  const visibility = (req) =>
    req.acAdmin
      ? "TRUE"
      : req.acCompany
        ? `n.audience='all' AND (
    (n.target_type='request' AND EXISTS(SELECT 1 FROM ac_requests r WHERE r.id=n.target_id AND LOWER(TRIM(r.operator_company))=LOWER(TRIM($1)))) OR
    (n.target_type='order' AND EXISTS(SELECT 1 FROM hc_services s WHERE s.id=n.target_id AND LOWER(TRIM(s.company))=LOWER(TRIM($1)))) OR
    (n.target_type='fleet' AND EXISTS(SELECT 1 FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id WHERE u.id=n.target_id AND LOWER(TRIM(c.name))=LOWER(TRIM($1))))
  )`
        : "n.brand=$1 AND n.audience='all'";
  const relevant = `(n.target_type<>'ac_intake' OR EXISTS(SELECT 1 FROM ac_qr_intakes qi WHERE qi.id=n.target_id AND qi.status='pending')) AND (n.kind<>'incident_confirmation' OR EXISTS(SELECT 1 FROM ac_incidents i JOIN ac_requests r ON r.id=i.request_id LEFT JOIN hc_services s ON s.id=r.service_id WHERE r.id=n.target_id AND ${incidents.effective}='confirmacion')) AND (n.target_type<>'request' OR EXISTS(SELECT 1 FROM ac_requests r WHERE r.id=n.target_id AND r.deleted_at IS NULL)) AND (n.target_type<>'fleet' OR EXISTS(SELECT 1 FROM ac_fleet_units fu WHERE fu.id=n.target_id AND fu.active=TRUE AND fu.brand=n.brand AND fu.condition='no_operativo')) AND (n.target_type<>'order' OR EXISTS(SELECT 1 FROM hc_services s WHERE s.id=n.target_id AND s.deleted_at IS NULL AND (n.kind<>'closure_reminder' OR s.status IN ('borrador','en_proceso')) AND (n.kind<>'maintenance_due' OR (s.next_date IS NOT NULL AND n.event_key='maintenance:'||s.id||':'||s.next_date::text AND s.id IN (SELECT id FROM hc_services s2 WHERE s2.deleted_at IS NULL AND s2.status='completado' AND (s2.type='preventivo' OR s2.next_date IS NOT NULL) AND LOWER(TRIM(s2.company))=LOWER(TRIM(s.company)) AND LOWER(TRIM(s2.unit))=LOWER(TRIM(s.unit)) AND COALESCE(s2.payload->>'brand','hispacold')=COALESCE(s.payload->>'brand','hispacold') ORDER BY s2.service_date DESC,s2.number DESC LIMIT 1)))))`;
  async function reminders(req, today) {
    const p = [today];
    let b = "";
    if (req.acBrand) {
      p.push(req.acBrand);
      b = " AND COALESCE(payload->>'brand','hispacold')=$2";
    } else if (req.acCompany) {
      p.push(req.acCompany);
      b = " AND LOWER(TRIM(company))=LOWER(TRIM($2))";
    }
    await pool.query(
      `INSERT INTO ac_notifications(event_key,brand,audience,kind,title,body,target_type,target_id,created_at) SELECT 'order-created:'||id,COALESCE(payload->>'brand','hispacold'),'all','order_created','Nueva orden · HC-'||LPAD(number::text,6,'0'),company||' · Unidad '||unit,'order',id,created_at FROM hc_services WHERE deleted_at IS NULL AND service_date >= $1::date - INTERVAL '30 days'${b} ON CONFLICT(event_key) DO NOTHING`,
      p,
    );
    if (req.acAdmin)
      await pool.query(
        `INSERT INTO ac_notifications(event_key,brand,audience,kind,title,body,target_type,target_id) SELECT 'closure:'||id||':'||$1::text,COALESCE(payload->>'brand','hispacold'),'admin','closure_reminder','Pendiente de cierre · HC-'||LPAD(number::text,6,'0'),company||' · Unidad '||unit,'order',id FROM hc_services WHERE deleted_at IS NULL AND status IN ('borrador','en_proceso') AND service_date <= $1::date - INTERVAL '2 days' ON CONFLICT(event_key) DO NOTHING`,
        [today],
      );
    const brandClause = req.acBrand
      ? ` AND brand=$2`
      : req.acCompany
        ? " AND LOWER(TRIM(company))=LOWER(TRIM($2))"
        : "";
    await pool.query(
      scheduleCTE +
        `INSERT INTO ac_notifications(event_key,brand,audience,kind,title,body,target_type,target_id) SELECT 'maintenance:'||id||':'||next_date::text,brand,'all','maintenance_due','Servicio vencido · HC-'||LPAD(number::text,6,'0'),company||' · Unidad '||unit||' · Fecha '||next_date::text,'order',id FROM latest WHERE next_date < $1::date${brandClause} ON CONFLICT(event_key) DO NOTHING`,
      p,
    );
  }
  router.get(
    "/notifications",
    wrap(async (req, res) => {
      const today = day(req.query.today);
      if (!today) fail("Fecha de consulta obligatoria.");
      await reminders(req, today);
      await incidentOps.reminders(req);
      const p = notificationParams(req),
        w = visibility(req) + " AND " + relevant;
      const r = await pool.query(
        `SELECT n.*,r.read_at FROM ac_notifications n LEFT JOIN ac_notification_reads r ON r.notification_id=n.id AND r.user_id=$${p.length + 1} WHERE ${w} ORDER BY n.id DESC LIMIT 40`,
        [...p, req.acUser.id],
      );
      const counts = await pool.query(
        `SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE r.read_at IS NULL)::int unread,COALESCE(MAX(n.id),0)::text "throughId" FROM ac_notifications n LEFT JOIN ac_notification_reads r ON r.notification_id=n.id AND r.user_id=$${p.length + 1} WHERE ${w}`,
        [...p, req.acUser.id],
      );
      res.json({
        items: r.rows.map((n) => ({
          id: String(n.id),
          brand: n.brand,
          kind: n.kind,
          title: n.title,
          body: n.body,
          targetType: n.target_type,
          targetId: n.target_id,
          createdAt: n.created_at,
          read: !!n.read_at,
        })),
        ...counts.rows[0],
      });
    }),
  );
  router.post(
    "/notifications/read",
    wrap(async (req, res) => {
      const p = notificationParams(req);
      let clause;
      if (req.body.ids) {
        if (
          !Array.isArray(req.body.ids) ||
          req.body.ids.length < 1 ||
          req.body.ids.length > 40 ||
          req.body.ids.some((x) => !/^\d+$/.test(String(x)))
        )
          fail("Notificaciones inválidas.");
        p.push(req.body.ids.map(String));
        clause = `n.id=ANY($${p.length}::bigint[])`;
      } else {
        const through = String(req.body.throughId || "");
        if (!/^\d+$/.test(through)) fail("Límite inválido.");
        p.push(through);
        clause = `n.id<=$${p.length}::bigint`;
      }
      p.push(req.acUser.id);
      await pool.query(
        `INSERT INTO ac_notification_reads(notification_id,user_id) SELECT n.id,$${p.length} FROM ac_notifications n WHERE ${visibility(req)} AND ${relevant} AND ${clause} ON CONFLICT DO NOTHING`,
        p,
      );
      res.json({ ok: true });
    }),
  );
  router.use((req, res) =>
    res.status(404).json({ error: "Ruta de climatización no encontrada." }),
  );
  router.use((e, req, res, next) => {
    if (res.headersSent) return next(e);
    if (!e.status) console.error("[AC]", e.message);
    res.status(e.status || (e.code === "23505" ? 409 : 500)).json({
      error: e.status
        ? e.message
        : e.code === "23505"
          ? "Ese registro ya existe."
          : "No se pudo completar la operación. Intenta nuevamente.",
    });
  });
  app.use("/api/ac", router);
  return { init };
}
module.exports = {
  register,
  notificationSchema,
  notice,
  orderNotice,
  userBrand,
  schema,
};
