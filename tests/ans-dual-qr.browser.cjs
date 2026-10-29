const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  { setup } = require("./ac-guest-fixture.cjs");
const engine = process.env.BROWSER_ENGINE || "chromium",
  out = process.env.QA_OUTPUT || "/tmp/ans-qr";
(async () => {
  const h = await setup();
  let browser;
  try {
    fs.mkdirSync(out, { recursive: true });
    const company = await h.call("/api/ac/fleet/companies", {
      method: "POST",
      body: { name: "ANS" },
    });
    const unit = await h.call("/api/ac/fleet/units", {
      method: "POST",
      body: {
        companyId: company.body.id,
        unit: "321",
        brand: "hispacold",
        model: "i8",
      },
    });
    const qr = (await h.call("/api/ac/fleet/units/" + unit.body.ids[0] + "/qr"))
      .body;
    browser = await pw[engine].launch(
      engine === "chromium"
        ? { channel: "chrome", headless: true }
        : { headless: true },
    );
    for (const [label, size] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      const context = await browser.newContext({ viewport: size }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(h.url + "/ac-unit.html?code=" + qr.token);
      await page.locator("#reportChoices:not([hidden])").waitFor();
      assert.equal(new URL(page.url()).pathname, "/reportar.html");
      assert.match(await page.locator("#unitCompany").innerText(), /ANS/);
      await page.screenshot({
        path: path.join(out, engine + "-" + label + "-choice.png"),
        fullPage: true,
      });
      await page.locator("#generalChoice").click();
      await page.locator("#guestForm:not([hidden])").waitFor();
      assert.equal(new URL(page.url()).pathname, "/reporte-qr.html");
      assert.match(await page.locator("#unitNumber").innerText(), /321/);
      await page.locator("#chooseReport").click();
      await page.locator("#reportChoices:not([hidden])").waitFor();
      await page.locator("#acChoice").click();
      await page.locator("#guestForm:not([hidden])").waitFor();
      assert.equal(new URL(page.url()).pathname, "/ac-reporte-qr.html");
      assert.match(await page.locator("#unitNumber").innerText(), /321/);
      await page.reload();
      await page.locator("#guestForm:not([hidden])").waitFor();
      assert.equal(new URL(page.url()).searchParams.get("type"), "ac");
      await page.goto(h.url + "/ac-unit.html?code=" + h.units[0].qr.token);
      await page.locator("#guestForm:not([hidden])").waitFor();
      assert.equal(new URL(page.url()).pathname, "/ac-reporte-qr.html");
      assert.ok(await page.locator("#chooseReport").isHidden());
      assert.deepEqual(errors, []);
      await context.close();
    }
    const context = await browser.newContext();
    await context.addInitScript(
      (token) => localStorage.setItem("carlabToken", token),
      h.token("admin"),
    );
    const page = await context.newPage();
    const scripts = [];
    page.on("request", (r) => {
      if (r.url().includes("/vendor/")) scripts.push(r.url());
    });
    await page.goto(h.url + "/");
    await page.locator(".rw-report-row").first().waitFor();
    assert.equal(
      scripts.length,
      0,
      "Initial dashboard must not download PDF or QR tools",
    );
    // One failed lazy download must not poison future attempts or lose the page/session.
    await page.route("**/vendor/hc-jspdf.umd.min.js", (r) => r.abort(), {
      times: 1,
    });
    assert.equal(
      await page.evaluate(async () => {
        try {
          await CarlabAssets.pdf();
          return false;
        } catch {
          return true;
        }
      }),
      true,
    );
    await page.evaluate(() =>
      Promise.all([
        CarlabAssets.pdf({ tables: true }),
        CarlabAssets.pdf({ tables: true }),
        CarlabAssets.qr(),
        CarlabAssets.qr(),
      ]),
    );
    assert.equal(scripts.filter((x) => x.includes("hc-jspdf")).length, 2);
    assert.equal(scripts.filter((x) => x.includes("hc-autotable")).length, 1);
    assert.equal(scripts.filter((x) => x.includes("ac-qrcode")).length, 1);
    const batch = (
      await h.call("/api/report-qr/batch", {
        method: "POST",
        body: { unitIds: ["unit-1"] },
      })
    ).body.units[0];
    await page.addScriptTag({ url: h.url + "/ac-qr.js" });
    const values = await page.evaluate(
      ({ qr, batch }) => ({
        ac: ACQR.url(qr),
        general: ReportsQR.target(batch),
      }),
      { qr, batch },
    );
    assert.equal(
      values.ac,
      values.general,
      "ANS labels from both modules must encode exactly the same URL",
    );
    const download = page.waitForEvent("download");
    await page.evaluate(() => exportPdf(state.garantias[0]));
    await (
      await download
    ).saveAs(path.join(out, engine + "-reporte-general.pdf"));
    await page.goto(h.url + "/ac-unit.html?code=" + qr.token);
    await page.locator("#reportChoices:not([hidden])").waitFor();
    await page.goto(
      h.url + "/ac-unit.html?code=" + qr.token + "&access=account",
    );
    await page
      .locator("#acf-dialog h2")
      .filter({ hasText: "Unidad 321" })
      .waitFor();
    const operatorContext = await browser.newContext();
    await operatorContext.addInitScript(
      (token) => localStorage.setItem("carlabToken", token),
      h.token("operator"),
    );
    const operatorPage = await operatorContext.newPage();
    await operatorPage.goto(
      h.url +
        "/?acqr=" +
        qr.token +
        "&reportqr=" +
        qr.token +
        "&access=account",
    );
    await operatorPage
      .locator("#rwDialogTitle")
      .filter({ hasText: "Unidad 321" })
      .waitFor();
    await operatorPage
      .getByRole("button", { name: "+ Registrar reporte", exact: true })
      .click();
    await operatorPage.waitForFunction(
      () => document.querySelector("#rwUnitPicker").value === "unit-1",
    );
    assert.equal(
      await operatorPage.locator("#numeroEconomico").inputValue(),
      "321",
    );
    console.log(
      "PASS " +
        engine +
        ": existing ANS QR, both forms, mobile/desktop, company isolation, account access, lazy loading/deduplication/retry",
    );
  } finally {
    if (browser) await browser.close();
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
