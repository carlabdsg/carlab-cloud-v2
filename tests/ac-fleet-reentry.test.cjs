const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./ac-qr-fixture.cjs");

test("Registrar una unidad eliminada reincorpora el expediente original", async (t) => {
  const { h, call, ids, order } = await setup();
  const detail = async (id) => (await call("/fleet/units/" + id)).body;
  const record = async (id) =>
    (await h.db.query("SELECT * FROM ac_fleet_units WHERE id=$1", [id]))
      .rows[0];
  const remove = async (id) => {
    const u = (await detail(id)).unit;
    const r = await call("/fleet/units/" + id, {
      method: "DELETE",
      body: { version: u.version, reason: "Retiro temporal de flota" },
    });
    assert.equal(r.status, 200, JSON.stringify(r));
  };
  try {
    const originalFleet = (await h.db.query("SELECT * FROM fleet_units")).rows;
    const original = (await detail(ids[0])).unit;
    const companyId = original.companyId;
    const add = (body, user = "admin") =>
      call("/fleet/units", {
        method: "POST",
        user,
        body: { companyId, ...body },
      });
    const saved = await call("/fleet/units/" + ids[0], {
      method: "PATCH",
      body: {
        ...original,
        version: original.version,
        acSerial: "SERIE-306",
        plate: "AC-306",
        fleet: "Regional",
        base: "Mazatlán",
        mileage: "200000",
        reviewDays: 45,
        initialNextDate: "2026-12-15",
        manualCondition: "con_observaciones",
        checkedOn: "2026-10-01",
        conditionNote: "Seguimiento técnico pendiente",
      },
    });
    assert.equal(saved.status, 200);
    const before = await record(ids[0]);
    const qr = (await call("/fleet/units/" + ids[0] + "/qr")).body;
    await remove(ids[0]);

    await t.test(
      "Supervisor no puede reincorporar; marca incorrecta no altera el expediente",
      async () => {
        for (const user of ["hispa", "eber"]) {
          assert.equal(
            (await add({ unit: "306", brand: "hispacold" }, user)).status,
            403,
          );
        }
        const mismatch = await add({ unit: "306", brand: "eberspaecher" });
        assert.equal(mismatch.status, 409);
        assert.match(mismatch.body.error, /Hispacold/);
        assert.equal((await record(ids[0])).active, false);
        assert.equal((await call("/fleet/qr/resolve/" + qr.token)).status, 404);
      },
    );

    await t.test(
      "Alta normal con espacios recupera ID, QR, órdenes, ficha y planificación",
      async () => {
        const r = await add({
          unit: " 306 ",
          brand: "hispacold",
          acSerial: "",
          model: "",
          reviewDays: 90,
          manualCondition: "sin_evaluar",
        });
        assert.equal(r.status, 201, JSON.stringify(r));
        assert.deepEqual(r.body, {
          ids: [ids[0]],
          count: 1,
          createdCount: 0,
          restoredCount: 1,
        });
        const after = await record(ids[0]);
        for (const key of Object.keys(before).filter(
          (k) => !["active", "version", "updated_at"].includes(k),
        )) {
          assert.deepEqual(after[key], before[key], "Se conserva " + key);
        }
        assert.equal(after.active, true);
        assert.equal(after.version, before.version + 2);
        assert.deepEqual(
          (await call("/fleet/units/" + ids[0] + "/qr")).body,
          qr,
        );
        assert.equal(
          (await call("/fleet/qr/resolve/" + qr.token, { user: "hispa" }))
            .status,
          200,
        );
        assert.equal(
          (await call("/fleet/units/" + ids[0], { user: "eber" })).status,
          404,
        );
        const d = await detail(ids[0]);
        assert(d.orders.some((o) => o.id === order.id));
        assert(
          d.events.some((e) => e.action === "Unidad eliminada de la flota"),
        );
        assert(
          d.events.some((e) => e.action === "Unidad reincorporada a la flota"),
        );
        assert(
          (await call("/fleet/units")).body.items.some((u) => u.id === ids[0]),
        );
        assert(
          !(await call("/fleet/units?archived=true")).body.items.some(
            (u) => u.id === ids[0],
          ),
        );
        const duplicate = await add({ unit: "306", brand: "hispacold" });
        assert.equal(duplicate.status, 409);
        assert.match(duplicate.body.error, /ya está activa/);
        assert.equal((await record(ids[0])).version, after.version);
        assert.equal(
          (
            await call("/fleet/units/" + ids[0], {
              method: "DELETE",
              body: { version: before.version, reason: "Pantalla anterior" },
            })
          ).status,
          409,
        );
      },
    );

    await t.test(
      "Eberspächer y otra empresa mantienen sus identidades y permisos",
      async () => {
        await remove(ids[1]);
        const r = await add({ unit: "307", brand: "eberspaecher" });
        assert.equal(r.status, 201);
        assert.deepEqual(r.body.ids, [ids[1]]);
        assert.equal(r.body.restoredCount, 1);
        assert.equal(
          (await call("/fleet/units/" + ids[1], { user: "eber" })).status,
          200,
        );
        assert.equal(
          (await call("/fleet/units/" + ids[1], { user: "hispa" })).status,
          404,
        );
        const company = (
          await call("/fleet/companies", {
            method: "POST",
            body: { name: "Otra empresa" },
          })
        ).body;
        const separate = await add({
          companyId: company.id,
          unit: "306",
          brand: "hispacold",
        });
        assert.equal(separate.status, 201);
        assert.equal(separate.body.createdCount, 1);
        assert.notEqual(separate.body.ids[0], ids[0]);
      },
    );

    await t.test(
      "Lotes mixtos son atómicos y respetan la normalización",
      async () => {
        const created = await add({
          unit: "AC-50",
          brand: "hispacold",
          acSerial: "SERIE-50",
        });
        assert.equal(created.status, 201);
        const id = created.body.ids[0];
        await remove(id);
        const archived = await record(id);
        const eventCount = async () =>
          (
            await h.db.query(
              "SELECT COUNT(*)::int n FROM ac_fleet_events WHERE unit_id=$1",
              [id],
            )
          ).rows[0].n;
        const count = await eventCount();
        const rows = [
          { unit: " ac-50 ", brand: "hispacold" },
          { unit: "NEW-51", brand: "hispacold" },
        ];
        for (const last of [
          { unit: "306", brand: "hispacold" },
          { unit: "AC-50", brand: "hispacold" },
        ]) {
          const failed = await add({ units: [...rows, last] });
          assert.equal(failed.status, 409);
          assert.deepEqual(await record(id), archived);
          assert.equal(await eventCount(), count);
          assert.equal(
            (
              await h.db.query(
                "SELECT id FROM ac_fleet_units WHERE unit='NEW-51'",
              )
            ).rows.length,
            0,
          );
        }
        const good = await add({ units: rows });
        assert.equal(good.status, 201, JSON.stringify(good));
        assert.equal(good.body.count, 2);
        assert.equal(good.body.createdCount, 1);
        assert.equal(good.body.restoredCount, 1);
        assert.equal(good.body.ids[0], id);
        assert.equal((await record(id)).unit, "AC-50");
        assert.equal((await record(id)).ac_serial, "SERIE-50");
        assert.equal((await record(id)).version, archived.version + 1);
        assert.equal(await eventCount(), count + 1);
        await remove(id);
        const again = await add({ unit: "ac-50", brand: "hispacold" });
        assert.equal(again.status, 201);
        assert.deepEqual(again.body.ids, [id]);
      },
    );
    assert.deepEqual(
      (await h.db.query("SELECT * FROM fleet_units")).rows,
      originalFleet,
    );
  } finally {
    await h.close();
  }
});
