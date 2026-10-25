const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./reports-workspace-harness.cjs");
test("Report QR: stable identifiers, scope, batch integrity and legacy data preservation", async (t) => {
  const h = await setup();
  t.after(() => h.close());
  const tables = [
    "fleet_units",
    "garantias",
    "audit_logs",
    "fleet_cost_entries",
    "companies",
    "users",
  ];
  const snapshot = async () => {
    const data = {};
    for (const table of tables)
      data[table] = (
        await h.db.query(`SELECT * FROM ${table} ORDER BY id`)
      ).rows;
    return JSON.stringify(data);
  };
  const before = await snapshot();
  let r = await h.call("/api/report-qr/batch", {
    method: "POST",
    body: { unitIds: h.companyUnits },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.units.length, 14);
  const codes = r.body.units;
  assert.equal(new Set(codes.map((u) => u.token)).size, 14);
  assert.ok(codes.every((u) => /^[a-f0-9]{48}$/.test(u.token)));
  r = await h.call("/api/report-qr/batch", {
    method: "POST",
    body: { unitIds: h.companyUnits },
  });
  assert.deepEqual(r.body.units, codes);
  assert.equal(
    await snapshot(),
    before,
    "QR generation must not rewrite existing records",
  );
  for (const user of ["supervisor", "reviewer", "operator"]) {
    r = await h.call("/api/report-qr/" + codes[0].token, { user });
    assert.equal(r.status, 200);
    assert.equal(r.body.canReport, user === "operator");
    r = await h.call("/api/report-qr/" + codes[13].token, { user });
    assert.equal(r.status, 404);
  }
  for (const user of [null, "inactive", "ac"]) {
    r = await h.call("/api/report-qr/" + codes[0].token, { user });
    assert.ok([401, 403].includes(r.status));
  }
  r = await h.call("/api/report-qr/batch", {
    user: "supervisor",
    method: "POST",
    body: { unitIds: ["unit-1", "unit-14"] },
  });
  assert.equal(r.status, 404);
  r = await h.call("/api/report-qr/batch", {
    user: "operator",
    method: "POST",
    body: { unitIds: ["unit-1"] },
  });
  assert.equal(r.status, 403);
  for (const ids of [[], ["unit-1", "unit-1"], ["missing"], [null]]) {
    r = await h.call("/api/report-qr/batch", {
      method: "POST",
      body: { unitIds: ids },
    });
    assert.ok([400, 404].includes(r.status));
  }
  await h.pool.query(
    "UPDATE users SET empresa='Transportes del Pacífico' WHERE id='supervisor'",
  );
  r = await h.call("/api/report-qr/" + codes[0].token, { user: "supervisor" });
  assert.equal(
    r.status,
    404,
    "Current assignment must override a stale JWT company",
  );
  await h.pool.query("UPDATE users SET empresa='ANS' WHERE id='supervisor'");
  assert.equal(await snapshot(), before);
  await h.initDb();
  assert.equal(
    await snapshot(),
    before,
    "Re-running the base initialization keeps existing records",
  );
  r = await h.call("/api/garantias/report-1");
  assert.equal(r.status, 200);
  assert.equal(r.body.firma, h.evidence);
  assert.deepEqual(r.body.evidencias, [h.evidence]);
  assert.deepEqual(r.body.evidenciasRefaccion, [h.evidence]);
  const full = r.body;
  r = await h.call("/api/garantias/report-1", {
    method: "PATCH",
    body: {
      ...full,
      descripcionFallo: full.descripcionFallo + " Revisión documentada.",
    },
  });
  assert.equal(r.status, 200);
  r = await h.call("/api/garantias/report-1");
  assert.equal(r.body.folio, full.folio);
  assert.equal(r.body.id, full.id);
  assert.equal(r.body.firma, h.evidence);
  assert.deepEqual(r.body.evidencias, [h.evidence]);
  r = await h.call("/api/garantias", {
    user: "operator",
    method: "POST",
    body: {
      numeroObra: "OB-1",
      modelo: "i8",
      numeroEconomico: "321",
      empresa: "Transportes del Pacífico",
      tipoIncidente: "falla",
      descripcionFallo: "Nueva falla en prueba aislada.",
      firma: h.evidence,
      evidencias: [h.evidence],
    },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.empresa, "ANS");
  assert.equal(r.body.folio, "GAR-00009");
});
