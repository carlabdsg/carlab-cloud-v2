const { chromium, devices } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const { setup } = require("./ac-qr-fixture.cjs");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
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
    const date = (n) => {
      const d = new Date(today + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const company = (
      await call("/fleet/companies", {
        method: "POST",
        body: { name: "Autobuses del Pacífico", region: "Occidente" },
      })
    ).body;
    for (let i = 0; i < 8; i++) {
      const r = await call("/fleet/units", {
        method: "POST",
        body: {
          companyId: company.id,
          unit: String(325 + i),
          brand: i % 2 ? "eberspaecher" : "hispacold",
          busBrand: i % 2 ? "Volvo" : "MAN",
          model: i % 2 ? "9800" : "i8",
          base: "Mazatlán",
          manualCondition:
            i === 0
              ? "no_operativo"
              : i === 3
                ? "sin_evaluar"
                : i === 2
                  ? "con_observaciones"
                  : "operativo",
          checkedOn: today,
          conditionNote: "Evaluación de climatización",
          initialNextDate: date(i === 1 ? -2 : i + 1),
        },
      });
      assert.equal(r.status, 201);
    }
    const req = (
      await call("/requests", {
        method: "POST",
        body: {
          clientKey: "admin-browser-request",
          kind: "service",
          company: company.name,
          unit: "325",
          brand: "hispacold",
          description: "Revisar pérdida de enfriamiento durante el recorrido.",
          priority: "urgente",
        },
      })
    ).body;
    const linked = await call("/requests/" + req.id + "/create-order", {
      method: "POST",
      body: { version: req.version, type: "menor", serviceDate: today },
    });
    assert.equal(linked.status, 201);
    await call("/requests", {
      method: "POST",
      body: {
        clientKey: "admin-browser-part",
        kind: "part",
        company: company.name,
        unit: "326",
        brand: "eberspaecher",
        partName: "Filtro de retorno",
        quantity: 2,
        description: "Suministro para el servicio programado",
      },
    });
    const before = (await h.db.query("SELECT * FROM hc_services ORDER BY id"))
      .rows;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const errors = [];
    async function pageFor(opts = {}) {
      const c = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        ...opts,
      });
      await c.addInitScript(
        (t) => localStorage.setItem("carlabToken", t),
        h.token(),
      );
      const p = await c.newPage();
      p.setDefaultTimeout(15000);
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(h.url + "/hispacold.html");
      await p
        .getByRole("heading", { name: "El control de tu operación AC" })
        .waitFor();
      return p;
    }
    const overflow = async (p) =>
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "Horizontal overflow",
      );
    const p = await pageFor();
    phase = "desktop home, companies and fleet";
    await overflow(p);
    await p.screenshot({
      path: path.join(out, "admin-inicio.png"),
      fullPage: true,
    });
    await p.locator(".aca-nav [data-view=companies]").click();
    await p
      .locator("[data-aportal=company]")
      .filter({ hasText: company.name })
      .click();
    await p.locator(".acf-unit").first().waitFor();
    assert.equal(await p.locator(".acf-unit").count(), 8);
    assert.ok(await p.locator("[data-af=new-unit]").isVisible());
    assert.ok(await p.locator("[data-af=companies]").isVisible());
    await p.screenshot({
      path: path.join(out, "admin-flota.png"),
      fullPage: true,
    });
    await p.locator(".acf-unit").first().click();
    await p.locator(".acf-dialog-close").click();
    assert.equal(await p.locator("#acf-dialog").isVisible(), false);
    phase = "desktop requests, delete confirm and history";
    await p.locator(".aca-nav [data-view=requests]").click();
    const card = p.locator(".acp-follow-card").filter({ hasText: req.folio });
    await card
      .getByRole("button", { name: "Eliminar solicitud", exact: true })
      .click();
    assert.match(
      await p.locator("#ac-dialog").innerText(),
      /orden vinculada conservará/,
    );
    await p
      .locator("#ac-request-removal [name=reason]")
      .fill("Solicitud duplicada; la orden continúa en taller.");
    await p.screenshot({
      path: path.join(out, "eliminar-solicitud.png"),
      fullPage: true,
    });
    await p.locator("#ac-request-removal button[type=submit]").click();
    await p.locator("#ac-dialog").waitFor({ state: "hidden" });
    await card.waitFor({ state: "detached" });
    assert.equal(
      (await call("/requests/" + req.id, { user: "hispa" })).status,
      404,
    );
    await p
      .locator("[data-ac-action=request-inbox][data-deleted=true]")
      .click();
    await card.getByRole("button", { name: "Gestionar solicitud" }).click();
    assert.match(
      await p.locator("#ac-dialog").innerText(),
      /Solicitud eliminada/,
    );
    assert.equal(await p.locator("#ac-convert-request").count(), 0);
    assert.equal(await p.locator("#ac-request-update").count(), 0);
    await p.locator(".acp-dialog-top button").click();
    await p.screenshot({
      path: path.join(out, "solicitudes-eliminadas.png"),
      fullPage: true,
    });
    phase = "desktop tools and order creation";
    await p.locator(".aca-nav [data-view=tools]").click();
    await p.locator("[data-view=access]").click();
    await p.locator("[data-ac-action=new-fleet-user]").waitFor();
    await p.locator(".aca-nav [data-view=tools]").click();
    await p.locator("[data-view=calendar]").click();
    await p
      .locator("#hc-main")
      .getByRole("heading", { name: "Próximos servicios", exact: true })
      .waitFor();
    await p.locator(".aca-nav [data-view=home]").click();
    await p.locator("[data-action=new]").click();
    await p.locator("#hc-create-brand").selectOption("hispacold");
    await p.locator("#hc-create-type").selectOption("menor");
    await p.locator("#hc-start-order").click();
    await p.locator("#hc-create-form").waitFor({ state: "hidden" });
    await p.locator("#hc-form").waitFor();
    await p.locator("#hc-form [name=company]").fill("Borrador de prueba");
    await p.locator("#hc-form [name=unit]").fill("999");
    await p
      .locator("#hc-form [name=symptoms]")
      .fill("Prueba de conservación al navegar");
    await p.locator(".aca-nav [data-view=home]").click();
    await p
      .getByRole("heading", { name: "El control de tu operación AC" })
      .waitFor();
    await p.locator(".aca-nav [data-view=services]").click();
    await p.locator(".hc-local-drafts [data-action=resume]").click();
    await p.locator("#hc-form").waitFor();
    assert.equal(
      await p.locator("#hc-form [name=company]").inputValue(),
      "Borrador de prueba",
    );
    phase = "mobile home and recovery";
    const phone = await pageFor(devices["iPhone 13"]);
    await overflow(phone);
    await phone.screenshot({
      path: path.join(out, "admin-movil.png"),
      fullPage: true,
    });
    assert.equal(await phone.locator(".aca-nav button:visible").count(), 5);
    await phone.locator(".aca-nav [data-view=requests]").click();
    await phone
      .locator("[data-ac-action=request-inbox][data-deleted=true]")
      .click();
    const mobileCard = phone
      .locator(".acp-follow-card")
      .filter({ hasText: req.folio });
    await mobileCard
      .getByRole("button", { name: "Recuperar", exact: true })
      .click();
    await phone.locator("#ac-request-removal button[type=submit]").click();
    await phone.locator("#ac-dialog").waitFor({ state: "hidden" });
    await mobileCard.waitFor({ state: "detached" });
    await phone
      .locator('[data-ac-action=request-inbox][data-deleted=""]')
      .click();
    await mobileCard
      .getByRole("button", { name: "Gestionar solicitud" })
      .waitFor();
    await overflow(phone);
    await mobileCard
      .getByRole("button", { name: "Eliminar solicitud", exact: true })
      .click();
    await phone.locator("#ac-request-removal [name=reason]").waitFor();
    const close = phone.getByRole("button", {
      name: "Cerrar ventana",
      exact: true,
    });
    const box = await close.boundingBox();
    assert.ok(
      box && box.y >= 0 && box.y + box.height <= phone.viewportSize().height,
    );
    await close.click();
    await phone.evaluate(() => window.scrollTo(0, 0));
    await phone.screenshot({
      path: path.join(out, "admin-solicitudes-movil.png"),
      fullPage: true,
    });
    assert.equal(
      (await call("/requests/" + req.id, { user: "hispa" })).status,
      200,
    );
    assert.deepEqual(
      (await h.db.query("SELECT * FROM hc_services ORDER BY id")).rows,
      before,
    );
    await phone.locator(".aca-nav [data-view=tools]").click();
    await phone.locator(".aca-tool").first().waitFor();
    await overflow(phone);
    await phone.screenshot({
      path: path.join(out, "admin-herramientas-movil.png"),
      fullPage: true,
    });
    for (const view of [
      "parts",
      "reports",
      "access",
      "history",
      "library",
      "codes",
      "trash",
    ]) {
      await phone.locator("#hc-main [data-view=" + view + "]").click();
      await phone.waitForFunction(
        () => !document.querySelector(".aca-tool-grid"),
      );
      await overflow(phone);
      assert.doesNotMatch(
        await phone.locator("#hc-main").innerText(),
        /No se pudo cargar/,
      );
      await phone.locator(".aca-nav [data-view=tools]").click();
      await phone.locator(".aca-tool").first().waitFor();
    }
    phase = "320px layout";
    await phone.setViewportSize({ width: 320, height: 740 });
    await phone.locator(".aca-nav [data-view=home]").click();
    await phone
      .getByRole("heading", { name: "El control de tu operación AC" })
      .waitFor();
    await overflow(phone);
    assert.deepEqual(errors, []);
    console.log(
      "PASS admin desktop + mobile: visual home, scoped company cards, fleets, management tools, order creation, request soft-delete and recovery preserving linked orders.",
    );
  } catch (e) {
    console.error("PHASE", phase);
    throw e;
  } finally {
    await browser?.close();
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
