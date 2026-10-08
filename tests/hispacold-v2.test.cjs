const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const catalog = require("../modules/hispacold/catalog");
function data(type = "preventivo", extra = {}) {
  return {
    type,
    status: "completado",
    company: "Empresa calendario",
    unit: "10",
    serviceDate: "2026-01-01",
    interval: "mensual",
    technician: "Técnico",
    diagnosis: "Filtro saturado",
    workDone: "Limpieza y cambio",
    finalTest: "Comprobación final",
    result: "operativo",
    eventKind: type === "express" ? "urgencia" : "",
    eventLocation: type === "express" ? "Base" : "",
    symptoms: type === "express" ? "Evento en ruta" : "",
    checklist: catalog.templates
      .find((t) => t.id === type)
      .checklist.map((c) => ({ id: c.id, outcome: "bien", action: "V" })),
    ...extra,
  };
}
test("Hispacold 2: express, seguimiento, historial y compatibilidad", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const req = h.request;
  const save = async (d) => {
    const r = await req("/services", { method: "POST", body: { data: d } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  await t.test(
    "Express tiene tres controles y exige evento, ubicación y motivo al cierre",
    async () => {
      assert.equal(
        catalog.templates.find((t) => t.id === "express").checklist.length,
        3,
      );
      const d = data("express");
      for (const field of ["eventKind", "eventLocation", "symptoms"]) {
        assert.equal(
          (
            await req("/services", {
              method: "POST",
              body: { data: { ...d, [field]: "" } },
            })
          ).status,
          400,
        );
      }
      assert.equal((await save(d)).type, "express");
    },
  );
  await t.test(
    "Idempotencia impide duplicar una orden por reintento de conexión",
    async () => {
      const body = {
        data: data("revision", { status: "borrador" }),
        clientKey: "draft-retry-123",
      };
      const first = await req("/services", { method: "POST", body });
      const second = await req("/services", { method: "POST", body });
      assert.equal(first.status, 201);
      assert.equal(second.status, 200);
      assert.equal(second.body.replayed, true);
      assert.equal(second.body.id, first.body.id);
      const events = await req("/services/" + first.body.id);
      assert.equal(events.body.events.length, 1);
    },
  );
  await t.test(
    "Un express sin próxima fecha no borra el mantenimiento pendiente",
    async () => {
      await save(
        data("preventivo", {
          company: "Flota A",
          unit: "1",
          nextDate: "2026-02-01",
        }),
      );
      await save(
        data("express", {
          company: "Flota A",
          unit: "1",
          serviceDate: "2026-09-01",
        }),
      );
      const r = await req(
        "/calendar?today=2026-10-07&from=2026-10-01&to=2026-10-31&bucket=overdue",
      );
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(
        r.body.items.find((x) => x.company === "Flota A").nextDate,
        "2026-02-01",
      );
    },
  );
  await t.test(
    "Preventivo posterior reemplaza vencimiento anterior por unidad",
    async () => {
      await save(
        data("preventivo", {
          company: "Flota A",
          unit: "1",
          serviceDate: "2026-10-01",
          nextDate: "2026-11-01",
        }),
      );
      const r = await req(
        "/calendar?today=2026-10-07&from=2026-10-01&to=2026-10-31&bucket=overdue",
      );
      assert.equal(
        r.body.items.some((x) => x.company === "Flota A"),
        false,
      );
      const due = await req(
        "/calendar?today=2026-10-07&from=2026-11-01&to=2026-11-30&bucket=month",
      );
      assert.equal(due.status, 200, JSON.stringify(due.body));
      assert.equal(
        due.body.items.find((x) => x.company === "Flota A").nextDate,
        "2026-11-01",
      );
    },
  );
  await t.test(
    "Borradores y cancelaciones no sustituyen fechas vigentes",
    async () => {
      await save(
        data("preventivo", {
          company: "Flota A",
          unit: "1",
          serviceDate: "2026-10-06",
          status: "borrador",
          nextDate: "2027-01-01",
        }),
      );
      await save(
        data("preventivo", {
          company: "Flota A",
          unit: "1",
          serviceDate: "2026-10-07",
          status: "cancelado",
          cancelReason: "Duplicada",
          nextDate: "2028-01-01",
        }),
      );
      const r = await req("/history?company=Flota%20A&unit=1");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.next[0].nextDate, "2026-11-01");
      assert.equal(r.body.summary.total, 5);
    },
  );
  await t.test(
    "Un preventivo nuevo sin próxima fecha retira la anterior",
    async () => {
      await save(
        data("preventivo", {
          company: "Flota A",
          unit: "1",
          serviceDate: "2026-10-08",
        }),
      );
      const r = await req("/history?company=Flota%20A&unit=1");
      assert.equal(r.body.next.length, 0);
    },
  );
  await t.test(
    "Calendario por semana, mes y día usa solamente fecha vigente",
    async () => {
      await save(
        data("preventivo", {
          company: "Flota B",
          unit: "1",
          serviceDate: "2026-10-01",
          nextDate: "2026-10-10",
        }),
      );
      await save(
        data("preventivo", {
          company: "Flota B",
          unit: "2",
          serviceDate: "2026-10-01",
          nextDate: "2026-10-25",
        }),
      );
      for (const bucket of ["week", "month", "all"]) {
        const r = await req(
          "/calendar?today=2026-10-07&from=2026-10-01&to=2026-10-31&bucket=" +
            bucket,
        );
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.summary.week, 1);
        assert.equal(r.body.summary.month, 2);
      }
      const day = await req(
        "/calendar?today=2026-10-07&from=2026-10-01&to=2026-10-31&bucket=all&day=2026-10-25",
      );
      assert.equal(day.body.items.length, 1);
      assert.equal(day.body.items[0].unit, "2");
    },
  );
  await t.test(
    "Historial separa empresas, incluye repetición de síntoma y excluye fotos",
    async () => {
      for (let i = 0; i < 2; i++)
        await save(
          data("revision", {
            company: "Flota C",
            unit: "X",
            serviceDate: "2026-10-0" + (i + 1),
            symptomCode: "enfria_poco",
            parts: [
              {
                kind: "refaccion",
                description: "Filtro",
                quantity: 1,
                unitPrice: 10,
              },
              {
                kind: "mano_obra",
                description: "Instalación",
                quantity: 1,
                unitPrice: 20,
              },
            ],
            evidence: [
              {
                data: "data:image/png;base64,aGVsbG8=",
                phase: "antes",
                checkId: "recepcion",
              },
            ],
          }),
        );
      const r = await req("/history?company=Flota%20C&unit=X");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.summary.total, 2);
      assert.equal(Number(r.body.summary.total_cost), 60);
      assert.equal(r.body.recurring[0].total, 2);
      assert.equal(r.body.parts.length, 2);
      assert.equal(r.body.items[0].data.evidence, undefined);
      assert.equal(
        (await req("/history?company=Flota%20C&unit=otra")).body.summary.total,
        0,
      );
    },
  );
  await t.test(
    "Pendientes no autorizados bloquean entrega operativa y preservan decisión",
    async () => {
      const d = data("menor", {
        findings: [
          {
            description: "Cambio de motor",
            decision: "no_autorizado",
            notes: "Cliente solicita cotización",
          },
        ],
      });
      assert.equal(
        (await req("/services", { method: "POST", body: { data: d } })).status,
        400,
      );
      const r = await save({
        ...d,
        result: "con_observaciones",
        recommendations: "Regresar para sustituir motor.",
      });
      assert.equal(r.data.findings[0].decision, "no_autorizado");
      const noAuthor = {
        ...d,
        findings: [{ description: "Cambio", decision: "realizado" }],
      };
      assert.equal(
        (await req("/services", { method: "POST", body: { data: noAuthor } }))
          .status,
        400,
      );
    },
  );
  await t.test(
    "Fotos conservan fase, componente y vínculo al checklist",
    async () => {
      const d = data("express", {
        evidence: [
          {
            name: "Foto",
            data: "data:image/png;base64,aGVsbG8=",
            phase: "despues",
            component: "compresor",
            checkId: "exp-prueba",
          },
        ],
      });
      const r = await save(d);
      assert.equal(r.data.evidence[0].phase, "despues");
      assert.equal(r.data.evidence[0].checkId, "exp-prueba");
      assert.equal(
        (
          await req("/services", {
            method: "POST",
            body: {
              data: {
                ...d,
                evidence: [{ ...d.evidence[0], checkId: "b2-1-1" }],
              },
            },
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "Orden de origen validada; eventos con fechas imposibles rechazados",
    async () => {
      const source = await save(data("express"));
      const next = await save(data("preventivo", { sourceOrderId: source.id }));
      assert.equal(next.data.sourceOrderId, source.id);
      assert.equal(
        (
          await req("/services", {
            method: "POST",
            body: { data: data("express", { sourceOrderId: "no-existe" }) },
          })
        ).status,
        400,
      );
      for (const reportedAt of ["2026-02-30T10:00", "2026-01-01T25:00"])
        assert.equal(
          (
            await req("/services", {
              method: "POST",
              body: { data: data("express", { reportedAt }) },
            })
          ).status,
          400,
        );
    },
  );
  await t.test("Rutas nuevas exigen admin activo", async () => {
    for (const route of ["/calendar", "/history"]) {
      assert.equal((await req(route, { user: null })).status, 401);
      assert.equal((await req(route, { user: "operator" })).status, 403);
    }
  });
});
test("Migración aditiva conserva un expediente de la primera versión", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  await h.db.exec(
    `CREATE TABLE hc_services(id TEXT PRIMARY KEY,number BIGSERIAL UNIQUE,type TEXT NOT NULL,status TEXT NOT NULL,company TEXT NOT NULL,unit TEXT NOT NULL,service_date DATE NOT NULL,next_date DATE,payload JSONB NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL,updated_by TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`,
  );
  const oldPayload = {
    ...data("revision"),
    findings: undefined,
    eventKind: undefined,
    eventLocation: undefined,
    symptoms: "Expediente anterior",
    evidence: [],
    parts: [],
    measurements: [],
    templateVersion: 1,
    total: 0,
  };
  await h.db.query(
    "INSERT INTO hc_services(id,type,status,company,unit,service_date,payload,created_by,updated_by) VALUES('v1-order','revision','completado','Empresa calendario','10','2026-01-01',$1,'admin','admin')",
    [JSON.stringify(oldPayload)],
  );
  const r = await h.request("/services/v1-order");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.symptoms, "Expediente anterior");
  assert.equal(r.body.version, 1);
  assert.equal(r.body.folio, "HC-000001");
  const cols = await h.db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='hc_services' AND column_name='client_key'",
  );
  assert.equal(cols.rows.length, 1);
  const count = await h.db.query("SELECT COUNT(*)::int n FROM hc_services");
  assert.equal(count.rows[0].n, 1);
});
