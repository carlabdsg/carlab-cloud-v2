"use strict";
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const fmt = (d) =>
    d
      ? new Date(d + "T12:00:00").toLocaleDateString("es-MX", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";
  let ctx,
    data,
    sequence = 0,
    working = false,
    filters = { period: "month", anchor: today(), brand: "", company: "" };
  const brand = (b) => ctx.info.brands[b] || b;
  const status = (s) =>
    data.statuses[s] ||
    ctx.info.stages[s] ||
    {
      nuevo: "Nuevo",
      revision: "En revisión",
      atencion: "En atención",
      confirmacion: "Por confirmar",
      resuelto: "Resuelto",
      descartado: "Descartado",
    }[s] ||
    s;
  const btn = (text, action, primary = false) =>
    `<button type="button" class="hc-btn ${primary ? "primary" : ""}" data-ar="${action}">${text}</button>`;
  const opts = (rows, value) =>
    rows
      .map(
        ([k, l]) =>
          `<option value="${esc(k)}" ${k === value ? "selected" : ""}>${esc(l)}</option>`,
      )
      .join("");
  async function show(context) {
    ctx = context;
    await load();
  }
  async function load() {
    const seq = ++sequence;
    const query = { ...filters };
    if (ctx.external) query.brand = ctx.info.user.brand || "";
    const [r, options] = await Promise.all([
      ctx.api("/reports?" + new URLSearchParams(query)),
      ctx.api(
        "/reports/options?" + new URLSearchParams({ brand: query.brand }),
      ),
    ]);
    if (seq !== sequence || !ctx.active()) return;
    data = r;
    render(options.companies);
  }
  function sections() {
    const orderRows = (rows) =>
      rows.map((o) => [
        o.folio,
        o.company,
        o.unit,
        brand(o.brand),
        fmt(o.service_date),
        data.serviceTypes[o.type] || o.type,
        status(o.status),
        o.technician || "Sin asignar",
        o.recommendations || o.symptoms || "",
      ]);
    const requestRows = (rows) =>
      rows.map((r) => [
        r.folio,
        r.company,
        r.unit,
        brand(r.brand),
        fmt(r.created_date),
        r.kind === "part" ? "Refacción" : "Servicio",
        status(r.status),
        r.kind === "part"
          ? `${r.quantity || ""} × ${r.part_name || ""}`
          : r.description || "",
      ]);
    return [
      {
        title: "Resumen por empresa y marca",
        head: [
          "Empresa",
          "Marca",
          "Unidades activas",
          "Órdenes del periodo",
          "Completadas",
          "Solicitudes del periodo",
          "Reportes AC del periodo",
          "Reportes AC abiertos",
          "Órdenes pendientes actuales",
          "Solicitudes pendientes actuales",
          "Unidades críticas",
          "Mant. vencidos",
        ],
        rows: data.groups.map((g) => [
          g.company,
          brand(g.brand),
          g.units,
          g.orders,
          g.completed,
          g.requests,
          g.incidents || 0,
          g.pendingIncidents || 0,
          g.pendingOrders,
          g.pendingRequests,
          g.critical,
          g.overdue,
        ]),
      },
      ...[
        ["Reportes AC del periodo", data.incidents || []],
        [
          "Reportes AC abiertos actuales (todos los periodos)",
          data.pendingIncidents || [],
        ],
      ].map(([title, rows]) => ({
        title,
        head: [
          "Folio",
          "Empresa",
          "Unidad",
          "Marca",
          "Registro",
          "Estado actual",
          "Incidencia",
        ],
        rows: rows.map((r) => [
          r.folio,
          r.company,
          r.unit,
          brand(r.brand),
          fmt(r.created_date),
          status(r.status),
          r.description,
        ]),
      })),
      {
        title: "Órdenes del periodo",
        head: [
          "Folio",
          "Empresa",
          "Unidad",
          "Marca",
          "Fecha de servicio",
          "Servicio",
          "Estado actual",
          "Técnico",
          "Recomendaciones / motivo",
        ],
        rows: orderRows(data.orders),
      },
      {
        title: "Solicitudes del periodo",
        head: [
          "Folio",
          "Empresa",
          "Unidad",
          "Marca",
          "Registro",
          "Tipo",
          "Estado actual",
          "Descripción / pieza",
        ],
        rows: requestRows(data.requests),
      },
      {
        title: "Órdenes pendientes actuales (todos los periodos)",
        head: [
          "Folio",
          "Empresa",
          "Unidad",
          "Marca",
          "Fecha de servicio",
          "Servicio",
          "Estado actual",
          "Técnico",
          "Recomendaciones / motivo",
        ],
        rows: orderRows(data.pendingOrders),
      },
      {
        title: "Solicitudes pendientes actuales (todos los periodos)",
        head: [
          "Folio",
          "Empresa",
          "Unidad",
          "Marca",
          "Registro",
          "Tipo",
          "Estado actual",
          "Descripción / pieza",
        ],
        rows: requestRows(data.pendingRequests),
      },
      {
        title: "Estado actual de la flota activa",
        head: [
          "Empresa",
          "Unidad",
          "Marca",
          "Semáforo",
          "Próximo servicio",
          "Observaciones",
        ],
        rows: data.units.map((u) => [
          u.company,
          u.unit,
          brand(u.brand),
          u.signalLabel,
          fmt(u.nextDate),
          u.reasons,
        ]),
      },
      {
        title: "Movimientos de refacciones del periodo",
        head: [
          "Fecha",
          "Movimiento",
          "Pieza",
          "Referencia",
          "Cantidad",
          "Empresa",
          "Unidad",
          "Folio",
          "Motivo",
        ],
        rows: data.movements.map((m) => [
          fmt(m.movement_date),
          {
            entrada: "Entrada",
            devolucion: "Devolución",
            salida_unidad: "Entrega",
          }[m.tipo] || m.tipo,
          m.nombre,
          m.sku,
          m.cantidad,
          m.empresa || "Almacén AC",
          m.unidad || "",
          m.garantia_folio || "",
          m.notas || "",
        ]),
      },
      ...(!ctx.external && !data.company
        ? [
            {
              title: "Refacciones en mínimo o por debajo (actual)",
              head: [
                "Pieza",
                "Referencia",
                "Existencia AC",
                "Mínimo",
                "Marcas",
              ],
              rows: data.lowStock.map((p) => [
                p.nombre,
                p.sku,
                p.stock_actual,
                p.stock_minimo,
                p.brands.map(brand).join(" / "),
              ]),
            },
          ]
        : []),
    ];
  }
  function render(companies) {
    const s = data.summary;
    $("#hc-main").innerHTML =
      `<div class="hc-heading"><div><div class="hc-kicker">CARLAB / CONTROL DE CLIMATIZACIÓN</div><h1>Informes AC</h1><p>Actividad del periodo y seguimiento de pendientes.</p></div><div class="hc-actions">${btn("Descargar PDF", "pdf", true)}${btn("Exportar CSV", "csv")}</div></div>
   <form id="acr-filters" class="hc-filters"><label class="hc-field"><b>Periodo</b><select name="period">${opts(
     [
       ["week", "Semanal · lunes a domingo"],
       ["month", "Mensual"],
     ],
     filters.period,
   )}</select></label><label class="hc-field"><b>Fecha dentro del periodo</b><input type="date" name="anchor" required value="${esc(filters.anchor)}"></label>${ctx.external ? "" : `<label class="hc-field"><b>Marca AC</b><select name="brand">${opts([["", "Ambas marcas"], ...Object.entries(ctx.info.brands)], filters.brand)}</select></label>`}<label class="hc-field"><b>Empresa</b><select name="company">${opts([["", "Todas las empresas"], ...companies.map((c) => [c, c])], filters.company)}</select></label><button type="submit" class="hc-btn primary">Generar informe</button></form>
   <div class="hc-actions acr-period">${btn("← Periodo anterior", "previous")}<strong>${fmt(data.from)} al ${fmt(data.to)}</strong>${btn("Periodo siguiente →", "next")}${btn("Esta semana", "week")}${btn("Este mes", "month")}</div>
   <p class="hc-note">${esc(data.note)}</p><div class="acr-kpis">${[
     ["Reportes AC del periodo", s.incidents || 0],
     ["Reportes AC abiertos", s.pendingIncidents || 0],
     ["Órdenes del periodo", s.orders],
     ["Completadas del periodo", s.completed],
     ["Solicitudes de servicio", s.serviceRequests],
     ["Solicitudes de refacciones", s.partRequests],
     ["Órdenes pendientes actuales", s.pendingOrders],
     ["Solicitudes pendientes actuales", s.pendingRequests],
     ["Unidades con atención crítica", s.critical],
     ["Mantenimientos vencidos", s.overdue],
   ]
     .map(
       ([l, n]) =>
         `<article class="hc-panel"><span>${l}</span><strong>${n}</strong></article>`,
     )
     .join("")}</div>
   <p class="hc-subtle">${esc(data.inventoryScope)} · Generado ${new Date(data.generatedAt).toLocaleString("es-MX")}.</p>
   ${sections()
     .map(
       (sec, i) =>
         `<details class="hc-panel acr-section" ${i === 0 ? "open" : ""}><summary>${esc(sec.title)} <span>${sec.rows.length} registros</span></summary>${
           sec.rows.length
             ? `<p class="acr-scroll-hint">Desliza la tabla horizontalmente para consultar todas las columnas.</p><div class="hc-table-wrap" tabindex="0" role="region" aria-label="Tabla del reporte"><table><thead><tr>${sec.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${sec.rows
                 .slice(0, 100)
                 .map(
                   (row) =>
                     `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`,
                 )
                 .join(
                   "",
                 )}</tbody></table></div>${sec.rows.length > 100 ? "<p>Vista de los primeros 100 registros. El PDF y CSV incluyen todos.</p>" : ""}`
             : '<p class="hc-subtle">Sin registros para esta selección.</p>'
         }</details>`,
     )
     .join("")}`;
  }
  const filename = () =>
    `CARLAB-AC-${data.period === "week" ? "SEMANAL" : "MENSUAL"}-${data.from}-${data.to}`;
  function csv() {
    const cell = (v) => {
      let s = String(v ?? "");
      if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const rows = [
      ["CARLAB · REPORTE DE CLIMATIZACIÓN"],
      ["Periodo", data.from, data.to],
      ["Marca", data.brand ? brand(data.brand) : "Ambas marcas"],
      ["Empresa", data.company || "Todas"],
      ["Generado", data.generatedAt],
      ["Criterio", data.note],
      ["Almacén", data.inventoryScope],
    ];
    for (const s of sections()) rows.push([], [s.title], s.head, ...s.rows);
    const blob = new Blob(
        ["\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8;" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = filename() + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function pdf() {
    const doc = new window.jspdf.jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });
    const w = 297,
      h = 210,
      margin = 13;
    const clean = (v) =>
      String(v ?? "")
        .replace(/[→←]/g, "-")
        .replace(/[—–]/g, "-")
        .replace(/\u0000/g, "");
    function header() {
      doc.setFillColor(15, 47, 61);
      doc.rect(0, 0, w, 29, "F");
      doc.setTextColor(255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text("CARLAB", margin, 12);
      doc.setFontSize(10);
      doc.text("REPORTE DE CLIMATIZACIÓN", margin, 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(
        `${data.period === "week" ? "SEMANAL" : "MENSUAL"} | ${fmt(data.from)} al ${fmt(data.to)}`,
        w - margin,
        12,
        { align: "right" },
      );
      doc.setFontSize(8);
      doc.text(
        data.brand ? brand(data.brand) : "Hispacold / Eberspächer",
        w - margin,
        20,
        { align: "right" },
      );
    }
    header();
    let y = 37;
    function paragraph(text, size = 8) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      doc.setTextColor(55, 72, 80);
      const lines = doc.splitTextToSize(clean(text), w - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * (size * 0.42) + 4;
    }
    paragraph("Empresa: " + (data.company || "Todas las empresas"), 10);
    paragraph(data.note);
    paragraph(data.inventoryScope);
    paragraph(
      `Órdenes del periodo: ${data.summary.orders} | Completadas: ${data.summary.completed} | Solicitudes: ${data.summary.serviceRequests + data.summary.partRequests} | Órdenes pendientes actuales: ${data.summary.pendingOrders} | Unidades activas: ${data.summary.units}`,
      9,
    );
    for (const sec of sections()) {
      if (y > h - 45) {
        doc.addPage();
        header();
        y = 37;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 90, 96);
      doc.text(sec.title, margin, y);
      y += 5;
      if (!sec.rows.length) {
        paragraph("Sin registros para esta selección.");
        continue;
      }
      doc.autoTable({
        startY: y,
        margin: { top: 37, left: margin, right: margin, bottom: 18 },
        head: [sec.head.map(clean)],
        body: sec.rows.map((r) => r.map(clean)),
        theme: "striped",
        styles: {
          font: "helvetica",
          fontSize: 7,
          cellPadding: 2,
          overflow: "linebreak",
        },
        headStyles: { fillColor: [15, 90, 96], fontSize: 7 },
        rowPageBreak: "avoid",
        willDrawPage: () => header(),
      });
      y = doc.lastAutoTable.finalY + 11;
    }
    const count = doc.getNumberOfPages();
    for (let i = 1; i <= count; i++) {
      doc.setPage(i);
      header();
      doc.setDrawColor(210);
      doc.line(margin, h - 13, w - margin, h - 13);
      doc.setTextColor(85);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(
        "CARLAB · Control operativo de aire acondicionado | Generado " +
          new Date(data.generatedAt).toLocaleString("es-MX"),
        margin,
        h - 8,
      );
      doc.text(`${i} / ${count}`, w - margin, h - 8, { align: "right" });
    }
    doc.save(filename() + ".pdf");
  }
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "acr-filters") return;
    e.preventDefault();
    if (working) return;
    filters = { ...filters, ...Object.fromEntries(new FormData(e.target)) };
    working = true;
    try {
      await load();
    } catch (err) {
      ctx.toast(err.message);
    } finally {
      working = false;
    }
  });
  let optionSequence = 0;
  document.addEventListener("change", async (e) => {
    if (!e.target.matches("#acr-filters [name=brand]")) return;
    const form = e.target.form,
      select = form.elements.company,
      submit = form.querySelector("[type=submit]"),
      seq = ++optionSequence;
    select.disabled = true;
    submit.disabled = true;
    select.innerHTML = opts([["", "Todas las empresas"]], "");
    try {
      const r = await ctx.api(
        "/reports/options?brand=" + encodeURIComponent(e.target.value),
      );
      if (seq === optionSequence && form.isConnected)
        select.innerHTML = opts(
          [["", "Todas las empresas"], ...r.companies.map((c) => [c, c])],
          "",
        );
    } catch (err) {
      ctx.toast(err.message);
    } finally {
      if (seq === optionSequence) {
        select.disabled = false;
        submit.disabled = false;
      }
    }
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ar]");
    if (!b || working) return;
    working = true;
    b.disabled = true;
    try {
      const a = b.dataset.ar;
      if (a === "pdf") pdf();
      else if (a === "csv") csv();
      else {
        if (a === "week" || a === "month") {
          filters.period = a;
          filters.anchor = today();
        } else {
          const d = new Date(data.from + "T12:00:00Z"),
            sign = a === "previous" ? -1 : 1;
          if (filters.period === "week")
            d.setUTCDate(d.getUTCDate() + sign * 7);
          else d.setUTCMonth(d.getUTCMonth() + sign);
          filters.anchor = d.toISOString().slice(0, 10);
        }
        await load();
      }
    } catch (err) {
      ctx.toast(err.message);
    } finally {
      working = false;
      b.disabled = false;
    }
  });
  window.ACReports = { show };
})();
