const { chromium, devices } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const { setup } = require("./ac-qr-fixture.cjs");
const catalog = require("../modules/hispacold/catalog");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const out = process.env.QA_OUTPUT || require("node:os").tmpdir();
fs.mkdirSync(out, { recursive: true });
(async () => {
  const { h, call } = await setup();
  let browser,
    phase = "setup";
  try {
    const r = await h.request("/services", {
      method: "POST",
      body: {
        data: {
          formVersion: 3,
          brand: "hispacold",
          type: "preventivo",
          attention: "normal",
          interval: "trimestral",
          maintenancePlan: catalog.forBrand("hispacold").periodicPlan.id,
          status: "borrador",
          company: "Transportes QR",
          unit: "306",
          serviceDate: "2026-10-22",
          symptoms: "Mantenimiento programado",
          chassis: "Volvo",
          equipment: "PB ECOICE",
        },
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r));
    const id = r.body.id;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await ctx.addInitScript(
      (token) => localStorage.setItem("carlabToken", token),
      h.token(),
    );
    const page = await ctx.newPage();
    const errors = [];
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(h.url + "/hispacold.html");
    await page
      .locator('[data-action=continue-order][data-id="' + id + '"]')
      .click();
    await page.locator('.hc-guided-steps [data-step="2"]').click();
    await page.locator("#hc-parts-details summary").click();
    phase = "quarterly selection";
    await page.locator("[data-action=pick-parts]").click();
    await page.locator("[data-ap=select-package]").waitFor();
    assert.equal(await page.locator(".acp-pack .acp-item").count(), 3);
    await page.locator("[data-ap=select-package]").click();
    assert.equal(
      await page.locator("#acp-selected").innerText(),
      "2 conceptos seleccionados",
    );
    await page.screenshot({
      path: path.join(out, "selector-trimestral.png"),
      fullPage: true,
    });
    await page.locator("[data-ap=add]").click();
    await page.locator("#acp-dialog").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#hc-parts tbody tr").count(), 2);
    assert.equal(await page.locator('[name="quantity:0"]').inputValue(), "1");
    assert.equal(await page.locator('[name="unitPrice:0"]').inputValue(), "0");
    phase = "no duplicate additions";
    await page.locator("[data-action=pick-parts]").click();
    await page.locator("[data-ap=select-package]").click();
    assert.equal(
      await page.locator("#acp-selected").innerText(),
      "0 conceptos seleccionados",
    );
    await page.locator(".acp-close").click();
    const saved = page.waitForResponse(
      (resp) =>
        resp.url().includes("/services/" + id) &&
        resp.request().method() === "PUT",
    );
    await page.locator("#hc-save").click();
    assert.equal((await saved).status(), 200);
    let stored = (await h.request("/services/" + id)).body;
    assert.equal(stored.data.parts.length, 2);
    assert.equal(stored.data.parts[0].sourceDocumentId, "cot-trimestral-2026");
    assert.equal(stored.data.total, 0);
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM ac_stock_movements"))
        .rows[0].n,
      0,
    );
    phase =
      "monthly has no quarterly kit and period switch preserves existing lines";
    await page.locator('.hc-guided-steps [data-step="0"]').click();
    await page.locator("[name=interval]").selectOption("mensual");
    await page.locator('.hc-guided-steps [data-step="2"]').click();
    await page.locator("[data-action=pick-parts]").click();
    await page.locator("#acp-search").waitFor();
    assert.equal(await page.locator(".acp-pack").count(), 0);
    assert.match(
      await page.locator("#acp-dialog").innerText(),
      /No hay un paquete de recambios mensual/,
    );
    await page.locator(".acp-close").click();
    assert.equal(await page.locator("#hc-parts tbody tr").count(), 2);
    phase = "annual chasis changes and source references";
    await page.locator('.hc-guided-steps [data-step="0"]').click();
    await page.locator("[name=interval]").selectOption("anual");
    await page.locator('.hc-guided-steps [data-step="2"]').click();
    await page.locator("[data-action=pick-parts]").click();
    await page.locator("#acp-chassis").waitFor();
    await page.locator("#acp-chassis").selectOption("mb");
    await page
      .getByText("BANDA COMPRESOR · referencia por confirmar", { exact: true })
      .waitFor();
    const mbrow = page
      .locator(".acp-pack .acp-item")
      .filter({ hasText: "BANDA COMPRESOR · referencia por confirmar" });
    assert.equal(
      await mbrow.locator("input[type=checkbox]").isDisabled(),
      true,
    );
    await page.locator("#acp-chassis").selectOption("man");
    await page
      .getByText("BANDA COMPRESOR (10PK2420 ó 10PK2415)", { exact: true })
      .first()
      .waitFor();
    assert.equal(
      await page
        .locator(".acp-pack")
        .getByText("BALERO 6305SKF", { exact: true })
        .count(),
      0,
    );
    await page.locator(".acp-catalog>summary").click();
    await page.locator("#acp-search [name=family]").selectOption("efficient");
    await page.locator("#acp-search [name=q]").fill("NETIOS");
    await page.locator("#acp-search button[type=submit]").click();
    await page.getByText("NETIOS i20 MASTER 24V", { exact: true }).waitFor();
    await page.locator(".acp-close").click();
    phase = "catalog filter and private sources";
    await page.locator("#hc-save").click();
    await page.getByText(/Orden HC-.* guardada en Carlab/).waitFor();
    await page.locator("[data-view=parts]").click();
    await page.locator("#ac-parts-filter [name=q]").fill("9000061-R");
    await page.locator("#ac-parts-filter button[type=submit]").click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-ac-action=official-sources]")
          .length === 1,
    );
    await page.locator("[data-ac-action=official-sources]").click();
    await page
      .getByText("CATALOGO EQUIPO EFFICIENT", { exact: true })
      .waitFor();
    assert(
      (await page.locator("[data-ac-action=official-document]").count()) > 1,
    );
    await page.locator("[data-ac-action=dialog-close]").click();
    phase = "mobile picker close, search and selection";
    const mc = await browser.newContext({ ...devices["iPhone 13"] });
    await mc.addInitScript(
      (token) => localStorage.setItem("carlabToken", token),
      h.token(),
    );
    const phone = await mc.newPage();
    phone.on("pageerror", (e) => errors.push(e.message));
    phone.setDefaultTimeout(20000);
    await phone.goto(h.url + "/hispacold.html");
    await phone
      .locator('[data-action=continue-order][data-id="' + id + '"]')
      .click();
    await phone.locator('.hc-guided-steps [data-step="2"]').click();
    if (!(await phone.locator("#hc-parts-details").evaluate((el) => el.open)))
      await phone.locator("#hc-parts-details summary").click();
    await phone.locator("[data-action=pick-parts]").click();
    await phone.locator("#acp-chassis").waitFor();
    await phone.screenshot({
      path: path.join(out, "selector-movil.png"),
      fullPage: true,
    });
    assert(await phone.locator(".acp-close").isVisible());
    assert.equal(
      await phone.evaluate(
        () =>
          document.querySelector("#acp-dialog").scrollWidth >
          document.querySelector("#acp-dialog").clientWidth + 2,
      ),
      false,
    );
    await phone.locator(".acp-close").click();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: quarterly kit and quantity, MXN untouched, no duplicates, saved provenance, no stock deduction, monthly empty kit, annual chassis variants, Efficient search, private sources, mobile close and width.",
    );
  } catch (e) {
    console.error("FAIL at " + phase);
    throw e;
  } finally {
    await browser?.close();
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
