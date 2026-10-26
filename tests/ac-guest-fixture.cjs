const { setup: base } = require("./reports-workspace-harness.cjs");
const jwt = require("jsonwebtoken");
const assert = require("node:assert/strict");
async function setup() {
  const h = await base();
  const token = (user) =>
    ["hispa", "eber", "fleet", "foreign"].includes(user)
      ? jwt.sign({ id: user, role: "supervisor_ac" }, "reports-test")
      : h.token(user);
  const call = async (route, { user = "admin", method = "GET", body } = {}) => {
    const r = await fetch(h.url + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(user ? { Authorization: "Bearer " + token(user) } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: await r.json(), headers: r.headers };
  };
  assert.equal((await call("/api/ac/me")).status, 200);
  for (const [id, brand] of [
    ["hispa", "Hispacold"],
    ["eber", "Eberspächer"],
    ["fleet", "Hispacold"],
    ["foreign", "Hispacold"],
  ])
    await h.db.query(
      "INSERT INTO users(id,nombre,email,password_hash,role,empresa) VALUES($1,$1,$2,'test','supervisor_ac',$3)",
      [id, id + "@test.local", brand],
    );
  const companies = [];
  for (const name of ["Transportes QR", "Otra empresa QR"]) {
    const c = await call("/api/ac/fleet/companies", {
      method: "POST",
      body: { name, region: "Pacífico" },
    });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    companies.push(c.body);
  }
  for (const [user, index] of [
    ["fleet", 0],
    ["foreign", 1],
  ])
    await h.db.query(
      "INSERT INTO ac_supervisor_access(user_id,scope_type,company_id) VALUES($1,'fleet',$2)",
      [user, companies[index].id],
    );
  const units = [];
  for (const [unit, brand, company] of [
    ["306", "hispacold", 0],
    ["307", "eberspaecher", 0],
    ["306", "hispacold", 1],
  ]) {
    const u = await call("/api/ac/fleet/units", {
      method: "POST",
      body: {
        companyId: companies[company].id,
        unit,
        brand,
        model: "i8",
        acModel: "Equipo prueba",
      },
    });
    assert.equal(u.status, 201, JSON.stringify(u.body));
    const id = u.body.ids[0],
      qr = await call("/api/ac/fleet/units/" + id + "/qr");
    units.push({
      id,
      unit,
      brand,
      companyId: companies[company].id,
      qr: qr.body,
    });
  }
  return { ...h, token, call, units, companies };
}
module.exports = { setup };
