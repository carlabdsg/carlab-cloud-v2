"use strict";
const normalize = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
const schema = `
CREATE TABLE IF NOT EXISTS report_qr_settings (
 company_key TEXT PRIMARY KEY,
 default_mode TEXT NOT NULL CHECK(default_mode IN ('single','dual')),
 fleet_modes JSONB NOT NULL DEFAULT '{}',
 version INTEGER NOT NULL DEFAULT 1,
 updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS report_qr_setting_events (
 id BIGSERIAL PRIMARY KEY, company_key TEXT NOT NULL, fleet_key TEXT,
 previous_settings JSONB NOT NULL, current_settings JSONB NOT NULL,
 actor_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
const initialMode = (company) =>
  normalize(company) === "aus denisse" ? "dual" : "single";
async function read(db, company, lock = false) {
  const key = normalize(company);
  await db.query(
    "INSERT INTO report_qr_settings(company_key,default_mode) VALUES($1,$2) ON CONFLICT(company_key) DO NOTHING",
    [key, initialMode(company)],
  );
  return (
    await db.query(
      "SELECT * FROM report_qr_settings WHERE company_key=$1" +
        (lock ? " FOR SHARE" : ""),
      [key],
    )
  ).rows[0];
}
function resolve(settings, fleet) {
  const key = normalize(fleet);
  const mode = Object.hasOwn(settings.fleet_modes, key)
    ? settings.fleet_modes[key]
    : settings.default_mode;
  return { general: true, ac: mode === "dual", mode };
}
async function options(db, unit, lock = false) {
  return resolve(await read(db, unit.empresa, lock), unit.nombre_flota);
}
async function requireAC(db, unit) {
  if (!(await options(db, unit, true)).ac) {
    throw Object.assign(
      new Error(
        "Esta flota tiene QR sencillo: únicamente daños y garantías. Abre el formulario general para registrar tu reporte.",
      ),
      { status: 403, code: "REPORT_QR_GENERAL_ONLY" },
    );
  }
}
function register(app, { pool, ready, authRequired }) {
  const fail = (status, message) =>
    Object.assign(new Error(message), { status });
  const route = (fn) => async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const user = (
        await pool.query("SELECT id,role,activo FROM users WHERE id=$1", [
          req.user.id,
        ])
      ).rows[0];
      if (!user || user.activo === false || user.role !== "admin")
        throw fail(
          403,
          "Solo administración puede configurar los QR de las flotas.",
        );
      await ready();
      await fn(req, res, user);
    } catch (e) {
      if (!e.status) console.error("[report-qr-settings]", e.message);
      res
        .status(e.status || 500)
        .json({
          error: e.status
            ? e.message
            : "No se pudo guardar la configuración de QR. Intenta nuevamente.",
        });
    }
  };
  async function scope(input, db) {
    if (
      typeof input.company !== "string" ||
      !input.company.trim() ||
      input.company.length > 300 ||
      (input.fleet != null &&
        (typeof input.fleet !== "string" ||
          !input.fleet.trim() ||
          input.fleet.length > 300))
    )
      throw fail(400, "Selecciona una empresa y una flota válidas.");
    const company = normalize(input.company),
      fleet = input.fleet == null ? null : normalize(input.fleet);
    const rows = (
      await db.query("SELECT empresa,nombre_flota FROM fleet_units")
    ).rows.filter(
      (u) =>
        normalize(u.empresa) === company &&
        (fleet === null || normalize(u.nombre_flota) === fleet),
    );
    if (!rows.length)
      throw fail(
        404,
        "La flota ya no tiene unidades disponibles. Actualiza la lista.",
      );
    return {
      company: rows[0].empresa,
      fleet: fleet === null ? null : rows[0].nombre_flota,
      key: company,
      fleetKey: fleet,
      rows,
    };
  }
  const response = (s, cfg) => {
    const modes = new Set(s.rows.map((u) => resolve(cfg, u.nombre_flota).mode));
    return {
      company: s.company,
      fleet: s.fleet,
      unitCount: s.rows.length,
      mode: modes.size === 1 ? [...modes][0] : "mixed",
      version: cfg.version,
      updatedAt: cfg.updated_at,
    };
  };
  app.get(
    "/api/report-qr/settings",
    authRequired,
    route(async (req, res) => {
      const s = await scope(req.query, pool);
      res.json(response(s, await read(pool, s.company)));
    }),
  );
  app.patch(
    "/api/report-qr/settings",
    authRequired,
    route(async (req, res, user) => {
      const b = req.body || {};
      if (!["single", "dual"].includes(b.mode) || !Number.isInteger(b.version))
        throw fail(
          400,
          "Elige QR sencillo o doble y actualiza la configuración.",
        );
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        const s = await scope(b, db);
        await read(db, s.company);
        const before = (
          await db.query(
            "SELECT * FROM report_qr_settings WHERE company_key=$1 FOR UPDATE",
            [s.key],
          )
        ).rows[0];
        if (before.version !== b.version)
          throw fail(
            409,
            "La configuración cambió en otra ventana. Cierra y vuelve a abrir Configurar QR para revisar el valor actual.",
          );
        const fleets =
          s.fleetKey === null
            ? {}
            : { ...before.fleet_modes, [s.fleetKey]: b.mode };
        const current = (
          await db.query(
            "UPDATE report_qr_settings SET default_mode=$2,fleet_modes=$3,version=version+1,updated_by=$4,updated_at=NOW() WHERE company_key=$1 RETURNING *",
            [
              s.key,
              s.fleetKey === null ? b.mode : before.default_mode,
              JSON.stringify(fleets),
              user.id,
            ],
          )
        ).rows[0];
        await db.query(
          "INSERT INTO report_qr_setting_events(company_key,fleet_key,previous_settings,current_settings,actor_id) VALUES($1,$2,$3,$4,$5)",
          [
            s.key,
            s.fleetKey,
            JSON.stringify(before),
            JSON.stringify(current),
            user.id,
          ],
        );
        await db.query("COMMIT");
        res.json(response(s, current));
      } catch (e) {
        await db.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        db.release();
      }
    }),
  );
}
module.exports = { schema, read, resolve, options, requireAC, register };
