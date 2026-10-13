const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  jwt = require("jsonwebtoken");
const { harness } = require("./harness.cjs");
const catalog = require("../modules/hispacold/catalog");
test("Supervisor AC, solicitudes, inventario compartido y notificaciones", async (t) => {
  const h = await harness();
  const call = async (
    route,
    { method = "GET", body, user = "admin", role } = {},
  ) => {
    const r = await fetch(h.url + "/api/ac" + route, {
      method,
      headers: {
        Authorization:
          "Bearer " +
          h.token(user, role || (user === "admin" ? "admin" : "supervisor_ac")),
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json() };
  };
  const draft = (b = "hispacold", status = "borrador", more = {}) => ({
    formVersion: 3,
    brand: b,
    attention: "normal",
    type: "menor",
    company: "Empresa operadora",
    unit: "AC-1",
    serviceDate: "2026-10-10",
    symptoms: "Ventilación intermitente.",
    status,
    ...more,
  });
  const reqBody = (b = "hispacold", kind = "service", more = {}) => ({
    brand: b,
    kind,
    company: "Empresa operadora",
    unit: "AC-1",
    description: "Solicito diagnóstico.",
    clientKey: crypto.randomUUID(),
    ...more,
  });
  let hispa, eber, part, request, order;
  try {
    await t.test(
      "Alta de usuarios externos con marca obligatoria y contraseña protegida",
      async () => {
        assert.equal(
          (
            await call("/users", {
              method: "POST",
              body: {
                nombre: "H",
                email: "h@test.local",
                password: "Password123",
                brand: "carrier",
              },
            })
          ).status,
          400,
        );
        hispa = await call("/users", {
          method: "POST",
          body: {
            nombre: "Representante Hispacold",
            email: "h@test.local",
            password: "Password123",
            brand: "hispacold",
          },
        });
        assert.equal(hispa.status, 201);
        assert.equal(hispa.body.role, "supervisor_ac");
        assert.equal(hispa.body.empresa, "Hispacold");
        assert.equal(hispa.body.password_hash, undefined);
        eber = await call("/users", {
          method: "POST",
          body: {
            nombre: "Representante Eber",
            email: "e@test.local",
            password: " Password123 ",
            brand: "eberspaecher",
          },
        });
        assert.equal(eber.status, 201);
        assert.equal(eber.body.empresa, "Eberspächer");
        const eberHash = (
          await h.db.query("SELECT password_hash FROM users WHERE id=$1", [
            eber.body.id,
          ])
        ).rows[0].password_hash;
        assert(await require("bcryptjs").compare(" Password123 ", eberHash));
        assert.equal(
          (await call("/requests", { method: "POST", body: [] })).status,
          400,
        );
        const u = (
          await h.db.query("SELECT password_hash FROM users WHERE id=$1", [
            hispa.body.id,
          ])
        ).rows[0];
        assert.notEqual(u.password_hash, "Password123");
        assert(
          await require("bcryptjs").compare("Password123", u.password_hash),
        );
        assert.equal(
          (await call("/users", { user: hispa.body.id })).status,
          403,
        );
        assert.equal(
          (
            await call("/users", {
              method: "POST",
              body: {},
              user: hispa.body.id,
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "Rol real y marca actual se comprueban en cada llamada",
      async () => {
        assert.equal(
          (await call("/me", { user: hispa.body.id })).body.user.brand,
          "hispacold",
        );
        assert.equal(
          (await call("/me", { user: hispa.body.id, role: "admin" })).status,
          403,
        );
        await h.db.query("UPDATE users SET activo=FALSE WHERE id=$1", [
          hispa.body.id,
        ]);
        assert.equal((await call("/me", { user: hispa.body.id })).status, 403);
        await h.db.query("UPDATE users SET activo=TRUE WHERE id=$1", [
          hispa.body.id,
        ]);
        assert.equal(
          (
            await h.request("/services", {
              method: "POST",
              user: hispa.body.id,
              role: "supervisor_ac",
              body: { data: draft() },
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "Solicita servicio sin poder fabricar una orden ni cambiar de marca",
      async () => {
        assert.equal(
          (
            await call("/requests", {
              method: "POST",
              user: hispa.body.id,
              body: reqBody("eberspaecher"),
            })
          ).status,
          403,
        );
        const body = reqBody();
        request = await call("/requests", {
          method: "POST",
          user: hispa.body.id,
          body,
        });
        assert.equal(request.status, 201);
        assert.match(request.body.folio, /^SAC-/);
        const duplicate = await call("/requests", {
          method: "POST",
          user: hispa.body.id,
          body,
        });
        assert.equal(duplicate.status, 200);
        assert.equal(duplicate.body.id, request.body.id);
        assert.equal(
          (await call("/requests/" + request.body.id, { user: eber.body.id }))
            .status,
          404,
        );
        assert.equal(
          (
            await call("/requests/" + request.body.id, {
              method: "PATCH",
              user: hispa.body.id,
              body: { version: 1, status: "programada" },
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await call("/requests/" + request.body.id + "/create-order", {
              method: "POST",
              user: hispa.body.id,
              body: { version: 1, type: "menor", serviceDate: "2026-10-13" },
            })
          ).status,
          403,
        );
        const list = await call("/requests?brand=eberspaecher", {
          user: hispa.body.id,
        });
        assert.equal(list.body.items.length, 1);
        assert.equal(list.body.items[0].brand, "hispacold");
        assert.equal(
          (await h.db.query("SELECT COUNT(*)::int n FROM hc_services")).rows[0]
            .n,
          0,
        );
      },
    );
    await t.test(
      "Carlab revisa y convierte una sola vez conservando origen y marca",
      async () => {
        const review = await call("/requests/" + request.body.id, {
          method: "PATCH",
          body: {
            version: 1,
            status: "en_revision",
            notes: "En revisión técnica.",
          },
        });
        assert.equal(review.status, 200);
        const old = await call("/requests/" + request.body.id, {
          method: "PATCH",
          body: {
            version: 1,
            status: "programada",
            scheduledDate: "2026-10-15",
          },
        });
        assert.equal(old.status, 409);
        assert.equal(
          (
            await call("/requests/" + request.body.id + "/create-order", {
              method: "POST",
              body: { version: 1, type: "menor", serviceDate: "2026-10-13" },
            })
          ).status,
          409,
        );
        order = await call("/requests/" + request.body.id + "/create-order", {
          method: "POST",
          body: {
            version: 2,
            type: "menor",
            attention: "express",
            serviceDate: "2026-10-13",
          },
        });
        assert.equal(order.status, 201);
        assert.equal(order.body.data.brand, "hispacold");
        assert.equal(order.body.data.type, "menor");
        assert.equal(order.body.data.symptoms, "Solicito diagnóstico.");
        const again = await call(
          "/requests/" + request.body.id + "/create-order",
          {
            method: "POST",
            body: { version: 2, type: "menor", serviceDate: "2026-10-13" },
          },
        );
        assert.equal(again.status, 200);
        assert.equal(again.body.id, order.body.id);
        assert.equal(
          (await h.db.query("SELECT COUNT(*)::int n FROM hc_services")).rows[0]
            .n,
          1,
        );
        assert.equal(
          (await call("/requests/" + request.body.id)).body.serviceId,
          order.body.id,
        );
      },
    );
    await t.test(
      "Órdenes, unidades y manuales quedan separados por marca, incluso por ID",
      async () => {
        const eb = await h.request("/services", {
          method: "POST",
          body: { data: draft("eberspaecher") },
        });
        assert.equal(eb.status, 201);
        assert.equal(
          (await call("/orders/" + eb.body.id, { user: hispa.body.id })).status,
          404,
        );
        assert.equal(
          (await call("/orders/" + order.body.id, { user: eber.body.id }))
            .status,
          404,
        );
        assert.equal(
          (
            await call("/orders?brand=eberspaecher", { user: hispa.body.id })
          ).body.items.every((x) => x.brand === "hispacold"),
          true,
        );
        const cat = await call("/catalog", { user: hispa.body.id });
        assert.deepEqual(Object.keys(cat.body.brands), ["hispacold"]);
        assert.equal(
          cat.body.manuals.every((m) => m.brand === "hispacold"),
          true,
        );
        assert.equal(
          (
            await call(
              "/manuals/" + catalog.forBrand("eberspaecher").manuals[0].id,
              { user: hispa.body.id },
            )
          ).status,
          404,
        );
        const us = await call("/units", { user: hispa.body.id });
        assert.equal(
          us.body.some((u) => u.company === "Transportes de prueba"),
          false,
        );
        const d = await call("/orders/" + order.body.id, {
          user: hispa.body.id,
        });
        assert.equal(d.body.permissions.costs, false);
        assert.equal(d.body.data.total, undefined);
      },
    );
    await t.test(
      "Cerrar orden refleja atención final en la solicitud y genera notificación",
      async () => {
        const d = {
          ...order.body.data,
          status: "completado",
          workDone: "Se sustituyó el relevador.",
          finalTest: "Ventilación comprobada.",
          result: "operativo",
          parts: [{ description: "Relevador", quantity: 1, unitPrice: 399 }],
        };
        const close = await h.request("/services/" + order.body.id, {
          method: "PUT",
          body: { version: 1, data: d },
        });
        assert.equal(close.status, 200);
        const r = await call("/requests/" + request.body.id, {
          user: hispa.body.id,
        });
        assert.equal(r.body.status, "atendida");
        assert.equal(
          (await call("/requests?status=atendida", { user: hispa.body.id }))
            .body.items.length,
          1,
        );
        const read = await call("/orders/" + order.body.id, {
          user: hispa.body.id,
        });
        assert.equal(read.body.data.parts[0].unitPrice, undefined);
        assert.equal(read.body.data.parts[0].total, undefined);
      },
    );
    await t.test(
      "Refacciones comparten una sola existencia con Stock",
      async () => {
        await h.db.query(
          `INSERT INTO stock_parts(id,nombre,sku,stock_actual) VALUES('legacy-part','Pieza ya existente','EX-01',5)`,
        );
        const attach = await call("/parts", {
          method: "POST",
          body: {
            stockPartId: "legacy-part",
            brands: ["hispacold"],
            models: "B2",
          },
        });
        assert.equal(attach.status, 201);
        assert.equal(
          (
            await h.db.query(
              "SELECT stock_actual FROM stock_parts WHERE id='legacy-part'",
            )
          ).rows[0].stock_actual,
          "5.00",
        );
        part = await call("/parts", {
          method: "POST",
          body: {
            name: "Relevador AC",
            reference: "R-01",
            brands: ["hispacold"],
            minimum: 2,
            cost: 120,
            price: 180,
          },
        });
        assert.equal(part.status, 201);
        const body = {
          kind: "entrada",
          quantity: 3,
          notes: "Factura de recepción.",
          clientKey: crypto.randomUUID(),
        };
        const add = await call("/parts/" + part.body.id + "/movements", {
          method: "POST",
          body,
        });
        assert.equal(add.status, 200);
        assert.equal(add.body.stock, 3);
        assert.equal(
          (
            await call("/parts/" + part.body.id + "/movements", {
              method: "POST",
              body,
            })
          ).body.replayed,
          true,
        );
        assert.equal(
          (
            await h.db.query(
              "SELECT stock_actual FROM stock_parts WHERE id=$1",
              [part.body.id],
            )
          ).rows[0].stock_actual,
          "3.00",
        );
        const list = await call("/parts", { user: hispa.body.id });
        assert.equal(
          list.body.find((p) => p.id === part.body.id).cost,
          undefined,
        );
        assert.equal(
          list.body.find((p) => p.id === part.body.id).stock,
          undefined,
        );
        assert.equal(
          (await call("/parts", { user: eber.body.id })).body.length,
          0,
        );
        assert.equal(
          (
            await call("/parts/" + part.body.id + "/movements", {
              method: "POST",
              user: hispa.body.id,
              body,
            })
          ).status,
          403,
        );
      },
    );
    let supply;
    await t.test(
      "Solicitar y aprobar no descuenta; entregar descuenta una sola vez",
      async () => {
        supply = await call("/requests", {
          method: "POST",
          user: hispa.body.id,
          body: reqBody("hispacold", "part", {
            partId: part.body.id,
            quantity: 2,
            description: "Relevador para mantenimiento.",
            orderId: order.body.id,
          }),
        });
        assert.equal(supply.status, 201);
        assert.equal(
          (
            await call("/requests", {
              method: "POST",
              user: eber.body.id,
              body: reqBody("eberspaecher", "part", {
                partId: part.body.id,
                quantity: 1,
              }),
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await call("/requests/" + supply.body.id, {
              method: "PATCH",
              body: { version: 1, status: "entregada", notes: "Entrega" },
            })
          ).status,
          400,
        );
        const approve = await call("/requests/" + supply.body.id, {
          method: "PATCH",
          body: {
            version: 1,
            status: "aprobada",
            partId: part.body.id,
            notes: "Suministro autorizado.",
          },
        });
        assert.equal(approve.status, 200);
        assert.equal(
          (
            await h.db.query(
              "SELECT stock_actual FROM stock_parts WHERE id=$1",
              [part.body.id],
            )
          ).rows[0].stock_actual,
          "3.00",
        );
        const delivery = await call("/requests/" + supply.body.id, {
          method: "PATCH",
          body: {
            version: 2,
            status: "entregada",
            partId: part.body.id,
            notes: "Recibió personal de la unidad.",
          },
        });
        assert.equal(delivery.status, 200);
        const replay = await call("/requests/" + supply.body.id, {
          method: "PATCH",
          body: {
            version: 2,
            status: "entregada",
            partId: part.body.id,
            notes: "Duplicado",
          },
        });
        assert.equal(replay.status, 409);
        assert.equal(
          (
            await h.db.query(
              "SELECT stock_actual FROM stock_parts WHERE id=$1",
              [part.body.id],
            )
          ).rows[0].stock_actual,
          "1.00",
        );
        const movements = await call("/parts/" + part.body.id + "/movements");
        assert.equal(
          movements.body.filter((m) => m.tipo === "salida_unidad").length,
          1,
        );
        assert.equal(
          movements.body.find((m) => m.tipo === "salida_unidad").garantia_folio,
          order.body.folio,
        );
      },
    );
    await t.test(
      "Entrega sin existencia revierte estado, movimiento y cantidad",
      async () => {
        const r = await call("/requests", {
          method: "POST",
          body: reqBody("hispacold", "part", {
            partId: part.body.id,
            quantity: 2,
          }),
        });
        assert.equal(r.status, 201);
        await call("/requests/" + r.body.id, {
          method: "PATCH",
          body: { version: 1, status: "aprobada" },
        });
        const deliver = await call("/requests/" + r.body.id, {
          method: "PATCH",
          body: { version: 2, status: "entregada", notes: "Entrega" },
        });
        assert.equal(deliver.status, 400);
        assert.equal(
          (await call("/requests/" + r.body.id)).body.status,
          "aprobada",
        );
        assert.equal(
          (
            await h.db.query(
              "SELECT stock_actual FROM stock_parts WHERE id=$1",
              [part.body.id],
            )
          ).rows[0].stock_actual,
          "1.00",
        );
      },
    );
    await t.test(
      "Cantidades, precios, marcas y contenidos inválidos se rechazan",
      async () => {
        for (const qty of [-1, 0, "Infinity", "NaN", 1.234, {}, []])
          assert.equal(
            (
              await call("/parts/" + part.body.id + "/movements", {
                method: "POST",
                body: {
                  kind: "entrada",
                  quantity: qty,
                  notes: "Prueba",
                  clientKey: crypto.randomUUID(),
                },
              })
            ).status,
            400,
          );
        assert.equal(
          (
            await call("/parts", {
              method: "POST",
              body: { name: "X", brands: ["hispacold", "hispacold"] },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call("/parts", {
              method: "POST",
              body: { name: "X", brands: ["hispacold"], cost: -1 },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call("/requests", {
              method: "POST",
              body: reqBody("hispacold", "service", {
                evidence: [{ data: "data:image/svg+xml,<svg>" }],
              }),
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "Campana muestra eventos por marca y lectura individual; recordatorios sin duplicación",
      async () => {
        const a = await call("/notifications?today=2026-10-13");
        assert.equal(a.status, 200, JSON.stringify(a.body));
        assert(a.body.items.some((n) => n.kind === "part_request"));
        const hr = await call("/notifications?today=2026-10-13", {
          user: hispa.body.id,
        });
        assert.equal(hr.status, 200);
        assert(hr.body.items.every((n) => n.brand === "hispacold"));
        assert.equal(
          hr.body.items.some((n) => n.kind === "closure_reminder"),
          false,
        );
        const er = await call("/notifications?today=2026-10-13", {
          user: eber.body.id,
        });
        assert(er.body.items.every((n) => n.brand === "eberspaecher"));
        const unread = a.body.unread;
        await call("/notifications/read", {
          method: "POST",
          user: hispa.body.id,
          body: { throughId: hr.body.throughId },
        });
        assert.equal(
          (
            await call("/notifications?today=2026-10-13", {
              user: hispa.body.id,
            })
          ).body.unread,
          0,
        );
        assert.equal(
          (await call("/notifications?today=2026-10-13")).body.unread,
          unread,
        );
        const before = (
          await h.db.query("SELECT COUNT(*)::int n FROM ac_notifications")
        ).rows[0].n;
        await call("/notifications?today=2026-10-13");
        assert.equal(
          (await h.db.query("SELECT COUNT(*)::int n FROM ac_notifications"))
            .rows[0].n,
          before,
        );
        await call("/notifications/read", {
          method: "POST",
          user: hispa.body.id,
          body: { ids: er.body.items.map((n) => n.id) },
        });
        assert.equal(
          (
            await call("/notifications?today=2026-10-13", {
              user: eber.body.id,
            })
          ).body.unread,
          er.body.unread,
        );
      },
    );
    await t.test(
      "Recordatorios de cierre desaparecen al completar o eliminar; mantenimiento por marca",
      async () => {
        const old = await h.request("/services", {
          method: "POST",
          body: {
            data: draft("hispacold", "en_proceso", {
              serviceDate: "2026-10-09",
            }),
          },
        });
        assert.equal(old.status, 201);
        const notices = await call("/notifications?today=2026-10-13");
        assert(
          notices.body.items.some(
            (n) => n.kind === "closure_reminder" && n.targetId === old.body.id,
          ),
        );
        const deleteOrder = await h.request("/services/" + old.body.id, {
          method: "DELETE",
          body: { version: 1, reason: "Prueba de eliminación" },
        });
        assert.equal(deleteOrder.status, 200);
        assert.equal(
          (await call("/notifications?today=2026-10-13")).body.items.some(
            (n) => n.targetId === old.body.id,
          ),
          false,
        );
        assert.equal(
          (await call("/orders/" + old.body.id, { user: hispa.body.id }))
            .status,
          404,
        );
        const c = await h.request("/services", {
          method: "POST",
          body: {
            data: draft("hispacold", "completado", {
              nextDate: "2026-10-11",
              technician: "Técnico",
              workDone: "Revisión",
              finalTest: "Prueba",
              result: "operativo",
            }),
          },
        });
        assert.equal(c.status, 201);
        const up = await call("/upcoming?today=2026-10-13", {
          user: hispa.body.id,
        });
        assert.equal(up.status, 200, JSON.stringify(up.body));
        assert(up.body.items.some((o) => o.id === c.body.id));
        assert.equal(
          up.body.items.find((o) => o.id === c.body.id).overdue,
          true,
        );
        assert.equal(
          (
            await call("/upcoming?today=2026-10-13", { user: eber.body.id })
          ).body.items.some((o) => o.id === c.body.id),
          false,
        );
        assert(
          (
            await call("/notifications?today=2026-10-13", {
              user: hispa.body.id,
            })
          ).body.items.some(
            (n) => n.kind === "maintenance_due" && n.targetId === c.body.id,
          ),
        );
      },
    );
    await t.test(
      "Cambiar marca e inactivar el usuario revoca su acceso previo",
      async () => {
        const change = await call("/users/" + hispa.body.id, {
          method: "PATCH",
          body: {
            nombre: hispa.body.nombre,
            email: hispa.body.email,
            brand: "eberspaecher",
          },
        });
        assert.equal(change.status, 200);
        assert.equal(
          (await call("/orders/" + order.body.id, { user: hispa.body.id }))
            .status,
          404,
        );
        assert.equal(
          (await call("/me", { user: hispa.body.id })).body.user.brand,
          "eberspaecher",
        );
        await call("/users/" + hispa.body.id, {
          method: "PATCH",
          body: {
            nombre: hispa.body.nombre,
            email: hispa.body.email,
            brand: "eberspaecher",
            activo: false,
          },
        });
        assert.equal(
          (await call("/requests", { user: hispa.body.id })).status,
          403,
        );
      },
    );
    await t.test("Módulos anteriores conservan sus datos", async () => {
      assert.equal(
        (
          await h.db.query(
            "SELECT data FROM legacy_sentinel WHERE id='unchanged'",
          )
        ).rows[0].data,
        "reportes-agenda-stock-cobranza",
      );
      assert.equal(
        (
          await h.db.query(
            "SELECT stock_actual FROM stock_parts WHERE id='legacy-part'",
          )
        ).rows[0].stock_actual,
        "5.00",
      );
    });
  } finally {
    await h.close();
  }
});
test("El guardián de autenticación real bloquea APIs anteriores para Supervisor AC", () => {
  const source = fs.readFileSync(
      require("node:path").join(__dirname, "../server.js"),
      "utf8",
    ),
    start = source.indexOf("function authRequired("),
    end = source.indexOf("\nfunction requireRoles", start);
  const context = { jwt, JWT_SECRET: "test-only" };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const token = jwt.sign(
    { id: "external", role: "supervisor_ac" },
    "test-only",
  );
  for (const url of [
    "/api/garantias",
    "/api/users",
    "/api/fleet/units",
    "/api/stock/parts",
    "/api/hispacold/services",
    "/api/ac-pretend/orders",
  ]) {
    let status = 0,
      next = false;
    context.authRequired(
      { headers: { authorization: "Bearer " + token }, originalUrl: url },
      {
        status(n) {
          status = n;
          return this;
        },
        json() {},
      },
      () => (next = true),
    );
    assert.equal(status, 403, url);
    assert.equal(next, false);
  }
  for (const url of ["/api/ac/orders", "/api/auth/me"]) {
    let next = false;
    context.authRequired(
      { headers: { authorization: "Bearer " + token }, originalUrl: url },
      {
        status() {
          return this;
        },
        json() {},
      },
      () => (next = true),
    );
    assert.equal(next, true, url);
  }
});
