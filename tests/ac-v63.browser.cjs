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
  const { h, call, ids, order } = await setup();
  let browser;
  let phase = "setup";
  try {
    for (let i = 0; i < 16; i++) {
      const r = await h.request("/services", {
        method: "POST",
        body: {
          data: {
            ...order.data,
            company: i % 2 ? "Transportes QR" : "Empresa Pacífico",
            unit: String(400 + i),
            serviceDate: "2026-10-20",
            status: i % 3 ? "en_proceso" : "completado",
            symptoms:
              "Temperatura de cabina fuera del rango esperado. Revisión de funcionamiento del sistema de climatización.",
            recommendations:
              "Verificar comportamiento del equipo durante el siguiente recorrido y programar mantenimiento preventivo conforme al periodo correspondiente.",
          },
        },
      });
      assert.equal(r.status, 201, JSON.stringify(r));
    }
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addInitScript(
      (token) => localStorage.setItem("carlabToken", token),
      h.token(),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    phase = "visible delete and restore";
    await page.goto(h.url + "/hispacold.html?unit=" + ids[0]);
    await page.locator("[data-af=delete-unit]").click();
    await page
      .locator("#acf-removal-form [name=reason]")
      .fill("Retiro de unidad para prueba");
    await page.locator("#acf-removal-form button[type=submit]").click();
    await page.locator("#acf-dialog").waitFor({ state: "hidden" });
    await page.locator(".acp-filter-details > summary").click();
    await page.locator("#acf-filters [name=archived]").selectOption("true");
    await page.locator("#acf-filters button[type=submit]").click();
    await page.locator('[data-af=detail][data-id="' + ids[0] + '"]').click();
    await page.locator("[data-af=restore-unit]").click();
    await page
      .locator("#acf-removal-form [name=reason]")
      .fill("Reincorporación de la unidad");
    await page.locator("#acf-removal-form button[type=submit]").click();
    await page.locator("#acf-dialog").waitFor({ state: "hidden" });
    assert.equal((await call("/fleet/units/" + ids[0])).body.unit.active, true);
    phase = "independent catalog and receipts";
    await page.locator("[data-view=parts]").click();
    await page.locator("[data-ac-action=new-inventory]").click();
    await page.locator("#ac-part-form [name=name]").fill("Filtro AC exclusivo");
    await page.locator("#ac-part-form [name=reference]").fill("F-AC-63");
    await page.locator("#ac-part-form [name=brands][value=hispacold]").check();
    await page.locator("#ac-part-form [name=minimum]").fill("5");
    await page.locator("#ac-part-form button[type=submit]").click();
    await page.locator("#ac-dialog").waitFor({ state: "hidden" });
    assert.equal(
      await page.locator("[data-ac-action=link-inventory]").count(),
      0,
    );
    await page
      .locator(".ac-part-card")
      .filter({ hasText: "Filtro AC exclusivo" })
      .locator("[data-ac-action=movement]")
      .click();
    await page.locator("#ac-movement-form [name=quantity]").fill("3");
    await page
      .locator("#ac-movement-form [name=notes]")
      .fill("Compra para almacén AC");
    await page.locator("#ac-movement-form button[type=submit]").click();
    await page.locator("#ac-dialog").waitFor({ state: "hidden" });
    await page.getByText("3 disponibles", { exact: true }).waitFor();
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM stock_parts")).rows[0].n,
      0,
    );
    phase = "weekly/monthly report and complete exports";
    await page.locator("[data-view=reports]").click();
    await page.locator("#acr-filters [name=anchor]").fill("2026-10-22");
    await page.locator("#acr-filters [name=period]").selectOption("week");
    await page.locator("#acr-filters button[type=submit]").click();
    await page.waitForFunction(() =>
      document.querySelector(".acr-period strong")?.textContent.includes("19"),
    );
    await page.screenshot({
      path: path.join(out, "reportes-escritorio.png"),
      fullPage: true,
    });
    const [pdf] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("[data-ar=pdf]").click(),
    ]);
    await pdf.saveAs(path.join(out, "reporte-semanal-ac.pdf"));
    const [csv] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("[data-ar=csv]").click(),
    ]);
    const csvPath = path.join(out, "reporte-semanal-ac.csv");
    await csv.saveAs(csvPath);
    assert(fs.readFileSync(csvPath, "utf8").includes("Empresa Pacífico"));
    assert(
      fs.readFileSync(csvPath, "utf8").includes("Órdenes pendientes actuales"),
    );
    await page.locator("#acr-filters [name=brand]").selectOption("hispacold");
    await page
      .locator("#acr-filters [name=company] option")
      .filter({ hasText: "Transportes QR" })
      .waitFor({ state: "attached" });
    await page
      .locator("#acr-filters [name=company]")
      .selectOption("Transportes QR");
    await page.locator("#acr-filters button[type=submit]").click();
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".acr-section")
          .innerText.includes("Empresa Pacífico"),
    );
    phase = "mobile supervisor has report access only for his brand";
    const mobile = await browser.newContext({ ...devices["iPhone 13"] });
    await mobile.addInitScript(
      (token) => localStorage.setItem("carlabToken", token),
      h.token("hispa", "supervisor_ac"),
    );
    const phone = await mobile.newPage();
    phone.setDefaultTimeout(15000);
    phone.on("pageerror", (e) => errors.push(e.message));
    await phone.goto(h.url + "/ac-supervisor.html?unit=" + ids[0]);
    await phone.locator("#acf-dialog[open]").waitFor();
    assert.equal(await phone.locator("[data-af=delete-unit]").count(), 0);
    await phone.locator("[data-af=close]").first().click();
    await phone.locator("[data-ac-view=reports]").click();
    await phone.locator("#acr-filters").waitFor();
    assert.equal(await phone.locator("#acr-filters [name=brand]").count(), 0);
    assert.equal(await phone.locator("[data-ac-view=library]").count(), 0);
    await phone.screenshot({
      path: path.join(out, "reportes-supervisor-movil.png"),
      fullPage: true,
    });
    const overflow = await phone.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    );
    assert.equal(overflow, false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: visible delete/restore, independent AC part receipt, report filters, CSV/PDF exports, mobile supervisor permissions, no horizontal overflow.",
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
