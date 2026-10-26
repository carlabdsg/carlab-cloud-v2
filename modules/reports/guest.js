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

function register(
  app,
  { pool, ensureQrRegistry, secret, nextGarantiaFolio, normalizeMxPhone },
) {
  let initialization;
  const ready = () =>
    (initialization ||= ensureQrRegistry()
      .then(() =>
        pool.query(`
    CREATE TABLE IF NOT EXISTS report_guest_submissions (
      submission_key TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      fleet_unit_id TEXT NOT NULL,
      garantia_id TEXT REFERENCES garantias(id) ON DELETE SET NULL,
      folio TEXT NOT NULL,
      empresa TEXT NOT NULL,
      numero_economico TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_report_guest_unit_time ON report_guest_submissions(fleet_unit_id,created_at);
  `),
      )
      .catch((error) => {
        initialization = null;
        throw error;
      }));
  const unit = (row) => ({
    empresa: row.empresa,
    numeroEconomico: row.numero_economico,
    modelo: row.modelo || "Pendiente",
    marca: row.marca || "",
  });
  const hash = (code) => crypto.createHash("sha256").update(code).digest("hex");
  const signature = (code, nonce, expires, row) =>
    crypto
      .createHmac("sha256", secret)
      .update(
        JSON.stringify([
          "carlab-public-report-v1",
          code,
          nonce,
          expires,
          row.id,
          row.empresa,
          row.numero_economico,
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
      throw fail(400, "Abre el código QR para iniciar el reporte.");
    const [nonce, expires, signed] = value.split(".");
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signed, "hex"),
        Buffer.from(signature(code, nonce, expires, row), "hex"),
      )
    )
      throw fail(
        409,
        "La ficha cambió o no corresponde a este QR. Abre nuevamente la etiqueta.",
      );
    if (Number(expires) < Date.now())
      throw fail(
        410,
        "Este formulario venció. Abre el QR nuevamente para enviar el reporte.",
      );
    return nonce;
  }
  const readUnit = (client, code, lock = false) =>
    client.query(
      `SELECT u.id,u.empresa,u.numero_economico,u.numero_obra,u.modelo,u.marca FROM report_unit_qr q JOIN fleet_units u ON u.id=q.fleet_unit_id WHERE q.token=$1${lock ? " FOR UPDATE OF u" : ""}`,
      [code],
    );
  const receipt = (row) => ({
    folio: row.folio,
    receivedAt: row.created_at,
    status: "recibido",
    unit: { empresa: row.empresa, numeroEconomico: row.numero_economico },
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
          "El QR no está disponible. Verifica la etiqueta de la unidad.",
        );
      await ready();
      await fn(req, res);
    } catch (error) {
      if (!error.status) console.error("[guest-report]", error.message);
      if (error.status === 429) res.set("Retry-After", "3600");
      if (!res.headersSent)
        res.status(error.status || 500).json({
          error: error.status
            ? error.message
            : "No se pudo enviar el reporte. Conserva esta página e intenta nuevamente.",
        });
    }
  };
  app.get(
    "/api/public/report-qr/:code",
    route(async (req, res) => {
      const row = (await readUnit(pool, req.params.code)).rows[0];
      if (!row)
        throw fail(
          404,
          "Esta etiqueta ya no está vinculada a una unidad disponible.",
        );
      res.json({
        unit: unit(row),
        formToken: issue(req.params.code, row),
        maxPhotos: 4,
      });
    }),
  );
  app.post(
    "/api/public/report-qr/:code",
    route(async (req, res) => {
      if (!req.is("application/json"))
        throw fail(415, "Envía el reporte desde el formulario del QR.");
      const body = req.body || {};
      const text = (key, min, max) => {
        if (typeof body[key] !== "string")
          throw fail(
            400,
            "Completa tu nombre, teléfono y descripción de la falla.",
          );
        const v = body[key].trim();
        if (v.length < min || v.length > max)
          throw fail(
            400,
            "Revisa los campos obligatorios y la longitud de los textos.",
          );
        return v;
      };
      if (body.website || body.confirm !== true)
        throw fail(400, "Confirma los datos antes de enviar el reporte.");
      const name = text("name", 3, 120),
        phone = text("phone", 10, 32),
        description = text("description", 10, 4000);
      if (
        phone.replace(/\D/g, "").length < 10 ||
        phone.replace(/\D/g, "").length > 15
      )
        throw fail(
          400,
          "Escribe un teléfono de contacto válido, con al menos 10 dígitos.",
        );
      if (!["falla", "daño", "sin daño"].includes(body.incident))
        throw fail(400, "Selecciona el tipo de incidencia.");
      const mileage = body.mileage == null ? "" : text("mileage", 0, 9);
      if (mileage && !/^\d{1,9}$/.test(mileage))
        throw fail(400, "El kilometraje debe contener únicamente números.");
      const photos = body.photos || [];
      if (!Array.isArray(photos) || photos.length > 4)
        throw fail(400, "Puedes adjuntar hasta 4 fotografías.");
      const evidence = photos.map(photo);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const row = (await readUnit(client, req.params.code, true)).rows[0];
        if (!row)
          throw fail(404, "La unidad de esta etiqueta ya no está disponible.");
        const nonce = verify(body.formToken, req.params.code, row);
        const existing = (
          await client.query(
            "SELECT * FROM report_guest_submissions WHERE submission_key=$1",
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
            `SELECT COUNT(*) FILTER (WHERE created_at>NOW()-INTERVAL '1 hour')::int hour_count,COUNT(*)::int day_count FROM report_guest_submissions WHERE fleet_unit_id=$1 AND created_at>NOW()-INTERVAL '1 day'`,
            [row.id],
          )
        ).rows[0];
        if (recent.hour_count >= 10 || recent.day_count >= 30)
          throw fail(
            429,
            "Esta unidad ha recibido varios reportes recientemente. Espera antes de enviar otro o comunícate con CARLAB.",
          );
        const id = crypto.randomUUID(),
          folio = await nextGarantiaFolio(client);
        await client.query(
          `INSERT INTO garantias(id,folio,numero_obra,modelo,numero_economico,empresa,kilometraje,contacto_nombre,telefono,tipo_incidente,descripcion_fallo,estatus_validacion,estatus_operativo,evidencias,evidencias_refaccion,firma,reportado_por_id,reportado_por_nombre,reportado_por_email,fleet_unit_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'nueva','sin iniciar',$12::jsonb,'[]'::jsonb,'',NULL,$13,'',$14)`,
          [
            id,
            folio,
            String(row.numero_obra || "").trim() || "Pendiente",
            String(row.modelo || "").trim() || "Pendiente",
            row.numero_economico,
            row.empresa,
            mileage,
            name,
            normalizeMxPhone(phone),
            body.incident,
            description,
            JSON.stringify(evidence),
            name + " · Visitante QR",
            row.id,
          ],
        );
        const saved = (
          await client.query(
            `INSERT INTO report_guest_submissions(submission_key,code_hash,fleet_unit_id,garantia_id,folio,empresa,numero_economico) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [
              nonce,
              hash(req.params.code),
              row.id,
              id,
              folio,
              row.empresa,
              row.numero_economico,
            ],
          )
        ).rows[0];
        await client.query(
          "INSERT INTO audit_logs(garantia_id,user_id,accion,detalle) VALUES($1,NULL,'crear_reporte_qr',$2)",
          [
            id,
            `Reporte recibido por QR sin cuenta. Nombre declarado: ${name}. Pendiente de revisión.`,
          ],
        );
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
