// Small, atomic batches. Repeating a batch only verifies existing units; it never updates them.
const { randomUUID } = require('node:crypto');

function register(app, { pool, authRequired, requireRoles, asyncRoute, normalizedIdentitySql, normalizeIdentityValue }) {
  app.post('/api/fleet/units/batch', authRequired, requireRoles('admin', 'operativo'), asyncRoute(async (req, res) => {
    const body = req.body || {};
    const empresa = String(body.empresa || '').trim();
    const input = body.numeros;
    if (!empresa || empresa.length > 200 || !normalizeIdentityValue(empresa)) {
      return res.status(400).json({ error: 'Captura una empresa válida para el lote.' });
    }
    if (!Array.isArray(input) || !input.length || input.length > 50 || input.some(n => typeof n !== 'string' || !normalizeIdentityValue(n) || n.trim().length > 80)) {
      return res.status(400).json({ error: 'Cada bloque admite de 1 a 50 números económicos válidos.' });
    }
    const fields = ['nombreFlota', 'numeroObra', 'marca', 'modelo', 'anio', 'kilometraje'].map(key => String(body[key] || '').trim());
    if (fields.some(value => value.length > 200)) return res.status(400).json({ error: 'Los datos de la unidad no deben superar 200 caracteres por campo.' });
    const unique = new Map();
    for (const n of input) if (!unique.has(normalizeIdentityValue(n))) unique.set(normalizeIdentityValue(n), n.trim());
    const client = await pool.connect();
    let releaseError;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '15s'");
      await client.query("SET LOCAL lock_timeout = '5s'");
      // Serialize imports for the same company, including equivalent spellings.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('fleet-batch'), hashtext($1))", [normalizeIdentityValue(empresa)]);
      const existing = await client.query(`
        SELECT numero_economico FROM fleet_units
        WHERE ${normalizedIdentitySql('empresa')} = ${normalizedIdentitySql('$1')}
          AND ${normalizedIdentitySql('numero_economico')} = ANY($2::text[])
      `, [empresa, [...unique.keys()]]);
      const found = new Set(existing.rows.map(row => normalizeIdentityValue(row.numero_economico)));
      const pending = [...unique].filter(([key]) => !found.has(key)).map(([, number]) => ({ id: randomUUID(), numero_economico: number }));
      let created = [];
      if (pending.length) {
        const result = await client.query(`
          INSERT INTO fleet_units (id, empresa, nombre_flota, numero_economico, numero_obra, marca, modelo, anio, kilometraje, poliza_activa, campaign_activa)
          SELECT u.id, $1, $2, u.numero_economico, $3, $4, $5, $6, $7, $8, $9
          FROM jsonb_to_recordset($10::jsonb) AS u(id text, numero_economico text)
          ON CONFLICT (empresa, numero_economico) DO NOTHING
          RETURNING id, numero_economico
        `, [empresa, ...fields, body.polizaActiva === true, body.campaignActiva === true, JSON.stringify(pending)]);
        created = result.rows;
        if (created.length) {
          // Link older unlinked reports once per block, without rewriting their evidence or history.
          await client.query(`
            UPDATE garantias g SET fleet_unit_id = fu.id, updated_at = NOW()
            FROM fleet_units fu
            WHERE fu.id = ANY($1::text[]) AND g.fleet_unit_id IS NULL
              AND ${normalizedIdentitySql('g.empresa')} = ${normalizedIdentitySql('fu.empresa')}
              AND ${normalizedIdentitySql('g.numero_economico')} = ${normalizedIdentitySql('fu.numero_economico')}
          `, [created.map(row => row.id)]);
        }
      }
      await client.query('COMMIT');
      const createdKeys = new Set(created.map(row => normalizeIdentityValue(row.numero_economico)));
      res.status(201).json({
        processed: unique.size,
        created: created.map(row => row.numero_economico),
        existing: [...unique].filter(([key]) => !createdKeys.has(key)).map(([, number]) => number),
      });
    } catch (error) {
      releaseError = error;
      try { await client.query('ROLLBACK'); } catch (_) { /* Preserve the original error. */ }
      throw error;
    } finally {
      client.release(releaseError);
    }
  }));
}

module.exports = { register };
