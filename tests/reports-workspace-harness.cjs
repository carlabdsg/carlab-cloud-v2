const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const jwt = require("jsonwebtoken");
const { PGlite } = require(
  path.resolve(
    __dirname,
    "../../hispacold-test-tools/node_modules/@electric-sql/pglite",
  ),
);
async function setup() {
  const db = new PGlite();
  const query = async (sql, params) => {
    if (sql.includes("CREATE EXTENSION")) return { rows: [], rowCount: 0 };
    if (!params && sql.includes(";")) {
      const all = await db.exec(sql);
      const r = all.at(-1) || { rows: [] };
      return { ...r, rowCount: r.rows.length || r.affectedRows || 0 };
    }
    const r = await db.query(sql, params);
    return { ...r, rowCount: r.rows.length || r.affectedRows || 0 };
  };
  const pool = {
    query,
    connect: async () => ({ query, release() {} }),
    on() {},
  };
  const source = fs
    .readFileSync(path.resolve(__dirname, "../server.js"), "utf8")
    .replace(/\ninitDb\(\)\n[\s\S]*$/, "\nmodule.exports={app,initDb};");
  const realRequire = createRequire(path.resolve(__dirname, "../server.js")),
    module = { exports: {} };
  const context = {
    require: (name) =>
      name === "pg"
        ? {
            Pool: function () {
              return pool;
            },
          }
        : name === "twilio"
          ? () => {
              throw Error("External notifications prohibited in tests");
            }
          : realRequire(name),
    __dirname: path.resolve(__dirname, ".."),
    module,
    exports: module.exports,
    process: {
      env: {
        DATABASE_URL: "memory-only",
        JWT_SECRET: "reports-test",
        DEFAULT_COMPANIES: "ANS,Transportes del Pacífico",
      },
      on() {},
      exit() {
        throw Error("Unexpected exit");
      },
    },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Buffer,
    URL,
    global: { crypto: require("node:crypto").webcrypto },
  };
  vm.runInNewContext(source, context, { filename: "server-test.js" });
  await module.exports.initDb();
  await query("UPDATE users SET id='admin' WHERE email='admin@carlab.local'");
  for (const [id, role, empresa] of [
    ["operator", "operador", "ANS"],
    ["supervisor", "supervisor_flotas", "ANS"],
    ["other", "supervisor_flotas", "Transportes del Pacífico"],
    ["reviewer", "supervisor", "ANS"],
    ["ops", "operativo", ""],
    ["ac", "supervisor_ac", "ANS"],
  ])
    await query(
      "INSERT INTO users(id,nombre,email,password_hash,role,empresa) VALUES($1,$2,$3,'test',$4,$5)",
      [id, id, id + "@test.local", role, empresa],
    );
  await query(
    "INSERT INTO users(id,nombre,email,password_hash,role,empresa,activo) VALUES('inactive','Inactive','inactive@test.local','test','admin','',false)",
  );
  const companyUnits = [];
  for (let i = 1; i <= 14; i++) {
    const company = i <= 11 ? "ANS" : "Transportes del Pacífico",
      id = "unit-" + i;
    await query(
      `INSERT INTO fleet_units(id,empresa,nombre_flota,numero_economico,numero_obra,marca,modelo,anio,kilometraje,poliza_activa) VALUES($1,$2,$3,$4,$5,'Irizar','i8','2024','185000',true)`,
      [
        id,
        company,
        i <= 6 ? "Regional" : "Foránea",
        String(320 + i),
        "OB-" + i,
      ],
    );
    companyUnits.push(id);
  }
  const evidence =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  for (let i = 1; i <= 8; i++)
    await query(
      `INSERT INTO garantias(id,folio,numero_obra,modelo,numero_economico,empresa,kilometraje,contacto_nombre,telefono,tipo_incidente,descripcion_fallo,solicita_refaccion,detalle_refaccion,estatus_validacion,estatus_operativo,evidencias,evidencias_refaccion,firma,reportado_por_id,reportado_por_nombre,fleet_unit_id) VALUES($1,$2,$3,'i8',$4,'ANS','185000','Responsable de flota','5216670000000','falla',$5,$6,$7,$8,$9,$10::jsonb,$10::jsonb,$11,'operator','Operador de prueba',$12)`,
      [
        "report-" + i,
        "GAR-" + String(i).padStart(6, "0"),
        "OB-" + i,
        String(320 + i),
        [
          "Pérdida de presión en el sistema neumático.",
          "Falla intermitente en módulo electrónico.",
          "Daño en panel lateral derecho.",
        ][i % 3],
        i % 2 === 0,
        i % 2 === 0 ? "Válvula neumática" : "",
        i < 3 ? "nueva" : i === 8 ? "rechazada" : "aceptada",
        i < 3
          ? "sin iniciar"
          : i < 5
            ? "en proceso"
            : i === 5
              ? "espera refacción"
              : "terminada",
        JSON.stringify([evidence]),
        evidence,
        "unit-" + i,
      ],
    );
  await query(
    "INSERT INTO fleet_cost_entries(id,fleet_unit_id,garantia_id,tipo,concepto,monto,created_by_id) VALUES('cost-1','unit-1','report-1','refaccion','Válvula original',1234.56,'admin')",
  );
  await query(
    "INSERT INTO audit_logs(garantia_id,user_id,accion,detalle) VALUES('report-1','admin','crear_reporte','Registro original conservado')",
  );
  const server = await new Promise((resolve) => {
      const s = module.exports.app.listen(0, "127.0.0.1", () => resolve(s));
    }),
    url = "http://127.0.0.1:" + server.address().port;
  const token = (id) => {
    const role =
      {
        operator: "operador",
        supervisor: "supervisor_flotas",
        other: "supervisor_flotas",
        reviewer: "supervisor",
        ops: "operativo",
        ac: "supervisor_ac",
      }[id] || "admin";
    return jwt.sign(
      {
        id,
        role,
        empresa:
          id === "other"
            ? "Transportes del Pacífico"
            : id === "admin" || id === "ops"
              ? ""
              : "ANS",
        nombre: id,
        email: id + "@test.local",
      },
      "reports-test",
    );
  };
  const call = async (route, { user = "admin", method = "GET", body } = {}) => {
    const r = await fetch(url + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(user ? { Authorization: "Bearer " + token(user) } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: await r.json() };
  };
  return {
    db,
    pool,
    server,
    url,
    token,
    call,
    companyUnits,
    evidence,
    initDb: module.exports.initDb,
    close: async () => {
      await new Promise((r) => server.close(r));
      await db.close();
    },
  };
}
module.exports = { setup };
if (require.main === module)
  setup()
    .then((h) => {
      console.log(h.url);
      if (!process.env.KEEP_SERVER) h.close();
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
