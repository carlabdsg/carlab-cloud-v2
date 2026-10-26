"use strict";
const crypto = require("node:crypto");
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

const { notice } = require("./operations");
const categories = new Set([
  "no_enfria",
  "poco_frio",
  "ventilacion",
  "fuga",
  "ruido",
  "alarma",
  "otra",
]);
const equipmentStates = new Set([
  "operativo",
  "parcial",
  "detenido",
  "desconocido",
]);
const brands = { hispacold: "Hispacold", eberspaecher: "Eberspächer" };
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mazatlan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function register(app, { pool, ensureOperations, secret, normalizeMxPhone }) {
  let initialization;
  const ready = () =>
    (initialization ||= ensureOperations()
      .then(() =>
        pool.query(`
    CREATE TABLE IF NOT EXISTS ac_guest_submissions (
      submission_key TEXT PRIMARY KEY, code_hash TEXT NOT NULL, fleet_unit_id TEXT NOT NULL,
      request_id TEXT REFERENCES ac_requests(id) ON DELETE SET NULL, folio TEXT NOT NULL,
      company TEXT NOT NULL, unit TEXT NOT NULL, brand TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ac_guest_unit_time ON ac_guest_submissions(fleet_unit_id,created_at);
  `),
      )
      .catch((error) => {
        initialization = null;
        throw error;
      }));
  const hash = (value) =>
    crypto.createHash("sha256").update(value).digest("hex");
  const signature = (code, nonce, expires, row) =>
    crypto
      .createHmac("sha256", secret)
      .update(
        JSON.stringify([
          "carlab-public-ac-report-v1",
          code,
          nonce,
          expires,
          row.id,
          row.company_id,
          row.company,
          row.unit,
          row.brand,
        ]),
      )
      .digest("hex");
  const issue = (code, row) => {
    const nonce = crypto.randomBytes(16).toString("hex"),
      expires = String(Date.now() + 12 * 3600000);
    return `${nonce}.${expires}.${signature(code, nonce, expires, row)}`;
  };
  function verify(value, code, row) {
    if (
      typeof value !== "string" ||
      !/^[a-f0-9]{32}\.\d{13}\.[a-f0-9]{64}$/.test(value)
    )
      throw fail(
        400,
        "Abre el QR de aire acondicionado para iniciar el reporte.",
      );
    const [nonce, expires, signed] = value.split(".");
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signed, "hex"),
        Buffer.from(signature(code, nonce, expires, row), "hex"),
      )
    )
      throw fail(
        409,
        "La unidad o su marca cambió. Abre nuevamente la etiqueta de aire acondicionado.",
      );
    if (Number(expires) < Date.now())
      throw fail(
        410,
        "Este formulario venció. Abre el QR nuevamente para enviar el reporte.",
      );
    return nonce;
  }
  const readUnit = (db, code, lock = false) =>
    db.query(
      `SELECT u.id,u.company_id,u.unit,u.brand,u.model,u.ac_model,c.name AS company
    FROM ac_fleet_qr q JOIN ac_fleet_units u ON u.id=q.unit_id JOIN ac_fleet_companies c ON c.id=u.company_id
    WHERE q.token=$1 AND u.active=TRUE${lock ? " FOR UPDATE OF u,q FOR SHARE OF c" : ""}`,
      [code],
    );
  const receipt = (row) => ({
    folio: row.folio,
    receivedAt: row.created_at,
    status: "recibido",
    unit: {
      empresa: row.company,
      numeroEconomico: row.unit,
      brand: row.brand,
      marca: brands[row.brand],
    },
  });
  const route = (fn) => async (req, res) => {
    res.set({
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    try {
      if (!codePattern.test(req.params.code))
        throw fail(
          404,
          "El QR de aire acondicionado no está disponible. Verifica la etiqueta.",
        );
      await ready();
      await fn(req, res);
    } catch (error) {
      if (!error.status) console.error("[ac-guest-report]", error.message);
      if (error.status === 429) res.set("Retry-After", "3600");
      if (!res.headersSent)
        res
          .status(error.status || 500)
          .json({
            error: error.status
              ? error.message
              : "No se pudo completar la operación. Conserva esta página e intenta nuevamente.",
          });
    }
  };
  app.get(
    "/api/public/ac-report-qr/:code",
    route(async (req, res) => {
      const row = (await readUnit(pool, req.params.code)).rows[0];
      if (!row)
        throw fail(
          404,
          "Esta etiqueta fue reemplazada o la unidad ya no está disponible. Solicita el QR actual.",
        );
      res.json({
        unit: {
          empresa: row.company,
          numeroEconomico: row.unit,
          brand: row.brand,
          marca: brands[row.brand],
          modelo: row.ac_model || row.model || "Pendiente",
        },
        formToken: issue(req.params.code, row),
        maxPhotos: 4,
      });
    }),
  );
  app.post(
    "/api/public/ac-report-qr/:code",
    route(async (req, res) => {
      if (!req.is("application/json"))
        throw fail(415, "Envía el reporte desde el formulario del QR.");
      const body = req.body || {};
      const text = (key, min, max) => {
        if (typeof body[key] !== "string")
          throw fail(400, "Completa los datos del formulario.");
        const value = body[key].trim();
        if (value.length < min || value.length > max)
          throw fail(
            400,
            "Revisa los campos obligatorios y la longitud de los textos.",
          );
        return value;
      };
      if (body.website || body.confirm !== true)
        throw fail(400, "Confirma los datos antes de enviar el reporte.");
      const name = text("name", 3, 120),
        phone = text("phone", 10, 32),
        description = text("description", 10, 4000),
        location = body.location == null ? "" : text("location", 0, 300);
      if (!/^\d{10,15}$/.test(phone.replace(/\D/g, "")))
        throw fail(
          400,
          "Escribe un teléfono de contacto válido, con al menos 10 dígitos.",
        );
      if (
        !categories.has(body.category) ||
        !equipmentStates.has(body.equipmentState) ||
        !["normal", "alta", "urgente"].includes(body.priority)
      )
        throw fail(
          400,
          "Selecciona la falla, condición del equipo y prioridad.",
        );
      const photos = body.photos || [];
      if (!Array.isArray(photos) || photos.length > 4)
        throw fail(400, "Puedes adjuntar hasta 4 fotografías.");
      const evidence = photos.map((value, index) => ({
        data: photo(value),
        caption: `Fotografía ${index + 1} · Visitante QR`,
      }));
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const row = (await readUnit(client, req.params.code, true)).rows[0];
        if (!row)
          throw fail(
            404,
            "Esta etiqueta fue reemplazada o la unidad ya no está disponible.",
          );
        const nonce = verify(body.formToken, req.params.code, row);
        const existing = (
          await client.query(
            "SELECT * FROM ac_guest_submissions WHERE submission_key=$1",
            [nonce],
          )
        ).rows[0];
        if (existing) {
          if (existing.code_hash !== hash(req.params.code))
            throw fail(409, "Abre nuevamente el QR.");
          await client.query("COMMIT");
          return res.json(receipt(existing));
        }
        const recent = (
          await client.query(
            `SELECT COUNT(*) FILTER(WHERE created_at>NOW()-INTERVAL '1 hour')::int hour_count,COUNT(*)::int day_count FROM ac_guest_submissions WHERE fleet_unit_id=$1 AND created_at>NOW()-INTERVAL '1 day'`,
            [row.id],
          )
        ).rows[0];
        if (recent.hour_count >= 10 || recent.day_count >= 30)
          throw fail(
            429,
            "Esta unidad ha recibido varios reportes recientemente. Espera antes de enviar otro o comunícate con CARLAB.",
          );
        const id = crypto.randomUUID(),
          actor = "guest-qr",
          normalizedPhone = normalizeMxPhone(phone);
        const payload = {
          incident: true,
          source: "guest_qr",
          description,
          priority: body.priority,
          evidence,
          location,
          contact: `${name} · ${normalizedPhone} · Visitante QR`,
          guestReporter: { name, phone: normalizedPhone },
          incidentHash: hash(
            JSON.stringify({
              nonce,
              description,
              category: body.category,
              equipmentState: body.equipmentState,
              location,
              name,
              phone: normalizedPhone,
              priority: body.priority,
              evidence,
            }),
          ),
        };
        await client.query(
          "INSERT INTO ac_requests(id,client_key,kind,brand,operator_company,unit,payload,created_by,updated_by) VALUES($1,$2,'service',$3,$4,$5,$6,$7,$7)",
          [
            id,
            nonce,
            row.brand,
            row.company,
            row.unit,
            JSON.stringify(payload),
            actor,
          ],
        );
        const meta = (
          await client.query(
            "INSERT INTO ac_incidents(request_id,fleet_unit_id,category,equipment_state,occurred_on) VALUES($1,$2,$3,$4,$5) RETURNING number",
            [id, row.id, body.category, body.equipmentState, today()],
          )
        ).rows[0];
        const folio = "IAC-" + String(meta.number).padStart(6, "0");
        await client.query(
          "UPDATE ac_requests SET payload=jsonb_set(payload,'{incidentFolio}',to_jsonb($2::text)) WHERE id=$1",
          [id, folio],
        );
        await client.query(
          "INSERT INTO ac_request_events(request_id,actor,actor_name,action,details) VALUES($1,$2,$3,'reporte_creado',$4)",
          [
            id,
            actor,
            name + " · Visitante QR",
            JSON.stringify({
              status: "nuevo",
              category: body.category,
              source: "guest_qr",
              notes:
                "Reporte recibido por QR sin cuenta. Datos de contacto declarados por el visitante; pendiente de revisión.",
            }),
          ],
        );
        await notice(client, {
          eventKey: `incident:${id}:1`,
          brand: row.brand,
          kind: "incident",
          title: `${folio} · ${body.priority === "urgente" ? "Nuevo reporte urgente" : "Nuevo reporte"} por QR`,
          body: `${row.company} · Unidad ${row.unit}`,
          targetType: "request",
          targetId: id,
        });
        const saved = (
          await client.query(
            "INSERT INTO ac_guest_submissions(submission_key,code_hash,fleet_unit_id,request_id,folio,company,unit,brand) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
            [
              nonce,
              hash(req.params.code),
              row.id,
              id,
              folio,
              row.company,
              row.unit,
              row.brand,
            ],
          )
        ).rows[0];
        await client.query("COMMIT");
        res.status(201).json(receipt(saved));
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }),
  );
}
module.exports = { register };
