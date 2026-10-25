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
  let browser,
    phase = "init",
    page;
  const errors = [];
  try {
    browser = await playwright[engine].launch(
      engine === "chromium"
        ? { channel: "chrome", headless: true }
        : { headless: true },
    );
    let index = 0;
    for (const user of ["hispa", "admin"])
      for (const mobile of [false, true]) {
        const label = `${engine}-${user}-${mobile ? "mobile" : "desktop"}`;
        phase = label + ": capture from fleet";
        const context = await browser.newContext(
          mobile
            ? playwright.devices["iPhone 13"]
            : { viewport: { width: 1440, height: 1000 } },
        );
        await context.addInitScript(
          (t) => localStorage.setItem("carlabToken", t),
          h.token(user, user === "admin" ? "admin" : "supervisor_ac"),
        );
        page = await context.newPage();
        page.setDefaultTimeout(12000);
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(
          h.url +
            (user === "admin" ? "/hispacold.html" : "/ac-supervisor.html") +
            "?unit=" +
            ids[0],
        );
        await page.locator("#acf-dialog[open]").waitFor();
        await page
          .getByRole("button", { name: "Reportar falla", exact: true })
          .click();
        await page.locator("#aci-dialog[open]").waitFor();
        await page
          .locator("#aci-selected-unit")
          .getByText("Unidad 306", { exact: true })
          .waitFor();
        await page.locator(".aci-category label").nth(index++).click();
        await page
          .locator("#aci-create textarea[name=description]")
          .fill(
            "Falla de enfriamiento al iniciar el recorrido. Se solicita evaluación del sistema.",
          );
        await page
          .locator("#aci-create select[name=priority]")
          .selectOption("urgente");
        await page
          .locator("#aci-create input[data-ai-file][multiple]")
          .setInputFiles({
            name: "evidencia.png",
            mimeType: "image/png",
            buffer: Buffer.from(
              await page.evaluate(() => {
                const c = document.createElement("canvas");
                c.width = 240;
                c.height = 160;
                const g = c.getContext("2d");
                g.fillStyle = "#087f83";
                g.fillRect(0, 0, 240, 160);
                g.fillStyle = "white";
                g.font = "18px sans-serif";
                g.fillText("Evidencia AC", 30, 80);
                return c.toDataURL("image/png").split(",")[1];
              }),
              "base64",
            ),
          });
        await page.locator("#aci-photo-list img").waitFor();
        assert.equal(
          await page.locator("input[capture=environment]").count(),
          1,
        );
        await page.screenshot({
          path: path.join(out, label + "-capture.png"),
          fullPage: true,
        });
        await page
          .getByRole("button", { name: "Enviar reporte", exact: true })
          .click();
        await page.locator(".aci-detail-heading h2").waitFor();
        const folio = await page.locator(".aci-detail-heading h2").innerText();
        let report = (await call("/incidents")).body.items.find(
          (x) => x.folio === folio,
        );
        assert(report);
        assert.equal(report.photoCount, 1);
        assert.equal(
          await page.locator("#aci-convert").count(),
          user === "admin" ? 1 : 0,
        );
        assert.equal(
          await page.locator("#aci-manage").count(),
          user === "admin" ? 1 : 0,
        );
        phase = label + ": detail and PDF";
        await page
          .locator("#aci-dialog")
          .getByText("Agregar información o fotos", { exact: true })
          .click();
        await page
          .locator("#aci-comment textarea")
          .fill("Código de alarma observado en tablero.");
        await page
          .getByRole("button", { name: "Agregar al seguimiento", exact: true })
          .click();
        await page
          .locator(".aci-timeline")
          .getByText("Código de alarma observado en tablero.", { exact: true })
          .waitFor();
        await page.screenshot({
          path: path.join(out, label + "-detail.png"),
          fullPage: true,
        });
        const downloaded = page.waitForEvent("download");
        await page
          .getByRole("button", { name: "Descargar PDF", exact: true })
          .click();
        const download = await downloaded;
        await download.saveAs(path.join(out, label + "-report.pdf"));
        assert.equal(await page.locator("#aci-error").innerText(), "");
        report = (await call("/incidents/" + report.id)).body;
        let result = await call("/incidents/" + report.id, {
          method: "PATCH",
          body: {
            version: report.version,
            action: "resolve",
            notes:
              "Inspección concluida. Condiciones de operación verificadas.",
          },
        });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        await page
          .getByRole("button", { name: "Actualizar ficha", exact: true })
          .click();
        await page
          .locator("#aci-confirm textarea")
          .fill("El sistema funciona correctamente durante el recorrido.");
        await page
          .getByRole("button", { name: "Confirmar solución", exact: true })
          .click();
        await page
          .locator(".aci-detail-heading .aci-status.resuelto")
          .waitFor();
        await page
          .getByRole("button", { name: "Cerrar reporte", exact: true })
          .click();
        phase = label + ": list";
        await page
          .locator(
            user === "admin"
              ? ".aca-nav [data-view=incidents]"
              : ".acp-nav [data-ac-view=incidents]",
          )
          .click();
        await page.locator("#aci-filters").waitFor();
        await page.locator("#aci-filters select[name=status]").selectOption("");
        await page.locator("#aci-filters button[type=submit]").click();
        await page.locator(".aci-card").first().waitFor();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 2,
          ),
          false,
          "No overflow",
        );
        await page.screenshot({
          path: path.join(out, label + "-list.png"),
          fullPage: true,
        });
        await context.close();
        console.log("PASS", label);
      }
    phase = engine + ": duplicate and admin conversion";
    const seeded = await call("/incidents", {
      method: "POST",
      body: {
        clientKey: "browser-duplicate-seed",
        unitId: ids[0],
        category: "alarma",
        equipmentState: "parcial",
        description: "Alarma en controlador.",
        occurredOn: "2026-10-25",
      },
    });
    assert.equal(seeded.status, 201);
    const adminContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await adminContext.addInitScript(
      (t) => localStorage.setItem("carlabToken", t),
      h.token("admin"),
    );
    page = await adminContext.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(h.url + "/hispacold.html");
    await page.locator(".aca-nav [data-view=incidents]").click();
    await page
      .getByRole("button", { name: "+ Reportar falla", exact: true })
      .click();
    await page.locator("#aci-unit-search").fill("306");
    await page
      .locator("#aci-unit-results button")
      .filter({ hasText: "306" })
      .click();
    await page.locator(".aci-category label").nth(5).click();
    await page
      .locator("#aci-create textarea[name=description]")
      .fill("El código aparece con el motor encendido.");
    await page
      .getByRole("button", { name: "Enviar reporte", exact: true })
      .click();
    await page.locator("#aci-duplicates").waitFor();
    await page
      .getByRole("button", {
        name: "Agregar a " + seeded.body.folio,
        exact: true,
      })
      .click();
    await page
      .locator(".aci-timeline")
      .getByText("El código aparece con el motor encendido.", { exact: true })
      .waitFor();
    await page.getByText("Gestionar atención", { exact: true }).click();
    await page
      .locator("#aci-manage select[name=action]")
      .selectOption("request_info");
    await page
      .locator("#aci-manage textarea[name=notes]")
      .fill("Indica el código exacto del controlador.");
    await page
      .getByRole("button", { name: "Guardar seguimiento", exact: true })
      .click();
    await page
      .locator(".aci-timeline")
      .getByText("Información solicitada por Carlab", { exact: true })
      .waitFor();
    await page
      .getByText("Crear orden desde este reporte", { exact: true })
      .click();
    await page
      .locator("#aci-convert select[name=type]")
      .selectOption("preventivo");
    await page.locator("#aci-interval select").selectOption("trimestral");
    const convertedResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/create-order") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Crear orden y continuar", exact: true })
      .click();
    const converted = await convertedResponse;
    assert.equal(converted.status(), 201);
    const newOrder = await converted.json();
    assert.equal(newOrder.data.interval, "trimestral");
    await page.locator("#aci-dialog").waitFor({ state: "hidden" });
    await page.locator(".aca-nav [data-view=incidents]").click();
    await page
      .locator(".aci-card")
      .filter({ hasText: seeded.body.folio })
      .getByRole("button", { name: "Ver reporte", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Archivar reporte", exact: true })
      .click();
    await page
      .locator("#aci-archive textarea")
      .fill("Ejercicio de archivo con historial conservado.");
    await page.locator("#aci-archive button[type=submit]").click();
    await page
      .getByText("Reporte archivado. El historial y la orden se conservan.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Recuperar reporte", exact: true })
      .click();
    await page
      .locator("#aci-archive textarea")
      .fill("Recuperación del reporte de prueba.");
    await page.locator("#aci-archive button[type=submit]").click();
    await page
      .getByRole("button", { name: "Archivar reporte", exact: true })
      .waitFor();
    assert.equal(
      (await call("/incidents/" + seeded.body.id)).body.order.id,
      newOrder.id,
    );
    await adminContext.close();
    console.log(
      "PASS",
      engine,
      "duplicate / request info / preventive order / archive / restore",
    );
    assert.deepEqual(errors, []);
  } catch (e) {
    if (page && !page.isClosed())
      await page
        .screenshot({
          path: path.join(out, "incidents-failure.png"),
          fullPage: true,
        })
        .catch(() => {});
    console.error("FAIL PHASE", phase);
    throw e;
  } finally {
    await browser?.close();
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
