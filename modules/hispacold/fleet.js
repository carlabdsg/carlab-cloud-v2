"use strict";
const crypto = require("crypto");
const qr = require("./qr");
const conditions = {
  sin_evaluar: "Sin evaluación",
  operativo: "Operativo",
  con_observaciones: "Con observaciones",
  no_operativo: "No operativo",
};
const signals = {
  red: "Atención crítica",
  amber: "Requiere seguimiento",
  green: "AC operativo",
  gray: "Sin verificación vigente",
};
const schema = `
CREATE TABLE IF NOT EXISTS ac_fleet_companies (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
 contact TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ac_fleet_company_identity ON ac_fleet_companies(LOWER(TRIM(name)));
CREATE TABLE IF NOT EXISTS ac_fleet_units (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES ac_fleet_companies(id), brand TEXT NOT NULL CHECK(brand IN ('hispacold','eberspaecher')),
 unit TEXT NOT NULL, fleet TEXT NOT NULL DEFAULT '', base TEXT NOT NULL DEFAULT '', bus_brand TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
 year TEXT NOT NULL DEFAULT '', mileage TEXT NOT NULL DEFAULT '', work_number TEXT NOT NULL DEFAULT '', plate TEXT NOT NULL DEFAULT '',
 ac_model TEXT NOT NULL DEFAULT '', ac_serial TEXT NOT NULL DEFAULT '', warranty_end DATE, next_date DATE,
 condition TEXT NOT NULL DEFAULT 'sin_evaluar' CHECK(condition IN ('sin_evaluar','operativo','con_observaciones','no_operativo')),
 checked_on DATE, condition_note TEXT NOT NULL DEFAULT '', verified_at TIMESTAMPTZ,
 review_days INTEGER NOT NULL DEFAULT 90 CHECK(review_days BETWEEN 1 AND 365), source_id TEXT,
 active BOOLEAN NOT NULL DEFAULT TRUE, version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ac_fleet_unit_identity ON ac_fleet_units(company_id,LOWER(TRIM(unit)));
CREATE INDEX IF NOT EXISTS ac_fleet_unit_brand ON ac_fleet_units(brand,active,company_id);
CREATE TABLE IF NOT EXISTS ac_fleet_events (
 id BIGSERIAL PRIMARY KEY, unit_id TEXT NOT NULL REFERENCES ac_fleet_units(id), actor_name TEXT NOT NULL,
 action TEXT NOT NULL, notes TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ac_fleet_events_unit ON ac_fleet_events(unit_id,id DESC);
CREATE INDEX IF NOT EXISTS hc_services_ac_fleet_match ON hc_services(LOWER(TRIM(company)),LOWER(TRIM(unit)),(COALESCE(payload->>'brand','hispacold'))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ac_requests_fleet_match ON ac_requests(LOWER(TRIM(operator_company)),LOWER(TRIM(unit)),brand);
`;
const date = (v) =>
  v
    ? v instanceof Date
      ? v.toISOString().slice(0, 10)
      : String(v).slice(0, 10)
    : null;
