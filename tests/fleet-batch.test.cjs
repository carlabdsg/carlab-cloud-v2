const assert = require('node:assert/strict');
const { setup } = require('./reports-workspace-harness.cjs');
(async () => {
  const h = await setup();
  const baseQuery = h.pool.query, baseConnect = h.pool.connect;
  const recovery = () => Object.assign(new Error('server login has been failing, cached error: the database system is in recovery mode (server_login_retry)'), { code: '08P01' });
  const batch = (body, user = 'admin') => h.call('/api/fleet/units/batch', { method: 'POST', user, body });
  const snapshot = async (table) => JSON.stringify((await h.db.query(`SELECT * FROM ${table} ORDER BY id`)).rows);
  try {
    const beforeUnits = await snapshot('fleet_units');
    const fleetCounts = await h.call('/api/fleet/units');
    assert.equal(fleetCounts.body.find(unit => unit.id === 'unit-1').reportesCount, 1);
    assert.equal(fleetCounts.body.find(unit => unit.id === 'unit-14').reportesCount, 0);
    for (const user of ['operator', 'supervisor', 'ac']) assert.equal((await batch({ empresa: 'ANS', numeros: ['900'] }, user)).status, 403);
    assert.equal((await batch({ empresa: 'ANS', numeros: ['900'] }, null)).status, 401);
    for (const body of [{ empresa: '', numeros: ['900'] }, { empresa: 'ANS', numeros: [] }, { empresa: 'ANS', numeros: Array.from({ length: 51 }, (_, i) => String(i)) }, { empresa: 'ANS', numeros: ['---'] }, { empresa: 'ANS', numeros: [{}] }]) assert.equal((await batch(body)).status, 400);
    assert.equal(await snapshot('fleet_units'), beforeUnits);
    const existingBefore = (await h.db.query("SELECT * FROM fleet_units WHERE id='unit-1'")).rows[0];
    await h.db.query("UPDATE garantias SET fleet_unit_id=NULL, numero_economico='B901' WHERE id='report-8'");
    const reportBefore = (await h.db.query("SELECT * FROM garantias WHERE id='report-8'")).rows[0];
    const payload = { empresa: 'ANS', numeros: ['321', 'B901', 'B902', 'b-902'], nombreFlota: 'Prueba lote', modelo: 'Nuevo', marca: 'Volvo', polizaActiva: true };
    const created = await batch(payload);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.deepEqual(created.body, { processed: 3, created: ['B901', 'B902'], existing: ['321'] });
    assert.deepEqual((await h.db.query("SELECT * FROM fleet_units WHERE id='unit-1'")).rows[0], existingBefore);
    const reportAfter = (await h.db.query("SELECT * FROM garantias WHERE id='report-8'")).rows[0];
    assert.ok(reportAfter.fleet_unit_id);
    for (const key of Object.keys(reportBefore).filter(k => !['fleet_unit_id', 'updated_at'].includes(k))) assert.deepEqual(reportAfter[key], reportBefore[key], key);
    const afterUnits = await snapshot('fleet_units');
    const replay = await batch({ ...payload, empresa: 'áns', modelo: 'Must not overwrite', numeros: ['321', 'b-901', 'B902'] });
    assert.equal(replay.status, 201); assert.equal(replay.body.created.length, 0); assert.equal(replay.body.existing.length, 3);
    assert.equal(await snapshot('fleet_units'), afterUnits);
    const crossCompany = await batch({ empresa: 'Otra empresa', numeros: ['B901'] }, 'ops');
    assert.equal(crossCompany.body.created.length, 1);
    const beforeFailure = await snapshot('fleet_units');
    let released = false;
    h.pool.connect = async () => ({
      query: async (sql, params) => { if (sql.includes('UPDATE garantias g')) throw recovery(); return baseQuery(sql, params); },
      release(error) { released = !!error; }
    });
    const failed = await batch({ empresa: 'ANS', numeros: ['FAIL-1', 'FAIL-2'] });
    assert.equal(failed.status, 503); assert.equal(failed.body.retryable, true); assert.equal(released, true);
    assert.equal(await snapshot('fleet_units'), beforeFailure, 'All new units rolled back after failure');
    // Commit succeeds but the acknowledgement is lost. A manual replay must be harmless.
    h.pool.connect = async () => ({
      query: async (sql, params) => { const result = await baseQuery(sql, params); if (sql === 'COMMIT') throw Object.assign(new Error('server conn crashed?'), { code: '08P01' }); return result; },
      release() {}
    });
    assert.equal((await batch({ empresa: 'ANS', numeros: ['LOST-1'], modelo: 'Original' })).status, 503);
    h.pool.connect = baseConnect;
    const retry = await batch({ empresa: 'ANS', numeros: ['LOST-1'], modelo: 'Replacement' });
    assert.deepEqual(retry.body.created, []); assert.deepEqual(retry.body.existing, ['LOST-1']);
    assert.equal((await h.db.query("SELECT modelo FROM fleet_units WHERE numero_economico='LOST-1'")).rows[0].modelo, 'Original');
    h.pool.connect = async () => { throw recovery(); };
    assert.equal((await batch({ empresa: 'ANS', numeros: ['NO-CONNECTION'] })).status, 503);
    h.pool.connect = baseConnect;
    let reads = 0;
    h.pool.query = async () => { reads++; throw recovery(); };
    for (const [route, method, body] of [
      ['/api/health', 'GET'], ['/api/public/companies', 'GET'], ['/api/companies', 'GET'], ['/api/auth/me', 'GET'],
      ['/api/auth/login', 'POST', { email: 'admin@test.local', password: 'test' }],
      ['/api/fleet/units', 'POST', { empresa: 'ANS', numeroEconomico: 'NO-CONNECTION' }],
      ['/api/fleet/units', 'GET'], ['/api/fleet/analytics', 'GET'], ['/api/fleet/summary', 'GET'], ['/api/garantias', 'GET']
    ]) {
      reads = 0;
      const response = await fetch(h.url + route, { method, headers: { Authorization: 'Bearer ' + h.token('admin'), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 503, route); assert.equal(response.headers.get('Retry-After'), '15', route);
      const data = await response.json(); assert.equal(data.retryable, true); assert.ok(!data.error.includes('server_login_retry'));
      assert.equal(reads, 1, route + ' must not hammer a recovering database');
    }
    h.pool.query = async () => { throw Object.assign(new Error('bind message has an invalid number of parameters'), { code: '08P01' }); };
    assert.equal((await h.call('/api/auth/me')).status, 500, 'A different protocol error is not a recovery outage');
    h.pool.query = baseQuery;
    const fifty = await batch({ empresa: 'ANS', numeros: Array.from({ length: 50 }, (_, i) => 'BLOCK-' + i) });
    assert.equal(fifty.status, 201); assert.equal(fifty.body.created.length, 50);
    assert.equal((await h.call('/api/health')).status, 200);
    assert.equal((await h.call('/api/fleet/units')).status, 200);
    assert.equal((await h.call('/api/fleet/analytics')).status, 200);
    const invalid = await h.call('/api/auth/login', { method: 'POST', body: { email: 'admin@carlab.local', password: 'incorrect' } });
    assert.equal(invalid.status, 401);
    console.log('PASS: batch rollback, safe replay, duplicate preservation, historical reports, access limits, 50 units, recovery 503 and recovery exit.');
  } finally { h.pool.query = baseQuery; h.pool.connect = baseConnect; await h.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
