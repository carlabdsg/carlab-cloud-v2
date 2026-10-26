const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { setup } = require("./ac-guest-fixture.cjs");
const engine = process.env.BROWSER_ENGINE || "chromium",
  out = process.env.QA_OUTPUT || "/tmp/guest-report-qa";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const h = await setup();
  let browser,
    page,
    admin,
    phase = "setup";
  const errors = [];
  try {
    const code = h.units[0].qr.token;
    browser = await pw[engine].launch(
      engine === "chromium"
        ? { channel: "chrome", headless: true }
        : { headless: true },
    );
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(h.url + h.units[0].qr.path);
    await page.locator("#guestForm:not([hidden])").waitFor();
    assert.ok(page.url().includes("/ac-reporte-qr.html?code="));
    assert.equal(await page.locator("#unitNumber").innerText(), "Unidad 306");
    assert.equal(
      await page.locator("#unitCompany").innerText(),
      "Transportes QR",
    );
    assert.equal(
      await page.locator("#cameraInput").getAttribute("capture"),
      "environment",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("carlabToken")),
      null,
    );
    await page.screenshot({
      path: path.join(out, engine + "-guest-form-mobile.png"),
      fullPage: true,
    });
    phase = "photos and form";
    await page.locator("#guestName").fill("Operador visitante de prueba");
    await page.locator("#guestPhone").fill("6671234567");
    await page
      .locator("#guestDescription")
      .fill("El aire acondicionado deja de enfriar durante el recorrido.");
    await page.locator("#guestCategory").selectOption("no_enfria");
    await page.locator("#guestEquipmentState").selectOption("parcial");
    await page.locator("#guestPriority").selectOption("urgente");
    await page.locator("#guestLocation").fill("Terminal de autobuses");
    await page
      .locator("#photosInput")
      .setInputFiles(path.join(__dirname, "fixtures/guest-photo.jpg"));
    await page.locator("#photoPreview img").waitFor();
    assert.equal(await page.locator("#photoCount").innerText(), "1 / 4");
    await page.locator("#photoPreview button").click();
    assert.equal(await page.locator("#photoCount").innerText(), "0 / 4");
    await page
      .locator("#cameraInput")
      .setInputFiles(path.join(__dirname, "fixtures/guest-photo.jpg"));
    await page.locator("#photoPreview img").waitFor();
    await page.locator("#guestConfirm").check();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: path.join(out, engine + "-guest-ready.png"),
      fullPage: true,
    });
    // Simulate a lost response after the server saved the record. Retry must not duplicate it.
    phase = "uncertain response and retry";
    let interrupted = false;
    await page.route("**/api/public/ac-report-qr/*", async (route) => {
      if (route.request().method() === "POST" && !interrupted) {
        interrupted = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await page.locator("#sendReport").click();
    await page
      .getByRole("button", { name: "Verificar envío", exact: true })
      .waitFor();
    assert.ok(await page.locator("#guestName").isDisabled());
    await page.locator("#sendReport").click();
    await page.locator("#receipt:not([hidden])").waitFor();
    const folio = await page.locator("#receiptFolio").innerText();
    assert.equal(folio, "IAC-000001");
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM ac_incidents")).rows[0].n,
      1,
    );
    await page.screenshot({
      path: path.join(out, engine + "-guest-receipt.png"),
      fullPage: true,
    });
    await page.reload();
    await page.locator("#receipt:not([hidden])").waitFor();
    assert.equal(await page.locator("#receiptFolio").innerText(), folio);
    assert.ok(!(await page.locator("#guestForm").isVisible()));
    phase = "admin visibility";
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
    const card = admin.locator(".aci-card").filter({ hasText: folio });
    await card.waitFor();
    assert.match(await card.innerText(), /Visitante QR/);
    assert.match(await card.innerText(), /Nuevo/);
    await card.locator("[data-ai=detail]").click();
    await admin
      .getByText("Visitante QR · Reporte enviado sin cuenta", { exact: true })
      .waitFor();
    assert.match(
      await admin.locator("#aci-dialog").innerText(),
      /Operador visitante de prueba/,
    );
    assert.equal(await admin.locator("#aci-convert").count(), 1);
    assert.equal(await admin.locator("#aci-error").innerText(), "");
    await admin.screenshot({
      path: path.join(out, engine + "-admin-guest-ac.png"),
    });
    phase = "account link and another report";
    await page.locator("#accountLink").click();
    await page.locator("#loginForm").waitFor();
    assert.ok(page.url().includes("access=account"));
    await page.goto(h.url + h.units[0].qr.path);
    await page.locator("#receipt:not([hidden])").waitFor();
    await page.locator("#newReport").click();
    await page.locator("#guestForm:not([hidden])").waitFor();
    assert.equal(await page.locator("#guestName").inputValue(), "");
    assert.equal(await page.locator("#photoCount").innerText(), "0 / 4");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: path.join(out, engine + "-guest-form-desktop.png"),
      fullPage: true,
    });
    phase = "authorized account keeps unit access";
    await admin.goto(h.url + h.units[0].qr.path);
    await admin
      .locator("#acf-dialog h2")
      .filter({ hasText: "Unidad 306" })
      .waitFor();
    phase = "Eberspächer and unavailable label";
    await page.goto(h.url + h.units[1].qr.path);
    await page.locator("#guestForm:not([hidden])").waitFor();
    assert.match(await page.locator("#unitModel").innerText(), /Eberspächer/);
    await h.db.query("UPDATE ac_fleet_units SET active=FALSE WHERE id=$1", [
      h.units[1].id,
    ]);
    await page.reload();
    await page.locator("#retryLoad:not([hidden])").waitFor();
    assert.ok(!(await page.locator("#guestForm").isVisible()));
    phase = "invalid QR";
    await page.goto(h.url + "/ac-reporte-qr.html?code=wrong");
    assert.ok(!(await page.locator("#guestForm").isVisible()));
    assert.ok(
      (await page.locator("#loadMessage").innerText()).includes("Escanea"),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS " +
        engine +
        ": AC existing QR redirects, both brands, no account, camera/gallery photo controls, lost-response retry, one report, saved receipt, administrator review, authenticated link, mobile/desktop and invalid QR.",
    );
  } catch (e) {
    console.error("PHASE", phase, errors);
    await admin
      ?.screenshot({
        path: path.join(out, engine + "-admin-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    await page
      ?.screenshot({
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
