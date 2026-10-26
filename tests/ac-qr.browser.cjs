const { chromium, devices } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const jsQR = require(
  process.env.JSQR_MODULE || "../../hispacold-test-tools/node_modules/jsqr",
);
const { setup } = require("./ac-qr-fixture.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const out = process.env.QA_OUTPUT || require("node:os").tmpdir();
fs.mkdirSync(out, { recursive: true });
(async () => {
  const { h, call, ids, order } = await setup();
  let browser;
  let phase = "setup";
  try {
    // Isolated login endpoints exercise the actual application login UI and return path.
    h.app.post("/api/auth/login", (req, res) =>
      res.json({
        token: h.token(),
        user: { id: "admin", nombre: "Administrador de prueba", role: "admin" },
      }),
    );
    h.app.get("/api/auth/me", (req, res) =>
      res.json({
        user: { id: "admin", nombre: "Administrador de prueba", role: "admin" },
      }),
    );
    const qr = (await call("/fleet/units/" + ids[0] + "/qr")).body;
    const url = h.url + qr.path;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const ctx = await browser.newContext({
      viewport: { width: 1400, height: 1000 },
    });
    await ctx.addInitScript(
      (token) => localStorage.setItem("carlabToken", token),
      h.token(),
    );
    const page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(15000);
    phase = "admin scan opens the exact unit";
    await page.goto(url);
    await page
      .locator("#acf-dialog h2")
      .filter({ hasText: "Unidad 306" })
      .waitFor();
    assert.match(
      await page.locator("#acf-dialog").innerText(),
      /Transportes QR/,
    );
    phase = "label and decoder round trip";
    await page.locator("[data-af=qr-label]").click();
    await page.locator(".acf-qr-image").waitFor();
    const pixels = await page.locator(".acf-qr-image").evaluate(async (img) => {
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      return {
        width: c.width,
        height: c.height,
        data: Array.from(g.getImageData(0, 0, c.width, c.height).data),
      };
    });
    assert.equal(
      jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height)
        .data,
      url,
    );
    await page.screenshot({
      path: path.join(out, "etiqueta-qr-pantalla.png"),
      fullPage: true,
    });
    const dl = page.waitForEvent("download");
    await page.locator("[data-af=qr-download]").click();
    await (await dl).saveAs(path.join(out, "etiqueta-qr.pdf"));
    phase = "prefilled order from unit";
    await page.locator("[data-af=qr-back]").click();
    await page.locator("[data-af=new-order]").click();
    assert.equal(
      await page.locator("#hc-create-brand").inputValue(),
      "hispacold",
    );
    await page.locator("#hc-create-type").selectOption("menor");
    await page.locator("#hc-start-order").click();
    assert.equal(
      await page.locator("[name=company]").inputValue(),
      "Transportes QR",
    );
    assert.equal(await page.locator("[name=unit]").inputValue(), "306");
    await page
      .locator("[name=symptoms]")
      .fill("Revisión solicitada desde la unidad.");
    await page.locator("#hc-save").click();
    await page
      .locator("#hc-save-state")
      .filter({ hasText: "Guardado en Carlab" })
      .waitFor();
    phase = "technical report includes the matching QR";
    await page.locator("[data-view=services]").click();
    await page
      .locator(`[data-action=open][data-id="${order.id}"]`)
      .first()
      .click();
    const report = page.waitForEvent("download");
    await page.locator("[data-action=pdf]").click();
    await (await report).saveAs(path.join(out, "reporte-con-qr.pdf"));
    phase = "signed-out login returns to scanned unit";
    const anon = await browser.newContext();
    const ap = await anon.newPage();
    await ap.goto(url + "&access=account");
    await ap.locator("#qr-login").waitFor();
    assert.equal(
      await ap
        .locator("body")
        .innerText()
        .then((s) => s.includes("Transportes QR")),
      false,
    );
    await ap.locator("#qr-login").click();
    await ap.locator("#loginEmail").fill("admin@example.test");
    await ap.locator("#loginPassword").fill("Password123");
    await ap.locator("#loginForm button[type=submit]").click();
    await ap
      .locator("#acf-dialog h2")
      .filter({ hasText: "Unidad 306" })
      .waitFor();
    phase = "mobile supervisor scope and service request";
    const mobile = await browser.newContext({ ...devices["iPhone 13"] });
    await mobile.addInitScript(
      (token) => localStorage.setItem("carlabToken", token),
      h.token("hispa", "supervisor_ac"),
    );
    const mp = await mobile.newPage();
    mp.on("pageerror", (e) => errors.push(e.message));
    await mp.goto(url);
    await mp
      .locator("#acf-dialog h2")
      .filter({ hasText: "Unidad 306" })
      .waitFor();
    assert.equal(await mp.locator("[data-af=new-order]").count(), 0);
    assert.equal(await mp.locator("[data-af=qr-label]").count(), 0);
    await mp.locator("[data-af=request-service]").click();
    await mp.locator("#ac-new-request").waitFor();
    assert.match(
      await mp.locator("#ac-dialog").innerText(),
      /306|Transportes QR/,
    );
    await mp.screenshot({
      path: path.join(out, "solicitud-desde-qr-movil.png"),
      fullPage: true,
    });
    assert.equal(
      await mp.locator("#ac-new-request [name=company]").inputValue(),
      "Transportes QR",
    );
    assert.equal(
      await mp.locator("#ac-new-request [name=unit]").inputValue(),
      "306",
    );
    await mp
      .locator("#ac-new-request [name=description]")
      .fill("El equipo no enfría. Atención solicitada desde el QR.");
    await mp.locator("#ac-new-request [name=priority]").selectOption("urgente");
    const submitted = mp.waitForResponse(
      (r) =>
        r.url().endsWith("/api/ac/requests") && r.request().method() === "POST",
    );
    await mp.locator("#ac-new-request button[type=submit]").click();
    const sent = await submitted;
    assert.equal(sent.status(), 201);
    const request = await sent.json();
    assert.equal(request.company, "Transportes QR");
    assert.equal(request.unit, "306");
    assert.equal(request.brand, "hispacold");
    phase = "other manufacturer denied";
    const wrong = await browser.newContext();
    await wrong.addInitScript(
      (token) => localStorage.setItem("carlabToken", token),
      h.token("eber", "supervisor_ac"),
    );
    const wp = await wrong.newPage();
    await wp.goto(url);
    await wp.locator("#qr-retry").waitFor();
    assert.ok(
      !(await wp
        .locator("body")
        .innerText()
        .then((s) => s.includes("Transportes QR"))),
    );
    phase = "replace invalidates printed link";
    await page.goto(h.url + "/hispacold.html?unit=" + ids[0]);
    await page.locator("[data-af=qr-label]").click();
    await page.locator(".acf-qr-replace summary").click();
    await page.locator("#acf-qr-reason").fill("Etiqueta extraviada");
    await page.locator("[data-af=qr-replace]").click();
    await page.waitForFunction(
      (old) =>
        document.querySelector("[data-af=qr-label]") === null &&
        document.querySelector("a[target=_blank]")?.href !== old,
      url,
    );
    const next = (await call("/fleet/units/" + ids[0] + "/qr")).body;
    assert.notEqual(next.token, qr.token);
    await ap.goto(url);
    await ap
      .locator("#qr-status")
      .filter({ hasText: "Código no disponible" })
      .waitFor();
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, "qr-expected.json"),
      JSON.stringify({ url }),
    );
    console.log(
      "PASS: scannable label, admin flow, login return, prefilled order, report PDF, mobile supervisor request, other-brand denial, replacement and revoked link.",
    );
  } catch (e) {
    console.error("Failed phase:", phase);
    throw e;
  } finally {
    if (browser) await browser.close();
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
