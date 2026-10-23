const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./ac-qr-fixture.cjs");
test("Fleet supervisor is company scoped across every AC read/write surface", async () => {
  const { h, call, ids, order } = await setup();
  try {
    const companies = (await call("/fleet/companies")).body;
    const companyId = companies[0].id;
    const otherCompany = (
      await call("/fleet/companies", {
        method: "POST",
        body: { name: "Empresa ajena" },
      })
    ).body;
    const otherUnit = (
      await call("/fleet/units", {
        method: "POST",
        body: {
          companyId: otherCompany.id,
          unit: "306",
          brand: "hispacold",
          nextDate: "2026-10-23",
        },
      })
    ).body.ids[0];
    const created = await call("/users", {
      method: "POST",
      body: {
        nombre: "Supervisor flota",
        email: "fleet@test.mx",
        password: "password123",
        scopeType: "fleet",
        companyId,
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const bad = await call("/users", {
      method: "POST",
      body: {
        nombre: "Sin empresa",
        email: "invalid@test.mx",
        password: "password123",
        scopeType: "fleet",
      },
    });
    assert.equal(bad.status, 400);
    const inactive = await call("/users", {
      method: "POST",
      body: {
        nombre: "Inactivo flota",
        email: "inactivefleet@test.mx",
        password: "password123",
        scopeType: "fleet",
        companyId,
        activo: false,
      },
    });
    assert.equal(inactive.status, 201);
    assert.equal(inactive.body.activo, false);
    assert.equal((await call("/me", { user: inactive.body.id })).status, 403);
    const user = created.body.id;
    const read = (url, extra = {}) => call(url, { user, ...extra });
    const me = (await read("/me")).body;
    assert.equal(me.user.scopeType, "fleet");
    assert.equal(me.user.company, "Transportes QR");
    assert.equal(me.user.brand, null);
    const foreignOrder = await h.request("/services", {
      method: "POST",
      body: {
        data: {
          formVersion: 3,
          brand: "hispacold",
          type: "menor",
          attention: "normal",
          status: "completado",
          company: "Empresa ajena",
          unit: "306",
          serviceDate: "2026-10-22",
          nextDate: "2026-10-23",
          symptoms: "Ajeno",
          technician: "Técnico",
          workDone: "Revisión",
          finalTest: "Prueba",
          result: "operativo",
        },
      },
    });
    assert.equal(foreignOrder.status, 201);
    const ownRequest = await read("/requests", {
      method: "POST",
      body: {
        clientKey: "own-fleet-request",
        kind: "service",
        brand: "eberspaecher",
        company: "Transportes QR",
        unit: "307",
        description: "Revisión AC",
        priority: "normal",
      },
    });
    assert.equal(ownRequest.status, 201, JSON.stringify(ownRequest.body));
    const foreignRequest = await call("/requests", {
      method: "POST",
      body: {
        clientKey: "other-fleet-request",
        kind: "service",
        brand: "hispacold",
        company: "Empresa ajena",
        unit: "306",
        description: "Ajeno",
        priority: "normal",
      },
    });
    assert.equal(foreignRequest.status, 201);
    const units = (await read("/fleet/units?today=2026-10-22")).body;
    assert.equal(units.total, 2);
    assert.equal(new Set(units.items.map((x) => x.brand)).size, 2);
    assert.equal(
      (await read("/fleet/units?company=" + otherCompany.id)).body.total,
      0,
    );
    assert.equal((await read("/fleet/units/" + otherUnit)).status, 404);
    assert.equal((await read("/fleet/units/" + ids[1])).status, 200);
    assert.deepEqual(
      (await read("/fleet/options")).body.companies.map((x) => x.id),
      [companyId],
    );
    assert.ok(
      (await read("/units")).body.every((x) => x.company === "Transportes QR"),
    );
    assert.ok(
      (await read("/orders?company=Empresa%20ajena")).body.items.every(
        (x) => x.company === "Transportes QR",
      ),
    );
    assert.equal((await read("/orders/" + foreignOrder.body.id)).status, 404);
    assert.equal((await read("/orders/" + order.id)).status, 200);
    assert.equal(
      (await read("/requests/" + foreignRequest.body.id)).status,
      404,
    );
    assert.equal((await read("/requests?pending=true")).body.total, 1);
    assert.equal(
      (
        await read("/requests", {
          method: "POST",
          body: {
            ...ownRequest.body.data,
            clientKey: "forged-fleet-request",
            kind: "service",
            brand: "hispacold",
            company: "Empresa ajena",
            unit: "306",
          },
        })
      ).status,
      404,
    );
    for (const route of [
      "/calendar?today=2026-10-22&month=2026-10",
      "/upcoming?today=2026-10-22",
    ]) {
      const r = await read(route);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.body.items.every((x) => x.company === "Transportes QR"));
    }
    assert.ok(
      (await read("/reports/options")).body.companies.every(
        (x) => x === "Transportes QR",
      ),
    );
    const report = await read(
      "/reports?period=month&anchor=2026-10-22&company=Empresa%20ajena",
    );
    assert.equal(report.status, 200, JSON.stringify(report.body));
    assert.equal(report.body.company, "Transportes QR");
    for (const key of [
      "orders",
      "requests",
      "pendingOrders",
      "pendingRequests",
      "units",
      "groups",
    ])
      assert.ok(
        report.body[key].every((x) => x.company === "Transportes QR"),
        key,
      );
    const foreignQR = (await call("/fleet/units/" + otherUnit + "/qr")).body
      .token;
    assert.equal((await read("/fleet/qr/resolve/" + foreignQR)).status, 404);
    assert.equal(
      (await read("/fleet/order-qr/" + foreignOrder.body.id)).status,
      404,
    );
    const ownQR = (await call("/fleet/units/" + ids[1] + "/qr")).body.token;
    assert.equal((await read("/fleet/qr/resolve/" + ownQR)).status, 200);
    const notices = (await read("/notifications?today=2026-10-22")).body;
    assert.ok(notices.items.length);
    assert.ok(notices.items.every((x) => !x.body.includes("Empresa ajena")));
    const otherNotice = (
      await call("/notifications?today=2026-10-22")
    ).body.items.find((x) => x.targetId === foreignRequest.body.id);
    await read("/notifications/read", {
      method: "POST",
      body: { ids: [otherNotice.id] },
    });
    assert.equal(
      (
        await h.db.query(
          "SELECT * FROM ac_notification_reads WHERE user_id=$1 AND notification_id=$2",
          [user, otherNotice.id],
        )
      ).rows.length,
      0,
    );
    for (const route of [
      "/users",
      "/manuals/anything",
      "/parts/documents/hispacold-efficient",
      "/parts/assistant",
    ])
      assert.equal((await read(route)).status, 403, route);
    assert.equal(
      (
        await read("/requests/" + ownRequest.body.id + "/create-order", {
          method: "POST",
          body: {},
        })
      ).status,
      403,
    );
    const changed = await call("/users/" + user, {
      method: "PATCH",
      body: {
        nombre: "Supervisor flota",
        email: "fleet@test.mx",
        scopeType: "fleet",
        companyId: otherCompany.id,
      },
    });
    assert.equal(changed.status, 200);
    assert.equal((await read("/requests/" + ownRequest.body.id)).status, 404);
    assert.equal(
      (
        await read("/requests", {
          method: "POST",
          body: {
            clientKey: "own-fleet-request",
            kind: "service",
            brand: "eberspaecher",
            company: "Empresa ajena",
            unit: "307",
            description: "Reintento",
            priority: "normal",
          },
        })
      ).status,
      404,
    );
    assert.equal((await read("/fleet/units/" + ids[0])).status, 404);
    assert.equal((await read("/fleet/units/" + otherUnit)).status, 200);
    assert.equal(
      (await call("/fleet/units/" + ids[1], { user: "hispa" })).status,
      404,
    );
    assert.equal(
      (await call("/fleet/units/" + otherUnit, { user: "hispa" })).status,
      200,
    );
  } finally {
    await h.close();
  }
});
