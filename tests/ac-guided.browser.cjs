// Run against an isolated local test database. Requires Playwright + installed Chrome.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
const { chromium, devices } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const { harness } = require("./harness.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const output =
  process.env.QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), "ac-guided-"));
fs.mkdirSync(output, { recursive: true });
async function stage(page, n) {
  await page.locator(`.hc-guided-steps [data-step="${n}"]`).click();
  await page.locator(`[data-guided-section="${n}"]:visible`).waitFor();
  assert.equal(await page.locator("[data-guided-section]:visible").count(), 1);
}
async function start(
  page,
  brand = "eberspaecher",
  type = "menor",
  attention = "express",
) {
  await page.locator("[data-action=new]").first().click();
  await page.locator("#hc-create-brand").selectOption(brand);
  await page.locator("#hc-create-type").selectOption(type);
  await page
    .locator(`#hc-create-form [name=attention][value=${attention}]`)
    .check();
  await page.locator("#hc-start-order").click();
  await page.locator(".hc-guided-form").waitFor();
  await page.locator("#hc-unit").selectOption("fleet-1");
  await page
    .locator("[name=symptoms]")
    .fill("Falla de ventilación reportada por el operador.");
}
async function disclose(page, id) {
  if (!(await page.locator(id).evaluate((el) => el.open)))
    await page.locator(`${id} > summary`).click();
}
async function saved(page) {
  await page
    .locator("#hc-save-state")
    .filter({ hasText: /Guardado en Carlab/ })
    .waitFor();
}
async function localSaved(page) {
  await page
    .getByText("Borrador guardado en este dispositivo", { exact: true })
    .waitFor();
}
async function screenshot(page, name) {
  if (await page.locator("#hc-toast").isVisible())
    await page.locator("#hc-toast").waitFor({ state: "hidden" });
  await page.screenshot({ path: path.join(output, name), fullPage: true });
}
(async () => {
  const h = await harness();
  let browser, page;
  let phase = "setup";
  try {
    browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      permissions: ["camera"],
    });
    await context.addInitScript(
      (token) => localStorage.setItem("carlabToken", token),
      h.token(),
    );
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(h.url + "/hispacold.html");
    phase = "brand, service and express selection";
    await start(page);
    assert.equal(
      await page.locator("[data-guided-section]:visible").count(),
      1,
    );
    assert.match(await page.locator("#hc-main").innerText(), /Express|express/);
    assert.equal(await page.locator("[name=workDone]").isVisible(), false);
    await screenshot(page, "carlab-ac-v6-recepcion.png");
    phase = "missing items lead to the precise field";
    await stage(page, 3);
    await page.locator("[data-action=review-order]").click();
    assert.equal(await page.locator("[data-action=complete-order]").count(), 0);
    await page.locator('#hc-dialog [data-issue="Trabajo realizado"]').click();
    assert.equal(
      await page
        .locator("[name=workDone]")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    phase = "offline capture and step recovery";
    await context.setOffline(true);
    await page
      .locator("[name=workDone]")
      .fill("Se sustituyó el relevador y se ajustó el conector.");
    await localSaved(page);
    await context.setOffline(false);
    await page.reload();
    await page.locator("[data-action=resume]").first().click();
    await page.locator('[data-guided-section="2"]:visible').waitFor();
    assert.equal(
      await page.locator("[name=workDone]").inputValue(),
      "Se sustituyó el relevador y se ajustó el conector.",
    );
    phase = "parts, readings and collapsed data preservation";
    await disclose(page, "#hc-parts-details");
    await page.locator("[data-action=add-part]").click();
    await page
      .locator('[name="description:0"]')
      .fill("Relevador de ventilación");
    await page.locator('[name="quantity:0"]').fill("1");
    await page.locator('[name="unitPrice:0"]').fill("180");
    await page.locator("#hc-parts-details > summary").click();
    await disclose(page, "#hc-measurement-details");
    const reading = page.locator('[name^="before:"]').first();
    const readingName = await reading.getAttribute("name");
    await reading.fill("24");
    await page.locator("#hc-measurement-details > summary").click();
    await stage(page, 0);
    await stage(page, 2);
    assert.equal(
      await page.locator('[name="description:0"]').inputValue(),
      "Relevador de ventilación",
    );
    assert.equal(await reading.inputValue(), "24");
    phase = "desktop camera capture and stop";
    await page.locator("[data-action=take-photo]").click();
    await page.locator("[data-action=capture-photo]:enabled").waitFor();
    await page.evaluate(() => {
      window.qaTrack = document
        .querySelector("#hc-camera-video")
        .srcObject.getVideoTracks()[0];
    });
    await page.locator("[data-action=capture-photo]").click();
    await page.locator(".hc-photo img").waitFor();
    assert.equal(await page.evaluate(() => window.qaTrack.readyState), "ended");
    await page.locator('[name="photo-phase:0"]').selectOption("despues");
    await page
      .locator('[name="photo-caption:0"]')
      .fill("Prueba de ventilación.");
    phase = "save from work stage preserves all fields";
    await page.locator("#hc-save").click();
    await saved(page);
    assert.equal(
      await page.locator('[data-guided-section="2"]').isVisible(),
      true,
    );
    let row = (await h.request("/services?brand=eberspaecher")).body.items[0];
    let full = (await h.request("/services/" + row.id)).body;
    assert.equal(full.data.type, "menor");
    assert.equal(full.data.attention, "express");
    assert.equal(full.data.parts[0].description, "Relevador de ventilación");
    assert.equal(
      String(
        full.data.measurements.find((m) => "before:" + m.id === readingName)
          .before,
      ),
      "24",
    );
    assert.equal(full.data.evidence.length, 1);
    assert.equal(
      await page.locator("#hc-parts-details").evaluate((el) => el.open),
      true,
    );
    phase = "circuit missing reference navigation";
    await disclose(page, "#hc-measurement-details");
    await page.locator("[name=circuitOpened]").check();
    await stage(page, 3);
    await page
      .locator("[name=finalTest]")
      .fill(
        "Se verificó el arranque y funcionamiento continuo del ventilador.",
      );
    await page.locator("[name=result]").selectOption("operativo");
    await page.locator("[data-action=review-order]").click();
    await page
      .locator('#hc-dialog [data-issue="Datos de intervención del circuito"]')
      .click();
    assert.equal(
      await page
        .locator("[name=technicalReference]")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page
      .locator("[name=technicalReference]")
      .fill("Procedimiento de revisión del control.");
    await stage(page, 2);
    await page.locator("[name=circuitOpened]").uncheck();
    phase = "review and explicit closure";
    await stage(page, 3);
    await screenshot(page, "carlab-ac-v6-entrega.png");
    await page.locator("[data-action=review-order]").click();
    assert.match(
      await page.locator("#hc-dialog").innerText(),
      /Intervención realizada/,
    );
    assert.match(
      await page.locator("#hc-dialog").innerText(),
      /Reparación menor/,
    );
    await page.locator("[data-action=complete-order]").click();
    await page.locator("[data-action=reopen]").waitFor();
    full = (await h.request("/services/" + row.id)).body;
    assert.equal(full.status, "completado");
    assert.equal(full.data.formVersion, 3);
    assert.equal(
      full.data.checklist.filter((c) => c.outcome !== "pendiente").length,
      0,
    );
    phase = "technical PDF download";
    const download = page.waitForEvent("download");
    await page.locator("[data-action=pdf]").click();
    const pdf = await download;
    await pdf.saveAs(path.join(output, "carlab-ac-v6-reporte-prueba.pdf"));
    assert.match(pdf.suggestedFilename(), /Eberspächer\.pdf$/);
    assert.ok(
      fs.statSync(path.join(output, "carlab-ac-v6-reporte-prueba.pdf")).size >
        5000,
    );
    phase = "both manufacturers and every service keep their required scope";
    for (const brand of ["hispacold", "eberspaecher"]) {
      for (const type of ["revision", "preventivo", "menor", "mayor"]) {
        await page.locator("[data-view=services]").click();
        await start(page, brand, type, "normal");
        if (type === "preventivo") {
          assert.equal(await page.locator("[name=interval]").isVisible(), true);
          const values = await page
            .locator("[name=interval] option")
            .evaluateAll((els) => els.map((e) => e.value));
          await page.locator("[name=interval]").selectOption(values.at(-1));
        }
        await stage(page, 1);
        assert.equal(
          await page.locator("#hc-review-details").evaluate((el) => el.open),
          ["preventivo", "mayor"].includes(type),
        );
        await stage(page, 3);
        await page.locator("[data-action=review-order]").click();
        if (["revision", "mayor"].includes(type))
          assert.equal(
            await page.locator('#hc-dialog [data-issue="Diagnóstico"]').count(),
            1,
          );
        if (["preventivo", "mayor"].includes(type)) {
          await page
            .locator('#hc-dialog [data-issue*="puntos de revisión"]')
            .click();
          assert.match(
            await page.evaluate(() => document.activeElement.name),
            /^outcome:/,
          );
          await page.locator("#hc-check-filter").selectOption("hallazgo");
          await stage(page, 3);
          await page.locator("[data-action=review-order]").click();
          await page
            .locator('#hc-dialog [data-issue*="puntos de revisión"]')
            .click();
          assert.equal(
            await page.locator("#hc-check-filter").inputValue(),
            "all",
          );
        } else
          await page
            .locator("#hc-dialog [data-action=close-dialog]")
            .first()
            .click();
        await page.locator("#hc-save").click();
        await saved(page);
      }
    }
    phase = "legacy order remains editable";
    const legacy = await h.request("/services", {
      method: "POST",
      body: {
        data: {
          type: "menor",
          company: "Prueba anterior",
          unit: "100",
          serviceDate: "2026-10-20",
          status: "borrador",
        },
      },
    });
    assert.equal(legacy.status, 201);
    await page.locator("[data-view=services]").click();
    await page
      .locator(`[data-action=continue-order][data-id="${legacy.body.id}"]`)
      .click();
    assert.ok((await page.getByRole("tab").count()) > 0);
    await page.locator("[name=symptoms]").fill("Orden anterior conservada.");
    await page.locator("#hc-save").click();
    await saved(page);
    assert.equal(
      (await h.request("/services/" + legacy.body.id)).body.data.formVersion,
      undefined,
    );
    phase = "mobile native camera, navigation and no overflow";
    const mobile = await browser.newContext({ ...devices["iPhone 13"] });
    await mobile.addInitScript(
      (token) => localStorage.setItem("carlabToken", token),
      h.token(),
    );
    const mp = await mobile.newPage();
    mp.setDefaultTimeout(15000);
    mp.on("pageerror", (e) => errors.push(e.message));
    await mp.goto(h.url + "/hispacold.html");
    await start(mp);
    await mp.locator("[data-action=step-next]").click();
    await mp.locator("[data-action=step-next]").click();
    assert.equal(
      await mp.locator('[data-guided-section="2"]').isVisible(),
      true,
    );
    const chooser = mp.waitForEvent("filechooser");
    await mp.locator("[data-action=take-photo]").click();
    await (
      await chooser
    ).setFiles({
      name: "evidencia.png",
      mimeType: "image/png",
      buffer: fs.readFileSync(path.join(output, "carlab-ac-v6-recepcion.png")),
    });
    await mp.locator(".hc-photo img").waitFor();
    await mp
      .locator("[name=workDone]")
      .fill("Se ajustó el conector del ventilador.");
    assert.equal(
      await mp.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await screenshot(mp, "carlab-ac-v6-movil.png");
    await mp.locator("#hc-save").click();
    await saved(mp);
    await mp.locator("[data-action=step-next]").click();
    await mp
      .locator("[name=finalTest]")
      .fill("Ventilador operativo durante la verificación.");
    await mp.locator("[name=result]").selectOption("operativo");
    await mp.locator("[data-action=review-order]").click();
    assert.equal(
      await mp.locator('#hc-dialog [aria-label="Cerrar revisión"]').isVisible(),
      true,
    );
    await mp.locator('#hc-dialog [aria-label="Cerrar revisión"]').click();
    assert.equal(
      await mp.locator("#hc-dialog").evaluate((el) => el.open),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: guided desktop/mobile flows, both brands x four services, normal/express, missing-field links, offline step recovery, preserved parts/readings/photos, camera release, save and explicit close, technical PDF, legacy editor.",
    );
    console.log("Artifacts:", output);
  } catch (error) {
    console.error("Failed during:", phase);
    if (page) {
      await page
        .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
        .catch(() => {});
      console.error(
        await page
          .locator("#hc-form-error")
          .textContent()
          .catch(() => ""),
      );
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    await h.close();
  }
})();
