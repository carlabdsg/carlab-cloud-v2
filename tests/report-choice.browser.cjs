const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { setup } = require("./ac-guest-fixture.cjs");
const engine = process.env.BROWSER_ENGINE || "chromium",
  out = process.env.QA_OUTPUT || "/tmp/report-choice-qa";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const h = await setup();
  const qrConfig = (await h.call("/api/report-qr/settings?company=ANS")).body;
  assert.equal(
    (
      await h.call("/api/report-qr/settings", {
        method: "PATCH",
        body: { company: "ANS", mode: "dual", version: qrConfig.version },
      })
    ).status,
    200,
  );
  let browser,
    page,
    admin,
    phase = "setup";
  const errors = [];
  const shot = (p, name) =>
    p.screenshot({
      path: path.join(out, engine + "-" + name + ".png"),
      fullPage: true,
    });
  try {
    const codes = (
      await h.call("/api/report-qr/batch", {
        method: "POST",
        body: { unitIds: ["unit-1", "unit-2"] },
      })
    ).body.units;
    browser = await pw[engine].launch(
      engine === "chromium"
        ? { channel: "chrome", headless: true }
        : { headless: true },
    );
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(h.url + "/?reportqr=" + codes[0].token);
    await page.locator("#reportChoices:not([hidden])").waitFor();
    assert.ok(page.url().includes("/reportar.html?code="));
    assert.equal(await page.locator("#unitNumber").innerText(), "Unidad 321");
    assert.equal(await page.locator("#unitCompany").innerText(), "ANS");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("carlabToken")),
      null,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await shot(page, "choice-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await shot(page, "choice-desktop");
    phase = "general and back";
    await page.locator("#generalChoice").click();
    await page.locator("#guestForm:not([hidden])").waitFor();
    assert.ok(page.url().includes("/reporte-qr.html?code="));
    await page.locator("#chooseReport").click();
    await page.locator("#acChoice").click();
    await page.locator("#guestForm:not([hidden])").waitFor();
    assert.ok(page.url().includes("/ac-reporte-qr.html?reportqr="));
    assert.ok(await page.locator("#pendingLinkNote").isVisible());
    assert.match(
      await page.locator("#unitModel").innerText(),
      /Marca por confirmar/,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    phase = "pending submission";
    const fill = async () => {
      await page.locator("#guestName").fill("Operador QR sin cuenta");
      await page.locator("#guestPhone").fill("6671234567");
      await page
        .locator("#guestDescription")
        .fill("El equipo no enfría durante el recorrido y muestra una alarma.");
      await page.locator("#guestCategory").selectOption("no_enfria");
      await page.locator("#guestEquipmentState").selectOption("parcial");
      await page.locator("#guestPriority").selectOption("urgente");
      await page.locator("#guestLocation").fill("Terminal de autobuses");
      await page
        .locator("#cameraInput")
        .setInputFiles(path.join(__dirname, "fixtures/guest-photo.jpg"));
      await page.locator("#photoPreview img").waitFor();
      await page.locator("#guestConfirm").check();
    };
    await fill();
    await shot(page, "pending-form");
    let interrupted = false;
    await page.route(
      "**/api/public/ac-report-qr/from-report/*",
      async (route) => {
        if (route.request().method() === "POST" && !interrupted) {
          interrupted = true;
          await route.fetch();
          await route.abort("failed");
        } else await route.continue();
      },
    );
    await page.locator("#sendReport").click();
    await page
      .getByRole("button", { name: "Verificar envío", exact: true })
      .waitFor();
    await page.locator("#sendReport").click();
    await page.locator("#receipt:not([hidden])").waitFor();
    assert.equal(await page.locator("#receiptFolio").innerText(), "PAC-000001");
    assert.match(
      await page.locator("#receiptState").innerText(),
      /Pendiente de vincular/,
    );
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM ac_qr_intakes")).rows[0].n,
      1,
    );
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM ac_incidents")).rows[0].n,
      0,
    );
    await shot(page, "pending-receipt");
    await page.reload();
    await page.locator("#receipt:not([hidden])").waitFor();
    phase = "admin inbox";
    const ac = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await ac.addInitScript(
      (t) => localStorage.setItem("carlabToken", t),
      h.token("admin"),
    );
    admin = await ac.newPage();
    admin.setDefaultTimeout(15000);
    admin.on("pageerror", (e) => errors.push(e.message));
    await admin.goto(h.url + "/hispacold.html");
    await admin.locator(".aca-nav [data-view=incidents]").click();
    await admin.locator("[data-ai=intakes]").waitFor();
    assert.match(await admin.locator("[data-ai=intakes]").innerText(), /\(1\)/);
    await admin.locator("[data-ai=intakes]").click();
    await admin.locator("[data-aqi=detail]").waitFor();
    assert.ok(
      await admin
        .locator(".aca-nav [data-view=incidents]")
        .evaluate((el) => el.classList.contains("selected")),
    );
    await shot(admin, "admin-inbox");
    await admin.locator("#ac-bell").click();
    await admin
      .locator("#ac-notification-panel [data-ac-action=notice-open]")
      .filter({ hasText: "PAC-000001" })
      .click();
    await admin
      .locator("#aqi-candidate-note")
      .getByText(/No hay coincidencias/)
      .waitFor();
    await admin.getByText("Fotografías (1)", { exact: true }).click();
    assert.equal(await admin.locator(".aci-photos img").count(), 1);
    assert.match(
      await admin.locator("#hc-main").innerText(),
      /Operador QR sin cuenta/,
    );
    phase = "admin associate existing unit";
    const company = (
      await h.call("/api/ac/fleet/companies", {
        method: "POST",
        body: { name: "ANS" },
      })
    ).body;
    const destination = (
      await h.call("/api/ac/fleet/units", {
        method: "POST",
        body: { companyId: company.id, unit: "321", brand: "hispacold" },
      })
    ).body.ids[0];
    await admin.locator("#aqi-search button[type=submit]").click();
    await admin
      .locator('#aqi-unit option[value="' + destination + '"]')
      .waitFor({ state: "attached" });
    await admin.locator("#aqi-unit").selectOption(destination);
    await admin.locator("#aqi-confirm").check();
    await admin.evaluate(() => scrollTo(0, 0));
    await shot(admin, "admin-association");
    await admin.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await admin.evaluate(() => scrollTo(0, 0));
    assert.ok((await admin.locator("#aqi-unit").boundingBox()).height >= 44);
    await shot(admin, "admin-association-mobile");
    await admin.setViewportSize({ width: 1440, height: 1000 });
    await admin.locator("#aqi-link button[type=submit]").click();
    await admin.locator("#aci-dialog").waitFor();
    assert.match(await admin.locator("#aci-dialog").innerText(), /PAC-000001/);
    assert.match(
      await admin.locator("#aci-dialog").innerText(),
      /Operador QR sin cuenta/,
    );
    assert.equal((await h.call("/api/ac/qr-intakes")).body.total, 0);
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM ac_incidents")).rows[0].n,
      1,
    );
    await shot(admin, "admin-linked-incident");
    phase = "saved acknowledgement after AC unit now exists";
    await page.reload();
    await page.locator("#receipt:not([hidden])").waitFor();
    assert.equal(await page.locator("#receiptFolio").innerText(), "PAC-000001");
    assert.ok(!(await page.locator("#guestForm").isVisible()));
    phase = "automatic match for Eberspacher";
    await h.call("/api/ac/fleet/units", {
      method: "POST",
      body: { companyId: company.id, unit: "322", brand: "eberspaecher" },
    });
    await page.goto(h.url + "/?reportqr=" + codes[1].token);
    await page.locator("#acChoice").click();
    await page.locator("#guestForm:not([hidden])").waitFor();
    assert.ok(!(await page.locator("#pendingLinkNote").isVisible()));
    assert.match(await page.locator("#unitModel").innerText(), /Eberspächer/);
    await fill();
    await page.locator("#sendReport").click();
    await page.locator("#receipt:not([hidden])").waitFor();
    assert.equal(await page.locator("#receiptFolio").innerText(), "IAC-000002");
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM ac_incidents")).rows[0].n,
      2,
    );
    phase = "invalid code";
    await page.goto(h.url + "/reportar.html?code=wrong");
    assert.ok(!(await page.locator("#reportChoices").isVisible()));
    assert.deepEqual(errors, []);
    console.log(
      "PASS " +
        engine +
        ": existing QR choice, general route, AC pending submission and retry, admin inbox/association with photo and contact, immutable receipt, direct Eberspacher match, desktop/mobile and no page errors.",
    );
  } catch (e) {
    console.error("PHASE", phase, errors);
    (await admin) && (await shot(admin, "admin-failure").catch(() => {}));
    (await page) && (await shot(page, "failure").catch(() => {}));
    throw e;
  } finally {
    await browser?.close();
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
