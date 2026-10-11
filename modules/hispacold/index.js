"use strict";
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const catalog = require("./catalog");
const schema = `
CREATE TABLE IF NOT EXISTS hc_services (
 id TEXT PRIMARY KEY, number BIGSERIAL UNIQUE, type TEXT NOT NULL, status TEXT NOT NULL,
 company TEXT NOT NULL, unit TEXT NOT NULL, service_date DATE NOT NULL, next_date DATE,
 payload JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE hc_services ADD COLUMN IF NOT EXISTS client_key TEXT;
ALTER TABLE hc_services ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE hc_services ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE hc_services ADD COLUMN IF NOT EXISTS delete_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS hc_services_client_idx ON hc_services(created_by,client_key) WHERE client_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS hc_services_unit_idx ON hc_services(company,unit,service_date DESC);
CREATE INDEX IF NOT EXISTS hc_services_next_idx ON hc_services(next_date) WHERE status <> 'cancelado';
CREATE TABLE IF NOT EXISTS hc_events (
 id BIGSERIAL PRIMARY KEY, service_id TEXT NOT NULL REFERENCES hc_services(id),
 actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, details JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hc_manuals (
 id TEXT PRIMARY KEY, filename TEXT NOT NULL, sha256 TEXT NOT NULL, pdf BYTEA NOT NULL,
 uploaded_by TEXT NOT NULL, uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
function bad(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
function str(value, max = 4000) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max)
    bad(`Texto inválido (máximo ${max} caracteres).`);
  return value.trim();
}
function date(value, required = false) {
  const s = str(value, 10);
  if (!s && !required) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    bad("Fecha inválida.");
  return s;
}
function number(value, min = 0, max = 1e9) {
  if (value === "" || value == null) return null;
  if (!["string", "number"].includes(typeof value))
    bad("Lectura numérica inválida.");
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max)
    bad("Lectura numérica fuera de rango.");
  return n;
}
function list(value, max) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max)
    bad("Lista demasiado extensa o inválida.");
  return value;
}
function picture(value, max = 1800000) {
  const s = str(value, max);
  if (s && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(s))
    bad("La imagen debe ser PNG o JPEG.");
  return s;
}
function brandCatalog(brand) {
  return typeof catalog.forBrand === "function"
    ? catalog.forBrand(brand)
    : catalog;
}
function allManuals() {
  return catalog.allManuals || catalog.manuals;
}
function validate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    bad("Formulario inválido.");
  const isV3 = input.formVersion === 3;
  if (input.formVersion != null && ![1, 2, 3].includes(input.formVersion))
    bad("Versión de formulario inválida.");
  const brand = str(input.brand || "hispacold", 30);
  if (isV3 && !input.brand) bad("Selecciona la marca del aire acondicionado.");
  if (!Object.hasOwn(catalog.brands || { hispacold: "Hispacold" }, brand))
    bad("Marca de aire acondicionado inválida.");
  if (!isV3 && brand !== "hispacold")
    bad("Esta marca requiere el formulario actual.");
  const activeCatalog = brandCatalog(brand);
  const type = str(input.type, 30),
    status = str(input.status, 30);
  if (
    !Object.hasOwn(catalog.types, type) ||
    !Object.hasOwn(catalog.statuses, status)
  )
    bad("Tipo o estado inválido.");
  if (isV3 && type === "express")
    bad("Selecciona el servicio y usa express como tipo de atención.");
  const d = {
    type,
    status,
    company: str(input.company, 180),
    unit: str(input.unit, 80),
    serviceDate: date(input.serviceDate, true),
    nextDate: date(input.nextDate),
    interval: str(input.interval, 20),
  };
  if (!d.company || !d.unit) bad("Empresa y unidad son obligatorias.");
  if (isV3) {
    d.formVersion = 3;
    d.brand = brand;
    d.attention = str(input.attention || "normal", 20);
    if (!["normal", "express"].includes(d.attention))
      bad("Tipo de atención inválido.");
  }
  if (
    type === "preventivo" &&
    (!isV3 || d.status === "completado" || d.interval) &&
    !Object.hasOwn(activeCatalog.intervals, d.interval)
  )
    bad("Selecciona la periodicidad.");
  if (d.nextDate && d.nextDate < d.serviceDate)
    bad("El próximo servicio no puede ser anterior al actual.");
  for (const key of [
    "fleetUnitId",
    "base",
    "model",
    "chassis",
    "equipment",
    "control",
    "compressorSerial",
    "workNumber",
    "technician",
    "clientName",
    "authorization",
    "planReference",
    "refrigerant",
    "oilType",
    "technicalReference",
  ])
    d[key] = str(input[key], 300);
  for (const key of [
    "symptoms",
    "faultCodes",
    "diagnosis",
    "workDone",
    "recommendations",
    "finalTest",
    "cancelReason",
    "reopenReason",
    "refrigerantNotes",
  ])
    d[key] = str(input[key], 6000);
  if (isV3 && !d.symptoms) bad("Describe brevemente el motivo del servicio.");
  d.mileage = number(input.mileage);
  d.priority = str(input.priority || "normal", 20);
  if (!["normal", "alta", "urgente"].includes(d.priority))
    bad("Prioridad inválida.");
  d.result = str(input.result, 30);
  if (
    !["", "operativo", "con_observaciones", "no_operativo"].includes(d.result)
  )
    bad("Resultado inválido.");
  d.circuitOpened = input.circuitOpened === true;
  d.sourceOrderId = str(input.sourceOrderId, 80);
  d.symptomCode = str(input.symptomCode, 40);
  if (
    d.symptomCode &&
    !activeCatalog.symptomGuides.some((g) => g.id === d.symptomCode)
  )
    bad("Síntoma de diagnóstico inválido.");
  d.eventKind = str(input.eventKind, 30);
  d.eventLocation = str(input.eventLocation, 300);
  d.eventContact = str(input.eventContact, 300);
  if (d.eventKind && !Object.hasOwn(catalog.eventKinds, d.eventKind))
    bad("Tipo de evento inválido.");
  for (const key of ["reportedAt", "arrivalAt", "resolvedAt"]) {
    d[key] = str(input[key], 30);
    if (d[key] && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d[key]))
      bad("Fecha y hora del evento inválidas.");
    if (d[key]) date(d[key].slice(0, 10), true);
    if (
      d[key] &&
      (!Number.isFinite(Date.parse(d[key])) ||
        Number(d[key].slice(11, 13)) > 23 ||
        Number(d[key].slice(14, 16)) > 59)
    )
      bad("Fecha y hora del evento inválidas.");
  }
  if (d.reportedAt && d.arrivalAt && d.arrivalAt < d.reportedAt)
    bad("La llegada no puede ser anterior al aviso.");
  if (
    d.resolvedAt &&
    (d.arrivalAt || d.reportedAt) &&
    d.resolvedAt < (d.arrivalAt || d.reportedAt)
  )
    bad("La resolución no puede ser anterior a la atención.");
  d.findings = list(input.findings, 40).map((f) => {
    if (!f || typeof f !== "object") bad("Pendiente inválido.");
    const description = str(f.description, 1500),
      decision = str(f.decision || "pendiente", 30);
    if (!description) bad("Describe cada trabajo detectado.");
    if (
      ![
        "pendiente",
        "autorizado",
        "no_autorizado",
        "realizado",
        "descartado",
      ].includes(decision)
    )
      bad("Estado de autorización inválido.");
    return {
      id: str(f.id, 80) || crypto.randomUUID(),
      description,
      decision,
      authorizedBy: str(f.authorizedBy, 200),
      notes: str(f.notes, 2000),
    };
  });
  for (const key of [
    "recoveredKg",
    "chargedKg",
    "oilMl",
    "vacuumMicrons",
    "vacuumMinutes",
  ])
    d[key] = number(input[key]);
  const template = activeCatalog.templateFor
    ? activeCatalog.templateFor(type, {
        formVersion: isV3 ? 3 : undefined,
        interval: d.interval,
      })
    : activeCatalog.templates.find((t) => t.id === type);
  if (!template) bad("Servicio no disponible para la marca seleccionada.");
  const checks = list(input.checklist, 80);
  const ids = new Set();
  for (const c of checks) {
    if (!c || !template.checklist.some((t) => t.id === c.id) || ids.has(c.id))
      bad("Punto de revisión inválido o duplicado.");
    ids.add(c.id);
  }
  d.templateVersion = template.version;
  d.checklist = template.checklist.map((t) => {
    const c = checks.find((c) => c.id === t.id) || {};
    const outcome = str(c.outcome || "pendiente", 20),
      action = str(c.action, 10),
      notes = str(c.notes, 2000);
    if (
      !["pendiente", "bien", "corregido", "hallazgo", "no_aplica"].includes(
        outcome,
      ) ||
      !["", "V", "R", "S", "L"].includes(action)
    )
      bad("Resultado de checklist inválido.");
    if (["hallazgo", "no_aplica"].includes(outcome) && !notes)
      bad(`Anota el motivo en: ${t.label}.`);
    return {
      ...t,
      suggested: t.actions[d.interval] || "",
      outcome,
      action,
      notes,
    };
  });
  const readings = list(input.measurements, 30);
  if (readings.some((x) => !x || typeof x !== "object"))
    bad("Mediciones inválidas.");
  d.measurements = (activeCatalog.measurements || catalog.measurements).map(
    (t) => {
      const v = readings.find((x) => x.id === t.id) || {};
      return {
        ...t,
        before: number(v.before, -1000),
        after: number(v.after, -1000),
        conditions: str(v.conditions, 500),
      };
    },
  );
  d.parts = list(input.parts, 60).map((p) => {
    if (!p || typeof p !== "object") bad("Concepto inválido.");
    const name = str(p.description, 300);
    if (!name) bad("Indica el concepto de cada refacción o trabajo.");
    const qty = number(p.quantity, 0.001, 100000),
      price = number(p.unitPrice, 0, 10000000);
    if (qty === null || price === null) bad("Cantidad y precio requeridos.");
    const kind = str(p.kind || "refaccion", 30);
    if (!["refaccion", "material", "mano_obra"].includes(kind))
      bad("Tipo de concepto inválido.");
    return {
      kind,
      description: name,
      reference: str(p.reference, 120),
      quantity: qty,
      unitPrice: price,
      total: Math.round(qty * price * 100) / 100,
    };
  });
  d.total = Math.round(d.parts.reduce((n, p) => n + p.total, 0) * 100) / 100;
  d.evidence = list(input.evidence, 8).map((p) => {
    if (!p || typeof p !== "object") bad("Evidencia inválida.");
    const phase = str(p.phase || "sin_clasificar", 30),
      component = str(p.component, 100),
      checkId = str(p.checkId, 80);
    if (!["antes", "durante", "despues", "sin_clasificar"].includes(phase))
      bad("Etapa de foto inválida.");
    if (checkId && !template.checklist.some((c) => c.id === checkId))
      bad("La foto se refiere a un punto de revisión inválido.");
    return {
      id: str(p.id, 80) || crypto.randomUUID(),
      name: str(p.name, 150),
      caption: str(p.caption, 300),
      data: picture(p.data),
      phase,
      component,
      checkId,
    };
  });
  d.technicianSignature = picture(input.technicianSignature, 300000);
  d.clientSignature = picture(input.clientSignature, 300000);
  if (d.status === "completado") {
    if (
      d.type === "express" &&
      (!d.eventKind || !d.eventLocation || !d.symptoms)
    )
      bad("Para cerrar el express registra evento, ubicación y motivo.");
    if (isV3 && d.attention === "express" && !d.eventKind)
      bad("Selecciona el tipo de evento express.");
    if (
      d.findings.some(
        (f) =>
          ["autorizado", "realizado"].includes(f.decision) && !f.authorizedBy,
      )
    )
      bad("Identifica quién autorizó los trabajos registrados.");
    if (
      d.findings.some(
        (f) => !["realizado", "descartado"].includes(f.decision),
      ) &&
      d.result === "operativo"
    )
      bad(
        "Hay trabajos pendientes o no autorizados: documenta la entrega con observaciones o no operativo.",
      );
    if (
      !d.technician ||
      ((!isV3 || ["revision", "mayor"].includes(d.type)) && !d.diagnosis) ||
      !d.workDone ||
      !d.finalTest ||
      !d.result
    )
      bad(
        isV3
          ? "Para cerrar registra técnico, trabajo realizado, prueba final y resultado; revisión y reparación mayor también requieren diagnóstico."
          : "Para completar: técnico, diagnóstico, trabajo realizado, prueba final y resultado son obligatorios.",
      );
    if (
      (!isV3 || ["preventivo", "mayor"].includes(d.type)) &&
      d.checklist.some((c) => c.outcome === "pendiente")
    )
      bad("Resuelve todos los puntos del checklist antes de completar.");
    if (
      d.result === "operativo" &&
      d.checklist.some((c) => c.outcome === "hallazgo")
    )
      bad(
        "Hay hallazgos pendientes: selecciona con observaciones o no operativo.",
      );
    if (d.result !== "operativo" && !d.recommendations)
      bad("Registra recomendaciones o pendientes de entrega.");
    if (d.type === "mayor" && (!d.authorization || !d.technicalReference))
      bad("La reparación mayor requiere autorización y referencia técnica.");
    if (
      d.circuitOpened &&
      (!d.technicalReference ||
        !d.refrigerant ||
        d.chargedKg === null ||
        !d.refrigerantNotes)
    )
      bad(
        "Documenta refrigerante, cantidad cargada, referencia técnica y prueba del circuito.",
      );
  }
  if (d.status === "cancelado" && !d.cancelReason)
    bad("Indica el motivo de cancelación.");
  return d;
}
function mapRow(row, full = true) {
  return {
    id: row.id,
    folio: `HC-${String(row.number).padStart(6, "0")}`,
    type: row.type,
    status: row.status,
    company: row.company,
    unit: row.unit,
    serviceDate:
      typeof row.service_date === "string"
        ? row.service_date.slice(0, 10)
        : row.service_date.toISOString().slice(0, 10),
    nextDate: row.next_date
      ? typeof row.next_date === "string"
        ? row.next_date.slice(0, 10)
        : row.next_date.toISOString().slice(0, 10)
      : null,
    version: row.version,
    brand: row.payload?.brand || row.brand || "hispacold",
    attention:
      row.payload?.attention ||
      row.attention ||
      (row.type === "express" ? "express" : "normal"),
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    deleteReason: row.delete_reason || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(full
      ? { data: row.payload }
      : {
          technician: row.technician || "",
          total: Number(row.total || 0),
          symptoms: row.symptoms || "",
          workDone: row.work_done || "",
          result: row.result || "",
          pendingCount: Number(row.pending_count || 0),
        }),
  };
}
const scheduleCTE = `WITH latest AS (
 SELECT DISTINCT ON (LOWER(TRIM(company)),LOWER(TRIM(unit)),COALESCE(payload->>'brand','hispacold'))
 id,number,type,status,company,unit,service_date,next_date,version,created_at,updated_at,deleted_at,
 payload->>'technician' AS technician,COALESCE(payload->>'brand','hispacold') AS brand,
 payload->>'attention' AS attention
 FROM hc_services WHERE deleted_at IS NULL AND status='completado' AND (type='preventivo' OR next_date IS NOT NULL)
 ORDER BY LOWER(TRIM(company)),LOWER(TRIM(unit)),COALESCE(payload->>'brand','hispacold'),service_date DESC,number DESC
) `;
function register(
  app,
  {
    pool,
    authRequired,
    manualDir = path.join(__dirname, "../../private/hispacold-manuals"),
  },
) {
  const router = express.Router();
  let ready;
  const init = () =>
    ready ||
    (ready = pool.query(schema).catch((e) => {
      ready = null;
      throw e;
    }));
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
  router.use(
    authRequired,
    wrap(async (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      if (req.user.role !== "admin")
        return res
          .status(403)
          .json({ error: "Módulo exclusivo de administrador." });
      const u = await pool.query(
        "SELECT id,nombre,role FROM users WHERE id=$1 AND activo=TRUE AND deleted_at IS NULL",
        [req.user.id],
      );
      if (!u.rows[0] || u.rows[0].role !== "admin")
        return res
          .status(403)
          .json({ error: "Se requiere un administrador activo." });
      req.hcUser = u.rows[0];
      await init();
      next();
    }),
  );
  router.get(
    "/catalog",
    wrap(async (req, res) => {
      const stored = await pool.query("SELECT id FROM hc_manuals");
      const ids = new Set(stored.rows.map((x) => x.id));
      const availableManual = (m) => ({
        ...m,
        available:
          ids.has(m.id) || fs.existsSync(path.join(manualDir, `${m.id}.pdf`)),
      });
      res.json({
        ...catalog,
        brands: catalog.brands || { hispacold: "Hispacold" },
        brandCatalogs: Object.fromEntries(
          Object.keys(catalog.brands || { hispacold: "Hispacold" }).map(
            (brand) => {
              const details = brandCatalog(brand);
              return [
                brand,
                { ...details, manuals: details.manuals.map(availableManual) },
              ];
            },
          ),
        ),
        manuals: allManuals().map(availableManual),
        user: req.hcUser,
      });
    }),
  );
  router.get(
    "/units",
    wrap(async (req, res) => {
      const r = await pool.query(
        "SELECT id,empresa,numero_economico,numero_obra,modelo,marca,anio,kilometraje FROM fleet_units ORDER BY empresa,numero_economico",
      );
      res.json(r.rows);
    }),
  );
  router.get(
    "/manuals/:id",
    wrap(async (req, res) => {
      const m = allManuals().find((m) => m.id === req.params.id);
      if (!m) bad("Manual no encontrado.", 404);
      const r = await pool.query("SELECT pdf FROM hc_manuals WHERE id=$1", [
        m.id,
      ]);
      res.type("application/pdf");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `inline; filename="${m.id}.pdf"`);
      if (r.rows[0]) return res.send(Buffer.from(r.rows[0].pdf));
      const file = path.join(manualDir, `${m.id}.pdf`);
      if (!fs.existsSync(file))
        bad("Carga este manual en la biblioteca para consultarlo.", 404);
      res.sendFile(file);
    }),
  );
  router.put(
    "/manuals/:id/raw",
    express.raw({
      type: ["application/pdf", "application/octet-stream"],
      limit: "90mb",
    }),
    wrap(async (req, res) => {
      const m = allManuals().find((m) => m.id === req.params.id);
      if (!m) bad("Manual no reconocido.", 404);
      const pdf = req.body;
      if (
        !Buffer.isBuffer(pdf) ||
        pdf.subarray(0, 5).toString() !== "%PDF-" ||
        crypto.createHash("sha256").update(pdf).digest("hex") !== m.sha256
      )
        bad("El archivo no coincide con el manual original catalogado.");
      await pool.query(
        "INSERT INTO hc_manuals(id,filename,sha256,pdf,uploaded_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET pdf=EXCLUDED.pdf,uploaded_by=EXCLUDED.uploaded_by,uploaded_at=NOW()",
        [m.id, m.filename, m.sha256, pdf, req.hcUser.id],
      );
      res.json({ ok: true, id: m.id });
    }),
  );
  router.put(
    "/manuals/:id",
    wrap(async (req, res) => {
      const m = allManuals().find((m) => m.id === req.params.id);
      if (!m) bad("Manual no reconocido.", 404);
      const encoded = str(req.body.base64, 12000000);
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) bad("PDF inválido.");
      const pdf = Buffer.from(encoded, "base64");
      if (
        pdf.subarray(0, 5).toString() !== "%PDF-" ||
        crypto.createHash("sha256").update(pdf).digest("hex") !== m.sha256
      )
        bad("El archivo no coincide con el manual original catalogado.");
      await pool.query(
        "INSERT INTO hc_manuals(id,filename,sha256,pdf,uploaded_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET pdf=EXCLUDED.pdf,uploaded_by=EXCLUDED.uploaded_by,uploaded_at=NOW()",
        [m.id, m.filename, m.sha256, pdf, req.hcUser.id],
      );
      res.json({ ok: true, id: m.id });
    }),
  );
  router.get(
    "/services",
    wrap(async (req, res) => {
      if (req.query.deleted && !["true", "false"].includes(req.query.deleted))
        bad("Filtro de papelera inválido.");
      const conditions = [
          req.query.deleted === "true"
            ? "deleted_at IS NOT NULL"
            : "deleted_at IS NULL",
        ],
        params = [];
      const add = (clause, v) => {
        params.push(v);
        conditions.push(clause.replace("?", `$${params.length}`));
      };
      if (req.query.q)
        add(
          "(company || ' ' || unit || ' HC-' || LPAD(number::text,6,'0') || ' ' || COALESCE(payload->>'technician','')) ILIKE ?",
          `%${str(req.query.q, 180)}%`,
        );
      if (req.query.type) add("type = ?", str(req.query.type, 30));
      if (req.query.brand)
        add(
          "COALESCE(payload->>'brand','hispacold') = ?",
          str(req.query.brand, 30),
        );
      if (req.query.attention)
        add(
          "COALESCE(payload->>'attention',CASE WHEN type='express' THEN 'express' ELSE 'normal' END) = ?",
          str(req.query.attention, 20),
        );
      if (req.query.status) add("status = ?", str(req.query.status, 30));
      if (req.query.from) add("service_date >= ?", date(req.query.from, true));
      if (req.query.to) add("service_date <= ?", date(req.query.to, true));
      const where = conditions.length
        ? " WHERE " + conditions.join(" AND ")
        : "";
      const counts = await pool.query(
        `SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status IN ('borrador','en_proceso','espera_refaccion'))::int AS open,COUNT(*) FILTER(WHERE status='completado')::int AS completed,0::int AS overdue FROM hc_services${where}`,
        params,
      );
      const due = await pool.query(
        scheduleCTE +
          "SELECT COUNT(*)::int AS total FROM latest WHERE next_date < $1::date",
        [date(req.query.today) || new Date().toISOString().slice(0, 10)],
      );
      counts.rows[0].overdue =
        req.query.deleted === "true" ? 0 : due.rows[0].total;
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100)),
        offset = Math.max(0, Math.min(1000000, Number(req.query.offset) || 0));
      const r = await pool.query(
        `SELECT id,number,type,status,company,unit,service_date,next_date,version,created_at,updated_at,deleted_at,deleted_by,delete_reason,payload->>'technician' AS technician,payload->>'total' AS total,COALESCE(payload->>'brand','hispacold') AS brand,payload->>'attention' AS attention,payload->>'symptoms' AS symptoms,payload->>'workDone' AS work_done,payload->>'result' AS result,(SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(payload->'findings','[]'::jsonb)) f WHERE f->>'decision' NOT IN ('realizado','descartado')) AS pending_count FROM hc_services${where} ORDER BY service_date DESC,number DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, Math.trunc(limit), Math.trunc(offset)],
      );
      res.json({
        items: r.rows.map((r) => mapRow(r, false)),
        summary: counts.rows[0],
        offset: Math.trunc(offset),
        limit: Math.trunc(limit),
      });
    }),
  );
  router.get(
    "/history",
    wrap(async (req, res) => {
      const company = str(req.query.company, 180),
        unit = str(req.query.unit, 80);
      if (!company || !unit) bad("Selecciona empresa y unidad.");
      const offset = Math.max(
        0,
        Math.min(1000000, Math.trunc(Number(req.query.offset) || 0)),
      );
      const where =
        "deleted_at IS NULL AND LOWER(TRIM(company))=LOWER(TRIM($1)) AND LOWER(TRIM(unit))=LOWER(TRIM($2))";
      const summary = await pool.query(
        `SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='completado')::int AS completed,COALESCE(SUM((payload->>'total')::numeric) FILTER(WHERE status='completado'),0) AS total_cost FROM hc_services WHERE ${where}`,
        [company, unit],
      );
      const rows = await pool.query(
        `SELECT id,number,type,status,company,unit,service_date,next_date,version,created_at,updated_at,payload - 'evidence' - 'technicianSignature' - 'clientSignature' AS payload FROM hc_services WHERE ${where} ORDER BY service_date DESC,number DESC LIMIT 25 OFFSET $3`,
        [company, unit, offset],
      );
      const faults = await pool.query(
        `SELECT payload->>'symptomCode' AS code,COALESCE(payload->>'brand','hispacold') AS brand,COUNT(*)::int AS total FROM hc_services WHERE ${where} AND status<>'cancelado' AND COALESCE(payload->>'symptomCode','') NOT IN ('','otro') GROUP BY payload->>'symptomCode',COALESCE(payload->>'brand','hispacold') HAVING COUNT(*)>1 ORDER BY COUNT(*) DESC`,
        [company, unit],
      );
      const parts = await pool.query(
        `SELECT number,service_date,p AS item FROM hc_services CROSS JOIN LATERAL jsonb_array_elements(COALESCE(payload->'parts','[]'::jsonb)) p WHERE ${where} AND status='completado' AND COALESCE(p->>'kind','refaccion')<>'mano_obra' ORDER BY service_date DESC,number DESC LIMIT 12`,
        [company, unit],
      );
      const upcoming = await pool.query(
        scheduleCTE +
          `SELECT * FROM latest WHERE ${where} AND next_date IS NOT NULL`,
        [company, unit],
      );
      res.json({
        company,
        unit,
        summary: summary.rows[0],
        items: rows.rows.map((r) => mapRow(r)),
        recurring: faults.rows,
        parts: parts.rows,
        next: upcoming.rows.map((r) => mapRow(r, false)),
        offset,
        limit: 25,
      });
    }),
  );
  router.get(
    "/calendar",
    wrap(async (req, res) => {
      const today = date(req.query.today, true),
        from = date(req.query.from, true),
        to = date(req.query.to, true),
        bucket = str(req.query.bucket || "all", 20);
      if (from > to) bad("Rango de calendario inválido.");
      if (!["all", "overdue", "week", "month"].includes(bucket))
        bad("Filtro de calendario inválido.");
      const params = [today, from, to];
      const extra = {
        all: "next_date BETWEEN $2::date AND $3::date",
        overdue: "next_date < $1::date",
        week: "next_date >= $1::date AND next_date < $1::date + INTERVAL '7 days'",
        month: "next_date BETWEEN $2::date AND $3::date",
      }[bucket];
      const counts = await pool.query(
        scheduleCTE +
          `SELECT COUNT(*) FILTER(WHERE next_date < $1::date)::int AS "overdue",COUNT(*) FILTER(WHERE next_date >= $1::date AND next_date < $1::date + INTERVAL '7 days')::int AS "week",COUNT(*) FILTER(WHERE next_date BETWEEN $2::date AND $3::date)::int AS "month" FROM latest`,
        params,
      );
      const days = await pool.query(
        scheduleCTE +
          "SELECT next_date,COUNT(*)::int total FROM latest WHERE next_date BETWEEN $1::date AND $2::date GROUP BY next_date ORDER BY next_date",
        [from, to],
      );
      const queryParams =
        bucket === "overdue" || bucket === "week" ? [today] : params;
      const selectedDay = date(req.query.day);
      let dayClause = "";
      if (selectedDay) {
        queryParams.push(selectedDay);
        dayClause = ` AND next_date=$${queryParams.length}::date`;
      }
      const offset = Math.max(
        0,
        Math.min(1000000, Math.trunc(Number(req.query.offset) || 0)),
      );
      const rows = await pool.query(
        scheduleCTE +
          `SELECT * FROM latest WHERE $1::date IS NOT NULL AND ${extra}${dayClause} ORDER BY next_date,company,unit LIMIT 100 OFFSET ${offset}`,
        queryParams,
      );
      res.json({
        items: rows.rows.map((r) => mapRow(r, false)),
        summary: counts.rows[0],
        days: days.rows,
        today,
        from,
        to,
        offset,
        limit: 100,
      });
    }),
  );
  router.get(
    "/services/:id",
    wrap(async (req, res) => {
      const r = await pool.query("SELECT * FROM hc_services WHERE id=$1", [
        req.params.id,
      ]);
      if (!r.rows[0]) bad("Servicio no encontrado.", 404);
      const events = await pool.query(
        "SELECT actor_name,action,details,created_at FROM hc_events WHERE service_id=$1 ORDER BY id DESC",
        [req.params.id],
      );
      res.json({ ...mapRow(r.rows[0]), events: events.rows });
    }),
  );
  async function save(req, res, isUpdate) {
    const d = validate(req.body.data);
    const clientKey = str(req.body.clientKey, 80) || null;
    if (clientKey && !/^[a-zA-Z0-9-]+$/.test(clientKey))
      bad("Identificador de borrador inválido.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Replays refer to the existing order, not a new clone. Its source or
      // fleet record may have changed after the original successful request.
      if (!isUpdate && clientKey) {
        const replay = await client.query(
          "SELECT * FROM hc_services WHERE created_by=$1 AND client_key=$2 FOR UPDATE",
          [req.hcUser.id, clientKey],
        );
        if (replay.rows[0]) {
          if (replay.rows[0].deleted_at)
            bad(
              "Esta orden está en la papelera; restáurala antes de recuperarla.",
              409,
            );
          await client.query("COMMIT");
          return res.json({ ...mapRow(replay.rows[0]), replayed: true });
        }
      }
      let old;
      const id = isUpdate ? req.params.id : crypto.randomUUID();
      if (isUpdate) {
        const r = await client.query(
          "SELECT * FROM hc_services WHERE id=$1 FOR UPDATE",
          [id],
        );
        old = r.rows[0];
        if (!old) bad("Servicio no encontrado.", 404);
        if (old.deleted_at)
          bad("Restaura la orden de la papelera antes de modificarla.", 409);
        if (old.version !== req.body.version)
          bad(
            "Otra sesión actualizó el servicio. Recarga antes de guardar.",
            409,
          );
        if (
          ["completado", "cancelado"].includes(old.status) &&
          (d.status !== "en_proceso" || !d.reopenReason)
        )
          bad("Para modificar un servicio cerrado, reábrelo con un motivo.");
        if (old.type !== d.type)
          bad("El tipo de un servicio guardado no puede cambiar.");
        if ((old.payload.brand || "hispacold") !== (d.brand || "hispacold"))
          bad("La marca de una orden guardada no puede cambiar.");
        if ((old.payload.formVersion === 3) !== (d.formVersion === 3))
          bad("Conserva la versión del formulario de la orden guardada.");
      }
      if (d.fleetUnitId) {
        const u = await client.query(
          "SELECT empresa,numero_economico FROM fleet_units WHERE id=$1",
          [d.fleetUnitId],
        );
        if (
          !u.rows[0] ||
          u.rows[0].empresa !== d.company ||
          u.rows[0].numero_economico !== d.unit
        )
          bad("La unidad seleccionada no coincide con la empresa y económico.");
      }
      if (d.sourceOrderId) {
        const unchangedSource =
          isUpdate && old.payload.sourceOrderId === d.sourceOrderId;
        const source = await client.query(
          "SELECT id FROM hc_services WHERE id=$1" +
            (unchangedSource ? "" : " AND deleted_at IS NULL"),
          [d.sourceOrderId],
        );
        if (!source.rows[0]) bad("La orden de origen no existe.");
      }
      const vals = [
        d.type,
        d.status,
        d.company,
        d.unit,
        d.serviceDate,
        d.nextDate,
        JSON.stringify(d),
        req.hcUser.id,
        id,
      ];
      let r;
      if (isUpdate)
        r = await client.query(
          "UPDATE hc_services SET type=$1,status=$2,company=$3,unit=$4,service_date=$5,next_date=$6,payload=$7,updated_by=$8,version=version+1,updated_at=NOW() WHERE id=$9 RETURNING *",
          vals,
        );
      else
        r = await client.query(
          "INSERT INTO hc_services(type,status,company,unit,service_date,next_date,payload,created_by,updated_by,id,client_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10) ON CONFLICT(created_by,client_key) WHERE client_key IS NOT NULL DO NOTHING RETURNING *",
          [...vals, clientKey],
        );
      if (!r.rows[0]) {
        const existing = await client.query(
          "SELECT * FROM hc_services WHERE created_by=$1 AND client_key=$2",
          [req.hcUser.id, clientKey],
        );
        if (existing.rows[0]?.deleted_at)
          bad(
            "Esta orden está en la papelera; restáurala antes de recuperarla.",
            409,
          );
        await client.query("ROLLBACK");
        return res.json({ ...mapRow(existing.rows[0]), replayed: true });
      }
      const changed = old
        ? Object.keys(d).filter(
            (k) => JSON.stringify(d[k]) !== JSON.stringify(old.payload[k]),
          )
        : Object.keys(d);
      await client.query(
        "INSERT INTO hc_events(service_id,actor_id,actor_name,action,details) VALUES($1,$2,$3,$4,$5)",
        [
          id,
          req.hcUser.id,
          req.hcUser.nombre,
          isUpdate ? "actualizacion" : "creacion",
          JSON.stringify({
            version: r.rows[0].version,
            from: old?.status || null,
            to: d.status,
            changed,
            reason: d.reopenReason || d.cancelReason || "",
          }),
        ],
      );
      await client.query("COMMIT");
      res.status(isUpdate ? 200 : 201).json(mapRow(r.rows[0]));
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  router.post(
    "/services",
    wrap((req, res) => save(req, res, false)),
  );
  router.put(
    "/services/:id",
    wrap((req, res) => save(req, res, true)),
  );
  async function trash(req, res, restore) {
    const version = req.body?.version;
    if (!Number.isInteger(version) || version < 1)
      bad("Recarga la orden antes de cambiar su estado en la papelera.");
    const reason = restore ? "" : str(req.body?.reason, 1000);
    if (!restore && !reason) bad("Indica el motivo de eliminación.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT * FROM hc_services WHERE id=$1 FOR UPDATE",
        [req.params.id],
      );
      const old = current.rows[0];
      if (!old) bad("Servicio no encontrado.", 404);
      if (old.version !== version)
        bad("Otra sesión actualizó la orden. Recarga antes de continuar.", 409);
      if (restore ? !old.deleted_at : !!old.deleted_at)
        bad(
          restore
            ? "La orden ya está fuera de la papelera."
            : "La orden ya está en la papelera.",
          409,
        );
      const updated = await client.query(
        restore
          ? "UPDATE hc_services SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL,updated_by=$2,updated_at=NOW(),version=version+1 WHERE id=$1 RETURNING *"
          : "UPDATE hc_services SET deleted_at=NOW(),deleted_by=$2,delete_reason=$3,updated_by=$2,updated_at=NOW(),version=version+1 WHERE id=$1 RETURNING *",
        restore ? [old.id, req.hcUser.id] : [old.id, req.hcUser.id, reason],
      );
      await client.query(
        "INSERT INTO hc_events(service_id,actor_id,actor_name,action,details) VALUES($1,$2,$3,$4,$5)",
        [
          old.id,
          req.hcUser.id,
          req.hcUser.nombre,
          restore ? "restauracion" : "eliminacion",
          JSON.stringify({
            version: updated.rows[0].version,
            reason: restore ? old.delete_reason : reason,
            preservedStatus: old.status,
          }),
        ],
      );
      await client.query("COMMIT");
      res.json(mapRow(updated.rows[0]));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  router.delete(
    "/services/:id",
    wrap((req, res) => trash(req, res, false)),
  );
  router.post(
    "/services/:id/restore",
    wrap((req, res) => trash(req, res, true)),
  );
  router.use((req, res) =>
    res.status(404).json({ error: "Ruta Hispacold no encontrada." }),
  );
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (!error.status) console.error("[Hispacold]", error.message);
    res.status(error.status || 500).json({
      error: error.status
        ? error.message
        : "No se pudo completar la operación. Intenta nuevamente.",
    });
  });
  app.use("/api/hispacold", router);
  return { init };
}
module.exports = { register, validate, schema, mapRow };
