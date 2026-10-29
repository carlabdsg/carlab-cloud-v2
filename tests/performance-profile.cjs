// Repeatable, isolated profile; never connects to production.
const fs = require("node:fs"),
  path = require("node:path");
const { setup } = require("./ac-guest-fixture.cjs");
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
(async () => {
  const h = await setup();
  let browser;
  const output = process.env.PROFILE_OUTPUT || "/tmp/carlab-performance.json";
  try {
    const picture =
      "data:image/jpeg;base64," +
      Buffer.concat([
        fs.readFileSync(path.join(__dirname, "fixtures/guest-photo.jpg")),
        Buffer.alloc(90000, 0),
      ]).toString("base64");
    for (let i = 0; i < 20; i++) {
      const payload = {
        brand: "hispacold",
        attention: "normal",
        technician: "Técnico de prueba",
        symptoms: "Revisión de climatización",
        workDone: "Trabajo documentado",
        finalTest: "Verificado",
        result: "operativo",
        parts: [],
        findings: [],
        checklist: [],
        total: 0,
        evidence: [
          { data: picture, caption: "Antes" },
          { data: picture, caption: "Después" },
        ],
        signatures: { technician: picture, client: picture },
      };
      await h.db.query(
        "INSERT INTO hc_services(id,type,status,company,unit,service_date,next_date,payload,created_by,updated_by) VALUES($1,'preventivo','completado','Transportes QR','306',CURRENT_DATE,CURRENT_DATE+10,$2::jsonb,'admin','admin')",
        ["perf-order-" + i, JSON.stringify(payload)],
      );
      await h.db.query(
        "INSERT INTO ac_requests(id,client_key,kind,brand,operator_company,unit,payload,created_by,updated_by) VALUES($1,$1,'service','hispacold','Transportes QR','306',$2::jsonb,'admin','admin')",
        [
          "perf-request-" + i,
          JSON.stringify({
            description: "Revisar sistema",
            priority: "normal",
            serviceType: "preventivo",
            contact: "Contacto de prueba",
            evidence: payload.evidence,
          }),
        ],
      );
    }
    const query = h.pool.query;
    let dbMetrics = { queries: 0, returnedBytes: 0 };
    h.pool.query = async (...args) => {
      const result = await query(...args);
      dbMetrics.queries++;
      dbMetrics.returnedBytes += Buffer.byteLength(
        JSON.stringify(result.rows || []),
      );
      return result;
    };
    browser = await pw.chromium.launch({ channel: "chrome", headless: true });
    const result = {
      fixture:
        "20 órdenes AC con 4 imágenes y 20 solicitudes con 2 imágenes de 93,909 bytes cada una; 14 unidades generales y 8 reportes",
      pages: {},
      endpoints: {},
    };
    for (const [label, user, url, ready] of [
      ["login", null, "/", "#loginForm"],
      ["reportsAdmin", "admin", "/", ".rw-report-row"],
      ["acAdmin", "admin", "/hispacold.html", ".acp-kpis"],
      ["acSupervisor", "hispa", "/ac-supervisor.html", ".acp-kpis"],
    ]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      if (user)
        await context.addInitScript(
          (token) => localStorage.setItem("carlabToken", token),
          h.token(user),
        );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      dbMetrics = { queries: 0, returnedBytes: 0 };
      await page.goto(h.url + url);
      await page.locator(ready).first().waitFor();
      await page.waitForLoadState("networkidle");
      const resources = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter((r) => r.name.startsWith(location.origin))
          .map((r) => ({
            path: new URL(r.name).pathname + new URL(r.name).search,
            decoded: r.decodedBodySize,
            encoded: r.encodedBodySize,
          })),
      );
      result.pages[label] = {
        db: { ...dbMetrics },
        apiRequests: resources
          .filter((r) => r.path.startsWith("/api/"))
          .map((r) => r.path),
        scriptBytes: resources
          .filter((r) => /\.js(\?|$)/.test(r.path))
          .reduce((s, r) => s + r.decoded, 0),
        resources,
        errors,
      };
      await context.close();
    }
    for (const route of [
      "/api/ac/orders",
      "/api/ac/requests?pending=true",
      "/api/ac/fleet/units",
      "/api/fleet/units",
    ]) {
      dbMetrics = { queries: 0, returnedBytes: 0 };
      const response = await h.call(route);
      result.endpoints[route] = {
        status: response.status,
        bytes: Buffer.byteLength(JSON.stringify(response.body)),
        db: { ...dbMetrics },
      };
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify(
        {
          output,
          pages: Object.fromEntries(
            Object.entries(result.pages).map(([k, v]) => [
              k,
              {
                db: v.db,
                apiRequests: v.apiRequests.length,
                scriptBytes: v.scriptBytes,
                errors: v.errors,
              },
            ]),
          ),
          endpoints: result.endpoints,
        },
        null,
        2,
      ),
    );
  } finally {
    if (browser) await browser.close();
    await h.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
