const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { harness } = require("./harness.cjs");
const { unitRow } = require("../modules/hispacold/fleet");
const TODAY = "2026-10-21";
test("Flotas AC: empresas mixtas, supervisión por marca, semáforo y captura administrativa", async (t) => {
  const h = await harness();
  const call = async (
    path,
    { method = "GET", body, user = "admin", role, raw = false } = {},
  ) => {
    const r = await fetch(
      h.url +
        "/api/ac" +
        path +
        (path.includes("?") ? "&" : "?") +
        "today=" +
        TODAY,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Bearer " +
            h.token(
              user,
              role || (user === "admin" ? "admin" : "supervisor_ac"),
            ),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: r.status, body: raw ? await r.text() : await r.json() };
  };
  const unitData = (unit, extra = {}) => ({
    unit,
    brand: "hispacold",
    base: "Mazatlán",
    busBrand: "Volvo",
    model: "9800",
    acModel: "Breeze",
    ...extra,
  });
  const create = async (company, unit, extra = {}) => {
    const r = await call("/fleet/units", {
      method: "POST",
      body: { companyId: company, ...unitData(unit, extra) },
    });
    assert.equal(r.status, 201, JSON.stringify(r));
    return r.body.ids[0];
  };
  const get = async (id, user = "admin") => {
    const r = await call("/fleet/units/" + id, { user });
    assert.equal(r.status, 200, JSON.stringify(r));
    return r.body;
  };
  const update = async (id, extra = {}) => {
    const u = (await get(id)).unit;
    return call("/fleet/units/" + id, {
      method: "PATCH",
      body: { ...u, ...extra },
    });
  };
  const order = async (
    company,
    unit,
    brand,
    status = "borrador",
    extra = {},
  ) => {
    const r = await h.request("/services", {
      method: "POST",
      body: {
        data: {
          formVersion: 3,
          company,
          unit,
          brand,
          type: "menor",
          status,
          serviceDate: TODAY,
          attention: "normal",
          symptoms: "Control intermitente",
          technician: "Técnico",
          workDone: "Revisión y ajuste del control",
          finalTest: "Funcionamiento verificado",
          result: "operativo",
          ...extra,
        },
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r));
    return r.body;
  };
  const request = async (company, unit, extra = {}, user = "hispa") =>
    call("/requests", {
      method: "POST",
      user,
      body: {
        clientKey: crypto.randomUUID(),
        company,
        unit,
        brand: "hispacold",
        kind: "service",
        description: "Solicito revisión del equipo.",
        priority: "normal",
        ...extra,
      },
    });
  let company, other, hispa, eber, green, critical, service;
  const initialLegacy = (await h.db.query("SELECT * FROM fleet_units")).rows;
  try {
    await t.test(
      "Empresas y unidades registradas solo por admin, aislamiento dentro de la misma empresa",
      async () => {
        await h.db.query(
          "INSERT INTO users(id,nombre,role,activo,empresa) VALUES('hispa','Hispacold','supervisor_ac',true,'Hispacold'),('eber','Eberspächer','supervisor_ac',true,'Eberspächer')",
        );
        const c = await call("/fleet/companies", {
          method: "POST",
          body: { name: "Empresa Mixta", region: "Pacífico", city: "Mazatlán" },
        });
        assert.equal(c.status, 201);
        company = c.body.id;
        other = (
          await call("/fleet/companies", {
            method: "POST",
            body: { name: "Solo Eberspächer", region: "Región privada" },
          })
        ).body.id;
        hispa = await create(company, "001");
        eber = await create(company, "002", {
          brand: "eberspaecher",
          base: "Base privada",
        });
        await create(other, "999", { brand: "eberspaecher" });
        green = await create(company, "003", {
          manualCondition: "operativo",
          checkedOn: TODAY,
          conditionNote: "Prueba funcional del equipo satisfactoria.",
        });
        critical = await create(company, "004", {
          manualCondition: "no_operativo",
          checkedOn: TODAY,
          conditionNote: "Falla confirmada de compresor.",
        });
        const hlist = await call("/fleet/units?brand=eberspaecher", {
          user: "hispa",
        });
        assert.equal(hlist.status, 200, JSON.stringify(hlist));
        assert.equal(hlist.body.total, 3);
        assert(hlist.body.items.every((u) => u.brand === "hispacold"));
        assert.equal(hlist.body.summary.green, 1);
        assert.equal(hlist.body.summary.gray, 1);
        assert.equal(hlist.body.summary.red, 1);
        assert.equal(
          (await call("/fleet/units/" + eber, { user: "hispa" })).status,
          404,
        );
        assert.equal(
          (await call("/fleet/units?company=" + other, { user: "hispa" })).body
            .total,
          0,
        );
        const opts = (await call("/fleet/options", { user: "hispa" })).body;
        assert.deepEqual(
          opts.companies.map((c) => c.id),
          [company],
        );
        assert(!opts.regions.includes("Región privada"));
        assert(!opts.bases.includes("Base privada"));
        for (const path of ["/fleet/companies", "/fleet/units"])
          assert.equal(
            (await call(path, { method: "POST", user: "hispa", body: {} }))
              .status,
            403,
          );
        assert.equal(
          (
            await call("/fleet/units/" + hispa, {
              method: "PATCH",
              body: {},
              user: "hispa",
            })
          ).status,
          403,
        );
        assert.equal(
          (await call("/fleet/import-candidates", { user: "hispa" })).status,
          403,
        );
        assert.equal(
          (await call("/fleet/units", { user: "operator", role: "operador" }))
            .status,
          403,
        );
      },
    );
    await t.test(
      "Alta por lote atómica, normalización y prevención de duplicados",
      async () => {
        const bad = await call("/fleet/units", {
          method: "POST",
          body: {
            companyId: company,
            units: [unitData("005"), unitData(" 001 ")],
          },
        });
        assert.equal(bad.status, 409);
        assert.equal(
          (
            await h.db.query(
              "SELECT count(*)::int n FROM ac_fleet_units WHERE unit='005'",
            )
          ).rows[0].n,
          0,
        );
        const ok = await call("/fleet/units", {
          method: "POST",
          body: {
            companyId: company,
            units: [unitData("005"), unitData("006")],
          },
        });
        assert.equal(ok.status, 201);
        assert.equal(ok.body.count, 2);
        assert.equal(
          (
            await call("/fleet/companies", {
              method: "POST",
              body: { name: " empresa mixta " },
            })
          ).status,
          409,
        );
        const empty = await call("/fleet/units", {
          method: "POST",
          body: { companyId: company, units: [] },
        });
        assert.equal(empty.status, 400);
        const huge = await call("/fleet/units", {
          method: "POST",
          body: { companyId: company, units: Array(101).fill(unitData("100")) },
        });
        assert.equal(huge.status, 400);
        assert.equal(
          (
            await call("/fleet/units", {
              method: "POST",
              body: {
                companyId: company,
                ...unitData("bad", { manualCondition: "operativo" }),
              },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call("/fleet/units", {
              method: "POST",
              body: {
                companyId: company,
                ...unitData("bad", {
                  manualCondition: "operativo",
                  checkedOn: "2030-01-01",
                  conditionNote: "Futura",
                }),
              },
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "Estados con explicación, solicitud urgente y conversión a orden actualizan el tablero",
      async () => {
        const rq = await request("Empresa Mixta", "003", {
          priority: "urgente",
          fleetUnitId: green,
        });
        assert.equal(rq.status, 201, JSON.stringify(rq));
        let d = (await get(green, "hispa")).unit;
        assert.equal(d.signal, "red");
        assert.equal(d.serviceRequests, 1);
        assert.equal(d.openOrders, 0);
        assert(d.reasons.some((r) => r.text.includes("urgente")));
        const conv = await call("/requests/" + rq.body.id + "/create-order", {
          method: "POST",
          body: {
            version: rq.body.version,
            type: "menor",
            attention: "normal",
            serviceDate: TODAY,
          },
        });
        assert.equal(conv.status, 201, JSON.stringify(conv));
        d = (await get(green)).unit;
        assert.equal(d.signal, "amber");
        assert.equal(d.serviceRequests, 0);
        assert.equal(d.openOrders, 1);
        service = conv.body;
      },
    );
    await t.test(
      "El cierre de la orden restaura estado operativo sin duplicar registros de flota",
      async () => {
        const d = (await h.request("/services/" + service.id)).body;
        const updated = await h.request("/services/" + service.id, {
          method: "PUT",
          body: {
            version: d.version,
            data: {
              ...d.data,
              status: "completado",
              technician: "Técnico",
              workDone: "Control reparado.",
              finalTest: "Operación verificada.",
              result: "operativo",
            },
          },
        });
        assert.equal(updated.status, 200, JSON.stringify(updated));
        const r = await get(green, "hispa");
        assert.equal(r.unit.signal, "green");
        assert.equal(r.unit.openOrders, 0);
        assert.equal(r.orders.length, 1);
        assert.equal(r.requests[0].status, "atendida");
      },
    );
    await t.test(
      "Mantenimiento vencido, próximo y recurrencias se reflejan sin importar costos",
      async () => {
        const old = await order(
          "Empresa Mixta",
          "001",
          "hispacold",
          "completado",
          {
            serviceDate: "2026-10-01",
            nextDate: "2026-10-15",
            parts: [
              {
                kind: "refaccion",
                description: "Relevador",
                quantity: 1,
                unitPrice: 99999,
              },
            ],
          },
        );
        let r = await get(hispa, "hispa");
        assert.equal(r.unit.dueIn, -6);
        assert.equal(r.unit.signal, "amber");
        assert(r.unit.reasons.some((x) => x.text.includes("vencido")));
        assert(!JSON.stringify(r).includes("99999"));
        assert(!JSON.stringify(r).includes("unitPrice"));
        await order("Empresa Mixta", "001", "hispacold", "completado", {
          nextDate: "2026-11-15",
        });
        r = await get(hispa);
        assert.equal(r.unit.nextDate, "2026-11-15");
        assert.equal(r.unit.repeatRepairs, 2);
        assert(r.unit.reasons.some((x) => x.text.includes("recurrentes")));
        const filtered = (
          await call("/fleet/units?focus=recurring", { user: "hispa" })
        ).body;
        assert.equal(filtered.total, 1);
        assert.equal(filtered.items[0].id, hispa);
        // Same economic number on another brand must not affect state or history.
        await order("Empresa Mixta", "001", "eberspaecher", "espera_refaccion");
        assert.equal((await get(hispa)).unit.openOrders, 0);
      },
    );
    await t.test(
      "Versiones protegen cambios simultáneos y la identidad no se puede reasignar",
      async () => {
        const u = (await get(hispa)).unit;
        assert.equal((await update(hispa, { base: "Culiacán" })).status, 200);
        assert.equal(
          (
            await call("/fleet/units/" + hispa, {
              method: "PATCH",
              body: { ...u, base: "Otra" },
            })
          ).status,
          409,
        );
        assert.equal(
          (await update(hispa, { brand: "eberspaecher" })).status,
          400,
        );
        const c = (await call("/fleet/companies")).body.find(
          (c) => c.id === company,
        );
        assert.equal(
          (
            await call("/fleet/companies/" + company, {
              method: "PATCH",
              body: { ...c, name: "Renombrada" },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call("/fleet/companies/" + company, {
              method: "PATCH",
              body: { ...c, city: "Culiacán" },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call("/fleet/companies/" + company, {
              method: "PATCH",
              body: { ...c, city: "Mazatlán" },
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "Solicitudes de refacción y vínculo de unidad validan marca y empresa",
      async () => {
        assert.equal(
          (await request("Empresa Mixta", "002", { fleetUnitId: eber })).status,
          404,
        );
        assert.equal(
          (await request("Otra empresa", "001", { fleetUnitId: hispa })).status,
          404,
        );
        const r = await request("Empresa Mixta", "003", {
          kind: "part",
          partName: "Motor evaporador",
          quantity: 2,
          fleetUnitId: green,
        });
        assert.equal(r.status, 201, JSON.stringify(r));
        const d = await get(green);
        assert.equal(d.unit.signal, "amber");
        assert.equal(d.unit.partRequests, 1);
        assert(d.requests.some((r) => r.kind === "part" && r.quantity === "2"));
      },
    );
    await t.test(
      "Archivo y reactivación conservan el historial y ocultan la unidad al supervisor",
      async () => {
        assert.equal((await update(hispa, { active: false })).status, 200);
        assert.equal(
          (await call("/fleet/units/" + hispa, { user: "hispa" })).status,
          404,
        );
        assert.equal(
          (
            await call("/fleet/units?archived=true", { user: "hispa" })
          ).body.items.some((u) => u.id === hispa),
          false,
        );
        const archived = (await call("/fleet/units?archived=true")).body;
        assert.equal(archived.total, 1);
        assert.equal(archived.items[0].id, hispa);
        assert.equal(
          (await request("Empresa Mixta", "001", { fleetUnitId: hispa }))
            .status,
          404,
        );
        assert.equal((await update(hispa, { active: true })).status, 200);
        assert.equal((await get(hispa, "hispa")).orders.length, 2);
      },
    );
    await t.test(
      "Exportación CSV respeta marca, filtros y neutraliza fórmulas",
      async () => {
        await create(company, "=SUM(1+1)");
        const csv = await call("/fleet/export", { user: "hispa", raw: true });
        assert.equal(csv.status, 200);
        assert(csv.body.includes("'=SUM(1+1)"));
        assert(!csv.body.includes("Solo Eberspächer"));
        assert(!csv.body.includes("Base privada"));
        assert(!csv.body.includes("eberspaecher"));
        assert(!csv.body.includes("99999"));
        const filtered = await call("/fleet/export?signal=red", {
          user: "hispa",
          raw: true,
        });
        assert(filtered.body.includes("004"));
        assert(!filtered.body.includes("003"));
      },
    );
    await t.test(
      "Campanita de evaluaciones críticas aislada por marca y lectura individual",
      async () => {
        let n = (
          await call("/notifications", { user: "hispa" })
        ).body.items.find((n) => n.targetId === critical);
        assert(n);
        assert.equal(n.targetType, "fleet");
        assert.equal(
          (await call("/notifications", { user: "eber" })).body.items.some(
            (n) => n.targetId === critical,
          ),
          false,
        );
        assert.equal(
          (
            await call("/notifications/read", {
              method: "POST",
              user: "hispa",
              body: { ids: [n.id] },
            })
          ).status,
          200,
        );
        assert.equal(
          (await call("/notifications", { user: "hispa" })).body.items.find(
            (n) => n.id === n.id && n.targetId === critical,
          ).read,
          true,
        );
        assert.equal(
          (await call("/notifications")).body.items.find(
            (n) => n.targetId === critical,
          ).read,
          false,
        );
        await update(critical, {
          manualCondition: "operativo",
          checkedOn: TODAY,
          conditionNote: "Compresor reparado y prueba satisfactoria.",
        });
        assert.equal(
          (await call("/notifications", { user: "hispa" })).body.items.some(
            (n) => n.targetId === critical,
          ),
          false,
        );
      },
    );
    await t.test(
      "Datos copiados de Flotas no alteran registros originales ni otros módulos",
      async () => {
        const r = await call("/fleet/import-candidates?q=402");
        assert.equal(r.status, 200);
        assert.equal(r.body.items[0].unit, "402");
        assert.equal(r.body.items[0].busBrand, "Irizar");
        assert.deepEqual(
          (await h.db.query("SELECT * FROM fleet_units")).rows,
          initialLegacy,
        );
        assert.equal(
          (
            await h.db.query(
              "SELECT data FROM legacy_sentinel WHERE id='unchanged'",
            )
          ).rows[0].data,
          "reportes-agenda-stock-cobranza",
        );
        const chooser = (await call("/units", { user: "hispa" })).body;
        assert(chooser.some((u) => u.unit === "003"));
        assert(!chooser.some((u) => u.unit === "002"));
      },
    );
    await t.test(
      "Cambiar la marca del usuario revoca de inmediato todos los datos previos de Flotas",
      async () => {
        await h.db.query(
          "UPDATE users SET empresa='Eberspächer' WHERE id='hispa'",
        );
        assert.equal(
          (await call("/fleet/units/" + green, { user: "hispa" })).status,
          404,
        );
        const r = (await call("/fleet/units", { user: "hispa" })).body;
        assert(r.items.every((u) => u.brand === "eberspaecher"));
        assert.equal(r.total, 2);
        await h.db.query("UPDATE users SET activo=false WHERE id='hispa'");
        assert.equal(
          (await call("/fleet/units", { user: "hispa" })).status,
          403,
        );
      },
    );
  } finally {
    await h.close();
  }
});
test("Semáforo: vigencia, precedencia de fuentes y tipos DATE de PostgreSQL", () => {
  const base = {
    id: "x",
    unit: "1",
    review_days: 90,
    condition: "sin_evaluar",
    open_orders: 0,
    waiting_parts: 0,
    repeat_repairs: 0,
    service_requests: 0,
    part_requests: 0,
    urgent_requests: 0,
  };
  assert.equal(unitRow(base, TODAY).signal, "gray");
  assert.equal(
    unitRow(
      {
        ...base,
        condition: "operativo",
        checked_on: new Date("2026-10-20"),
        verified_at: new Date(),
      },
      TODAY,
    ).signal,
    "green",
  );
  assert.equal(
    unitRow(
      { ...base, condition: "operativo", checked_on: "2026-01-01" },
      TODAY,
    ).signal,
    "gray",
  );
  assert.equal(
    unitRow(
      { ...base, condition: "no_operativo", checked_on: "2026-01-01" },
      TODAY,
    ).signal,
    "red",
  );
  assert.equal(
    unitRow(
      {
        ...base,
        condition: "no_operativo",
        checked_on: "2026-10-01",
        last_service: "2026-10-20",
        last_result: "operativo",
      },
      TODAY,
    ).signal,
    "green",
  );
  assert.equal(
    unitRow(
      {
        ...base,
        condition: "operativo",
        checked_on: "2026-10-01",
        last_service: "2026-10-20",
        last_result: "no_operativo",
      },
      TODAY,
    ).signal,
    "red",
  );
  const r = unitRow(
    {
      ...base,
      last_service: new Date("2026-10-20"),
      last_result: "operativo",
      maintenance_date: new Date("2026-10-20"),
      service_next_date: new Date("2026-10-25"),
    },
    TODAY,
  );
  assert.equal(r.dueIn, 4);
  assert.equal(r.signal, "amber");
  const reset = unitRow(
    {
      ...base,
      condition: "operativo",
      checked_on: "2026-10-20",
      next_date: "2026-01-01",
      maintenance_date: "2026-10-20",
      service_next_date: null,
      last_service: "2026-10-20",
      last_result: "operativo",
    },
    TODAY,
  );
  assert.equal(reset.nextDate, null);
  assert.equal(reset.signal, "green");
});
