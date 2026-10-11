const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const { harness } = require("./harness.cjs");
const { register } = require("../modules/hispacold");
const catalog = require("../modules/hispacold/catalog");

function draft(extra = {}) {
  return {
    formVersion: 3,
    brand: "hispacold",
    attention: "normal",
    type: "menor",
    status: "borrador",
    company: "Flota nueva",
    unit: "42",
    serviceDate: "2026-10-11",
    symptoms: "Ventilador no funciona",
    ...extra,
  };
}
function complete(extra = {}) {
  return draft({
    status: "completado",
    technician: "Técnico de prueba",
    workDone: "Se sustituyó el relevador averiado",
    finalTest: "Se verificó arranque y funcionamiento del ventilador",
    result: "operativo",
    ...extra,
  });
}
function checklist(brand, type) {
  return catalog
    .forBrand(brand)
    .templateFor(type, { formVersion: 3, interval: "mensual" })
    .checklist.map((c) => ({ id: c.id, outcome: "bien", action: "V" }));
}

test("Formulario 3: captura proporcional al servicio y datos propios de cada marca", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const save = (data, extra = {}) =>
    h.request("/services", { method: "POST", body: { data, ...extra } });

  await t.test(
    "Catálogo expone ambas marcas y biblioteca sin sustituir originales",
    async () => {
      const r = await h.request("/catalog");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.brands.hispacold, "Hispacold");
      assert.equal(r.body.brands.eberspaecher, "Eberspächer");
      assert.equal(catalog.manuals.length, 34);
      assert.ok(r.body.brandCatalogs.eberspaecher.templates.length >= 4);
      assert.ok(r.body.manuals.length > 34);
      for (const brand of Object.keys(r.body.brands)) {
        assert.ok(r.body.brandCatalogs[brand].manuals.length);
        assert.ok(
          r.body.brandCatalogs[brand].manuals.every(
            (m) => typeof m.available === "boolean",
          ),
        );
      }
    },
  );

  await t.test(
    "Apertura sólo exige unidad, empresa, fecha y motivo; la periodicidad puede esperar",
    async () => {
      for (const brand of ["hispacold", "eberspaecher"]) {
        for (const type of ["revision", "preventivo", "menor", "mayor"]) {
          const r = await save(draft({ brand, type }));
          assert.equal(r.status, 201, JSON.stringify(r.body));
          assert.equal(r.body.data.formVersion, 3);
          assert.equal(r.body.data.brand, brand);
          assert.equal(r.body.data.attention, "normal");
        }
      }
      for (const field of ["company", "unit", "serviceDate", "symptoms"])
        assert.equal((await save(draft({ [field]: "" }))).status, 400, field);
      for (const extra of [
        { brand: "inexistente" },
        { attention: "inexistente" },
        { type: "express" },
        { formVersion: "3" },
      ])
        assert.equal((await save(draft(extra))).status, 400);
    },
  );

  await t.test(
    "Reparación sencilla cierra sin diagnóstico separado, firmas ni checklist completo",
    async () => {
      const r = await save(
        complete({
          brand: "eberspaecher",
          attention: "express",
          eventKind: "urgencia",
        }),
      );
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.data.diagnosis, "");
      assert.equal(r.body.data.technicianSignature, "");
      assert.ok(r.body.data.checklist.some((c) => c.outcome === "pendiente"));
      for (const field of ["technician", "workDone", "finalTest", "result"])
        assert.equal(
          (await save(complete({ [field]: "" }))).status,
          400,
          field,
        );
      assert.equal(
        (await save(complete({ attention: "express" }))).status,
        400,
      );
      assert.equal((await save(complete({ type: "revision" }))).status, 400);
      assert.equal(
        (
          await save(
            complete({
              type: "revision",
              diagnosis: "Falla localizada en el relevador",
            }),
          )
        ).status,
        201,
      );
    },
  );

  await t.test(
    "Una revisión seleccionada con hallazgo aún impide entregar como operativo",
    async () => {
      const id = catalog
        .forBrand("eberspaecher")
        .templates.find((x) => x.id === "menor").checklist[0].id;
      const d = complete({
        brand: "eberspaecher",
        checklist: [
          { id, outcome: "hallazgo", notes: "Se requiere seguimiento" },
        ],
      });
      assert.equal((await save(d)).status, 400);
      assert.equal(
        (
          await save({
            ...d,
            result: "con_observaciones",
            recommendations: "Agendar reparación pendiente",
          })
        ).status,
        201,
      );
    },
  );

  await t.test(
    "Preventivo y reparación mayor conservan checklist y requisitos técnicos",
    async () => {
      for (const brand of ["hispacold", "eberspaecher"]) {
        const preventive = complete({
          brand,
          type: "preventivo",
          interval: "mensual",
        });
        assert.equal((await save(preventive)).status, 400);
        assert.equal(
          (
            await save({
              ...preventive,
              checklist: checklist(brand, "preventivo"),
            })
          ).status,
          201,
        );
        assert.equal(
          (
            await save({
              ...preventive,
              interval: "",
              checklist: checklist(brand, "preventivo"),
            })
          ).status,
          400,
        );
        const major = complete({
          brand,
          type: "mayor",
          diagnosis: "Se determinó daño mayor",
          checklist: checklist(brand, "mayor"),
          authorization: "Supervisor autoriza",
          technicalReference: "Manual del equipo identificado",
        });
        assert.equal((await save(major)).status, 201);
        for (const field of [
          "authorization",
          "technicalReference",
          "diagnosis",
        ])
          assert.equal(
            (await save({ ...major, [field]: "" })).status,
            400,
            field,
          );
      }
      const circuit = complete({
        circuitOpened: true,
        refrigerant: "Según placa del equipo",
        chargedKg: 1,
        technicalReference: "Procedimiento del equipo",
        refrigerantNotes: "Prueba documentada",
      });
      assert.equal((await save(circuit)).status, 201);
      for (const field of [
        "refrigerant",
        "chargedKg",
        "technicalReference",
        "refrigerantNotes",
      ])
        assert.equal(
          (await save({ ...circuit, [field]: "" })).status,
          400,
          field,
        );
    },
  );

  await t.test(
    "No mezcla controles Hispacold con Eberspächer ni permite degradar expedientes",
    async () => {
      const hcOnly = catalog.templates
        .find((x) => x.id === "menor")
        .checklist.find(
          (c) =>
            !catalog
              .forBrand("eberspaecher")
              .templates.find((x) => x.id === "menor")
              .checklist.some((e) => e.id === c.id),
        );
      assert.ok(hcOnly);
      assert.equal(
        (
          await save(
            draft({
              brand: "eberspaecher",
              checklist: [{ id: hcOnly.id, outcome: "bien" }],
            }),
          )
        ).status,
        400,
      );
      const old = {
        ...draft(),
        formVersion: undefined,
        brand: undefined,
        attention: undefined,
      };
      const oldSaved = await save(old);
      assert.equal(oldSaved.status, 201);
      const upgrade = await h.request("/services/" + oldSaved.body.id, {
        method: "PUT",
        body: { version: 1, data: draft() },
      });
      assert.equal(upgrade.status, 400);
      const current = await save(draft());
      for (const change of [
        { brand: "eberspaecher" },
        { formVersion: undefined },
      ]) {
        const r = await h.request("/services/" + current.body.id, {
          method: "PUT",
          body: { version: 1, data: { ...draft(), ...change } },
        });
        assert.equal(r.status, 400);
      }
      assert.equal(
        (await save({ ...complete(), formVersion: undefined })).status,
        400,
        "El formulario antiguo sigue exigiendo diagnóstico y checklist",
      );
    },
  );
});

