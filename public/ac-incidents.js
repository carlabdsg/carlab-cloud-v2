"use strict";
(() => {
  const $ = (s) => document.querySelector(s),
    esc = (v) =>
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
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mazatlan",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const date = (d) =>
    d
      ? new Date(
          String(d).length === 10 ? d + "T12:00:00" : d,
        ).toLocaleDateString("es-MX", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";
  const btn = (label, action, attrs = "", primary = false) =>
    `<button type="button" class="hc-btn ${primary ? "primary" : ""}" data-ai="${action}" ${attrs}>${label}</button>`;
  const opts = (items, selected = "") =>
    Object.entries(items)
      .map(
        ([k, v]) =>
          `<option value="${esc(k)}" ${k === selected ? "selected" : ""}>${esc(v)}</option>`,
      )
      .join("");
  const field = (label, name, value = "", type = "text", extra = "") =>
    `<label class="hc-field"><b>${label}</b>${type === "textarea" ? `<textarea name="${name}" maxlength="4000" ${extra}>${esc(value)}</textarea>` : `<input name="${name}" type="${type}" value="${esc(value)}" ${extra}>`}</label>`;
  const select = (label, name, items, value = "", extra = "") =>
    `<label class="hc-field"><b>${label}</b><select name="${name}" ${extra}>${opts(items, value)}</select></label>`;
  const priorities = { normal: "Normal", alta: "Alta", urgente: "Urgente" };
  const actionNames = {
    reporte_creado: "Registro de incidencia",
    vinculacion_qr: "Vinculación de reporte QR",
    comment: "Información complementaria",
    review: "Revisión iniciada",
    request_info: "Información solicitada por Carlab",
    attend: "Atención iniciada",
    assign: "Responsable asignado",
    resolve: "Conclusión registrada",
    confirm: "Resolución confirmada",
    persists: "Falla persistente",
    reopen: "Reporte reabierto",
    discard: "Reporte descartado",
    schedule: "Atención programada",
    link: "Orden vinculada",
    unlink: "Orden desvinculada",
    orden_creada: "Orden creada",
    eliminacion: "Reporte archivado",
    restauracion: "Reporte recuperado",
  };
  let ctx,
    config,
    current,
    units = [],
    selectedUnit,
    images = [],
    sending = false,
    photoBusy = false,
    key = "",
    filters = { status: "abiertos", q: "", brand: "", deleted: "" },
    offset = 0,
    sequence = 0,
    unitSequence = 0,
    unitTimer;
  const admin = () => ctx.info.permissions.manageOrders;
  const api = (url, body, method = "POST") =>
    ctx.api(url, { method, body: JSON.stringify(body) });
  const version = () => ({
    version: current.version,
    orderVersion: current.order?.version ?? null,
  });
  async function configure(context) {
    ctx = context;
    config = await ctx.api("/incidents/options");
  }
  function dialog(html) {
    let el = $("#aci-dialog");
    if (!el) {
      el = document.createElement("dialog");
      el.id = "aci-dialog";
      el.setAttribute("aria-label", "Reporte de incidencia AC");
      document.body.append(el);
      el.addEventListener("cancel", (e) => {
        if (sending || photoBusy) e.preventDefault();
      });
    }
    el.innerHTML = `<div class="aci-dialog-top"><span>CARLAB · REPORTES AC</span>${btn("×", "close", 'aria-label="Cerrar reporte"')}</div>${html}<p id="aci-error" class="hc-error" role="alert"></p>`;
    if (!el.open) el.showModal();
    el.scrollTop = 0;
  }
  function error(e) {
    const el = $("#aci-error");
    if (el && $("#aci-dialog")?.open) {
      el.textContent = e.message;
      el.scrollIntoView({ block: "nearest" });
    } else ctx.toast(e.message);
  }
  function close() {
    if (sending || photoBusy) return;
    $("#aci-dialog")?.close();
  }
  async function show(context, id) {
    await configure(context);
    await load();
    if (typeof id === "string") await detail(id);
  }
  async function load() {
    const seq = ++sequence,
      [r, intakes] = await Promise.all([
        ctx.api("/incidents?" + new URLSearchParams({ ...filters, offset })),
        admin() ? ctx.api("/qr-intakes") : Promise.resolve(null),
      ]);
    if (seq !== sequence || !ctx.active()) return;
    $("#hc-main").innerHTML =
      `<div class="acp-page-heading"><div><span class="acp-eyebrow">SEGUIMIENTO DE CLIMATIZACIÓN</span><h1>Reportes AC</h1><p>Una falla registrada. Una atención con seguimiento.</p></div><div class="hc-actions">${admin() ? btn("Pendientes de vincular (" + intakes.total + ")", "intakes") : ""}${btn("+ Reportar falla", "new", "", true)}${btn("Actualizar", "refresh")}</div></div>
  <section class="acp-kpis aci-kpis" aria-label="Resumen de reportes">${[
    ["nuevos", "Nuevos", "nuevo", "teal"],
    ["urgentes", "Urgentes", "urgentes", "red"],
    ["atencion", "En seguimiento", "seguimiento", "amber"],
    ["confirmacion", "Por confirmar", "confirmacion", "green"],
  ]
    .map(
      ([k, l, s, c]) =>
        `<button type="button" class="acp-kpi ${c} ${filters.status === s ? "aci-selected" : ""}" data-ai="filter" data-status="${s}" aria-pressed="${filters.status === s}"><span>${l}</span><strong>${r.summary[k]}</strong><small>${s === "confirmacion" ? "Verificar resultado con la flota" : "Abrir reportes →"}</small></button>`,
    )
    .join("")}</section>
  <form id="aci-filters" class="aci-filters">${field("Buscar unidad, empresa o folio", "q", filters.q, "search", 'maxlength="180"')}${select("Estado", "status", { abiertos: "Todos los abiertos", "": "Todos los estados", ...config.stages, urgentes: "Urgentes", seguimiento: "En seguimiento" }, filters.status)}${!ctx.info.user.brand ? select("Marca", "brand", { "": "Todas las marcas", ...ctx.info.brands }, filters.brand) : ""}${admin() ? select("Mostrar", "deleted", { "": "Activos", true: "Archivados" }, filters.deleted) : ""}<button type="submit" class="hc-btn">Buscar</button></form>
  <div class="aci-list-head"><p>${r.total} reporte${r.total === 1 ? "" : "s"} · ${filters.deleted ? "Archivo de reportes" : r.summary.abiertos + " abiertos"}</p>${btn("Ver informes por periodo", "informs")}</div>
  <section class="aci-grid">${r.items.map(card).join("") || '<div class="hc-empty">No hay reportes para estos filtros.<p>Usa “Reportar falla” o abre una unidad de tu flota.</p></div>'}</section><div class="aci-pagination">${btn("Anterior", "prev", offset ? "" : "disabled")}<span>${r.total ? offset + 1 : 0}–${Math.min(offset + 25, r.total)} de ${r.total}</span>${btn("Siguiente", "next", offset + 25 < r.total ? "" : "disabled")}</div>`;
  }
  function card(x) {
    return `<article class="aci-card ${x.data.priority === "urgente" && !["resuelto", "descartado"].includes(x.status) ? "urgent" : ""}"><div class="aci-card-top"><b>${esc(x.folio)}</b><span class="aci-status ${x.status}">${esc(config.stages[x.status])}</span></div><h2>Unidad ${esc(x.unit)}</h2><p class="aci-company">${esc(x.company)} · ${esc(ctx.info.brands[x.brand])}</p><h3>${esc(config.categories[x.category])}</h3><p class="aci-description">${esc(x.data.description)}</p><div class="hc-chips"><span>${esc(priorities[x.data.priority])}</span>${x.recurrences ? `<span>Reincidencia · ${x.recurrences} reporte(s) adicional(es) / 90 días</span>` : ""}${x.data.source === "guest_qr" ? "<span>Visitante QR</span>" : ""}${x.photoCount ? `<span>${x.photoCount} foto(s)</span>` : ""}</div><div class="aci-card-bottom"><small>${date(x.occurredOn)}<br>${esc(x.assignee)}${x.data.scheduledDate ? "<br>Atención: " + date(x.data.scheduledDate) : ""}</small>${btn("Ver reporte", "detail", `data-id="${esc(x.id)}"`)}</div></article>`;
  }
  async function create(context, seed) {
    await configure(context);
    selectedUnit = null;
    images = [];
    current = null;
    key = crypto.randomUUID();
    if (seed?.id) {
      const r = await ctx.api(
        "/incidents/units?id=" + encodeURIComponent(seed.id),
      );
      selectedUnit = r[0];
      if (!selectedUnit)
        throw new Error("La unidad ya no está disponible en tu acceso.");
    }
    dialog(`<div class="aci-title"><span class="acp-eyebrow">REGISTRO RÁPIDO</span><h2>Reportar una falla</h2><p>Indica lo que observaste. El diagnóstico lo registra Carlab durante la atención.</p></div><ol class="aci-steps"><li id="aci-step-one" class="active">1 · Unidad</li><li id="aci-step-two">2 · Incidencia</li></ol><form id="aci-create">
  <section id="aci-unit-step"><label class="hc-field"><b>Busca la unidad o empresa</b><input id="aci-unit-search" type="search" autocomplete="off" placeholder="Ej. 325 o nombre de empresa" maxlength="180"></label><p class="hc-subtle">Se muestran hasta 50 unidades. Escribe para encontrar la tuya.</p><div id="aci-unit-results" class="aci-unit-results" aria-live="polite"></div></section>
  <section id="aci-issue-step" hidden><div id="aci-selected-unit" class="aci-unit-banner"></div><fieldset class="aci-category"><legend>¿Qué falla observaste?</legend><div>${Object.entries(
    config.categories,
  )
    .map(
      ([k, v], i) =>
        `<label><input type="radio" name="category" value="${k}" required><span><i>${["❄", "◔", "≋", "◉", "≈", "!", "+"][i]}</i>${esc(v)}</span></label>`,
    )
    .join("")}</div></fieldset>
  ${field("Descripción de la incidencia *", "description", "", "textarea", 'required placeholder="Ej. El equipo no enfría después de 20 minutos de operación."')}
  <div class="hc-grid">${select("Condición reportada *", "equipmentState", config.equipmentStates, "desconocido")}${select("Prioridad", "priority", priorities, "normal")}</div>
  <div class="aci-evidence"><h3>Evidencia fotográfica <small>Opcional</small></h3>${photoInputs()}<div id="aci-photo-list" class="aci-photos"></div></div>
  <details class="hc-extra-fields"><summary>Fecha, ubicación y contacto</summary><div class="hc-extra-content hc-grid">${field("Fecha de detección *", "occurredOn", today(), "date", `required max="${today()}"`)}${field("Ubicación", "location", "", "text", 'maxlength="300"')}${field("Contacto para atención", "contact", "", "text", 'maxlength="200"')}</div></details>
  <div id="aci-duplicates" hidden class="aci-duplicate"></div><div class="aci-submit"><p>Se notificará a Carlab y quedará en el expediente de la unidad.</p><button type="submit" class="hc-btn primary">Enviar reporte</button></div></section></form>`);
    if (selectedUnit) chooseUnit();
    else await searchUnits("");
  }
  function photoInputs() {
    return `<div class="hc-actions"><label class="hc-btn aci-file">Tomar foto<input data-ai-file type="file" accept="image/*" capture="environment"></label><label class="hc-btn aci-file">Cargar fotos<input data-ai-file type="file" accept="image/jpeg,image/png,image/webp" multiple></label></div><p class="hc-subtle">Hasta 4 fotos por envío · JPEG, PNG o WebP.</p>`;
  }
  async function searchUnits(q) {
    const seq = ++unitSequence;
    const r = await ctx.api("/incidents/units?q=" + encodeURIComponent(q));
    if (seq !== unitSequence || !$("#aci-unit-results")) return;
    units = r;
    $("#aci-unit-results").innerHTML =
      r
        .map(
          (u) =>
            `<button type="button" data-ai="unit" data-id="${esc(u.id)}"><b>Unidad ${esc(u.unit)}</b><span>${esc(u.company)} · ${esc(ctx.info.brands[u.brand])}</span><i>→</i></button>`,
        )
        .join("") ||
      '<p class="hc-empty">No se encontraron unidades activas en tu acceso.</p>';
  }
  function clearDuplicates() {
    const el = $("#aci-duplicates");
    if (el) {
      el.hidden = true;
      el.innerHTML = "";
    }
  }
  function chooseUnit() {
    clearDuplicates();
    $("#aci-unit-step").hidden = true;
    $("#aci-issue-step").hidden = false;
    $("#aci-step-one").classList.remove("active");
    $("#aci-step-two").classList.add("active");
    $("#aci-selected-unit").innerHTML =
      `<div><b>Unidad ${esc(selectedUnit.unit)}</b><span>${esc(selectedUnit.company)} · ${esc(ctx.info.brands[selectedUnit.brand])}</span></div>${btn("Cambiar unidad", "change-unit")}`;
    $("#aci-dialog").scrollTop = 0;
  }
  function renderPhotos() {
    const el = $("#aci-photo-list");
    if (el)
      el.innerHTML = images
        .map(
          (p, i) =>
            `<figure><img src="${esc(p.data)}" alt="Fotografía ${i + 1} del reporte">${btn("Quitar", "remove-photo", `data-index="${i}"`)}</figure>`,
        )
        .join("");
  }
  async function detail(id) {
    current = await ctx.api("/incidents/" + encodeURIComponent(id));
    images = [];
    const x = current,
      closed = ["resuelto", "descartado"].includes(x.status),
      active = !closed && !x.deletedAt;
    const actions = closed
      ? { reopen: "Reabrir reporte" }
      : {
          assign: "Asignar responsable",
          request_info: "Solicitar información a la flota",
          ...(!x.order
            ? {
                review: "Pasar a revisión",
                attend: "Iniciar atención",
                schedule: "Programar atención",
                link: "Vincular orden existente",
              }
            : { unlink: "Desvincular orden" }),
          resolve: "Registrar conclusión / pedir confirmación",
          discard: "Descartar reporte con motivo",
        };
    dialog(`<div class="aci-title"><span class="acp-eyebrow">REPORTE DE INCIDENCIA · ${esc(ctx.info.brands[x.brand])}</span><div class="aci-detail-heading"><h2>${esc(x.folio)}</h2><span class="aci-status ${x.status}">${esc(config.stages[x.status])}</span></div><p><b>Unidad ${esc(x.unit)}</b> · ${esc(x.company)}</p>${x.data.source === "guest_qr" ? '<p class="hc-subtle">Visitante QR · Reporte enviado sin cuenta</p>' : ""}${x.data.sourceIntakeFolio ? `<p class="hc-subtle">Recepción: ${esc(x.data.sourceIntakeFolio)} · ${esc(x.data.sourceCompany)} · Unidad ${esc(x.data.sourceUnit)}</p>` : ""}${x.deletedAt ? '<p class="hc-error">Reporte archivado. El historial y la orden se conservan.</p>' : ""}</div>
  <ol class="aci-progress" aria-label="Seguimiento">${["nuevo", "revision", "atencion", "confirmacion", "resuelto"].map((s, i) => `<li class="${["nuevo", "revision", "atencion", "confirmacion", "resuelto"].indexOf(x.status) >= i ? "reached" : ""}" ${x.status === s ? 'aria-current="step"' : ""}>${esc(config.stages[s])}</li>`).join("")}</ol>
  <section class="aci-facts"><div><small>Incidencia</small><b>${esc(config.categories[x.category])}</b></div><div><small>Condición reportada por el usuario</small><b>${esc(config.equipmentStates[x.equipmentState])}</b></div><div><small>Prioridad</small><b>${esc(priorities[x.data.priority])}</b></div><div><small>Detección</small><b>${date(x.occurredOn)}</b></div><div><small>Responsable Carlab</small><b>${esc(x.assignee)}</b></div>${x.data.scheduledDate ? `<div><small>Atención programada</small><b>${date(x.data.scheduledDate)}</b></div>` : ""}</section><section class="aci-observation"><h3>Descripción de la incidencia</h3><p>${esc(x.data.description)}</p>${x.data.location ? `<small>Ubicación: ${esc(x.data.location)}</small>` : ""}${x.data.contact ? `<small>Contacto: ${esc(x.data.contact)}</small>` : ""}</section>
  ${x.recurrences ? `<p class="aci-recurrence">Se encontraron ${x.recurrences} reporte(s) adicional(es) de esta categoría en los últimos 90 días. Revisar el historial para confirmar si se trata de una falla recurrente.</p>` : ""}
  ${x.data.evidence?.length ? `<details class="hc-extra-fields"><summary>Evidencia fotográfica (${x.photoCount})</summary><div class="aci-photos">${x.data.evidence.map((p, i) => `<figure><a href="${esc(p.data)}" target="_blank" rel="noopener"><img src="${esc(p.data)}" alt="Evidencia ${i + 1}" loading="lazy"></a><figcaption>${esc(p.caption)}</figcaption></figure>`).join("")}</div></details>` : ""}
  ${x.order ? `<div class="aci-linked"><div><small>Orden vinculada</small><b>${esc(x.order.folio)} · ${esc(ctx.library.statuses?.[x.order.status] || x.order.status)}${x.order.deleted ? " · En papelera" : ""}</b></div>${!x.order.deleted ? btn("Ver orden", "order") : ""}</div>` : ""}
  ${x.resolution ? `<section class="aci-resolution"><h3>Conclusión de la atención</h3><p>${esc(x.resolution)}</p></section>` : ""}
  ${active && x.status === "confirmacion" ? `<form id="aci-confirm" class="aci-confirm"><h3>Verificar el resultado</h3><p>La atención está terminada. Confirma si la incidencia quedó resuelta en la unidad.</p>${field("Resultado de la verificación *", "notes", "", "textarea", 'required maxlength="3000"')}<div class="hc-actions"><button name="decision" value="confirm" type="submit" class="hc-btn primary">Confirmar solución</button><button name="decision" value="persists" type="submit" class="hc-btn">La falla continúa</button></div></form>` : ""}
  ${active ? `<details class="hc-extra-fields"><summary>Agregar información o fotos</summary><form id="aci-comment" class="hc-extra-content">${field("Observación / respuesta a Carlab", "notes", "", "textarea", 'maxlength="3000"')}${photoInputs()}<div id="aci-photo-list" class="aci-photos"></div><button type="submit" class="hc-btn primary">Agregar al seguimiento</button></form></details>` : ""}
  ${admin() && !x.deletedAt ? `<details class="hc-extra-fields"><summary>Gestionar atención</summary><form id="aci-manage" class="hc-extra-content">${select("Acción", "action", actions)}<div id="aci-action-fields"></div>${field("Observación, motivo o conclusión técnica", "notes", "", "textarea", 'maxlength="3000"')}<button type="submit" class="hc-btn primary">Guardar seguimiento</button></form></details>` : ""}
  ${admin() && active && !x.order && x.status !== "confirmacion" ? `<details class="hc-extra-fields"><summary>Crear orden desde este reporte</summary><form id="aci-convert" class="hc-extra-content"><div class="hc-grid">${select("Tipo de servicio *", "type", { "": "Seleccionar servicio", ...ctx.info.serviceTypes }, "", "required")}${select("Atención", "attention", { normal: "Normal", express: "Servicio express" }, x.data.priority === "urgente" ? "express" : "normal")}${field("Fecha del servicio *", "serviceDate", today(), "date", "required")}<div id="aci-interval" hidden>${select("Periodicidad del preventivo", "interval", Object.fromEntries(Object.keys(ctx.library.brandCatalogs?.[x.brand]?.intervals || {}).map((k) => [k, k.charAt(0).toUpperCase() + k.slice(1)])))}</div></div><p class="hc-subtle">Se copiarán la unidad, empresa, marca, descripción y fotografías a una orden en borrador.</p><button type="submit" class="hc-btn primary">Crear orden y continuar</button></form></details>` : ""}
  <details class="hc-extra-fields" open><summary>Bitácora de seguimiento</summary><p class="hc-subtle">Últimas 100 actualizaciones.</p><div class="aci-timeline">${x.events.map((e) => `<article><b>${esc(actionNames[e.action] || e.action)}</b><small>${esc(e.actor_name)} · ${date(e.created_at)}</small>${e.details.notes ? `<p>${esc(e.details.notes)}</p>` : ""}${e.details.photosAdded ? `<small>${e.details.photosAdded} fotografía(s) agregada(s)</small>` : ""}${e.details.previousOrderId && e.details.previousOrderId !== x.order?.id ? btn("Consultar orden anterior", "history-order", `data-id="${esc(e.details.previousOrderId)}"`) : ""}</article>`).join("")}</div></details>
  <div class="hc-actions">${btn("Cerrar", "close")}${btn("Descargar PDF", "pdf")}${btn("Ver unidad", "fleet")}${admin() ? btn(x.deletedAt ? "Recuperar reporte" : "Archivar reporte", "archive") : ""}${btn("Actualizar ficha", "reload")}</div>`);
    if (admin() && !x.deletedAt) await actionFields();
  }
  async function actionFields() {
    const f = $("#aci-manage");
    if (!f) return;
    const action = f.elements.action.value,
      el = $("#aci-action-fields");
    el.innerHTML = "";
    if (action === "assign")
      el.innerHTML = select(
        "Responsable",
        "assigneeId",
        {
          "": "Sin asignar",
          ...Object.fromEntries(config.assignees.map((u) => [u.id, u.nombre])),
        },
        current.assigneeId || "",
      );
    if (action === "schedule")
      el.innerHTML = field(
        "Fecha de atención *",
        "scheduledDate",
        current.data.scheduledDate || today(),
        "date",
        "required",
      );
    if (action === "link") {
      const list = await ctx.api("/incidents/" + current.id + "/orders");
      if (
        !$("#aci-manage") ||
        $("#aci-manage").elements.action.value !== "link"
      )
        return;
      el.innerHTML = select(
        "Orden de esta unidad y marca *",
        "orderId",
        {
          "": "Seleccionar orden",
          ...Object.fromEntries(
            list.map((o) => [
              o.id,
              `${o.folio} · ${date(o.service_date)} · ${ctx.library.statuses?.[o.status] || o.status}`,
            ]),
          ),
        },
        "",
        "required",
      );
    }
  }
  async function refreshBehind() {
    if (ctx.active()) await load();
    window.ACOperations?.refreshNotifications();
  }
  async function update(body) {
    const x = await api(
      "/incidents/" + current.id,
      { ...version(), ...body },
      "PATCH",
    );
    await refreshBehind();
    await detail(x.id);
    ctx.toast("Seguimiento guardado.");
  }
  async function pdf() {
    await window.CarlabAssets.pdf({ tables: true });
    const x = current,
      doc = new window.jspdf.jsPDF({
        unit: "mm",
        format: "a4",
        compress: true,
      });
    doc.setFillColor(17, 46, 60);
    doc.rect(0, 0, 210, 36, "F");
    doc.setTextColor(255);
    doc.setFontSize(20);
    doc.text("CARLAB", 15, 16);
    doc.setFontSize(10);
    doc.text("REPORTE DE INCIDENCIA DE CLIMATIZACIÓN", 15, 25);
    doc.text(x.folio, 195, 16, { align: "right" });
    doc.setTextColor(30, 50, 65);
    doc.autoTable({
      startY: 43,
      head: [["IDENTIFICACIÓN", "INFORMACIÓN REGISTRADA"]],
      body: [
        ["Empresa / unidad", `${x.company} / ${x.unit}`],
        ["Marca", ctx.info.brands[x.brand]],
        ["Incidencia", config.categories[x.category]],
        ["Fecha de detección", date(x.occurredOn)],
        [
          "Estado / prioridad",
          `${config.stages[x.status]} / ${priorities[x.data.priority]}`,
        ],
        ["Condición reportada", config.equipmentStates[x.equipmentState]],
        ["Responsable", x.assignee],
        ["Orden vinculada", x.order?.folio || "Sin orden vinculada"],
        [
          "Ubicación / contacto",
          `${x.data.location || "—"} / ${x.data.contact || "—"}`,
        ],
      ],
      margin: { top: 15, bottom: 24 },
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [8, 128, 132] },
    });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 8,
      head: [["DESCRIPCIÓN DE LA INCIDENCIA"]],
      body: [[x.data.description]],
      margin: { top: 15, bottom: 24 },
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [17, 46, 60] },
    });
    if (x.resolution)
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 8,
        head: [["CONCLUSIÓN DE LA ATENCIÓN"]],
        body: [[x.resolution]],
        margin: { top: 15, bottom: 24 },
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [8, 128, 132] },
      });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 8,
      head: [["FECHA", "RESPONSABLE / ACTUACIÓN", "OBSERVACIONES"]],
      body: [...x.events]
        .reverse()
        .map((e) => [
          date(e.created_at),
          `${e.actor_name}\n${actionNames[e.action] || e.action}`,
          e.details.notes || e.details.folio || "—",
        ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [17, 46, 60] },
      margin: { bottom: 22 },
    });
    for (const [i, p] of (x.data.evidence || []).entries()) {
      doc.addPage();
      doc.setFontSize(12);
      doc.text(`EVIDENCIA FOTOGRÁFICA ${i + 1} · ${x.folio}`, 15, 20);
      const prop = doc.getImageProperties(p.data),
        scale = Math.min(180 / prop.width, 220 / prop.height);
      doc.addImage(
        p.data,
        prop.fileType,
        15,
        30,
        prop.width * scale,
        prop.height * scale,
      );
      if (p.caption) doc.text(doc.splitTextToSize(p.caption, 180), 15, 260);
    }
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text(
        "La condición reportada no sustituye la evaluación técnica.",
        15,
        283,
      );
      doc.text(
        `${x.folio} · ${date(new Date().toISOString())} · ${i}/${pages}`,
        15,
        289,
      );
    }
    doc.save("CARLAB-" + x.folio + ".pdf");
  }
  document.addEventListener("keydown", (e) => {
    if (e.target.id === "aci-unit-search" && e.key === "Enter") {
      e.preventDefault();
      searchUnits(e.target.value).catch(error);
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "aci-unit-search") {
      clearTimeout(unitTimer);
      unitTimer = setTimeout(
        () => searchUnits(e.target.value).catch(error),
        220,
      );
    }
  });
  document.addEventListener("change", async (e) => {
    try {
      if (e.target.name === "category" && e.target.closest("#aci-create"))
        clearDuplicates();
      if (e.target.closest("#aci-convert") && e.target.name === "type")
        $("#aci-interval").hidden = e.target.value !== "preventivo";
      if (e.target.closest("#aci-manage") && e.target.name === "action")
        await actionFields();
      if (e.target.matches("[data-ai-file]")) {
        if (sending || photoBusy) return;
        photoBusy = true;
        try {
          const files = [...e.target.files];
          if (images.length + files.length > 4)
            throw new Error("Puedes adjuntar hasta cuatro fotos por envío.");
          for (const f of files)
            images.push({ data: await ctx.compress(f), caption: "" });
          renderPhotos();
        } finally {
          photoBusy = false;
          e.target.value = "";
        }
      }
    } catch (err) {
      error(err);
    }
  });
  document.addEventListener("submit", async (e) => {
    if (!e.target.id.startsWith("aci-")) return;
    e.preventDefault();
    if (sending || photoBusy) return;
    const f = e.target,
      b = Object.fromEntries(new FormData(f));
    sending = true;
    f.querySelectorAll("button[type=submit]").forEach(
      (el) => (el.disabled = true),
    );
    try {
      if (f.id === "aci-filters") {
        filters = { ...filters, ...b };
        offset = 0;
        await load();
      }
      if (f.id === "aci-create") {
        const r = await api("/incidents", {
          ...b,
          unitId: selectedUnit?.id,
          clientKey: key,
          evidence: images,
        });
        if (r.duplicates) {
          const el = $("#aci-duplicates");
          el.hidden = false;
          el.innerHTML = `<h3>Ya existe una incidencia abierta de este tipo</h3><p>Agrega tu descripción y fotos al reporte existente para mantener un solo seguimiento.</p>${r.duplicates.map((x) => btn("Agregar a " + esc(x.folio), "append-duplicate", `data-id="${esc(x.id)}"`)).join("")}${field("Si es otro evento, explica por qué requiere un reporte separado", "separateReason", "", "textarea", 'maxlength="1000"')}<p class="hc-subtle">Completa el motivo y pulsa “Enviar reporte” para registrar otro evento.</p>`;
          el.scrollIntoView({ block: "nearest" });
        } else {
          await refreshBehind();
          await detail(r.id);
          ctx.toast("Reporte enviado a Carlab.");
        }
      }
      if (f.id === "aci-comment")
        await update({ action: "comment", notes: b.notes, evidence: images });
      if (f.id === "aci-manage") await update(b);
      if (f.id === "aci-confirm")
        await update({ action: e.submitter?.value, notes: b.notes });
      if (f.id === "aci-convert") {
        const r = await api("/requests/" + current.id + "/create-order", {
          ...version(),
          ...b,
        });
        $("#aci-dialog").close();
        await ctx.navigate("order", r.id);
        ctx.toast("Orden creada desde el reporte.");
      }
      if (f.id === "aci-archive") {
        const r = await api(
          "/incidents/" + current.id + (current.deletedAt ? "/restore" : ""),
          { ...version(), reason: b.reason },
          current.deletedAt ? "POST" : "DELETE",
        );
        await refreshBehind();
        await detail(r.id);
      }
    } catch (err) {
      error(err);
    } finally {
      sending = false;
      f.querySelectorAll("button[type=submit]").forEach(
        (el) => (el.disabled = false),
      );
    }
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ai]");
    if (!b || !ctx || sending || photoBusy) return;
    const a = b.dataset.ai;
    try {
      if (a === "close") close();
      if (a === "new") await create(ctx);
      if (a === "intakes" && admin()) await ctx.navigate("intakes");
      if (a === "refresh") await load();
      if (a === "reload") await detail(current.id);
      if (a === "filter") {
        filters.status = b.dataset.status;
        offset = 0;
        await load();
      }
      if (a === "prev" || a === "next") {
        offset = Math.max(0, offset + (a === "next" ? 25 : -25));
        await load();
      }
      if (a === "detail") await detail(b.dataset.id);
      if (a === "unit") {
        selectedUnit = units.find((u) => u.id === b.dataset.id);
        chooseUnit();
      }
      if (a === "change-unit") {
        $("#aci-unit-step").hidden = false;
        $("#aci-issue-step").hidden = true;
        $("#aci-step-one").classList.add("active");
        $("#aci-step-two").classList.remove("active");
        await searchUnits($("#aci-unit-search").value);
      }
      if (a === "remove-photo") {
        images.splice(Number(b.dataset.index), 1);
        renderPhotos();
      }
      if (a === "order" || a === "fleet" || a === "history-order") {
        close();
        await ctx.navigate(
          a === "fleet" ? "fleet" : "order",
          a === "fleet"
            ? current.unitId
            : a === "history-order"
              ? b.dataset.id
              : current.order.id,
        );
      }
      if (a === "informs") await ctx.navigate("reports");
      if (a === "pdf") await pdf();
      if (a === "archive") {
        dialog(
          `<h2>${current.deletedAt ? "Recuperar" : "Archivar"} ${esc(current.folio)}</h2><p>El historial y las órdenes vinculadas se conservan.</p><form id="aci-archive">${field("Motivo *", "reason", "", "textarea", 'required maxlength="1000"')}<div class="hc-actions">${btn("Volver", "reload")}<button type="submit" class="hc-btn primary">Confirmar</button></div></form>`,
        );
      }
      if (a === "append-duplicate") {
        const f = $("#aci-create"),
          form = Object.fromEntries(new FormData(f));
        sending = true;
        try {
          const x = await ctx.api("/incidents/" + b.dataset.id);
          const r = await api(
            "/incidents/" + x.id,
            {
              version: x.version,
              orderVersion: x.order?.version ?? null,
              action: "comment",
              notes: form.description,
              evidence: images,
            },
            "PATCH",
          );
          await refreshBehind();
          await detail(r.id);
          ctx.toast("Información agregada al reporte existente.");
        } finally {
          sending = false;
        }
      }
    } catch (err) {
      error(err);
    }
  });
  window.ACIncidents = { show, create };
})();
