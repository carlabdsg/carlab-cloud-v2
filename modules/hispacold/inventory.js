"use strict";
// AC owns its catalog, balances and movements. Legacy stock is read only once.
const schema = `
CREATE TABLE IF NOT EXISTS ac_stock_parts (
 id TEXT PRIMARY KEY, nombre TEXT NOT NULL, sku TEXT, proveedor TEXT,
 stock_actual NUMERIC(12,2) NOT NULL DEFAULT 0,
 stock_minimo NUMERIC(12,2) NOT NULL DEFAULT 0, costo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
 precio_venta NUMERIC(12,2) NOT NULL DEFAULT 0, ubicacion TEXT, notas TEXT, created_by TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ac_stock_profiles (
 stock_part_id TEXT PRIMARY KEY REFERENCES ac_stock_parts(id), brands JSONB NOT NULL,
 models TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ac_stock_movements (
 id TEXT PRIMARY KEY, stock_part_id TEXT NOT NULL REFERENCES ac_stock_parts(id),
 tipo TEXT NOT NULL CHECK(tipo IN ('entrada','devolucion','salida_unidad','saldo_inicial')),
 cantidad NUMERIC(12,2) NOT NULL, empresa TEXT, unidad TEXT, garantia_folio TEXT, notas TEXT,
 created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ac_stock_movements_part ON ac_stock_movements(stock_part_id,created_at DESC);
CREATE TABLE IF NOT EXISTS ac_module_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), details JSONB NOT NULL);
`;
async function init(pool) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    // Serializes initialization across multiple server workers.
    await db.query("SELECT pg_advisory_xact_lock(62432063)");
    await db.query(schema);
    const done = await db.query(
      "SELECT id FROM ac_module_migrations WHERE id='independent-inventory-v6.3'",
    );
    if (!done.rows.length) {
      let copied = 0;
      const legacy = await db.query(
        "SELECT to_regclass('ac_part_profiles') AS profiles",
      );
      if (legacy.rows[0].profiles) {
        // A snapshot preserves existing AC references without changing legacy balances.
        await db.query(`INSERT INTO ac_stock_parts(id,nombre,sku,proveedor,stock_actual,stock_minimo,costo_unitario,precio_venta,ubicacion,notas,created_by,created_at,updated_at)
      SELECT s.id,s.nombre,s.sku,s.proveedor,s.stock_actual,COALESCE(s.stock_minimo,0),COALESCE(s.costo_unitario,0),COALESCE(s.precio_venta,0),s.ubicacion,s.notas,s.created_by,s.created_at,s.updated_at
      FROM stock_parts s JOIN ac_part_profiles p ON p.stock_part_id=s.id ON CONFLICT(id) DO NOTHING`);
        await db.query(
          `INSERT INTO ac_stock_profiles(stock_part_id,brands,models,image,updated_at) SELECT stock_part_id,brands,models,image,updated_at FROM ac_part_profiles WHERE stock_part_id IN (SELECT id FROM ac_stock_parts) ON CONFLICT(stock_part_id) DO NOTHING`,
        );
        // Copy only movements previously registered by the AC module, not other stock use.
        await db.query(`INSERT INTO ac_stock_movements(id,stock_part_id,tipo,cantidad,empresa,unidad,garantia_folio,notas,created_by,created_at)
      SELECT DISTINCT m.id,m.stock_part_id,CASE WHEN e.kind='devolucion' THEN 'devolucion' ELSE m.tipo END,m.cantidad,m.empresa,m.unidad,m.garantia_folio,m.notas,m.created_by,m.created_at
      FROM stock_movements m JOIN ac_inventory_events e ON e.stock_movement_id=m.id JOIN ac_stock_parts s ON s.id=m.stock_part_id
      WHERE m.tipo IN ('entrada','salida_unidad') ON CONFLICT(id) DO NOTHING`);
        // Opening balance is a cutover marker, not an additional receipt.
        await db.query(`INSERT INTO ac_stock_movements(id,stock_part_id,tipo,cantidad,notas)
      SELECT 'ac-opening-'||id,id,'saldo_inicial',stock_actual,'Saldo inicial de AC al independizar el almacén. No constituye una entrada adicional; el historial anterior es informativo.'
      FROM ac_stock_parts ON CONFLICT(id) DO NOTHING`);
        copied = (await db.query("SELECT COUNT(*)::int n FROM ac_stock_parts"))
          .rows[0].n;
      }
      await db.query(
        "INSERT INTO ac_module_migrations(id,details) VALUES('independent-inventory-v6.3',$1)",
        [JSON.stringify({ copied, legacyUnchanged: true })],
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
module.exports = { init, schema };
