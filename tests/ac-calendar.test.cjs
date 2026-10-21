const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
test("Calendario AC: fechas vigentes, flotas iniciales, permisos, meses y paginación", async (t) => {
  const h = await harness();
  const call = async (path, { method = "GET", body, user = "admin" } = {}) => {
    const r = await fetch(h.url + "/api/ac" + path, {
      method,
      headers: {
        Authorization:
          "Bearer " +
          h.token(user, user === "admin" ? "admin" : "supervisor_ac"),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: await r.json() };
  };
  const cal = async (params = "", user = "admin") =>
    call("/calendar?today=2026-10-21&month=2026-10" + params, { user });
  const order = async (unit, more = {}) => {
    const r = await h.request("/services", {
      method: "POST",
      body: {
        data: {
          formVersion: 3,
          brand: "hispacold",
          type: "menor",
          attention: "normal",
          status: "completado",
          company: "Empresa Calendario",
          unit,
          serviceDate: "2026-10-01",
          nextDate: "2026-10-24",
          technician: "Técnico",
          symptoms: "Servicio programado",
          workDone: "Mantenimiento de control.",
          finalTest: "Funcionamiento comprobado.",
          result: "operativo",
          ...more,
        },
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r));
    return r.body;
  };
  let company, initial, source;
  try {
    await h.db.query(
      "INSERT INTO users(id,nombre,role,activo,empresa) VALUES('hispa','Supervisor Hispacold','supervisor_ac',true,'Hispacold'),('eber','Supervisor Eberspächer','supervisor_ac',true,'Eberspächer')",
    );
    await t.test(
      "Fechas iniciales de Flotas y de órdenes se reúnen con el aislamiento de marca",
      async () => {
        company = (
          await call("/fleet/companies", {
            method: "POST",
            body: { name: "Empresa Calendario" },
          })
        ).body.id;
        initial = (
          await call("/fleet/units", {
            method: "POST",
            body: {
              companyId: company,
              brand: "hispacold",
              unit: "001",
              initialNextDate: "2026-10-22",
            },
          })
        ).body.ids[0];
        await call("/fleet/units", {
          method: "POST",
          body: {
            companyId: company,
            brand: "eberspaecher",
            unit: "002",
            initialNextDate: "2026-10-22",
          },
        });
        source = await order("003");
        await order("004", {
          brand: "eberspaecher",
          company: "Empresa privada Eber",
          nextDate: "2026-10-23",
        });
        const r = await cal("&brand=eberspaecher", "hispa");
        assert.equal(r.status, 200, JSON.stringify(r));
        assert.equal(r.body.total, 2);
        assert.equal(r.body.summary.month, 2);
        assert(r.body.items.every((x) => x.brand === "hispacold"));
        assert.deepEqual(r.body.companies, ["Empresa Calendario"]);
        assert.equal(
          r.body.items.find((x) => x.unit === "001").source,
          "fleet",
        );
        assert.equal(
          r.body.items.find((x) => x.unit === "001").fleetUnitId,
          initial,
        );
        assert.equal(
          r.body.items.find((x) => x.unit === "003").orderId,
          source.id,
        );
        assert.deepEqual(
          r.body.days.map((x) => [x.date, x.total]),
          [
            ["2026-10-22", 1],
            ["2026-10-24", 1],
          ],
        );
        assert.equal(
          (await cal("&company=Empresa%20privada%20Eber", "hispa")).body.total,
          0,
        );
        assert.equal((await cal("&brand=eberspaecher")).body.total, 2);
      },
    );
    await t.test(
      "La programación nueva reemplaza el plan inicial y la orden anterior",
      async () => {
        await order("001", { nextDate: "2026-11-05" });
        let r = (await cal("", "hispa")).body;
        assert.equal(
          r.items.some((x) => x.unit === "001"),
          false,
        );
        r = (
          await call("/calendar?today=2026-10-21&month=2026-11", {
            user: "hispa",
          })
        ).body;
        assert.equal(r.total, 1);
        assert.equal(r.items[0].source, "order");
        assert.equal(r.items[0].nextDate, "2026-11-05");
        assert.equal(r.items[0].fleetUnitId, initial);
        await order("003", {
          serviceDate: "2026-10-15",
          nextDate: "2026-10-28",
        });
        r = (await cal("", "hispa")).body;
        assert.equal(r.total, 1);
        assert.equal(r.items[0].nextDate, "2026-10-28");
        assert.equal(
          r.days.some((x) => x.date === "2026-10-24"),
          false,
        );
      },
    );
    await t.test(
      "Vencidos y siete días incluyen el límite correcto; selección de día y mes",
      async () => {
        await order("VENCIDA", { nextDate: "2026-10-20" });
        await order("HOY", { nextDate: "2026-10-21" });
        await order("SEIS", { nextDate: "2026-10-27" });
        await order("SIETE", { nextDate: "2026-10-28" });
        const overdue = (await cal("&bucket=overdue", "hispa")).body;
        assert.equal(overdue.total, 1);
        assert.equal(overdue.items[0].unit, "VENCIDA");
        const week = (await cal("&bucket=week", "hispa")).body;
        assert.equal(week.total, 2);
        assert.deepEqual(
          week.items.map((x) => x.unit),
          ["HOY", "SEIS"],
        );
        const selected = (await cal("&day=2026-10-28", "hispa")).body;
        assert.equal(selected.total, 2);
        assert(selected.items.every((x) => x.nextDate === "2026-10-28"));
        const future = (
          await call("/calendar?today=2026-10-21&month=2027-01", {
            user: "hispa",
          })
        ).body;
        assert.equal(future.total, 0);
        assert.equal(future.summary.overdue, 1);
        const leap = await call("/calendar?today=2028-02-10&month=2028-02");
        assert.equal(leap.status, 200);
        assert.equal(leap.body.to, "2028-02-29");
      },
    );
    await t.test(
      "No hay límite oculto de cien servicios y la agenda pagina sin perder conteos",
      async () => {
        const rows = Array.from({ length: 100 }, (_, i) => ({
          unit: "L-" + String(i).padStart(3, "0"),
          brand: "hispacold",
          initialNextDate: "2026-10-26",
        }));
        assert.equal(
          (
            await call("/fleet/units", {
              method: "POST",
              body: { companyId: company, units: rows },
            })
          ).status,
          201,
        );
        assert.equal(
          (
            await call("/fleet/units", {
              method: "POST",
              body: {
                companyId: company,
                unit: "L-100",
                brand: "hispacold",
                initialNextDate: "2026-10-26",
              },
            })
          ).status,
          201,
        );
        const first = (await cal("&day=2026-10-26", "hispa")).body;
        assert.equal(first.total, 101);
        assert.equal(first.items.length, 20);
        assert.equal(
          first.days.find((d) => d.date === "2026-10-26").total,
          101,
        );
        const last = (await cal("&day=2026-10-26&offset=100", "hispa")).body;
        assert.equal(last.items.length, 1);
        assert.equal(last.items[0].unit, "L-100");
        const search = (await cal("&q=L-100", "hispa")).body;
        assert.equal(search.total, 1);
        assert.equal(search.summary.month, 1);
      },
    );
    await t.test(
      "Unidades archivadas, órdenes borradas y canceladas no se presentan como fechas vigentes",
      async () => {
        const before = (await cal("", "hispa")).body.total;
        const record = (await call("/fleet/units/" + initial)).body.unit;
        assert.equal(
          (
            await call("/fleet/units/" + initial, {
              method: "PATCH",
              body: { ...record, active: false },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call("/calendar?today=2026-10-21&month=2026-11", {
              user: "hispa",
            })
          ).body.total,
          0,
        );
        const row = await order("ELIMINADA");
        await h.db.query(
          "UPDATE hc_services SET deleted_at=NOW() WHERE id=$1",
          [row.id],
        );
        const canceled = await order("CANCELADA");
        await h.db.query(
          "UPDATE hc_services SET status='cancelado' WHERE id=$1",
          [canceled.id],
        );
        const r = (await cal("", "hispa")).body;
        assert.equal(r.total, before);
        assert(!JSON.stringify(r).includes("ELIMINADA"));
        assert(!JSON.stringify(r).includes("CANCELADA"));
      },
    );
    await t.test(
      "Fechas y filtros inválidos se rechazan y un cambio de marca se aplica al instante",
      async () => {
        for (const p of [
          "&day=2026-11-01",
          "&day=2026-02-30",
          "&offset=-1",
          "&bucket=invalid",
        ])
          assert.equal((await cal(p)).status, 400, p);
        assert.equal(
          (await call("/calendar?today=2026-10-21&month=2026-13")).status,
          400,
        );
        assert.equal((await call("/calendar?month=2026-10")).status, 400);
        await h.db.query(
          "UPDATE users SET empresa='Eberspächer' WHERE id='hispa'",
        );
        const r = (await cal("", "hispa")).body;
        assert.equal(r.total, 2);
        assert(r.items.every((i) => i.brand === "eberspaecher"));
        await h.db.query("UPDATE users SET activo=FALSE WHERE id='hispa'");
        assert.equal((await cal("", "hispa")).status, 403);
      },
    );
  } finally {
    await h.close();
  }
});
