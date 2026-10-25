const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setup } = require("./reports-workspace-harness.cjs");
const pdf = fs.readFileSync(
  path.join(__dirname, "fixtures/quotation-example.pdf"),
);
test("Report quotations: roles, company scope, PDF integrity, revisions, decisions and data preservation", async (t) => {
  const h = await setup();
  t.after(() => h.close());
  const snapshot = async () => {
    const data = {};
    for (const table of [
      "garantias",
      "fleet_units",
      "fleet_cost_entries",
      "work_quotes",
      "work_quote_items",
    ])
      data[table] = (
        await h.db.query(`SELECT * FROM ${table} ORDER BY id`)
      ).rows;
    return JSON.stringify(data);
  };
  const before = await snapshot();
  const list = async (user = "admin") => h.call("/api/report-quotes", { user });
  const upload = (revision = 0, extra = {}, user = "admin") =>
    h.call("/api/report-quotes", {
      method: "POST",
      user,
      body: {
        reportId: "report-1",
        company: "ANS",
        unit: "321",
        expectedRevision: revision,
        fileName: "Cotización original.pdf",
        pdfBase64: pdf.toString("base64"),
        ...extra,
      },
    });
  const decide = (id, decision = "aceptada", user = "operator") =>
    h.call(`/api/report-quotes/${id}/decision`, {
      method: "POST",
      user,
      body: { decision, note: "Respuesta de prueba." },
    });
  let r = await list();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.units.length, 14);
  assert.ok(r.body.units.every((u) => u.status === "sin_cotizacion"));
  r = await list("operator");
  assert.equal(r.body.units.length, 11);
  assert.ok(r.body.units.every((u) => u.empresa === "ANS"));
  for (const role of ["supervisor", "reviewer", "ops", "ac", "inactive", null])
    assert.ok([401, 403].includes((await list(role)).status), role);
  assert.equal((await upload(0, {}, "operator")).status, 403);
  for (const extra of [
    { pdfBase64: Buffer.from("not a pdf").toString("base64") },
    { fileName: "html.html" },
    { unit: "322" },
    { company: "Wrong" },
    { reportId: "missing" },
    { expectedRevision: -1 },
  ])
    assert.ok([400, 404].includes((await upload(0, extra)).status));
  r = await upload();
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const first = r.body;
  assert.equal(first.status, "cotizada");
  assert.equal(first.revision, 1);
  assert.equal(
    (await upload()).status,
    409,
    "Duplicate upload cannot silently create another version",
  );
  const dl = await fetch(`${h.url}/api/report-quotes/${first.id}/pdf`, {
    headers: { Authorization: "Bearer " + h.token("operator") },
  });
  assert.equal(dl.status, 200);
  assert.deepEqual(Buffer.from(await dl.arrayBuffer()), pdf);
  assert.ok(dl.headers.get("cache-control").includes("no-store"));
  await h.db.query(
    "INSERT INTO users(id,nombre,email,password_hash,role,empresa) VALUES('foreign_operator','Foreign','foreign@test.local','test','operador','Transportes del Pacífico')",
  );
  assert.equal(
    (await decide(first.id, "aceptada", "foreign_operator")).status,
    404,
  );
  const otherDl = await fetch(`${h.url}/api/report-quotes/${first.id}/pdf`, {
    headers: { Authorization: "Bearer " + h.token("foreign_operator") },
  });
  assert.equal(otherDl.status, 404);
  assert.equal(
    (
      await h.call(
        "/api/report-quotes/unit?company=Transportes%20del%20Pac%C3%ADfico&unit=334",
        { user: "operator" },
      )
    ).status,
    404,
  );
  assert.equal((await decide(first.id, "aceptada", "admin")).status, 403);
  r = await decide(first.id);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "aceptada");
  assert.equal(r.body.respondedBy, "operator");
  assert.equal((await decide(first.id, "rechazada")).status, 409);
  assert.equal((await decide(first.id)).status, 200);
  r = await list();
  assert.equal(
    r.body.units.find((u) => u.key === "ans:321").status,
    "aceptada",
  );
  r = await upload(1);
  assert.equal(r.status, 201);
  const second = r.body;
  assert.equal(second.revision, 2);
  assert.equal(second.status, "cotizada");
  assert.equal(
    (await decide(first.id)).status,
    409,
    "Superseded PDF must never receive a new response",
  );
  r = await decide(second.id, "rechazada");
  assert.equal(r.status, 200);
  assert.equal(
    (await list()).body.units.find((u) => u.key === "ans:321").status,
    "rechazada",
  );
  r = await h.call("/api/report-quotes/unit?company=ANS&unit=321", {
    user: "operator",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.reports[0].versions.length, 2);
  assert.equal(r.body.reports[0].current.id, second.id);
  assert.equal(
    r.body.reports[0].versions.find((q) => q.id === first.id).status,
    "aceptada",
  );
  // Current database company takes precedence over a stale token.
  await h.db.query(
    "UPDATE users SET empresa='Transportes del Pacífico' WHERE id='operator'",
  );
  r = await list("operator");
  assert.equal(r.body.units.length, 3);
  assert.equal((await decide(second.id, "aceptada")).status, 404);
  await h.db.query("UPDATE users SET empresa='ANS' WHERE id='operator'");
  // Uploaded files persist through base initialization; old business data remains unchanged.
  await h.initDb();
  assert.equal(
    (await list()).body.units.find((u) => u.key === "ans:321").status,
    "rechazada",
  );
  assert.equal(await snapshot(), before);
  assert.equal(
    (
      await h.db.query(
        "SELECT count(*)::int n FROM audit_logs WHERE accion LIKE 'cotizacion_%'",
      )
    ).rows[0].n,
    4,
  );
  // Retiring a report preserves its PDF history instead of deleting customer decisions.
  await h.db.query("DELETE FROM garantias WHERE id='report-1'");
  r = await h.call("/api/report-quotes/unit?company=ANS&unit=321", {
    user: "operator",
  });
  assert.equal(r.body.reports[0].archived, true);
  assert.equal(r.body.reports[0].versions.length, 2);
  assert.equal((await decide(second.id, "aceptada")).status, 409);
});

