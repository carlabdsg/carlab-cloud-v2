const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { setup } = require("./ac-guest-fixture.cjs");
const engine = process.env.BROWSER_ENGINE || "chromium",
  out = process.env.QA_OUTPUT || "/tmp/qr-settings-qa";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const h = await setup();
  let browser,
    admin,
    visitor,
    phase = "setup";
  const errors = [];
  const screenshot = (p, n) =>
    p.screenshot({
      path: path.join(out, engine + "-" + n + ".png"),
      fullPage: true,
    });
  try {
    await h.db.query(
      "UPDATE fleet_units SET empresa='Reportes aus' WHERE id IN ('unit-1','unit-7')",
    );
    await h.db.query(
      "UPDATE fleet_units SET empresa='AUS DENISSE' WHERE id='unit-12'",
    );
    const batch = async () =>
      (
        await h.call("/api/report-qr/batch", {
          method: "POST",
          body: { unitIds: ["unit-1", "unit-7", "unit-12"] },
        })
      ).body.units;
    const original = await batch();
    browser = await pw[engine].launch(
      engine === "chromium"
        ? { channel: "chrome", headless: true }
        : { headless: true },
    );
    visitor = await browser.newPage({ viewport: { width: 390, height: 844 } });
    visitor.setDefaultTimeout(15000);
    visitor.on("pageerror", (e) => errors.push(e.message));
    const scan = async (i) =>
      visitor.goto(h.url + "/?reportqr=" + original[i].token);
    await scan(0);
    await visitor.locator("#guestForm:not([hidden])").waitFor();
    assert.ok(visitor.url().includes("/reporte-qr.html?code="));
    assert.match(await visitor.locator("h1").innerText(), /daños y garantías/);
    assert.ok(!(await visitor.locator("#chooseReport").isVisible()));
    await screenshot(visitor, "single-existing-qr");
    await scan(2);
    await visitor.locator("#reportChoices:not([hidden])").waitFor();
    assert.equal(
      await visitor.locator("#unitCompany").innerText(),
      "AUS DENISSE",
    );
    await screenshot(visitor, "denisse-default-dual");
    phase = "admin company mode";
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addInitScript(
      (t) => localStorage.setItem("carlabToken", t),
      h.token("admin"),
    );
    admin = await context.newPage();
    admin.setDefaultTimeout(15000);
    admin.on("pageerror", (e) => errors.push(e.message));
    const openFleet = async () => {
      await admin.goto(h.url);
      await admin.locator("#navFleetBtn").click();
      await admin
        .locator(".rw-company-card")
        .filter({
          has: admin.getByRole("heading", {
            name: "Reportes aus",
            exact: true,
          }),
        })
        .click();
    };
    await openFleet();
    await admin.locator("#rwFleetQrSettings").click();
    await admin.locator("#rwQrModeCurrent").waitFor();
    assert.equal(
      await admin.locator("#rwQrModeCurrent").innerText(),
      "Sencillo",
    );
    await screenshot(admin, "mode-desktop");
    await admin.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await screenshot(admin, "mode-mobile");
    const save = async (mode) => {
      await admin.locator("#rwQrModeForm input[value=" + mode + "]").check();
      await admin.locator("#rwQrModeSave").click();
      await admin
        .locator("#rwQrModeMessage")
        .filter({ hasText: "Guardado." })
        .waitFor();
    };
    await save("dual");
    await scan(0);
    await visitor.locator("#reportChoices:not([hidden])").waitFor();
    await visitor.locator("#acChoice").click();
    await visitor.locator("#guestForm:not([hidden])").waitFor();
    assert.ok(await visitor.locator("#pendingLinkNote").isVisible());
    await visitor.locator("#guestName").fill("Operador de prueba");
    await visitor.locator("#guestPhone").fill("6671234567");
    await visitor.locator("#guestCategory").selectOption("no_enfria");
    await visitor
      .locator("#guestDescription")
      .fill("El equipo de aire acondicionado no enfría durante el recorrido.");
    await visitor.locator("#guestConfirm").check();
    phase = "disable rejects already-open AC form";
    await save("single");
    await visitor.locator("#sendReport").click();
    await visitor.waitForURL("**/reporte-qr.html?code=*");
    await visitor.locator("#guestForm:not([hidden])").waitFor();
    assert.ok(!(await visitor.locator("#chooseReport").isVisible()));
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM ac_qr_intakes")).rows[0].n,
      0,
    );
    await visitor.goto(
      h.url + "/ac-reporte-qr.html?reportqr=" + original[0].token,
    );
    await visitor.waitForURL("**/reporte-qr.html?code=*");
    phase = "persisted setting and one-fleet override";
    await admin.setViewportSize({ width: 1440, height: 1000 });
    await openFleet();
    await admin.locator("#rwFleetQrSettings").click();
    await admin.locator("#rwQrModeCurrent").waitFor();
    assert.equal(
      await admin.locator("#rwQrModeCurrent").innerText(),
      "Sencillo",
    );
    await admin.locator("#rwDialog .rw-close").click();
    await admin
      .getByRole("combobox", { name: "Flota", exact: true })
      .selectOption("Regional");
    await admin.locator("#rwFleetQrSettings").click();
    await admin.locator("#rwQrModeCurrent").waitFor();
    await save("dual");
    await screenshot(admin, "fleet-override");
    await scan(0);
    await visitor.locator("#reportChoices:not([hidden])").waitFor();
    await scan(1);
    await visitor.locator("#guestForm:not([hidden])").waitFor();
    assert.ok(visitor.url().includes("/reporte-qr.html?code="));
    await admin.locator("#rwDialog .rw-close").click();
    await admin
      .getByRole("combobox", { name: "Flota", exact: true })
      .selectOption("");
    await admin.locator("#rwFleetQrSettings").click();
    await admin.locator("#rwQrModeCurrent").waitFor();
    assert.match(await admin.locator("#rwQrModeCurrent").innerText(), /Mixto/);
    await screenshot(admin, "mixed-company");
    const updated = await batch();
    assert.deepEqual(
      updated.map((u) => u.token),
      original.map((u) => u.token),
    );
    assert.deepEqual(
      updated.map((u) => u.reportOptions.ac),
      [true, false, true],
    );
    phase = "non-admin cannot see control";
    const opsContext = await browser.newContext();
    await opsContext.addInitScript(
      (t) => localStorage.setItem("carlabToken", t),
      h.token("ops"),
    );
    const ops = await opsContext.newPage();
    await ops.goto(h.url);
    await ops.locator("#navFleetBtn").click();
    await ops
      .locator(".rw-company-card")
      .filter({
        has: ops.getByRole("heading", { name: "Reportes aus", exact: true }),
      })
      .click();
    assert.equal(await ops.locator("#rwFleetQrSettings").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS " +
        engine +
        ": admin company/fleet modes, saved settings, mobile/desktop, old QR reuse, single redirect, direct AC denial, already-open form revocation, Denisse dual, mixed modes and hidden non-admin control.",
    );
  } catch (e) {
    console.error("PHASE", phase, errors);
    await admin
      ?.screenshot({
        path: path.join(out, engine + "-admin-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    await visitor
      ?.screenshot({
        path: path.join(out, engine + "-visitor-failure.png"),
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
