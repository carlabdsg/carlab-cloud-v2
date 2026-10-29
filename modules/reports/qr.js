"use strict";
const crypto = require("node:crypto");
const settings = require("./qr-settings");

// Additive QR registry. Existing units and report records are never rewritten.
function register(
  app,
  { pool, authRequired, normalizedIdentitySql, ensureOperations },
) {
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
      );` + settings.schema,
        )
        .catch((error) => {
          initialization = null;
          throw error;
        });
    return initialization;
  }
  settings.register(app, { pool, ready, authRequired });
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
        res.status(500).json({
          error: "No se pudieron preparar las etiquetas. Intenta nuevamente.",
        });
    }
  };
  const map = (row, reportOptions) => ({
    reportOptions,
    id: row.id,
    empresa: row.empresa,
    nombreFlota: row.nombre_flota || "",
    numeroEconomico: row.numero_economico,
    numeroObra: row.numero_obra || "",
    modelo: row.modelo || "",
    marca: row.marca || "",
    kilometraje: row.kilometraje || "",
    token: row.token,
    ...(row.qrSource ? { qrSource: row.qrSource } : {}),
  });
  app.post(
    "/api/report-qr/batch",
    authRequired,
    route(async (req, res) => {
      const user = await currentUser(req, res);
      if (!user) return;
      if (user.role === "operador")
        return res.status(403).json({
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
      if (ensureOperations) {
        const companies = await pool.query(
          "SELECT DISTINCT empresa FROM fleet_units WHERE id=ANY($1::text[])",
          [ids],
        );
        if (
          companies.rows.some((row) =>
            require("../hispacold/qr-policy").dual(row.empresa),
          )
        )
          await ensureOperations();
      }
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
          return res.status(404).json({
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
        // ANS uses its existing AC code as the canonical label in both modules.
        // Earlier report codes remain in their registry and continue working.
        const canonical = new Map();
        const ansIds = units.rows
          .filter((u) => require("../hispacold/qr-policy").dual(u.empresa))
          .map((u) => u.id);
        if (ensureOperations && ansIds.length) {
          const matches = await client.query(
            `SELECT fu.id,au.id AS ac_id FROM fleet_units fu JOIN ac_fleet_companies c ON LOWER(TRIM(c.name))=LOWER(TRIM(fu.empresa)) JOIN ac_fleet_units au ON au.company_id=c.id AND LOWER(TRIM(au.unit))=LOWER(TRIM(fu.numero_economico)) WHERE fu.id=ANY($1::text[]) AND au.active=TRUE FOR SHARE OF au,c`,
            [ansIds],
          );
          const grouped = new Map();
          for (const row of matches.rows)
            grouped.set(row.id, [...(grouped.get(row.id) || []), row.ac_id]);
          const unique = [...grouped].filter(([, ids]) => ids.length === 1);
          if (unique.length) {
            const acIds = unique.map(([, ids]) => ids[0]);
            await client.query(
              `INSERT INTO ac_fleet_qr(unit_id,token) SELECT * FROM UNNEST($1::text[],$2::text[]) ON CONFLICT(unit_id) DO NOTHING`,
              [acIds, acIds.map(() => crypto.randomBytes(24).toString("hex"))],
            );
            const acCodes = await client.query(
              "SELECT unit_id,token FROM ac_fleet_qr WHERE unit_id=ANY($1::text[])",
              [acIds],
            );
            const byAc = new Map(acCodes.rows.map((q) => [q.unit_id, q.token]));
            for (const [id, [acId]] of unique)
              canonical.set(id, byAc.get(acId));
          }
        }
        await client.query("COMMIT");
        const byId = new Map(
          codes.rows.map((row) => [row.fleet_unit_id, row.token]),
        );
        const rows = new Map(units.rows.map((row) => [row.id, row]));
        const configs = new Map();
        for (const row of units.rows)
          if (!configs.has(row.empresa))
            configs.set(row.empresa, await settings.read(client, row.empresa));
        res.json({
          units: ids.map((id) =>
            map(
              {
                ...rows.get(id),
                token: canonical.get(id) || byId.get(id),
                ...(canonical.has(id) ? { qrSource: "ac" } : {}),
              },
              canonical.has(id)
                ? { general: true, ac: true, mode: "dual" }
                : settings.resolve(
                    configs.get(rows.get(id).empresa),
                    rows.get(id).nombre_flota,
                  ),
            ),
          ),
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
      if (!result.rows.length && ensureOperations) {
        await ensureOperations();
        const acScope = global.includes(user.role)
          ? ""
          : ` AND ${normalizedIdentitySql("c.name")}=${normalizedIdentitySql("$2")}`;
        const ac = await pool.query(
          `SELECT u.id,c.name AS empresa,COALESCE(u.nombre_flota,a.fleet) AS nombre_flota,a.unit AS numero_economico,COALESCE(u.numero_obra,a.work_number) AS numero_obra,COALESCE(u.modelo,a.model) AS modelo,COALESCE(u.marca,a.bus_brand) AS marca,COALESCE(u.kilometraje,a.mileage) AS kilometraje,q.token FROM ac_fleet_qr q JOIN ac_fleet_units a ON a.id=q.unit_id JOIN ac_fleet_companies c ON c.id=a.company_id LEFT JOIN fleet_units u ON LOWER(TRIM(u.empresa))=LOWER(TRIM(c.name)) AND LOWER(TRIM(u.numero_economico))=LOWER(TRIM(a.unit)) WHERE q.token=$1 AND a.active=TRUE${acScope}`,
          params,
        );
        if (
          ac.rows.length === 1 &&
          require("../hispacold/qr-policy").dual(ac.rows[0].empresa)
        ) {
          return res.json({
            unit: map(
              { ...ac.rows[0], qrSource: "ac" },
              { general: true, ac: true, mode: "dual" },
            ),
            canReport: ["admin", "operador"].includes(user.role),
          });
        }
      }
      if (!result.rows.length)
        return res
          .status(404)
          .json({ error: "La unidad no está disponible para tu cuenta." });
      res.json({
        unit: map(result.rows[0], await settings.options(pool, result.rows[0])),
        canReport: ["admin", "operador"].includes(user.role),
      });
    }),
  );
  return { ready };
}
module.exports = { register };
