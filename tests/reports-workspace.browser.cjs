const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { setup } = require("./reports-workspace-harness.cjs");
const engine = process.env.BROWSER_ENGINE || "chromium",
  out = process.env.QA_OUTPUT || "/tmp/reports-workspace-qa";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const h = await setup();
  await h.db.query(
    "UPDATE fleet_units SET numero_obra='', modelo='   ' WHERE id='unit-2'",
  );
  let browser,
    page,
    phase = "init";
  const errors = [];
  try {
    browser = await playwright[engine].launch(
      engine === "chromium"
        ? { channel: "chrome", headless: true }
        : { headless: true },
    );
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    await context.addInitScript(
      (t) => localStorage.setItem("carlabToken", t),
      h.token("admin"),
    );
    page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => errors.push(e.message));
    phase = "board";
    await page.goto(h.url);
    await page.locator(".rw-report-row").first().waitFor();
    await page.screenshot({
      path: path.join(out, engine + "-reports.png"),
      fullPage: true,
    });
    assert.equal(await page.locator(".rw-report-row").count(), 8);
    await page.locator("[data-group=review]").click();
    assert.equal(await page.locator(".rw-report-row").count(), 2);
    await page.locator("[data-group=all]").click();
    phase = "report detail";
    await page.locator("[data-report-id=report-1] button").click();
    await page.getByRole("tab", { name: "Seguimiento", exact: true }).click();
    await page.locator(".reviewStatus").selectOption("aceptada");
    await page.locator(".reviewReason").fill("Procede validación técnica.");
    await page.locator(".reviewBtn").click();
    await page.locator(".opStatus").waitFor();
    await page.locator(".opStatus").selectOption("en proceso");
    await page.locator(".opNotes").fill("Diagnóstico en taller.");
    await page.locator(".opBtn").click();
    await page.getByRole("tab", { name: "Resumen", exact: true }).click();
    await page.screenshot({ path: path.join(out, engine + "-detail.png") });
    phase = "edit and preserve evidence";
    await page.getByRole("tab", { name: "Seguimiento", exact: true }).click();
    await page
      .locator("#reportDetailContent button")
      .filter({ hasText: /^Editar$/ })
      .click();
    await page.locator("#rw-form-step-0").waitFor();
    await page.locator("#rwFormNext").click();
    await page
      .locator("#descripcionFallo")
      .fill("Descripción técnica actualizada sin perder evidencia.");
    await page.locator("#rwFormNext").click();
    await page.locator("#reportForm button[type=submit]").click();
    await page.locator("#boardPanel:not(.hidden)").waitFor();
    const stored = await h.call("/api/garantias/report-1");
    assert.equal(stored.body.firma, h.evidence);
    assert.deepEqual(stored.body.evidencias, [h.evidence]);
    assert.deepEqual(stored.body.evidenciasRefaccion, [h.evidence]);
    assert.equal(stored.body.folio, "GAR-000001");
    phase = "company-first unit selection";
    await page.locator("#rwNewReport").click();
    assert.ok(await page.locator("#rwUnitPicker").isDisabled());
    assert.equal(await page.locator("#rwUnitPicker option").count(), 1);
    const companyBox = await page.locator("#empresa").boundingBox();
    const unitBox = await page.locator("#rwUnitPicker").boundingBox();
    assert.ok(
      companyBox.y < unitBox.y,
      "Company must appear before unit picker",
    );
    await page.locator("#empresa").selectOption("ANS");
    await page.waitForFunction(
      () => document.querySelectorAll("#rwUnitPicker option").length === 12,
    );
    assert.ok(
      (
        await page
          .locator("#rwUnitPicker option")
          .evaluateAll((os) => os.slice(1).map((o) => o.value))
      ).every((id) => Number(id.split("-")[1]) <= 11),
    );
    await page.locator("#rwFormNext").click();
    assert.ok(
      await page.locator("#rw-form-step-0").isVisible(),
      "A unit must be selected",
    );
    await page.locator("#rwUnitPicker").selectOption("unit-1");
    assert.equal(await page.locator("#numeroObra").inputValue(), "OB-1");
    await page.locator("#empresa").selectOption("Transportes del Pacífico");
    assert.equal(await page.locator("#numeroEconomico").inputValue(), "");
    assert.equal(await page.locator("#numeroObra").inputValue(), "Pendiente");
    assert.equal(await page.locator("#modelo").inputValue(), "Pendiente");
    assert.equal(await page.locator("#kilometraje").inputValue(), "");
    assert.deepEqual(
      await page
        .locator("#rwUnitPicker option")
        .evaluateAll((os) => os.slice(1).map((o) => o.value)),
      ["unit-12", "unit-13", "unit-14"],
    );
    await page.locator("#rwUnitPicker").selectOption("unit-14");
    assert.equal(await page.locator("#numeroEconomico").inputValue(), "334");
    await page.locator("#rwManualUnit").click();
    assert.ok(await page.locator("#numeroEconomico").isVisible());
    await page.locator("#numeroEconomico").fill("FUTURA-01");
    await page.locator("#empresa").selectOption("ANS");
    assert.equal(await page.locator("#numeroEconomico").inputValue(), "");
    assert.ok(!(await page.locator("#numeroEconomico").isVisible()));
    await page.locator("#rwUnitPicker").selectOption("unit-2");
    assert.equal(await page.locator("#numeroObra").inputValue(), "Pendiente");
    assert.equal(await page.locator("#modelo").inputValue(), "Pendiente");
    await page.screenshot({
      path: path.join(out, engine + "-company-unit.png"),
      fullPage: true,
    });
    await page.locator("#cancelReportBtn").click();
    phase = "fleet companies";
    await page.locator("#navFleetBtn").click();
    await page.locator(".rw-company-card").first().waitFor();
    assert.equal(await page.locator(".rw-company-card").count(), 2);
    await page.screenshot({
      path: path.join(out, engine + "-companies.png"),
      fullPage: true,
    });
    await page
      .locator(".rw-company-card")
      .filter({ has: page.getByRole("heading", { name: "ANS", exact: true }) })
      .click();
    assert.equal(await page.locator(".rw-unit-card").count(), 11);
    await page.screenshot({
      path: path.join(out, engine + "-fleet.png"),
      fullPage: true,
    });
    phase = "fleet detail";
    await page.locator("[data-unit-id=unit-1]").click();
    await page.locator("#fleetCloseDetailBtn").waitFor();
    await page.getByRole("tab", { name: "Reportes", exact: true }).click();
    await page
      .locator("#rw-tab-rw-fleet-detail-body-reports .table-row")
      .waitFor();
    await page.screenshot({
      path: path.join(out, engine + "-fleet-detail.png"),
    });
    await page.locator("#fleetCloseDetailBtn").click();
    assert.equal(
      await page.locator("#fleetDetailModalRoot:not(.hidden)").count(),
      0,
    );
    phase = "QR batch";
    await page.locator("#rwFleetQr").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#rwQrDownload").click(),
    ]);
    await download.saveAs(path.join(out, engine + "-labels.pdf"));
    await page.locator("#rwDialog .rw-close").click();
    const codes = (
      await h.call("/api/report-qr/batch", {
        method: "POST",
        body: { unitIds: ["unit-1"] },
      })
    ).body.units;
    phase = "scan and prefill";
    await page.goto(h.url + "/?reportqr=" + codes[0].token);
    await page.locator("#rwDialog[open]").waitFor();
    await page
      .getByRole("button", { name: "+ Registrar reporte", exact: true })
      .click();
    await page.locator("#rw-form-step-0").waitFor();
    assert.equal(await page.locator("#numeroEconomico").inputValue(), "321");
    assert.equal(await page.locator("#empresa").inputValue(), "ANS");
    assert.equal(await page.locator("#modelo").inputValue(), "i8");
    await page.screenshot({
      path: path.join(out, engine + "-form.png"),
      fullPage: true,
    });
    phase = "create report";
    await page.locator("#rwFormNext").click();
    await page
      .locator("#descripcionFallo")
      .fill("Falla registrada mediante QR de prueba.");
    await page.locator("#rwFormNext").click();
    await page.locator("#reportForm button[type=submit]").click();
    await page.locator("#boardPanel:not(.hidden)").waitFor();
    assert.equal(
      (await h.db.query("SELECT count(*)::int n FROM garantias")).rows[0].n,
      9,
    );
    phase = "secondary panels";
    for (const [nav, panel] of [
      ["navAnalyticsBtn", "analyticsPanel"],
      ["navHistoryBtn", "historyPanel"],
      ["navScheduleBtn", "schedulePanel"],
      ["navServicesBtn", "servicesPanel"],
      ["navPartsBtn", "partsPanel"],
      ["navStockBtn", "stockPanel"],
      ["navCobranzaBtn", "cobranzaPanel"],
      ["navCampaignsBtn", "campaignsPanel"],
      ["navUsersBtn", "usersPanel"],
      ["navCompaniesBtn", "companiesPanel"],
    ]) {
      await page.locator("#" + nav).click();
      await page.locator("#" + panel + ":not(.hidden)").waitFor();
    }
    phase = "mobile";
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#workspaceMenu").click();
    await page.locator("#navFleetBtn").click();
    if (await page.locator(".rw-company-card").count())
      await page
        .locator(".rw-company-card")
        .filter({
          has: page.getByRole("heading", { name: "ANS", exact: true }),
        })
        .click();
    await page.locator(".rw-unit-card").first().waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Mobile fleet must fit viewport",
    );
    await page.screenshot({
      path: path.join(out, engine + "-mobile-fleet.png"),
      fullPage: true,
    });
    await page.locator("[data-unit-id=unit-1]").click();
    await page.locator("#fleetCloseDetailBtn").click();
    await page.locator("#workspaceMenu").click();
    await page.locator("#navBoardBtn").click();
    await page.locator(".rw-report-row").first().waitFor();
    await page.screenshot({
      path: path.join(out, engine + "-mobile-reports.png"),
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Mobile reports must fit viewport",
    );
    phase = "mobile form";
    await page.locator("#rwNewReport").click();
    await page.locator("#empresa").selectOption("ANS");
    await page.locator("#rwUnitPicker").selectOption("unit-2");
    await page.screenshot({
      path: path.join(out, engine + "-mobile-company-unit.png"),
      fullPage: true,
    });
    await page.locator("#numeroObra").fill("   ");
    await page.locator("#modelo").fill("");
    await page.locator("#rwFormNext").click();
    await page.screenshot({
      path: path.join(out, engine + "-mobile-form.png"),
      fullPage: true,
    });
    await page
      .locator("#descripcionFallo")
      .fill("Reporte con datos técnicos pendientes.");
    await page.locator("#rwFormNext").click();
    await page.locator("#reportForm button[type=submit]").click();
    await page.locator("#boardPanel:not(.hidden)").waitFor();
    const pending = (
      await h.db.query(
        "SELECT numero_obra,modelo,numero_economico,empresa,fleet_unit_id FROM garantias WHERE descripcion_fallo='Reporte con datos técnicos pendientes.'",
      )
    ).rows[0];
    assert.deepEqual(pending, {
      numero_obra: "Pendiente",
      modelo: "Pendiente",
      numero_economico: "322",
      empresa: "ANS",
      fleet_unit_id: "unit-2",
    });
    const originalUnit = (
      await h.db.query(
        "SELECT numero_obra,modelo FROM fleet_units WHERE id='unit-2'",
      )
    ).rows[0];
    assert.deepEqual(
      originalUnit,
      { numero_obra: "", modelo: "   " },
      "Defaults must not overwrite the fleet record",
    );
    phase = "supervisor scope";
    const sc = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await sc.addInitScript(
      (t) => localStorage.setItem("carlabToken", t),
      h.token("supervisor"),
    );
    const sp = await sc.newPage();
    sp.on("pageerror", (e) => errors.push(e.message));
    await sp.goto(h.url);
    await sp.locator(".rw-company-card").first().waitFor();
    assert.equal(await sp.locator(".rw-company-card").count(), 1);
    assert.equal(await sp.locator("#navNewReportBtn:not(.hidden)").count(), 0);
    await sc.close();
    phase = "operator QR and session return";
    const oc = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await oc.addInitScript(
      (t) => localStorage.setItem("carlabToken", t),
      h.token("operator"),
    );
    const op = await oc.newPage();
    op.on("pageerror", (e) => errors.push(e.message));
    await op.goto(h.url + "/?reportqr=" + codes[0].token);
    await op.locator("#rwDialog[open]").waitFor();
    await op
      .getByRole("button", { name: "+ Registrar reporte", exact: true })
      .click();
    assert.equal(await op.locator("#empresa").inputValue(), "ANS");
    assert.ok(await op.locator("#empresa").isDisabled());
    assert.equal(await op.locator("#numeroEconomico").inputValue(), "321");
    await op.locator("#rwFormNext").click();
    await op
      .locator("#descripcionFallo")
      .fill("Reporte del operador con etiqueta de su empresa.");
    await op.locator("#rwFormNext").click();
    await op.locator("#reportForm button[type=submit]").click();
    await op.locator("#boardPanel:not(.hidden)").waitFor();
    assert.equal(
      (await h.db.query("SELECT count(*)::int n FROM garantias")).rows[0].n,
      11,
    );
    const foreign = (
      await h.call("/api/report-qr/batch", {
        method: "POST",
        body: { unitIds: ["unit-14"] },
      })
    ).body.units[0];
    await op.goto(h.url + "/?reportqr=" + foreign.token);
    await op
      .getByRole("heading", { name: "No se pudo abrir la unidad" })
      .waitFor();
    await oc.close();
    const guest = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const gp = await guest.newPage();
    gp.on("pageerror", (e) => errors.push(e.message));
    await gp.goto(h.url + "/?reportqr=" + codes[0].token);
    phase = "login contrast and responsive access";
    await gp.setViewportSize({ width: 1440, height: 1000 });
    await gp.screenshot({
      path: path.join(out, engine + "-login.png"),
      fullPage: true,
    });
    const loginColors = await gp.evaluate(() => {
      const read = (sel) => {
        const s = getComputedStyle(document.querySelector(sel));
        return {
          color: s.color,
          background: s.backgroundColor,
          border: s.borderColor,
        };
      };
      return {
        label: read("label[for=loginEmail]"),
        input: read("#loginEmail"),
        title: read("#loginPane h2"),
        button: read("#loginForm button[type=submit]"),
        card: read(".auth-card"),
      };
    });
    assert.equal(loginColors.card.background, "rgb(255, 255, 255)");
    assert.equal(loginColors.input.color, "rgb(23, 34, 55)");
    assert.equal(loginColors.label.color, "rgb(52, 67, 91)");
    assert.equal(loginColors.title.color, "rgb(23, 34, 55)");
    assert.equal(loginColors.button.background, "rgb(190, 46, 104)");
    await gp.locator("#tabRegisterBtn").click();
    await gp.locator("#registerPane:not(.hidden)").waitFor();
    await gp.screenshot({
      path: path.join(out, engine + "-register.png"),
      fullPage: true,
    });
    await gp.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await gp.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await gp.screenshot({
      path: path.join(out, engine + "-mobile-register.png"),
      fullPage: true,
    });
    await gp.locator("#tabLoginBtn").click();
    await gp.locator("#rwPasswordToggle").click();
    assert.equal(
      await gp.locator("#loginPassword").getAttribute("type"),
      "text",
    );
    await gp.locator("#rwPasswordToggle").click();
    assert.equal(
      await gp.locator("#loginPassword").getAttribute("type"),
      "password",
    );
    await gp.screenshot({
      path: path.join(out, engine + "-mobile-login.png"),
      fullPage: true,
    });
    await gp.locator("#loginEmail").fill("admin@carlab.local");
    await gp.locator("#loginPassword").fill("Admin123*");
    await gp.locator("#loginForm button[type=submit]").click();
    await gp
      .getByRole("heading", { name: "Unidad 321", exact: true })
      .waitFor();
    await gp.locator("#rwDialog .rw-close").click();
    await gp.locator("#workspaceMenu").click();
    await gp.locator("#logoutBtn").click();
    await gp.locator("#loginView:not(.hidden)").waitFor();
    assert.equal(
      await gp.evaluate(() => localStorage.getItem("carlabToken")),
      null,
    );
    await guest.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS " +
        engine +
        ": report flow, signatures/evidence, fleet tabs, 11-label PDF, QR prefill, 10 secondary panels, mobile and supervisor scope.",
    );
  } catch (error) {
    console.error("PHASE", phase, "ERRORS", errors);
    if (page)
      await page
        .screenshot({
          path: path.join(out, engine + "-failure.png"),
          fullPage: true,
        })
        .catch(() => {});
    throw error;
  } finally {
    await browser?.close();
    await h.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
