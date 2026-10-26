"use strict";
const crypto = require("node:crypto");

// Additive QR registry. Existing units and report records are never rewritten.
function register(app, { pool, authRequired, normalizedIdentitySql }) {
  let initialization;
  function ready() {
    if (!initialization)
      initialization = pool
        .query(
          `
      CREATE TABLE IF NOT EXISTS report_unit_qr (
        fleet_unit_id TEXT PRIMARY KEY REFERENCES fleet_units(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
        )
        .catch((error) => {
          initialization = null;
          throw error;
        });
    return initialization;
  }
  const allowed = [
    "admin",
    "operativo",
    "supervisor",
    "supervisor_flotas",
    "operador",
  ];
  const global = ["admin", "operativo"];
  async function currentUser(req, res) {
    const result = await pool.query(
      "SELECT id, role, empresa, activo FROM users WHERE id = $1",
      [req.user.id],
    );
    const user = result.rows[0];
    if (!user || user.activo === false || !allowed.includes(user.role)) {
      res
        .status(403)
        .json({ error: "No tienes acceso a los reportes de flotas." });
      return null;
    }
    return user;
  }
  const route = (fn) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await fn(req, res);
    } catch (error) {
      console.error("[report-qr]", error.message);
      if (!res.headersSent)
        res
          .status(500)
          .json({
            error: "No se pudieron preparar las etiquetas. Intenta nuevamente.",
          });
    }
  };
  const map = (row) => ({
    id: row.id,
    empresa: row.empresa,
    nombreFlota: row.nombre_flota || "",
    numeroEconomico: row.numero_economico,
    numeroObra: row.numero_obra || "",
    modelo: row.modelo || "",
    marca: row.marca || "",
    kilometraje: row.kilometraje || "",
    token: row.token,
  });
  app.post(
    "/api/report-qr/batch",
    authRequired,
    route(async (req, res) => {
      const user = await currentUser(req, res);
      if (!user) return;
      if (user.role === "operador")
        return res
          .status(403)
          .json({
            error:
              "La descarga de etiquetas está disponible para administración y supervisión.",
          });
      const ids = req.body?.unitIds;
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 5000 ||
        ids.some((id) => typeof id !== "string" || !id || id.length > 200) ||
        new Set(ids).size !== ids.length
      ) {
        return res
          .status(400)
          .json({ error: "Selecciona entre 1 y 5,000 unidades distintas." });
      }
      await ready();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const params = [ids];
        let scope = "";
        if (!global.includes(user.role)) {
          params.push(user.empresa || "");
          scope = ` AND ${normalizedIdentitySql("empresa")} = ${normalizedIdentitySql("$2")}`;
        }
        const units = await client.query(
          `SELECT * FROM fleet_units WHERE id = ANY($1::text[])${scope} FOR KEY SHARE`,
          params,
        );
        if (units.rows.length !== ids.length) {
          await client.query("ROLLBACK");
          return res
            .status(404)
            .json({
              error:
                "Una o más unidades ya no están disponibles en tu flota. Actualiza la lista.",
            });
        }
        const tokens = ids.map(() => crypto.randomBytes(24).toString("hex"));
        await client.query(
          `INSERT INTO report_unit_qr(fleet_unit_id, token)
        SELECT * FROM UNNEST($1::text[], $2::text[]) ON CONFLICT(fleet_unit_id) DO NOTHING`,
          [ids, tokens],
        );
        const codes = await client.query(
          "SELECT fleet_unit_id, token FROM report_unit_qr WHERE fleet_unit_id = ANY($1::text[])",
          [ids],
        );
        await client.query("COMMIT");
        const byId = new Map(
          codes.rows.map((row) => [row.fleet_unit_id, row.token]),
        );
        const rows = new Map(units.rows.map((row) => [row.id, row]));
        res.json({
          units: ids.map((id) => map({ ...rows.get(id), token: byId.get(id) })),
        });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }),
  );
  app.get(
    "/api/report-qr/:token",
    authRequired,
    route(async (req, res) => {
      const user = await currentUser(req, res);
      if (!user) return;
      if (!/^[a-f0-9]{48}$/.test(req.params.token))
        return res.status(404).json({ error: "Etiqueta no disponible." });
      await ready();
      const params = [req.params.token];
      let scope = "";
      if (!global.includes(user.role)) {
        params.push(user.empresa || "");
        scope = ` AND ${normalizedIdentitySql("u.empresa")} = ${normalizedIdentitySql("$2")}`;
      }
      const result = await pool.query(
        `SELECT u.*, q.token FROM report_unit_qr q JOIN fleet_units u ON u.id = q.fleet_unit_id WHERE q.token = $1${scope}`,
        params,
      );
      if (!result.rows.length)
        return res
          .status(404)
          .json({ error: "La unidad no está disponible para tu cuenta." });
      res.json({
        unit: map(result.rows[0]),
        canReport: ["admin", "operador"].includes(user.role),
      });
    }),
  );
  return { ready };
}
module.exports = { register };
