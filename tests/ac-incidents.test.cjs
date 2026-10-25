const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { setup } = require("./ac-qr-fixture.cjs");
const photo = {
  data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=",
  caption: "Evidencia de prueba",
};
test("Reportes AC: alcance, duplicados, atención, orden, confirmación y archivo", async () => {
  const { h, call, ids, order } = await setup();
  try {
    const unit = (await call("/fleet/units/" + ids[0])).body.unit;
    await h.db.query(
      "INSERT INTO users(id,nombre,role,activo,empresa) VALUES('fleet','Supervisor empresa','supervisor_ac',true,'Transportes QR'),('other','Otra empresa','supervisor_ac',true,'Otra')",
    );
    const otherCompany = (
      await call("/fleet/companies", {
        method: "POST",
        body: { name: "Otra empresa" },
      })
    ).body;
    await h.db.query(
      "INSERT INTO ac_supervisor_access(user_id,scope_type,company_id) VALUES('fleet','fleet',$1),('other','fleet',$2)",
      [unit.companyId, otherCompany.id],
    );
    const make = (more = {}) => ({
      clientKey: crypto.randomUUID(),
      unitId: ids[0],
      category: "no_enfria",
      equipmentState: "parcial",
      description: "Enfriamiento insuficiente en ruta.",
      occurredOn: "2026-10-25",
      priority: "urgente",
      evidence: [photo],
      ...more,
    });
    const create = (body, user = "hispa") =>
      call("/incidents", { method: "POST", body, user });
    const data = make();
    const made = await create(data);
    assert.equal(made.status, 201, JSON.stringify(made.body));
    let x = made.body;
    assert.match(x.folio, /^IAC-/);
    assert.equal(x.occurredOn, "2026-10-25");
    assert.equal(x.data.incidentHash, undefined);
    assert.equal((await create(data)).body.id, x.id);
    assert.equal(
      (await create({ ...data, description: "Cambió" })).status,
      409,
    );
    assert.equal((await create(make({ unitId: ids[1] }))).status, 404);
    assert.equal(
      (await call("/incidents/" + x.id, { user: "eber" })).status,
      404,
    );
    assert.equal(
      (await call("/incidents/" + x.id, { user: "other" })).status,
      404,
    );
    assert.equal(
      (await call("/incidents/" + x.id, { user: "fleet" })).status,
      200,
    );
    assert.equal(
      (await call("/incidents/units", { user: "fleet" })).body.length,
      2,
    );
    assert.equal(
      (await call("/incidents/units", { user: "hispa" })).body.length,
      1,
    );
    assert.equal(
      (await call("/incidents?brand=hispacold", { user: "eber" })).body.total,
      0,
    );
    assert.equal((await call("/incidents", { user: "other" })).body.total, 0);
    assert.equal(
      (await call("/incidents/options", { user: "fleet" })).body.assignees
        .length,
      0,
    );
    const dup = await create(make());
    assert.equal(dup.status, 200);
    assert.equal(dup.body.duplicates[0].id, x.id);
    assert.equal(
      (await call("/requests")).body.total,
      0,
      "No se duplica en solicitudes",
    );
    const list = (await call("/incidents")).body;
    assert.equal(list.summary.urgentes, 1);
    assert.equal(list.items[0].photoCount, 1);
    assert.equal(list.items[0].data.evidence, undefined);
    const get = async () => {
      x = (await call("/incidents/" + x.id)).body;
      return x;
    };
    const change = async (action, body = {}, user = "admin") =>
      call("/incidents/" + x.id, {
        method: "PATCH",
        user,
        body: {
          version: x.version,
          orderVersion: x.order?.version ?? null,
          action,
          ...body,
        },
      });
    assert.equal((await change("review", {}, "hispa")).status, 403);
    assert.equal((await change("assign", { assigneeId: "hispa" })).status, 400);
    assert.equal(
      (
        await change(
          "comment",
          { notes: "También ocurre detenido", evidence: [photo] },
          "fleet",
        )
      ).status,
      200,
    );
    await get();
    assert.equal(x.photoCount, 2);
    assert.equal(
      (
        await call("/incidents/" + x.id, {
          method: "PATCH",
          body: { version: 1, action: "comment", notes: "Atrasada" },
        })
      ).status,
      409,
    );
    assert.equal((await change("assign", { assigneeId: "admin" })).status, 200);
    await get();
    assert.equal(x.assigneeId, "admin");
    assert.equal((await change("review")).status, 200);
    await get();
    assert.equal(x.status, "revision");
    assert.equal(
      (await change("schedule", { scheduledDate: "2026-10-27" })).status,
      200,
    );
    await get();
    assert.equal(
      (
        await call("/requests/" + x.id, {
          method: "PATCH",
          body: { version: x.version, status: "cancelada", notes: "bypass" },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call("/requests/" + x.id, {
          method: "DELETE",
          body: { version: x.version, reason: "bypass" },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call("/requests/" + x.id + "/create-order", {
          method: "POST",
          user: "fleet",
          body: { version: x.version, type: "menor" },
        })
      ).status,
      403,
    );
    const calendar = await call(
      "/calendar?today=2026-10-25&month=2026-10&bucket=month",
      { user: "fleet" },
    );
    assert.equal(calendar.status, 200, JSON.stringify(calendar.body));
    assert(
      calendar.body.items.some(
        (r) => r.incidentId === x.id && r.folio === x.folio,
      ),
    );
    const report = await call(
      "/reports?period=month&anchor=2026-10-25&today=2026-10-25",
      { user: "fleet" },
    );
    assert.equal(report.status, 200, JSON.stringify(report.body));
    assert.equal(report.body.summary.incidents, 1);
    assert.equal(report.body.summary.serviceRequests, 0);
    assert.equal(report.body.incidents[0].folio, x.folio);
    assert.equal(
      (
        await call("/reports?period=month&anchor=2026-10-25&today=2026-10-25", {
          user: "other",
        })
      ).body.summary.incidents,
      0,
    );
    const initialVersion = x.version;
    const converted = await call("/requests/" + x.id + "/create-order", {
      method: "POST",
      body: {
        version: x.version,
        type: "menor",
        attention: "express",
        serviceDate: "2026-10-25",
      },
    });
    assert.equal(converted.status, 201, JSON.stringify(converted.body));
    const o = converted.body;
    const replay = await call("/requests/" + x.id + "/create-order", {
      method: "POST",
      body: {
        version: initialVersion,
        type: "menor",
        attention: "express",
        serviceDate: "2026-10-25",
      },
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.id, o.id);

    assert.equal(o.data.evidence.length, 2);
    assert.equal(o.data.company, unit.company);
    assert.equal(o.data.attention, "express");
    await get();
    assert.equal(x.status, "atencion");
    assert.equal(x.order.id, o.id);
    assert.equal(
      (await change("resolve", { notes: "Sin cerrar la orden" })).status,
      409,
    );
    const prior = { version: x.version, orderVersion: x.order.version };
    const closed = await h.request("/services/" + o.id, {
      method: "PUT",
      body: {
        version: o.version,
        data: {
          ...o.data,
          status: "completado",
          workDone: "Corrección del circuito eléctrico.",
          finalTest: "Enfriamiento y operación verificados.",
          result: "operativo",
        },
      },
    });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    assert.equal(
      (
        await call("/incidents/" + x.id, {
          method: "PATCH",
          user: "hispa",
          body: { ...prior, action: "confirm", notes: "Sin actualización" },
        })
      ).status,
      409,
    );
    await get();
    assert.equal(x.status, "confirmacion");
    assert.equal((await call("/incidents?status=confirmacion")).body.total, 1);
    const notices = (
      await call("/notifications?today=2026-10-25", { user: "fleet" })
    ).body.items;
    assert(
      notices.some(
        (n) => n.targetId === x.id && n.kind === "incident_confirmation",
      ),
    );
    assert(
      !(
        await call("/notifications?today=2026-10-25", { user: "other" })
      ).body.items.some((n) => n.targetId === x.id),
    );
    assert.equal(
      (
        await change(
          "persists",
          { notes: "La falla reaparece en carretera" },
          "fleet",
        )
      ).status,
      200,
    );
    await get();
    assert.equal(x.status, "revision");
    assert.equal(x.order, null);
    assert(x.events.some((e) => e.details.previousOrderId === o.id));
    const retryOrder = await call("/requests/" + x.id + "/create-order", {
      method: "POST",
      body: {
        version: x.version,
        type: "menor",
        attention: "normal",
        serviceDate: "2026-10-25",
      },
    });
    assert.equal(retryOrder.status, 201, JSON.stringify(retryOrder.body));
    assert.notEqual(
      retryOrder.body.id,
      o.id,
      "La reincidencia permite una nueva orden sin reutilizar la anterior",
    );
    await get();
    assert.equal(
      (await change("unlink", { notes: "Vincular antecedente de la revisión" }))
        .status,
      200,
    );
    await get();
    assert.equal((await change("link", { orderId: order.id })).status, 200);
    await get();
    assert.equal(x.status, "confirmacion");
    assert.equal(
      (await change("resolve", { notes: "Conclusión técnica registrada" }))
        .status,
      200,
    );
    await get();
    const reopenedOrder = await h.request("/services/" + order.id, {
      method: "PUT",
      body: {
        version: order.version,
        data: {
          ...order.data,
          status: "en_proceso",
          reopenReason: "Validar incidencia persistente",
        },
      },
    });
    assert.equal(reopenedOrder.status, 200, JSON.stringify(reopenedOrder.body));
    await get();
    assert.equal(
      x.status,
      "atencion",
      "Reabrir la orden invalida la confirmación anterior",
    );
    assert.equal(
      (
        await change(
          "confirm",
          { notes: "No debe confirmar trabajo abierto" },
          "fleet",
        )
      ).status,
      409,
    );
    const closedAgain = await h.request("/services/" + order.id, {
      method: "PUT",
      body: {
        version: reopenedOrder.body.version,
        data: {
          ...reopenedOrder.body.data,
          status: "completado",
          workDone: "Inspección y corrección",
          finalTest: "Funcionamiento verificado",
          result: "operativo",
        },
      },
    });
    assert.equal(closedAgain.status, 200, JSON.stringify(closedAgain.body));
    await get();
    assert.equal(
      (
        await change(
          "confirm",
          { notes: "Resultado verificado por la flota" },
          "fleet",
        )
      ).status,
      200,
    );
    await get();
    assert.equal(x.status, "resuelto");
    assert(
      !(
        await call("/notifications?today=2026-10-25", { user: "fleet" })
      ).body.items.some(
        (n) => n.targetId === x.id && n.kind === "incident_confirmation",
      ),
    );

    assert.equal(
      (await change("comment", { notes: "No debe editar cerrado" }, "hispa"))
        .status,
      409,
    );
    assert.equal(
      (await change("reopen", { notes: "Verificar nuevamente" }, "hispa"))
        .status,
      403,
    );
    assert.equal(
      (await change("reopen", { notes: "Revisión adicional" })).status,
      200,
    );
    await get();
    assert.equal(x.order, null);
    assert.equal(
      (
        await change("resolve", {
          notes: "Se verificó operación sin requerir intervención.",
        })
      ).status,
      200,
    );
    await get();
    assert.equal(x.status, "confirmacion");
    assert.equal(
      (await change("confirm", { notes: "Verificado y confirmado" }, "hispa"))
        .status,
      200,
    );
    await get();
    const second = await create(
      make({ evidence: [], description: "Nueva falla posterior." }),
    );
    assert.equal(second.status, 201);
    assert.equal(second.body.recurrences, 1);
    const separate = await create(
      make({ separateReason: "Evento diferente en otro circuito" }),
    );
    assert.equal(separate.status, 201);
    const badLink = await call("/incidents/" + second.body.id, {
      method: "PATCH",
      body: { version: 1, action: "link", orderId: "unknown" },
    });
    assert.equal(badLink.status, 400);
    const before = (await call("/fleet/units/" + ids[0])).body.unit;
    assert.equal(
      (
        await call("/incidents/" + x.id, {
          method: "DELETE",
          user: "hispa",
          body: { version: x.version, reason: "No permitido" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/incidents/" + x.id, {
          method: "DELETE",
          body: {
            ...{ version: x.version, orderVersion: x.order?.version ?? null },
            reason: "Prueba de archivo",
          },
        })
      ).status,
      200,
    );
    assert.equal(
      (await call("/incidents/" + x.id, { user: "hispa" })).status,
      404,
    );
    assert.equal(
      (await call("/incidents?deleted=true", { user: "hispa" })).status,
      403,
    );
    await get();
    assert(x.deletedAt);
    assert.equal(
      (
        await call("/incidents/" + x.id + "/restore", {
          method: "POST",
          body: { version: x.version, reason: "Recuperar" },
        })
      ).status,
      200,
    );
    assert.equal((await call("/orders/" + o.id)).status, 200);
    assert.equal(
      (await call("/fleet/units/" + ids[0])).body.unit.condition,
      before.condition,
      "Un reporte no cambia una evaluación técnica",
    );
    assert.equal(
      (await create(make({ occurredOn: "2099-01-01" }))).status,
      400,
    );
    assert.equal(
      (await create(make({ evidence: [{ data: "javascript:alert(1)" }] })))
        .status,
      400,
    );
    assert.equal(
      (await h.db.query("SELECT data FROM legacy_sentinel")).rows[0].data,
      "reportes-agenda-stock-cobranza",
    );
  } finally {
    await h.close();
  }
});