test("Papelera: eliminación reversible, permisos, concurrencia y seguimiento", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const save = async (data, key) => {
    const r = await h.request("/services", {
      method: "POST",
      body: { data, clientKey: key },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const order = await save(
    complete({
      company: "Papelera",
      unit: "1",
      nextDate: "2026-10-20",
      symptomCode: "enfria_poco",
      parts: [{ description: "Relevador", quantity: 1, unitPrice: 120 }],
    }),
    "trash-retry",
  );
  const route = "/services/" + order.id;
  const del = (body = { version: 1, reason: "Orden duplicada" }, extra = {}) =>
    h.request(route, { method: "DELETE", body, ...extra });

  await t.test(
    "Sólo admin activo puede eliminar o restaurar con versión vigente y motivo",
    async () => {
      for (const user of [null, "operator", "inactive"]) {
        assert.equal((await del(undefined, { user })).status, user ? 403 : 401);
        assert.equal(
          (
            await h.request(route + "/restore", {
              method: "POST",
              body: { version: 1 },
              user,
            })
          ).status,
          user ? 403 : 401,
        );
      }
      assert.equal((await del({ version: 1 })).status, 400);
      assert.equal(
        (await del({ version: 999, reason: "Duplicada" })).status,
        409,
      );
      assert.equal(
        (await del({ version: "1", reason: "Duplicada" })).status,
        400,
      );
      const r = await del();
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.body.deletedAt);
      assert.equal(r.body.deleteReason, "Orden duplicada");
      assert.equal(r.body.deletedBy, "admin");
      assert.equal(r.body.status, "completado");
      assert.equal(r.body.version, 2);
    },
  );

  await t.test(
    "Desaparece de listados, totales, costos, recordatorios e historial activo",
    async () => {
      const list = await h.request("/services?today=2026-10-25");
      assert.equal(list.body.items.length, 0);
      assert.equal(list.body.summary.total, 0);
      assert.equal(list.body.summary.completed, 0);
      assert.equal(list.body.summary.overdue, 0);
      const trash = await h.request("/services?deleted=true");
      assert.equal(trash.body.items.length, 1);
      assert.equal(trash.body.items[0].id, order.id);
      assert.equal(trash.body.items[0].deleteReason, "Orden duplicada");
      const history = await h.request("/history?company=Papelera&unit=1");
      assert.equal(history.body.items.length, 0);
      assert.equal(history.body.summary.total, 0);
      assert.equal(Number(history.body.summary.total_cost), 0);
      assert.equal(history.body.next.length, 0);
      assert.equal(history.body.parts.length, 0);
      const calendar = await h.request(
        "/calendar?today=2026-10-11&from=2026-10-01&to=2026-10-31",
      );
      assert.equal(calendar.body.items.length, 0);
      assert.equal(calendar.body.summary.month, 0);
      const detail = await h.request(route);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.events[0].action, "eliminacion");
      assert.equal(detail.body.events[0].details.reason, "Orden duplicada");
      assert.equal(detail.body.data.parts[0].total, 120);
    },
  );

  await t.test(
    "No se puede modificar, reabrir ni recrear por reintento una orden eliminada",
    async () => {
      const update = await h.request(route, {
        method: "PUT",
        body: {
          version: 2,
          data: draft({
            company: "Papelera",
            unit: "1",
            status: "en_proceso",
            reopenReason: "Revisión",
          }),
        },
      });
      assert.equal(update.status, 409);
      const retry = await h.request("/services", {
        method: "POST",
        body: { data: draft(), clientKey: "trash-retry" },
      });
      assert.equal(retry.status, 409);
      assert.equal(
        (await del({ version: 2, reason: "Ya eliminada" })).status,
        409,
      );
      assert.equal(
        (
          await h.request(route + "/restore", {
            method: "POST",
            body: { version: 1 },
          })
        ).status,
        409,
      );
    },
  );

  await t.test(
    "Restaurar recupera expediente y agenda, conservando autor y motivo en auditoría",
    async () => {
      const r = await h.request(route + "/restore", {
        method: "POST",
        body: { version: 2 },
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.version, 3);
      assert.equal(r.body.deletedAt, null);
      assert.equal(r.body.status, "completado");
      const detail = await h.request(route);
      assert.equal(detail.body.events.length, 3);
      assert.equal(detail.body.events[0].action, "restauracion");
      assert.equal(detail.body.events[0].details.reason, "Orden duplicada");
      assert.equal(
        (await h.request("/services?deleted=true")).body.items.length,
        0,
      );
      assert.equal(
        (await h.request("/history?company=Papelera&unit=1")).body.next[0].id,
        order.id,
      );
      assert.equal(
        (
          await h.request(route + "/restore", {
            method: "POST",
            body: { version: 3 },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await h.db.query(
            "SELECT data FROM legacy_sentinel WHERE id='unchanged'",
          )
        ).rows[0].data,
        "reportes-agenda-stock-cobranza",
      );
    },
  );
});

test("Eliminar una orden de origen no bloquea las copias ya creadas ni sus reintentos", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const origin = await h.request("/services", {
    method: "POST",
    body: { data: draft() },
  });
  assert.equal(origin.status, 201);
  const data = draft({ sourceOrderId: origin.body.id });
  const body = { data, clientKey: "clone-after-source-trash" };
  const clone = await h.request("/services", { method: "POST", body });
  assert.equal(clone.status, 201);
  const deleted = await h.request("/services/" + origin.body.id, {
    method: "DELETE",
    body: { version: 1, reason: "Origen duplicado" },
  });
  assert.equal(deleted.status, 200);
  const replay = await h.request("/services", { method: "POST", body });
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.id, clone.body.id);
  assert.equal(replay.body.replayed, true);
  const update = await h.request("/services/" + clone.body.id, {
    method: "PUT",
    body: { version: 1, data: { ...data, workDone: "Avance registrado" } },
  });
  assert.equal(update.status, 200, JSON.stringify(update.body));
  assert.equal(update.body.data.sourceOrderId, origin.body.id);
  assert.equal(update.body.version, 2);
  const freshClone = await h.request("/services", {
    method: "POST",
    body: { data },
  });
  assert.equal(freshClone.status, 400);
  const unrelated = await h.request("/services", {
    method: "POST",
    body: { data: draft() },
  });
  const changedSource = await h.request("/services/" + unrelated.body.id, {
    method: "PUT",
    body: { version: 1, data },
  });
  assert.equal(changedSource.status, 400);
});

test("Calendario y filtros distinguen marcas en la misma unidad", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  for (const brand of ["hispacold", "eberspaecher"]) {
    const data = complete({
      brand,
      type: "preventivo",
      interval: "mensual",
      nextDate: brand === "hispacold" ? "2026-11-01" : "2026-11-15",
      checklist: checklist(brand, "preventivo"),
    });
    const r = await h.request("/services", { method: "POST", body: { data } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const calendar = await h.request(
    "/calendar?today=2026-10-11&from=2026-11-01&to=2026-11-30",
  );
  assert.equal(calendar.body.items.length, 2);
  assert.deepEqual(
    new Set(calendar.body.items.map((x) => x.brand)),
    new Set(["hispacold", "eberspaecher"]),
  );
  assert.equal(
    (await h.request("/services?brand=eberspaecher")).body.items.length,
    1,
  );
  const exp = await h.request("/services", {
    method: "POST",
    body: { data: draft({ brand: "eberspaecher", attention: "express" }) },
  });
  assert.equal(exp.status, 201);
  assert.equal(
    (await h.request("/services?brand=eberspaecher&attention=express")).body
      .items.length,
    1,
  );
});

test("Importación binaria admite PDF mayor que el límite JSON, autentica y valida SHA original", async (t) => {
  // A synthetic 52 MiB PDF verifies route limits without relying on private manuals or storing a large fixture.
  const pdf = Buffer.alloc(52 * 1024 * 1024, 32);
  pdf.write("%PDF-1.4\n");
  const manual = {
    id: "test-large-pdf",
    filename: "test.pdf",
    sha256: crypto.createHash("sha256").update(pdf).digest("hex"),
  };
  const manuals = catalog.allManuals || catalog.manuals;
  manuals.push(manual);
  t.after(() => {
    manuals.splice(manuals.indexOf(manual), 1);
  });
  let savedBytes = 0;
  const pool = {
    query: async (sql, args) => {
      if (sql.startsWith("SELECT id,nombre,role FROM users"))
        return { rows: [{ id: "test", nombre: "Test", role: "admin" }] };
      if (sql.startsWith("INSERT INTO hc_manuals")) {
        savedBytes = args[3].length;
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  register(app, {
    pool,
    authRequired: (req, res, next) => {
      if (req.headers.authorization !== "Bearer local-test")
        return res.status(401).json({ error: "No autorizado" });
      req.user = { id: "test", role: "admin" };
      next();
    },
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url =
    "http://127.0.0.1:" +
    server.address().port +
    "/api/hispacold/manuals/" +
    manual.id +
    "/raw";
  let response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: "not a PDF",
  });
  assert.equal(response.status, 401);
  response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: "Bearer local-test",
      "Content-Type": "application/pdf",
    },
    body: "%PDF-wrong",
  });
  assert.equal(response.status, 400);
  assert.equal(savedBytes, 0);
  response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: "Bearer local-test",
      "Content-Type": "application/octet-stream",
    },
    body: pdf,
  });
  assert.equal(response.status, 200, await response.text());
  assert.equal(savedBytes, pdf.length);
});
