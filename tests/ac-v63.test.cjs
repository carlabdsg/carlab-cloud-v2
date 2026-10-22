const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { setup } = require("./ac-qr-fixture.cjs");
const { harness } = require("./harness.cjs");
const inventory = require("../modules/hispacold/inventory");
const { period } = require("../modules/hispacold/reports");
test("Periodos semanales y mensuales, cruces de año y bisiestos", () => {
  assert.deepEqual(period("week", "2026-10-25", assert.fail), {
    from: "2026-10-19",
    to: "2026-10-25",
  });
  assert.deepEqual(period("week", "2027-01-01", assert.fail), {
    from: "2026-12-28",
    to: "2027-01-03",
  });
  assert.deepEqual(period("month", "2028-02-15", assert.fail), {
    from: "2028-02-01",
    to: "2028-02-29",
  });
  assert.throws(() => period("bad", "2026-10-22", assert.fail));
});
test("Migración del almacén: conserva referencias y saldos, solo una vez, sin tocar Stock", async () => {
  const h = await harness();
  try {
    await h.pool.query(require("../modules/hispacold/operations").schema);
    await h.db
      .exec(`CREATE TABLE ac_part_profiles(stock_part_id TEXT PRIMARY KEY REFERENCES stock_parts(id),brands JSONB NOT NULL,models TEXT NOT NULL DEFAULT '',image TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
   INSERT INTO stock_parts(id,nombre,sku,stock_actual) VALUES('old-ac','Compresor','AC-1',7),('other','Pieza general','GEN',99);
   INSERT INTO ac_part_profiles(stock_part_id,brands) VALUES('old-ac','["hispacold"]');
   INSERT INTO stock_movements(id,stock_part_id,tipo,cantidad) VALUES('old-ac-move','old-ac','entrada',10),('other-move','old-ac','salida_unidad',3);
   INSERT INTO ac_inventory_events(id,stock_part_id,stock_movement_id,client_key,actor,kind,quantity) VALUES('ev','old-ac','old-ac-move','legacy-key','admin','entrada',10);`);
    const legacyBefore = (
      await h.db.query("SELECT * FROM stock_parts ORDER BY id")
    ).rows;
    await inventory.init(h.pool);
    assert.deepEqual(
      (await h.db.query("SELECT * FROM stock_parts ORDER BY id")).rows,
      legacyBefore,
    );
    assert.equal(
      (await h.db.query("SELECT * FROM ac_stock_parts")).rows.length,
      1,
    );
    assert.equal(
      (
        await h.db.query(
          "SELECT stock_actual FROM ac_stock_parts WHERE id='old-ac'",
        )
      ).rows[0].stock_actual,
      "7.00",
    );
    assert.equal(
      (await h.db.query("SELECT * FROM ac_stock_movements")).rows.length,
      2,
    ); // imported AC event + balance marker
    assert.equal(
      (
        await h.db.query(
          "SELECT * FROM ac_stock_movements WHERE id='other-move'",
        )
      ).rows.length,
      0,
    );
    await h.db.query(
      "UPDATE ac_stock_parts SET stock_actual=6 WHERE id='old-ac'",
    );
    await h.db.query(
      "UPDATE stock_parts SET stock_actual=50 WHERE id='old-ac'",
    );
    await inventory.init(h.pool);
    assert.equal(
      (
        await h.db.query(
          "SELECT stock_actual FROM ac_stock_parts WHERE id='old-ac'",
        )
      ).rows[0].stock_actual,
      "6.00",
    );
    assert.equal(
      (await h.db.query("SELECT * FROM ac_stock_movements")).rows.length,
      2,
    );
    // Even deleting a legacy record cannot cascade into the independent catalog.
    await h.db.query(
      "DELETE FROM ac_part_profiles WHERE stock_part_id='old-ac'",
    );
    await h.db.query("DELETE FROM stock_parts WHERE id='old-ac'");
    assert.equal(
      (
        await h.db.query(
          "SELECT * FROM ac_stock_profiles WHERE stock_part_id='old-ac'",
        )
      ).rows.length,
      1,
    );
    const add = await fetch(h.url + "/api/ac/parts/old-ac/movements", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + h.token(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kind: "entrada",
        quantity: 2,
        notes: "Recepción posterior a migración",
        clientKey: crypto.randomUUID(),
      }),
    });
    assert.equal(add.status, 200);
    assert.equal((await add.json()).stock, 8);
    assert.equal(
      (await h.db.query("SELECT * FROM stock_parts WHERE id='old-ac'")).rows
        .length,
      0,
    );
  } finally {
    await h.close();
  }
});
test("Eliminar y restaurar unidades con historial, permisos, versiones y QR", async (t) => {
  const { h, call, ids, order } = await setup();
  try {
    const qr = (await call("/fleet/units/" + ids[0] + "/qr")).body;
    for (const user of ["hispa", "eber"])
      assert.equal(
        (
          await call("/fleet/units/" + ids[0], {
            method: "DELETE",
            user,
            body: { version: 1, reason: "Baja" },
          })
        ).status,
        403,
      );
    assert.equal(
      (
        await call("/fleet/units/" + ids[0], {
          method: "DELETE",
          body: { version: 1, reason: "" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/fleet/units/" + ids[0], {
          method: "DELETE",
          body: { version: 99, reason: "Baja" },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call("/fleet/units/" + ids[0], {
          method: "DELETE",
          body: { version: 1, reason: "Unidad vendida" },
        })
      ).status,
      200,
    );
    assert.equal(
      (await call("/fleet/units/" + ids[0], { user: "hispa" })).status,
      404,
    );
    assert.equal((await call("/fleet/qr/resolve/" + qr.token)).status, 404);
    assert.equal(
      (await call("/orders/" + order.id, { user: "hispa" })).status,
      200,
    );
    assert.equal(
      (await call("/fleet/units?archived=true")).body.items[0].id,
      ids[0],
    );
    assert.equal(
      (
        await call("/fleet/units/" + ids[0] + "/restore", {
          method: "POST",
          user: "hispa",
          body: { version: 2, reason: "Restaurar" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/fleet/units/" + ids[0] + "/restore", {
          method: "POST",
          body: { version: 2, reason: "Unidad reintegrada" },
        })
      ).status,
      200,
    );
    assert.equal(
      (await call("/fleet/qr/resolve/" + qr.token, { user: "hispa" })).status,
      200,
    );
    const detail = (await call("/fleet/units/" + ids[0])).body;
    assert.equal(detail.unit.version, 3);
    assert(
      detail.events.some((e) => e.action === "Unidad eliminada de la flota"),
    );
    assert(detail.events.some((e) => e.action === "Unidad restaurada"));
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM fleet_units")).rows[0].n,
      1,
    );
  } finally {
    await h.close();
  }
});
test("Reportes por periodo y empresa, pendientes acumulados, aislamiento entre marcas", async (t) => {
  const { h, call, ids, order } = await setup();
  try {
    async function newOrder(company, unit, brand, date, status = "borrador") {
      const r = await h.request("/services", {
        method: "POST",
        body: {
          data: {
            formVersion: 3,
            brand,
            type: "menor",
            attention: "normal",
            company,
            unit,
            serviceDate: date,
            status,
            symptoms: "Síntoma",
            technician: "Técnico",
            workDone: "Reparación",
            finalTest: "Prueba",
            result: "operativo",
          },
        },
      });
      assert.equal(r.status, 201, JSON.stringify(r));
      return r.body;
    }
    const old = await newOrder(
      "Transportes QR",
      "306",
      "hispacold",
      "2026-09-10",
    );
    await newOrder("Transportes QR", "307", "eberspaecher", "2026-10-22");
    await newOrder(
      "Otra empresa",
      "500",
      "hispacold",
      "2026-10-19",
      "completado",
    );
    await newOrder(
      "Otra empresa",
      "501",
      "hispacold",
      "2026-10-26",
      "completado",
    );
    const r = await call("/requests", {
      method: "POST",
      user: "hispa",
      body: {
        kind: "service",
        brand: "hispacold",
        company: "Transportes QR",
        unit: "306",
        description: "Revisar AC",
        priority: "normal",
        clientKey: crypto.randomUUID(),
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r));
    await h.db.query(
      "UPDATE ac_requests SET created_at='2026-10-19T06:30:00Z' WHERE id=$1",
      [r.body.id],
    ); // Sunday 23:30 in Mazatlan: outside this week
    const url = "/reports?period=week&anchor=2026-10-22";
    const all = await call(url);
    assert.equal(all.status, 200, JSON.stringify(all));
    assert.equal(all.body.summary.orders, 3);
    assert.equal(all.body.summary.completed, 2);
    assert.equal(all.body.summary.serviceRequests, 0);
    assert.equal(all.body.summary.pendingRequests, 1);
    assert.equal(all.body.pendingOrders.length, 2);
    assert(all.body.pendingOrders.some((o) => o.id === old.id));
    assert(!all.body.orders.some((o) => o.id === old.id));
    const hispa = await call(url + "&brand=eberspaecher", { user: "hispa" });
    assert.equal(hispa.status, 200);
    assert.equal(hispa.body.summary.orders, 2);
    assert(hispa.body.orders.every((o) => o.brand === "hispacold"));
    assert(hispa.body.units.every((o) => o.brand === "hispacold"));
    assert.deepEqual(hispa.body.lowStock, []);
    const company = await call(
      url +
        "&company=" +
        encodeURIComponent("Transportes QR") +
        "&brand=hispacold",
    );
    assert.equal(company.body.summary.orders, 1);
    assert.equal(company.body.summary.units, 1);
    const empty = await call(
      "/reports?period=month&anchor=2025-01-01&company=No%20existe",
    );
    assert.equal(empty.body.summary.orders, 0);
    assert.equal(empty.body.units.length, 0);
    assert.equal(
      (await call("/reports?period=month&anchor=2026-02-30")).status,
      400,
    );
    assert.equal(
      (await call("/reports?period=wrong&anchor=2026-10-22")).status,
      400,
    );
    assert.equal((await call(url, { user: null })).status, 401);
    assert.equal((await call(url, { user: "operator" })).status, 403);
    // Shared compatibility never leaks deliveries made for the other manufacturer.
    const part = await call("/parts", {
      method: "POST",
      body: { name: "Pieza compatible", brands: ["hispacold", "eberspaecher"] },
    });
    await call("/parts/" + part.body.id + "/movements", {
      method: "POST",
      body: {
        kind: "entrada",
        quantity: 5,
        notes: "Recepción",
        clientKey: crypto.randomUUID(),
      },
    });
    const supply = await call("/requests", {
      method: "POST",
      user: "eber",
      body: {
        kind: "part",
        brand: "eberspaecher",
        company: "Empresa Eber Privada",
        unit: "900",
        partId: part.body.id,
        quantity: 1,
        description: "Suministro",
        clientKey: crypto.randomUUID(),
      },
    });
    assert.equal(supply.status, 201, JSON.stringify(supply));
    await call("/requests/" + supply.body.id, {
      method: "PATCH",
      body: { version: 1, status: "aprobada" },
    });
    const delivery = await call("/requests/" + supply.body.id, {
      method: "PATCH",
      body: { version: 2, status: "entregada" },
    });
    assert.equal(delivery.status, 200, JSON.stringify(delivery));
    await h.db.query(
      "UPDATE ac_stock_movements SET created_at='2026-10-22T12:00:00Z'",
    );
    const hs = (await call(url, { user: "hispa" })).body;
    assert.equal(
      hs.movements.filter((m) => m.tipo === "salida_unidad").length,
      0,
    );
    assert(!JSON.stringify(hs).includes("Empresa Eber Privada"));
    assert.equal(hs.movements.length, 0);
    const eb = (await call(url, { user: "eber" })).body;
    assert.equal(
      eb.movements.filter((m) => m.tipo === "salida_unidad").length,
      1,
    );
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM stock_parts")).rows[0].n,
      0,
    );
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM stock_movements")).rows[0]
        .n,
      0,
    );
  } finally {
    await h.close();
  }
});
