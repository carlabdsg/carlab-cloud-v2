const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { setup } = require("./reports-workspace-harness.cjs");
const engine = process.env.BROWSER_ENGINE || "chromium",
  out = process.env.QA_OUTPUT || "/tmp/report-quotations-qa";
fs.mkdirSync(out, { recursive: true });
const fixture = path.join(__dirname, "fixtures/quotation-example.pdf");
(async () => {
  const h = await setup();
  let browser,
    admin,
    operator,
    phase = "setup";
  const errors = [];
  try {
    browser = await playwright[engine].launch(
      engine === "chromium"
        ? { channel: "chrome", headless: true }
        : { headless: true },
    );
    async function pageFor(user, viewport) {
      const c = await browser.newContext({ viewport, acceptDownloads: true });
      await c.addInitScript((t) => {
        if (window === window.top) localStorage.setItem("carlabToken", t);
      }, h.token(user));
      const p = await c.newPage();
      p.setDefaultTimeout(15000);
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(h.url);
      return p;
    }
    admin = await pageFor("admin", { width: 1440, height: 1000 });
    await admin.locator(".rw-report-row").first().waitFor();
    phase = "admin empty overview";
    await admin.locator("#navQuotesBtn").click();
    await admin.locator(".rq-unit").first().waitFor();
    assert.equal(await admin.locator(".rq-unit").count(), 14);
    assert.equal(
      await admin.locator(".rq-unit[data-status=sin_cotizacion]").count(),
      14,
    );
    await admin.screenshot({
      path: path.join(out, engine + "-admin-empty.png"),
      fullPage: true,
    });
    operator = await pageFor("operator", { width: 390, height: 844 });
    await operator.waitForFunction(
      () => document.querySelector("#contactoNombre").value === "operator",
    );
    await operator.locator("#workspaceMenu").click();
    await operator.locator("#navQuotesBtn").click();
    await operator.locator(".rq-unit").first().waitFor();
    assert.equal(await operator.locator(".rq-unit").count(), 11);
    assert.ok(await operator.locator("#rqCompany").isDisabled());
    assert.ok(!(await operator.locator("#rqNew").isVisible()));
    phase = "admin upload";
    await admin.locator("#rqNew").click();
    await admin.locator("#rqUnitSelect").selectOption("ans:321");
    await admin.locator("#rqReportSelect").selectOption("report-1");
    await admin.locator("#rqPdfInput").setInputFiles(fixture);
    await admin.screenshot({ path: path.join(out, engine + "-upload.png") });
    await admin.locator("#rqUpload").click();
    await admin.locator("#rqPdfPages canvas").waitFor();
    await admin.waitForFunction(
      () =>
        document.querySelector('[data-quote-unit="ans:321"]').dataset.status ===
        "cotizada",
    );
    await admin.screenshot({ path: path.join(out, engine + "-admin-pdf.png") });
    await admin.locator("#rqDialog .rq-close").click();
    phase = "operator pdf";
    await operator.locator("#rqRefresh").click();
    await operator.waitForFunction(
      () =>
        document.querySelector('[data-quote-unit="ans:321"]').dataset.status ===
        "cotizada",
    );
    await operator.locator('[data-quote-unit="ans:321"]').click();
    await operator.locator("#rqPdfActions a[download]").waitFor();
    assert.equal(await operator.locator("#rqUpload").count(), 0);
    await operator.locator("#rqPdfPages canvas").waitFor();
    assert.ok(await operator.locator("#rqPdfPages canvas").isVisible());
    const [download] = await Promise.all([
      operator.waitForEvent("download"),
      operator.locator("#rqPdfActions a[download]").click(),
    ]);
    const downloaded = path.join(out, engine + "-downloaded.pdf");
    await download.saveAs(downloaded);
    assert.deepEqual(fs.readFileSync(downloaded), fs.readFileSync(fixture));
    await operator.screenshot({
      path: path.join(out, engine + "-operator-pdf.png"),
    });
    phase = "accept";
    await operator.locator("#rqAccept").click();
    await operator
      .locator("#rqResponseNote")
      .fill("Autorizado por la empresa.");
    await operator.locator("#rqConfirm").click();
    await operator.locator(".rq-response.rq-aceptada").waitFor();
    await operator.locator("#rqDialog .rq-close").click();
    await operator.waitForFunction(
      () =>
        document.querySelector('[data-quote-unit="ans:321"]').dataset.status ===
        "aceptada",
    );
    // The admin board must update automatically without refreshing the browser.
    await admin.waitForFunction(
      () =>
        document.querySelector('[data-quote-unit="ans:321"]').dataset.status ===
        "aceptada",
      {},
      { timeout: 25000 },
    );
    assert.equal(
      await admin
        .locator('[data-quote-unit="ans:321"] .rq-bus')
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(35, 151, 103)",
    );
    await admin.screenshot({
      path: path.join(out, engine + "-accepted-admin.png"),
      fullPage: true,
    });
    await operator.screenshot({
      path: path.join(out, engine + "-accepted-operator.png"),
      fullPage: true,
    });
    phase = "revision and rejection";
    await admin.locator('[data-quote-unit="ans:321"]').click();
    await admin.locator(".rq-response.rq-aceptada").waitFor();
    await admin.locator("#rqPdfInput").setInputFiles(fixture);
    await admin.locator("#rqUpload").click();
    await admin.locator(".rq-history").waitFor();
    await admin.waitForFunction(
      () =>
        document.querySelector('[data-quote-unit="ans:321"]').dataset.status ===
        "cotizada",
    );
    await admin.locator("#rqDialog .rq-close").click();
    await operator.locator("#rqRefresh").click();
    await operator.waitForFunction(
      () =>
        document.querySelector('[data-quote-unit="ans:321"]').dataset.status ===
        "cotizada",
    );
    await operator.locator('[data-quote-unit="ans:321"]').click();
    await operator.locator("#rqReject").click();
    await operator
      .locator("#rqResponseNote")
      .fill("Solicitamos revisar el alcance de la reparación.");
    await operator.locator("#rqConfirm").click();
    await operator.locator(".rq-response.rq-rechazada").waitFor();
    await operator.locator("#rqDialog .rq-close").click();
    await admin.waitForFunction(
      () =>
        document.querySelector('[data-quote-unit="ans:321"]').dataset.status ===
        "rechazada",
      {},
      { timeout: 25000 },
    );
    await admin.locator('[data-quote-unit="ans:321"]').click();
    await admin.locator(".rq-response.rq-rechazada").waitFor();
    assert.ok(
      (await admin.locator(".rq-response").innerText()).includes(
        "Solicitamos revisar",
      ),
    );
    await admin.locator(".rq-history summary").click();
    assert.ok(
      (await admin.locator(".rq-history").innerText()).includes("Aceptada"),
    );
    await admin.screenshot({
      path: path.join(out, engine + "-rejected-history.png"),
    });
    await admin.locator("#rqDialog .rq-close").click();
    phase = "no report and filters";
    await admin.locator('[data-quote-unit="ans:331"]').click();
    await admin
      .getByRole("heading", { name: "Esta unidad todavía no tiene reportes" })
      .waitFor();
    assert.equal(await admin.locator("#rqUpload").count(), 0);
    await admin.locator("#rqDialog .rq-close").click();
    await admin.locator("#rqCompany").selectOption("Transportes del Pacífico");
    assert.equal(await admin.locator(".rq-unit").count(), 3);
    await admin.locator("#rqCompany").selectOption("");
    await admin.locator("#rqStatus").selectOption("rechazada");
    assert.equal(await admin.locator(".rq-unit").count(), 1);
    await admin.locator("#rqStatus").selectOption("");
    phase = "mobile admin";
    await admin.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await admin.locator('[data-quote-unit="ans:321"]').click();
    await admin.locator("#rqReportSelect").waitFor();
    const close = await admin.locator("#rqDialog .rq-close").boundingBox();
    assert.ok(close.y >= 0 && close.y + close.height <= 844);
    await admin.screenshot({
      path: path.join(out, engine + "-mobile-admin.png"),
    });
    await admin.locator("#rqDialog .rq-close").click();
    await admin.locator("#workspaceMenu").click();
    await admin.locator("#navBoardBtn").click();
    await admin.locator(".rw-report-row").first().waitFor();
    assert.ok(!(await admin.locator("#quotesPanel").isVisible()));
    assert.deepEqual(errors, []);
    console.log(
      "PASS " +
        engine +
        ": admin upload, operator PDF download, acceptance/rejection, automatic shared colors, revision history, company scope, filters and mobile.",
    );
  } catch (error) {
    console.error("PHASE", phase, "ERRORS", errors);
    if (admin)
      await admin
        .screenshot({
          path: path.join(out, engine + "-failure-admin.png"),
          fullPage: true,
        })
        .catch(() => {});
    if (operator)
      await operator
        .screenshot({
          path: path.join(out, engine + "-failure-operator.png"),
          fullPage: true,
        })
        .catch(() => {});
    throw error;
  } finally {
    await browser?.close();
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
