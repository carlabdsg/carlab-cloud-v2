const test = require("node:test"),
  assert = require("node:assert/strict");
const { setup } = require("./ac-guest-fixture.cjs");
test("Compact reads preserve full evidence, totals and company/brand permissions", async (t) => {
  const h = await setup();
  t.after(() => h.close());
  const evidence = [
    {
      data: "data:image/jpeg;base64," + "A".repeat(500000),
      caption: "Evidencia original",
    },
  ];
  const data = {
    brand: "hispacold",
    attention: "normal",
    technician: "Técnico",
    symptoms: "No enfría",
    result: "operativo",
    evidence,
  };
  await h.db.query(
    "INSERT INTO hc_services(id,type,status,company,unit,service_date,payload,created_by,updated_by) VALUES('perf-order','menor','borrador','Transportes QR','306',CURRENT_DATE,$1::jsonb,'admin','admin')",
    [JSON.stringify(data)],
  );
  await h.db.query(
    "INSERT INTO ac_requests(id,client_key,kind,brand,operator_company,unit,payload,created_by,updated_by) VALUES('perf-request','perf-request','service','hispacold','Transportes QR','306',$1::jsonb,'admin','admin')",
    [
      JSON.stringify({
        description: "Revisar sistema",
        priority: "normal",
        evidence,
      }),
    ],
  );
  const original = h.pool.query;
  let returned = 0;
  h.pool.query = async (...args) => {
    const r = await original(...args);
    returned += Buffer.byteLength(JSON.stringify(r.rows || []));
    return r;
  };
  const orders = await h.call("/api/ac/orders");
  assert.equal(orders.status, 200);
  assert.equal(orders.body.total, 1);
  assert.ok(
    returned < 20000,
    "Listing must not read full photo payloads from DB",
  );
  assert.equal(orders.body.items[0].symptoms, "No enfría");
  const order = await h.call("/api/ac/orders/perf-order");
  assert.equal(order.status, 200);
  assert.deepEqual(order.body.data.evidence, evidence);
  returned = 0;
  const list = await h.call("/api/ac/requests?pending=true");
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.items[0].data.evidence, undefined);
  assert.ok(returned < 20000);
  const full = await h.call("/api/ac/requests/perf-request");
  assert.equal(full.status, 200);
  assert.deepEqual(full.body.data.evidence, evidence);
  for (const user of ["admin", "hispa", "fleet"])
    assert.deepEqual(
      (await h.call("/api/ac/requests?pending=true&summary=true", { user }))
        .body,
      { total: 1 },
    );
  for (const user of ["eber", "foreign"]) {
    assert.deepEqual(
      (await h.call("/api/ac/requests?pending=true&summary=true", { user }))
        .body,
      { total: 0 },
    );
    assert.equal((await h.call("/api/ac/orders", { user })).body.total, 0);
    assert.equal(
      (await h.call("/api/ac/requests/perf-request", { user })).status,
      404,
    );
  }
  const compact = await h.call(
      "/api/ac/incidents?status=abiertos&summary=true",
    ),
    incidents = await h.call("/api/ac/incidents?status=abiertos");
  assert.deepEqual(compact.body, { summary: incidents.body.summary });
  assert.equal(
    (await h.call("/api/ac/requests?summary=true", { user: null })).status,
    401,
  );
  const opts = await h.call("/api/fleet/unit-options?empresa=ANS", {
    user: "operator",
  });
  assert.equal(opts.status, 200);
  assert.equal(opts.body.length, 11);
  assert.ok(opts.body.every((u) => u.empresa === "ANS"));
  assert.equal(opts.body[0].numeroEconomico, "321");
  assert.equal(
    (
      await h.call(
        "/api/fleet/unit-options?empresa=Transportes%20del%20Pac%C3%ADfico",
        { user: "operator" },
      )
    ).body.length,
    0,
  );
  assert.equal(
    (await h.call("/api/fleet/unit-options", { user: "admin" })).body.length,
    0,
  );
  assert.equal(
    (await h.call("/api/fleet/unit-options?empresa=ANS", { user: null }))
      .status,
    401,
  );
  assert.deepEqual(
    (
      await h.db.query(
        "SELECT payload->'evidence' AS evidence FROM ac_requests WHERE id='perf-request'",
      )
    ).rows[0].evidence,
    evidence,
  );
});
