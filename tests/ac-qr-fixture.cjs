const { harness } = require("./harness.cjs");
const assert = require("node:assert/strict");
async function setup() {
  const h = await harness();
  const call = async (path, { user = "admin", method = "GET", body } = {}) => {
    const r = await fetch(h.url + "/api/ac" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(user
          ? {
              Authorization:
                "Bearer " +
                h.token(user, user === "admin" ? "admin" : "supervisor_ac"),
            }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: await r.json(), headers: r.headers };
  };
  await call("/me");
  await h.db.query(
    "INSERT INTO users(id,nombre,role,activo,empresa) VALUES('hispa','Supervisor Hispacold','supervisor_ac',true,'Hispacold'),('eber','Supervisor Eberspächer','supervisor_ac',true,'Eberspächer')",
  );
  const company = await call("/fleet/companies", {
    method: "POST",
    body: { name: "Transportes QR", region: "Pacífico" },
  });
  assert.equal(company.status, 201, JSON.stringify(company));
  const ids = [];
  for (const [unit, brand] of [
    ["306", "hispacold"],
    ["307", "eberspaecher"],
  ]) {
    const r = await call("/fleet/units", {
      method: "POST",
      body: {
        companyId: company.body.id,
        unit,
        brand,
        model: "i8",
        acModel: "Equipo prueba",
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r));
    ids.push(r.body.ids[0]);
  }
  const order = await h.request("/services", {
    method: "POST",
    body: {
      data: {
        formVersion: 3,
        brand: "hispacold",
        attention: "normal",
        type: "menor",
        status: "completado",
        company: "Transportes QR",
        unit: "306",
        serviceDate: "2026-10-22",
        symptoms: "Falla de ventilación",
        technician: "Técnico",
        workDone: "Ajuste del conector",
        finalTest: "Ventilación verificada",
        result: "operativo",
      },
    },
  });
  assert.equal(order.status, 201, JSON.stringify(order));
  return { h, call, ids, order: order.body };
}
module.exports = { setup };
