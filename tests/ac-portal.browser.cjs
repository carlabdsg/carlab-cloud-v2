const { chromium, devices } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const { setup } = require("./ac-qr-fixture.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const out = process.env.QA_OUTPUT || require("node:os").tmpdir();
fs.mkdirSync(out, { recursive: true });
(async () => {
  const { h, call } = await setup();
  let browser,
    phase = "seed";
  try {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mazatlan",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const date = (days) => {
      const d = new Date(today + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const company = (
      await call("/fleet/companies", {
        method: "POST",
        body: {
          name: "Autobuses del Pacífico",
          region: "Occidente",
          city: "Mazatlán",
        },
      })
    ).body;
    const second = (
      await call("/fleet/companies", {
        method: "POST",
        body: { name: "Transportes del Noroeste", region: "Noroeste" },
      })
    ).body;
    const ids = [];
    for (let i = 0; i < 9; i++) {
      const condition =
        i === 0
          ? "no_operativo"
          : i === 2
            ? "con_observaciones"
            : i === 3
              ? "sin_evaluar"
              : "operativo";
      const r = await call("/fleet/units", {
        method: "POST",
        body: {
          companyId: company.id,
          unit: String(325 + i),
          brand: i % 2 ? "eberspaecher" : "hispacold",
          busBrand: i % 2 ? "Volvo" : "MAN",
          model: i % 2 ? "9800" : "i8",
          base: "Mazatlán",
          manualCondition: condition,
          checkedOn: today,
          conditionNote:
            condition === "no_operativo"
              ? "Pérdida de enfriamiento reportada"
              : "Evaluación de prueba",
          initialNextDate: date(i === 1 ? -3 : i + 1),
        },
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      ids.push(r.body.ids[0]);
    }
    await call("/fleet/units", {
      method: "POST",
      body: {
        companyId: second.id,
        unit: "901",
        brand: "hispacold",
        manualCondition: "operativo",
        checkedOn: today,
        conditionNote: "Evaluado",
      },
    });
    const req = await call("/requests", {
      method: "POST",
      body: {
        clientKey: "portal-fixture-request",
        kind: "service",
        company: company.name,
        unit: "325",
        brand: "hispacold",
        description: "Revisar pérdida de enfriamiento durante el recorrido.",
        priority: "alta",
      },
    });
    await call("/requests/" + req.body.id, {
      method: "PATCH",
      body: {
        version: 1,
        status: "programada",
        scheduledDate: date(1),
        notes: "Visita programada con el equipo de servicio.",
      },
    });
    const linked = await call("/requests/" + req.body.id + "/create-order", {
      method: "POST",
      body: { version: 2, type: "menor", serviceDate: today },
    });
    assert.equal(linked.status, 201, JSON.stringify(linked.body));
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const errors = [];
    async function pageFor(id, role, opts = {}) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        ...opts,
      });
      await context.addInitScript(
        (token) => localStorage.setItem("carlabToken", token),
        h.token(id, role),
      );
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => errors.push(e.message));
      return page;
    }
    phase = "admin creates a company supervisor";
    const admin = await pageFor("admin", "admin");
    await admin.goto(h.url + "/hispacold.html");
    await admin.locator("[data-view=access]").click();
    await admin.locator("[data-ac-action=new-fleet-user]").click();
    const form = admin.locator("#ac-user-form");
    await form.locator("[name=nombre]").fill("María · Supervisión de flota");
    await form.locator("[name=email]").fill("fleet-ui@test.mx");
    await form.locator("[name=password]").fill("password123");
    assert.equal(await form.locator("[name=scopeType]").inputValue(), "fleet");
    assert.equal(await form.locator("[name=brand]").isVisible(), false);
    await form.locator("[name=companyId]").selectOption(company.id);
    await form.locator("button[type=submit]").click();
    await admin.locator("#ac-dialog").waitFor({ state: "hidden" });
    const user = (await call("/users")).body.find(
      (u) => u.email === "fleet-ui@test.mx",
    );
    assert.equal(user.scopeType, "fleet");
    assert.equal(user.companyId, company.id);
    phase = "brand dashboard and company navigation";
    const brand = await pageFor("hispa", "supervisor_ac");
    await brand.goto(h.url + "/ac-supervisor.html");
    await brand.locator(".acp-kpis").waitFor();
    assert.equal(await brand.locator(".acp-nav [data-ac-view]").count(), 4);
    assert.equal(await brand.locator("[data-ac-view=library]").count(), 0);
    await brand.screenshot({
      path: path.join(out, "inicio-supervisor-marca.png"),
      fullPage: true,
    });
    await brand.locator(".acp-nav [data-ac-view=companies]").click();
    await brand.locator("#acp-company-search").fill("Pacífico");
    assert.equal(
      await brand.locator("#acp-company-grid .acp-company").count(),
      1,
    );
    await brand.locator("#acp-company-grid .acp-company").click();
    await brand.locator(".acf-grid .acf-unit").first().waitFor();
    assert.equal(await brand.locator(".acf-grid .acf-unit").count(), 5);
    await brand.screenshot({
      path: path.join(out, "autobuses-supervisor-marca.png"),
      fullPage: true,
    });
    phase = "company dashboard and compact mobile nav";
    const fleet = await pageFor(user.id, "supervisor_ac", {
      ...devices["iPhone 13"],
    });
    await fleet.goto(h.url + "/ac-supervisor.html");
    await fleet.locator(".acp-kpis").waitFor();
    assert.equal(await fleet.locator(".acp-nav button").count(), 4);
    assert.equal(
      await fleet
        .locator(".acp-nav")
        .evaluate((e) => getComputedStyle(e).position),
      "fixed",
    );
    assert.ok(
      await fleet.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await fleet.screenshot({
      path: path.join(out, "inicio-supervisor-flota-movil.png"),
      fullPage: true,
    });
    await fleet.locator(".acp-nav [data-ac-view=companies]").click();
    await fleet.locator("#acp-company-grid .acp-company").waitFor();
    assert.equal(await fleet.locator(".acp-company").count(), 1);
    await fleet.locator(".acp-company").click();
    await fleet.locator(".acf-grid .acf-unit").first().waitFor();
    assert.equal(await fleet.locator(".acf-unit").count(), 9);
    await fleet.screenshot({
      path: path.join(out, "autobuses-supervisor-flota-movil.png"),
      fullPage: true,
    });
    phase = "prefilled request for Eberspaecher within assigned company";
    await fleet.locator('[data-af=detail][data-id="' + ids[1] + '"]').click();
    await fleet.locator("[data-af=request-service]").click();
    assert.equal(
      await fleet.locator("#ac-new-request [name=company]").inputValue(),
      company.name,
    );
    assert.equal(
      await fleet.locator("#ac-new-request [name=unit]").inputValue(),
      "326",
    );
    assert.equal(
      await fleet.locator("#ac-new-request [name=brand]").first().inputValue(),
      "eberspaecher",
    );
    assert.equal(
      await fleet.locator(".acp-form-optional").evaluate((e) => e.open),
      false,
    );
    await fleet
      .locator("#ac-new-request [name=description]")
      .fill("Solicito revisión del sistema de climatización.");
    await fleet.locator("#ac-new-request button[type=submit]").click();
    await fleet.locator("#ac-dialog").waitFor({ state: "hidden" });
    await fleet.locator(".acp-follow-grid").waitFor();
    assert.equal(await fleet.locator(".acp-follow-card").count(), 2);
    await fleet.screenshot({
      path: path.join(out, "seguimiento-supervisor-flota-movil.png"),
      fullPage: true,
    });
    phase = "linked order from same tracking card";
    await fleet
      .locator(
        '[data-ac-action=order-detail][data-id="' + linked.body.id + '"]',
      )
      .click();
    await fleet.locator(".hc-report").waitFor();
    assert.ok(
      (await fleet.locator(".hc-report").innerText()).includes(company.name),
    );
    phase = "scoped report and calendar";
    await fleet.locator(".acp-nav [data-ac-view=reports]").click();
    await fleet.locator("#acr-filters").waitFor();
    assert.equal(
      await fleet.locator("#acr-filters [name=company] option").count(),
      2,
    );
    const [csv] = await Promise.all([
      fleet.waitForEvent("download"),
      fleet.locator("[data-ar=csv]").click(),
    ]);
    const saved = path.join(out, "reporte-flota.csv");
    await csv.saveAs(saved);
    assert.ok(
      !fs.readFileSync(saved, "utf8").includes("Transportes del Noroeste"),
    );
    await fleet.locator(".acp-nav [data-ac-view=home]").click();
    await fleet.locator(".acp-kpis").waitFor();
    await fleet.locator("[data-aportal=metric][data-filter=calendar]").click();
    await fleet.locator(".acc-calendar").waitFor();
    assert.equal(
      await fleet
        .locator("[data-acc=bucket][data-bucket=overdue]")
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.ok(
      !(await fleet.locator("#hc-main").innerText()).includes("UNDEFINED"),
    );
    phase = "request chooser and manual company restriction";
    await fleet.locator(".acp-nav [data-ac-view=home]").click();
    await fleet.locator("[data-aportal=request]").click();
    await fleet
      .locator(".acp-request-choices [data-ac-action=new-service]")
      .click();
    await fleet.locator("#ac-new-request").waitFor();
    assert.equal(
      await fleet.locator("[name=company]").inputValue(),
      company.name,
    );
    assert.equal(
      await fleet.locator("[name=company]").getAttribute("readonly"),
      "",
    );
    await fleet.locator(".acp-dialog-top button").click();
    await fleet.locator("#ac-dialog").waitFor({ state: "hidden" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: admin company-profile creation, brand and company dashboards, desktop/mobile navigation, both brands within one company, prefilled requests, linked tracking, calendar, scoped CSV, no overflow or script errors.",
    );
  } catch (e) {
    console.error("PHASE:", phase);
    throw e;
  } finally {
    await browser?.close();
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
