"use strict";
const crypto = require("node:crypto");
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const fail = (status, message) => Object.assign(new Error(message), { status });
function register(
  app,
  {
    pool,
    authRequired,
    normalizedIdentitySql: norm,
    normalizeIdentityValue: identity,
  },
) {
  let initialization;
  const ready = () =>
    (initialization ||= pool
      .query(
        `
    CREATE TABLE IF NOT EXISTS report_quotations (
      id TEXT PRIMARY KEY,
      report_id TEXT REFERENCES garantias(id) ON DELETE SET NULL,
      original_report_id TEXT NOT NULL,
      report_folio TEXT NOT NULL,
      report_description TEXT NOT NULL DEFAULT '',
      empresa TEXT NOT NULL,
      numero_economico TEXT NOT NULL,
      company_key TEXT NOT NULL,
      unit_key TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK(revision > 0),
      status TEXT NOT NULL DEFAULT 'cotizada' CHECK(status IN ('cotizada','aceptada','rechazada')),
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL CHECK(file_size > 0 AND file_size <= ${MAX_PDF_BYTES}),
      pdf_data BYTEA NOT NULL,
      uploaded_by TEXT,
      uploaded_by_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_by TEXT,
      responded_by_name TEXT,
      response_note TEXT NOT NULL DEFAULT '',
      responded_at TIMESTAMPTZ,
      UNIQUE(original_report_id, revision)
    );
    CREATE INDEX IF NOT EXISTS idx_report_quotations_unit ON report_quotations(company_key,unit_key);
  `,
      )
      .catch((error) => {
        initialization = null;
        throw error;
      }));
  const fields = `id,report_id,original_report_id,report_folio,report_description,empresa,numero_economico,company_key,unit_key,revision,status,file_name,file_size,uploaded_by_name,created_at,responded_by_name,response_note,responded_at`;
  const map = (r) => ({
    id: r.id,
    reportId: r.report_id,
    originalReportId: r.original_report_id,
    reportFolio: r.report_folio,
    revision: r.revision,
    status: r.status,
    fileName: r.file_name,
    fileSize: r.file_size,
    uploadedBy: r.uploaded_by_name,
    createdAt: r.created_at,
    respondedBy: r.responded_by_name || "",
    responseNote: r.response_note,
    respondedAt: r.responded_at,
    empresa: r.empresa,
    numeroEconomico: r.numero_economico,
    isCurrent: r.is_current !== false,
  });
  async function actor(req) {
    const r = await pool.query(
      "SELECT id,nombre,role,empresa FROM users WHERE id=$1 AND activo=true AND deleted_at IS NULL",
      [req.user.id],
    );
    const user = r.rows[0];
    if (!user || !["admin", "operador"].includes(user.role))
      throw fail(403, "No tienes acceso a las cotizaciones de reportes.");
    if (user.role === "operador" && !identity(user.empresa))
      throw fail(
        403,
        "Tu cuenta necesita una empresa asignada para consultar cotizaciones.",
      );
    return user;
  }
  function scope(user, company) {
    if (user.role !== "admin" && identity(user.empresa) !== identity(company))
      throw fail(
        404,
        "La cotización o unidad no está disponible para tu cuenta.",
      );
  }
  const route = (fn) => async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const user = await actor(req);
      await ready();
      await fn(req, res, user);
    } catch (error) {
      if (!error.status) console.error("[report-quotations]", error.message);
      if (!res.headersSent)
        res.status(error.status || 500).json({
          error: error.status
            ? error.message
            : "No se pudo completar la operación de cotizaciones. Intenta nuevamente.",
        });
    }
  };
  const tx = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const value = await fn(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  const latest = `SELECT DISTINCT ON(original_report_id) ${fields} FROM report_quotations ORDER BY original_report_id, revision DESC`;
  app.get(
    "/api/report-quotes",
    authRequired,
    route(async (req, res, user) => {
      const companyKey = user.role === "admin" ? "" : identity(user.empresa);
      const result = await pool.query(
        `WITH sources AS (
      SELECT empresa,numero_economico,COALESCE(modelo,'') modelo,COALESCE(marca,'') marca,COALESCE(nombre_flota,'') nombre_flota,${norm("empresa")} company_key,${norm("numero_economico")} unit_key,0 priority FROM fleet_units
      UNION ALL
      SELECT empresa,numero_economico,COALESCE(modelo,''),'','',${norm("empresa")},${norm("numero_economico")},1 FROM garantias
      UNION ALL
      SELECT empresa,numero_economico,'','','',company_key,unit_key,2 FROM report_quotations
    ), units AS (
      SELECT DISTINCT ON(company_key,unit_key) * FROM sources WHERE company_key<>'' AND unit_key<>'' AND ($1='' OR company_key=$1) ORDER BY company_key,unit_key,priority,empresa,numero_economico
    ), current_quotes AS (${latest}), stats AS (
      SELECT company_key,unit_key,COUNT(*)::int quote_count,
        COUNT(*) FILTER(WHERE status='cotizada')::int pending,
        COUNT(*) FILTER(WHERE status='aceptada')::int accepted,
        COUNT(*) FILTER(WHERE status='rechazada')::int rejected,
        MAX(COALESCE(responded_at,created_at)) updated_at
      FROM current_quotes GROUP BY company_key,unit_key
    ), reports AS (
      SELECT ${norm("empresa")} company_key,${norm("numero_economico")} unit_key,COUNT(*)::int report_count FROM garantias GROUP BY 1,2
    ) SELECT u.*,COALESCE(s.quote_count,0) quote_count,COALESCE(s.pending,0) pending,COALESCE(s.accepted,0) accepted,COALESCE(s.rejected,0) rejected,s.updated_at,COALESCE(r.report_count,0) report_count
      FROM units u LEFT JOIN stats s USING(company_key,unit_key) LEFT JOIN reports r USING(company_key,unit_key) ORDER BY u.empresa,u.numero_economico`,
        [companyKey],
      );
      res.json({
        role: user.role,
        company: user.empresa || "",
        units: result.rows.map((r) => ({
          key: r.company_key + ":" + r.unit_key,
          empresa: r.empresa,
          numeroEconomico: r.numero_economico,
          modelo: r.modelo,
          marca: r.marca,
          nombreFlota: r.nombre_flota,
          reportCount: r.report_count,
          quoteCount: r.quote_count,
          pending: r.pending,
          accepted: r.accepted,
          rejected: r.rejected,
          updatedAt: r.updated_at,
          status: r.pending
            ? "cotizada"
            : r.rejected
              ? "rechazada"
              : r.accepted
                ? "aceptada"
                : "sin_cotizacion",
        })),
      });
    }),
  );
  app.get(
    "/api/report-quotes/unit",
    authRequired,
    route(async (req, res, user) => {
      const company = String(req.query.company || ""),
        unit = String(req.query.unit || "");
      if (!identity(company) || !identity(unit))
        throw fail(400, "Selecciona una empresa y una unidad.");
      scope(user, company);
      const params = [identity(company), identity(unit)];
      const [reports, quotes] = await Promise.all([
        pool.query(
          `SELECT id,folio,empresa,numero_economico,descripcion_fallo,created_at,COALESCE((SELECT MAX(revision) FROM report_quotations q WHERE q.original_report_id=garantias.id),0) latest_revision FROM garantias WHERE ${norm("empresa")}=$1 AND ${norm("numero_economico")}=$2 ORDER BY created_at DESC,id`,
          params,
        ),
        pool.query(
          `SELECT ${fields},NOT EXISTS(SELECT 1 FROM report_quotations newer WHERE newer.original_report_id=q.original_report_id AND newer.revision>q.revision) is_current FROM report_quotations q WHERE company_key=$1 AND unit_key=$2 ORDER BY created_at DESC,revision DESC`,
          params,
        ),
      ]);
      const byReport = new Map(
        reports.rows.map((r) => [
          r.id,
          {
            id: r.id,
            folio: r.folio,
            description: r.descripcion_fallo,
            createdAt: r.created_at,
            canUpload: user.role === "admin",
            latestRevision: r.latest_revision,
            versions: [],
          },
        ]),
      );
      for (const row of quotes.rows) {
        if (!byReport.has(row.original_report_id))
          byReport.set(row.original_report_id, {
            id: row.original_report_id,
            folio: row.report_folio,
            description: row.report_description,
            createdAt: row.created_at,
            canUpload: false,
            archived: true,
            versions: [],
          });
        byReport.get(row.original_report_id).versions.push(map(row));
      }
      res.json({
        role: user.role,
        company,
        unit,
        reports: [...byReport.values()].map((r) => ({
          ...r,
          current: r.versions.find((q) => q.isCurrent) || null,
        })),
      });
    }),
  );
  app.post(
    "/api/report-quotes",
    authRequired,
    route(async (req, res, user) => {
      if (user.role !== "admin")
        throw fail(403, "Solo el administrador puede subir cotizaciones.");
      const b = req.body || {};
      if (
        typeof b.reportId !== "string" ||
        !b.reportId ||
        !Number.isInteger(b.expectedRevision) ||
        b.expectedRevision < 0
      )
        throw fail(400, "Selecciona el reporte y vuelve a cargar su ficha.");
      if (
        typeof b.pdfBase64 !== "string" ||
        !b.pdfBase64.length ||
        b.pdfBase64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(b.pdfBase64)
      )
        throw fail(400, "Selecciona un archivo PDF de hasta 10 MB.");
      const bytes = Buffer.from(b.pdfBase64, "base64");
      if (
        bytes.length > MAX_PDF_BYTES ||
        bytes.subarray(0, 5).toString() !== "%PDF-" ||
        !bytes.subarray(-2048).includes(Buffer.from("%%EOF"))
      )
        throw fail(
          400,
          "El archivo no parece ser un PDF válido. Selecciona la cotización en PDF.",
        );
      const filename = String(b.fileName || "Cotizacion.pdf")
        .split(/[\\/]/)
        .pop()
        .replace(/[\x00-\x1f\x7f]/g, "")
        .slice(0, 180);
      if (!/\.pdf$/i.test(filename))
        throw fail(400, "El archivo debe tener extensión .pdf.");
      const created = await tx(async (client) => {
        const found = await client.query(
          "SELECT id,folio,empresa,numero_economico,descripcion_fallo FROM garantias WHERE id=$1 FOR UPDATE",
          [b.reportId],
        );
        const report = found.rows[0];
        if (!report) throw fail(404, "El reporte ya no está disponible.");
        if (
          identity(report.empresa) !== identity(b.company) ||
          identity(report.numero_economico) !== identity(b.unit)
        )
          throw fail(400, "El reporte no pertenece a la unidad seleccionada.");
        const previous = await client.query(
          "SELECT revision FROM report_quotations WHERE original_report_id=$1 ORDER BY revision DESC LIMIT 1",
          [report.id],
        );
        const revision = previous.rows[0]?.revision || 0;
        if (revision !== b.expectedRevision)
          throw fail(
            409,
            "La cotización cambió. Actualiza la ficha antes de subir otra versión.",
          );
        const id = crypto.randomUUID();
        const result = await client.query(
          `INSERT INTO report_quotations(id,report_id,original_report_id,report_folio,report_description,empresa,numero_economico,company_key,unit_key,revision,file_name,file_size,pdf_data,uploaded_by,uploaded_by_name)
        VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING ${fields}`,
          [
            id,
            report.id,
            report.folio,
            String(report.descripcion_fallo || "").slice(0, 2000),
            report.empresa,
            report.numero_economico,
            identity(report.empresa),
            identity(report.numero_economico),
            revision + 1,
            filename,
            bytes.length,
            bytes,
            user.id,
            user.nombre,
          ],
        );
        await client.query(
          "INSERT INTO audit_logs(garantia_id,user_id,accion,detalle) VALUES($1,$2,$3,$4)",
          [
            report.id,
            user.id,
            "cotizacion_pdf_subida",
            `Cotización versión ${revision + 1}: ${filename}`,
          ],
        );
        return result.rows[0];
      });
      res.status(201).json(map(created));
    }),
  );
  app.get(
    "/api/report-quotes/:id/pdf",
    authRequired,
    route(async (req, res, user) => {
      const found = await pool.query(
        "SELECT empresa,file_name,pdf_data FROM report_quotations WHERE id=$1",
        [req.params.id],
      );
      const row = found.rows[0];
      if (!row) throw fail(404, "La cotización no está disponible.");
      scope(user, row.empresa);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Cotizacion.pdf"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
        "X-Content-Type-Options": "nosniff",
      });
      res.send(Buffer.from(row.pdf_data));
    }),
  );
  app.post(
    "/api/report-quotes/:id/decision",
    authRequired,
    route(async (req, res, user) => {
      if (user.role !== "operador")
        throw fail(403, "La respuesta corresponde al operador de la empresa.");
      const decision = req.body?.decision,
        note = String(req.body?.note || "").trim();
      if (!["aceptada", "rechazada"].includes(decision) || note.length > 1500)
        throw fail(
          400,
          "Elige aceptada o rechazada. El comentario puede tener hasta 1,500 caracteres.",
        );
      const saved = await tx(async (client) => {
        const initial = await client.query(
          `SELECT ${fields} FROM report_quotations WHERE id=$1`,
          [req.params.id],
        );
        const quote = initial.rows[0];
        if (!quote) throw fail(404, "La cotización no está disponible.");
        scope(user, quote.empresa);
        // Both uploads and responses lock the report first, preventing acceptance of a replaced version.
        const report = await client.query(
          "SELECT id,empresa,numero_economico FROM garantias WHERE id=$1 FOR UPDATE",
          [quote.report_id],
        );
        if (!report.rows.length)
          throw fail(
            409,
            "El reporte fue retirado. Consulta al administrador antes de responder.",
          );
        if (
          identity(report.rows[0].empresa) !== quote.company_key ||
          identity(report.rows[0].numero_economico) !== quote.unit_key
        )
          throw fail(
            409,
            "El reporte cambió de empresa o unidad. Consulta al administrador antes de responder.",
          );
        const current = (
          await client.query(
            `SELECT ${fields} FROM report_quotations WHERE original_report_id=$1 ORDER BY revision DESC LIMIT 1 FOR UPDATE`,
            [quote.original_report_id],
          )
        ).rows[0];
        if (current.id !== quote.id)
          throw fail(
            409,
            "Hay una versión más reciente. Actualiza la ficha y revisa el nuevo PDF.",
          );
        if (current.status !== "cotizada") {
          if (current.status === decision) return current;
          throw fail(
            409,
            "Esta cotización ya tiene una respuesta registrada. Actualiza la ficha.",
          );
        }
        const result = await client.query(
          `UPDATE report_quotations SET status=$2,responded_by=$3,responded_by_name=$4,response_note=$5,responded_at=NOW() WHERE id=$1 RETURNING ${fields}`,
          [quote.id, decision, user.id, user.nombre, note],
        );
        await client.query(
          "INSERT INTO audit_logs(garantia_id,user_id,accion,detalle) VALUES($1,$2,$3,$4)",
          [
            quote.report_id,
            user.id,
            "cotizacion_" + decision,
            `Cotización versión ${quote.revision} ${decision} por ${user.nombre}${note ? ": " + note : ""}`,
          ],
        );
        return result.rows[0];
      });
      res.json(map(saved));
    }),
  );
}
module.exports = { register, MAX_PDF_BYTES };
