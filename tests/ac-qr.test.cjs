const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./ac-qr-fixture.cjs");
test("QR AC: autorización, permanencia, reemplazo, archivo y reportes", async (t) => {
  const { h, call, ids, order } = await setup();
  t.after(() => h.close());
  let qr;
  await t.test(
    "código automático, estable y sin datos personales",
    async () => {
      const rows = await h.db.query("SELECT * FROM ac_fleet_qr");
      assert.equal(rows.rows.length, 2);
      assert.notEqual(rows.rows[0].token, rows.rows[1].token);
      const r = await call("/fleet/units/" + ids[0] + "/qr");
      assert.equal(r.status, 200);
      qr = r.body;
      assert.match(qr.token, /^[a-f0-9]{48}$/);
      assert.equal(r.headers.get("cache-control"), "no-store");
      assert.equal(
        (await call("/fleet/units/" + ids[0] + "/qr")).body.token,
        qr.token,
      );
      assert.equal(
        (await call("/fleet/units/" + ids[0] + "/qr", { user: "hispa" }))
          .status,
        403,
      );
    },
  );
  await t.test(
    "el QR no sustituye la sesión ni permite consultar otra marca",
    async () => {
      const path = "/fleet/qr/resolve/" + qr.token;
      assert.equal((await call(path, { user: null })).status, 401);
      assert.equal((await call(path, { user: "eber" })).status, 404);
      assert.equal((await call(path, { user: "hispa" })).body.unitId, ids[0]);
      assert.equal(
        (await call("/fleet/qr/resolve/" + "a".repeat(48))).status,
        404,
      );
    },
  );
  await t.test(
    "el reporte coincide con empresa, unidad y marca; no crea unidades",
    async () => {
      assert.equal(
        (await call("/fleet/order-qr/" + order.id)).body.token,
        qr.token,
      );
      assert.equal(
        (await call("/fleet/order-qr/" + order.id, { user: "eber" })).status,
        404,
      );
      const other = await h.request("/services", {
        method: "POST",
        body: {
          data: {
            ...order.data,
            company: "Otra empresa",
            unit: "306",
            status: "borrador",
          },
        },
      });
      assert.equal((await call("/fleet/order-qr/" + other.body.id)).body, null);
    },
  );
  await t.test(
    "reemplazo admin con motivo, control de concurrencia y auditoría",
    async () => {
      const path = "/fleet/units/" + ids[0] + "/qr/replace";
      assert.equal(
        (
          await call(path, {
            user: "hispa",
            method: "POST",
            body: { generation: 1, reason: "Perdido" },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await call(path, {
            method: "POST",
            body: { generation: 1, reason: "" },
          })
        ).status,
        400,
      );
      const r = await call(path, {
        method: "POST",
        body: { generation: 1, reason: "Etiqueta extraviada" },
      });
      assert.equal(r.status, 200);
      assert.notEqual(r.body.token, qr.token);
      assert.equal((await call("/fleet/qr/resolve/" + qr.token)).status, 404);
      qr = r.body;
      assert.equal(
        (
          await call(path, {
            method: "POST",
            body: { generation: 1, reason: "Doble envío" },
          })
        ).status,
        409,
      );
      assert.equal(
        (await call("/fleet/order-qr/" + order.id)).body.token,
        qr.token,
      );
      const events = (
        await h.db.query(
          "SELECT * FROM ac_fleet_events WHERE action='QR reemplazado'",
        )
      ).rows;
      assert.equal(events.length, 1);
      assert.equal(events[0].notes, "Etiqueta extraviada");
    },
  );
  await t.test(
    "una unidad archivada no abre con el QR; recuperación conserva el código vigente",
    async () => {
      await h.db.query("UPDATE ac_fleet_units SET active=FALSE WHERE id=$1", [
        ids[0],
      ]);
      assert.equal((await call("/fleet/qr/resolve/" + qr.token)).status, 404);
      assert.equal((await call("/fleet/order-qr/" + order.id)).body, null);
      await h.db.query("UPDATE ac_fleet_units SET active=TRUE WHERE id=$1", [
        ids[0],
      ]);
      assert.equal(
        (await call("/fleet/qr/resolve/" + qr.token)).body.unitId,
        ids[0],
      );
    },
  );
  await t.test(
    "unidades existentes reciben un código una sola vez",
    async () => {
      await h.db.query("DELETE FROM ac_fleet_qr WHERE unit_id=$1", [ids[1]]);
      const a = await call("/fleet/units/" + ids[1] + "/qr"),
        b = await call("/fleet/units/" + ids[1] + "/qr");
      assert.equal(a.body.token, b.body.token);
    },
  );
});
