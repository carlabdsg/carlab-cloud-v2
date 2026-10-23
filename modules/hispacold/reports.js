"use strict";
const { fleetSQL, unitRow } = require("./fleet");
const catalog = require("./catalog");
const date = (v) =>
  v instanceof Date
    ? v.toISOString().slice(0, 10)
    : v
      ? String(v).slice(0, 10)
      : null;
const localToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mazatlan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function period(kind, anchor, fail) {
  const d = new Date(anchor + "T12:00:00Z");
  if (kind === "week") {
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const from = date(d);
    d.setUTCDate(d.getUTCDate() + 6);
    return { from, to: date(d) };
  }
  if (kind === "month")
    return {
      from: anchor.slice(0, 7) + "-01",
      to: date(
        new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)),
      ),
    };
  fail("Selecciona semana o mes.");
}
function register(router, { pool, wrap, fail, text, brand, day, transaction }) {
  router.get(
    "/reports/options",
    wrap(async (req, res) => {
      const b = !req.acBrand
        ? req.query.brand
          ? brand(req.query.brand)
          : null
        : req.acBrand;
      const r = await pool.query(
        `SELECT DISTINCT company FROM (
    SELECT c.name AS company,u.brand FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id
    UNION SELECT company,COALESCE(payload->>'brand','hispacold') FROM hc_services WHERE deleted_at IS NULL
    UNION SELECT operator_company,brand FROM ac_requests WHERE deleted_at IS NULL
    ) x WHERE ($1::text IS NULL OR brand=$1) AND ($2::text IS NULL OR LOWER(TRIM(company))=LOWER(TRIM($2))) ORDER BY company`,
        [b, req.acCompany],
      );
      res.json({ companies: r.rows.map((r) => r.company) });
    }),
  );
  router.get(
    "/reports",
    wrap(async (req, res) => {
      const anchor = day(req.query.anchor);
      if (!anchor) fail("Selecciona una fecha del periodo.");
      const kind = text(req.query.period, 10),
        range = period(kind, anchor, fail);
      const b = !req.acBrand
        ? req.query.brand
          ? brand(req.query.brand)
          : null
        : req.acBrand;
      const company = req.acCompany || text(req.query.company, 180),
        today = localToday();
      const report = await transaction(async (db) => {
        await db.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        const p = [range.from, range.to, b, company];
        const scope = `($3::text IS NULL OR COALESCE(s.payload->>'brand','hispacold')=$3) AND ($4='' OR LOWER(TRIM(s.company))=LOWER(TRIM($4)))`;
        const os = await db.query(
          `SELECT s.id,s.number,s.type,s.status,s.company,s.unit,s.service_date,s.next_date,
     s.payload->>'brand' AS brand,s.payload->>'attention' AS attention,s.payload->>'technician' AS technician,
     s.payload->>'result' AS result,s.payload->>'symptoms' AS symptoms,s.payload->>'workDone' AS work_done,
     s.payload->>'recommendations' AS recommendations
     FROM hc_services s WHERE s.deleted_at IS NULL AND ${scope}
     AND (s.service_date BETWEEN $1::date AND $2::date OR s.status IN ('borrador','en_proceso','espera_refaccion'))
     ORDER BY s.service_date DESC,s.number DESC LIMIT 10001`,
          p,
        );
        const rs = await db.query(
          `SELECT r.id,r.number,r.kind,r.brand,r.operator_company AS company,r.unit,
     CASE WHEN s.status='completado' AND s.deleted_at IS NULL THEN 'atendida' ELSE r.status END AS status,
     (r.created_at AT TIME ZONE 'America/Mazatlan')::date AS created_date,
     r.payload->>'description' AS description,r.payload->>'partName' AS part_name,r.payload->>'quantity' AS quantity,
     r.payload->>'priority' AS priority,r.payload->>'scheduledDate' AS scheduled_date
     FROM ac_requests r LEFT JOIN hc_services s ON s.id=r.service_id AND LOWER(TRIM(s.company))=LOWER(TRIM(r.operator_company)) AND LOWER(TRIM(s.unit))=LOWER(TRIM(r.unit)) AND COALESCE(s.payload->>'brand','hispacold')=r.brand
     WHERE r.deleted_at IS NULL AND ($3::text IS NULL OR r.brand=$3) AND ($4='' OR LOWER(TRIM(r.operator_company))=LOWER(TRIM($4)))
     AND ((r.created_at AT TIME ZONE 'America/Mazatlan')::date BETWEEN $1::date AND $2::date OR
      (r.status NOT IN ('atendida','entregada','rechazada','cancelada') AND NOT (COALESCE(s.status,'')='completado' AND s.deleted_at IS NULL)))
     ORDER BY r.created_at DESC LIMIT 10001`,
          p,
        );
        const fs = await db.query(
          fleetSQL +
            ` WHERE u.active=TRUE AND ($2::text IS NULL OR u.brand=$2) AND ($3='' OR LOWER(TRIM(c.name))=LOWER(TRIM($3))) ORDER BY c.name,u.unit`,
          [today, b, company],
        );
        const ms = await db.query(
          `SELECT m.id,m.tipo,m.cantidad,m.empresa,m.unidad,m.garantia_folio,m.notas,
     (m.created_at AT TIME ZONE 'America/Mazatlan')::date AS movement_date,s.nombre,s.sku,p.brands,ar.brand AS request_brand
     FROM ac_stock_movements m JOIN ac_stock_parts s ON s.id=m.stock_part_id JOIN ac_stock_profiles p ON p.stock_part_id=s.id
     LEFT JOIN ac_inventory_events ev ON ev.stock_movement_id=m.id LEFT JOIN ac_requests ar ON ar.id=ev.request_id
     WHERE (m.created_at AT TIME ZONE 'America/Mazatlan')::date BETWEEN $1::date AND $2::date
     AND ($3::text IS NULL OR (m.tipo='salida_unidad' AND ar.brand=$3) OR (m.tipo<>'salida_unidad' AND p.brands @> jsonb_build_array($3::text))) AND ($4='' OR LOWER(TRIM(m.empresa))=LOWER(TRIM($4)))
     AND m.tipo<>'saldo_inicial' AND ($5::boolean OR m.tipo='salida_unidad') ORDER BY m.created_at DESC LIMIT 10001`,
          [...p, req.acAdmin],
        );
        if ([os, rs, ms].some((r) => r.rows.length > 10000))
          fail(
            "Este reporte supera 10,000 registros. Selecciona una empresa, marca o semana.",
            413,
          );
        const orders = os.rows.map((r) => ({
          ...r,
          brand: r.brand || "hispacold",
          folio: "HC-" + String(r.number).padStart(6, "0"),
          service_date: date(r.service_date),
          next_date: date(r.next_date),
        }));
        const requests = rs.rows.map((r) => ({
          ...r,
          folio:
            (r.kind === "part" ? "RAC-" : "SAC-") +
            String(r.number).padStart(6, "0"),
          created_date: date(r.created_date),
        }));
        const inPeriod = (d) => d >= range.from && d <= range.to;
        const periodOrders = orders.filter((r) => inPeriod(r.service_date));
        const periodRequests = requests.filter((r) => inPeriod(r.created_date));
        const pendingOrders = orders.filter((r) =>
          ["borrador", "en_proceso", "espera_refaccion"].includes(r.status),
        );
        const pendingRequests = requests.filter(
          (r) =>
            !["atendida", "entregada", "rechazada", "cancelada"].includes(
              r.status,
            ),
        );
        const units = fs.rows.map((r) => unitRow(r, today));
        const groups = new Map();
        const group = (company, brand) => {
          const key = JSON.stringify([company.trim().toLowerCase(), brand]);
          if (!groups.has(key))
            groups.set(key, {
              company,
              brand,
              units: 0,
              orders: 0,
              completed: 0,
              requests: 0,
              pendingOrders: 0,
              pendingRequests: 0,
              critical: 0,
              overdue: 0,
            });
          return groups.get(key);
        };
        for (const u of units) {
          const g = group(u.company, u.brand);
          g.units++;
          if (u.signal === "red") g.critical++;
          if (u.nextDate && u.nextDate < today) g.overdue++;
        }
        for (const o of periodOrders) {
          const g = group(o.company, o.brand);
          g.orders++;
          if (o.status === "completado") g.completed++;
        }
        for (const r of periodRequests) group(r.company, r.brand).requests++;
        for (const o of pendingOrders)
          group(o.company, o.brand).pendingOrders++;
        for (const r of pendingRequests)
          group(r.company, r.brand).pendingRequests++;
        let lowStock = [];
        if (req.acAdmin && !company)
          lowStock = (
            await db.query(
              `SELECT s.nombre,s.sku,s.stock_actual,s.stock_minimo,p.brands FROM ac_stock_parts s JOIN ac_stock_profiles p ON p.stock_part_id=s.id WHERE s.stock_minimo>0 AND s.stock_actual<=s.stock_minimo AND ($1::text IS NULL OR p.brands @> jsonb_build_array($1::text)) ORDER BY s.nombre`,
              [b],
            )
          ).rows;
        return {
          period: kind,
          ...range,
          brand: b,
          company,
          asOf: today,
          generatedAt: new Date().toISOString(),
          note: "Órdenes por fecha de servicio; solicitudes y movimientos por fecha de registro (Mazatlán). Los estados, pendientes y semáforos son los actuales al generar el reporte; no reconstruyen un corte histórico.",
          summary: {
            orders: periodOrders.length,
            completed: periodOrders.filter((o) => o.status === "completado")
              .length,
            cancelled: periodOrders.filter((o) => o.status === "cancelado")
              .length,
            serviceRequests: periodRequests.filter((r) => r.kind === "service")
              .length,
            partRequests: periodRequests.filter((r) => r.kind === "part")
              .length,
            pendingOrders: pendingOrders.length,
            pendingRequests: pendingRequests.length,
            units: units.length,
            critical: units.filter((u) => u.signal === "red").length,
            overdue: units.filter((u) => u.nextDate && u.nextDate < today)
              .length,
          },
          groups: [...groups.values()].sort(
            (a, b) =>
              a.company.localeCompare(b.company) ||
              a.brand.localeCompare(b.brand),
          ),
          orders: periodOrders,
          requests: periodRequests,
          pendingOrders,
          pendingRequests,
          units: units.map((u) => ({
            company: u.company,
            unit: u.unit,
            brand: u.brand,
            signal: u.signal,
            signalLabel: u.signalLabel,
            nextDate: u.nextDate,
            reasons: u.reasons.map((r) => r.text).join("; "),
          })),
          movements: ms.rows.map((m) => ({
            ...m,
            notas: req.acAdmin ? m.notas : "Entrega de refacción a la unidad",
            brands: req.acAdmin ? m.brands : [m.request_brand].filter(Boolean),
            movement_date: date(m.movement_date),
          })),
          lowStock,
          inventoryScope: !req.acAdmin
            ? "Entregas de refacciones dentro de tu acceso autorizado. Las existencias y movimientos internos del almacén son exclusivos del administrador."
            : company
              ? "Movimientos asignados a esta empresa. Las entradas generales no se atribuyen a empresas."
              : "Movimientos del almacén AC de la marca seleccionada; las piezas compatibles con ambas marcas aparecen una sola vez.",
          serviceTypes: catalog.types,
          statuses: catalog.statuses,
        };
      });
      res.json(report);
    }),
  );
}
module.exports = { register, period };
