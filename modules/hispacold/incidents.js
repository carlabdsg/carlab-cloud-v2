"use strict";
const crypto = require("crypto");
const schema = `
CREATE TABLE IF NOT EXISTS ac_incidents (
 request_id TEXT PRIMARY KEY REFERENCES ac_requests(id), number BIGSERIAL UNIQUE,
 fleet_unit_id TEXT NOT NULL REFERENCES ac_fleet_units(id), category TEXT NOT NULL,
 equipment_state TEXT NOT NULL, occurred_on DATE NOT NULL,
 status TEXT NOT NULL DEFAULT 'nuevo' CHECK(status IN ('nuevo','revision','atencion','confirmacion','resuelto','descartado')),
 assignee_id TEXT REFERENCES users(id), resolution TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ac_incidents_unit_idx ON ac_incidents(fleet_unit_id,category);
`;
const categories = {
  no_enfria: "No enfría",
  poco_frio: "Enfriamiento insuficiente",
  ventilacion: "Sin ventilación",
  fuga: "Fuga visible",
  ruido: "Ruido o vibración",
  alarma: "Código de alarma",
  otra: "Otra incidencia",
};
const equipmentStates = {
  operativo: "Funciona",
  parcial: "Funciona parcialmente",
  detenido: "No funciona",
  desconocido: "No se ha comprobado",
};
const stages = {
  nuevo: "Nuevo",
  revision: "En revisión",
  atencion: "En atención",
  confirmacion: "Por confirmar",
  resuelto: "Resuelto",
  descartado: "Descartado",
};
const effective = `(CASE WHEN i.status IN ('resuelto','descartado') THEN i.status WHEN r.service_id IS NOT NULL AND s.status='completado' AND s.deleted_at IS NULL THEN 'confirmacion' WHEN r.service_id IS NOT NULL AND i.status='confirmacion' THEN 'atencion' ELSE i.status END)`;
const joins = `FROM ac_incidents i JOIN ac_requests r ON r.id=i.request_id LEFT JOIN hc_services s ON s.id=r.service_id AND LOWER(TRIM(s.company))=LOWER(TRIM(r.operator_company)) AND LOWER(TRIM(s.unit))=LOWER(TRIM(r.unit)) AND COALESCE(s.payload->>'brand','hispacold')=r.brand LEFT JOIN users a ON a.id=i.assignee_id`;
const cols = `r.*,i.number AS incident_number,i.fleet_unit_id,i.category,i.equipment_state,TO_CHAR(i.occurred_on,'YYYY-MM-DD') AS occurred_on,i.assignee_id,i.resolution,a.nombre AS assignee,i.status AS stored_status,${effective} AS incident_status,s.status AS order_status,s.version AS order_version,s.number AS order_number,s.deleted_at AS order_deleted`;
const folio = (n) => "IAC-" + String(n).padStart(6, "0");
function register(router, deps) {
  const {
    pool,
    wrap,
    admin,
    allowed,
    transaction,
    fail,
    text,
    day,
    key,
    image,
    page,
    notice,
  } = deps;
  const scope = (req, p, w) => {
    if (req.acBrand) {
      p.push(req.acBrand);
      w.push(`r.brand=$${p.length}`);
    }
    if (req.acCompany) {
      p.push(req.acCompany);
      w.push(`LOWER(TRIM(r.operator_company))=LOWER(TRIM($${p.length}))`);
    }
  };
  const photos = (input) => {
    if (input == null) return [];
    if (!Array.isArray(input) || input.length > 4)
      fail("Adjunta hasta cuatro fotografías por actualización.");
    return input.map((p) => {
      const data = image(p?.data);
      if (!data) fail("Fotografía vacía.");
      return { data, caption: text(p.caption, 300) };
    });
  };
  function item(r, detail = false) {
    const data = { ...r.payload };
    delete data.incidentHash;
    const photoCount = (data.evidence || []).length;
    if (!detail) delete data.evidence;
    return {
      id: r.id,
      folio: folio(r.incident_number),
      unitId: r.fleet_unit_id,
      company: r.operator_company,
      unit: r.unit,
      brand: r.brand,
      category: r.category,
      equipmentState: r.equipment_state,
      occurredOn: String(r.occurred_on).slice(0, 10),
      status: r.incident_status,
      version: r.version,
      assigneeId: r.assignee_id,
      assignee: r.assignee || "Sin asignar",
      resolution: r.resolution,
      data,
      photoCount,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      order: r.service_id
        ? {
            id: r.service_id,
            folio: r.order_number
              ? "HC-" + String(r.order_number).padStart(6, "0")
              : "Orden no disponible",
            status: r.order_status,
            version: r.order_version,
            deleted: !!r.order_deleted || !r.order_status,
          }
        : null,
      deletedAt: r.deleted_at,
      recurrences: Number(r.recurrences || 0),
    };
  }
  async function get(req, id, db = pool, lock = false) {
    const r = (
      await db.query(
        `SELECT ${cols} ${joins} WHERE r.id=$1 ${lock ? "FOR UPDATE OF r,i" : ""}`,
        [id],
      )
    ).rows[0];
    if (!r || (r.deleted_at && !req.acAdmin))
      fail("Reporte no encontrado.", 404);
    allowed(req, r.brand, r.operator_company);
    if (lock && r.service_id) {
      // Hold the order stable while validating a confirmation or link transition.
      const order = (
        await db.query(
          "SELECT s.status,s.version,s.deleted_at FROM hc_services s JOIN ac_requests r ON r.service_id=s.id AND LOWER(TRIM(s.company))=LOWER(TRIM(r.operator_company)) AND LOWER(TRIM(s.unit))=LOWER(TRIM(r.unit)) AND COALESCE(s.payload->>'brand','hispacold')=r.brand WHERE r.id=$1 FOR SHARE OF s",
          [r.id],
        )
      ).rows[0];
      r.order_version = order?.version ?? null;
      r.order_status = order?.status ?? null;
      r.order_deleted = order?.deleted_at ?? null;
      r.incident_status = ["resuelto", "descartado"].includes(r.stored_status)
        ? r.stored_status
        : order?.status === "completado" && !order.deleted_at
          ? "confirmacion"
          : r.stored_status === "confirmacion"
            ? "atencion"
            : r.stored_status;
    }
    return r;
  }
  async function detail(req, id) {
    const r = await get(req, id);
    const events = (
      await pool.query(
        "SELECT actor_name,action,details,created_at FROM ac_request_events WHERE request_id=$1 ORDER BY id DESC LIMIT 100",
        [id],
      )
    ).rows;
    const count = (
      await pool.query(
        `SELECT COUNT(*)::int n FROM ac_incidents i JOIN ac_requests r ON r.id=i.request_id WHERE i.fleet_unit_id=$1 AND i.category=$2 AND r.id<>$3 AND r.deleted_at IS NULL AND r.created_at >= NOW()-INTERVAL '90 days'`,
        [r.fleet_unit_id, r.category, id],
      )
    ).rows[0].n;
    return { ...item({ ...r, recurrences: count }, true), events };
  }
  async function audit(db, req, id, action, details) {
    await db.query(
      "INSERT INTO ac_request_events(request_id,actor,actor_name,action,details) VALUES($1,$2,$3,$4,$5)",
      [id, req.acUser.id, req.acUser.nombre, action, JSON.stringify(details)],
    );
  }
  async function notify(db, row, title, version) {
    await notice(db, {
      eventKey: `incident:${row.id}:${version}`,
      brand: row.brand,
      kind: "incident",
      title: `${folio(row.incident_number)} · ${title}`,
      body: `${row.operator_company} · Unidad ${row.unit}`,
      targetType: "request",
      targetId: row.id,
    });
  }
  const checkVersion = (r, b) => {
    if (
      r.version !== b.version ||
      (r.service_id && b.orderVersion !== r.order_version)
    )
      fail(
        "El reporte o su orden cambió. Actualiza la ficha antes de continuar.",
        409,
      );
  };
  router.get(
    "/incidents/options",
    wrap(async (req, res) =>
      res.json({
        categories,
        equipmentStates,
        stages,
        assignees: req.acAdmin
          ? (
              await pool.query(
                "SELECT id,nombre FROM users WHERE role='admin' AND activo=TRUE AND deleted_at IS NULL ORDER BY nombre",
              )
            ).rows
          : [],
      }),
    ),
  );
  router.get(
    "/incidents/units",
    wrap(async (req, res) => {
      const p = [],
        w = ["u.active=TRUE"];
      if (req.acBrand) {
        p.push(req.acBrand);
        w.push(`u.brand=$${p.length}`);
      }
      if (req.acCompanyId) {
        p.push(req.acCompanyId);
        w.push(`u.company_id=$${p.length}`);
      }
      if (req.query.id) {
        p.push(text(req.query.id, 100));
        w.push(`u.id=$${p.length}`);
      }
      if (req.query.q) {
        p.push("%" + text(req.query.q, 180) + "%");
        w.push(`(u.unit||' '||c.name) ILIKE $${p.length}`);
      }
      res.json(
        (
          await pool.query(
            `SELECT u.id,u.unit,u.brand,c.name AS company FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id WHERE ${w.join(" AND ")} ORDER BY c.name,u.unit LIMIT 50`,
            p,
          )
        ).rows,
      );
    }),
  );
  router.get(
    "/incidents",
    wrap(async (req, res) => {
      const p = [],
        w = [
          req.query.deleted === "true"
            ? "r.deleted_at IS NOT NULL"
            : "r.deleted_at IS NULL",
        ];
      if (req.query.deleted === "true" && !req.acAdmin)
        fail("Acceso exclusivo de Carlab.", 403);
      scope(req, p, w);
      for (const [param, col] of [
        ["unitId", "i.fleet_unit_id"],
        ["category", "i.category"],
        ["brand", "r.brand"],
      ])
        if (req.query[param]) {
          p.push(text(req.query[param], 100));
          w.push(`${col}=$${p.length}`);
        }
      if (req.query.q) {
        p.push("%" + text(req.query.q, 180) + "%");
        w.push(
          `(r.unit||' '||r.operator_company||' IAC-'||LPAD(i.number::text,6,'0')||' '||COALESCE(r.payload->>'description','')) ILIKE $${p.length}`,
        );
      }
      const base = w.join(" AND ");
      const summary = (
        await pool.query(
          `SELECT COUNT(*) FILTER(WHERE ${effective}='nuevo')::int nuevos,COUNT(*) FILTER(WHERE ${effective} NOT IN ('resuelto','descartado') AND r.payload->>'priority'='urgente')::int urgentes,COUNT(*) FILTER(WHERE ${effective} IN ('revision','atencion'))::int atencion,COUNT(*) FILTER(WHERE ${effective}='confirmacion')::int confirmacion,COUNT(*) FILTER(WHERE ${effective} NOT IN ('resuelto','descartado'))::int abiertos ${joins} WHERE ${base}`,
          p,
        )
      ).rows[0];
      if (req.query.status) {
        if (req.query.status === "abiertos")
          w.push(`${effective} NOT IN ('resuelto','descartado')`);
        else if (req.query.status === "urgentes")
          w.push(
            `${effective} NOT IN ('resuelto','descartado') AND r.payload->>'priority'='urgente'`,
          );
        else if (req.query.status === "seguimiento")
          w.push(`${effective} IN ('revision','atencion')`);
        else {
          if (!stages[req.query.status]) fail("Estado inválido.");
          p.push(req.query.status);
          w.push(`${effective}=$${p.length}`);
        }
      }
      const where = w.join(" AND "),
        offset = page(req.query);
      const total = (
        await pool.query(`SELECT COUNT(*)::int n ${joins} WHERE ${where}`, p)
      ).rows[0].n;
      // Summary queries deliberately omit image data.
      const listCols = cols.replace(
        "r.*",
        "r.id,r.unit,r.operator_company,r.brand,r.version,r.service_id,r.created_at,r.updated_at,r.deleted_at,(r.payload-'evidence') AS payload,jsonb_array_length(COALESCE(r.payload->'evidence','[]'::jsonb)) AS photo_count",
      );
      const rows = (
        await pool.query(
          `SELECT ${listCols},(SELECT COUNT(*) FROM ac_incidents prev JOIN ac_requests pr ON pr.id=prev.request_id WHERE prev.fleet_unit_id=i.fleet_unit_id AND prev.category=i.category AND pr.id<>r.id AND pr.deleted_at IS NULL AND pr.created_at>=NOW()-INTERVAL '90 days') AS recurrences ${joins} WHERE ${where} ORDER BY CASE WHEN ${effective} IN ('resuelto','descartado') THEN 2 WHEN r.payload->>'priority'='urgente' THEN 0 ELSE 1 END,r.updated_at DESC,r.number DESC LIMIT 25 OFFSET $${p.length + 1}`,
          [...p, offset],
        )
      ).rows;
      res.json({
        items: rows.map((r) => ({ ...item(r), photoCount: r.photo_count })),
        total,
        summary,
        offset,
      });
    }),
  );
  router.post(
    "/incidents",
    wrap(async (req, res) => {
      const b = req.body,
        clientKey = key(b.clientKey),
        unitId = text(b.unitId, 100),
        category = text(b.category, 30),
        equipmentState = text(b.equipmentState, 30),
        description = text(b.description, 4000),
        occurredOn = day(b.occurredOn),
        priority = text(b.priority || "normal", 20),
        evidence = photos(b.evidence);
      if (
        !categories[category] ||
        !equipmentStates[equipmentState] ||
        !description ||
        !occurredOn ||
        !["normal", "alta", "urgente"].includes(priority)
      )
        fail("Selecciona unidad, incidencia, condición, fecha y descripción.");
      if (
        occurredOn >
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Mazatlan",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date())
      )
        fail("La fecha de detección no puede estar en el futuro.");
      const inputHash = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            unitId,
            category,
            equipmentState,
            description,
            occurredOn,
            priority,
            evidence,
            location: text(b.location, 300),
            contact: text(b.contact, 200),
          }),
        )
        .digest("hex");
      const out = await transaction(async (db) => {
        const u = (
          await db.query(
            "SELECT u.*,c.name AS company FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id WHERE u.id=$1 FOR UPDATE OF u",
            [unitId],
          )
        ).rows[0];
        if (!u) fail("Unidad no encontrada.", 404);
        allowed(req, u.brand, u.company);
        const old = (
          await db.query(
            "SELECT id,payload,deleted_at FROM ac_requests WHERE created_by=$1 AND client_key=$2",
            [req.acUser.id, clientKey],
          )
        ).rows[0];
        if (old) {
          if (old.deleted_at || old.payload.incidentHash !== inputHash)
            fail(
              "Este envío ya se utilizó. Actualiza antes de continuar.",
              409,
            );
          return { id: old.id, replayed: true };
        }
        if (!u.active) fail("La unidad fue retirada de la flota.", 409);
        const duplicates = (
          await db.query(
            `SELECT r.id,i.number ${joins} WHERE i.fleet_unit_id=$1 AND i.category=$2 AND r.deleted_at IS NULL AND ${effective} NOT IN ('resuelto','descartado') ORDER BY r.created_at DESC`,
            [unitId, category],
          )
        ).rows;
        const separateReason = text(b.separateReason, 1000);
        if (duplicates.length && !separateReason)
          return {
            duplicates: duplicates.map((r) => ({
              id: r.id,
              folio: folio(r.number),
            })),
          };
        const id = crypto.randomUUID(),
          payload = {
            description,
            priority,
            evidence,
            location: text(b.location, 300),
            contact: text(b.contact, 200),
            incident: true,
            incidentHash: inputHash,
          };
        await db.query(
          "INSERT INTO ac_requests(id,client_key,kind,brand,operator_company,unit,payload,created_by,updated_by) VALUES($1,$2,'service',$3,$4,$5,$6,$7,$7)",
          [
            id,
            clientKey,
            u.brand,
            u.company,
            u.unit,
            JSON.stringify(payload),
            req.acUser.id,
          ],
        );
        const meta = (
          await db.query(
            "INSERT INTO ac_incidents(request_id,fleet_unit_id,category,equipment_state,occurred_on) VALUES($1,$2,$3,$4,$5) RETURNING number",
            [id, unitId, category, equipmentState, occurredOn],
          )
        ).rows[0];
        await db.query(
          "UPDATE ac_requests SET payload=jsonb_set(payload,'{incidentFolio}',to_jsonb($2::text)) WHERE id=$1",
          [id, folio(meta.number)],
        );
        await audit(db, req, id, "reporte_creado", {
          status: "nuevo",
          notes: separateReason,
          category,
        });
        await notify(
          db,
          {
            id,
            incident_number: meta.number,
            brand: u.brand,
            operator_company: u.company,
            unit: u.unit,
          },
          priority === "urgente" ? "Nuevo reporte urgente" : "Nuevo reporte",
          1,
        );
        return { id };
      });
      if (out.duplicates) return res.status(200).json(out);
      res
        .status(out.replayed ? 200 : 201)
        .json({ ...(await detail(req, out.id)), replayed: !!out.replayed });
    }),
  );
  router.get(
    "/incidents/:id",
    wrap(async (req, res) => res.json(await detail(req, req.params.id))),
  );
  router.get(
    "/incidents/:id/orders",
    admin,
    wrap(async (req, res) => {
      const r = await get(req, req.params.id);
      const orders = (
        await pool.query(
          "SELECT id,number,status,service_date FROM hc_services WHERE deleted_at IS NULL AND status<>'cancelado' AND LOWER(TRIM(company))=LOWER(TRIM($1)) AND LOWER(TRIM(unit))=LOWER(TRIM($2)) AND COALESCE(payload->>'brand','hispacold')=$3 ORDER BY service_date DESC,number DESC LIMIT 50",
          [r.operator_company, r.unit, r.brand],
        )
      ).rows;
      res.json(
        orders.map((o) => ({
          ...o,
          folio: "HC-" + String(o.number).padStart(6, "0"),
        })),
      );
    }),
  );
  router.patch(
    "/incidents/:id",
    wrap(async (req, res) => {
      await transaction(async (db) => {
        const r = await get(req, req.params.id, db, true),
          b = req.body;
        checkVersion(r, b);
        if (r.deleted_at)
          fail("Recupera el reporte antes de actualizarlo.", 409);
        const action = text(b.action, 30),
          notes = text(b.notes, 3000),
          extra = photos(b.evidence),
          closed = ["resuelto", "descartado"].includes(r.incident_status);
        let status = r.stored_status,
          assignee = r.assignee_id,
          resolution = r.resolution,
          serviceId = r.service_id,
          payload = { ...r.payload };
        if (extra.length && action !== "comment")
          fail("Agrega fotografías mediante información complementaria.");
        if (action === "comment") {
          if (closed) fail("El reporte está cerrado.", 409);
          if (!notes && !extra.length)
            fail("Agrega una observación o fotografía.");
          if ((payload.evidence || []).length + extra.length > 8)
            fail("El reporte admite hasta ocho fotografías.");
          payload.evidence = [...(payload.evidence || []), ...extra];
        } else if (action === "confirm" || action === "persists") {
          if (r.incident_status !== "confirmacion")
            fail(
              "Este reporte todavía no está pendiente de confirmación.",
              409,
            );
          if (!notes) fail("Describe el resultado de la verificación.");
          if (action === "confirm") {
            status = "resuelto";
            resolution = resolution || notes;
          } else {
            status = "revision";
            serviceId = null;
            resolution = "";
          }
        } else {
          if (!req.acAdmin)
            fail("Solo Carlab puede gestionar la atención del reporte.", 403);
          if (closed && action !== "reopen")
            fail("Reabre el reporte antes de modificarlo.", 409);
          if (action === "request_info") {
            if (!notes) fail("Indica qué información necesitas de la flota.");
            status = "revision";
          } else if (action === "review") status = "revision";
          else if (action === "attend") status = "atencion";
          else if (action === "assign") {
            assignee = text(b.assigneeId, 100) || null;
            if (
              assignee &&
              !(
                await db.query(
                  "SELECT id FROM users WHERE id=$1 AND role='admin' AND activo=TRUE AND deleted_at IS NULL",
                  [assignee],
                )
              ).rows.length
            )
              fail("Selecciona un responsable activo de Carlab.");
          } else if (action === "resolve") {
            if (!notes) fail("Registra la conclusión técnica.");
            if (
              r.service_id &&
              (!r.order_status ||
                r.order_deleted ||
                r.order_status !== "completado")
            )
              fail(
                "Finaliza la orden vinculada antes de solicitar confirmación.",
                409,
              );
            status = "confirmacion";
            resolution = notes;
          } else if (action === "discard") {
            if (!notes) fail("Indica el motivo para descartar el reporte.");
            if (
              r.service_id &&
              !r.order_deleted &&
              !["completado", "cancelado"].includes(r.order_status)
            )
              fail(
                "La orden vinculada sigue activa. Gestiona su cierre antes de descartar el reporte.",
                409,
              );
            status = "descartado";
            resolution = notes;
          } else if (action === "reopen") {
            if (!closed || !notes)
              fail("Indica el motivo para reabrir un reporte cerrado.");
            status = "revision";
            resolution = "";
            serviceId = null;
          } else if (action === "link") {
            if (r.service_id) fail("Ya hay una orden vinculada.", 409);
            const s = (
              await db.query(
                "SELECT * FROM hc_services WHERE id=$1 FOR SHARE",
                [text(b.orderId, 100)],
              )
            ).rows[0];
            if (
              !s ||
              s.deleted_at ||
              s.status === "cancelado" ||
              s.company.trim().toLowerCase() !==
                r.operator_company.trim().toLowerCase() ||
              s.unit.trim().toLowerCase() !== r.unit.trim().toLowerCase() ||
              (s.payload.brand || "hispacold") !== r.brand
            )
              fail("La orden no corresponde a esta unidad y marca.", 400);
            serviceId = s.id;
            status = "atencion";
          } else if (action === "unlink") {
            if (!serviceId || !notes)
              fail("Indica por qué desvinculas la orden.");
            serviceId = null;
            status = "revision";
            resolution = "";
          } else if (action === "schedule") {
            const date = day(b.scheduledDate);
            if (!date) fail("Selecciona una fecha de atención.");
            payload.scheduledDate = date;
            status = "atencion";
          } else fail("Acción inválida.");
        }
        if (["persists", "reopen"].includes(action))
          delete payload.scheduledDate;
        // Keep the legacy request channel in sync without creating another request.
        const requestStatus =
          status === "resuelto"
            ? "atendida"
            : status === "descartado"
              ? "cancelada"
              : serviceId
                ? "orden_creada"
                : payload.scheduledDate
                  ? "programada"
                  : status === "nuevo"
                    ? "recibida"
                    : "en_revision";
        await db.query(
          "UPDATE ac_incidents SET status=$2,assignee_id=$3,resolution=$4 WHERE request_id=$1",
          [r.id, status, assignee, resolution],
        );
        await db.query(
          "UPDATE ac_requests SET status=$2,service_id=$3,payload=$4,version=version+1,updated_by=$5,updated_at=NOW() WHERE id=$1",
          [
            r.id,
            requestStatus,
            serviceId,
            JSON.stringify(payload),
            req.acUser.id,
          ],
        );
        await audit(db, req, r.id, action, {
          status,
          notes,
          photosAdded: extra.length,
          assigneeId: assignee,
          orderId: serviceId,
          previousOrderId: r.service_id,
          scheduledDate: payload.scheduledDate || null,
          version: r.version + 1,
          confirmedByAdmin: action === "confirm" && req.acAdmin,
        });
        await notify(
          db,
          r,
          action === "request_info"
            ? "Información solicitada por Carlab"
            : action === "comment"
              ? "Nueva información de seguimiento"
              : stages[status],
          r.version + 1,
        );
      });
      res.json(await detail(req, req.params.id));
    }),
  );
  async function archive(req, res, restore) {
    await transaction(async (db) => {
      const r = await get(req, req.params.id, db, true);
      checkVersion(r, req.body);
      if (restore ? !r.deleted_at : !!r.deleted_at)
        fail("El estado del reporte cambió. Recarga.", 409);
      const reason = text(req.body.reason, 1000);
      if (!reason) fail("Registra el motivo.");
      await db.query(
        restore
          ? "UPDATE ac_requests SET deleted_at=NULL,deleted_by=NULL,deletion_reason=NULL,version=version+1,updated_at=NOW(),updated_by=$2 WHERE id=$1"
          : "UPDATE ac_requests SET deleted_at=NOW(),deleted_by=$2,deletion_reason=$3,version=version+1,updated_at=NOW(),updated_by=$2 WHERE id=$1",
        restore ? [r.id, req.acUser.id] : [r.id, req.acUser.id, reason],
      );
      await audit(db, req, r.id, restore ? "restauracion" : "eliminacion", {
        notes: reason,
      });
    });
    res.json(await detail(req, req.params.id));
  }
  router.delete(
    "/incidents/:id",
    admin,
    wrap((req, res) => archive(req, res, false)),
  );
  router.post(
    "/incidents/:id/restore",
    admin,
    wrap((req, res) => archive(req, res, true)),
  );
  return {
    async beforeOrder(db, req, row) {
      if (!row.payload.incident) return;
      const r = await get(req, row.id, db, true);
      if (row.service_id) {
        if (!r.order_status)
          fail("Desvincula la orden no disponible antes de continuar.", 409);
        return;
      }
      checkVersion(r, req.body);
      if (
        ["resuelto", "descartado", "confirmacion"].includes(r.incident_status)
      )
        fail("El reporte está cerrado o pendiente de confirmación.", 409);
    },
    async afterOrder(db, req, row) {
      if (!row.payload.incident) return;
      await db.query(
        "UPDATE ac_incidents SET status='atencion' WHERE request_id=$1",
        [row.id],
      );
      const r = await get(req, row.id, db);
      await notify(db, r, "Orden vinculada", r.version);
    },
    async reminders(req) {
      const p = [],
        w = ["r.deleted_at IS NULL", `${effective}='confirmacion'`];
      scope(req, p, w);
      await pool.query(
        `INSERT INTO ac_notifications(event_key,brand,audience,kind,title,body,target_type,target_id) SELECT 'incident-confirm:'||r.id||':'||r.version::text||':'||COALESCE(s.version,0)::text,r.brand,'all','incident_confirmation','Confirmar resultado · IAC-'||LPAD(i.number::text,6,'0'),r.operator_company||' · Unidad '||r.unit,'request',r.id ${joins} WHERE ${w.join(" AND ")} ON CONFLICT(event_key) DO NOTHING`,
        p,
      );
    },
  };
}
module.exports = { schema, register, effective };
