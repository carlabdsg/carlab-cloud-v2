// Visual and responsive checks for the AC order editor; isolated data only.
const { chromium, devices } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const { harness } = require("./harness.cjs");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const out = process.env.QA_OUTPUT || require("node:os").tmpdir();
fs.mkdirSync(out, { recursive: true });
(async () => {
  const h = await harness();
  let browser;
  const errors = [];
  try {
    await h.db.query(
      "UPDATE fleet_units SET empresa='Autobuses del Pacífico',numero_economico='325',modelo='Irizar i8' WHERE id='fleet-1'",
    );
    browser = await chromium.launch({ channel: "chrome", headless: true });
    async function pageFor(settings = {}) {
      const c = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        ...settings,
      });
      await c.addInitScript(
        (t) => localStorage.setItem("carlabToken", t),
        h.token(),
      );
      const p = await c.newPage();
      p.setDefaultTimeout(15000);
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(h.url + "/hispacold.html");
      await p
        .getByRole("heading", { name: "El control de tu operación AC" })
        .waitFor();
      return p;
    }
    const shot = async (p, file, fullPage = false) => {
      await p.screenshot({ path: path.join(out, file), fullPage });
    };
    const width = async (p) =>
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "No page overflow",
      );
    const stage = async (p, n) => {
      await p.locator(`.hc-guided-steps [data-step="${n}"]`).click();
      await p.locator(`[data-guided-section="${n}"]:visible`).waitFor();
      assert.equal(await p.locator("[data-guided-section]:visible").count(), 1);
    };
    async function begin(p) {
      await p.locator("[data-action=new]").first().click();
      await p.locator("#hc-create-brand").selectOption("hispacold");
      await p.locator("#hc-create-type").selectOption("preventivo");
      await p.locator("[name=attention][value=normal]").check();
    }
    async function receive(p) {
      await p.locator("#hc-start-order").click();
      await p.locator("#hc-unit").selectOption("fleet-1");
      await p
        .locator("[name=symptoms]")
        .fill("Mantenimiento mensual programado del sistema de climatización.");
      await p.locator("[name=interval]").selectOption("mensual");
    }
    const desktop = await pageFor();
    await begin(desktop);
    await shot(desktop, "01-nueva-orden.png");
    await receive(desktop);
    await width(desktop);
    await desktop
      .locator("#hc-save-state")
      .filter({ hasText: "Borrador guardado en este dispositivo" })
      .waitFor();
    await desktop.evaluate(() => {
      document.activeElement.blur();
      scrollTo(0, 0);
    });
    await shot(desktop, "02-recepcion.png");
    assert.equal(
      await desktop
        .locator(".hc-guided-navigation")
        .evaluate((el) => getComputedStyle(el).position),
      "sticky",
    );
    await stage(desktop, 1);
    await desktop
      .locator("[name=diagnosis]")
      .fill(
        "Inspección de componentes, limpieza y verificación conforme al plan mensual del equipo.",
      );
    for (const s of await desktop.locator('[name^="outcome:"]').all())
      await s.selectOption("bien");
    await desktop
      .locator("#hc-save-state")
      .filter({ hasText: "Borrador guardado en este dispositivo" })
      .waitFor();
    await desktop.evaluate(() => {
      document.activeElement.blur();
      scrollTo(0, 0);
    });
    await shot(desktop, "03-revision-mensual.png");
    await stage(desktop, 2);
    await desktop
      .locator("[name=workDone]")
      .fill(
        "Se realizó la limpieza de bandeja de condensados, motor evaporador y turbinas. Se revisaron las conexiones y los componentes incluidos en el plan mensual.",
      );
    await desktop
      .locator("#hc-save-state")
      .filter({ hasText: "Borrador guardado en este dispositivo" })
      .waitFor();
    await desktop.evaluate(() => {
      document.activeElement.blur();
      scrollTo(0, 0);
    });
    await shot(desktop, "04-intervencion.png");
    const color = await desktop
      .locator("[data-action=step-next] .hco-next-long")
      .evaluate((el) => getComputedStyle(el).color);
    assert.equal(color, "rgb(255, 255, 255)");
    await stage(desktop, 3);
    await desktop
      .locator("[name=finalTest]")
      .fill(
        "Funcionamiento y desalojo de condensados verificados. No se observaron fugas ni ruidos anormales durante la prueba.",
      );
    await desktop.locator("[name=result]").selectOption("operativo");
    await desktop.locator("[data-action=review-order]").click();
    await desktop.locator("[data-action=complete-order]").waitFor();
    await shot(desktop, "05-revision-final.png");
    await desktop.getByRole("button", { name: "Cerrar revisión" }).click();
    const phone = await pageFor(devices["iPhone 13"]);
    await begin(phone);
    const startBox = await phone.locator("#hc-start-order").boundingBox();
    assert.ok(
      startBox &&
        startBox.y >= 0 &&
        startBox.y + startBox.height <= phone.viewportSize().height,
      "Start action visible without scrolling",
    );
    await width(phone);
    await shot(phone, "06-nueva-orden-movil.png");
    await receive(phone);
    for (const n of [0, 1, 2, 3]) {
      await stage(phone, n);
      await width(phone);
      const form = phone.locator(".hc-savebar");
      await form.scrollIntoViewIfNeeded();
      const geometry = await phone.evaluate(() => ({
        bar: document.querySelector(".hc-savebar").getBoundingClientRect()
          .bottom,
        nav: document.querySelector(".aca-nav").getBoundingClientRect().top,
      }));
      assert.ok(geometry.bar <= geometry.nav + 1, JSON.stringify(geometry));
    }
    await stage(phone, 2);
    await phone
      .locator("[name=workDone]")
      .fill(
        "Limpieza de componentes y verificación del funcionamiento del sistema.",
      );
    await phone.locator("#hc-parts-details>summary").click();
    await phone.locator("[data-action=add-part]").click();
    await phone.locator('[name="description:0"]').fill("Material de limpieza");
    await phone.locator('[name="quantity:0"]').fill("1");
    await phone.locator('[name="unitPrice:0"]').fill("150");
    await phone.locator("#hc-measurement-details>summary").click();
    await phone.locator('[name^="before:"]').first().fill("24");
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 740 },
      { width: 768, height: 1024 },
    ]) {
      await phone.setViewportSize(viewport);
      await width(phone);
      for (const selector of [
        "#hc-parts input",
        "#hc-measurement-details input",
      ]) {
        const boxes = await phone.locator(selector).evaluateAll((els) =>
          els
            .filter((el) => el.getClientRects().length)
            .map((el) => ({
              left: el.getBoundingClientRect().left,
              right: el.getBoundingClientRect().right,
            })),
        );
        assert.ok(
          boxes.every((b) => b.left >= 0 && b.right <= viewport.width + 1),
          selector + " fits " + viewport.width,
        );
      }
    }
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.locator("#hc-measurement-details>summary").click();
    await phone
      .locator("#hc-save-state")
      .filter({ hasText: "Borrador guardado en este dispositivo" })
      .waitFor();
    await phone.locator("#hc-parts-details").scrollIntoViewIfNeeded();
    await shot(phone, "07-refacciones-movil.png");
    await phone.locator("#hc-parts-details>summary").click();
    await phone.evaluate(() => {
      document.activeElement.blur();
      scrollTo(0, 0);
    });
    await shot(phone, "08-formulario-movil.png");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: desktop and mobile visual forms, visible close controls, single stage, correct action contrast, save bar above navigation, editable parts/readings at 320/390/768px.",
    );
  } finally {
    await browser?.close();
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
