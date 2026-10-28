const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { setup } = require("./reports-workspace-harness.cjs");
const photo =
  "data:image/jpeg;base64," +
  fs
    .readFileSync(path.join(__dirname, "fixtures/guest-photo.jpg"))
    .toString("base64");
test("Guest QR reports: fixed identity, isolated access, validation, idempotency, history and limits", async (t) => {
  const h = await setup();
  t.after(() => h.close());
  const snapshot = async (table) =>
    JSON.stringify(
      (await h.db.query(`SELECT * FROM ${table} ORDER BY id`)).rows,
    );
  const usersBefore = await snapshot("users"),
    fleetBefore = await snapshot("fleet_units");
  const reportsBefore = (
    await h.db.query("SELECT * FROM garantias ORDER BY id")
  ).rows;
  const codes = (
    await h.call("/api/report-qr/batch", {
      method: "POST",
      body: { unitIds: ["unit-1", "unit-2", "unit-14"] },
    })
  ).body.units;
  const code = codes[0].token,
    endpoint = "/api/public/report-qr/" + code;
  const load = () => h.call(endpoint, { user: null });
  const initial = await load();
  assert.equal(initial.status, 200);
  assert.deepEqual(Object.keys(initial.body).sort(), [
    "formToken",
    "maxPhotos",
    "unit",
  ]);
  assert.deepEqual(Object.keys(initial.body.unit).sort(), [
    "empresa",
    "marca",
    "modelo",
    "numeroEconomico",
  ]);
  const valid = {
    formToken: initial.body.formToken,
    name: "Conductor de prueba",
    phone: "6671234567",
    incident: "falla",
    description: "Se detecta una falla en el sistema neumático.",
    mileage: "245000",
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
    { incident: "aceptada" },
    { confirm: false },
    { website: "bot" },
    { photos: [photo, photo, photo, photo, photo] },
    { photos: ["data:image/svg+xml;base64,PHN2Zz4="] },
    {
      photos: [
        "data:image/jpeg;base64," +
          Buffer.from("not an image").toString("base64"),
      ],
    },
    { mileage: "-25" },
    { formToken: "invalid" },
  ])
    assert.equal(
      (await post({ ...valid, ...change })).status,
      400,
      JSON.stringify(change),
    );
  assert.equal(
    (
      await post({
        ...valid,
        formToken:
          valid.formToken.slice(0, -1) +
          (valid.formToken.endsWith("0") ? "1" : "0"),
      })
    ).status,
    409,
  );
  assert.equal(
    (await post(valid, "/api/public/report-qr/" + codes[2].token)).status,
    409,
  );
  const expired = "b".repeat(32),
    expires = String(Date.now() - 1000);
  const signature = crypto
    .createHmac("sha256", "reports-test")
    .update(
      JSON.stringify([
        "carlab-public-report-v1",
        code,
        expired,
        expires,
        "unit-1",
        "ANS",
        "321",
      ]),
    )
    .digest("hex");
  assert.equal(
    (await post({ ...valid, formToken: `${expired}.${expires}.${signature}` }))
      .status,
    410,
  );
  const first = await post({
    ...valid,
    empresa: "Otra empresa",
    numeroEconomico: "999",
    estatusValidacion: "aceptada",
    reportadoPorId: "admin",
    solicitaRefaccion: true,
  });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.status, "recibido");
  assert.equal(first.body.folio, "GAR-00009");
  assert.deepEqual(first.body.unit, { empresa: "ANS", numeroEconomico: "321" });
  const stored = (
    await h.db.query("SELECT * FROM garantias WHERE folio=$1", [
      first.body.folio,
    ])
  ).rows[0];
  assert.equal(stored.reportado_por_id, null);
  assert.equal(
    stored.reportado_por_nombre,
    "Conductor de prueba · Visitante QR",
  );
  assert.equal(stored.empresa, "ANS");
  assert.equal(stored.numero_economico, "321");
  assert.equal(stored.estatus_validacion, "nueva");
  assert.equal(stored.estatus_operativo, "sin iniciar");
  assert.equal(stored.solicita_refaccion, false);
  assert.equal(stored.fleet_unit_id, "unit-1");
  assert.deepEqual(stored.evidencias, [photo]);
  assert.equal(stored.firma, "");
  const retry = await post();
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.body, first.body);
  assert.equal(
    (await h.db.query("SELECT COUNT(*)::int n FROM garantias")).rows[0].n,
    9,
  );
  assert.equal(
    (await h.call("/api/garantias/" + stored.id, { user: null })).status,
    401,
  );
  assert.equal(
    (await h.call("/api/garantias/" + stored.id, { user: "operator" })).status,
    404,
  );
  assert.equal(
    (await h.call("/api/garantias/" + stored.id, { user: "other" })).status,
    404,
  );
  assert.equal(
    (await h.call("/api/garantias/" + stored.id, { user: "supervisor" }))
      .status,
    200,
  );
  for (const url of [
    "/api/garantias",
    "/api/report-quotes",
    "/api/users",
    "/api/fleet/summary",
    "/api/report-qr/" + code,
  ])
    assert.ok(
      [401, 403].includes((await h.call(url, { user: null })).status),
      url,
    );
  const bearer = await fetch(h.url + "/api/garantias", {
    headers: { Authorization: "Bearer " + valid.formToken },
  });
  assert.equal(
    bearer.status,
    401,
    "The public form token is never an account token",
  );
  assert.equal(await snapshot("users"), usersBefore);
  assert.equal(await snapshot("fleet_units"), fleetBefore);
  assert.deepEqual(
    (
      await h.db.query(
        "SELECT * FROM garantias WHERE id=ANY($1::text[]) ORDER BY id",
        [reportsBefore.map((r) => r.id)],
      )
    ).rows,
    reportsBefore,
  );
  assert.equal(
    (
      await h.db.query(
        "SELECT COUNT(*)::int n FROM audit_logs WHERE accion='crear_reporte_qr'",
      )
    ).rows[0].n,
    1,
  );
  const notifications = await h.call("/api/notifications");
  assert.equal(notifications.body.newReports, 3);
  const redirect = await fetch(h.url + "/?reportqr=" + code, {
    redirect: "manual",
  });
  assert.equal(redirect.status, 302);
  assert.equal(
    redirect.headers.get("location"),
    "/reportar.html?code=" + code,
  );
  const account = await fetch(h.url + "/?access=account&reportqr=" + code, {
    redirect: "manual",
  });
  assert.equal(account.status, 200);
  assert.ok((await account.text()).includes('id="loginForm"'));
  const publicPage = await fetch(h.url + "/reportar.html?code=" + code);
  assert.equal(publicPage.headers.get("referrer-policy"), "no-referrer");
  assert.ok(
    publicPage.headers
      .get("content-security-policy")
      .includes("frame-ancestors 'none'"),
  );
  for (let i = 1; i < 10; i++) {
    const fresh = await load();
    assert.equal(
      (await post({ ...valid, formToken: fresh.body.formToken })).status,
      201,
    );
  }
  const limited = await post({
    ...valid,
    formToken: (await load()).body.formToken,
  });
  assert.equal(limited.status, 429);
  assert.equal(
    (await post()).status,
    200,
    "A retry returns its receipt even after the unit rate limit",
  );
  await h.initDb();
  assert.equal((await post()).body.folio, first.body.folio);
  const secondCode = codes[1].token,
    second = (
      await h.call("/api/public/report-qr/" + secondCode, { user: null })
    ).body;
  await h.db.query(
    "UPDATE fleet_units SET empresa='Transportes del Pacífico' WHERE id='unit-2'",
  );
  assert.equal(
    (
      await post(
        { ...valid, formToken: second.formToken },
        "/api/public/report-qr/" + secondCode,
      )
    ).status,
    409,
    "A QR form cannot silently change company",
  );
  await h.db.query("DELETE FROM fleet_units WHERE id='unit-14'");
  assert.equal(
    (await h.call("/api/public/report-qr/" + codes[2].token, { user: null }))
      .status,
    404,
  );
  assert.equal(
    (await h.call("/api/public/report-qr/" + "f".repeat(48), { user: null }))
      .status,
    404,
  );
});
