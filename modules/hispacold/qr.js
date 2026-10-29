"use strict";
const crypto = require("crypto");
const schema = `CREATE TABLE IF NOT EXISTS ac_fleet_qr (
 unit_id TEXT PRIMARY KEY REFERENCES ac_fleet_units(id), token TEXT NOT NULL UNIQUE,
 generation INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
async function ensure(db, unitId) {
  await db.query(
    "INSERT INTO ac_fleet_qr(unit_id,token) VALUES($1,$2) ON CONFLICT(unit_id) DO NOTHING",
    [unitId, crypto.randomBytes(24).toString("hex")],
  );
  return (
    await db.query(
      "SELECT token,generation FROM ac_fleet_qr WHERE unit_id=$1",
      [unitId],
    )
  ).rows[0];
}
const valid = (token) => /^[a-f0-9]{48}$/.test(token || "");
const payload = (row, company) => {
  const dual = require("./qr-policy").dual(company);
  return {
    ...row,
    dual,
    path: (dual ? "/reportar.html?code=" : "/ac-unit.html?code=") + row.token,
  };
};
function register(
  router,
  { pool, admin, wrap, fail, allowed, transaction, getUnit, audit },
) {
  router.get(
    "/fleet/units/:id/qr",
    admin,
    wrap(async (req, res) => {
      const u = await getUnit(req, req.params.id);
      if (!u.active) fail("La unidad está archivada.", 409);
      res
        .set("Cache-Control", "no-store")
        .json(payload(await ensure(pool, u.id), u.company));
    }),
  );
  router.post(
    "/fleet/units/:id/qr/replace",
    admin,
    wrap(async (req, res) => {
      const reason = String(req.body.reason || "").trim();
      if (reason.length < 3 || reason.length > 500)
        fail("Indica el motivo del reemplazo (3 a 500 caracteres).");
      const row = await transaction(async (db) => {
        const u = await getUnit(req, req.params.id, db, true);
        if (!u.active) fail("La unidad está archivada.", 409);
        const old = await ensure(db, u.id);
        if (req.body.generation !== old.generation)
          fail("El código cambió. Vuelve a abrir su etiqueta.", 409);
        const next = (
          await db.query(
            "UPDATE ac_fleet_qr SET token=$2,generation=generation+1,updated_at=NOW() WHERE unit_id=$1 RETURNING token,generation",
            [u.id, crypto.randomBytes(24).toString("hex")],
          )
        ).rows[0];
        await audit(db, u.id, req, "QR reemplazado", reason);
        return payload(next, u.company);
      });
      res.set("Cache-Control", "no-store").json(row);
    }),
  );
  router.get(
    "/fleet/qr/resolve/:token",
    wrap(async (req, res) => {
      if (!valid(req.params.token)) fail("Código no disponible.", 404);
      const u = (
        await pool.query(
          "SELECT u.id,u.brand,c.name AS company FROM ac_fleet_qr q JOIN ac_fleet_units u ON u.id=q.unit_id JOIN ac_fleet_companies c ON c.id=u.company_id WHERE q.token=$1 AND u.active=TRUE",
          [req.params.token],
        )
      ).rows[0];
      if (!u)
        fail(
          "Código no disponible. Puede haber sido reemplazado o la unidad está archivada.",
          404,
        );
      allowed(req, u.brand, u.company);
      res
        .set("Cache-Control", "no-store")
        .json({ unitId: u.id, dual: require("./qr-policy").dual(u.company) });
    }),
  );
  router.get(
    "/fleet/order-qr/:id",
    wrap(async (req, res) => {
      const order = (
        await pool.query(
          "SELECT company,unit,COALESCE(payload->>'brand','hispacold') AS brand FROM hc_services WHERE id=$1 AND deleted_at IS NULL",
          [req.params.id],
        )
      ).rows[0];
      if (!order) fail("Orden no encontrada.", 404);
      allowed(req, order.brand, order.company);
      const u = (
        await pool.query(
          "SELECT u.id FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id WHERE LOWER(TRIM(c.name))=LOWER(TRIM($1)) AND LOWER(TRIM(u.unit))=LOWER(TRIM($2)) AND u.brand=$3 AND u.active=TRUE",
          [order.company, order.unit, order.brand],
        )
      ).rows[0];
      res
        .set("Cache-Control", "no-store")
        .json(u ? payload(await ensure(pool, u.id), order.company) : null);
    }),
  );
}
module.exports = { schema, ensure, register };
