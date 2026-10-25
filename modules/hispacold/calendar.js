"use strict";
// One current maintenance date per company, economic number and AC brand.
function register(
  router,
  { pool, wrap, fail, text, brand, day, page, scheduleCTE },
) {
  const date = (v) =>
    v instanceof Date
      ? v.toISOString().slice(0, 10)
      : v
        ? String(v).slice(0, 10)
        : null;
  const cte =
    scheduleCTE +
    `, maintenance AS (
    SELECT 'order:'||l.id AS id,l.id AS order_id,l.number,l.brand,
      COALESCE(c.name,l.company) AS company,l.unit,l.next_date,
      f.id AS fleet_unit_id,COALESCE(f.base,'') AS base,'order' AS source
    FROM latest l
    LEFT JOIN ac_fleet_companies c ON LOWER(TRIM(c.name))=LOWER(TRIM(l.company))
    LEFT JOIN ac_fleet_units f ON f.company_id=c.id AND LOWER(TRIM(f.unit))=LOWER(TRIM(l.unit)) AND f.brand=l.brand
    WHERE l.next_date IS NOT NULL AND (f.id IS NULL OR f.active=TRUE)
    UNION ALL
    SELECT 'fleet:'||f.id,NULL::text,NULL::bigint,f.brand,c.name,f.unit,f.next_date,f.id,f.base,'fleet'
    FROM ac_fleet_units f JOIN ac_fleet_companies c ON c.id=f.company_id
    WHERE f.active=TRUE AND f.next_date IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM latest l WHERE LOWER(TRIM(l.company))=LOWER(TRIM(c.name)) AND LOWER(TRIM(l.unit))=LOWER(TRIM(f.unit)) AND l.brand=f.brand
    )
    UNION ALL
    SELECT 'incident:'||r.id,NULL::text,i.number,r.brand,r.operator_company,r.unit,(r.payload->>'scheduledDate')::date,u.id,u.base,'incident'
    FROM ac_incidents i JOIN ac_requests r ON r.id=i.request_id JOIN ac_fleet_units u ON u.id=i.fleet_unit_id
    LEFT JOIN hc_services s ON s.id=r.service_id
    WHERE u.active=TRUE AND r.deleted_at IS NULL AND i.status NOT IN ('resuelto','descartado','confirmacion')
    AND COALESCE(r.payload->>'scheduledDate','')<>'' AND (s.id IS NULL OR s.status<>'completado' OR s.deleted_at IS NOT NULL)
  ) `;
  router.get(
    "/calendar",
    wrap(async (req, res) => {
      const today = day(req.query.today),
        month = text(req.query.month, 7);
      if (!today || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))
        fail(
          "Selecciona un mes válido entre 2000 y 2099 y el día de consulta.",
        );
      const from = month + "-01",
        to = new Date(
          Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
        )
          .toISOString()
          .slice(0, 10);
      const selectedDay = day(req.query.day),
        bucket = text(req.query.bucket || "month", 20),
        offset = page(req.query);
      if (selectedDay && selectedDay.slice(0, 7) !== month)
        fail("El día seleccionado debe pertenecer al mes mostrado.");
      if (!["month", "overdue", "week"].includes(bucket))
        fail("Periodo de calendario inválido.");
      const p = [today, from, to],
        scope = [];
      if (req.acBrand) {
        p.push(req.acBrand);
        scope.push(`brand=$${p.length}`);
      } else if (req.query.brand) {
        p.push(brand(req.query.brand));
        scope.push(`brand=$${p.length}`);
      }
      if (req.acCompany) {
        p.push(req.acCompany);
        scope.push(`LOWER(TRIM(company))=LOWER(TRIM($${p.length}))`);
      }
      const visible = scope.length ? scope.join(" AND ") : "TRUE";
      // Options are scoped by permission/brand, not by the selected company or search.
      const companies = await pool.query(
        cte +
          `SELECT DISTINCT company FROM maintenance WHERE ${visible} AND $1::date IS NOT NULL AND $2::date IS NOT NULL AND $3::date IS NOT NULL ORDER BY company`,
        p,
      );
      if (req.query.company) {
        p.push(text(req.query.company, 180));
        scope.push(`company=$${p.length}`);
      }
      if (req.query.q) {
        p.push("%" + text(req.query.q, 180) + "%");
        scope.push(`(company||' '||unit||' '||base) ILIKE $${p.length}`);
      }
      const scoped =
        cte +
        `, scoped AS (SELECT * FROM maintenance WHERE ${scope.length ? scope.join(" AND ") : "TRUE"}) `;
      const summary = await pool.query(
        scoped +
          `SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE next_date<$1::date)::int overdue,COUNT(*) FILTER(WHERE next_date BETWEEN $1::date AND $1::date+6)::int week,COUNT(*) FILTER(WHERE next_date BETWEEN $2::date AND $3::date)::int AS "month" FROM scoped`,
        p,
      );
      const days = await pool.query(
        scoped +
          `SELECT next_date,COUNT(*)::int total,(ARRAY_AGG(unit ORDER BY unit))[1:2] AS units FROM scoped WHERE next_date BETWEEN $2::date AND $3::date AND $1::date IS NOT NULL GROUP BY next_date ORDER BY next_date`,
        p,
      );
      let period =
        bucket === "overdue"
          ? "next_date<$1::date"
          : bucket === "week"
            ? "next_date BETWEEN $1::date AND $1::date+6"
            : "next_date BETWEEN $2::date AND $3::date";
      if (selectedDay) {
        p.push(selectedDay);
        period = `next_date=$${p.length}::date`;
      }
      const common = `WHERE ${period} AND $1::date IS NOT NULL AND $2::date IS NOT NULL AND $3::date IS NOT NULL`;
      const total = await pool.query(
        scoped + `SELECT COUNT(*)::int total FROM scoped ${common}`,
        p,
      );
      const rows = await pool.query(
        scoped +
          `SELECT * FROM scoped ${common} ORDER BY next_date,company,unit,id LIMIT 20 OFFSET $${p.length + 1}`,
        [...p, offset],
      );
      res.json({
        today,
        month,
        from,
        to,
        day: selectedDay,
        bucket,
        offset,
        limit: 20,
        total: total.rows[0].total,
        summary: summary.rows[0],
        companies: companies.rows.map((c) => c.company),
        days: days.rows.map((d) => ({
          ...d,
          date: date(d.next_date),
          next_date: undefined,
        })),
        items: rows.rows.map((r) => ({
          id: r.id,
          orderId: r.order_id,
          folio: r.number
            ? (r.source === "incident" ? "IAC-" : "HC-") +
              String(r.number).padStart(6, "0")
            : null,
          incidentId: r.source === "incident" ? r.id.slice(9) : null,
          brand: r.brand,
          company: r.company,
          unit: r.unit,
          nextDate: date(r.next_date),
          fleetUnitId: r.fleet_unit_id,
          base: r.base,
          source: r.source,
          overdue: date(r.next_date) < today,
        })),
      });
    }),
  );
}
module.exports = { register };
