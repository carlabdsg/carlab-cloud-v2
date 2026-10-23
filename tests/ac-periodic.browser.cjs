const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { harness } = require("./harness.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const out = process.env.QA_OUTPUT || require("node:os").tmpdir();
fs.mkdirSync(out, { recursive: true });
(async () => {
  const h = await harness();
  let browser;
  let phase = "setup";
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
    });
    await context.addInitScript(
      (token) => localStorage.setItem("carlabToken", token),
      h.token(),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const step = async (n) =>
      page.locator(`.hc-guided-steps [data-step="${n}"]`).click();
    const start = async (brand) => {
      await page.locator("[data-action=new]").first().click();
      await page.locator("#hc-create-brand").selectOption(brand);
      await page.locator("#hc-create-type").selectOption("preventivo");
      await page.locator("#hc-start-order").click();
      await page.locator("#hc-unit").selectOption("fleet-1");
      await page
        .locator("[name=symptoms]")
        .fill("Mantenimiento del periodo seleccionado.");
    };
    const saved = async () =>
      page
        .locator("#hc-save-state")
        .filter({ hasText: "Guardado en Carlab" })
        .waitFor();
    await page.goto(h.url + "/hispacold.html");
    await page
      .getByRole("heading", { name: "El control de tu operación AC" })
      .waitFor();
    await start("hispacold");
    phase = "Hispacold periods and source pages";
    for (const [period, count, sourcePage] of [
      ["mensual", 4, 2],
      ["trimestral", 7, 3],
      ["semestral", 9, 4],
      ["anual", 14, 5],
      ["bianual", 15, 6],
    ]) {
      await step(0);
      await page.locator("[name=interval]").selectOption(period);
      await step(1);
      assert.equal(await page.locator(".hc-check").count(), count);
      assert.match(
        await page.locator("#hc-period-scope").innerText(),
        new RegExp(`${count} actividades`),
      );
      const refs = await page
        .locator(".hc-check [data-action=manual]")
        .evaluateAll((els) => els.map((el) => el.dataset.page));
      assert.ok(
        refs.every((p) => Number(p) === sourcePage),
        JSON.stringify(refs),
      );
      assert.ok(
        (
          await page
            .locator('[name^="outcome:"]')
            .evaluateAll((els) => els.map((el) => el.value))
        ).every((v) => v === "pendiente"),
      );
    }
    phase = "protect filled annual-only item";
    await page.locator('[name="outcome:hp-aceite"]').selectOption("bien");
    await step(0);
    await page.locator("[name=interval]").selectOption("mensual");
    await page
      .locator("#hc-form-error")
      .filter({ hasText: "revisiones ya capturadas" })
      .waitFor();
    assert.equal(await page.locator("[name=interval]").inputValue(), "bianual");
    await step(1);
    await page.locator('[name="outcome:hp-aceite"]').selectOption("pendiente");
    await page
      .locator('[name="notes:hp-bandeja"]')
      .fill("Bandeja sin obstrucciones.");
    await step(0);
    await page.locator("[name=interval]").selectOption("mensual");
    await step(1);
    assert.equal(await page.locator(".hc-check").count(), 4);
    assert.equal(
      await page.locator('[name="notes:hp-bandeja"]').inputValue(),
      "Bandeja sin obstrucciones.",
    );
    assert.ok(
      (
        await page
          .locator(".hc-check [data-action=manual]")
          .evaluateAll((els) => els.map((el) => el.dataset.page))
      ).every((p) => p === "2"),
    );
    phase = "save, reopen and close with four monthly points";
    await page.locator("#hc-save").click();
    await saved();
    let row = (await h.request("/services")).body.items[0];
    assert.equal(
      (await h.request("/services/" + row.id)).body.data.checklist.length,
      4,
    );
    await page.reload();
    await page
      .getByRole("heading", { name: "El control de tu operación AC" })
      .waitFor();
    await page.locator("[data-view=services]").click();
    await page
      .locator(`[data-action=continue-order][data-id="${row.id}"]`)
      .click();
    await step(1);
    assert.equal(await page.locator(".hc-check").count(), 4);
    for (const el of await page.locator('[name^="outcome:"]').all())
      await el.selectOption("bien");
    await page.screenshot({
      path: path.join(out, "carlab-ac-v6.1-mensual.png"),
      fullPage: true,
    });
    await step(2);
    await page
      .locator("[name=workDone]")
      .fill(
        "Revisión general y limpieza de bandeja, motor, turbinas y componentes.",
      );
    await step(3);
    await page
      .locator("[name=finalTest]")
      .fill("Funcionamiento general verificado.");
    await page.locator("[name=result]").selectOption("operativo");
    await page.locator("[data-action=review-order]").click();
    await page.locator("[data-action=complete-order]").click();
    await page.locator("[data-action=reopen]").waitFor();
    const closed = (await h.request("/services/" + row.id)).body;
    assert.equal(closed.status, "completado");
    assert.equal(closed.data.checklist.length, 4);
    const dl = page.waitForEvent("download");
    await page.locator("[data-action=pdf]").click();
    await (await dl).saveAs(path.join(out, "carlab-ac-v6.1-mensual.pdf"));
    phase = "Eberspaecher periods";
    await page.locator("[data-view=services]").click();
    await start("eberspaecher");
    for (const [period, count] of [
      ["semanal", 2],
      ["mensual", 5],
      ["trimestral", 9],
      ["semestral", 13],
      ["anual", 19],
    ]) {
      await step(0);
      await page.locator("[name=interval]").selectOption(period);
      await step(1);
      assert.equal(await page.locator(".hc-check").count(), count);
      assert.ok(
        (
          await page
            .locator(".hc-check")
            .evaluateAll((els) => els.map((el) => el.dataset.check))
        ).every((id) => id.startsWith("ep-")),
      );
    }
    await page.locator("#hc-save").click();
    await saved();
    phase = "prior draft migration and preservation";
    const seed = {
      formVersion: 3,
      brand: "hispacold",
      type: "preventivo",
      status: "borrador",
      company: "Histórico",
      unit: "02",
      serviceDate: "2026-10-21",
      interval: "mensual",
      symptoms: "Plan anterior",
    };
    const empty = await h.request("/services", {
      method: "POST",
      body: { data: seed },
    });
    assert.equal(empty.status, 201);
    const filledData = { ...empty.body.data, unit: "03" };
    filledData.checklist[0].outcome = "bien";
    filledData.checklist[0].notes = "Conservar dato";
    const filled = await h.request("/services", {
      method: "POST",
      body: { data: filledData },
    });
    assert.equal(filled.status, 201);
    await page.locator("[data-view=services]").click();
    await page
      .locator(`[data-action=continue-order][data-id="${empty.body.id}"]`)
      .click();
    await step(1);
    assert.equal(await page.locator(".hc-check").count(), 4);
    await page.locator("#hc-save").click();
    await saved();
    await page.locator("[data-view=services]").click();
    await page
      .locator(`[data-action=continue-order][data-id="${filled.body.id}"]`)
      .click();
    await step(1);
    assert.match(
      await page.locator("#hc-period-scope").innerText(),
      /plan anterior/,
    );
    assert.ok((await page.locator(".hc-check").count()) > 30);
    assert.equal(
      await page.locator('[name^="notes:"]').first().inputValue(),
      "Conservar dato",
    );
    await page.locator("#hc-save").click();
    await saved();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: 10 periodicities, correct source pages, no inherited checks, change protection, shared notes preserved, four-point monthly closure and PDF, reopen, empty legacy migration and recorded legacy preservation.",
    );
  } catch (e) {
    console.error("Phase:", phase);
    throw e;
  } finally {
    if (browser) await browser.close();
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