const days = (a, b) =>
  Math.floor(
    (Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000,
  );
const serviceMatch = `LOWER(TRIM(s.company))=LOWER(TRIM(c.name)) AND LOWER(TRIM(s.unit))=LOWER(TRIM(u.unit)) AND COALESCE(s.payload->>'brand','hispacold')=u.brand AND s.deleted_at IS NULL`;
const requestMatch = `LOWER(TRIM(r.operator_company))=LOWER(TRIM(c.name)) AND LOWER(TRIM(r.unit))=LOWER(TRIM(u.unit)) AND r.brand=u.brand`;
// Select only operational fields. Prices, signatures and photos never enter fleet summaries.
const fleetSQL = `SELECT u.*,c.name AS company,c.region,c.city,
 o.open_orders,o.waiting_parts,o.repeat_repairs,o.oldest_order,
 lc.service_date AS last_service,lc.result AS last_result,lc.updated_at AS last_closed_at,
 lm.next_date AS service_next_date,lm.service_date AS maintenance_date,
 rq.service_requests,rq.part_requests,rq.urgent_requests,rq.oldest_request
 FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id
 LEFT JOIN LATERAL (
 SELECT COUNT(*) FILTER(WHERE s.status IN ('borrador','en_proceso','espera_refaccion'))::int AS open_orders,
 COUNT(*) FILTER(WHERE s.status='espera_refaccion')::int AS waiting_parts,
 COUNT(*) FILTER(WHERE s.status='completado' AND s.type IN ('menor','mayor') AND s.service_date BETWEEN $1::date-89 AND $1::date)::int AS repeat_repairs,
 MIN(s.created_at) FILTER(WHERE s.status IN ('borrador','en_proceso','espera_refaccion')) AS oldest_order
 FROM hc_services s WHERE ${serviceMatch}
 ) o ON TRUE
 LEFT JOIN LATERAL (SELECT s.service_date,s.payload->>'result' AS result,s.updated_at FROM hc_services s WHERE ${serviceMatch} AND s.status='completado' ORDER BY s.service_date DESC,s.number DESC LIMIT 1) lc ON TRUE
 LEFT JOIN LATERAL (SELECT s.next_date,s.service_date FROM hc_services s WHERE ${serviceMatch} AND s.status='completado' AND (s.type='preventivo' OR s.next_date IS NOT NULL) ORDER BY s.service_date DESC,s.number DESC LIMIT 1) lm ON TRUE
 LEFT JOIN LATERAL (
 SELECT COUNT(*) FILTER(WHERE r.kind='service')::int AS service_requests,COUNT(*) FILTER(WHERE r.kind='part')::int AS part_requests,
 COUNT(*) FILTER(WHERE r.kind='service' AND r.payload->>'priority'='urgente')::int AS urgent_requests,MIN(r.created_at) AS oldest_request
 FROM ac_requests r LEFT JOIN hc_services linked ON linked.id=r.service_id
 WHERE ${requestMatch} AND r.deleted_at IS NULL AND r.status NOT IN ('entregada','rechazada','cancelada') AND
 (r.kind='part' OR r.service_id IS NULL OR linked.deleted_at IS NOT NULL OR linked.status='cancelado')
 ) rq ON TRUE`;
function unitRow(r, today) {
  const manualDay = date(r.checked_on),
    lastDay = date(r.last_service);
  const manual =
    manualDay &&
    (!lastDay ||
      manualDay > lastDay ||
      (manualDay === lastDay &&
        new Date(r.verified_at) > new Date(r.last_closed_at)));
  const verifiedOn = manual ? manualDay : lastDay;
  const condition = (manual ? r.condition : r.last_result) || "sin_evaluar";
  const fresh =
    !!verifiedOn &&
    days(today, verifiedOn) >= 0 &&
    days(today, verifiedOn) <= r.review_days &&
    condition !== "sin_evaluar";
  const nextDate = date(r.maintenance_date)
    ? date(r.service_next_date)
    : date(r.next_date);
  const dueIn = nextDate ? days(nextDate, today) : null;
  const reasons = [];
  if (condition === "no_operativo")
    reasons.push({
      color: "red",
      text: "AC no operativo",
      detail: "Última evaluación registrada.",
    });
  if (r.waiting_parts)
    reasons.push({
      color: "red",
      text: "Orden en espera de refacción",
      detail: `${r.waiting_parts} orden(es) pendientes.`,
    });
  if (r.urgent_requests)
    reasons.push({
      color: "red",
      text: "Solicitud urgente por atender",
      detail: "Requiere revisión y programación por Carlab.",
    });
  if (r.open_orders)
    reasons.push({
      color: "amber",
      text: "Servicio en proceso",
      detail: `${r.open_orders} orden(es) abiertas.`,
    });
  if (r.service_requests)
    reasons.push({
      color: "amber",
      text: "Servicio solicitado",
      detail: `${r.service_requests} solicitud(es) sin orden activa.`,
    });
  if (r.part_requests)
    reasons.push({
      color: "amber",
      text: "Refacciones solicitadas",
      detail: `${r.part_requests} solicitud(es) pendientes de entrega.`,
    });
  if (dueIn !== null && dueIn < 0)
    reasons.push({
      color: "amber",
      text: "Mantenimiento vencido",
      detail: `${-dueIn} día(s) de atraso.`,
    });
  else if (dueIn !== null && dueIn <= 7)
    reasons.push({
      color: "amber",
      text: dueIn === 0 ? "Servicio previsto para hoy" : "Servicio próximo",
      detail: `Programado para ${nextDate}.`,
    });
  if (condition === "con_observaciones")
    reasons.push({
      color: "amber",
      text: "Operación con observaciones",
      detail: "Consulta el expediente técnico.",
    });
  if (r.repeat_repairs >= 2)
    reasons.push({
      color: "amber",
      text: "Reparaciones recurrentes",
      detail: `${r.repeat_repairs} reparaciones cerradas en los últimos 90 días.`,
    });
  if (!fresh)
    reasons.push({
      color: "gray",
      text: verifiedOn
        ? "Verificación por actualizar"
        : "Sin evaluación registrada",
      detail: `Vigencia de seguimiento: ${r.review_days} días. No sustituye el plan del fabricante.`,
    });
  if (!reasons.length)
    reasons.push({
      color: "green",
      text: "AC operativo",
      detail: "Evaluación vigente y sin pendientes registrados.",
    });
  const signal = ["red", "amber", "gray", "green"].find((s) =>
    reasons.some((r) => r.color === s),
  );
  const pendingSince = [r.oldest_order, r.oldest_request]
    .filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b))[0];
  return {
    id: r.id,
    companyId: r.company_id,
    company: r.company,
    region: r.region,
    city: r.city,
    brand: r.brand,
    unit: r.unit,
    fleet: r.fleet,
    base: r.base,
    busBrand: r.bus_brand,
    model: r.model,
    year: r.year,
    mileage: r.mileage,
    workNumber: r.work_number,
    plate: r.plate,
    acModel: r.ac_model,
    acSerial: r.ac_serial,
    warrantyEnd: date(r.warranty_end),
    initialNextDate: date(r.next_date),
    nextDate,
    dueIn,
    condition,
    manualCondition: r.condition,
    checkedOn: manualDay,
    conditionNote: r.condition_note,
    verifiedOn,
    verificationSource: verifiedOn
      ? manual
        ? "Registro del administrador"
        : "Orden de servicio cerrada"
      : null,
    fresh,
    reviewDays: r.review_days,
    signal,
    signalLabel: signals[signal],
    reasons,
    openOrders: r.open_orders || 0,
    serviceRequests: r.service_requests || 0,
    partRequests: r.part_requests || 0,
    repeatRepairs: r.repeat_repairs || 0,
    pendingDays: pendingSince
      ? Math.max(0, days(today, date(pendingSince)))
      : 0,
    lastService: lastDay,
    active: r.active,
    version: r.version,
    updatedAt: r.updated_at,
  };
}
function register(
  router,
  {
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
  },
) {
  const todayOf = (req) =>
    day(req.query.today) ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mazatlan",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const checkVersion = (body, old) => {
    if (!Number.isInteger(body.version) || body.version !== old.version)
      fail("El registro cambió. Actualiza y vuelve a intentar.", 409);
  };
  const companyRow = (r) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    city: r.city,
    contact: r.contact,
    phone: r.phone,
    version: r.version,
  });
  async function companies(req) {
    const r = await pool.query(
      `SELECT c.* FROM ac_fleet_companies c ${req.acAdmin ? "" : req.acCompanyId ? "WHERE c.id=$1" : "WHERE EXISTS(SELECT 1 FROM ac_fleet_units u WHERE u.company_id=c.id AND u.brand=$1 AND u.active=TRUE)"} ORDER BY c.name`,
      req.acAdmin ? [] : [req.acCompanyId || req.acBrand],
    );
    return r.rows.map(companyRow);
  }
  async function getUnit(req, id, db = pool, lock = false) {
    const r = await db.query(
      `SELECT u.*,c.name AS company FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id WHERE u.id=$1 ${lock ? "FOR UPDATE OF u" : ""}`,
      [id],
    );
    if (!r.rows[0] || (!req.acAdmin && !r.rows[0].active))
      fail("Unidad no encontrada.", 404);
    allowed(req, r.rows[0].brand, r.rows[0].company);
    return r.rows[0];
  }
  qr.register(router, {
    pool,
    admin,
    wrap,
    fail,
    allowed,
    transaction,
    getUnit,
    audit,
  });
  async function overview(req) {
    const today = todayOf(req),
      p = [today],
      w = [];
    if (req.acBrand) {
      p.push(req.acBrand);
      w.push(`u.brand=$${p.length}`);
    } else if (req.query.brand) {
      p.push(brand(req.query.brand));
      w.push(`u.brand=$${p.length}`);
    }
    if (req.acCompanyId) {
      p.push(req.acCompanyId);
      w.push(`u.company_id=$${p.length}`);
    }
    w.push(
      req.acAdmin && req.query.archived === "true"
        ? "u.active=FALSE"
        : "u.active=TRUE",
    );
    if (req.query.company) {
      p.push(text(req.query.company, 100));
      w.push(`u.company_id=$${p.length}`);
    }
    if (req.query.region) {
      p.push(text(req.query.region, 120));
      w.push(`c.region=$${p.length}`);
    }
    if (req.query.base) {
      p.push(text(req.query.base, 120));
      w.push(`u.base=$${p.length}`);
    }
    if (req.query.q) {
      p.push("%" + text(req.query.q, 180) + "%");
      w.push(
        `(c.name||' '||u.unit||' '||u.fleet||' '||u.base||' '||u.model||' '||u.ac_model||' '||u.ac_serial||' '||u.plate) ILIKE $${p.length}`,
      );
    }
    const r = await pool.query(fleetSQL + " WHERE " + w.join(" AND "), p);
    const all = r.rows.map((r) => unitRow(r, today));
    const summary = {
      total: all.length,
      green: 0,
      amber: 0,
      red: 0,
      gray: 0,
      overdue: 0,
      recurring: 0,
      openOrders: 0,
      serviceRequests: 0,
      partRequests: 0,
    };
    const groups = new Map();
    for (const u of all) {
      summary[u.signal]++;
      summary.overdue += u.dueIn !== null && u.dueIn < 0 ? 1 : 0;
      summary.recurring += u.repeatRepairs >= 2 ? 1 : 0;
      summary.openOrders += u.openOrders;
      summary.serviceRequests += u.serviceRequests;
      summary.partRequests += u.partRequests;
      if (!groups.has(u.companyId))
        groups.set(u.companyId, {
          id: u.companyId,
          name: u.company,
          total: 0,
          green: 0,
          amber: 0,
          red: 0,
          gray: 0,
        });
      const c = groups.get(u.companyId);
      c.total++;
      c[u.signal]++;
    }
    let items = all;
    if (req.query.signal) {
      if (!Object.hasOwn(signals, req.query.signal)) fail("Semáforo inválido.");
      items = items.filter((u) => u.signal === req.query.signal);
    }
    if (req.query.focus === "overdue")
      items = items.filter((u) => u.dueIn !== null && u.dueIn < 0);
    if (req.query.focus === "recurring")
      items = items.filter((u) => u.repeatRepairs >= 2);
    if (req.query.focus === "attention")
      items = items.filter((u) => u.signal === "red" || u.signal === "amber");
    if (req.query.focus === "pending")
      items = items.filter(
        (u) => u.openOrders || u.serviceRequests || u.partRequests,
      );
    const rank = { red: 0, amber: 1, gray: 2, green: 3 };
    items.sort(
      (a, b) =>
        rank[a.signal] - rank[b.signal] ||
        b.pendingDays - a.pendingDays ||
        a.company.localeCompare(b.company, "es") ||
        a.unit.localeCompare(b.unit, "es", { numeric: true }),
    );
    return {
      items,
      summary,
      companies: [...groups.values()].sort(
        (a, b) => b.red - a.red || a.name.localeCompare(b.name),
      ),
      today,
    };
  }
  router.get(
    "/fleet/options",
    wrap(async (req, res) => {
      const p = req.acAdmin ? [] : [req.acCompanyId || req.acBrand];
      const r = await pool.query(
        `SELECT DISTINCT u.base,c.region FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id WHERE u.active=TRUE ${req.acAdmin ? "" : req.acCompanyId ? "AND u.company_id=$1" : "AND u.brand=$1"}`,
        p,
      );
      res.json({
        companies: await companies(req),
        regions: [
          ...new Set(r.rows.map((r) => r.region).filter(Boolean)),
        ].sort(),
        bases: [...new Set(r.rows.map((r) => r.base).filter(Boolean))].sort(),
        conditions,
        signals,
        canManage: req.acAdmin,
      });
    }),
  );
  router.get(
    "/fleet/companies",
    wrap(async (req, res) => res.json(await companies(req))),
  );
  async function saveCompany(req, id) {
    const b = req.body;
    return transaction(async (db) => {
      const old = id
        ? (
            await db.query(
              "SELECT * FROM ac_fleet_companies WHERE id=$1 FOR UPDATE",
              [id],
            )
          ).rows[0]
        : null;
      if (id && !old) fail("Empresa no encontrada.", 404);
      if (old) checkVersion(b, old);
      const name = text(b.name, 180);
      if (!name) fail("Escribe el nombre de la empresa.");
      if (old && name !== old.name)
        fail(
          "El nombre identifica los expedientes existentes y no puede cambiarse.",
        );
      const vals = [
        id || crypto.randomUUID(),
        name,
        text(b.region, 120),
        text(b.city, 120),
        text(b.contact, 180),
        text(b.phone, 80),
      ];
      const r = old
        ? await db.query(
            "UPDATE ac_fleet_companies SET name=$2,region=$3,city=$4,contact=$5,phone=$6,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *",
            vals,
          )
        : await db.query(
            "INSERT INTO ac_fleet_companies(id,name,region,city,contact,phone) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            vals,
          );
      return companyRow(r.rows[0]);
    });
  }
  router.post(
    "/fleet/companies",
    admin,
    wrap(async (req, res) => res.status(201).json(await saveCompany(req))),
  );
  router.patch(
    "/fleet/companies/:id",
    admin,
    wrap(async (req, res) => res.json(await saveCompany(req, req.params.id))),
  );
  router.get(
    "/fleet/import-candidates",
    admin,
    wrap(async (req, res) => {
      const q = text(req.query.q, 180),
        offset = page(req.query);
      const r = await pool.query(
        `SELECT id,empresa AS company,numero_economico AS unit,numero_obra AS "workNumber",marca AS "busBrand",modelo AS model,anio AS year,kilometraje AS mileage FROM fleet_units WHERE (empresa||' '||numero_economico) ILIKE $1 ORDER BY empresa,numero_economico LIMIT 51 OFFSET $2`,
        ["%" + q + "%", offset],
      );
      res.json({
        items: r.rows.slice(0, 50),
        hasMore: r.rows.length > 50,
        offset,
      });
    }),
  );
  const unitFields = {
    fleet: "fleet",
    base: "base",
    busBrand: "bus_brand",
    model: "model",
    year: "year",
    mileage: "mileage",
    workNumber: "work_number",
    plate: "plate",
    acModel: "ac_model",
    acSerial: "ac_serial",
  };
  function validated(b, old, today) {
    const data = {};
    for (const [k, col] of Object.entries(unitFields))
      data[col] = text(b[k], k === "year" ? 4 : 120);
    if (data.year && !/^(19|20)\d{2}$/.test(data.year))
      fail("Año de unidad inválido.");
    if (data.mileage && !/^\d{1,9}$/.test(data.mileage))
      fail("Kilometraje inválido. Usa un número entero.");
    data.warranty_end = day(b.warrantyEnd);
    data.next_date = day(b.initialNextDate);
    data.condition = text(b.manualCondition || "sin_evaluar", 30);
    if (!Object.hasOwn(conditions, data.condition))
      fail("Evaluación inválida.");
    data.checked_on = day(b.checkedOn);
    data.condition_note = text(b.conditionNote, 2000);
    if (
      data.condition !== "sin_evaluar" &&
      (!data.checked_on || !data.condition_note)
    )
      fail("Registra la fecha y el sustento de la evaluación.");
    if (data.checked_on && data.checked_on > today)
      fail("La evaluación no puede tener fecha futura.");
    if (data.condition === "sin_evaluar") data.checked_on = null;
    data.review_days = Number(b.reviewDays ?? 90);
    if (
      !Number.isInteger(data.review_days) ||
      data.review_days < 1 ||
      data.review_days > 365
    )
      fail("La vigencia debe estar entre 1 y 365 días.");
    if (b.active !== undefined && typeof b.active !== "boolean")
      fail("Estado de registro inválido.");
    data.active = b.active !== false;
    const changed =
      !old ||
      old.condition !== data.condition ||
      date(old.checked_on) !== data.checked_on ||
      old.condition_note !== data.condition_note;
    data.verified_at = changed ? new Date() : old.verified_at;
    return data;
  }
  async function audit(db, id, req, action, notes) {
    await db.query(
      "INSERT INTO ac_fleet_events(unit_id,actor_name,action,notes) VALUES($1,$2,$3,$4)",
      [id, req.acUser.nombre, action, notes],
    );
  }
  async function createUnit(db, req, b, company) {
    if (!b || typeof b !== "object" || Array.isArray(b))
      fail("Unidad inválida.");
    const id = crypto.randomUUID(),
      u = text(b.unit, 80),
      br = brand(b.brand);
    if (!u) fail("El número económico es obligatorio.");
    const data = validated(b, null, todayOf(req));
    const columns = ["id", "company_id", "brand", "unit", ...Object.keys(data)],
      values = [id, company.id, br, u, ...Object.values(data)];
    const inserted = await db.query(
      `INSERT INTO ac_fleet_units(${columns.join(",")}) VALUES(${values.map((_, i) => "$" + (i + 1)).join(",")}) ON CONFLICT (company_id,LOWER(TRIM(unit))) DO NOTHING RETURNING id`,
      values,
    );
    if (!inserted.rows.length) {
      // Keep one identity per company, including archived units. Lock the old
      // record so simultaneous registrations cannot restore it twice.
      const old = (
        await db.query(
          "SELECT * FROM ac_fleet_units WHERE company_id=$1 AND LOWER(TRIM(unit))=LOWER(TRIM($2)) FOR UPDATE",
          [company.id, u],
        )
      ).rows[0];
      if (!old) fail("El registro cambió. Actualiza y vuelve a intentar.", 409);
      if (old.active)
        fail(
          `La unidad ${old.unit} ya está activa en esta empresa. Puedes actualizarla desde Editar ficha.`,
          409,
        );
      if (old.brand !== br)
        fail(
          `La unidad ${old.unit} fue eliminada con marca ${old.brand === "hispacold" ? "Hispacold" : "Eberspächer"}. Selecciona esa marca para reincorporarla con su historial.`,
          409,
        );
      if (!data.active)
        fail(
          "La unidad ya está eliminada. Regístrala como activa para reincorporarla.",
          409,
        );
      // Reincorporation preserves the original technical data and QR. The
      // defaults of a new registration must not erase its evaluation or plan.
      await db.query(
        "UPDATE ac_fleet_units SET active=TRUE,version=version+1,updated_at=NOW() WHERE id=$1",
        [old.id],
      );
      await audit(
        db,
        old.id,
        req,
        "Unidad reincorporada a la flota",
        "Reincorporación desde Registrar unidades. Se conserva la ficha anterior, su historial y su código QR.",
      );
      return { id: old.id, restored: true };
    }
    await qr.ensure(db, id);
    await audit(
      db,
      id,
      req,
      "Unidad registrada",
      data.condition_note || "Registro de equipo de climatización.",
    );
    if (data.condition === "no_operativo")
      await notice(db, {
        eventKey: `fleet-critical:${id}:1`,
        brand: br,
        kind: "fleet_condition",
        title: "Evaluación: AC no operativo · Unidad " + u,
        body: company.name,
        targetType: "fleet",
        targetId: id,
      });
    return { id, restored: false };
  }
  router.post(
    "/fleet/units",
    admin,
    wrap(async (req, res) => {
      const result = await transaction(async (db) => {
        const company = (
          await db.query("SELECT * FROM ac_fleet_companies WHERE id=$1", [
            text(req.body.companyId, 100),
          ])
        ).rows[0];
        if (!company) fail("Selecciona una empresa registrada.");
        const rows = req.body.units === undefined ? [req.body] : req.body.units;
        if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100)
          fail("Registra de 1 a 100 unidades por lote.");
        const units = [];
        for (const b of rows) units.push(await createUnit(db, req, b, company));
        const restoredCount = units.filter((u) => u.restored).length;
        return {
          ids: units.map((u) => u.id),
          count: units.length,
          createdCount: units.length - restoredCount,
          restoredCount,
        };
      });
      res.status(201).json(result);
    }),
  );
  router.patch(
    "/fleet/units/:id",
    admin,
    wrap(async (req, res) => {
      await transaction(async (db) => {
        const old = await getUnit(req, req.params.id, db, true);
        checkVersion(req.body, old);
        if (
          (req.body.brand && req.body.brand !== old.brand) ||
          (req.body.unit && req.body.unit !== old.unit) ||
          (req.body.companyId && req.body.companyId !== old.company_id)
        )
          fail(
            "Empresa, número económico y marca identifican el expediente y no pueden cambiarse.",
          );
        const d = validated(req.body, old, todayOf(req)),
          vals = [old.id, ...Object.values(d)];
        await db.query(
          `UPDATE ac_fleet_units SET ${Object.keys(d)
            .map((k, i) => k + "=$" + (i + 2))
            .join(",")},version=version+1,updated_at=NOW() WHERE id=$1`,
          vals,
        );
        const changed =
          old.condition !== d.condition ||
          date(old.checked_on) !== d.checked_on ||
          old.condition_note !== d.condition_note;
        const action =
          old.active !== d.active
            ? d.active
              ? "Unidad reactivada"
              : "Unidad archivada"
            : changed
              ? "Evaluación actualizada"
              : "Ficha actualizada";
        await audit(
          db,
          old.id,
          req,
          action,
          changed ? d.condition_note : action,
        );
        if (changed && d.condition === "no_operativo")
          await notice(db, {
            eventKey: `fleet-critical:${old.id}:${old.version + 1}`,
            brand: old.brand,
            kind: "fleet_condition",
            title: "Evaluación: AC no operativo · Unidad " + old.unit,
            body: old.company,
            targetType: "fleet",
            targetId: old.id,
          });
      });
      res.json({ ok: true });
    }),
  );
  async function setUnitActive(req, active) {
    const reason = text(req.body?.reason, 1000);
    if (reason.length < 3) fail("Registra el motivo (mínimo 3 caracteres).");
    return transaction(async (db) => {
      const old = await getUnit(req, req.params.id, db, true);
      checkVersion(req.body, old);
      if (old.active === active)
        fail(
          active ? "La unidad ya está activa." : "La unidad ya fue eliminada.",
          409,
        );
      await db.query(
        "UPDATE ac_fleet_units SET active=$2,version=version+1,updated_at=NOW() WHERE id=$1",
        [old.id, active],
      );
      await audit(
        db,
        old.id,
        req,
        active ? "Unidad restaurada" : "Unidad eliminada de la flota",
        reason,
      );
      return { ok: true, active };
    });
  }
  router.delete(
    "/fleet/units/:id",
    admin,
    wrap(async (req, res) => res.json(await setUnitActive(req, false))),
  );
  router.post(
    "/fleet/units/:id/restore",
    admin,
    wrap(async (req, res) => res.json(await setUnitActive(req, true))),
  );
  router.get(
    "/fleet/units",
    wrap(async (req, res) => {
      const result = await overview(req),
        offset = page(req.query);
      res.json({
        ...result,
        total: result.items.length,
        items: result.items.slice(offset, offset + 60),
        offset,
      });
    }),
  );
  router.get(
    "/fleet/export",
    wrap(async (req, res) => {
      const r = await overview(req);
      const cell = (v) =>
        '"' +
        String(v ?? "")
          .replace(/^[=+\-@\t\r]/, "'$&")
          .replace(/"/g, '""') +
        '"';
      const rows = [
        [
          "Empresa",
          "Región",
          "Base",
          "Flota",
          "Unidad",
          "Marca AC",
          "Modelo AC",
          "Serie AC",
          "Estado",
          "Motivo",
          "Órdenes abiertas",
          "Solicitudes servicio",
          "Solicitudes refacción",
          "Próximo servicio",
          "Última verificación",
          "Días pendientes",
        ],
        ...r.items.map((u) => [
          u.company,
          u.region,
          u.base,
          u.fleet,
          u.unit,
          u.brand,
          u.acModel,
          u.acSerial,
          u.signalLabel,
          u.reasons.map((r) => r.text).join(" / "),
          u.openOrders,
          u.serviceRequests,
          u.partRequests,
          u.nextDate,
          u.verifiedOn,
          u.pendingDays,
        ]),
      ];
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="flotas-ac-' + r.today + '.csv"',
      );
      res
        .type("text/csv")
        .send("\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n"));
    }),
  );
  router.get(
    "/fleet/units/:id",
    wrap(async (req, res) => {
      const u = await getUnit(req, req.params.id),
        today = todayOf(req);
      const summary = await pool.query(fleetSQL + " WHERE u.id=$2", [
        today,
        u.id,
      ]);
      const params = [u.company, u.unit, u.brand];
      const orders = await pool.query(
        `SELECT id,number,type,status,service_date,payload->>'result' AS result,payload->>'symptoms' AS symptoms,payload->>'workDone' AS work_done FROM hc_services WHERE LOWER(TRIM(company))=LOWER(TRIM($1)) AND LOWER(TRIM(unit))=LOWER(TRIM($2)) AND COALESCE(payload->>'brand','hispacold')=$3 AND deleted_at IS NULL ORDER BY service_date DESC,number DESC LIMIT 30`,
        params,
      );
      const requests = await pool.query(
        `SELECT r.id,r.number,r.kind,r.status,r.payload->>'description' AS description,r.payload->>'priority' AS priority,r.payload->>'partName' AS part_name,r.payload->>'quantity' AS quantity,r.created_at,s.status AS order_status,s.deleted_at AS order_deleted FROM ac_requests r LEFT JOIN hc_services s ON s.id=r.service_id AND LOWER(TRIM(s.company))=LOWER(TRIM(r.operator_company)) AND LOWER(TRIM(s.unit))=LOWER(TRIM(r.unit)) AND COALESCE(s.payload->>'brand','hispacold')=r.brand WHERE r.deleted_at IS NULL AND LOWER(TRIM(r.operator_company))=LOWER(TRIM($1)) AND LOWER(TRIM(r.unit))=LOWER(TRIM($2)) AND r.brand=$3 ORDER BY r.number DESC LIMIT 30`,
        params,
      );
      const events = await pool.query(
        "SELECT action,notes,actor_name,created_at FROM ac_fleet_events WHERE unit_id=$1 ORDER BY id DESC LIMIT 30",
        [u.id],
      );
      res.json({
        unit: unitRow(summary.rows[0], today),
        orders: orders.rows.map((o) => ({
          ...o,
          service_date: date(o.service_date),
          folio: "HC-" + String(o.number).padStart(6, "0"),
        })),
        requests: requests.rows.map((r) => ({
          ...r,
          status:
            r.order_status === "completado" && !r.order_deleted
              ? "atendida"
              : r.status,
          folio:
            (r.kind === "service" ? "SAC-" : "RAC-") +
            String(r.number).padStart(6, "0"),
        })),
        events: events.rows,
        today,
      });
    }),
  );
}
module.exports = { schema: schema + qr.schema, register, unitRow, fleetSQL };
