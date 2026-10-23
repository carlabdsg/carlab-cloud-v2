// Standalone print-layout check; routes are local and no production API is used.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const out = process.env.QA_OUTPUT || require("node:os").tmpdir();
const sample = new URL(
  process.env.LABEL_SAMPLE_URL ||
    "https://qr.carlab.test/ac-unit.html?code=" + "a".repeat(48),
);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><head><title>Prueba local</title></head><body></body></html>",
      }),
    );
    await page.goto(sample.origin + "/local-label-test");
    for (const file of [
      "public/vendor/hc-jspdf.umd.min.js",
      "public/vendor/ac-qrcode.js",
      "public/ac-qr.js",
    ])
      await page.addScriptTag({ path: path.join(root, file) });
    for (const [name, unit, brand] of [
      ["unidad-325", { company: "ANS", unit: "325" }, "Hispacold"],
      [
        "eberspaecher",
        { company: "Transportes del Pacífico", unit: "AC-1025" },
        "Eberspächer",
      ],
      [
        "textos-largos",
        {
          company: "Transportes y Servicios Integrales del Pacífico "
            .repeat(4)
            .slice(0, 180),
          unit: "UNIDAD-" + "1234567890".repeat(7) + "XYZ",
        },
        "Eberspächer",
      ],
    ]) {
      const result = await page.evaluate(
        ({ unit, brand, code }) => {
          const doc = window.ACQR.labelDocument(unit, { token: code }, brand);
          return {
            pages: doc.getNumberOfPages(),
            width: doc.internal.pageSize.getWidth(),
            height: doc.internal.pageSize.getHeight(),
            pdf: doc.output("datauristring").split(",")[1],
          };
        },
        { unit, brand, code: sample.searchParams.get("code") },
      );
      assert.equal(result.pages, 1);
      assert.ok(Math.abs(result.width - 106) < 0.01);
      assert.ok(Math.abs(result.height - 146) < 0.01);
      fs.writeFileSync(
        path.join(out, name + ".pdf"),
        Buffer.from(result.pdf, "base64"),
      );
    }
    fs.writeFileSync(path.join(out, "expected-qr.txt"), sample.href);
    console.log(
      "PASS: single-page 106 × 146 mm labels for Hispacold, Eberspächer and maximum-length company/unit names.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
