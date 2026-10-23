const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const official = require("../modules/hispacold/official-parts");
const inventory = require("../modules/hispacold/inventory");
const { harness } = require("./harness.cjs");
const { setup } = require("./ac-qr-fixture.cjs");
test("Referencias y paquetes documentados: sin equivalencias, cantidades y documentos completos", () => {
  const d = official.data;
  assert.equal(d.parts.length, 133);
  assert.equal(new Set(d.parts.map((p) => p.key)).size, 133);
  assert.equal(d.packages.length, 9);
  assert.equal(d.documents.length, 11);
  for (const doc of d.documents) {
    const file = path.join(
      __dirname,
      "../modules/hispacold/parts-documents",
      doc.filename,
    );
    assert.equal(
      crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      doc.sha256,
    );
  }
  for (const p of d.parts) {
    assert(/\d/.test(p.reference));
    assert(p.sources.length);
    for (const s of p.sources) {
      const doc = d.documents.find((d) => d.id === s.documentId);
      assert(doc);
      assert(s.page >= 1 && s.page <= doc.pages);
    }
  }
  for (const ref of [
    "3600128",
    "3600128-N",
    "3100015",
    "3100015-N",
    "9000238",
    "40501669",
  ])
    assert(d.parts.some((p) => p.key === ref));
  const totals = {
    "cot-anual-man-2026": 731.07,
    "cot-anual-mb-2026": 580.38,
    "cot-anual-scania-2026": 637.02,
    "cot-anual-volvo-2026": 671.43,
    "cot-semestral-man-2026": 354.97,
    "cot-semestral-mb-2026": 204.28,
    "cot-semestral-scania-2026": 260.92,
    "cot-semestral-volvo-2026": 295.33,
    "cot-trimestral-2026": 54,
  };
  for (const p of d.packages) {
    const total = p.lines
      .filter((l) => l.kind !== "mano_obra")
      .reduce((n, l) => n + (l.quoteUnitPriceUSD || 0) * l.quantity, 0);
    assert.equal(Math.round(total * 100) / 100, totals[p.id], p.id);
    const filters = p.lines.find((l) => l.key === "9000061-R");
    assert.equal(filters.quantity, 1);
    assert.equal(filters.unit, "juego de 6 piezas");
    if (p.chassis === "mb") {
      const band = p.lines.find((l) => l.key === "MB-BANDA-POR-CONFIRMAR");
      assert.equal(band.reference, "");
      assert.equal(band.selectableAsPackage, false);
      assert(!p.lines.some((l) => l.reference === "9PK2000"));
    }
    if (p.interval === "anual")
      assert.equal(
        p.lines.find((l) => l.key === "GAS R-134A").selectableAsPackage,
        false,
      );
  }
  assert.equal(official.chassis("Mercedes-Benz O500"), "mb");
  assert.equal(official.chassis("i8"), "");
});
test("Importación única: saldo cero, no copia USD, reutiliza SKU y conserva cambios administrativos", async () => {
  const h = await harness();
  try {
    await inventory.init(h.pool);
    await h.db.exec(
      `INSERT INTO ac_stock_parts(id,nombre,sku,stock_actual,precio_venta,notas) VALUES('existing','Mi filtro','9000061-R',12,950,'Ficha propia');INSERT INTO ac_stock_profiles(stock_part_id,brands) VALUES('existing','["hispacold"]');`,
    );
    const legacy = (await h.db.query("SELECT * FROM stock_parts")).rows;
    await official.init(h.pool);
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM ac_stock_parts")).rows[0]
        .n,
      133,
    );
    const existing = (
      await h.db.query("SELECT * FROM ac_stock_parts WHERE id='existing'")
    ).rows[0];
    assert.equal(existing.nombre, "Mi filtro");
    assert.equal(existing.stock_actual, "12.00");
    assert.equal(existing.precio_venta, "950.00");
    assert.equal(
      (
        await h.db.query(
          "SELECT stock_part_id FROM ac_official_parts WHERE reference='9000061-R'",
        )
      ).rows[0].stock_part_id,
      "existing",
    );
    assert.equal(
      (
        await h.db.query(
          "SELECT COUNT(*)::int n FROM ac_stock_parts WHERE id<>'existing' AND (stock_actual<>0 OR costo_unitario<>0 OR precio_venta<>0)",
        )
      ).rows[0].n,
      0,
    );
    await h.db.query(
      "UPDATE ac_stock_parts SET stock_actual=11,precio_venta=999 WHERE id='existing'",
    );
    await official.init(h.pool);
    assert.equal(
      (
        await h.db.query(
          "SELECT stock_actual FROM ac_stock_parts WHERE id='existing'",
        )
      ).rows[0].stock_actual,
      "11.00",
    );
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM ac_stock_parts")).rows[0]
        .n,
      133,
    );
    assert.deepEqual(
      (await h.db.query("SELECT * FROM stock_parts")).rows,
      legacy,
    );
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM ac_stock_movements"))
        .rows[0].n,
      0,
    );
  } finally {
    await h.close();
  }
});
test("Asistente por periodo y chasis; aislamiento, fuentes privadas y orden sin descuento", async () => {
  const { h, call, order } = await setup();
  try {
    const base = "/parts/assistant?brand=hispacold&type=preventivo&";
    const monthly = await call(base + "interval=mensual");
    assert.equal(monthly.status, 200);
    assert.equal(monthly.body.package, null);
    assert.match(monthly.body.message, /mensual/);
    assert.equal((await call(base + "interval=bianual")).body.package, null);
    assert.equal(
      (await call(base + "interval=anual&chassis=i8")).body.package,
      null,
    );
    const quarterly = (await call(base + "interval=trimestral")).body;
    assert.equal(
      quarterly.package.lines.filter((l) => l.selectableAsPackage).length,
      2,
    );
    assert(
      quarterly.package.lines.every((l) => !l.part || l.part.priceMXN === 0),
    );
    const mb = (await call(base + "interval=anual&chassis=Mercedes-Benz")).body;
    assert.equal(mb.chassis, "mb");
    assert.equal(mb.package.id, "cot-anual-mb-2026");
    const man = (await call(base + "interval=semestral&chassis=MAN")).body;
    assert(!man.package.lines.some((l) => l.key === "3450017-NACHI"));
    assert(man.package.lines.some((l) => l.key === "3150423-N"));
    const volvo = (await call(base + "interval=semestral&chassis=Volvo")).body;
    assert.equal(
      volvo.package.lines.find((l) => l.key === "3450017-NACHI").quantity,
      4,
    );
    assert(volvo.package.lines.some((l) => l.key === "BX88"));
    const eber = (
      await call(
        "/parts/assistant?brand=eberspaecher&type=preventivo&interval=anual&chassis=Volvo",
      )
    ).body;
    assert.equal(eber.items.length, 0);
    assert.equal(eber.package, null);
    assert.equal(eber.documents.length, 0);
    assert.equal(
      (await call(base + "interval=anual", { user: "hispa" })).status,
      403,
    );
    assert.equal(
      (await call(base + "interval=anual", { user: null })).status,
      401,
    );
    const efficient = (
      await call(base + "interval=mensual&family=efficient&q=NETIOS")
    ).body;
    assert(efficient.items.length > 0);
    assert(
      efficient.items.every((p) => p.official.families.includes("efficient")),
    );
    const list = (await call("/parts?brand=hispacold&family=efficient")).body;
    assert(list.length > 0);
    assert(list.every((p) => p.official.families.includes("efficient")));
    assert.equal((await call("/parts", { user: "eber" })).body.length, 0);
    const supervisor = (await call("/parts", { user: "hispa" })).body;
    assert(
      supervisor.every(
        (p) =>
          p.stock === undefined &&
          p.cost === undefined &&
          p.price === undefined,
      ),
    );
    for (const user of ["hispa", "eber"])
      assert.equal(
        (await call("/parts/documents/cot-anual-mb-2026", { user })).status,
        403,
      );
    const doc = await fetch(
      h.url + "/api/ac/parts/documents/hispacold-efficient",
      { headers: { Authorization: "Bearer " + h.token() } },
    );
    assert.equal(doc.status, 200);
    assert.equal(doc.headers.get("content-type"), "application/pdf");
    assert.equal(
      Buffer.from(await doc.arrayBuffer())
        .slice(0, 4)
        .toString(),
      "%PDF",
    );
    const selected = quarterly.package.lines[0];
    const created = await h.request("/services", {
      method: "POST",
      body: {
        data: {
          ...order.data,
          status: "borrador",
          parts: [
            {
              kind: "refaccion",
              description: selected.description,
              reference: selected.reference,
              quantity: 1,
              unitPrice: 0,
              officialKey: selected.key,
              sourceDocumentId: quarterly.package.source.documentId,
            },
          ],
        },
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created));
    assert.equal(created.body.data.parts[0].officialKey, selected.key);
    assert.equal(created.body.data.parts[0].sourcePage, 1);
    assert.equal(created.body.data.total, 0);
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM ac_stock_movements"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (await h.db.query("SELECT COUNT(*)::int n FROM stock_parts")).rows[0].n,
      0,
    );
    const fake = official.provenance(
      {
        officialKey: selected.key,
        reference: "OTRA",
        sourceDocumentId: "fake",
      },
      "hispacold",
    );
    assert.deepEqual(fake, {});
    assert.deepEqual(
      official.provenance(
        { officialKey: selected.key, reference: selected.reference },
        "eberspaecher",
      ),
      {},
    );
  } finally {
    await h.close();
  }
});
