const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setup } = require("./ac-qr-fixture.cjs");
const engine = process.env.BROWSER_ENGINE || "chromium";
const out = process.env.QA_OUTPUT || require("node:os").tmpdir();
fs.mkdirSync(out, { recursive: true });

(async () => {
  const { h, call, ids } = await setup();
  let browser;
  let phase = "setup";
  try {
    const original = (await call("/fleet/units/" + ids[0])).body.unit;
    const added = await call("/fleet/units", {
      method: "POST",
      body: {
        companyId: original.companyId,
        units: Array.from({ length: 20 }, (_, i) => ({
          unit: String(320 + i),
          brand: "hispacold",
        })),
      },
    });
    assert.equal(added.status, 201);
    browser = await playwright[engine].launch(
      engine === "chromium"
        ? { channel: "chrome", headless: true }
        : { headless: true },
    );
    const errors = [];
    for (const user of ["admin", "hispa"]) {
      for (const mobile of [false, true]) {
        const label = `${engine}-${user}-${mobile ? "movil" : "escritorio"}`;
        phase = label + ": abrir empresa";
        const context = await browser.newContext(
          mobile
            ? playwright.devices["iPhone 13"]
            : { viewport: { width: 1440, height: 900 } },
        );
        await context.addInitScript(
          (token) => localStorage.setItem("carlabToken", token),
          h.token(user, user === "admin" ? "admin" : "supervisor_ac"),
        );
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(
          h.url +
            (user === "admin" ? "/hispacold.html" : "/ac-supervisor.html"),
        );
        await page
          .locator(
            user === "admin"
              ? ".aca-nav [data-view=companies]"
              : ".acp-nav [data-ac-view=companies]",
          )
          .click();
        await page.locator("[data-aportal=company]").first().click();
        await page.locator(".acf-unit").first().waitFor();
        const activate = (el) => (mobile ? el.tap() : el.click());
        const assertClosed = async (id, y) => {
          await page.locator("#acf-dialog").waitFor({ state: "hidden" });
          await page.waitForFunction(
            (id) => document.activeElement?.dataset.id === id,
            id,
          );
          const state = await page.evaluate(() => ({
            open: document.querySelectorAll("dialog[open]").length,
            focusOnMain: document.querySelector("#hc-main").matches(":focus"),
            scrollY,
            overflow: document.documentElement.scrollWidth > innerWidth + 2,
          }));
          assert.equal(state.open, 0);
          assert.equal(state.focusOnMain, false);
          assert.equal(state.overflow, false);
          // Cards lift 3px on hover; touch WebKit can include that offset
          // when restoring focus. Allow it, but reject a jump in the list.
          assert(
            Math.abs(state.scrollY - y) <= 4,
            `La posición de lectura cambió: ${y} → ${state.scrollY}`,
          );
        };
        for (const [i, closeMethod] of ["x", "cerrar", "escape"].entries()) {
          phase = label + ": abrir y cerrar con " + closeMethod;
          const card = page.locator(".acf-unit").nth(i ? 4 : 0);
          const id = await card.getAttribute("data-id");
          await card.scrollIntoViewIfNeeded();
          const y = await page.evaluate(() => scrollY);
          await activate(card);
          await page.locator("#acf-dialog[open]").waitFor();
          assert.equal(
            await page.locator("#acf-dialog .acf-dialog-close").isVisible(),
            true,
          );
          if (closeMethod === "escape") await page.keyboard.press("Escape");
          else
            await activate(
              closeMethod === "x"
                ? page.locator(".acf-dialog-close")
                : page
                    .locator("#acf-dialog")
                    .getByRole("button", { name: "Cerrar", exact: true }),
            );
          await assertClosed(id, y);
        }
        phase =
          label +
          ": la página no recibe un contorno y el teclado conserva su indicador";
        await page.evaluate(() =>
          document.querySelector("#hc-main").focus({ preventScroll: true }),
        );
        assert.equal(
          await page
            .locator("#hc-main")
            .evaluate((el) => getComputedStyle(el).outlineStyle),
          "none",
        );
        if (!mobile) {
          const card = page.locator(".acf-unit").nth(4);
          await card.focus();
          // On macOS WebKit, Option+Tab includes buttons even when the OS
          // preference for full keyboard access is off.
          await page.keyboard.press(
            engine === "webkit" && process.platform === "darwin"
              ? "Alt+Tab"
              : "Tab",
          );
          const active = page.locator(".acf-unit:focus-visible");
          await active.waitFor();
          const id = await active.getAttribute("data-id");
          assert.equal(
            await active.evaluate((el) => getComputedStyle(el).outlineStyle),
            "solid",
          );
          const y = await page.evaluate(() => scrollY);
          await page.keyboard.press("Enter");
          await page.locator("#acf-dialog[open]").waitFor();
          await page.keyboard.press("Escape");
          await assertClosed(id, y);
        }
        if (user === "admin") {
          phase = label + ": otros diálogos de flotas regresan a su botón";
          for (const action of ["new-unit", "companies"]) {
            const trigger = page.locator(`[data-af="${action}"]`).first();
            await activate(trigger);
            await page.locator("#acf-dialog[open]").waitFor();
            await activate(page.locator(".acf-dialog-close"));
            await page.locator("#acf-dialog").waitFor({ state: "hidden" });
            assert.equal(
              await page.evaluate(() => document.activeElement?.dataset.af),
              action,
            );
          }
        }
        // Show the actual fleet immediately after closing a unit, as reported.
        const card = page.locator(".acf-unit").first();
        await activate(card);
        await page.locator("#acf-dialog[open]").waitFor();
        await activate(page.locator(".acf-dialog-close"));
        await page.locator("#acf-dialog").waitFor({ state: "hidden" });
        await page.screenshot({
          path: path.join(out, label + "-corregido.png"),
        });
        await context.close();
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${engine}: 22 unidades; admin y supervisor; escritorio y teléfono; cierres repetidos con X, Cerrar y Escape; foco regresa a la tarjeta; se conserva el desplazamiento; teclado visible; sin contorno sobre la página ni errores JS.`,
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
