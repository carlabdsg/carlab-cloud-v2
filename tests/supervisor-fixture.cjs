const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { setup: base } = require("./ac-guest-fixture.cjs");
const pdf = fs.readFileSync(
  path.join(__dirname, "fixtures/quotation-example.pdf"),
);
async function setup() {
  const h = await base();
  try {
    const company = await h.call("/api/ac/fleet/companies", {
      method: "POST",
      body: { name: "ANS", region: "Noroeste" },
    });
    assert.equal(company.status, 201, JSON.stringify(company.body));
    const ownUnits = [],
      incidents = [];
    for (const [unit, brand] of [
      ["321", "hispacold"],
      ["322", "eberspaecher"],
    ]) {
      const r = await h.call("/api/ac/fleet/units", {
        method: "POST",
        body: { companyId: company.body.id, unit, brand },
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      ownUnits.push(r.body.ids[0]);
    }
    for (const unitId of [...ownUnits, h.units[0].id]) {
      const r = await h.call("/api/ac/incidents", {
        method: "POST",
        body: {
          clientKey: crypto.randomUUID(),
          unitId,
          category: "no_enfria",
          equipmentState: "parcial",
          description: "Enfriamiento insuficiente durante operación.",
          occurredOn: "2026-10-30",
          priority: "normal",
          evidence: [],
        },
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      incidents.push(r.body);
    }
    const quotes = [];
    for (const i of [1, 2]) {
      const r = await h.call("/api/report-quotes", {
        method: "POST",
        body: {
          reportId: "report-" + i,
          company: "ANS",
          unit: String(320 + i),
          expectedRevision: 0,
          fileName: "Cotizacion.pdf",
          pdfBase64: pdf.toString("base64"),
        },
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      quotes.push(r.body);
    }
    const service = await h.call("/api/ac/requests", {
      method: "POST",
      body: {
        clientKey: crypto.randomUUID(),
        kind: "service",
        brand: "hispacold",
        company: "ANS",
        unit: "321",
        description: "Revisión del sistema de aire acondicionado.",
        priority: "normal",
      },
    });
    assert.equal(service.status, 201, JSON.stringify(service.body));
    const orders = [];
    for (const companyName of ["ANS", "Transportes QR"]) {
      const r = await h.call("/api/hispacold/services", {
        method: "POST",
        body: {
          data: {
            formVersion: 3,
            brand: "hispacold",
            attention: "normal",
            type: "menor",
            status: "completado",
            company: companyName,
            unit: companyName === "ANS" ? "321" : "306",
            serviceDate: "2026-10-30",
            symptoms: "Falla de ventilación",
            technician: "Técnico de prueba",
            workDone: "Ajuste de conexiones",
            finalTest: "Ventilación verificada",
            result: "operativo",
          },
        },
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      orders.push(r.body);
    }
    return {
      ...h,
      ownCompany: company.body,
      ownUnits,
      incidents,
      quotes,
      service: service.body,
      orders,
      pdf,
    };
  } catch (e) {
    await h.close();
    throw e;
  }
}
module.exports = { setup };
