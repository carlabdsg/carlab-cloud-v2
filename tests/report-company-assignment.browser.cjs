const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { setup } = require("./reports-workspace-harness.cjs");
const engine = process.env.BROWSER_ENGINE || "chromium";
const out = process.env.QA_OUTPUT || "/tmp/report-company-assignment";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const h = await setup();
  await h.db.query(
    "UPDATE users SET empresa=' ans ', password_hash=$1 WHERE id='operator'",
    [await bcrypt.hash("Operator-Test-123", 4)],
  );
  let browser, page;
  const errors = [];
  try {
    browser = await playwright[engine].launch(
      engine === "chromium"
        ? { channel: "chrome", headless: true }
        : { headless: true },
    );
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    // Log in normally, without QR or prefilled form values.
    await page.goto(h.url);
    await page.locator("#loginEmail").fill("operator@test.local");
    await page.locator("#loginPassword").fill("Operator-Test-123");
    await page.locator("#loginForm button[type=submit]").click();
    await page.locator("#reportFormPanel:not(.hidden)").waitFor();
    await page.waitForFunction(
      () => document.querySelector("#contactoNombre").value === "operator",
    );
    async function checkCompany(expected = "ANS") {
      assert.equal(
        await page.locator("#empresa").inputValue(),
        expected,
        "Account company must already be selected",
      );
      assert.equal(
        await page.locator("#empresa option").count(),
        1,
        "Only the assigned company is offered",
      );
      assert.ok(await page.locator("#empresa").isDisabled());
      await page.waitForFunction(
        () => document.querySelectorAll("#rwUnitPicker option").length === 12,
      );
      const units = await page
        .locator("#rwUnitPicker option")
        .evaluateAll((os) => os.slice(1).map((o) => o.value));
      assert.ok(
        units.every((id) => Number(id.split("-")[1]) <= 11),
        "Only company units are offered",
      );
    }
    await checkCompany();
    await page.screenshot({
      path: path.join(out, engine + "-operator-company.png"),
      fullPage: true,
    });
    await page.locator("#rwUnitPicker").selectOption("unit-1");
    assert.equal(await page.locator("#numeroEconomico").inputValue(), "321");
    await page.locator("#cancelReportBtn").click();
    await page.locator("#navNewReportBtn").click();
    await checkCompany();
    await page.reload();
    await page.locator("#reportFormPanel:not(.hidden)").waitFor();
    await page.waitForFunction(
      () => document.querySelector("#contactoNombre").value === "operator",
    );
    await checkCompany();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#rwUnitPicker").selectOption("unit-2");
    await page.screenshot({
      path: path.join(out, engine + "-operator-mobile.png"),
      fullPage: true,
    });
    await page.locator("#rwFormNext").click();
    await page
      .locator("#descripcionFallo")
      .fill("Reporte directo del operador de su empresa asignada.");
    await page.locator("#rwFormNext").click();
    await page.locator("#reportForm button[type=submit]").click();
    await page.locator("#boardPanel:not(.hidden)").waitFor();
    const saved = (
      await h.db.query(
        "SELECT empresa,numero_economico,fleet_unit_id FROM garantias WHERE descripcion_fallo='Reporte directo del operador de su empresa asignada.'",
      )
    ).rows[0];
    assert.equal(saved.empresa.trim().toUpperCase(), "ANS");
    assert.equal(saved.numero_economico, "322");
    assert.equal(saved.fleet_unit_id, "unit-2");
    await page.locator("#rwNewReport").click();
    await checkCompany();
    // Assigned company remains usable if it is absent from the active directory.
    await h.db.query("UPDATE companies SET activo=false WHERE nombre='ANS'");
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector("#contactoNombre").value === "operator",
    );
    await checkCompany("ans");
    // A directory outage cannot blank out an already assigned company.
    await page.route("**/api/public/companies", (r) =>
      r.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"Temporary test outage"}',
      }),
    );
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector("#contactoNombre").value === "operator",
    );
    await checkCompany("ans");
    assert.deepEqual(errors, []);
    console.log(
      "PASS " +
        engine +
        ": normal operator login, normalized company, own units, cancel, refresh, save, mobile, missing/failed company directory.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({
          path: path.join(out, engine + "-failure.png"),
          fullPage: true,
        })
        .catch(() => {});
    throw e;
  } finally {
    await browser?.close();
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