test("Report quotations: multiple reports per unit and a report reassigned to another company", async (t) => {
  const h = await setup();
  t.after(() => h.close());
  const upload = async (
    reportId,
    company = "ANS",
    unit = "321",
    expectedRevision = 0,
  ) => {
    const r = await h.call("/api/report-quotes", {
      method: "POST",
      body: {
        reportId,
        company,
        unit,
        expectedRevision,
        fileName: "Prueba.pdf",
        pdfBase64: pdf.toString("base64"),
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const decision = (id, value) =>
    h.call(`/api/report-quotes/${id}/decision`, {
      user: "operator",
      method: "POST",
      body: { decision: value },
    });
  const unitStatus = async () =>
    (await h.call("/api/report-quotes")).body.units.find(
      (u) => u.key === "ans:321",
    );
  await h.db.query(
    "UPDATE garantias SET numero_economico='321' WHERE id='report-2'",
  );
  const first = await upload("report-1");
  assert.equal((await decision(first.id, "aceptada")).status, 200);
  assert.equal((await unitStatus()).status, "aceptada");
  const second = await upload("report-2");
  assert.equal(
    (await unitStatus()).status,
    "cotizada",
    "An accepted report cannot hide another pending quote",
  );
  assert.equal((await decision(second.id, "rechazada")).status, 200);
  assert.equal((await unitStatus()).status, "rechazada");
  const revision = await upload("report-2", "ANS", "321", 1);
  assert.equal((await decision(revision.id, "aceptada")).status, 200);
  const accepted = await unitStatus();
  assert.equal(accepted.status, "aceptada");
  assert.equal(accepted.accepted, 2);
  assert.equal(
    accepted.quoteCount,
    2,
    "Old revisions are history, not new quotations",
  );
  await h.db.query(
    "UPDATE garantias SET empresa='Transportes del Pacífico',numero_economico='334' WHERE id='report-2'",
  );
  assert.equal(
    (await decision(revision.id, "aceptada")).status,
    409,
    "A response cannot be added to a report reassigned to another company",
  );
  const detail = await h.call(
    "/api/report-quotes/unit?company=Transportes%20del%20Pac%C3%ADfico&unit=334",
  );
  assert.equal(detail.body.reports[0].latestRevision, 2);
  assert.equal(
    detail.body.reports[0].current,
    null,
    "The new company does not inherit the old company's PDF",
  );
  const moved = await upload(
    "report-2",
    "Transportes del Pacífico",
    "334",
    detail.body.reports[0].latestRevision,
  );
  assert.equal(moved.revision, 3);
  assert.equal((await decision(moved.id, "aceptada")).status, 404);
});
