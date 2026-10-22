const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validate } = require("../modules/hispacold");
const catalog = require("../modules/hispacold/catalog");
const { harness } = require("./harness.cjs");
const counts = {
  hispacold: {
    mensual: 4,
    trimestral: 7,
    semestral: 9,
    anual: 14,
    bianual: 15,
  },
  eberspaecher: {
    semanal: 2,
    mensual: 5,
    trimestral: 9,
    semestral: 13,
    anual: 19,
  },
};
const base = (brand = "hispacold", interval = "mensual") => ({
  formVersion: 3,
  brand,
  type: "preventivo",
  attention: "normal",
  status: "borrador",
  company: "Pruebas",
  unit: "01",
  serviceDate: "2026-10-21",
  symptoms: "Mantenimiento programado",
  interval,
  maintenancePlan: catalog.forBrand(brand).periodicPlan.id,
});
for (const [brand, periods] of Object.entries(counts))
  for (const [interval, count] of Object.entries(periods))
    test(`${brand} ${interval}: alcance y cierre exclusivo del periodo`, () => {
      const d = validate(base(brand, interval));
      assert.equal(d.checklist.length, count);
      assert.equal(
        d.checklist.every((c) => c.outcome === "pendiente" && !c.action),
        true,
      );
      assert.equal(new Set(d.checklist.map((c) => c.id)).size, count);
      assert.equal(
        d.checklist.every(
          (c) =>
            c.source.page ===
            (brand === "hispacold"
              ? Object.keys(periods).indexOf(interval) + 2
              : 15),
        ),
        true,
      );
      const close = {
        ...d,
        status: "completado",
        technician: "Técnico",
        workDone: "Actividades realizadas conforme al plan.",
        finalTest: "Funcionamiento verificado.",
        result: "operativo",
        checklist: d.checklist.map((c) => ({ ...c, outcome: "bien" })),
      };
      assert.equal(validate(close).status, "completado");
      assert.throws(
        () => validate({ ...close, checklist: close.checklist.slice(1) }),
        /checklist/,
      );
      assert.throws(
        () =>
          validate({
            ...d,
            checklist: [{ id: "fuera-del-periodo", outcome: "bien" }],
          }),
        /Punto/,
      );
    });
test("Hispacold mensual no incorpora sustituciones anuales; Eberspächer B no arrastra A", () => {
  const h = validate(base()).checklist.map((c) => c.id);
  assert.deepEqual(h, [
    "hp-general",
    "hp-bandeja",
    "hp-motor-turbinas",
    "hp-componentes",
  ]);
  const e = validate(base("eberspaecher")).checklist.map((c) => c.id);
  assert.deepEqual(e, [
    "ep-carga",
    "ep-bandas",
    "ep-aceite",
    "ep-humedad",
    "ep-fugas",
  ]);
  assert.throws(
    () =>
      validate({
        ...base("eberspaecher"),
        maintenancePlan: base().maintenancePlan,
      }),
    /Plan/,
  );
  assert.throws(
    () => validate(base("eberspaecher", "bianual")),
    /periodicidad/,
  );
});
test("Persistencia, protección de registros anteriores y prohibición de degradar el plan", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const post = (data) =>
    h.request("/services", { method: "POST", body: { data } });
  const put = (r, data) =>
    h.request("/services/" + r.body.id, {
      method: "PUT",
      body: { data, version: r.body.version },
    });
  const legacy = { ...base(), maintenancePlan: undefined };
  let old = await post(legacy);
  assert.equal(old.status, 201);
  assert.ok(old.body.data.checklist.length > 30);
  let upgraded = await put(old, base());
  assert.equal(upgraded.status, 200, JSON.stringify(upgraded.body));
  assert.equal(upgraded.body.data.checklist.length, 4);
  const down = await put(upgraded, legacy);
  assert.equal(down.status, 400);
  old = await post({ ...legacy, unit: "02" });
  const data = old.body.data;
  data.checklist[0].outcome = "bien";
  data.checklist[0].notes = "Revisión histórica";
  old = await put(old, data);
  assert.equal(old.status, 200);
  const reject = await put(old, { ...base(), unit: "02" });
  assert.equal(reject.status, 400);
  const read = await h.request("/services/" + old.body.id);
  assert.equal(read.body.data.checklist[0].notes, "Revisión histórica");
});
