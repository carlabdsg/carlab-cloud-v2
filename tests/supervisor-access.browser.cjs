const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { setup } = require("./supervisor-fixture.cjs");
const engine = process.env.BROWSER_ENGINE || "chromium",
  out = process.env.QA_OUTPUT || "/tmp/supervisor-v710";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const h = await setup();
  let browser,
    phase = "setup",
    page;
  const errors = [];
  try {
    browser = await pw[engine].launch(
      engine === "chromium"
        ? { channel: "chrome", headless: true }
        : { headless: true },
    );
    for (const [size, viewport, decision] of [
      ["desktop", { width: 1440, height: 1000 }, "aceptada"],
      ["mobile", { width: 390, height: 844 }, "rechazada"],
    ]) {
      phase = size + " login";
      const context = await browser.newContext({
        viewport,
        acceptDownloads: true,
      });
      await context.addInitScript(
        (token) => localStorage.setItem("carlabToken", token),
        h.token("reviewer"),
      );
      page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => errors.push(e.message));
      const writes = [];
      page.on("request", (r) => {
        if (r.url().includes("/api/") && !["GET", "HEAD"].includes(r.method()))
          writes.push(r.url());
      });
      const nav = async (id) => {
        if (size === "mobile") await page.locator("#workspaceMenu").click();
        await page.locator(id).click();
      };
      await page.goto(h.url, { waitUntil: "domcontentloaded" });
      await page.locator(".rw-report-row").first().waitFor();
      assert.equal(await page.locator(".rw-report-row").count(), 8);
      if (size === "mobile") await page.locator("#workspaceMenu").click();
      const modules = await page
        .locator(".nav-stack .nav-btn:visible")
        .allTextContents();
      assert.deepEqual(
        modules.map((x) => x.trim()).sort(),
        ["Reportes", "Aire acondicionado", "Cotizaciones", "Flotas"].sort(),
      );
      if (size === "mobile") {
        await page.screenshot({path: path.join(out, engine + "-mobile-menu.png")});
        await page.locator("#navBoardBtn").click();
        assert.equal(await page.locator("#dashboardView .sidebar").isVisible(), false);
        assert.equal(await page.locator(".nav-stack .nav-btn:visible").count(), 0);
      }
      await page.screenshot({
        path: path.join(out, engine + "-" + size + "-reportes.png"),
        fullPage: true,
      });
      phase = size + " fleet";
      await nav("#navFleetBtn");
      await page.locator(".rw-unit-card,.rw-company-card").first().waitFor();
      if (await page.locator(".rw-company-card").count())
        await page.locator(".rw-company-card").click();
      await page.locator(".rw-unit-card").first().waitFor();
      assert.equal(await page.locator(".rw-unit-card").count(), 11);
      assert.equal(await page.locator("#rwFleetQr:visible").count(), 0);
      assert.equal(await page.locator("#fleetSaveBtn:visible").count(), 0);
      await page.locator(".rw-unit-card").first().click();
      await page.locator("#fleetDetailModalContent .rw-close").waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Etiqueta QR", exact: true })
          .count(),
        0,
      );
      await page.screenshot({
        path: path.join(out, engine + "-" + size + "-expediente.png"),
      });
      await page.locator("#fleetDetailModalContent .rw-close").click();
      phase = size + " quotations";
      await nav("#navQuotesBtn");
      await page.locator(".rq-unit").first().waitFor();
      assert.equal(await page.locator(".rq-unit").count(), 11);
      assert.equal(await page.locator("#rqNew:visible").count(), 0);
      assert.ok(await page.locator("#rqCompany").isDisabled());
      await page
        .locator(
          '[data-quote-unit="ans:' +
            (size === "desktop" ? "321" : "322") +
            '"]',
        )
        .click();
      await page.locator("#rqPdfPages canvas").waitFor();
      await page.screenshot({
        path: path.join(out, engine + "-" + size + "-cotizacion.png"),
      });
      await page
        .locator(decision === "aceptada" ? "#rqAccept" : "#rqReject")
        .click();
      await page
        .locator("#rqResponseNote")
        .fill("Respuesta del supervisor desde " + size + ".");
      await page.locator("#rqConfirm").click();
      await page.locator(".rq-response.rq-" + decision).waitFor();
      assert.match(await page.locator(".rq-response").innerText(), /reviewer/);
      await page.locator("#rqDialog .rq-close").click();
      phase = size + " AC home";
      await nav("#hcAdminEntry");
      await page.locator(".acp-kpis").first().waitFor();
      assert.match(await page.locator("#hc-user").innerText(), /Solo consulta/);
      const forbidden =
        "[data-ac-action=new-incident],[data-aportal=request],[data-ai=new],[data-ac-action=portal-request],[data-ac-action=new-part],[data-ac-action=request-part],[data-ac-action=new-service],[data-ac-action=notice-read-all],[data-ac-action=notice-read]";
      assert.equal(await page.locator(forbidden).count(), 0);
      await page.screenshot({
        path: path.join(out, engine + "-" + size + "-ac.png"),
        fullPage: true,
      });
      phase = size + " AC fleet";
      await page.locator(".acp-nav [data-ac-view=companies]").click();
      await page.locator(".acp-company").waitFor();
      assert.equal(await page.locator(".acp-company").count(), 1);
      await page.locator(".acp-company").click();
      await page.locator(".acf-unit").first().waitFor();
      assert.equal(await page.locator(".acf-unit").count(), 2);
      await page.locator(".acf-unit").first().click();
      await page.locator("#acf-dialog[open]").waitFor();
      assert.equal(
        await page
          .getByRole("button", {
            name: /^(Reportar falla|Solicitar servicio|Solicitar refacción|Editar ficha)/,
          })
          .count(),
        0,
      );
      await page.locator("#acf-dialog [data-af=close]").first().click();
      phase = size + " AC incidents";
      await page.locator(".acp-nav [data-ac-view=incidents]").click();
      await page.locator(".aci-card").first().waitFor();
      assert.equal(await page.locator(".aci-card").count(), 2);
      await page.locator(".aci-card [data-ai=detail]").first().click();
      await page.locator(".aci-title").waitFor();
      assert.equal(
        await page
          .locator("#aci-comment,#aci-confirm,#aci-manage,#aci-convert")
          .count(),
        0,
      );
      await page.screenshot({
        path: path.join(out, engine + "-" + size + "-incidencia-ac.png"),
      });
      await page
        .locator("#aci-dialog [data-ai=close]")
        .first()
        .click();
      phase = size + " AC requests";
      await page.locator(".acp-nav [data-ac-view=requests]").click();
      await page.locator(".acp-follow-card").first().waitFor();
      assert.equal(await page.locator(".acp-follow-card").count(), 1);
      assert.equal(await page.locator(forbidden).count(), 0);
      await page.locator("[data-ac-action=request-detail]").click();
      await page.locator("#ac-dialog[open]").waitFor();
      assert.equal(await page.locator("#ac-dialog form").count(), 0);
      await page
        .locator("#ac-dialog [data-ac-action=dialog-close]")
        .first()
        .click();
      phase = size + " AC orders";
      await page.locator(".acp-tabs [data-ac-view=orders]").click();
      await page.locator("[data-ac-action=order-detail]").first().waitFor();
      assert.equal(
        await page.locator("[data-ac-action=order-detail]").count(),
        1,
      );
      await page.locator("[data-ac-action=order-detail]").click();
      await page.locator("[data-ac-action=order-pdf]").waitFor();
      const downloadPromise = page.waitForEvent("download");
      await page.locator("[data-ac-action=order-pdf]").click();
      const download = await downloadPromise;
      await download.saveAs(path.join(out, engine + "-" + size + "-orden.pdf"));
      assert.ok(
        fs.statSync(path.join(out, engine + "-" + size + "-orden.pdf")).size >
          1000,
      );
      await page.locator(".acp-nav [data-ac-view=requests]").click();
      await page.locator(".acp-tabs [data-ac-view=parts]").click();
      await page.locator(".ac-part-card").first().waitFor();
      assert.equal(await page.locator(forbidden).count(), 0);
      phase = size + " return";
      await page.getByRole("link", { name: "← Volver a Reportes" }).click();
      await page.locator(".rw-report-row").first().waitFor();
      assert.equal(writes.length, 1, JSON.stringify(writes));
      assert.match(writes[0], /\/report-quotes\/[^/]+\/decision$/);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS " +
        engine +
        ": supervisor desktop/mobile, four modules, company scope, read-only AC, quote acceptance/rejection and AC PDF",
    );
  } catch (e) {
    console.error("PHASE:", phase);
    if (page)
      await page
        .screenshot({
          path: path.join(out, engine + "-failure.png"),
          fullPage: true,
        })
        .catch(() => {});
    throw e;
  } finally {
    if (browser) await browser.close();
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
