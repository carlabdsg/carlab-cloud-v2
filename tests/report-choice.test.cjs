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
test("General QR choice: AC intake, exact mapping, admin association, scope, replay and preservation", async (t) => {
  const h = await setup();
  t.after(() => h.close());
  const codes = (
    await h.call("/api/report-qr/batch", {
      method: "POST",
      body: { unitIds: ["unit-1", "unit-2", "unit-3"] },
    })
  ).body.units;
  const endpoint = (i) =>
    "/api/public/ac-report-qr/from-report/" + codes[i].token;
  const load = (i) => h.call(endpoint(i), { user: null });
  const post = (body, i = 0) =>
    h.call(endpoint(i), { user: null, method: "POST", body });
  const first = await load(0);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.pendingLink, true);
  assert.equal(first.body.unit.empresa, "ANS");
  assert.equal(first.body.unit.numeroEconomico, "321");
  assert.equal(first.body.unit.brand, "");
  const valid = {
    formToken: first.body.formToken,
    name: "Operador sin cuenta",
    phone: "6671234567",
    description: "No enfría durante el recorrido y aparece una alarma.",
    category: "no_enfria",
    equipmentState: "parcial",
    priority: "urgente",
    location: "Terminal",
    photos: [photo],
    confirm: true,
    website: "",
  };
  for (const delta of [
    { name: "" },
    { phone: "123" },
    { confirm: false },
    { category: "wrong" },
    { equipmentState: "wrong" },
    { priority: "wrong" },
    { website: "bot" },
    { photos: [photo, photo, photo, photo, photo] },
    { photos: ["data:image/svg+xml;base64,PHN2Zz4="] },
    { formToken: "invalid" },
  ])
    assert.equal((await post({ ...valid, ...delta })).status, 400);
  assert.equal((await post(valid, 1)).status, 409);
  const expires = String(Date.now() - 1000),
    nonce = valid.formToken.split(".")[0],
    sig = crypto
      .createHmac("sha256", "reports-test")
      .update(
        JSON.stringify([
          "carlab-general-qr-ac-v1",
          codes[0].token,
          nonce,
          expires,
          "unit-1",
          "ANS",
          "321",
        ]),
      )
      .digest("hex");
  assert.equal(
    (await post({ ...valid, formToken: `${nonce}.${expires}.${sig}` })).status,
    410,
  );
  const counts = async (table) =>
    (await h.db.query(`SELECT COUNT(*)::int n FROM ${table}`)).rows[0].n;
  const unitsBefore = JSON.stringify(
      (await h.db.query("SELECT * FROM fleet_units ORDER BY id")).rows,
    ),
    usersBefore = await counts("users");
  const saved = await post({
    ...valid,
    company: "Otra empresa",
    brand: "eberspaecher",
    unitId: h.units[1].id,
    status: "linked",
  });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  assert.match(saved.body.folio, /^PAC-/);
  assert.equal(saved.body.pendingLink, true);
  assert.equal(saved.body.unit.empresa, "ANS");
  assert.equal(await counts("ac_incidents"), 0);
  assert.equal(await counts("hc_services"), 0);
  assert.deepEqual((await post(valid)).body, saved.body);
  assert.equal(await counts("ac_qr_intakes"), 1);
  assert.equal(await counts("users"), usersBefore);
  assert.equal(
    JSON.stringify(
      (await h.db.query("SELECT * FROM fleet_units ORDER BY id")).rows,
    ),
    unitsBefore,
  );
  const intake = (await h.call("/api/ac/qr-intakes")).body.items[0];
  assert.equal(intake.unit, "321");
  assert.equal(intake.photoCount, 1);
  assert.equal(intake.data.evidence, undefined);
  const detail = (await h.call("/api/ac/qr-intakes/" + intake.id)).body;
  assert.equal(detail.data.evidence.length, 1);
  assert.equal(detail.data.guestReporter.name, valid.name);
  for (const user of ["hispa", "eber", "fleet", "foreign", "operator", null]) {
    const expected = user ? 403 : 401;
    for (const suffix of ["", "/" + intake.id, "/" + intake.id + "/candidates"])
      assert.equal(
        (await h.call("/api/ac/qr-intakes" + suffix, { user })).status,
        expected,
      );
    assert.equal(
      (
        await h.call("/api/ac/qr-intakes/" + intake.id + "/link", {
          user,
          method: "POST",
          body: { unitId: h.units[0].id, version: 1, confirm: true },
        })
      ).status,
      expected,
    );
  }
  for (const user of ["admin", "hispa", "eber", "fleet", "foreign"]) {
    const n = (await h.call("/api/ac/notifications?today=2026-10-27", { user }))
      .body;
    assert.equal(
      n.items.some((x) => x.targetId === intake.id),
      user === "admin",
      user,
    );
  }
  const created = await h.call("/api/ac/fleet/units", {
    method: "POST",
    body: { companyId: h.companies[0].id, unit: "321", brand: "hispacold" },
  });
  assert.equal(created.status, 201);
  const destination = created.body.ids[0];
  const link = (body) =>
    h.call("/api/ac/qr-intakes/" + intake.id + "/link", {
      method: "POST",
      body,
    });
  assert.equal(
    (await link({ unitId: destination, version: 2, confirm: true })).status,
    409,
  );
  assert.equal(
    (await link({ unitId: destination, version: 1, confirm: false })).status,
    409,
  );
  await h.db.query("UPDATE ac_fleet_units SET active=FALSE WHERE id=$1", [
    destination,
  ]);
  assert.equal(
    (await link({ unitId: destination, version: 1, confirm: true })).status,
    409,
  );
  await h.db.query("UPDATE ac_fleet_units SET active=TRUE WHERE id=$1", [
    destination,
  ]);
  const linked = await link({ unitId: destination, version: 1, confirm: true });
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  assert.equal(
    (await link({ unitId: destination, version: 1, confirm: true })).body
      .requestId,
    linked.body.requestId,
  );
  assert.equal(await counts("ac_incidents"), 1);
  assert.equal(
    (await link({ unitId: h.units[1].id, version: 1, confirm: true })).status,
    409,
  );
  const incident = (await h.call("/api/ac/incidents/" + linked.body.requestId))
    .body;
  assert.equal(incident.company, "Transportes QR");
  assert.equal(incident.unit, "321");
  assert.equal(incident.brand, "hispacold");
  assert.equal(incident.photoCount, 1);
  assert.equal(incident.status, "nuevo");
  assert.equal(incident.data.sourceIntakeFolio, saved.body.folio);
  assert.ok(incident.events.some((x) => x.action === "vinculacion_qr"));
  assert.equal((await h.call("/api/ac/qr-intakes")).body.total, 0);
  assert.equal(
    (await h.call("/api/ac/qr-intakes?status=linked")).body.total,
    1,
  );
  assert.equal(
    (await h.call("/api/ac/incidents?q=" + saved.body.folio)).body.total,
    1,
  );
  assert.deepEqual(
    (await post(valid)).body,
    saved.body,
    "Receipt stays PAC after administrative association",
  );
  for (const [user, visible] of [
    ["admin", true],
    ["hispa", true],
    ["fleet", true],
    ["eber", false],
    ["foreign", false],
  ]) {
    const n = (await h.call("/api/ac/notifications?today=2026-10-27", { user }))
      .body;
    assert.equal(
      n.items.some((x) => x.targetId === intake.id),
      false,
    );
    assert.equal(
      n.items.some((x) => x.targetId === linked.body.requestId),
      visible,
      user,
    );
  }
  // Exact active company + unit matches go directly to IAC; economic number alone never matches.
  const c = (
    await h.call("/api/ac/fleet/companies", {
      method: "POST",
      body: { name: "  ANS  " },
    })
  ).body;
  const target = (
    await h.call("/api/ac/fleet/units", {
      method: "POST",
      body: { companyId: c.id, unit: "322", brand: "eberspaecher" },
    })
  ).body.ids[0];
  const matched = await load(1);
  assert.equal(matched.body.pendingLink, false);
  assert.equal(matched.body.unit.brand, "eberspaecher");
  const auto = await post({ ...valid, formToken: matched.body.formToken }, 1);
  assert.equal(auto.status, 201);
  assert.match(auto.body.folio, /^IAC-/);
  assert.equal(auto.body.pendingLink, false);
  const ai = (
    await h.db.query(
      "SELECT request_id FROM ac_qr_intakes WHERE initial_folio=$1",
      [auto.body.folio],
    )
  ).rows[0].request_id;
  assert.equal(
    (await h.call("/api/ac/incidents/" + ai, { user: "eber" })).status,
    200,
  );
  assert.equal(
    (await h.call("/api/ac/incidents/" + ai, { user: "hispa" })).status,
    404,
  );
  await h.db.query("UPDATE ac_fleet_units SET active=FALSE WHERE id=$1", [
    target,
  ]);
  assert.equal((await load(1)).body.pendingLink, true);
  // Existing public AC and general form tokens cannot be used in the new route.
  const direct = (
    await h.call("/api/public/ac-report-qr/" + h.units[0].qr.token, {
      user: null,
    })
  ).body;
  assert.equal(
    (await post({ ...valid, formToken: direct.formToken })).status,
    409,
  );
  const gen = (
    await h.call("/api/public/report-qr/" + codes[0].token, { user: null })
  ).body;
  assert.equal(
    (await post({ ...valid, formToken: gen.formToken })).status,
    409,
  );
  for (let i = 1; i < 10; i++)
    assert.equal(
      (await post({ ...valid, formToken: (await load(0)).body.formToken }))
        .status,
      201,
    );
  assert.equal(
    (await post({ ...valid, formToken: (await load(0)).body.formToken }))
      .status,
    429,
  );
  assert.equal((await post(valid)).status, 200);
  await h.initDb();
  assert.deepEqual((await post(valid)).body, saved.body);
  const opened = (await load(2)).body.formToken;
  await h.db.query(
    "UPDATE fleet_units SET empresa='Otra empresa' WHERE id='unit-3'",
  );
  assert.equal((await post({ ...valid, formToken: opened }, 2)).status, 409);
  const noauth = await fetch(h.url + "/api/ac/qr-intakes", {
    headers: { Authorization: "Bearer " + valid.formToken },
  });
  assert.equal(noauth.status, 401);
  assert.equal(await counts("garantias"), 8);
  assert.equal(await counts("hc_services"), 0);
  const qrUrl = await fetch(h.url + "/?reportqr=" + codes[0].token, {
    redirect: "manual",
  });
  assert.equal(
    qrUrl.headers.get("location"),
    "/reportar.html?code=" + codes[0].token,
  );
  const page = await fetch(h.url + "/reportar.html?code=" + codes[0].token);
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
});
