const { chromium, devices } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setup } = require("./ac-qr-fixture.cjs");
const out = process.env.QA_OUTPUT || require("node:os").tmpdir();
fs.mkdirSync(out, { recursive: true });

(async () => {
  const { h, call, ids, order } = await setup();
  let browser;
  let phase = "setup";
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const errors = [];
    for (const [index, brand, profile] of [
      [0, "hispacold", { viewport: { width: 1440, height: 1000 } }],
      [1, "eberspaecher", devices["iPhone 13"]],
    ]) {
      phase = brand + ": eliminar desde la ficha";
      const context = await browser.newContext(profile);
      await context.addInitScript(
        (token) => localStorage.setItem("carlabToken", token),
        h.token(),
      );
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => errors.push(e.message));
      const id = ids[index];
      const original = (await call("/fleet/units/" + id)).body.unit;
      const qr = (await call("/fleet/units/" + id + "/qr")).body;
      await page.goto(h.url + "/hispacold.html?unit=" + id);
      const remove = async () => {
        await page.locator("[data-af=delete-unit]").click();
        await page
          .locator("#acf-removal-form [name=reason]")
          .fill("Retiro temporal para prueba de reincorporación");
        await page.locator("#acf-removal-form button[type=submit]").click();
        await page.locator("#acf-dialog").waitFor({ state: "hidden" });
      };
      await remove();
      assert.equal((await call("/fleet/units/" + id)).body.unit.active, false);

      phase = brand + ": registrar de nuevo con el mismo número";
      await page.locator("[data-af=new-unit]").first().click();
      await page
        .locator("#acf-unit-form [name=companyId]")
        .selectOption(original.companyId);
      await page
        .locator("#acf-unit-form [name=unit]")
        .fill(" " + original.unit + " ");
      if (index === 0) {
        await page
          .locator("#acf-unit-form [name=brand]")
          .selectOption("eberspaecher");
        await page.locator("#acf-unit-form button[type=submit]").click();
        await page.waitForFunction(() =>
          document
            .querySelector("#acf-error")
            ?.textContent.includes("Selecciona esa marca"),
        );
        assert.equal(
          await page.locator("#acf-unit-form [name=unit]").inputValue(),
          " " + original.unit + " ",
        );
      }
      await page.locator("#acf-unit-form [name=brand]").selectOption(brand);
      await page.locator("#acf-unit-form button[type=submit]").click();
      await page
        .locator("#acf-dialog .acf-detail-heading h2")
        .filter({ hasText: "Unidad " + original.unit })
        .waitFor();
      const restored = (await call("/fleet/units/" + id)).body;
      assert.equal(restored.unit.active, true);
      assert.equal(restored.unit.model, "i8");
      assert.equal(restored.unit.version, original.version + 2);
      if (index === 0) assert(restored.orders.some((o) => o.id === order.id));
      assert.deepEqual((await call("/fleet/units/" + id + "/qr")).body, qr);
      assert.match(
        await page.locator("#hc-toast").textContent(),
        /Unidad reincorporada/,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 2,
        ),
        false,
      );
      await page.screenshot({
        path: path.join(out, "reincorporada-" + brand + ".png"),
        fullPage: true,
      });

      if (index === 0) {
        phase = "lote desde el filtro de eliminadas vuelve a la flota activa";
        await remove();
        await page.locator(".acp-filter-details > summary").click();
        await page.locator("#acf-filters [name=archived]").selectOption("true");
        await page.locator("#acf-filters button[type=submit]").click();
        await page.locator('[data-af=detail][data-id="' + id + '"]').waitFor();
        await page.locator("[data-af=new-unit]").first().click();
        await page
          .locator("#acf-unit-form [name=companyId]")
          .selectOption(original.companyId);
        await page.locator("#acf-unit-form [name=brand]").selectOption(brand);
        await page
          .locator("#acf-unit-form summary")
          .filter({ hasText: "Registro por lote" })
          .click();
        await page
          .locator("#acf-unit-form [name=batch]")
          .fill(original.unit + "\n999");
        await page.locator("#acf-unit-form button[type=submit]").click();
        await page.locator("#acf-dialog").waitFor({ state: "hidden" });
        await page.waitForFunction(() =>
          document
            .querySelector("#hc-toast")
            ?.textContent.includes("1 nuevas · 1 reincorporadas"),
        );
        await page.locator('[data-af=detail][data-id="' + id + '"]').waitFor();
        await page.getByRole("button", { name: /Unidad 999,/ }).waitFor();
        assert.equal(
          await page.locator("#acf-filters [name=archived]").inputValue(),
          "",
        );
        assert.equal(
          (await call("/fleet/units/" + id)).body.unit.version,
          original.version + 4,
        );
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: reincorporación desde Registrar unidades en escritorio y teléfono; ambas marcas; historial y QR conservados; error de marca corregible; lote mixto desde eliminadas regresa a activas; sin errores JS ni desbordamiento.",
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
