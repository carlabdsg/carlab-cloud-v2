"use strict";
const crypto = require("node:crypto");
const qrSettings = require("../reports/qr-settings");
const fail = (status, message) => Object.assign(new Error(message), { status });
const codePattern = /^[a-f0-9]{48}$/;
const MAX_PHOTO = 650 * 1024;

// Public photographs are normalized to JPEG by the client and bounded again here.
function photo(value) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(MAX_PHOTO / 3) * 4 + 30 ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw fail(
      400,
      "Adjunta fotografías JPG válidas de hasta 650 KB cada una.",
    );
  const bytes = Buffer.from(value.slice(23), "base64");
  if (
    bytes.length > MAX_PHOTO ||
    bytes.length < 10 ||
    bytes.readUInt16BE(0) !== 0xffd8 ||
    bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
  )
    throw fail(400, "Una fotografía no es válida. Vuelve a seleccionarla.");
  let dimensions = false;
  for (let i = 2; i + 4 < bytes.length;) {
    if (bytes[i++] !== 0xff) break;
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i + 3 >= bytes.length) break;
    const marker = bytes[i++];
    if (marker === 0xda || marker === 0xd9) break;
    const size = bytes.readUInt16BE(i);
    if (size < 2 || i + size > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && size >= 8) {
      const height = bytes.readUInt16BE(i + 3),
        width = bytes.readUInt16BE(i + 5);
      dimensions =
        width > 0 &&
        height > 0 &&
        width <= 4096 &&
        height <= 4096 &&
        width * height <= 12000000;
      break;
    }
    i += size;
  }
  if (!dimensions)
    throw fail(400, "No se pudo validar el tamaño de una fotografía.");
  return "data:image/jpeg;base64," + bytes.toString("base64");
}

const schema = `CREATE TABLE IF NOT EXISTS ac_qr_intakes (
 id TEXT PRIMARY KEY, number BIGSERIAL UNIQUE, submission_key TEXT NOT NULL UNIQUE,
 code_hash TEXT NOT NULL, general_unit_id TEXT NOT NULL, company TEXT NOT NULL, unit TEXT NOT NULL,
 payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','linked')),
 initial_folio TEXT NOT NULL DEFAULT '', initial_pending BOOLEAN NOT NULL DEFAULT TRUE,
 initial_brand TEXT NOT NULL DEFAULT '', request_id TEXT REFERENCES ac_requests(id) ON DELETE SET NULL,
 ac_unit_id TEXT REFERENCES ac_fleet_units(id), linked_by TEXT, linked_at TIMESTAMPTZ,
 version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ac_qr_intakes_pending ON ac_qr_intakes(status,number DESC);
CREATE INDEX IF NOT EXISTS ac_qr_intakes_unit_time ON ac_qr_intakes(general_unit_id,created_at);`;
const brands = { hispacold: "Hispacold", eberspaecher: "Eberspächer" };
const categories = new Set([
  "no_enfria",
  "poco_frio",
  "ventilacion",
  "fuga",
  "ruido",
  "alarma",
  "otra",
]);
const conditions = new Set(["operativo", "parcial", "detenido", "desconocido"]);
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mazatlan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
const pendingFolio = (r) => "PAC-" + String(r.number).padStart(6, "0");
const acFolio = (n) => "IAC-" + String(n).padStart(6, "0");
const unitColumns =
  "u.id,u.company_id,u.unit,u.brand,u.model,u.ac_model,u.active,c.name AS company";
