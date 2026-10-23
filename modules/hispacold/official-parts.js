"use strict";
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const data = require("./official-parts.json");
const byKey = new Map(data.parts.map((p) => [p.key, p]));
const docById = new Map(data.documents.map((d) => [d.id, d]));
const normalize = (s) =>
  String(s || "")
    .trim()
    .toUpperCase();
function chassis(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/^(mb|mercedes|mercedes[- ]benz)(\b|$)/.test(s)) return "mb";
  for (const b of ["man", "scania", "volvo"])
    if (s === b || s.startsWith(b + " ")) return b;
  return "";
}
function sourceInfo(s) {
  return { ...s, title: docById.get(s.documentId)?.title || s.documentId };
}
function metadata(key) {
  const p = byKey.get(key);
  if (!p) return null;
  return {
    key: p.key,
    reference: p.reference,
    name: p.name,
    kind: p.kind,
    unit: p.unit,
    families: p.families,
    notes: p.notes,
    sources: p.sources.map(sourceInfo),
  };
}
async function init(pool) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(62432064)");
    await db.query(
      `CREATE TABLE IF NOT EXISTS ac_official_parts(reference TEXT PRIMARY KEY, stock_part_id TEXT NOT NULL REFERENCES ac_stock_parts(id), imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`,
    );
    const marker = "official-parts-" + data.version;
    const done = await db.query(
      "SELECT id FROM ac_module_migrations WHERE id=$1",
      [marker],
    );
    if (!done.rows.length) {
      for (const p of data.parts) {
        const mapped = await db.query(
          "SELECT reference FROM ac_official_parts WHERE reference=$1",
          [p.key],
        );
        if (mapped.rows.length) continue;
        const found = await db.query(
          `SELECT s.id FROM ac_stock_parts s JOIN ac_stock_profiles p ON p.stock_part_id=s.id WHERE UPPER(TRIM(s.sku))=$1 AND p.brands @> '["hispacold"]'::jsonb ORDER BY s.created_at,s.id LIMIT 1`,
          [p.key],
        );
        let id = found.rows[0]?.id;
        if (!id) {
          id = crypto.randomUUID();
          await db.query(
            `INSERT INTO ac_stock_parts(id,nombre,sku,notas) VALUES($1,$2,$3,$4)`,
            [
              id,
              p.name,
              p.reference,
              [
                "Referencia documental Hispacold. Confirmar aplicación y presentación antes del suministro.",
                p.notes,
              ]
                .filter(Boolean)
                .join(" "),
            ],
          );
          await db.query(
            `INSERT INTO ac_stock_profiles(stock_part_id,brands,models) VALUES($1,'["hispacold"]',$2)`,
            [
              id,
              "Aplicación por confirmar con el equipo y la referencia del catálogo.",
            ],
          );
        }
        await db.query(
          "INSERT INTO ac_official_parts(reference,stock_part_id) VALUES($1,$2)",
          [p.key, id],
        );
      }
      await db.query(
        "INSERT INTO ac_module_migrations(id,details) VALUES($1,$2)",
        [
          marker,
          JSON.stringify({
            references: data.parts.length,
            documents: data.documents.length,
            stockAdded: 0,
            pricesConverted: false,
          }),
        ],
      );
    }
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
function provenance(part, brand) {
  const p = byKey.get(part.officialKey);
  if (brand !== "hispacold" || !p || normalize(part.reference) !== p.key)
    return {};
  const source =
    p.sources.find((s) => s.documentId === part.sourceDocumentId) ||
    p.sources[0];
  return {
    officialKey: p.key,
    sourceDocumentId: source.documentId,
    sourcePage: source.page,
  };
}
function register(router, { pool, wrap, admin, fail, text, brand }) {
  router.get(
    "/parts/documents/:id",
    admin,
    wrap(async (req, res) => {
      const doc = docById.get(req.params.id);
      if (!doc) fail("Documento no encontrado.", 404);
      const file = path.join(__dirname, "parts-documents", doc.filename);
      if (!fs.existsSync(file))
        fail(
          "Falta cargar el documento de referencia en esta instalación.",
          404,
        );
      res
        .type("application/pdf")
        .setHeader("Content-Disposition", `inline; filename="${doc.filename}"`);
      res.sendFile(file);
    }),
  );
  router.get(
    "/parts/assistant",
    admin,
    wrap(async (req, res) => {
      const b = brand(req.query.brand || "hispacold"),
        type = text(req.query.type, 30),
        interval = text(req.query.interval, 30),
        ch = chassis(text(req.query.chassis, 120));
      const q = text(req.query.q, 180),
        family = text(req.query.family, 30),
        offset = Number(req.query.offset || 0);
      if (
        !["", "efficient", "recambios", "cotizaciones", "custom"].includes(
          family,
        )
      )
        fail("Catálogo inválido.");
      if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
        fail("Página inválida.");
      const rows = await pool.query(
        `SELECT s.id,s.nombre,s.sku,s.stock_actual,s.precio_venta,p.brands,p.models,o.reference AS official_key
   FROM ac_stock_parts s JOIN ac_stock_profiles p ON p.stock_part_id=s.id LEFT JOIN ac_official_parts o ON o.stock_part_id=s.id AND o.reference=UPPER(TRIM(s.sku))
   WHERE p.brands @> $1::jsonb ORDER BY s.nombre,s.id`,
        [JSON.stringify([b])],
      );
      const mapped = new Map();
      const items = rows.rows.map((r) => {
        const o = b === "hispacold" ? metadata(r.official_key) : null;
        const item = {
          id: r.id,
          name: r.nombre,
          reference: r.sku || "",
          stock: Number(r.stock_actual),
          priceMXN: Number(r.precio_venta),
          models: r.models,
          official: o,
        };
        if (o) mapped.set(o.key, item);
        return item;
      });
      const needle = q
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const matches = items.filter(
        (p) =>
          (!family ||
            (family === "custom"
              ? !p.official
              : p.official?.families.includes(family))) &&
          (!needle ||
            [p.name, p.reference, p.models, p.official?.name]
              .join(" ")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .includes(needle)),
      );
      let pack = null,
        message =
          "Busca por referencia o descripción y agrega solo las piezas utilizadas.";
      if (b === "hispacold" && type === "preventivo") {
        if (interval === "mensual")
          message =
            "No hay un paquete de recambios mensual documentado en los archivos aportados. Agrega únicamente piezas necesarias por hallazgo; no se cargan automáticamente los filtros del trimestral.";
        else if (interval === "bianual")
          message =
            "No se aportó cotización bianual. No se extrapolan cantidades del anual; consulta el plan técnico y selecciona las piezas verificadas.";
        else if (["semestral", "anual"].includes(interval) && !ch)
          message =
            "Selecciona el chasis para ver las piezas de la cotización correspondiente. No se supone a partir del modelo de carrocería.";
        else {
          const source = data.packages.find(
            (p) => p.interval === interval && (!p.chassis || p.chassis === ch),
          );
          if (source) {
            pack = {
              id: source.id,
              interval,
              chassis: source.chassis,
              source: sourceInfo(source.source),
              lines: source.lines.map((line) => ({
                ...line,
                part: mapped.get(line.key) || null,
                source: sourceInfo(source.source),
              })),
            };
            message =
              "Paquete de referencia según cotización 2026. Confirma equipo, aplicación y cantidades; no es una sustitución universal para todos los equipos Hispacold o Efficient.";
          }
        }
      } else if (b === "eberspaecher")
        message =
          "Los documentos incorporados son de Hispacold. Para Eberspächer se muestra únicamente su propio catálogo AC; no se aplican paquetes de otra marca.";
      res.json({
        brand: b,
        chassis: ch,
        message,
        package: pack,
        items: matches.slice(offset, offset + 30),
        total: matches.length,
        offset,
        documents:
          b === "hispacold"
            ? data.documents.map((d) => ({
                id: d.id,
                title: d.title,
                kind: d.kind,
                pages: d.pages,
              }))
            : [],
        currencyNote:
          "Las cotizaciones están en USD. Las órdenes usan MXN: se conserva el precio MXN configurado en AC, sin convertir ni copiar importes USD. Nuevas referencias comienzan en cero y deben valorarse antes de cotizar.",
      });
    }),
  );
}
module.exports = { init, register, metadata, provenance, chassis, data };
