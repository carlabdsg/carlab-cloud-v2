const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./supervisor-fixture.cjs");
test("Supervisor: company-scoped information, read-only modules and audited quotation decisions", async (t) => {
  const h = await setup();
  t.after(() => h.close());
  const get = async (route) => {
    const r = await h.call(route, { user: "reviewer" });
    assert.equal(r.status, 200, route + " " + JSON.stringify(r.body));
    return r.body;
  };
  const snapshot = async () =>
    JSON.stringify(
      (
        await h.db.query(
          "SELECT jsonb_build_object('reports',(SELECT jsonb_agg(g ORDER BY id) FROM garantias g),'units',(SELECT jsonb_agg(u ORDER BY id) FROM fleet_units u),'acUnits',(SELECT jsonb_agg(u ORDER BY id) FROM ac_fleet_units u),'acRequests',(SELECT jsonb_agg(r ORDER BY id) FROM ac_requests r)) data",
        )
      ).rows[0].data,
    );
  const before = await snapshot();
  const me = await get("/api/ac/me");
  assert.equal(me.user.company, "ANS");
  assert.equal(me.user.role, "supervisor");
  assert.equal(me.permissions.readOnly, true);
  assert.equal(me.permissions.viewLibrary, false);
  assert.equal(me.permissions.manageOrders, false);
  const fleet = await get("/api/fleet/units");
  assert.equal(fleet.length, 11);
  assert.ok(fleet.every((u) => u.empresa === "ANS"));
  const reports = await get("/api/garantias");
  assert.equal(reports.length, 8);
  assert.ok(reports.every((r) => r.empresa === "ANS"));
  const air = await get("/api/ac/fleet/units");
  assert.equal(air.total, 2);
  assert.deepEqual(
    new Set(air.items.map((u) => u.brand)),
    new Set(["hispacold", "eberspaecher"]),
  );
  assert.equal(
    (await get("/api/ac/fleet/units?company=" + h.companies[0].id)).total,
    0,
  );
  assert.equal((await get("/api/ac/fleet/options")).companies.length, 1);
  assert.equal((await get("/api/ac/incidents/units")).length, 2);
  assert.equal((await get("/api/ac/incidents")).total, 2);
  assert.equal((await get("/api/ac/requests")).total, 1);
  assert.equal(
    (await get("/api/ac/fleet/units/" + h.ownUnits[0])).unit.company,
    "ANS",
  );
  assert.equal(
    (await h.call("/api/ac/fleet/units/" + h.units[0].id, { user: "reviewer" }))
      .status,
    404,
  );
  assert.equal(
    (
      await h.call("/api/ac/incidents/" + h.incidents[2].id, {
        user: "reviewer",
      })
    ).status,
    404,
  );
  await get("/api/ac/requests/" + h.service.id);
  for (const route of [
    "/api/ac/orders",
    "/api/ac/calendar?month=2026-10&today=2026-10-30",
    "/api/ac/reports/options",
    "/api/ac/notifications?today=2026-10-30",
  ])
    await get(route);
  assert.equal((await get("/api/ac/orders")).total, 1);
  await get("/api/ac/orders/" + h.orders[0].id);
  assert.equal(
    (await h.call("/api/ac/orders/" + h.orders[1].id, { user: "reviewer" }))
      .status,
    404,
  );
  // These requests must fail at the authorization boundary, before validating payloads or changing records.
  for (const [method, route] of [
    ["POST", "/api/garantias"],
    ["PATCH", "/api/garantias/report-1"],
    ["DELETE", "/api/garantias/report-1"],
    ["POST", "/api/fleet/units"],
    ["PATCH", "/api/fleet/units/unit-1"],
    ["DELETE", "/api/fleet/units/unit-1"],
    ["POST", "/api/report-qr/batch"],
    ["POST", "/api/schedules/manual"],
    ["POST", "/api/users"],
    ["POST", "/api/report-quotes"],
    ["POST", "/api/ac/incidents"],
    ["PATCH", "/api/ac/incidents/" + h.incidents[0].id],
    ["POST", "/api/ac/requests"],
    ["PATCH", "/api/ac/requests/" + h.service.id],
    ["DELETE", "/api/ac/requests/" + h.service.id],
    ["POST", "/api/ac/fleet/units"],
    ["POST", "/api/ac/parts"],
    ["POST", "/api/ac/notifications/read"],
    ["POST", "/api/hispacold/services"],
  ])
    assert.equal(
      (await h.call(route, { user: "reviewer", method, body: {} })).status,
      403,
      method + " " + route,
    );
  assert.equal((await get("/api/report-quotes")).units.length, 11);
  const dl = await fetch(
    h.url + "/api/report-quotes/" + h.quotes[0].id + "/pdf",
    { headers: { Authorization: "Bearer " + h.token("reviewer") } },
  );
  assert.equal(dl.status, 200);
  assert.deepEqual(Buffer.from(await dl.arrayBuffer()), h.pdf);
  const decide = (id, decision) =>
    h.call("/api/report-quotes/" + id + "/decision", {
      user: "reviewer",
      method: "POST",
      body: { decision, note: "Respuesta del supervisor de ANS." },
    });
  for (const [i, status] of ["aceptada", "rechazada"].entries()) {
    const r = await decide(h.quotes[i].id, status);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const saved = (
      await h.db.query("SELECT * FROM report_quotations WHERE id=$1", [
        h.quotes[i].id,
      ])
    ).rows[0];
    assert.equal(saved.status, status);
    assert.equal(saved.responded_by, "reviewer");
    assert.equal(saved.responded_by_name, "reviewer");
  }
  assert.equal((await decide(h.quotes[0].id, "aceptada")).status, 200);
  assert.equal((await decide(h.quotes[0].id, "rechazada")).status, 409);
  assert.equal((await decide(h.quotes[0].id, "cotizada")).status, 400);
  const audit = (
    await h.db.query("SELECT * FROM audit_logs WHERE user_id='reviewer'")
  ).rows;
  assert.equal(audit.length, 2);
  assert.equal(
    await snapshot(),
    before,
    "Existing fleet, reports, evidence, AC records must be preserved",
  );
  // Current company wins over a still-valid token. Unknown AC company must yield an empty scope, never all records.
  await h.db.query(
    "UPDATE users SET empresa='Empresa sin flota AC' WHERE id='reviewer'",
  );
  assert.equal((await get("/api/ac/fleet/units")).total, 0);
  assert.equal((await get("/api/ac/fleet/options")).companies.length, 0);
  assert.equal((await get("/api/ac/incidents/units")).length, 0);
  assert.equal((await get("/api/ac/incidents")).total, 0);
  assert.equal((await get("/api/report-quotes")).units.length, 0);
  assert.equal((await get("/api/fleet/units")).length, 0);
  assert.equal((await get("/api/garantias")).length, 0);
  assert.equal((await decide(h.quotes[0].id, "aceptada")).status, 404);
  const foreignPdf = await fetch(
    h.url + "/api/report-quotes/" + h.quotes[0].id + "/pdf",
    { headers: { Authorization: "Bearer " + h.token("reviewer") } },
  );
  assert.equal(foreignPdf.status, 404);
  await h.db.query(
    "UPDATE users SET empresa='Otra empresa QR' WHERE id='reviewer'",
  );
  assert.equal((await get("/api/ac/fleet/units")).total, 1);
  assert.equal(
    (await h.call("/api/ac/fleet/units/" + h.ownUnits[0], { user: "reviewer" }))
      .status,
    404,
  );
  for (const change of [
    "empresa=''",
    "empresa='ANS',activo=false",
    "activo=true,role='operador'",
    "role='supervisor',deleted_at=now()",
  ]) {
    await h.db.query("UPDATE users SET " + change + " WHERE id='reviewer'");
    for (const route of [
      "/api/garantias",
      "/api/fleet/units",
      "/api/report-quotes",
      "/api/ac/me",
    ])
      assert.equal(
        (await h.call(route, { user: "reviewer" })).status,
        403,
        route + " " + change,
      );
  }
  await h.db.query("UPDATE users SET role='supervisor' WHERE id='operator'");
  assert.equal(
    (
      await h.call("/api/garantias", {
        user: "operator",
        method: "POST",
        body: {},
      })
    ).status,
    403,
    "An older operator session cannot write after a demotion to supervisor",
  );
  // Existing specialized AC supervisors retain their own scope and request permissions.
  const ac = await h.call("/api/ac/me", { user: "hispa" });
  assert.equal(ac.status, 200);
  assert.equal(ac.body.permissions.readOnly, false);
  assert.equal(
    (await h.call("/api/ac/fleet/units", { user: "fleet" })).body.total,
    2,
  );
});
