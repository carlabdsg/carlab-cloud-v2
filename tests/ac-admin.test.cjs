const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./ac-qr-fixture.cjs");
test("Solicitudes de servicio: eliminar, permisos, exclusión de pendientes y recuperar sin modificar órdenes ni inventario", async (t) => {
  const { h, call, ids } = await setup();
  try {
    const companyId = (await call("/fleet/options")).body.companies.find(
      (c) => c.name === "Transportes QR",
    ).id;
    await h.db.query(
      "INSERT INTO users(id,nombre,role,activo,empresa) VALUES('fleet','Flota','supervisor_ac',true,'Transportes QR')",
    );
    await h.db.query(
      "INSERT INTO ac_supervisor_access(user_id,scope_type,company_id) VALUES('fleet','fleet',$1)",
      [companyId],
    );
    const input = {
      clientKey: "admin-removal-test",
      kind: "service",
      brand: "hispacold",
      company: "Transportes QR",
      unit: "306",
      description: "Solicitud urgente duplicada",
      priority: "urgente",
    };
    const created = await call("/requests", {
      method: "POST",
      user: "hispa",
      body: input,
    });
    assert.equal(created.status, 201);
    let x = created.body;
    const requestPath = "/requests/" + x.id;
    const snapshots = async () =>
      (
        await h.db.query(
          "SELECT jsonb_build_object('orders',(SELECT jsonb_agg(s ORDER BY id) FROM hc_services s),'parts',(SELECT jsonb_agg(p ORDER BY id) FROM ac_stock_parts p),'movements',(SELECT jsonb_agg(m ORDER BY id) FROM ac_stock_movements m),'legacy',(SELECT jsonb_agg(l ORDER BY id) FROM legacy_sentinel l)) AS value",
        )
      ).rows[0].value;
    await t.test(
      "Solo el administrador, motivo obligatorio y control de versión",
      async () => {
        for (const user of ["hispa", "eber", "fleet"]) {
          assert.equal(
            (
              await call(requestPath, {
                user,
                method: "DELETE",
                body: { version: x.version, reason: "Duplicada" },
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await call(requestPath + "/restore", {
                user,
                method: "POST",
                body: { version: x.version },
              })
            ).status,
            403,
          );
          assert.equal(
            (await call("/requests?deleted=true", { user })).status,
            403,
          );
        }
        assert.equal(
          (
            await call(requestPath, {
              method: "DELETE",
              body: { version: x.version },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call(requestPath, {
              method: "DELETE",
              body: { version: 99, reason: "Duplicada" },
            })
          ).status,
          409,
        );
      },
    );
    let before, noticeId;
    await t.test(
      "La eliminación limpia semáforo, notificaciones, reportes y listados",
      async () => {
        const f = (await call("/fleet/units/" + ids[0])).body;
        assert.equal(f.unit.serviceRequests, 1);
        noticeId = (
          await call(
            "/notifications?today=" + new Date().toISOString().slice(0, 10),
          )
        ).body.items.find((n) => n.targetId === x.id)?.id;
        assert.ok(noticeId);
        before = await snapshots();
        const d = await call(requestPath, {
          method: "DELETE",
          body: { version: x.version, reason: "Duplicada por captura" },
        });
        assert.equal(d.status, 200, JSON.stringify(d.body));
        x = d.body;
        assert.ok(x.deletedAt);
        assert.equal(x.version, 2);
        assert.equal(x.events[0].action, "eliminacion");
        assert.equal(x.events[0].details.notes, "Duplicada por captura");
        assert.deepEqual(await snapshots(), before);
        for (const user of ["admin", "hispa", "fleet"]) {
          assert.ok(
            !(await call("/requests", { user })).body.items.some(
              (r) => r.id === x.id,
            ),
          );
          assert.ok(
            !(
              await call(
                "/notifications?today=" + new Date().toISOString().slice(0, 10),
                { user },
              )
            ).body.items.some((n) => n.targetId === x.id),
          );
          const report = (
            await call(
              "/reports?period=month&anchor=" +
                new Date().toISOString().slice(0, 10),
              { user },
            )
          ).body;
          assert.ok(!report.requests.some((r) => r.id === x.id));
          assert.ok(!report.pendingRequests.some((r) => r.id === x.id));
        }
        for (const user of ["hispa", "fleet"])
          assert.equal((await call(requestPath, { user })).status, 404);
        assert.equal(
          (await call("/requests?deleted=true")).body.items[0].id,
          x.id,
        );
        const f2 = (await call("/fleet/units/" + ids[0])).body;
        assert.equal(f2.unit.serviceRequests, 0);
        assert.ok(!f2.requests.some((r) => r.id === x.id));
        assert.equal(
          (
            await call(requestPath, {
              method: "PATCH",
              body: { version: x.version, status: "en_revision" },
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await call(requestPath + "/create-order", {
              method: "POST",
              body: {
                version: x.version,
                type: "menor",
                serviceDate: "2026-10-22",
              },
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await call("/requests", {
              method: "POST",
              user: "hispa",
              body: input,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await call(requestPath, {
              method: "DELETE",
              body: { version: 1, reason: "Duplicada" },
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "Recuperación conserva seguimiento y orden; eliminar no cambia el documento técnico",
      async () => {
        assert.equal(
          (
            await call(requestPath + "/restore", {
              method: "POST",
              body: { version: 1 },
            })
          ).status,
          409,
        );
        const restored = await call(requestPath + "/restore", {
          method: "POST",
          body: { version: x.version },
        });
        assert.equal(restored.status, 200);
        x = restored.body;
        assert.equal(x.deletedAt, null);
        assert.equal(x.status, "recibida");
        assert.equal(x.events[0].action, "restauracion");
        assert.deepEqual(await snapshots(), before);
        assert.equal((await call(requestPath, { user: "fleet" })).status, 200);
        const linked = await call(requestPath + "/create-order", {
          method: "POST",
          body: {
            version: x.version,
            type: "menor",
            serviceDate: "2026-10-22",
          },
        });
        assert.equal(linked.status, 201, JSON.stringify(linked.body));
        x = (await call(requestPath)).body;
        before = await snapshots();
        x = (
          await call(requestPath, {
            method: "DELETE",
            body: {
              version: x.version,
              reason: "Retirar solicitud, conservar intervención",
            },
          })
        ).body;
        assert.equal(x.serviceId, linked.body.id);
        assert.deepEqual(await snapshots(), before);
        assert.equal(
          (await call("/orders/" + linked.body.id, { user: "hispa" })).status,
          200,
        );
        assert.equal(
          (
            await call(requestPath + "/create-order", {
              method: "POST",
              body: { version: x.version, type: "menor" },
            })
          ).status,
          409,
        );
        x = (
          await call(requestPath + "/restore", {
            method: "POST",
            body: { version: x.version },
          })
        ).body;
        assert.equal(x.serviceId, linked.body.id);
        assert.equal(x.status, "orden_creada");
        const replay = await call(requestPath + "/create-order", {
          method: "POST",
          body: { version: x.version, type: "menor" },
        });
        assert.equal(replay.body.id, linked.body.id);
        assert.equal(replay.body.replayed, true);
        assert.deepEqual(await snapshots(), before);
      },
    );
    await t.test(
      "Solicitudes de refacciones no se eliminan; candidatos solo de solicitudes activas",
      async () => {
        const part = (
          await call("/requests", {
            method: "POST",
            body: {
              ...input,
              clientKey: "part-removal-block",
              kind: "part",
              partName: "Filtro",
              quantity: 1,
            },
          })
        ).body;
        assert.equal(
          (
            await call("/requests/" + part.id, {
              method: "DELETE",
              body: { version: part.version, reason: "Prueba" },
            })
          ).status,
          404,
        );
        const orphan = (
          await call("/requests", {
            method: "POST",
            body: {
              ...input,
              clientKey: "orphan-removal",
              company: "Empresa solo solicitud",
              unit: "XYZ",
            },
          })
        ).body;
        assert.ok(
          (await call("/units", { user: "hispa" })).body.some(
            (u) => u.company === "Empresa solo solicitud",
          ),
        );
        await call("/requests/" + orphan.id, {
          method: "DELETE",
          body: { version: orphan.version, reason: "Prueba" },
        });
        assert.ok(
          !(await call("/units", { user: "hispa" })).body.some(
            (u) => u.company === "Empresa solo solicitud",
          ),
        );
        assert.ok(
          !(
            await call("/reports/options", { user: "hispa" })
          ).body.companies.includes("Empresa solo solicitud"),
        );
      },
    );
  } finally {
    await h.close();
  }
});
