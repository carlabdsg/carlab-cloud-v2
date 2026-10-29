const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { setup } = require("./ac-guest-fixture.cjs");
const photo =
  "data:image/jpeg;base64," +
  fs
    .readFileSync(path.join(__dirname, "fixtures/guest-photo.jpg"))
    .toString("base64");
test("AC guest QR: existing units, brand/company scope, protected access, idempotency, notifications, rotation and preservation", async (t) => {
  const h = await setup();
  t.after(() => h.close());
  const snapshot = async (table) =>
    JSON.stringify(
      (await h.db.query(`SELECT * FROM ${table} ORDER BY id`)).rows,
    );
  const original = {};
  for (const table of [
    "users",
    "garantias",
    "fleet_units",
    "ac_fleet_units",
    "hc_services",
  ])
    original[table] = await snapshot(table);
  const endpoint = "/api/public/ac-report-qr/" + h.units[0].qr.token;
  const load = () => h.call(endpoint, { user: null });
  const first = await load();
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(Object.keys(first.body).sort(), [
    "formToken",
    "maxPhotos",
    "reportOptions",
    "unit",
  ]);
  assert.deepEqual(first.body.unit, {
    empresa: "Transportes QR",
    numeroEconomico: "306",
    brand: "hispacold",
    marca: "Hispacold",
    modelo: "Equipo prueba",
  });
  assert.match(first.headers.get("cache-control"), /no-store/);
  const valid = {
    formToken: first.body.formToken,
    name: "Operador visitante AC",
    phone: "6671234567",
    description: "El aire deja de enfriar durante el recorrido.",
    category: "no_enfria",
    equipmentState: "parcial",
    priority: "urgente",
    location: "Terminal",
    photos: [photo],
    confirm: true,
    website: "",
  };
  const post = (body = valid, route = endpoint) =>
    h.call(route, { user: null, method: "POST", body });
  for (const change of [
    { name: "" },
    { phone: "123" },
    { description: "falla" },
    { category: "invalid" },
    { equipmentState: "invalid" },
    { priority: "invalid" },
    { confirm: false },
    { website: "bot" },
    { photos: [photo, photo, photo, photo, photo] },
    { photos: ["data:image/svg+xml;base64,PHN2Zz4="] },
    { photos: ["data:image/jpeg;base64,bm90YW5pbWFnZQ=="] },
    { formToken: "bad" },
  ])
    assert.equal(
      (await post({ ...valid, ...change })).status,
      400,
      JSON.stringify(change),
    );
  const tampered =
    first.body.formToken.slice(0, -1) +
    (first.body.formToken.endsWith("0") ? "1" : "0");
  assert.equal((await post({ ...valid, formToken: tampered })).status, 409);
  const otherEndpoint = "/api/public/ac-report-qr/" + h.units[1].qr.token;
  assert.equal((await post(valid, otherEndpoint)).status, 409);
  const [nonce] = valid.formToken.split("."),
    expires = String(Date.now() - 1000),
    u = h.units[0];
  const sign = crypto
    .createHmac("sha256", "reports-test")
    .update(
      JSON.stringify([
        "carlab-public-ac-report-v1",
        u.qr.token,
        nonce,
        expires,
        u.id,
        u.companyId,
        "Transportes QR",
        u.unit,
        u.brand,
      ]),
    )
    .digest("hex");
  assert.equal(
    (await post({ ...valid, formToken: nonce + "." + expires + "." + sign }))
      .status,
    410,
  );
  const result = await post({
    ...valid,
    brand: "eberspaecher",
    company: "Otra empresa QR",
    unitId: h.units[2].id,
    status: "resuelto",
    actor: "admin",
    serviceId: "fake",
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.folio, "IAC-000001");
  assert.deepEqual(Object.keys(result.body).sort(), [
    "folio",
    "receivedAt",
    "status",
    "unit",
  ]);
  assert.equal((await post()).status, 200);
  assert.deepEqual((await post()).body, result.body);
  assert.equal(
    (await h.db.query("SELECT COUNT(*)::int n FROM ac_incidents")).rows[0].n,
    1,
  );
  const saved = (await h.db.query("SELECT * FROM ac_requests")).rows[0],
    id = saved.id;
  assert.equal(saved.brand, "hispacold");
  assert.equal(saved.operator_company, "Transportes QR");
  assert.equal(saved.unit, "306");
  assert.equal(saved.service_id, null);
  assert.equal(saved.created_by, "guest-qr");
  assert.equal(saved.status, "recibida");
  assert.equal(saved.payload.source, "guest_qr");
  assert.equal(saved.payload.guestReporter.name, valid.name);
  assert.equal(saved.payload.evidence.length, 1);
  const detail = await h.call("/api/ac/incidents/" + id);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.status, "nuevo");
  assert.equal(detail.body.unitId, h.units[0].id);
  assert.equal(detail.body.events.length, 1);
  assert.match(detail.body.events[0].actor_name, /Visitante QR/);
  for (const [user, status] of [
    ["hispa", 200],
    ["eber", 404],
    ["fleet", 200],
    ["foreign", 404],
    ["operator", 403],
    [null, 401],
  ])
    assert.equal(
      (await h.call("/api/ac/incidents/" + id, { user })).status,
      status,
      user,
    );
  for (const route of [
    "/api/ac/incidents",
    "/api/ac/requests",
    "/api/ac/fleet/units",
    "/api/ac/library",
    "/api/hispacold/services",
  ])
    assert.equal((await h.call(route, { user: null })).status, 401, route);
  const unauthorized = await fetch(h.url + "/api/ac/incidents", {
    headers: { Authorization: "Bearer " + valid.formToken },
  });
  assert.equal(unauthorized.status, 401);
  for (const [user, visible] of [
    ["admin", true],
    ["hispa", true],
    ["eber", false],
    ["fleet", true],
    ["foreign", false],
  ]) {
    const n = await h.call("/api/ac/notifications?today=2026-10-25", { user });
    assert.equal(n.status, 200, JSON.stringify(n.body));
    assert.equal(
      n.body.items.some((x) => x.targetId === id),
      visible,
      user,
    );
  }
  assert.equal(
    (
      await h.db.query(
        "SELECT COUNT(*)::int n FROM ac_notifications WHERE target_id=$1",
        [id],
      )
    ).rows[0].n,
    1,
  );
  // Neither a public reporter nor a manufacturer supervisor can create a service order.
  const conversion = {
    type: "menor",
    attention: "normal",
    serviceDate: "2026-10-25",
    version: 1,
    clientKey: "guest-test-convert",
  };
  assert.equal(
    (
      await h.call("/api/ac/requests/" + id + "/create-order", {
        user: null,
        method: "POST",
        body: conversion,
      })
    ).status,
    401,
  );
  for (const table of Object.keys(original))
    assert.equal(await snapshot(table), original[table], table + " changed");
  assert.equal(
    (
      await h.call("/api/ac/requests/" + id + "/create-order", {
        user: "hispa",
        method: "POST",
        body: conversion,
      })
    ).status,
    403,
  );
  const order = await h.call("/api/ac/requests/" + id + "/create-order", {
    method: "POST",
    body: conversion,
  });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  assert.equal(order.body.data.brand, "hispacold");
  assert.equal(order.body.data.company, "Transportes QR");
  assert.equal(order.body.data.evidence.length, 1);
  assert.equal(
    (await h.call("/api/ac/incidents/" + id)).body.order.id,
    order.body.id,
  );

  const publicPage = await fetch(
    h.url + "/ac-reporte-qr.html?code=" + u.qr.token,
  );
  assert.equal(publicPage.status, 200);
  assert.match(
    publicPage.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  const oldLink = await fetch(h.url + "/?acqr=" + u.qr.token, {
    redirect: "manual",
  });
  assert.equal(oldLink.status, 302);
  assert.equal(
    oldLink.headers.get("location"),
    "/ac-reporte-qr.html?code=" + u.qr.token,
  );
  const loggedLink = await fetch(
    h.url + "/?acqr=" + u.qr.token + "&access=account",
    { redirect: "manual" },
  );
  assert.equal(loggedLink.status, 200);
  // Eberspächer routes to the same incident workflow under its own scope.
  const eberForm = await h.call(otherEndpoint, { user: null });
  const eber = await post(
    { ...valid, formToken: eberForm.body.formToken },
    otherEndpoint,
  );
  assert.equal(eber.status, 201);
  assert.equal(eber.body.unit.marca, "Eberspächer");
  const eberId = (
    await h.db.query(
      "SELECT request_id FROM ac_guest_submissions WHERE folio=$1",
      [eber.body.folio],
    )
  ).rows[0].request_id;
  assert.equal(
    (await h.call("/api/ac/incidents/" + eberId, { user: "eber" })).status,
    200,
  );
  assert.equal(
    (await h.call("/api/ac/incidents/" + eberId, { user: "hispa" })).status,
    404,
  );
  // Several independent observations stay separate without disclosing previous reports.
  for (let i = 1; i < 10; i++) {
    const next = await load();
    assert.equal(
      (await post({ ...valid, formToken: next.body.formToken })).status,
      201,
    );
  }
  const limited = await post({
    ...valid,
    formToken: (await load()).body.formToken,
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "3600");
  assert.equal((await post()).status, 200);
  await h.initDb();
  assert.equal((await post()).body.folio, result.body.folio);
  const opened = (await h.call(otherEndpoint, { user: null })).body.formToken;
  await h.db.query("UPDATE ac_fleet_units SET brand='hispacold' WHERE id=$1", [
    h.units[1].id,
  ]);
  assert.equal(
    (await post({ ...valid, formToken: opened }, otherEndpoint)).status,
    409,
  );
  await h.db.query(
    "UPDATE ac_fleet_units SET brand='eberspaecher' WHERE id=$1",
    [h.units[1].id],
  );
  const rotated = await h.call("/api/ac/fleet/units/" + u.id + "/qr/replace", {
    method: "POST",
    body: { generation: u.qr.generation, reason: "Etiqueta sustituida" },
  });
  assert.equal(rotated.status, 200);
  assert.equal((await load()).status, 404);
  assert.equal((await post()).status, 404);
  const rotatedEndpoint = "/api/public/ac-report-qr/" + rotated.body.token;
  assert.equal((await h.call(rotatedEndpoint, { user: null })).status, 200);
  await h.db.query("UPDATE ac_fleet_units SET active=FALSE WHERE id=$1", [
    u.id,
  ]);
  assert.equal((await h.call(rotatedEndpoint, { user: null })).status, 404);
  assert.equal(
    (
      await h.call(
        "/api/public/ac-report-qr/" + crypto.randomBytes(24).toString("hex"),
        { user: null },
      )
    ).status,
    404,
  );
  assert.equal(
    (await h.db.query("SELECT COUNT(*)::int n FROM garantias")).rows[0].n,
    8,
  );
});