// Company AND economic number must match. Similar names or numbers alone never establish an association.
async function matchUnit(db, source, lock = false) {
  const r = await db.query(
    `SELECT ${unitColumns} FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id WHERE u.active=TRUE AND LOWER(TRIM(c.name))=LOWER(TRIM($1)) AND LOWER(TRIM(u.unit))=LOWER(TRIM($2))${lock ? " FOR UPDATE OF u FOR SHARE OF c" : ""}`,
    [source.empresa, source.numero_economico],
  );
  return r.rows.length === 1 ? r.rows[0] : null;
}
async function createIncident(db, intake, unit, actor, notice) {
  const id = crypto.randomUUID(),
    data = intake.payload;
  const payload = {
    ...data,
    incident: true,
    source: "guest_qr",
    sourceIntakeFolio: pendingFolio(intake),
    sourceCompany: intake.company,
    sourceUnit: intake.unit,
    incidentHash: hash(
      JSON.stringify({ intake: intake.id, unit: unit.id, data }),
    ),
  };
  await db.query(
    "INSERT INTO ac_requests(id,client_key,kind,brand,operator_company,unit,payload,created_by,updated_by) VALUES($1,$2,'service',$3,$4,$5,$6,'guest-qr',$7)",
    [
      id,
      "qr-intake-" + intake.id,
      unit.brand,
      unit.company,
      unit.unit,
      JSON.stringify(payload),
      actor?.id || "guest-qr",
    ],
  );
  const meta = (
    await db.query(
      "INSERT INTO ac_incidents(request_id,fleet_unit_id,category,equipment_state,occurred_on) VALUES($1,$2,$3,$4,$5) RETURNING number",
      [id, unit.id, data.category, data.equipmentState, data.occurredOn],
    )
  ).rows[0];
  const folio = acFolio(meta.number);
  await db.query(
    "UPDATE ac_requests SET payload=jsonb_set(payload,'{incidentFolio}',to_jsonb($2::text)) WHERE id=$1",
    [id, folio],
  );
  await db.query(
    "INSERT INTO ac_request_events(request_id,actor,actor_name,action,details) VALUES($1,'guest-qr',$2,'reporte_creado',$3)",
    [
      id,
      data.guestReporter.name + " · Visitante QR",
      JSON.stringify({
        source: "general_qr",
        status: "nuevo",
        category: data.category,
        notes: `Recibido desde el QR de reportes. Referencia ${pendingFolio(intake)} · ${intake.company} · Unidad ${intake.unit}. Datos de contacto declarados por el visitante.`,
      }),
    ],
  );
  if (actor)
    await db.query(
      "INSERT INTO ac_request_events(request_id,actor,actor_name,action,details) VALUES($1,$2,$3,'vinculacion_qr',$4)",
      [
        id,
        actor.id,
        actor.nombre,
        JSON.stringify({
          notes: `Administración vinculó ${pendingFolio(intake)} con ${unit.company} · Unidad ${unit.unit} · ${brands[unit.brand]}.`,
          sourceCompany: intake.company,
          sourceUnit: intake.unit,
        }),
      ],
    );
  await db.query(
    "UPDATE ac_qr_intakes SET status='linked',request_id=$2,ac_unit_id=$3,linked_by=$4,linked_at=NOW(),version=version+1 WHERE id=$1",
    [intake.id, id, unit.id, actor?.id || "automatic"],
  );
  await notice(db, {
    eventKey: `incident:${id}:1`,
    brand: unit.brand,
    kind: "incident",
    title: `${folio} · ${data.priority === "urgente" ? "Nuevo reporte urgente" : "Nuevo reporte"} por QR`,
    body: `${unit.company} · Unidad ${unit.unit}`,
    targetType: "request",
    targetId: id,
  });
  return { id, folio };
}
const receipt = (r) => ({
  folio: r.initial_folio,
  receivedAt: r.created_at,
  status: "recibido",
  pendingLink: r.initial_pending,
  unit: {
    empresa: r.company,
    numeroEconomico: r.unit,
    brand: r.initial_brand,
    marca: brands[r.initial_brand] || "Marca por confirmar",
  },
});
function registerPublic(
  app,
  {
    pool,
    ensureOperations,
    ensureQrRegistry,
    secret,
    normalizeMxPhone,
    notice,
  },
) {
  let init;
  const ready = () =>
    (init ||= (async () => {
      await ensureQrRegistry();
      await ensureOperations();
    })().catch((e) => {
      init = null;
      throw e;
    }));
  const read = (db, code, lock = false) =>
    db.query(
      `SELECT g.id,g.empresa,g.nombre_flota,g.numero_economico,g.modelo,g.marca FROM report_unit_qr q JOIN fleet_units g ON g.id=q.fleet_unit_id WHERE q.token=$1${lock ? " FOR UPDATE OF g,q" : ""}`,
      [code],
    );
  const sign = (code, nonce, expires, u) =>
    crypto
      .createHmac("sha256", secret)
      .update(
        JSON.stringify([
          "carlab-general-qr-ac-v1",
          code,
          nonce,
          expires,
          u.id,
          u.empresa,
          u.numero_economico,
        ]),
      )
      .digest("hex");
  const issue = (code, u) => {
    const nonce = crypto.randomBytes(16).toString("hex"),
      expires = String(Date.now() + 12 * 3600000);
    return `${nonce}.${expires}.${sign(code, nonce, expires, u)}`;
  };
  const verify = (token, code, u) => {
    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{32}\.\d{13}\.[a-f0-9]{64}$/.test(token)
    )
      throw fail(400, "Abre nuevamente la etiqueta de reportes.");
    const [nonce, expires, sig] = token.split(".");
    if (
      !crypto.timingSafeEqual(
        Buffer.from(sig, "hex"),
        Buffer.from(sign(code, nonce, expires, u), "hex"),
      )
    )
      throw fail(
        409,
        "La unidad cambió. Abre nuevamente la etiqueta de reportes.",
      );
    if (Number(expires) < Date.now())
      throw fail(410, "El formulario venció. Escanea el QR nuevamente.");
    return nonce;
  };
  const route = (fn) => async (req, res) => {
    res.set({
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    try {
      if (!codePattern.test(req.params.code))
        throw fail(404, "Etiqueta no disponible.");
      await ready();
      await fn(req, res);
    } catch (e) {
      if (!e.status) console.error("[ac-qr-intake]", e.message);
      if (e.status === 429) res.set("Retry-After", "3600");
      res.status(e.status || 500).json({
        ...(e.code === "REPORT_QR_GENERAL_ONLY" ? { code: e.code } : {}),
        error: e.status
          ? e.message
          : "No se pudo confirmar el reporte. Conserva esta página e intenta nuevamente.",
      });
    }
  };
  const path = "/api/public/ac-report-qr/from-report/:code";
  app.get(
    path,
    route(async (req, res) => {
      const u = (await read(pool, req.params.code)).rows[0];
      if (!u)
        throw fail(404, "La unidad de esta etiqueta ya no está disponible.");
      if (!(await qrSettings.options(pool, u)).ac)
        throw Object.assign(
          fail(
            403,
            "Esta flota tiene QR sencillo: únicamente daños y garantías.",
          ),
          { code: "REPORT_QR_GENERAL_ONLY" },
        );
      const ac = await matchUnit(pool, u);
      res.json({
        unit: {
          empresa: u.empresa,
          numeroEconomico: u.numero_economico,
          brand: ac?.brand || "",
          marca: brands[ac?.brand] || "Marca por confirmar",
          modelo: ac?.ac_model || u.modelo || "Pendiente",
        },
        pendingLink: !ac,
        formToken: issue(req.params.code, u),
        maxPhotos: 4,
      });
    }),
  );
  app.post(
    path,
    route(async (req, res) => {
      if (!req.is("application/json"))
        throw fail(415, "Envía el reporte desde el formulario.");
      const b = req.body || {},
        text = (k, min, max) => {
          if (
            typeof b[k] !== "string" ||
            b[k].trim().length < min ||
            b[k].trim().length > max
          )
            throw fail(
              400,
              "Completa los datos obligatorios y revisa la longitud de los textos.",
            );
          return b[k].trim();
        };
      if (b.website || b.confirm !== true)
        throw fail(400, "Confirma los datos antes de enviar.");
      const name = text("name", 3, 120),
        phone = text("phone", 10, 32),
        description = text("description", 10, 4000),
        location = b.location == null ? "" : text("location", 0, 300);
      if (!/^\d{10,15}$/.test(phone.replace(/\D/g, "")))
        throw fail(400, "Escribe un teléfono de contacto válido.");
      if (
        !categories.has(b.category) ||
        !conditions.has(b.equipmentState) ||
        !["normal", "alta", "urgente"].includes(b.priority)
      )
        throw fail(
          400,
          "Selecciona la falla, condición del equipo y prioridad.",
        );
      if (!Array.isArray(b.photos || []) || (b.photos || []).length > 4)
        throw fail(400, "Adjunta hasta cuatro fotografías.");
      const evidence = (b.photos || []).map((v, i) => ({
        data: photo(v),
        caption: `Fotografía ${i + 1} · Visitante QR`,
      }));
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        const u = (await read(db, req.params.code, true)).rows[0];
        if (!u) throw fail(404, "La unidad ya no está disponible.");
        await qrSettings.requireAC(db, u);
        const nonce = verify(b.formToken, req.params.code, u),
          previous = (
            await db.query(
              "SELECT * FROM ac_qr_intakes WHERE submission_key=$1",
              [nonce],
            )
          ).rows[0];
        if (previous) {
          if (previous.code_hash !== hash(req.params.code))
            throw fail(409, "Abre nuevamente la etiqueta.");
          await db.query("COMMIT");
          return res.json(receipt(previous));
        }
        const limits = (
          await db.query(
            "SELECT COUNT(*) FILTER(WHERE created_at>NOW()-INTERVAL '1 hour')::int hour_count,COUNT(*)::int day_count FROM ac_qr_intakes WHERE general_unit_id=$1 AND created_at>NOW()-INTERVAL '1 day'",
            [u.id],
          )
        ).rows[0];
        if (limits.hour_count >= 10 || limits.day_count >= 30)
          throw fail(
            429,
            "Esta unidad recibió varios reportes recientemente. Espera antes de enviar otro o comunícate con CARLAB.",
          );
        const payload = {
          description,
          category: b.category,
          equipmentState: b.equipmentState,
          priority: b.priority,
          location,
          evidence,
          occurredOn: today(),
          contact: `${name} · ${normalizeMxPhone(phone)} · Visitante QR`,
          guestReporter: { name, phone: normalizeMxPhone(phone) },
        };
        const intake = (
          await db.query(
            "INSERT INTO ac_qr_intakes(id,submission_key,code_hash,general_unit_id,company,unit,payload) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
            [
              crypto.randomUUID(),
              nonce,
              hash(req.params.code),
              u.id,
              u.empresa,
              u.numero_economico,
              JSON.stringify(payload),
            ],
          )
        ).rows[0];
        const ac = await matchUnit(db, u, true);
        const linked = ac
          ? await createIncident(db, intake, ac, null, notice)
          : null;
        const saved = (
          await db.query(
            "UPDATE ac_qr_intakes SET initial_folio=$2,initial_pending=$3,initial_brand=$4 WHERE id=$1 RETURNING *",
            [
              intake.id,
              linked?.folio || pendingFolio(intake),
              !linked,
              ac?.brand || "",
            ],
          )
        ).rows[0];
        if (!linked)
          await notice(db, {
            eventKey: "ac-intake:" + intake.id,
            brand: "pending",
            audience: "admin",
            kind: "ac_intake",
            title: pendingFolio(intake) + " · AC pendiente de vincular",
            body: `${u.empresa} · Unidad ${u.numero_economico}`,
            targetType: "ac_intake",
            targetId: intake.id,
          });
        await db.query("COMMIT");
        res.status(201).json(receipt(saved));
      } catch (e) {
        await db.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        db.release();
      }
    }),
  );
}
function registerAdmin(router, { pool, admin, wrap, transaction, notice }) {
  const item = (r, detail = false) => ({
    id: r.id,
    folio: pendingFolio(r),
    company: r.company,
    unit: r.unit,
    status: r.status,
    version: r.version,
    createdAt: r.created_at,
    linkedAt: r.linked_at,
    requestId: r.request_id,
    acUnitId: r.ac_unit_id,
    data: detail
      ? r.payload
      : {
          description: r.payload.description,
          priority: r.payload.priority,
          category: r.payload.category,
        },
    photoCount: r.photo_count ?? (r.payload.evidence || []).length,
  });
  const get = async (id, db = pool, lock = false) => {
    const r = (
      await db.query(
        "SELECT * FROM ac_qr_intakes WHERE id=$1" + (lock ? " FOR UPDATE" : ""),
        [id],
      )
    ).rows[0];
    if (!r) throw fail(404, "Reporte pendiente no encontrado.");
    return r;
  };
  router.get(
    "/qr-intakes",
    admin,
    wrap(async (req, res) => {
      const status = req.query.status || "pending",
        offset = Number(req.query.offset || 0),
        q = String(req.query.q || "").trim();
      if (
        !["pending", "linked"].includes(status) ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > 1000000 ||
        q.length > 180
      )
        throw fail(400, "Filtro inválido.");
      const params = [status, "%" + q + "%"],
        where =
          "status=$1 AND (company||' '||unit||' PAC-'||LPAD(number::text,6,'0')) ILIKE $2";
      const total = (
        await pool.query(
          "SELECT COUNT(*)::int n FROM ac_qr_intakes WHERE " + where,
          params,
        )
      ).rows[0].n;
      const rows = await pool.query(
        "SELECT id,number,company,unit,status,version,created_at,linked_at,request_id,ac_unit_id,jsonb_build_object('description',payload->'description','priority',payload->'priority','category',payload->'category') AS payload,jsonb_array_length(COALESCE(payload->'evidence','[]'::jsonb)) AS photo_count FROM ac_qr_intakes WHERE " +
          where +
          " ORDER BY CASE WHEN payload->>'priority'='urgente' THEN 0 ELSE 1 END,number DESC LIMIT 25 OFFSET $3",
        [...params, offset],
      );
      res.json({ items: rows.rows.map((r) => item(r)), total, offset });
    }),
  );
  router.get(
    "/qr-intakes/:id",
    admin,
    wrap(async (req, res) => res.json(item(await get(req.params.id), true))),
  );
  router.get(
    "/qr-intakes/:id/candidates",
    admin,
    wrap(async (req, res) => {
      const intake = await get(req.params.id),
        q = String(req.query.q ?? intake.unit).trim();
      if (q.length > 180) throw fail(400, "Búsqueda demasiado extensa.");
      const rows = await pool.query(
        `SELECT ${unitColumns} FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id WHERE u.active=TRUE AND (u.unit||' '||c.name) ILIKE $1 ORDER BY (LOWER(TRIM(c.name))=LOWER(TRIM($2))) DESC,c.name,u.unit LIMIT 41`,
        ["%" + q + "%", intake.company],
      );
      res.json({
        items: rows.rows.slice(0, 40).map((u) => ({
          id: u.id,
          company: u.company,
          unit: u.unit,
          brand: u.brand,
          brandName: brands[u.brand],
          model: u.ac_model || u.model,
        })),
        hasMore: rows.rows.length > 40,
      });
    }),
  );
  router.post(
    "/qr-intakes/:id/link",
    admin,
    wrap(async (req, res) => {
      const result = await transaction(async (db) => {
        const intake = await get(req.params.id, db, true);
        if (intake.status === "linked") {
          if (req.body.unitId !== intake.ac_unit_id)
            throw fail(
              409,
              "Este reporte ya se vinculó a otra ficha. Actualiza la lista.",
            );
          return { requestId: intake.request_id, replayed: true };
        }
        if (
          req.body.version !== intake.version ||
          req.body.confirm !== true ||
          typeof req.body.unitId !== "string"
        )
          throw fail(
            409,
            "Confirma la unidad seleccionada y actualiza si la ficha cambió.",
          );
        const u = (
          await db.query(
            `SELECT ${unitColumns} FROM ac_fleet_units u JOIN ac_fleet_companies c ON c.id=u.company_id WHERE u.id=$1 FOR UPDATE OF u FOR SHARE OF c`,
            [req.body.unitId],
          )
        ).rows[0];
        if (!u || !u.active)
          throw fail(409, "Selecciona una unidad activa en las flotas de AC.");
        const linked = await createIncident(db, intake, u, req.acUser, notice);
        return { requestId: linked.id, folio: linked.folio, replayed: false };
      });
      res.json(result);
    }),
  );
}
module.exports = { schema, registerPublic, registerAdmin };
