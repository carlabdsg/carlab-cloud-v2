const test = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { setup } = require("./ac-guest-fixture.cjs");
test("Fleet QR settings: defaults, current permissions, per-fleet overrides, existing codes, stale forms and data preservation", async (t) => {
  const h = await setup();
  t.after(() => h.close());
  await h.db.query(
    "UPDATE fleet_units SET empresa='Reportes aus' WHERE id IN ('unit-1','unit-7')",
  );
  await h.db.query(
    "UPDATE fleet_units SET empresa='AUS DENISSE' WHERE id='unit-12'",
  );
  await h.db.query(
    "UPDATE fleet_units SET empresa='AUS DENISSE NORTE',nombre_flota='AUS DENISSE' WHERE id='unit-13'",
  );
  const snap = async () =>
    JSON.stringify(
      Object.fromEntries(
        await Promise.all(
          [
            "fleet_units",
            "garantias",
            "users",
            "ac_incidents",
            "ac_requests",
          ].map(async (name) => [
            name,
            (await h.db.query("SELECT * FROM " + name + " ORDER BY 1")).rows,
          ]),
        ),
      ),
    );
  const before = await snap();
  const ids = ["unit-1", "unit-7", "unit-12", "unit-13"];
  const batch = () =>
    h.call("/api/report-qr/batch", { method: "POST", body: { unitIds: ids } });
  const original = (await batch()).body.units;
  assert.deepEqual(
    original.map((u) => u.reportOptions.ac),
    [false, false, true, false],
  );
  const get = (company, fleet) =>
    h.call(
      "/api/report-qr/settings?" +
        new URLSearchParams({ company, ...(fleet ? { fleet } : {}) }),
    );
  const save = (company, mode, version, fleet = null, user = "admin") =>
    h.call("/api/report-qr/settings", {
      user,
      method: "PATCH",
      body: { company, fleet, mode, version },
    });
  const load = (i) =>
    h.call("/api/public/report-qr/" + original[i].token, { user: null });
  const acLoad = (i) =>
    h.call("/api/public/ac-report-qr/from-report/" + original[i].token, {
      user: null,
    });
  const post = (i, body) =>
    h.call("/api/public/ac-report-qr/from-report/" + original[i].token, {
      user: null,
      method: "POST",
      body,
    });
  assert.equal((await get("  REPORTES   AUS  ")).body.mode, "single");
  assert.equal((await get("aus denisse")).body.mode, "dual");
  assert.equal((await get("AUS DENISSE NORTE")).body.mode, "single");
  assert.equal((await get("No existe")).status, 404);
  assert.equal((await get("Reportes aus", "No existe")).status, 404);
  for (const user of [
    "supervisor",
    "operator",
    "ops",
    "hispa",
    "eber",
    "inactive",
    null,
  ]) {
    const read = await h.call(
      "/api/report-qr/settings?company=Reportes%20aus",
      { user },
    );
    assert.equal(read.status, user ? 403 : 401, user);
    assert.equal(
      (await save("Reportes aus", "dual", 1, null, user)).status,
      user ? 403 : 401,
      user,
    );
  }
  assert.equal((await save("Reportes aus", "wrong", 1)).status, 400);
  assert.equal((await acLoad(0)).status, 403);
  assert.equal((await acLoad(0)).body.code, "REPORT_QR_GENERAL_ONLY");
  assert.equal((await load(0)).body.reportOptions.ac, false);
  const valid = {
    name: "Operador visitante",
    phone: "6671234567",
    description: "El aire no enfría al encender el equipo.",
    category: "no_enfria",
    equipmentState: "parcial",
    priority: "normal",
    confirm: true,
    photos: [],
  };
  // A valid V7.7 token obtained before this change must not bypass the current mode.
  const nonce = crypto.randomBytes(16).toString("hex"),
    expires = String(Date.now() + 3600000);
  const sig = crypto
    .createHmac("sha256", "reports-test")
    .update(
      JSON.stringify([
        "carlab-general-qr-ac-v1",
        original[0].token,
        nonce,
        expires,
        "unit-1",
        "Reportes aus",
        "321",
      ]),
    )
    .digest("hex");
  assert.equal(
    (
      await post(0, {
        ...valid,
        formToken: `${nonce}.${expires}.${sig}`,
        company: "AUS DENISSE",
        mode: "dual",
        reportOptions: { ac: true },
      })
    ).status,
    403,
  );
  let cfg = (await get("Reportes aus")).body;
  let r = await save("Reportes aus", "dual", cfg.version, "Regional");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.mode, "dual");
  assert.equal((await get("Reportes aus")).body.mode, "mixed");
  assert.equal((await get("Reportes aus", "Foránea")).body.mode, "single");
  assert.equal(
    (await save("Reportes aus", "single", cfg.version)).status,
    409,
    "Stale window cannot overwrite a newer setting",
  );
  assert.equal((await load(0)).body.reportOptions.ac, true);
  assert.equal((await load(1)).body.reportOptions.ac, false);
  const opened = (await acLoad(0)).body;
  assert.ok(opened.formToken);
  assert.equal(opened.pendingLink, true);
  cfg = (await get("Reportes aus")).body;
  r = await save("Reportes aus", "single", cfg.version);
  assert.equal(r.status, 200);
  assert.equal(
    (await post(0, { ...valid, formToken: opened.formToken })).status,
    403,
    "Disabling invalidates an already open AC form",
  );
  assert.equal((await get("Reportes aus", "Regional")).body.mode, "single");
  assert.equal((await get("Reportes aus")).body.mode, "single");
  assert.equal(
    await snap(),
    before,
    "Settings never rewrite fleet units, accounts or historical reports",
  );
  assert.deepEqual(
    (await batch()).body.units.map((u) => u.token),
    original.map((u) => u.token),
    "Printed QR identifiers stay stable",
  );
  assert.equal(
    (await h.db.query("SELECT COUNT(*)::int n FROM ac_qr_intakes")).rows[0].n,
    0,
  );
  cfg = (await get("Reportes aus")).body;
  assert.equal((await save("Reportes aus", "dual", cfg.version)).status, 200);
  assert.deepEqual(
    (await batch()).body.units.map((u) => u.reportOptions.ac),
    [true, true, true, false],
  );
  // New units inherit their company/fleet setting; saving one fleet never changes another company.
  await h.db.query(
    "INSERT INTO fleet_units(id,empresa,nombre_flota,numero_economico) VALUES('new-qr-unit','Reportes aus','Regional','999')",
  );
  const added = (
    await h.call("/api/report-qr/batch", {
      method: "POST",
      body: { unitIds: ["new-qr-unit"] },
    })
  ).body.units[0];
  assert.equal(added.reportOptions.ac, true);
  cfg = (await get("Reportes aus")).body;
  assert.equal(
    (await save("Reportes aus", "single", cfg.version, "Regional")).status,
    200,
  );
  assert.equal(
    (await h.call("/api/public/report-qr/" + added.token, { user: null })).body
      .reportOptions.ac,
    false,
  );
  assert.equal((await load(1)).body.reportOptions.ac, true);
  assert.equal((await get("AUS DENISSE")).body.mode, "dual");
  // General reporting remains available in single mode.
  const general = (await load(0)).body;
  const report = await h.call("/api/public/report-qr/" + original[0].token, {
    user: null,
    method: "POST",
    body: {
      name: valid.name,
      phone: valid.phone,
      description: "Daño visible en la defensa delantera de la unidad.",
      incident: "daño",
      photos: [],
      confirm: true,
      formToken: general.formToken,
    },
  });
  assert.equal(report.status, 201, JSON.stringify(report.body));
  assert.match(report.body.folio, /^GAR-/);
  assert.equal((await acLoad(0)).status, 403);
  // Re-enable and submit through the same printed code: pending intake still works.
  cfg = (await get("Reportes aus")).body;
  assert.equal(
    (await save("Reportes aus", "dual", cfg.version, "Regional")).status,
    200,
  );
  const reopened = (await acLoad(0)).body;
  const saved = await post(0, { ...valid, formToken: reopened.formToken });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  assert.match(saved.body.folio, /^PAC-/);
  const historic = (await h.db.query("SELECT * FROM ac_qr_intakes")).rows;
  cfg = (await get("Reportes aus")).body;
  assert.equal((await save("Reportes aus", "single", cfg.version)).status, 200);
  assert.deepEqual(
    (await h.db.query("SELECT * FROM ac_qr_intakes")).rows,
    historic,
  );
  await h.initDb();
  assert.equal((await get("Reportes aus")).body.mode, "single");
  assert.equal((await get("AUS DENISSE")).body.mode, "dual");
  assert.equal(
    (await h.db.query("SELECT COUNT(*)::int n FROM report_qr_setting_events"))
      .rows[0].n,
    6,
  );
  assert.equal(
    (
      await h.call("/api/public/ac-report-qr/" + h.units[0].qr.token, {
        user: null,
      })
    ).status,
    200,
    "Dedicated AC labels remain independent",
  );
});
