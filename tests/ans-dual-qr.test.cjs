const test = require("node:test"),
  assert = require("node:assert/strict");
const { setup } = require("./ac-guest-fixture.cjs");
test("Existing ANS AC codes accept both reports; pending bodywork never creates units or crosses companies", async (t) => {
  const h = await setup();
  t.after(() => h.close());
  const company = await h.call("/api/ac/fleet/companies", {
    method: "POST",
    body: { name: "ANS", region: "Pacífico" },
  });
  assert.equal(company.status, 201);
  const units = [];
  for (const unit of ["321", "990"]) {
    const u = await h.call("/api/ac/fleet/units", {
      method: "POST",
      body: {
        companyId: company.body.id,
        unit,
        brand: "hispacold",
        model: "i8",
      },
    });
    assert.equal(u.status, 201, JSON.stringify(u.body));
    const id = u.body.ids[0],
      qr = await h.call("/api/ac/fleet/units/" + id + "/qr");
    assert.equal(qr.body.dual, true);
    assert.equal(qr.body.path, "/reportar.html?code=" + qr.body.token);
    units.push({ id, ...qr.body });
  }
  const reportLabel = await h.call("/api/report-qr/batch", {
    method: "POST",
    body: { unitIds: ["unit-1"] },
  });
  assert.equal(reportLabel.status, 200);
  assert.equal(
    reportLabel.body.units[0].token,
    units[0].token,
    "Both modules must print the SAME code for the matched ANS unit",
  );
  assert.equal(reportLabel.body.units[0].qrSource, "ac");
  const count = async (table) =>
    (await h.db.query(`SELECT COUNT(*)::int n FROM ${table}`)).rows[0].n;
  const before = {
    general: await count("fleet_units"),
    ac: await count("ac_fleet_units"),
    users: await count("users"),
  };
  const load = (code, ac = false) =>
    h.call("/api/public/" + (ac ? "ac-report-qr/" : "report-qr/") + code, {
      user: null,
    });
  const body = (token) => ({
    formToken: token,
    name: "Operador ANS",
    phone: "6671234567",
    description: "Golpe en la carrocería junto a la puerta.",
    incident: "daño",
    mileage: "12000",
    photos: [],
    confirm: true,
    website: "",
  });
  for (const [i, u] of units.entries()) {
    const authenticated = await h.call("/api/report-qr/" + u.token, {
      user: "operator",
    });
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.body.unit.id, i === 0 ? "unit-1" : null);
    assert.equal(
      (await h.call("/api/report-qr/" + u.token, { user: "other" })).status,
      404,
    );
    const form = await load(u.token),
      air = await load(u.token, true);
    assert.equal(form.status, 200);
    assert.equal(form.body.source, "ac");
    assert.equal(form.body.pendingLink, i === 1);
    assert.equal(form.body.reportOptions.ac, true);
    assert.equal(air.body.reportOptions.general, true);
    const payload = {
      ...body(form.body.formToken),
      company: "Transportes del Pacífico",
      unit: "333",
      fleetUnitId: "unit-14",
    };
    const saved = await h.call("/api/public/report-qr/" + u.token, {
      user: null,
      method: "POST",
      body: payload,
    });
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    assert.equal(saved.body.unit.empresa, "ANS");
    assert.deepEqual(
      (
        await h.call("/api/public/report-qr/" + u.token, {
          user: null,
          method: "POST",
          body: payload,
        })
      ).body,
      saved.body,
    );
    const record = (
      await h.db.query("SELECT * FROM garantias WHERE folio=$1", [
        saved.body.folio,
      ])
    ).rows[0];
    assert.equal(record.fleet_unit_id, i === 0 ? "unit-1" : null);
    assert.equal(record.empresa, "ANS");
    assert.equal(record.numero_economico, i === 0 ? "321" : "990");
    assert.equal(record.descripcion_fallo, payload.description);
    assert.equal(record.reportado_por_id, null);
    const acSaved = await h.call("/api/public/ac-report-qr/" + u.token, {
      user: null,
      method: "POST",
      body: {
        formToken: air.body.formToken,
        name: "Operador ANS",
        phone: "6671234567",
        description: "El aire acondicionado dejó de enfriar.",
        category: "no_enfria",
        equipmentState: "parcial",
        priority: "normal",
        location: "Terminal",
        photos: [],
        confirm: true,
        website: "",
      },
    });
    assert.equal(acSaved.status, 201, JSON.stringify(acSaved.body));
    assert.match(acSaved.body.folio, /^IAC-/);
  }
  assert.deepEqual(
    {
      general: await count("fleet_units"),
      ac: await count("ac_fleet_units"),
      users: await count("users"),
    },
    before,
  );
  // Existing report QR policies for other fleets are untouched.
  const other = h.units[0].qr.token;
  assert.equal((await load(other)).status, 404);
  assert.equal((await load(other, true)).body.reportOptions.general, false);
  const forged = await h.call("/api/public/report-qr/" + other, {
    user: null,
    method: "POST",
    body: body((await load(units[0].token)).body.formToken),
  });
  assert.equal(forged.status, 404);
  const form = await load(units[0].token);
  assert.equal(
    (
      await h.call("/api/public/report-qr/" + units[1].token, {
        user: null,
        method: "POST",
        body: body(form.body.formToken),
      })
    ).status,
    409,
  );
  // Actual registration later links the pending report through the existing fleet workflow.
  const created = await h.call("/api/fleet/units", {
    method: "POST",
    body: { empresa: "ANS", numeroEconomico: "990", nombreFlota: "ANS" },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.ok(
    (
      await h.db.query(
        "SELECT fleet_unit_id FROM garantias WHERE empresa='ANS' AND numero_economico='990'",
      )
    ).rows[0].fleet_unit_id,
  );
  // Old printed URL stays valid; a deliberate replacement invalidates its token.
  const replaced = await h.call(
    "/api/ac/fleet/units/" + units[0].id + "/qr/replace",
    {
      method: "POST",
      body: { generation: units[0].generation, reason: "Etiqueta perdida" },
    },
  );
  assert.equal(replaced.status, 200);
  assert.equal(replaced.body.dual, true);
  assert.equal((await load(units[0].token)).status, 404);
  assert.equal((await load(units[0].token, true)).status, 404);
  assert.equal((await load(replaced.body.token)).status, 200);
  await h.db.query("UPDATE ac_fleet_units SET active=FALSE WHERE id=$1", [
    units[1].id,
  ]);
  assert.equal((await load(units[1].token)).status, 404);
  assert.equal((await load(units[1].token, true)).status, 404);
});
