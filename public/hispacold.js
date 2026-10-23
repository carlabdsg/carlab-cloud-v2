"use strict";
(() => {
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) =>
    String(s ?? "").replace(
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
  const dateOf = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const localDate = () => dateOf(new Date());
  const money = (n) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(n || 0);
  const fmt = (d) =>
    d
      ? new Date(
          String(d).length === 10 ? d + "T12:00:00" : d,
        ).toLocaleDateString("es-MX", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";
  const outcomes = {
    pendiente: "Pendiente",
    bien: "Bien",
    corregido: "Corregido",
    hallazgo: "Hallazgo",
    no_aplica: "No aplica",
  };
  const phases = {
    antes: "Antes",
    durante: "Durante",
    despues: "Después",
    sin_clasificar: "Sin clasificar",
  };
  const decisions = {
    pendiente: "Por autorizar",
    autorizado: "Autorizado",
    no_autorizado: "No autorizado",
    realizado: "Realizado",
    descartado: "Descartado / no procede",
  };
  const results = {
    operativo: "Operativo",
    con_observaciones: "Con observaciones",
    no_operativo: "No operativo",
  };
  const actionNames = {
    "": "Sin acción",
    V: "Verificar",
    R: "Reparar",
    S: "Sustituir",
    L: "Lectura",
  };
  const components = {
    "": "Sin especificar",
    compresor: "Compresor",
    evaporador: "Evaporador",
    condensador: "Condensador",
    circuito: "Circuito / fuga",
    electrico: "Eléctrico / control",
    pieza: "Pieza sustituida",
    unidad: "Unidad",
    otro: "Otro",
  };
  const stepSets = {
    express: [
      ["reception", "Evento"],
      ["work", "Atención"],
      ["delivery", "Entrega"],
    ],
    menor: [
      ["reception", "Recepción"],
      ["work", "Intervención"],
      ["delivery", "Entrega"],
    ],
    revision: [
      ["reception", "Recepción"],
      ["inspection", "Inspección"],
      ["work", "Diagnóstico"],
      ["delivery", "Entrega"],
    ],
    preventivo: [
      ["reception", "Recepción"],
      ["inspection", "Revisión"],
      ["work", "Mantenimiento"],
      ["delivery", "Entrega"],
    ],
    mayor: [
      ["reception", "Recepción"],
      ["inspection", "Revisión"],
      ["measurements", "Mediciones"],
      ["work", "Reparación"],
      ["delivery", "Entrega"],
    ],
  };
  let catalog,
    units = [],
    view = "services",
    record = null,
    draft = null,
    dirty = false,
    saving = false,
    importing = false,
    photoProcessing = false;
  let step = 0,
    page = 0,
    listResult,
    filters = { q: "", brand: "", type: "", status: "", from: "", to: "" },
    signatures = {},
    toastTimer;
  let localId = "",
    change = 0,
    storedChange = 0,
    storeTimer,
    storeQueue = Promise.resolve(),
    storageError = "",
    localDrafts = [],
    cloneSource = null;
  let checkFilter = "all",
    pendingPhotoCheck = "",
    historyQuery = { company: "", unit: "", offset: 0 };
  let calendarMonth = localDate().slice(0, 7),
    calendarBucket = "all",
    calendarOffset = 0,
    calendarDay = "";
  let bootToken = "";
  let knowledgeBrand = "hispacold",
    trashPage = 0,
    cameraStream = null;
  const brandName = (brand) =>
    catalog.brands?.[brand || "hispacold"] || "Hispacold";
  const brandCatalog = (brand = draft?.brand || "hispacold") =>
    catalog.brandCatalogs?.[brand] || catalog;
  const isV3 = () => Number(draft?.formVersion) === 3;
  const isExpress = (d = draft) =>
    d?.attention === "express" || d?.type === "express";
  const intervalNames = () =>
    brandCatalog().intervalLabels ||
    Object.fromEntries(
      Object.keys(brandCatalog().intervals).map((k) => [
        k,
        {
          mensual: "Mensual",
          trimestral: "Trimestral",
          semestral: "Semestral",
          anual: "Anual",
          bianual: "Cada 2 años",
          diario: "Diario",
          semanal: "Semanal",
        }[k] || k,
      ]),
    );
  const editorSession = crypto.randomUUID();
  const btn = (text, action, cls = "", attr = "") =>
    `<button type="button" class="hc-btn ${cls}" data-action="${action}" ${attr}>${text}</button>`;
  const opts = (obj, selected, empty) =>
    `${empty !== undefined ? `<option value="">${esc(empty)}</option>` : ""}${Object.entries(
      obj,
    )
      .map(
        ([k, v]) =>
          `<option value="${esc(k)}" ${String(selected) === k ? "selected" : ""}>${esc(v)}</option>`,
      )
      .join("")}`;
  const badge = (s) =>
    `<span class="hc-badge ${esc(s)}">${esc(catalog.statuses[s] || s)}</span>`;
  const heading = (kicker, title, description, buttons = "") =>
    `<div class="hc-heading"><div><div class="hc-kicker">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="hc-actions">${buttons}</div></div>`;
  const sourceButton = (source) =>
    source
      ? btn(
          "Manual · pág. " + source.page,
          "manual",
          "hc-source",
          `data-id="${esc(source.manualId)}" data-page="${source.page}"`,
        )
      : "";
  const field = (label, key, type = "text", extra = "") =>
    `<label class="hc-field ${type === "textarea" ? "wide" : ""}"><b>${esc(label)}</b>${type === "textarea" ? `<textarea name="${key}" maxlength="6000" ${extra}>${esc(draft[key])}</textarea>` : `<input name="${key}" type="${type}" value="${esc(draft[key])}" ${type === "number" ? 'step="any" min="0"' : ""} ${extra}>`}</label>`;
  const select = (label, key, obj, empty) =>
    `<label class="hc-field"><b>${esc(label)}</b><select name="${key}">${opts(obj, draft[key], empty)}</select></label>`;
  async function api(path, options = {}) {
    const token = localStorage.getItem("carlabToken");
    if (!token)
      throw new Error("Inicia sesión como administrador en Carlab Cloud.");
    if (bootToken && token !== bootToken)
      throw new Error(
        "Cambió la sesión. Recarga para continuar con el administrador actual.",
      );
    const res = await fetch("/api/hispacold" + path, {
      ...options,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const error = new Error(data.error || `Error ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return options.blob ? res.blob() : res.json();
  }
  function toast(message) {
    $("#hc-toast").textContent = message;
    $("#hc-toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("#hc-toast").hidden = true), 4500);
  }
  function error(message) {
    const el = $("#hc-form-error");
    if (el) {
      el.textContent = message;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else toast(message);
  }
  function nav(name) {
    view = name;
    const key = ["fleet", "companies"].includes(name)
      ? "companies"
      : ["home", "services", "requests", "parts", "reports"].includes(name)
        ? name
        : "tools";
    $$(".aca-nav [data-view]").forEach((b) => {
      const selected = b.dataset.view === key;
      b.classList.toggle("selected", selected);
      if (selected) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }
  function storeStatus() {
    const el = $("#hc-save-state");
    if (!el) return;
    el.textContent =
      storageError ||
      (dirty
        ? storedChange === change
          ? "Borrador guardado en este dispositivo"
          : "Guardando borrador en este dispositivo…"
        : record
          ? `Guardado en Carlab · versión ${record.version}`
          : "Orden nueva");
    el.classList.toggle("hc-storage-error", !!storageError);
  }
  function markDirty() {
    dirty = true;
    change++;
    clearTimeout(storeTimer);
    storeStatus();
    storeTimer = setTimeout(() => persistDraft(), 650);
    updateProgress();
  }
  function persistDraft() {
    clearTimeout(storeTimer);
    if (saving || !draft || !localId || !dirty || !$("#hc-form"))
      return storeQueue;
    readForm();
    const revision = change,
      owner = catalog.user.id,
      id = localId;
    const snapshot = {
      data: structuredClone(draft),
      record: record
        ? {
            id: record.id,
            folio: record.folio,
            version: record.version,
            status: record.status,
          }
        : null,
      step,
    };
    storeQueue = storeQueue
      .catch(() => {})
      .then(() => HCDrafts.put(owner, id, snapshot))
      .then(() => {
        if (localId === id) {
          storedChange = revision;
          storageError = "";
          storeStatus();
        }
      })
      .catch((e) => {
        storageError = e.message;
        storeStatus();
      });
    return storeQueue;
  }
  async function leave() {
    if (saving || importing || photoProcessing) {
      toast("Espera a que termine la operación.");
      return false;
    }
    if (dirty) {
      await persistDraft();
      if (storedChange !== change)
        return confirm(
          "El borrador no se pudo proteger en este dispositivo. ¿Salir sin guardar?",
        );
    }
    return true;
  }
  async function resetEditor() {
    clearTimeout(storeTimer);
    await storeQueue;
    dirty = false;
    draft = null;
    record = null;
    localId = "";
    signatures = {};
    storageError = "";
  }
  async function show(name) {
    if (!(await leave())) return false;
    window.ACOperations?.deactivate();
    await resetEditor();
    nav(name);
    try {
      if (name === "services") await services();
      else if (name === "calendar") await calendar();
      else if (name === "history") await history();
      else if (name === "library") library();
      else if (name === "trash") await trash();
      else if (
        [
          "home",
          "companies",
          "tools",
          "fleet",
          "requests",
          "parts",
          "access",
          "notifications",
          "reports",
        ].includes(name)
      )
        await window.ACOperations.show(name);
      else codes();
    } catch (e) {
      $("#hc-main").innerHTML = heading(
        "HISPACOLD",
        "No se pudo cargar",
        e.message,
        btn("Reintentar", "refresh"),
      );
    }
  }
  async function draftCards() {
    try {
      localDrafts = await HCDrafts.list(catalog.user.id);
    } catch (e) {
      localDrafts = [];
      storageError = e.message;
    }
    if (!localDrafts.length)
      return storageError
        ? `<div class="hc-note">${esc(storageError)}</div>`
        : "";
    return `<section class="hc-local-drafts"><div><strong>Borradores de este dispositivo</strong><p>Continúa donde te quedaste. Solo aparecen para tu administrador en este navegador.</p></div><div class="hc-draft-cards">${localDrafts.map((d) => `<article><div><b>${esc(d.record?.folio || catalog.types[d.data.type])}</b><span>${esc(d.data.company || "Cliente por capturar")} · ${esc(d.data.unit || "Unidad por capturar")}</span><small>${new Date(d.updatedAt).toLocaleString("es-MX")}</small></div><div class="hc-actions">${btn("Continuar", "resume", "", `data-id="${esc(d.id)}"`)}${btn("Descartar", "discard-draft", "", `data-id="${esc(d.id)}"`)}</div></article>`).join("")}</div></section>`;
  }
  async function services() {
    listResult = await api(
      "/services?" +
        new URLSearchParams({
          ...filters,
          today: localDate(),
          offset: String(page * 25),
          limit: "25",
        }),
    );
    const s = listResult.summary;
    $("#hc-main").innerHTML =
      heading(
        "CARLAB / CLIMATIZACIÓN",
        "Órdenes de servicio",
        "Crea una orden o continúa el trabajo de una unidad.",
        btn("⚡ Express", "express", "hc-express") +
          btn("↓ CSV", "csv") +
          btn("+ Nueva orden", "new", "primary"),
      ) +
      (await draftCards()) +
      `<section class="hc-metrics"><article class="hc-metric accent"><span>ÓRDENES REGISTRADAS</span><strong>${s.total}</strong><small>Según tus filtros</small></article><article class="hc-metric"><span>EN SEGUIMIENTO</span><strong>${s.open}</strong><small>Borradores, taller y refacciones</small></article><article class="hc-metric"><span>SERVICIOS COMPLETADOS</span><strong>${s.completed}</strong><small>Prueba y entrega documentadas</small></article><article class="hc-metric"><span>SEGUIMIENTOS VENCIDOS</span><strong>${s.overdue}</strong><small>Todas las unidades · fecha vigente</small></article></section>
      <section class="hc-panel hc-orders"><div class="hc-panel-head"><div><h2>Órdenes de servicio</h2><p>Empresa, unidad, folio o técnico.</p></div><span class="hc-badge">${s.total} registros</span></div>
      <details class="acp-filter-details" ${Object.values(filters).some(Boolean) ? "open" : ""}><summary>Buscar y filtrar órdenes</summary><form id="hc-filters" class="hc-filters"><input aria-label="Buscar servicios" type="search" name="q" placeholder="Buscar empresa, unidad o folio…" value="${esc(filters.q)}"><select aria-label="Marca del aire acondicionado" name="brand">${opts(catalog.brands, filters.brand, "Todas las marcas")}</select><select aria-label="Tipo de servicio" name="type">${opts(catalog.types, filters.type, "Todos los servicios")}</select><select aria-label="Estado" name="status">${opts(catalog.statuses, filters.status, "Todos los estados")}</select><label>Desde<input type="date" name="from" value="${esc(filters.from)}"></label><label>Hasta<input type="date" name="to" value="${esc(filters.to)}"></label><button class="hc-btn" type="submit">Filtrar</button>${btn("Limpiar", "clear-filters")}</form></details>
      ${listResult.items.length ? ordersTable(listResult.items) : '<div class="hc-empty"><strong>Sin órdenes para mostrar</strong>Crea una orden o ajusta los filtros.</div>'}
      <div class="hc-pager"><span>${s.total ? `${page * 25 + 1}–${page * 25 + listResult.items.length} de ${s.total}` : "Sin órdenes"}</span><div class="hc-actions">${btn("← Anterior", "prev", "", page === 0 ? "disabled" : "")}${btn("Siguiente →", "next", "", (page + 1) * 25 >= s.total ? "disabled" : "")}</div></div></section>`;
  }
  function ordersTable(rows) {
    return `<div class="hc-order-cards">${rows.map((r) => `<article class="hc-order-card"><div class="hc-order-top"><button class="hc-link" data-action="open" data-id="${esc(r.id)}">${esc(r.folio)}</button>${r.deletedAt ? '<span class="hc-badge cancelado">En papelera</span>' : badge(r.status)}</div><h3>${esc(r.company)} <span>· ${esc(r.unit)}</span></h3><div class="hc-chips"><span>${esc(brandName(r.brand || r.data?.brand))}</span>${isExpress(r.data || r) ? '<span class="hc-chip-express">⚡ Express</span>' : ""}</div><b>${esc(catalog.types[r.type])}</b><p>${esc(r.symptoms || r.data?.symptoms || r.technician || "Servicio registrado")}</p><div class="hc-card-next">${r.deletedAt ? "Eliminada el " + fmt(r.deletedAt) : r.nextDate ? "Próximo servicio: " + fmt(r.nextDate) : r.status === "completado" ? "Servicio cerrado · " + fmt(r.serviceDate) : r.status === "cancelado" ? "Orden cancelada · " + fmt(r.serviceDate) : r.pendingCount ? `${r.pendingCount} trabajos pendientes` : r.status === "espera_refaccion" ? "Pendiente: recibir refacción" : "Pendiente: continuar atención"}</div><div class="hc-actions">${btn(r.deletedAt ? "Ver / recuperar" : ["completado", "cancelado"].includes(r.status) ? "Ver reporte" : "Continuar", r.deletedAt || ["completado", "cancelado"].includes(r.status) ? "open" : "continue-order", "", `data-id="${esc(r.id)}"`)}</div></article>`).join("")}</div>`;
  }
  async function trash() {
    const r = await api(
      "/services?" +
        new URLSearchParams({
          deleted: "true",
          offset: trashPage * 25,
          limit: 25,
        }),
    );
    $("#hc-main").innerHTML =
      heading(
        "ÓRDENES ELIMINADAS",
        "Papelera",
        "Las órdenes aquí no aparecen en la operación ni en los próximos servicios. Puedes recuperarlas con su historial intacto.",
        btn("← Órdenes", "back"),
      ) +
      (r.items.length
        ? ordersTable(r.items)
        : '<div class="hc-empty">La papelera está vacía.</div>') +
      `<div class="hc-pager"><span>${r.summary.total} órdenes</span><div class="hc-actions">${btn("Anterior", "trash-prev", "", trashPage === 0 ? "disabled" : "")}${btn("Siguiente", "trash-next", "", (trashPage + 1) * 25 >= r.summary.total ? "disabled" : "")}</div></div>`;
  }
  function deleteDialog() {
    $("#hc-dialog").innerHTML =
      `<div class="hc-kicker">ELIMINAR ORDEN</div><h2>¿Enviar ${esc(record.folio)} a la papelera?</h2><p>Se retirará de las órdenes activas, el expediente y los próximos servicios. Podrás recuperarla desde Papelera.</p><form id="hc-delete-form"><label class="hc-field"><b>Motivo</b><input name="reason" required maxlength="1000" placeholder="Duplicada, captura incorrecta…"></label><div class="hc-actions">${btn("Conservar orden", "close-dialog")}<button class="hc-btn hc-danger" type="submit">Eliminar orden</button></div><p id="hc-delete-error" role="alert"></p></form>`;
    $("#hc-dialog").showModal();
  }
  async function calendar() {
    await window.ACOperations.show("upcoming");
  }
  async function history() {
    let body =
      '<div class="hc-empty"><strong>Un expediente, todas sus intervenciones</strong>Selecciona una unidad de Flotas o consulta por empresa y económico.</div>';
    if (historyQuery.company && historyQuery.unit) {
      const r = await api("/history?" + new URLSearchParams(historyQuery));
      const latest = r.items[0];
      body = `<div class="hc-metrics"><article class="hc-metric accent"><span>INTERVENCIONES</span><strong>${r.summary.total}</strong><small>${esc(r.company)} · ${esc(r.unit)}</small></article><article class="hc-metric"><span>COMPLETADAS</span><strong>${r.summary.completed}</strong><small>Servicios cerrados</small></article><article class="hc-metric"><span>IMPORTE REGISTRADO</span><strong class="hc-small-number">${money(r.summary.total_cost)}</strong><small>Solo servicios completados</small></article><article class="hc-metric"><span>PRÓXIMO SERVICIO</span><strong class="hc-small-number">${fmt(r.next[0]?.nextDate)}</strong><small>Fecha vigente de la unidad</small></article></div>
      ${r.recurring.length ? `<div class="hc-note"><strong>Síntomas registrados más de una vez</strong><div class="hc-chips">${r.recurring.map((f) => `<span>${esc(brandCatalog(f.brand || "hispacold").symptomGuides.find((g) => g.id === f.code)?.label || f.code)} · ${f.total} reportes</span>`).join("")}</div></div>` : ""}
      <section class="hc-panel"><div class="hc-panel-head"><h2>Últimas refacciones y materiales registrados</h2></div><div class="hc-history-parts">${r.parts.map((p) => `<div><b>${esc(p.item.description)}</b><span>${esc(p.item.reference || "Sin referencia")} · ${esc(p.item.quantity)} unidades</span><small>HC-${String(p.number).padStart(6, "0")} · ${fmt(p.service_date)}</small></div>`).join("") || '<p class="hc-subtle">Sin conceptos registrados en órdenes completadas.</p>'}</div></section>
      <section class="hc-panel hc-orders"><div class="hc-panel-head"><h2>Historial de intervenciones</h2>${latest ? btn("Nuevo servicio para esta unidad", "new-from-id", "primary", `data-id="${esc(latest.id)}"`) : ""}</div>${ordersTable(r.items)}<div class="hc-pager"><span>${r.summary.total} intervenciones</span><div class="hc-actions">${btn("Anterior", "history-prev", "", historyQuery.offset === 0 ? "disabled" : "")}${btn("Siguiente", "history-next", "", historyQuery.offset + 25 >= r.summary.total ? "disabled" : "")}</div></div></section>`;
    }
    $("#hc-main").innerHTML =
      heading(
        "TRAZABILIDAD / UNIDAD",
        "Expediente de climatización",
        "Servicios, síntomas recurrentes, refacciones y próxima atención.",
      ) +
      `<form id="hc-history-form" class="hc-panel hc-section"><div class="hc-grid"><label class="hc-field wide"><b>Unidad de Flotas</b><select id="hc-history-unit">${opts(Object.fromEntries(units.map((u) => [u.id, `${u.empresa} · ${u.numero_economico}`])), "", "Seleccionar unidad")}</select></label><label class="hc-field"><b>Empresa</b><input name="company" value="${esc(historyQuery.company)}" required maxlength="180"></label><label class="hc-field"><b>Económico</b><input name="unit" value="${esc(historyQuery.unit)}" required maxlength="80"></label><button class="hc-btn primary" type="submit">Consultar expediente</button></div></form>` +
      body;
  }
  const orderIcons = {
    bus: '<rect x="4" y="3" width="16" height="17" rx="3"/><path d="M4 12h16M8 20v2m8-2v2M8 16h1m6 0h1M8 7h8"/>',
    service:
      '<path d="m14 6 4 4m-8 5-5 5-3-3 5-5M13 3a6 6 0 0 0-6 8l6 6a6 6 0 0 0 8-6l-4 2-6-6z"/>',
    camera:
      '<path d="M3 7h4l2-3h6l2 3h4v14H3z"/><circle cx="12" cy="13" r="4"/>',
    note: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2h6v5H9zm0 9h6m-6 4h6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 10-13h-7z"/>',
  };
  const orderIcon = (key) =>
    `<svg class="hco-icon" viewBox="0 0 24 24" aria-hidden="true">${orderIcons[key] || orderIcons.note}</svg>`;
  async function choose(source = null, attention = "normal") {
    if (!(await leave())) return;
    cloneSource = source;
    const brand = source?.data?.brand || (source ? "hispacold" : "");
    $("#hc-dialog").innerHTML =
      `<div class="hco-create"><div class="hco-create-heading"><div><div class="hc-kicker">NUEVA ORDEN / CLIMATIZACIÓN</div><h2>Prepara tu servicio</h2></div>${btn("×", "close-dialog", "hco-close", 'aria-label="Cerrar nueva orden"')}</div><p class="hco-create-intro">${source ? `Atención para ${esc(source.company)} · Unidad ${esc(source.unit)}.` : "Selecciona el equipo, el servicio y la atención. Después te guiamos paso a paso."}</p><form id="hc-create-form"><div class="hc-create-grid">
      <label class="hc-field hco-create-card"><b><span class="hco-choice-icon">${orderIcon("bus")}</span><span><small>01 · EQUIPO</small>Marca del aire acondicionado</span></b><select id="hc-create-brand" name="brand" required>${opts(catalog.brands, brand, "Seleccionar marca")}</select><small>Elige la marca del equipo AC, no la del autobús.</small></label>
      <label class="hc-field hco-create-card"><b><span class="hco-choice-icon">${orderIcon("service")}</span><span><small>02 · SERVICIO</small>Trabajo a realizar</span></b><select id="hc-create-type" name="type" required ${brand ? "" : "disabled"}>${opts(Object.fromEntries(Object.entries(catalog.types).filter(([k]) => k !== "express")), "", "Seleccionar servicio")}</select><small>Las revisiones se ajustan al servicio elegido.</small></label>
      <fieldset id="hc-create-attention" disabled><legend><span class="hco-legend-number">03</span> Tipo de atención</legend><div class="hc-attention-options"><label><input type="radio" name="attention" value="normal" ${attention === "normal" ? "checked" : ""}><span><b>${orderIcon("clock")} Normal</b><small>Trabajo de taller o servicio programado</small></span></label><label><input type="radio" name="attention" value="express" ${attention === "express" ? "checked" : ""}><span><b>${orderIcon("bolt")} Servicio express</b><small>Urgencia, asistencia o evento extraordinario</small></span></label></div></fieldset></div><p class="hc-subtle" id="hc-create-help">Puedes guardar el avance y continuar después.</p><div class="hc-actions hco-create-actions">${btn("Cancelar", "close-dialog")}<button class="hc-btn primary" type="submit" id="hc-start-order" disabled>Empezar orden →</button></div></form></div>`;
    $("#hc-dialog").showModal();
  }
  function checklistForData(d) {
    const cat = brandCatalog(d.brand || "hispacold");
    if (
      Number(d.formVersion) === 3 &&
      d.type === "preventivo" &&
      d.maintenancePlan === cat.periodicPlan?.id
    )
      return cat.periodicPlan.periods[d.interval]?.checklist || [];
    return cat.templates
      .find((t) => t.id === d.type)
      .checklist.filter(
        (c) =>
          !(
            Number(d.formVersion) === 3 &&
            d.type === "preventivo" &&
            c.actions?.[d.interval] === "-"
          ),
      );
  }
  function normalizeData(data) {
    const d = structuredClone(data);
    if (
      Number(d.formVersion) === 3 &&
      d.type === "preventivo" &&
      !d.maintenancePlan &&
      !(d.checklist || []).some(
        (c) => (c.outcome && c.outcome !== "pendiente") || c.action || c.notes,
      ) &&
      !(d.evidence || []).some((p) => p.checkId)
    )
      d.maintenancePlan = brandCatalog(d.brand || "hispacold").periodicPlan?.id;
    d.checklist = checklistForData(d).map((c) => ({
      ...c,
      action: (d.checklist || []).find((v) => v.id === c.id)?.action || "",
      notes: (d.checklist || []).find((v) => v.id === c.id)?.notes || "",
      suggested: c.actions?.[d.interval] || "",
      outcome:
        (d.checklist || []).find((v) => v.id === c.id)?.outcome || "pendiente",
    }));
    d.measurements = catalog.measurements.map((m) => ({
      ...m,
      ...(d.measurements || []).find((v) => v.id === m.id),
    }));
    d.parts = d.parts || [];
    d.findings = d.findings || [];
    d.evidence = (d.evidence || []).map((p) => ({
      ...p,
      id: p.id || crypto.randomUUID(),
      phase: p.phase || "sin_clasificar",
      component: p.component || "",
      checkId: p.checkId || "",
    }));
    return d;
  }
  async function create(
    type,
    source = cloneSource,
    brand = "hispacold",
    attention = "normal",
  ) {
    if (!(await leave())) return;
    $("#hc-dialog").close();
    await resetEditor();
    draft = normalizeData({
      formVersion: 3,
      brand,
      attention,
      type,
      status: "borrador",
      serviceDate: localDate(),
      interval: Object.keys(brandCatalog(brand).intervals)[0] || "mensual",
      company: "",
      unit: "",
      priority: attention === "express" ? "urgente" : "normal",
      eventKind: attention === "express" ? "urgencia" : "",
      technician: catalog.user.nombre,
    });
    if (source) {
      const s = source.data;
      for (const k of [
        "company",
        "unit",
        "base",
        "model",
        "chassis",
        "equipment",
        "control",
        "compressorSerial",
        "workNumber",
        "planReference",
        "interval",
      ])
        if (
          ![
            "equipment",
            "control",
            "compressorSerial",
            "planReference",
            "interval",
          ].includes(k) ||
          (s.brand || "hispacold") === brand
        )
          draft[k] = s[k] || draft[k] || "";
      draft.fleetUnitId = units.some((u) => u.id === s.fleetUnitId)
        ? s.fleetUnitId
        : "";
      draft.sourceOrderId = source.id;
    }
    draft = normalizeData(draft);
    cloneSource = null;
    localId = crypto.randomUUID();
    change = 0;
    storedChange = 0;
    step = 0;
    checkFilter = "all";
    editor();
    markDirty();
  }
  async function resume(id) {
    if (!(await leave())) return;
    const saved = await HCDrafts.get(catalog.user.id, id);
    if (!saved) return toast("El borrador ya no está disponible.");
    await resetEditor();
    localId = id;
    record = saved.record;
    draft = normalizeData(saved.data);
    step = Math.min(
      saved.step || 0,
      isV3() ? 3 : stepSets[draft.type].length - 1,
    );
    dirty = true;
    change = storedChange = 1;
    editor();
    toast("Borrador recuperado de este dispositivo.");
  }
  function readForm() {
    if (!draft || !$("#hc-form")) return;
    const fields = Object.fromEntries(new FormData($("#hc-form")));
    Object.entries(fields)
      .filter(
        ([key]) =>
          !key.includes(":") && !["photos", "checkFilter"].includes(key),
      )
      .forEach(([key, value]) => (draft[key] = value));
    const circuit = $("[name=circuitOpened]");
    if (circuit) draft.circuitOpened = circuit.checked;
    draft.checklist.forEach((c) => {
      for (const key of ["outcome", "action", "notes"])
        if (fields[`${key}:${c.id}`] !== undefined)
          c[key] = fields[`${key}:${c.id}`];
    });
    draft.measurements.forEach((m) => {
      for (const key of ["before", "after", "conditions"])
        if (fields[`${key}:${m.id}`] !== undefined)
          m[key] = fields[`${key}:${m.id}`];
    });
    draft.parts.forEach((p, i) => {
      for (const key of [
        "description",
        "reference",
        "quantity",
        "unitPrice",
        "kind",
      ])
        if (fields[`${key}:${i}`] !== undefined) p[key] = fields[`${key}:${i}`];
    });
    draft.findings.forEach((f, i) => {
      for (const key of ["description", "decision", "authorizedBy", "notes"])
        if (fields[`finding-${key}:${i}`] !== undefined)
          f[key] = fields[`finding-${key}:${i}`];
    });
    draft.evidence.forEach((e, i) => {
      for (const key of ["caption", "phase", "component", "checkId"])
        if (fields[`photo-${key}:${i}`] !== undefined)
          e[key] = fields[`photo-${key}:${i}`];
    });
    for (const key of ["technicianSignature", "clientSignature"]) {
      const s = signatures[key];
      if (s?.dirty) draft[key] = s.has ? s.canvas.toDataURL("image/png") : "";
    }
  }
  function editor() {
    window.ACOperations?.deactivate();
    if (isV3()) return editorSimple();
    nav("services");
    signatures = {};
    const steps = stepSets[draft.type];
    $("#hc-main").innerHTML =
      heading(
        `${draft.type === "express" ? "ATENCIÓN EXPRESS" : "ORDEN DE SERVICIO"} / ${record?.folio || "NUEVA"}`,
        catalog.types[draft.type],
        `${steps.length} pasos · Puedes guardar y continuar después.`,
        btn("← Órdenes", "back"),
      ) +
      `<div id="hc-form-error" class="hc-error" role="alert"></div><form id="hc-form" novalidate><div class="hc-wizard-progress"><div><b id="hc-progress-label"></b><span id="hc-check-progress"></span></div><progress id="hc-progress" max="100" value="0" aria-label="Avance de captura"></progress></div><div class="hc-panel"><div class="hc-steps" role="tablist">${steps.map(([id, label], i) => `<button type="button" role="tab" aria-controls="hc-section-${id}" aria-selected="${step === i}" data-step="${i}" class="${step === i ? "active" : ""}">${i + 1}. ${label}<span class="hc-step-state" data-state="${id}"></span></button>`).join("")}</div>
      ${steps.map(([id], i) => `<section class="hc-section hc-step" id="hc-section-${id}" data-section="${i}" ${step !== i ? "hidden" : ""}>${{ reception: receptionHTML, inspection: inspectionHTML, measurements: measurementsHTML, work: workHTML, delivery: deliveryHTML }[id]()}</section>`).join("")}</div>
      <input id="hc-camera-input" type="file" accept="image/*" capture="environment" hidden><input id="hc-check-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
      <div class="hc-savebar"><span id="hc-save-state" role="status"></span><div class="hc-actions">${btn("Anterior", "step-prev", "", step === 0 ? "disabled" : "")}${btn("Siguiente", "step-next", "", step === steps.length - 1 ? "disabled" : "")}<button type="submit" class="hc-btn primary" id="hc-save">Guardar orden</button></div></div></form>`;
    initSignatures();
    updateProgress();
    storeStatus();
    if (draft.company && draft.unit) loadUnitContext();
  }
  function extraBlock(title, body, open = false, id = "") {
    return `<details class="hc-extra-fields hc-simple-extra" ${open ? "open" : ""} ${id ? `id="${id}"` : ""}><summary>${title}</summary><div class="hc-extra-content">${body}</div></details>`;
  }
  const guidedLabels = ["Recepción", "Diagnóstico", "Intervención", "Entrega"];
  const guidedDescriptions = [
    "Unidad y motivo del servicio",
    "Hallazgos y puntos de revisión",
    "Trabajos, refacciones y evidencia",
    "Pruebas y condición de entrega",
  ];
  function guidedNavigation() {
    return `<aside class="hc-guided-navigation"><div class="hc-guided-heading"><span class="hco-eyebrow">GUÍA DE CAPTURA</span><b id="hc-guided-position"></b></div><div class="hco-step-track" aria-hidden="true"><i id="hco-step-position"></i></div><nav class="hc-guided-steps" aria-label="Etapas de la orden">${guidedLabels.map((label, i) => `<button type="button" data-step="${i}" aria-controls="hc-guided-${i}"><span class="hco-step-number">${i + 1}</span><span class="hco-step-copy"><b>${label}</b><small>${guidedDescriptions[i]}</small></span></button>`).join("")}</nav><div class="hco-unit-context">${orderIcon("bus")}<div><small>UNIDAD EN ATENCIÓN</small><div id="hc-guided-context"></div></div></div><p class="hco-nav-note">Puedes cambiar de etapa y guardar el avance cuando lo necesites.</p></aside>`;
  }
  function guidedWorkHint() {
    return (
      {
        revision:
          "Describe los componentes inspeccionados y los procedimientos de revisión realizados.",
        preventivo:
          "Describe las tareas de mantenimiento ejecutadas, los componentes atendidos y los ajustes efectuados.",
        menor:
          "Indica el componente intervenido y la reparación o ajuste efectuado.",
        mayor:
          "Describe el desmontaje, la reparación o sustitución y el procedimiento de montaje realizado.",
      }[draft.type] || "Describe las actividades ejecutadas."
    );
  }
  function renderGuidedStep() {
    $$("[data-guided-section]").forEach((el) => {
      el.hidden = Number(el.dataset.guidedSection) !== step;
      el.id = "hc-guided-" + el.dataset.guidedSection;
      el.querySelector("h2").tabIndex = -1;
    });
    $$(".hc-guided-steps [data-step]").forEach((el) => {
      const current = Number(el.dataset.step) === step;
      el.classList.toggle("active", current);
      if (current) el.setAttribute("aria-current", "step");
      else el.removeAttribute("aria-current");
    });
    $("#hc-guided-position").textContent =
      `Paso ${step + 1} de 4 · ${guidedLabels[step]}`;
    $("[data-action=step-prev]").disabled = step === 0;
    const next = $("[data-action=step-next]");
    next.hidden = step === 3;
    next.innerHTML = `<span class="hco-next-long">Continuar a ${guidedLabels[step + 1] || "entrega"} →</span><span class="hco-next-short">Continuar →</span>`;
    $("#hco-step-position").style.width = `${(step + 1) * 25}%`;
    $("[data-action=review-order]").hidden = step !== 3;
  }
  function guidedReadiness(missing) {
    return missing.length
      ? `<b>${missing.length} ${missing.length === 1 ? "pendiente para el cierre" : "pendientes para el cierre"}</b><p>Puedes guardar el avance. Selecciona un pendiente para ir al campo correspondiente.</p><div class="hc-guided-issues">${missing.map((label) => btn(esc(label) + " →", "guided-issue", "", `data-issue="${esc(label)}"`)).join("")}</div>`
      : "<b>Información requerida completa.</b><p>Revisa el resumen técnico antes de confirmar el cierre.</p>";
  }
  function focusGuidedIssue(label) {
    readForm();
    const fields = {
      Empresa: "company",
      Unidad: "unit",
      Fecha: "serviceDate",
      Técnico: "technician",
      Diagnóstico: "diagnosis",
      "Trabajo realizado": "workDone",
      "Prueba final": "finalTest",
      "Condición de entrega": "result",
      "Motivo del servicio": "symptoms",
      "Tipo de evento": "eventKind",
      Periodicidad: "interval",
      "Recomendaciones de entrega": "recommendations",
      "Resolver pendientes o entregar con observaciones": "result",
      "Autorización y referencia técnica": !draft.authorization
        ? "authorization"
        : "technicalReference",
      "Datos de intervención del circuito": !draft.technicalReference
        ? "technicalReference"
        : !draft.refrigerant
          ? "refrigerant"
          : draft.chargedKg == null || draft.chargedKg === ""
            ? "chargedKg"
            : "refrigerantNotes",
    };
    let target = fields[label] ? $(`[name="${fields[label]}"]`) : null;
    if (
      label.includes("puntos de revisión") ||
      label === "Motivo de hallazgos / no aplica"
    ) {
      const c = draft.checklist.find((c) =>
        label.includes("puntos de revisión")
          ? c.outcome === "pendiente"
          : ["hallazgo", "no_aplica"].includes(c.outcome) && !c.notes?.trim(),
      );
      checkFilter = "all";
      $("#hc-check-filter").value = "all";
      if (c)
        target = document.getElementsByName(
          `${label.includes("puntos de revisión") ? "outcome" : "notes"}:${c.id}`,
        )[0];
    }
    if (label === "Persona que autorizó los trabajos") {
      const i = draft.findings.findIndex(
        (f) =>
          ["autorizado", "realizado"].includes(f.decision) &&
          !f.authorizedBy?.trim(),
      );
      target = document.getElementsByName(`finding-authorizedBy:${i}`)[0];
    }
    if (!target) return;
    setStep(
      Number(target.closest("[data-guided-section]").dataset.guidedSection),
    );
    for (
      let parent = target.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      if (parent.tagName === "DETAILS") parent.open = true;
    }
    if (target.name === "recommendations")
      $("#hc-result-followup").hidden = false;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function showGuidedReview() {
    const missing = closeMissing();
    const summary = [
      [
        "Identificación",
        `${draft.company} · Unidad ${draft.unit} · ${brandName(draft.brand)}`,
      ],
      [
        "Servicio",
        `${catalog.types[draft.type]} · ${isExpress() ? "Express" : "Normal"}`,
      ],
      [
        "Responsable y fecha",
        `${draft.technician} · ${fmt(draft.serviceDate)}`,
      ],
      ["Motivo del servicio", draft.symptoms],
      ["Diagnóstico técnico", draft.diagnosis],
      ["Intervención realizada", draft.workDone],
      ["Verificación funcional", draft.finalTest],
      ["Condición de entrega", results[draft.result]],
      ["Recomendaciones", draft.recommendations],
      [
        "Registros adicionales",
        `${draft.parts.length} conceptos de refacciones · ${draft.evidence.length} fotografías · ${draft.findings.length} trabajos detectados`,
      ],
    ];
    $("#hc-dialog").innerHTML =
      `<div class="hc-guided-review"><div class="hc-guided-review-heading"><div><div class="hc-kicker">VERIFICACIÓN FINAL</div><h2>Revisión de la orden</h2></div>${btn("✕", "close-dialog", "", 'aria-label="Cerrar revisión"')}</div><p>Verifica que la información refleje el servicio realizado. El reporte conservará su formato técnico.</p><dl>${summary.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value || "Sin registro")}</dd></div>`).join("")}</dl>${guidedReadiness(missing)}<div class="hc-actions">${btn("Volver a editar", "close-dialog")}${!missing.length && draft.status !== "cancelado" ? btn("Confirmar cierre de orden", "complete-order", "primary") : ""}</div></div>`;
    $("#hc-dialog").showModal();
  }
  function editorSimple() {
    nav("services");
    signatures = {};
    step = Math.max(0, Math.min(3, step));
    const requiredChecks = ["preventivo", "mayor"].includes(draft.type);
    const hasReadings = draft.measurements.some(
      (m) =>
        (m.before != null && m.before !== "") ||
        (m.after != null && m.after !== "") ||
        m.conditions,
    );
    $("#hc-main").innerHTML =
      `<header class="hco-heading"><div><div class="hc-kicker">${esc(record?.folio || "NUEVA ORDEN")} / CLIMATIZACIÓN</div><h1>${esc(catalog.types[draft.type])}</h1><div class="hco-order-tags"><span>${orderIcon("bus")}${esc(brandName(draft.brand))}</span><span class="${isExpress() ? "express" : ""}">${orderIcon(isExpress() ? "bolt" : "clock")}${isExpress() ? "Servicio express" : "Atención normal"}</span><span>${esc(record ? catalog.statuses[record.status] : "Por registrar")}</span></div></div>${btn("← Órdenes", "back")}</header>` +
      `<div id="hc-form-error" class="hc-error" role="alert"></div><form id="hc-form" class="hc-simple-form hc-guided-form" novalidate>${guidedNavigation()}<section class="hc-panel hc-section hc-guided-section" data-guided-section="0" aria-label="Recepción"><div class="hc-simple-title"><span class="hco-section-icon">${orderIcon("bus")}</span><div><h2>Recepción y motivo del servicio</h2><p>Identificación de la unidad y descripción de la solicitud.</p></div></div><div class="hc-grid"><label class="hc-field wide"><b>Unidad</b><select name="fleetUnitId" id="hc-unit">${opts(Object.fromEntries(units.map((u) => [u.id, `${u.empresa} · ${u.numero_economico}`])), draft.fleetUnitId, "Unidad externa / captura manual")}</select></label>${draft.fleetUnitId ? `<div class="hc-unit-summary wide"><b>${esc(draft.company)} · ${esc(draft.unit)}</b><span>${esc(draft.model)}</span></div>` : ""}${draft.fleetUnitId ? extraBlock("Editar empresa y económico", `<div class="hc-grid">${field("Empresa / cliente *", "company", "text", 'maxlength="180"')}${field("Número económico *", "unit", "text", 'maxlength="80"')}</div>`) : field("Empresa / cliente *", "company", "text", 'maxlength="180"') + field("Número económico *", "unit", "text", 'maxlength="80"')}${field("Motivo del servicio *", "symptoms", "textarea", 'placeholder="Describe la falla reportada o el servicio solicitado." rows="2"')}</div><div class="hco-suggestions-label">Selecciona un motivo frecuente o escribe el tuyo</div><div class="hc-symptom-chips" aria-label="Motivos frecuentes">${brandCatalog()
        .symptomGuides.filter((g) => g.id !== "otro")
        .map((g) =>
          btn(
            esc(g.label),
            "symptom-chip",
            draft.symptomCode === g.id ? "selected" : "",
            `data-code="${esc(g.id)}" aria-pressed="${draft.symptomCode === g.id}"`,
          ),
        )
        .join(
          "",
        )}</div><input type="hidden" name="symptomCode" value="${esc(draft.symptomCode)}"><div id="hc-unit-context" class="hc-unit-context"></div>
      ${draft.type === "preventivo" ? `<div class="hc-grid hc-plan-row">${select("Plan de mantenimiento", "interval", intervalNames())}${field("Plan acordado con la flota", "planReference")}</div>` : ""}
      ${extraBlock("Fecha, responsable y datos del equipo", `<div class="hc-grid">${field("Fecha del servicio *", "serviceDate", "date")}${field("Técnico responsable *", "technician")}${field("Modelo de unidad", "model")}${field("Equipo de aire acondicionado", "equipment")}${field("Control / display", "control")}${field("Serie del compresor", "compressorSerial")}${field("Chasis", "chassis")}${field("Kilometraje", "mileage", "number")}${field("Base / ubicación", "base")}${field("Número de obra", "workNumber")}${select("Prioridad", "priority", { normal: "Normal", alta: "Alta", urgente: "Urgente" })}</div>`)}
      ${isExpress() ? `<div class="hc-grid hc-plan-row">${select("Tipo de evento express *", "eventKind", catalog.eventKinds)}${field("Ubicación de la atención", "eventLocation")}</div>${extraBlock("Contacto y tiempos del evento (opcional)", `<div class="hc-grid">${field("Contacto", "eventContact")}${field("Aviso", "reportedAt", "datetime-local")}${field("Llegada", "arrivalAt", "datetime-local")}${field("Resolución", "resolvedAt", "datetime-local")}</div>`, !!(draft.eventContact || draft.reportedAt || draft.arrivalAt || draft.resolvedAt))}` : ""}</section>
      <section class="hc-panel hc-section hc-guided-section" data-guided-section="1" aria-label="Diagnóstico"><div class="hc-simple-title"><span class="hco-section-icon">${orderIcon("note")}</span><div><h2>Diagnóstico y revisión</h2><p>${requiredChecks ? "Registra cada punto del alcance de este servicio. Puedes guardar y continuar después." : "Registra los hallazgos. La revisión detallada de componentes es opcional para este servicio."}</p></div></div><div class="hc-grid">${field(["revision", "mayor"].includes(draft.type) ? "Diagnóstico / causa encontrada *" : "Diagnóstico / causa encontrada (opcional)", "diagnosis", "textarea", 'rows="3" placeholder="Indica el componente evaluado, el hallazgo y la causa identificada, si se confirmó."')}</div>
      ${extraBlock(requiredChecks ? 'Lista de mantenimiento y verificación <span id="hc-check-progress"></span>' : 'Agregar revisión de componentes (opcional) <span id="hc-check-progress"></span>', inspectionHTML(), requiredChecks, "hc-review-details")}
      ${extraBlock("Diagnóstico y referencia técnica", `<div class="hc-grid">${field("Códigos observados", "faultCodes")}${field("Referencia técnica / procedimiento / página", "technicalReference")}${field("Alcance y autorización general", "authorization")}</div><div id="hc-symptom-guide">${guideHTML()}</div>`, !!(draft.type === "mayor" || draft.faultCodes || draft.technicalReference || draft.authorization), "hc-diagnostic-details")}
      </section><section class="hc-panel hc-section hc-guided-section" data-guided-section="2" aria-label="Intervención"><div class="hc-simple-title"><span class="hco-section-icon">${orderIcon("service")}</span><div><h2>Intervención técnica</h2><p>Describe las actividades ejecutadas y despliega los registros que correspondan a este trabajo.</p></div></div>${field("Trabajo realizado *", "workDone", "textarea", `rows="4" placeholder="${esc(guidedWorkHint())}"`)}
      ${extraBlock("¿Se realizaron mediciones o se intervino el circuito?", measurementsHTML(), draft.circuitOpened || hasReadings, "hc-measurement-details")}
      ${extraBlock("¿Se utilizaron refacciones o materiales?", `<div id="hc-parts">${partsHTML()}</div>${btn("Buscar refacciones / sugerencias", "pick-parts", "primary")}${btn("+ Concepto manual", "add-part")}<p class="hc-subtle">Importes en MXN. Registro de la orden, sin movimientos automáticos de almacén.</p>`, draft.parts.length > 0, "hc-parts-details")}
      ${extraBlock("¿Se detectaron trabajos adicionales o pendientes?", `<div id="hc-findings">${findingsHTML()}</div>${btn("+ Agregar trabajo detectado", "add-finding")}`, draft.findings.length > 0, "hc-findings-details")}
      <div class="hc-photo-section"><div class="hco-photo-heading"><span class="hco-section-icon">${orderIcon("camera")}</span><div><h3>Evidencia fotográfica</h3><p class="hc-subtle">Documenta el antes, durante y después · Hasta 8 fotos</p></div></div><div class="hc-actions">${btn(orderIcon("camera") + " Tomar foto", "take-photo")}${btn("↑ Elegir fotos", "choose-photos")}</div><div id="hc-evidence" class="hc-evidence">${evidenceHTML()}</div></div></section>
      <section class="hc-panel hc-section hc-guided-section" data-guided-section="3" aria-label="Entrega"><div class="hc-simple-title"><span class="hco-section-icon">${orderIcon("check")}</span><div><h2>Verificación y entrega</h2><p>Pruebas funcionales y condición de entrega de la unidad.</p></div></div><div id="hc-delivery-pending"></div><div class="hc-grid">${field("Prueba realizada y resultado *", "finalTest", "textarea", 'rows="2" placeholder="Describe las pruebas realizadas y los resultados obtenidos."')}${select("Condición de entrega *", "result", results, "Seleccionar al terminar")}${select("Estado de la orden", "status", Object.fromEntries(Object.entries(catalog.statuses).filter(([k]) => k !== "completado")))}</div><div id="hc-result-followup" ${(draft.result && draft.result !== "operativo") || draft.recommendations ? "" : "hidden"}>${field("Pendientes y recomendaciones *", "recommendations", "textarea", 'rows="2"')}</div>
      <div id="hc-cancel-field" ${draft.status === "cancelado" ? "" : "hidden"}>${field("Motivo de cancelación *", "cancelReason")}</div>${extraBlock("Próxima visita y constancia de entrega", `<div class="hc-grid">${field("Próximo servicio", "nextDate", "date")}${field("Representante del cliente", "clientName")}</div>${draft.type === "preventivo" ? btn("Sugerir próxima fecha por periodicidad", "suggest-date") : ""}<div class="hc-grid">${["technicianSignature", "clientSignature"].map((key, i) => `<div class="hc-signature"><label>${i ? "Firma del cliente (opcional)" : "Firma del técnico (opcional)"}</label><canvas data-signature="${key}" aria-label="${i ? "Firma del cliente" : "Firma del técnico"}"></canvas>${btn("Limpiar firma", "clear-signature", "", `data-key="${key}"`)}</div>`).join("")}</div>`, !!(draft.nextDate || draft.clientName || draft.technicianSignature || draft.clientSignature))}<div class="hc-close-readiness" id="hc-close-readiness"></div></section>
      <input id="hc-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden><input id="hc-camera-input" type="file" accept="image/*" capture="environment" hidden><input id="hc-check-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
      <div class="hc-savebar"><div class="hco-save-info"><span class="hco-save-dot" aria-hidden="true"></span><span id="hc-save-state" role="status"></span></div><div class="hc-actions">${btn("←", "step-prev", "hco-previous", 'aria-label="Paso anterior" title="Paso anterior"')}<button type="submit" class="hc-btn" id="hc-save">Guardar avance</button>${btn("Continuar →", "step-next", "primary")}${btn("Revisar cierre", "review-order", "primary")}</div></div></form>`;
    if ($("[name=interval]"))
      $("[name=interval]").dataset.previous = draft.interval;
    renderGuidedStep();
    initSignatures();
    updateProgress();
    storeStatus();
    if (draft.company && draft.unit) loadUnitContext();
  }
  function updateSimpleProgress() {
    const resolved = draft.checklist.filter(
      (c) => c.outcome !== "pendiente",
    ).length;
    if ($("#hc-check-progress"))
      $("#hc-check-progress").textContent = resolved
        ? `${resolved} registrados`
        : "";
    if ($("#hc-check-count"))
      $("#hc-check-count").textContent =
        `${resolved} de ${draft.checklist.length} revisados`;
    const missing = closeMissing();
    $("#hc-close-readiness").innerHTML = guidedReadiness(missing);
    $("#hc-guided-context").textContent =
      `${draft.company || "Empresa por seleccionar"} · Unidad ${draft.unit || "por identificar"}`;
    const pending = draft.findings.filter(
      (f) => !["realizado", "descartado"].includes(f.decision),
    );
    $("#hc-delivery-pending").innerHTML = pending.length
      ? `<div class="hc-note"><b>${pending.length} trabajos pendientes</b><ul>${pending.map((f) => `<li>${esc(f.description || "Trabajo por describir")} · ${esc(decisions[f.decision])}</li>`).join("")}</ul></div>`
      : "";
    $$(".hc-check[data-check]").forEach((el) => {
      const c = draft.checklist.find((c) => c.id === el.dataset.check);
      el.hidden = checkFilter !== "all" && c.outcome !== checkFilter;
      el.classList.toggle("has-finding", c.outcome === "hallazgo");
    });
  }
  function photoDialog(checkId = "") {
    pendingPhotoCheck = checkId;
    $("#hc-dialog").innerHTML =
      `<h2>Agregar evidencia</h2><p>${checkId ? esc(draft.checklist.find((c) => c.id === checkId)?.label || "") : "Elige cómo agregar la foto."}</p><div class="hc-actions">${btn("◉ Tomar foto", "camera-context")}${btn("↑ Elegir fotos", "gallery-context")}${btn("Cancelar", "close-dialog")}</div>`;
    $("#hc-dialog").showModal();
  }
  function stopCamera() {
    if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  async function startCamera() {
    if (
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
    ) {
      $("#hc-dialog").close();
      $("#hc-camera-input").click();
      return;
    }
    $("#hc-dialog").innerHTML =
      `<h2>Tomar foto</h2><p id="hc-camera-status">Solicitando acceso a la cámara…</p><video id="hc-camera-video" autoplay playsinline muted></video><div class="hc-actions">${btn("Capturar foto", "capture-photo", "primary", "disabled")}${btn("Elegir archivo", "gallery-context")}${btn("Cancelar", "close-dialog")}</div>`;
    if (!$("#hc-dialog").open) $("#hc-dialog").showModal();
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "La cámara necesita una conexión segura (HTTPS). Puedes elegir una foto del dispositivo.",
        );
      const video = $("#hc-camera-video");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (!video.isConnected || !$("#hc-dialog").open) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      cameraStream = stream;
      video.srcObject = stream;
      await video.play();
      $("#hc-camera-status").textContent =
        "Encuadra el componente y captura la evidencia.";
      $("[data-action=capture-photo]").disabled = false;
    } catch (e) {
      stopCamera();
      if ($("#hc-camera-status"))
        $("#hc-camera-status").textContent =
          e.name === "NotAllowedError"
            ? "No se autorizó la cámara. Puedes permitirla en tu navegador o elegir una foto."
            : e.name === "NotFoundError"
              ? "No se encontró una cámara. Puedes elegir una foto del dispositivo."
              : e.message;
    }
  }
  async function capturePhoto() {
    const video = $("#hc-camera-video");
    if (!video?.videoWidth) return toast("Espera a que la cámara esté lista.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob)
      throw new Error("No se pudo capturar la foto. Intenta de nuevo.");
    stopCamera();
    $("#hc-dialog").close();
    await photos(
      [new File([blob], `Foto-${Date.now()}.jpg`, { type: "image/jpeg" })],
      pendingPhotoCheck,
    );
  }

  function receptionHTML() {
    const express = draft.type === "express";
    return `<h2>${express ? "¿Qué ocurrió y dónde?" : "Recepción de la unidad"}</h2><div class="hc-grid">
    <label class="hc-field wide"><b>Unidad de Flotas (opcional)</b><select name="fleetUnitId" id="hc-unit">${opts(Object.fromEntries(units.map((u) => [u.id, `${u.empresa} · ${u.numero_economico} · ${u.modelo || ""}`])), draft.fleetUnitId, "Captura manual / unidad externa")}</select></label>
    ${field("Empresa / cliente *", "company", "text", 'maxlength="180" required')}${field("Número económico *", "unit", "text", 'maxlength="80" required')}${field("Fecha del servicio *", "serviceDate", "date", "required")}
    ${express ? select("Tipo de evento *", "eventKind", catalog.eventKinds) + field("Ubicación de la atención *", "eventLocation") + field("Contacto / teléfono", "eventContact") : field("Base / ubicación", "base")}
    ${field("Técnico responsable", "technician")}${select("Prioridad", "priority", { normal: "Normal", alta: "Alta", urgente: "Urgente" })}
    ${draft.type === "preventivo" ? select("Periodicidad", "interval", { mensual: "Mensual", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual", bianual: "Cada 2 años" }) + field("Plan acordado con la flota", "planReference") : ""}
    ${select("Síntoma principal", "symptomCode", Object.fromEntries(catalog.symptomGuides.map((g) => [g.id, g.label])), "Seleccionar síntoma")}${field(express ? "Evento / motivo de urgencia *" : "Motivo y antecedentes", "symptoms", "textarea")}
    </div><div id="hc-symptom-guide">${guideHTML()}</div><div id="hc-unit-context" class="hc-unit-context"></div>
    <details class="hc-extra-fields" ${["preventivo", "mayor"].includes(draft.type) ? "open" : ""}><summary>Datos del equipo y antecedentes ${express ? "(opcional)" : ""}</summary><div class="hc-grid">${field("Modelo de unidad", "model")}${field("Chasis", "chassis")}${field("Número de obra", "workNumber")}${field("Kilometraje", "mileage", "number")}${field("Equipo de aire acondicionado", "equipment")}${field("Control / display", "control")}${field("Serie del compresor", "compressorSerial")}${field("Códigos observados antes de borrar", "faultCodes", "textarea")}</div></details>
    ${express ? `<details class="hc-extra-fields"><summary>Tiempos de atención (hora local, opcional)</summary><div class="hc-grid">${field("Aviso", "reportedAt", "datetime-local")}${field("Llegada", "arrivalAt", "datetime-local")}${field("Resolución", "resolvedAt", "datetime-local")}</div></details>` : ""}`;
  }
  function guideHTML() {
    const guide = brandCatalog().symptomGuides.find(
      (g) => g.id === draft.symptomCode,
    );
    if (!guide) return "";
    return `<div class="hc-guide"><div><b>Apoyo al diagnóstico · ${esc(guide.label)}</b>${sourceButton(guide.source)}</div><ol>${guide.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><small>Puntos de inspección; confirma valores y procedimiento según el equipo.</small></div>`;
  }
  async function loadUnitContext() {
    const target = $("#hc-unit-context");
    if (!target) return;
    const company = draft.company,
      unit = draft.unit;
    target.textContent = "Consultando antecedentes…";
    try {
      const r = await api("/history?" + new URLSearchParams({ company, unit }));
      if (
        !draft ||
        draft.company !== company ||
        draft.unit !== unit ||
        !target.isConnected
      )
        return;
      target.innerHTML = `<div><b>${r.summary.total} servicios registrados para esta unidad</b><span>Última intervención: ${r.items[0] ? fmt(r.items[0].serviceDate) + " · " + catalog.types[r.items[0].type] : "Sin historial"} · Próximo: ${fmt(r.next[0]?.nextDate)}</span>${r.recurring.length ? `<small>Síntomas repetidos: ${r.recurring.map((f) => esc(brandCatalog(f.brand || "hispacold").symptomGuides.find((g) => g.id === f.code)?.label || f.code) + " (" + f.total + ")").join(", ")}</small>` : ""}</div>${btn("Ver expediente", "unit-history")}${isV3() && !record && r.items.find((i) => (i.brand || "hispacold") === draft.brand) ? btn("Reutilizar datos del equipo", "reuse-equipment", "", `data-id="${esc(r.items.find((i) => (i.brand || "hispacold") === draft.brand).id)}"`) : ""}`;
    } catch (e) {
      if (target.isConnected)
        target.textContent =
          "No se pudo consultar el historial. Puedes continuar con la captura.";
    }
  }
  function inspectionHTML() {
    return `<h2>${draft.type === "express" ? "Validación express" : "Lista de revisión"}</h2><div id="hc-period-scope">${periodScopeHTML()}</div><div class="hc-check-toolbar"><span id="hc-check-count"></span><label>Mostrar <select id="hc-check-filter">${opts({ all: "Todos", pendiente: "Pendientes", hallazgo: "Hallazgos" }, checkFilter)}</select></label></div><div id="hc-checks">${checksHTML()}</div>`;
  }
  function periodScopeHTML() {
    if (!isV3() || draft.type !== "preventivo") return "";
    const plan = brandCatalog().periodicPlan;
    if (draft.maintenancePlan !== plan?.id)
      return '<p class="hc-note">Esta orden conserva el plan anterior porque ya tiene revisiones registradas. Las órdenes nuevas usan las listas específicas por periodo.</p>';
    const period = plan.periods[draft.interval];
    return period
      ? `<div class="hc-note"><b>${esc(intervalNames()[draft.interval])} · ${draft.checklist.length} actividades del periodo</b><p>${esc(period.name)} · ${sourceButton(period.source)}</p><details><summary>Alcance y referencia del plan</summary><p>${esc(period.note)}</p></details></div>`
      : '<p class="hc-note">Selecciona el periodo para cargar sus actividades.</p>';
  }
  function checksHTML() {
    return [...new Set(draft.checklist.map((c) => c.group))]
      .map(
        (group) =>
          `<details class="hc-check-group" open><summary>${esc(group)}</summary>${draft.checklist
            .filter((c) => c.group === group)
            .map(
              (c) =>
                `<div class="hc-check" data-check="${c.id}" ${checkFilter !== "all" && c.outcome !== checkFilter ? "hidden" : ""}><div><b>${esc(c.label)}</b><small>${draft.type === "preventivo" && c.actions?.[draft.interval] ? `${draft.maintenancePlan ? "Actividad prevista" : draft.brand === "eberspaecher" ? "Plan AC-188DD" : "Plan B2"}: ${esc(c.actions[draft.interval])} · ` : ""}${sourceButton(c.source)}</small><button type="button" class="hc-photo-link" data-action="check-photo" data-check="${c.id}">+ Foto <span data-photo-count="${c.id}">${draft.evidence.filter((p) => p.checkId === c.id).length || ""}</span></button></div><label>Acción<select name="action:${c.id}">${opts(actionNames, c.action)}</select></label><label>Resultado<select name="outcome:${c.id}">${opts(outcomes, c.outcome)}</select></label><label>Observaciones<input name="notes:${c.id}" value="${esc(c.notes)}" maxlength="2000" placeholder="${["hallazgo", "no_aplica"].includes(c.outcome) ? "Escribe el motivo" : "Observación o trabajo realizado"}"></label></div>`,
            )
            .join("")}</details>`,
      )
      .join("");
  }
  function measurementsHTML() {
    return `<h2>Mediciones antes y después</h2><p class="hc-subtle">Registra condiciones de prueba. No se asignan valores de aceptación universales.</p><div class="hc-table-wrap"><table><thead><tr><th>Medición</th><th>Antes</th><th>Después</th><th>Condiciones</th></tr></thead><tbody>${draft.measurements.map((m) => `<tr><td>${esc(m.label)}<small>${esc(m.unit)}</small></td><td><input aria-label="${esc(m.label)} antes" type="number" step="any" name="before:${m.id}" value="${esc(m.before)}"></td><td><input aria-label="${esc(m.label)} después" type="number" step="any" name="after:${m.id}" value="${esc(m.after)}"></td><td><input aria-label="Condiciones ${esc(m.label)}" name="conditions:${m.id}" value="${esc(m.conditions)}" maxlength="500"></td></tr>`).join("")}</tbody></table></div><h3>Circuito frigorífico</h3><label class="hc-toggle"><input type="checkbox" name="circuitOpened" ${draft.circuitOpened ? "checked" : ""}> Se abrió o intervino el circuito frigorífico</label><div class="hc-circuit-fields" ${draft.circuitOpened ? "" : "hidden"}><div class="hc-grid">${field("Refrigerante", "refrigerant")}${field("Recuperado (kg)", "recoveredKg", "number")}${field("Cargado (kg)", "chargedKg", "number")}${field("Tipo de aceite", "oilType")}${field("Añadido (ml)", "oilMl", "number")}${field("Vacío (micrones)", "vacuumMicrons", "number")}${field("Prueba de vacío (minutos)", "vacuumMinutes", "number")}${field("Prueba de hermeticidad, estabilidad y observaciones", "refrigerantNotes", "textarea")}</div></div>`;
  }
  function workHTML() {
    return `<h2>${draft.type === "express" ? "Atención realizada" : draft.type === "revision" ? "Diagnóstico de la revisión" : "Diagnóstico e intervención"}</h2><div class="hc-grid">${field("Diagnóstico / causa encontrada *", "diagnosis", "textarea")}${field(draft.type === "express" ? "Solución o atención realizada *" : "Trabajo realizado *", "workDone", "textarea")}${field("Alcance y autorización general", "authorization")}${field("Referencia técnica / procedimiento / página", "technicalReference")}</div>
    ${["express", "menor"].includes(draft.type) ? `<div class="hc-inline-inspection">${inspectionHTML()}</div>` : ""}
    <h3>Detectado · autorizado · realizado</h3><p class="hc-subtle">Registra cada trabajo adicional y su decisión. Los pendientes se muestran en la entrega.</p><div id="hc-findings">${findingsHTML()}</div>${btn("+ Agregar trabajo detectado", "add-finding")}
    ${draft.type !== "mayor" ? `<details class="hc-extra-fields" ${draft.circuitOpened ? "open" : ""}><summary>Mediciones e intervención en circuito (cuando aplique)</summary>${measurementsHTML()}</details>` : ""}
    <details class="hc-extra-fields" ${draft.parts.length ? "open" : ""}><summary>Refacciones, materiales y mano de obra</summary><p class="hc-subtle">Registro en MXN, sin cálculo fiscal ni movimientos automáticos en Stock o Cobranza.</p><div id="hc-parts">${partsHTML()}</div>${btn("Buscar refacciones / sugerencias", "pick-parts", "primary")}${btn("+ Concepto manual", "add-part")}</details>
    <h3>Fotos antes, durante y después</h3><label class="hc-field"><b>Agregar fotografías (hasta 8)</b><input id="hc-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div id="hc-evidence" class="hc-evidence">${evidenceHTML()}</div>`;
  }
  function findingsHTML() {
    return (
      draft.findings
        .map(
          (f, i) =>
            `<div class="hc-finding"><div class="hc-grid"><label class="hc-field wide"><b>Trabajo detectado ${i + 1}</b><textarea name="finding-description:${i}" maxlength="1500">${esc(f.description)}</textarea></label><label class="hc-field"><b>Decisión / avance</b><select name="finding-decision:${i}">${opts(decisions, f.decision)}</select></label><label class="hc-field"><b>Autorizado por</b><input name="finding-authorizedBy:${i}" value="${esc(f.authorizedBy)}" maxlength="200"></label><label class="hc-field wide"><b>Trabajo realizado o motivo de la decisión</b><input name="finding-notes:${i}" value="${esc(f.notes)}" maxlength="2000"></label></div>${btn("Quitar", "remove-finding", "", `data-index="${i}"`)}</div>`,
        )
        .join("") ||
      '<p class="hc-subtle">Sin trabajos adicionales registrados.</p>'
    );
  }
  function partsHTML() {
    return `<div class="hc-table-wrap"><table><thead><tr><th>Tipo / concepto</th><th>Referencia</th><th>Cantidad</th><th>Precio unitario</th><th></th></tr></thead><tbody>${draft.parts.map((p, i) => `<tr><td><select aria-label="Tipo de concepto ${i + 1}" name="kind:${i}">${opts({ refaccion: "Refacción", material: "Material", mano_obra: "Mano de obra" }, p.kind || "refaccion")}</select><input aria-label="Concepto ${i + 1}" name="description:${i}" value="${esc(p.description)}" maxlength="300"></td><td><input aria-label="Referencia ${i + 1}" name="reference:${i}" value="${esc(p.reference)}" maxlength="120">${p.officialKey ? '<small class="hc-part-origin">Referencia documental Hispacold</small>' : ""}</td><td><input aria-label="Cantidad ${i + 1}" name="quantity:${i}" type="number" min="0.001" step="any" value="${esc(p.quantity)}"></td><td><input aria-label="Precio ${i + 1}" name="unitPrice:${i}" type="number" min="0" step="0.01" value="${esc(p.unitPrice)}"></td><td>${btn("Quitar", "remove-part", "", `data-index="${i}"`)}</td></tr>`).join("")}</tbody></table></div><div id="hc-parts-total" class="hc-money">Total: ${money(draft.parts.reduce((n, p) => n + (Number(p.quantity) || 0) * (Number(p.unitPrice) || 0), 0))}</div>`;
  }
  function evidenceHTML() {
    return draft.evidence
      .map(
        (p, i) =>
          `<div class="hc-photo"><img src="${esc(p.data)}" alt="${esc(p.caption || p.name)}"><div class="hc-photo-tags"><label>Etapa<select name="photo-phase:${i}" aria-label="Etapa foto ${i + 1}">${opts(phases, p.phase)}</select></label><label>Componente<select name="photo-component:${i}" aria-label="Componente foto ${i + 1}">${opts(components, p.component)}</select></label></div><input name="photo-caption:${i}" aria-label="Descripción foto ${i + 1}" maxlength="300" value="${esc(p.caption)}" placeholder="Descripción de la evidencia"><select name="photo-checkId:${i}" aria-label="Punto de revisión foto ${i + 1}">${opts(Object.fromEntries(draft.checklist.map((c) => [c.id, c.label])), p.checkId, "Sin punto asociado")}</select>${btn("Quitar foto", "remove-photo", "", `data-index="${i}"`)}</div>`,
      )
      .join("");
  }
  function deliveryHTML() {
    const open = draft.findings.filter(
      (f) => !["realizado", "descartado"].includes(f.decision),
    );
    return `<h2>Prueba final y entrega</h2><div id="hc-delivery-pending">${open.length ? `<div class="hc-note"><b>${open.length} trabajos sin completar o sin autorizar</b><ul>${open.map((f) => `<li>${esc(f.description)} · ${esc(decisions[f.decision])}</li>`).join("")}</ul></div>` : ""}</div><div class="hc-grid">${field("Prueba funcional y resultado *", "finalTest", "textarea")}${select("Condición de entrega *", "result", results, "Seleccionar resultado")}${field("Representante del cliente", "clientName")}${field("Próximo servicio", "nextDate", "date")}${field("Recomendaciones y pendientes de entrega", "recommendations", "textarea")}${select("Estado de la orden", "status", catalog.statuses)}<div id="hc-cancel-field" class="hc-field wide" ${draft.status === "cancelado" ? "" : "hidden"}>${field("Motivo de cancelación *", "cancelReason")}</div>${draft.reopenReason ? field("Motivo de reapertura", "reopenReason") : ""}</div>
    ${draft.type === "preventivo" ? `<p>${btn("Sugerir próxima fecha por periodicidad", "suggest-date")} <span class="hc-subtle">Puedes ajustar la fecha al plan de la unidad.</span></p>` : ""}
    <div class="hc-close-readiness" id="hc-close-readiness"></div><details class="hc-extra-fields" ${draft.technicianSignature || draft.clientSignature ? "open" : ""}><summary>Firmas de entrega (opcional)</summary><div class="hc-grid">${["technicianSignature", "clientSignature"].map((key, i) => `<div class="hc-signature"><label>${i ? "Firma del representante del cliente" : "Firma del técnico"}</label><canvas data-signature="${key}" aria-label="${i ? "Firma del cliente" : "Firma del técnico"}"></canvas>${btn("Limpiar firma", "clear-signature", "", `data-key="${key}"`)}</div>`).join("")}</div></details>`;
  }
  function closeMissing() {
    const d = draft,
      missing = [];
    for (const [key, label] of [
      ["company", "Empresa"],
      ["unit", "Unidad"],
      ["serviceDate", "Fecha"],
      ["technician", "Técnico"],
      ...(!isV3() || ["revision", "mayor"].includes(d.type)
        ? [["diagnosis", "Diagnóstico"]]
        : []),
      ["workDone", "Trabajo realizado"],
      ["finalTest", "Prueba final"],
      ["result", "Condición de entrega"],
    ])
      if (!String(d[key] ?? "").trim()) missing.push(label);
    if (!isV3() && d.type === "express")
      for (const [key, label] of [
        ["eventKind", "Tipo de evento"],
        ["eventLocation", "Ubicación"],
        ["symptoms", "Motivo del evento"],
      ])
        if (!d[key]) missing.push(label);
    if (isV3() && !d.symptoms?.trim()) missing.push("Motivo del servicio");
    if (isV3() && isExpress() && !d.eventKind) missing.push("Tipo de evento");
    if (isV3() && d.type === "preventivo" && !d.interval)
      missing.push("Periodicidad");
    const pending = d.checklist.filter((c) => c.outcome === "pendiente").length;
    if (pending && (!isV3() || ["preventivo", "mayor"].includes(d.type)))
      missing.push(`${pending} puntos de revisión pendientes`);
    if (
      d.checklist.some(
        (c) =>
          ["hallazgo", "no_aplica"].includes(c.outcome) && !c.notes?.trim(),
      )
    )
      missing.push("Motivo de hallazgos / no aplica");
    if (d.type === "mayor" && (!d.authorization || !d.technicalReference))
      missing.push("Autorización y referencia técnica");
    if (
      d.circuitOpened &&
      (!d.technicalReference ||
        !d.refrigerant ||
        d.chargedKg == null ||
        d.chargedKg === "" ||
        !d.refrigerantNotes)
    )
      missing.push("Datos de intervención del circuito");
    if (
      d.result === "operativo" &&
      (d.checklist.some((c) => c.outcome === "hallazgo") ||
        d.findings.some(
          (f) => !["realizado", "descartado"].includes(f.decision),
        ))
    )
      missing.push("Resolver pendientes o entregar con observaciones");
    if (d.result && d.result !== "operativo" && !d.recommendations)
      missing.push("Recomendaciones de entrega");
    if (
      d.findings.some(
        (f) =>
          ["autorizado", "realizado"].includes(f.decision) &&
          !f.authorizedBy?.trim(),
      )
    )
      missing.push("Persona que autorizó los trabajos");
    return missing;
  }
  function updateProgress() {
    if (!draft || !$("#hc-form")) return;
    readForm();
    if (isV3()) return updateSimpleProgress();
    const steps = stepSets[draft.type],
      resolved = draft.checklist.filter(
        (c) => c.outcome !== "pendiente",
      ).length;
    const state = {
      reception: !!(
        draft.company &&
        draft.unit &&
        draft.serviceDate &&
        (draft.type !== "express" ||
          (draft.eventKind && draft.eventLocation && draft.symptoms))
      ),
      inspection: resolved === draft.checklist.length,
      measurements:
        !draft.circuitOpened ||
        !!(
          draft.technicalReference &&
          draft.refrigerant &&
          draft.chargedKg !== "" &&
          draft.chargedKg != null &&
          draft.refrigerantNotes
        ),
      work: !!(
        draft.diagnosis &&
        draft.workDone &&
        (!["express", "menor"].includes(draft.type) ||
          resolved === draft.checklist.length)
      ),
      delivery: !!(draft.finalTest && draft.result && draft.technician),
    };
    const done = steps.filter(([id]) => state[id]).length;
    $("#hc-progress-label").textContent =
      `Paso ${step + 1} de ${steps.length} · ${done} ${done === 1 ? "paso" : "pasos"} con datos completos`;
    $("#hc-progress").value = Math.round((done / steps.length) * 100);
    $("#hc-check-progress").textContent =
      `${resolved} / ${draft.checklist.length} puntos revisados`;
    $$("[data-state]").forEach(
      (el) => (el.textContent = state[el.dataset.state] ? " ✓" : ""),
    );
    if ($("#hc-check-count"))
      $("#hc-check-count").textContent =
        `${resolved} de ${draft.checklist.length} revisados`;
    const missing = closeMissing();
    $("#hc-close-readiness").innerHTML = missing.length
      ? `<b>Para completar la orden falta:</b><p>${missing.map(esc).join(" · ")}</p>`
      : "<b>Lista para completar</b><p>Los campos requeridos están capturados. Revisa la información y selecciona Completado para cerrar.</p>";
    $$("[data-check]")
      .filter((el) => el.classList.contains("hc-check"))
      .forEach((el) => {
        const c = draft.checklist.find((c) => c.id === el.dataset.check);
        el.hidden = checkFilter !== "all" && c.outcome !== checkFilter;
        el.classList.toggle("has-finding", c.outcome === "hallazgo");
      });
  }
  function setStep(n) {
    if (isV3()) {
      readForm();
      step = Math.max(0, Math.min(3, n));
      renderGuidedStep();
      initSignatures();
      updateProgress();
      markDirty();
      const section = $(`[data-guided-section="${step}"]`);
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      section.querySelector("h2").focus({ preventScroll: true });
      return;
    }
    readForm();
    step = Math.max(0, Math.min(stepSets[draft.type].length - 1, n));
    $$(".hc-step").forEach(
      (el) => (el.hidden = Number(el.dataset.section) !== step),
    );
    $$("[data-step]").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.step) === step);
      el.setAttribute(
        "aria-selected",
        String(Number(el.dataset.step) === step),
      );
    });
    $("[data-action=step-prev]").disabled = step === 0;
    $("[data-action=step-next]").disabled =
      step === stepSets[draft.type].length - 1;
    if (stepSets[draft.type][step][0] === "delivery") {
      const open = draft.findings.filter(
        (f) => !["realizado", "descartado"].includes(f.decision),
      );
      $("#hc-delivery-pending").innerHTML = open.length
        ? `<div class="hc-note"><b>${open.length} trabajos pendientes</b><ul>${open.map((f) => `<li>${esc(f.description)} · ${esc(decisions[f.decision])}</li>`).join("")}</ul></div>`
        : "";
    }
    initSignatures();
    updateProgress();
    persistDraft();
    $(".hc-steps").scrollIntoView({ behavior: "smooth", block: "start" });
    $$("[data-step]")[step].scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }
  function initSignatures() {
    $$("canvas[data-signature]").forEach((canvas) => {
      const key = canvas.dataset.signature;
      if (signatures[key] || !canvas.clientWidth) return;
      const ratio = devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = 120 * ratio;
      const ctx = canvas.getContext("2d");
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#132d40";
      const s = { canvas, has: !!draft[key], dirty: false };
      signatures[key] = s;
      let down = false;
      if (draft[key]) {
        const img = new Image();
        img.onload = () => {
          if (!s.dirty) ctx.drawImage(img, 0, 0, canvas.clientWidth, 120);
        };
        img.src = draft[key];
      }
      const point = (e) => {
        const r = canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      };
      canvas.onpointerdown = (e) => {
        if (saving) return;
        down = true;
        s.has = true;
        s.dirty = true;
        canvas.setPointerCapture(e.pointerId);
        ctx.beginPath();
        ctx.moveTo(...point(e));
      };
      canvas.onpointermove = (e) => {
        if (down) {
          ctx.lineTo(...point(e));
          ctx.stroke();
        }
      };
      canvas.onpointerup = canvas.onpointercancel = () => {
        if (down) {
          down = false;
          markDirty();
        }
      };
    });
  }
  async function save() {
    if (saving || photoProcessing) return;
    readForm();
    if (isV3()) {
      const required = ["Empresa", "Unidad", "Fecha"].find((label) =>
        closeMissing().includes(label),
      );
      if (required) {
        focusGuidedIssue(required);
        error("Para guardar el avance, completa: " + required + ".");
        return;
      }
    }
    if (draft.status === "completado") {
      const missing = closeMissing();
      if (missing.length) {
        error("Para completar: " + missing.join(" · "));
        return;
      }
    }
    await persistDraft();
    saving = true;
    $("#hc-form-error").textContent = "";
    $$(
      "#hc-form input,#hc-form select,#hc-form textarea,#hc-form button",
    ).forEach((el) => (el.disabled = true));
    try {
      const r = await api(record ? "/services/" + record.id : "/services", {
        method: record ? "PUT" : "POST",
        body: JSON.stringify({
          data: draft,
          version: record?.version,
          clientKey: localId,
        }),
      });
      if (r.replayed) {
        record = {
          id: r.id,
          folio: r.folio,
          version: r.version,
          status: r.status,
        };
        dirty = true;
        change++;
        await HCDrafts.put(catalog.user.id, localId, {
          data: draft,
          record,
          step,
        });
        storedChange = change;
        editor();
        error(
          "Este borrador ya creó " +
            r.folio +
            ". Conservamos tu captura local. Revisa y vuelve a guardar para actualizar esa orden, sin duplicarla.",
        );
        return;
      }
      clearTimeout(storeTimer);
      await storeQueue;
      try {
        await HCDrafts.remove(catalog.user.id, localId);
      } catch (e) {
        toast("Orden guardada. No se pudo retirar el borrador local.");
      }
      dirty = false;
      change = storedChange = 0;
      record = r;
      draft = normalizeData(r.data);
      localId = "order-" + r.id + "-" + editorSession;
      storageError = "";
      if (["completado", "cancelado"].includes(r.status)) {
        record = await api("/services/" + r.id);
        draft = null;
        detail(record);
      } else editor();
      toast("Orden " + r.folio + " guardada en Carlab.");
    } catch (e) {
      error(
        e.message +
          (e.status === 409 ? " Tu borrador local sigue protegido." : ""),
      );
      if (e.status === 409 && $("#hc-form-error"))
        $("#hc-form-error").insertAdjacentHTML(
          "beforeend",
          "<br>" + btn("Cargar versión de Carlab", "reload-order"),
        );
    } finally {
      saving = false;
      $$(
        "#hc-form input,#hc-form select,#hc-form textarea,#hc-form button",
      ).forEach((el) => (el.disabled = false));
      if (draft && $("#hc-form")) {
        setNavigationDisabled();
        storeStatus();
      }
    }
  }
  function setNavigationDisabled() {
    if (isV3()) {
      renderGuidedStep();
      return;
    }
    if ($("[data-action=step-prev]"))
      $("[data-action=step-prev]").disabled = step === 0;
    if ($("[data-action=step-next]"))
      $("[data-action=step-next]").disabled =
        step === stepSets[draft.type].length - 1;
  }
  async function open(id) {
    if (!(await leave())) return;
    window.ACOperations?.deactivate();
    const r = await api("/services/" + id);
    await resetEditor();
    record = r;
    nav("services");
    detail(r);
  }
  function reportHTML(r) {
    const d = r.data;
    const displayChecks =
      Number(d.formVersion) === 3 && !["preventivo", "mayor"].includes(d.type)
        ? d.checklist.filter(
            (c) =>
              c.outcome !== "pendiente" ||
              c.notes ||
              c.action ||
              d.evidence.some((p) => p.checkId === c.id),
          )
        : d.checklist;
    const kv = (label, v) =>
      v !== null && v !== undefined && v !== ""
        ? `<div><small>${esc(label)}</small>${esc(v)}</div>`
        : "";
    const section = (title, text) =>
      text ? `<h2>${esc(title)}</h2><p>${esc(text)}</p>` : "";
    const nonempty = d.measurements.filter(
      (m) =>
        (m.before != null && m.before !== "") ||
        (m.after != null && m.after !== "") ||
        m.conditions,
    );
    return `<article class="hc-report"><div class="hc-print-header"><div><div class="hc-kicker">CARLAB / ${esc(brandName(d.brand))}</div><h1>${esc(r.folio)}</h1><p>${esc(catalog.types[d.type])} · ${isExpress(d) ? "Express" : "Normal"} · ${fmt(d.serviceDate)}</p></div><div>${badge(d.status)}<p>Versión ${r.version}</p></div></div><div class="hc-report-result ${esc(d.result)}"><b>${esc(results[d.result] || "Entrega pendiente")}</b><span>${esc(d.company)} · Unidad ${esc(d.unit)}</span></div><h2>Identificación</h2><div class="hc-grid">${[
      ["Empresa", d.company],
      ["Unidad", d.unit],
      ["Técnico", d.technician],
      ["Modelo", d.model],
      ["Equipo", d.equipment],
      ["Serie compresor", d.compressorSerial],
      ["Chasis", d.chassis],
      ["Control", d.control],
      ["Obra", d.workNumber],
      ["Base", d.base],
      ["Kilometraje", d.mileage],
      ["Próximo servicio", d.nextDate ? fmt(d.nextDate) : ""],
      ["Evento", catalog.eventKinds[d.eventKind]],
      ["Ubicación", d.eventLocation],
      ["Contacto", d.eventContact],
    ]
      .map(([k, v]) => kv(k, v))
      .join("")}</div>
      ${section("Recepción y motivo del servicio", d.symptoms)}${section("Diagnóstico técnico", d.diagnosis)}${section("Intervención realizada", d.workDone)}${section("Verificación funcional y entrega", d.finalTest)}${section("Recomendaciones y pendientes", d.recommendations)}
      ${(d.findings || []).length ? `<h2>Detectado, autorizado y realizado</h2><div class="hc-table-wrap"><table><thead><tr><th>Trabajo</th><th>Decisión</th><th>Autorizado por</th><th>Observaciones</th></tr></thead><tbody>${d.findings.map((f) => `<tr><td>${esc(f.description)}</td><td>${esc(decisions[f.decision])}</td><td>${esc(f.authorizedBy)}</td><td>${esc(f.notes)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${displayChecks.length ? `<h2>Lista de revisión</h2><div class="hc-table-wrap"><table><thead><tr><th>Punto</th><th>Acción</th><th>Resultado</th><th>Observación / referencia</th></tr></thead><tbody>${displayChecks.map((c) => `<tr><td>${esc(c.group)} · ${esc(c.label)}</td><td>${esc(c.action || "—")}</td><td>${esc(outcomes[c.outcome])}</td><td>${esc(c.notes)}<br>${sourceButton(c.source)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${nonempty.length ? `<h2>Mediciones</h2><div class="hc-table-wrap"><table><thead><tr><th>Lectura</th><th>Antes</th><th>Después</th><th>Condiciones</th></tr></thead><tbody>${nonempty.map((m) => `<tr><td>${esc(m.label)} (${esc(m.unit)})</td><td>${esc(m.before ?? "—")}</td><td>${esc(m.after ?? "—")}</td><td>${esc(m.conditions)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${
        d.circuitOpened
          ? `<h2>Circuito frigorífico</h2><div class="hc-grid">${[
              ["Refrigerante", d.refrigerant],
              ["Recuperado kg", d.recoveredKg],
              ["Cargado kg", d.chargedKg],
              ["Aceite", d.oilType],
              ["Añadido ml", d.oilMl],
              ["Vacío micrones", d.vacuumMicrons],
              ["Prueba min", d.vacuumMinutes],
            ]
              .map(([k, v]) => kv(k, v))
              .join(
                "",
              )}</div>${section("Comprobaciones del circuito", d.refrigerantNotes)}`
          : ""
      }
      ${section("Referencia técnica", d.technicalReference)}${section("Autorización general", d.authorization)}${section("Códigos observados", d.faultCodes)}${section("Plan acordado", d.planReference)}
      ${d.parts.length ? `<h2>Refacciones, materiales y mano de obra</h2><div class="hc-table-wrap"><table><thead><tr><th>Concepto</th><th>Referencia</th><th>Cantidad</th><th>Importe</th></tr></thead><tbody>${d.parts.map((p) => `<tr><td>${esc(p.description)}</td><td>${esc(p.reference)}</td><td>${p.quantity}</td><td>${money(p.total)}</td></tr>`).join("")}</tbody></table></div><div class="hc-money">Total registrado: ${money(d.total)}</div><p class="hc-subtle">Importes en MXN, sin cálculo fiscal.</p>` : ""}
      ${Object.entries(phases)
        .map(([phase, title]) => {
          const photos = d.evidence.filter(
            (p) => (p.phase || "sin_clasificar") === phase,
          );
          return photos.length
            ? `<h2>Fotos · ${title}</h2><div class="hc-report-photos">${photos.map((p) => `<figure><img src="${esc(p.data)}" alt="${esc(p.caption || p.name)}"><figcaption><b>${esc(components[p.component] || "")}</b> ${esc(p.caption || p.name)}${p.checkId ? "<br>" + esc(d.checklist.find((c) => c.id === p.checkId)?.label || "") : ""}</figcaption></figure>`).join("")}</div>`
            : "";
        })
        .join("")}
      ${
        d.technician ||
        d.clientName ||
        d.technicianSignature ||
        d.clientSignature
          ? `<h2>Constancia de entrega</h2><div class="hc-grid">${[
              ["Técnico", d.technician, d.technicianSignature],
              ["Cliente", d.clientName, d.clientSignature],
            ]
              .filter(([, name, img]) => name || img)
              .map(
                ([label, name, img]) =>
                  `<div><small>${label}</small><p>${esc(name)}</p>${img ? `<img class="signature-img" src="${esc(img)}" alt="Firma ${label}">` : '<p class="hc-subtle">Sin firma capturada</p>'}</div>`,
              )
              .join("")}</div>`
          : ""
      }
      ${section("Motivo de cancelación", d.cancelReason)}${section("Motivo de reapertura", d.reopenReason)}
      <h2>Bitácora de cambios</h2><div class="hc-timeline">${(r.events || []).map((e) => `<div class="hc-event"><b>${esc(e.actor_name)}</b> · ${new Date(e.created_at).toLocaleString("es-MX")}<small>Versión ${e.details.version} · ${esc({ eliminacion: "Enviada a papelera", restauracion: "Restaurada", eliminar: "Enviada a papelera", restaurar: "Restaurada", delete: "Enviada a papelera", restore: "Restaurada" }[e.action] || catalog.statuses[e.details.to] || e.details.to || e.action)}${e.details.reason ? " · " + esc(e.details.reason) : ""}</small></div>`).join("")}</div>${d.sourceOrderId ? `<p class="hc-no-print">${btn("Ver orden de origen", "open", "", `data-id="${esc(d.sourceOrderId)}"`)}</p>` : ""}</article>`;
  }
  function detail(r) {
    const closed = ["completado", "cancelado"].includes(r.status);
    $("#hc-main").innerHTML =
      heading(
        "EXPEDIENTE DE CLIMATIZACIÓN",
        r.folio,
        `${r.company} · Unidad ${r.unit} · ${brandName(r.data.brand)}`,
        btn("← Órdenes", "back") +
          btn("↓ Descargar PDF", "pdf", "primary") +
          (r.deletedAt
            ? btn("Recuperar orden", "restore-order")
            : btn(
                closed ? "Reabrir orden" : "Continuar atención",
                closed ? "reopen" : "edit",
              )) +
          (!r.deletedAt
            ? btn("Eliminar orden", "delete-order", "hc-danger")
            : ""),
      ) +
      (r.deletedAt
        ? `<div class="hc-note"><b>Orden en papelera</b><p>${esc(r.deleteReason || "")} · ${fmt(r.deletedAt)}</p></div>`
        : "") +
      `<details class="hc-more-actions"><summary>Más opciones</summary><div class="hc-actions">${btn("Expediente de unidad", "record-history")}${!r.deletedAt ? btn("Nuevo servicio de esta unidad", "new-from-record") : ""}${btn("↓ JSON", "json")}</div></details>` +
      reportHTML(r);
  }
  function library() {
    $("#hc-main").innerHTML =
      heading(
        "DOCUMENTACIÓN / CONSULTA",
        "Biblioteca de climatización",
        `${catalog.manuals.length} manuales, diagramas y referencias para el taller.`,
        btn("↑ Importar manuales", "import", "primary"),
      ) +
      `<input id="hc-manual-input" type="file" accept="application/pdf,.pdf" multiple hidden><div class="hc-note">Selecciona los PDF originales de las carpetas Hispacold y VOLVO para guardarlos en la biblioteca privada. Se identifica cada archivo por su contenido. <span id="hc-import-progress" role="status"></span></div><div class="hc-filters"><input id="hc-manual-search" type="search" aria-label="Buscar manuales" placeholder="Buscar manual, equipo, diagrama…"><select id="hc-manual-brand" aria-label="Marca de manual">${opts(catalog.brands, "", "Todas las marcas")}</select><select id="hc-manual-category" aria-label="Categoría">${opts(Object.fromEntries([...new Set(catalog.manuals.map((m) => m.category))].map((x) => [x, x])), "", "Todas las categorías")}</select></div><br><div id="hc-manual-list" class="hc-library"></div><br><div class="hc-note" id="hc-library-notices"></div>`;
    manualCards();
  }
  function manualCards() {
    const q = ($("#hc-manual-search")?.value || "").toLocaleLowerCase(),
      cat = $("#hc-manual-category")?.value;
    const rows = catalog.manuals.filter(
      (m) =>
        (!cat || m.category === cat) &&
        (!$("#hc-manual-brand")?.value ||
          (m.brand || "hispacold") === $("#hc-manual-brand").value) &&
        `${m.title} ${m.category}`.toLocaleLowerCase().includes(q),
    );
    const selectedBrand = $("#hc-manual-brand")?.value;
    if ($("#hc-library-notices"))
      $("#hc-library-notices").innerHTML = (
        selectedBrand ? [selectedBrand] : Object.keys(catalog.brands)
      )
        .map(
          (brand) =>
            `<b>${esc(brandName(brand))}</b>${brandCatalog(brand)
              .notices.map((n) => `<p>${esc(n)}</p>`)
              .join("")}`,
        )
        .join("");
    $("#hc-manual-list").innerHTML =
      rows
        .map(
          (m) =>
            `<article class="hc-manual"><div class="hc-kicker">${esc(brandName(m.brand))} / ${esc(m.category)}</div><h2>${esc(m.title)}</h2><p>PDF · ${m.pages} ${m.pages === 1 ? "página" : "páginas"} · ${(m.bytes / 1048576).toFixed(1)} MB</p><div class="hc-actions">${m.available ? btn("Consultar PDF ↗", "manual", "", `data-id="${m.id}"`) : '<span class="hc-badge">Pendiente de importar</span>'}</div></article>`,
        )
        .join("") ||
      '<div class="hc-empty">No hay manuales con ese filtro.</div>';
  }
  function codes() {
    const bc = brandCatalog(knowledgeBrand),
      controls = [...new Set(bc.codes.map((c) => c.control))];
    $("#hc-main").innerHTML =
      heading(
        "APOYO AL DIAGNÓSTICO",
        "Códigos e indicadores de control",
        "Selecciona la marca y confirma el control instalado antes de interpretar una indicación.",
      ) +
      `<section class="hc-panel"><div class="hc-filters"><select id="hc-code-brand" aria-label="Marca de códigos">${opts(catalog.brands, knowledgeBrand)}</select><input id="hc-code-search" type="search" aria-label="Buscar código" placeholder="Código, indicador o descripción…"><select id="hc-code-control" aria-label="Control">${opts(Object.fromEntries(controls.map((c) => [c, c])), "", "Todos los controles")}</select></div><div class="hc-table-wrap"><table><thead><tr><th>Control</th><th>Código / indicador</th><th>Descripción</th><th>Fuente</th></tr></thead><tbody id="hc-code-list"></tbody></table></div></section><div class="hc-note">Las referencias corresponden a ${esc(brandName(knowledgeBrand))}. Confirma modelo, versión del control y procedimiento aplicable a la unidad.</div>`;
    codeRows();
  }
  function codeRows() {
    const q = $("#hc-code-search").value.toLowerCase(),
      control = $("#hc-code-control").value;
    $("#hc-code-list").innerHTML =
      brandCatalog(knowledgeBrand)
        .codes.filter(
          (c) =>
            (!control || c.control === control) &&
            `${c.code} ${c.description}`.toLowerCase().includes(q),
        )
        .map(
          (c) =>
            `<tr><td>${esc(c.control)}</td><td><strong>${esc(c.code)}</strong></td><td>${esc(c.description)}</td><td>${sourceButton(c.source)}</td></tr>`,
        )
        .join("") || '<tr><td colspan="4">Sin coincidencias.</td></tr>';
  }
  async function manual(id, p) {
    const win = window.open("about:blank", "_blank");
    if (!win) {
      throw new Error("Permite abrir una pestaña para consultar el PDF.");
    }
    try {
      const blob = await api("/manuals/" + id, { blob: true });
      const url = URL.createObjectURL(blob);
      win.location.href = url + (p ? "#page=" + p : "");
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) {
      win.close();
      throw e;
    }
  }
  async function importManuals(files) {
    let count = 0,
      skipped = 0,
      failed = [];
    const progress = $("#hc-import-progress");
    for (const file of files) {
      progress.textContent = `Importando ${count + skipped + failed.length + 1}/${files.length}: ${file.name}`;
      try {
        if (!catalog.manuals.some((m) => m.bytes === file.size)) {
          skipped++;
          continue;
        }
        const bytes = await file.arrayBuffer();
        const hash = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        ]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const m = catalog.manuals.find((m) => m.sha256 === hash);
        if (!m) {
          skipped++;
          continue;
        }
        await api("/manuals/" + m.id + "/raw", {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        });
        m.available = true;
        count++;
      } catch (e) {
        failed.push(file.name + ": " + e.message);
      }
    }
    progress.textContent = `${count} guardados · ${skipped} no catalogados · ${failed.length} fallidos.${failed.length ? " " + failed.join(" / ") : ""}`;
    manualCards();
    toast("Importación terminada.");
  }
  function download(text, type, name) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function csv() {
    let rows = [],
      offset = 0,
      total = Infinity;
    while (offset < total) {
      const data = await api(
        "/services?" + new URLSearchParams({ ...filters, offset, limit: 500 }),
      );
      rows.push(...data.items);
      total = data.summary.total;
      if (!data.items.length) break;
      offset += data.items.length;
    }
    const safe = (v) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const lines = [
      [
        "Folio",
        "Fecha",
        "Empresa",
        "Unidad",
        "Marca",
        "Servicio",
        "Atención",
        "Estado",
        "Técnico",
        "Próximo servicio",
        "Total MXN",
      ],
      ...rows.map((r) => [
        r.folio,
        r.serviceDate,
        r.company,
        r.unit,
        brandName(r.brand),
        catalog.types[r.type],
        isExpress(r) ? "Express" : "Normal",
        catalog.statuses[r.status],
        r.technician,
        r.nextDate,
        r.total,
      ]),
    ];
    download(
      "\uFEFF" + lines.map((row) => row.map(safe).join(",")).join("\r\n"),
      "text/csv;charset=utf-8",
      "Carlab-climatizacion-servicios.csv",
    );
  }
  async function photos(files, checkId = "") {
    if (photoProcessing) return;
    readForm();
    if (draft.evidence.length + files.length > 8)
      throw new Error("Puedes guardar hasta 8 fotos por orden.");
    photoProcessing = true;
    const before = draft.evidence.length;
    try {
      for (const file of files) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 20000000
        )
          throw new Error("Usa JPG, PNG o WebP de hasta 20 MB.");
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas
          .getContext("2d")
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        let quality = 0.78,
          data = canvas.toDataURL("image/jpeg", quality);
        while (data.length > 1700000 && quality > 0.3) {
          quality -= 0.12;
          data = canvas.toDataURL("image/jpeg", quality);
        }
        if (data.length > 1800000)
          throw new Error(
            "La foto sigue siendo demasiado grande. Usa una imagen de menor resolución.",
          );
        draft.evidence.push({
          id: crypto.randomUUID(),
          name: (file.name || "Foto de cámara.jpg").slice(0, 150),
          caption: "",
          phase: "sin_clasificar",
          component: "",
          checkId: draft.checklist.some((c) => c.id === checkId) ? checkId : "",
          data,
        });
      }
    } finally {
      photoProcessing = false;
      if (draft.evidence.length !== before) {
        $("#hc-evidence").innerHTML = evidenceHTML();
        $$("[data-photo-count]").forEach(
          (el) =>
            (el.textContent =
              draft.evidence.filter((p) => p.checkId === el.dataset.photoCount)
                .length || ""),
        );
        markDirty();
        await persistDraft();
      }
      if ($("#hc-photo-input")) $("#hc-photo-input").value = "";
      if ($("#hc-camera-input")) $("#hc-camera-input").value = "";
      pendingPhotoCheck = "";
      if ($("#hc-check-photo-input")) $("#hc-check-photo-input").value = "";
    }
  }
  function refreshParts() {
    readForm();
    $("#hc-parts").innerHTML = partsHTML();
    markDirty();
  }
  async function editRecord() {
    if (!record) return;
    draft = normalizeData(record.data);
    localId = "order-" + record.id + "-" + editorSession;
    step = 0;
    dirty = false;
    change = storedChange = 0;
    checkFilter = "all";
    editor();
  }
  async function reopen() {
    const reason = prompt("Motivo de reapertura:");
    if (!reason?.trim()) return;
    const data = structuredClone(record.data);
    data.status = "en_proceso";
    data.reopenReason = reason.trim();
    record = await api("/services/" + record.id, {
      method: "PUT",
      body: JSON.stringify({ data, version: record.version }),
    });
    await editRecord();
    toast("Orden reabierta.");
  }
  async function unitHistory(company, unit) {
    historyQuery = { company, unit, offset: 0 };
    await show("history");
  }
  function shiftMonth(delta) {
    const [year, month] = calendarMonth.split("-").map(Number);
    calendarMonth = dateOf(new Date(year, month - 1 + delta, 1)).slice(0, 7);
    calendarOffset = 0;
    calendarDay = "";
    calendarBucket = "all";
  }
  function suggestDate() {
    readForm();
    const months = brandCatalog().intervals[draft.interval];
    const days = brandCatalog().intervalDays?.[draft.interval];
    if ((!months && !days) || !draft.serviceDate)
      return error("Selecciona fecha y periodicidad.");
    const d = new Date(draft.serviceDate + "T12:00:00"),
      day = d.getDate();
    if (days) d.setDate(d.getDate() + days);
    else {
      d.setDate(1);
      d.setMonth(d.getMonth() + months);
      d.setDate(
        Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()),
      );
    }
    $("[name=nextDate]").value = dateOf(d);
    markDirty();
    toast("Fecha sugerida; puedes ajustarla.");
  }
  document.addEventListener("submit", async (e) => {
    try {
      if (e.target.id === "hc-create-form") {
        e.preventDefault();
        if (!e.target.reportValidity()) return;
        const f = Object.fromEntries(new FormData(e.target));
        await create(f.type, cloneSource, f.brand, f.attention);
      }
      if (e.target.id === "hc-delete-form") {
        e.preventDefault();
        if (!e.target.reportValidity()) return;
        const button = e.target.querySelector("[type=submit]");
        button.disabled = true;
        try {
          record = await api("/services/" + record.id, {
            method: "DELETE",
            body: JSON.stringify({
              version: record.version,
              reason: new FormData(e.target).get("reason"),
            }),
          });
          try {
            const saved = await HCDrafts.list(catalog.user.id);
            for (const d of saved.filter((d) => d.record?.id === record.id))
              await HCDrafts.remove(catalog.user.id, d.id);
          } catch (_) {
            /* The server deletion already succeeded; a local draft cannot restore it. */
          }
          record = await api("/services/" + record.id).catch(() => record);
          $("#hc-dialog").close();
          detail(record);
          toast("Orden enviada a la papelera. Puedes recuperarla.");
        } catch (err) {
          $("#hc-delete-error").textContent = err.message;
          button.disabled = false;
        }
      }
      if (e.target.id === "hc-form") {
        e.preventDefault();
        await save();
      }
      if (e.target.id === "hc-filters") {
        e.preventDefault();
        filters = Object.fromEntries(new FormData(e.target));
        page = 0;
        await services();
      }
      if (e.target.id === "hc-history-form") {
        e.preventDefault();
        historyQuery = {
          ...Object.fromEntries(new FormData(e.target)),
          offset: 0,
        };
        await history();
      }
    } catch (err) {
      error(err.message);
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.closest("#hc-form")) markDirty();
    if (/^(quantity|unitPrice):/.test(e.target.name || ""))
      $("#hc-parts-total").textContent =
        "Total: " +
        money(
          draft.parts.reduce(
            (n, p) =>
              n + (Number(p.quantity) || 0) * (Number(p.unitPrice) || 0),
            0,
          ),
        );
    if (e.target.id === "hc-manual-search") manualCards();
    if (e.target.id === "hc-code-search") codeRows();
  });
  document.addEventListener("change", async (e) => {
    try {
      if (["hc-create-brand", "hc-create-type"].includes(e.target.id)) {
        const brand = $("#hc-create-brand").value,
          type = $("#hc-create-type").value;
        $("#hc-create-type").disabled = !brand;
        $("#hc-create-attention").disabled = !(brand && type);
        $("#hc-start-order").disabled = !(brand && type);
      }
      if (e.target.id === "hc-code-brand") {
        knowledgeBrand = e.target.value;
        codes();
      }
      if (e.target.closest("#hc-form")) markDirty();
      if (e.target.id === "hc-unit") {
        readForm();
        const u = units.find((u) => u.id === e.target.value);
        if (
          u &&
          (draft.company !== u.empresa || draft.unit !== u.numero_economico)
        ) {
          for (const key of [
            "equipment",
            "control",
            "compressorSerial",
            "chassis",
            "base",
            "planReference",
          ])
            draft[key] = "";
          draft.sourceOrderId = "";
        }
        if (u)
          Object.assign(draft, {
            company: u.empresa,
            unit: u.numero_economico,
            model: u.modelo || "",
            workNumber: u.numero_obra || "",
            mileage: u.kilometraje || "",
          });
        editor();
        markDirty();
      }
      if (["company", "unit"].includes(e.target.name)) loadUnitContext();
      if (e.target.name === "symptomCode")
        $("#hc-symptom-guide").innerHTML = guideHTML();
      if (e.target.name === "interval") {
        readForm();
        if (isV3()) {
          const activeIds = new Set(checklistForData(draft).map((c) => c.id));
          const removed = draft.checklist.filter(
            (c) =>
              !activeIds.has(c.id) &&
              (c.outcome !== "pendiente" ||
                c.notes ||
                c.action ||
                draft.evidence.some((p) => p.checkId === c.id)),
          );
          if (removed.length) {
            error(
              "Este plan tiene revisiones ya capturadas. Conserva la periodicidad anterior o registra el nuevo alcance en una orden nueva.",
            );
            draft.interval = e.target.dataset.previous || draft.interval;
            e.target.value = draft.interval;
            return;
          }
          draft = normalizeData(draft);
          draft.evidence.forEach((p) => {
            if (p.checkId && !activeIds.has(p.checkId)) p.checkId = "";
          });
        }
        e.target.dataset.previous = draft.interval;
        $("#hc-checks").innerHTML = checksHTML();
        $("#hc-period-scope").innerHTML = periodScopeHTML();
        if ($("#hc-evidence")) $("#hc-evidence").innerHTML = evidenceHTML();
        updateProgress();
      }
      if (e.target.id === "hc-check-filter") {
        readForm();
        checkFilter = e.target.value;
        updateProgress();
      }
      if (e.target.name === "circuitOpened") {
        $(".hc-circuit-fields").hidden = !e.target.checked;
        if (isV3() && e.target.checked) $("#hc-diagnostic-details").open = true;
      }
      if (e.target.name === "result" && isV3())
        $("#hc-result-followup").hidden = !(
          (e.target.value && e.target.value !== "operativo") ||
          draft.recommendations
        );
      if (e.target.name === "status" && e.target.closest("#hc-form"))
        $("#hc-cancel-field").hidden = e.target.value !== "cancelado";
      if (["hc-photo-input", "hc-camera-input"].includes(e.target.id))
        await photos([...e.target.files], pendingPhotoCheck);
      if (e.target.id === "hc-check-photo-input")
        await photos([...e.target.files], pendingPhotoCheck);
      if (e.target.id === "hc-manual-input") {
        importing = true;
        try {
          await importManuals([...e.target.files]);
        } finally {
          importing = false;
        }
      }
      if (["hc-manual-category", "hc-manual-brand"].includes(e.target.id))
        manualCards();
      if (e.target.id === "hc-code-control") codeRows();
      if (e.target.id === "hc-history-unit") {
        const u = units.find((u) => u.id === e.target.value);
        if (u) {
          historyQuery = {
            company: u.empresa,
            unit: u.numero_economico,
            offset: 0,
          };
          await history();
        }
      }
      if (
        e.target.id === "hc-calendar-month" &&
        /^\d{4}-\d{2}$/.test(e.target.value)
      ) {
        calendarMonth = e.target.value;
        calendarBucket = "all";
        calendarOffset = 0;
        calendarDay = "";
        await calendar();
      }
    } catch (err) {
      error(err.message);
    }
  });
  document.addEventListener(
    "toggle",
    (e) => {
      if (e.target.tagName === "DETAILS" && e.target.open) initSignatures();
    },
    true,
  );
  document.addEventListener("click", async (e) => {
    const anchor = e.target.closest("a");
    if (anchor && dirty) {
      e.preventDefault();
      if (await leave()) {
        dirty = false;
        location.href = anchor.href;
      }
      return;
    }
    const navigation = e.target.closest("[data-view]");
    if (navigation) {
      await show(navigation.dataset.view);
      return;
    }
    const tab = e.target.closest("[data-step]");
    if (tab) {
      if (!saving) setStep(Number(tab.dataset.step));
      return;
    }
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const a = b.dataset.action;
    if ((saving || photoProcessing) && !["manual"].includes(a)) return;
    try {
      if (a === "new") await choose();
      if (a === "express") await choose(null, "express");
      if (a === "create") await create(b.dataset.type);
      if (a === "close-dialog") {
        stopCamera();
        $("#hc-dialog").close();
      }
      if (a === "continue-order") {
        await open(b.dataset.id);
        if (
          !record.deletedAt &&
          !["completado", "cancelado"].includes(record.status)
        )
          await editRecord();
      }
      if (a === "delete-order") deleteDialog();
      if (a === "restore-order") {
        b.disabled = true;
        try {
          record = await api("/services/" + record.id + "/restore", {
            method: "POST",
            body: JSON.stringify({ version: record.version }),
          });
          record = await api("/services/" + record.id).catch(() => record);
          detail(record);
          toast("Orden recuperada con su historial.");
        } finally {
          b.disabled = false;
        }
      }
      if (a === "trash-prev") {
        trashPage--;
        await trash();
      }
      if (a === "trash-next") {
        trashPage++;
        await trash();
      }
      if (a === "symptom-chip") {
        readForm();
        const guide = brandCatalog().symptomGuides.find(
          (g) => g.id === b.dataset.code,
        );
        draft.symptomCode = b.dataset.code;
        $("[name=symptomCode]").value = draft.symptomCode;
        if (!draft.symptoms?.trim()) {
          $("[name=symptoms]").value = guide.label;
          draft.symptoms = guide.label;
        }
        $$(".hc-symptom-chips button").forEach((el) => {
          const selected = el.dataset.code === draft.symptomCode;
          el.classList.toggle("selected", selected);
          el.setAttribute("aria-pressed", String(selected));
        });
        $("#hc-symptom-guide").innerHTML = guideHTML();
        markDirty();
      }
      if (a === "guided-issue") {
        $("#hc-dialog").close();
        focusGuidedIssue(b.dataset.issue);
        return;
      }
      if (a === "review-order") {
        readForm();
        showGuidedReview();
        return;
      }
      if (a === "complete-order") {
        $("#hc-dialog").close();
        readForm();
        const missing = closeMissing();
        if (missing.length) {
          if (draft.circuitOpened || draft.type === "mayor")
            $("#hc-diagnostic-details").open = true;
          error("Para completar: " + missing.join(" · "));
          $("#hc-close-readiness").scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          return;
        }
        const oldStatus = draft.status;
        draft.status = "completado";
        const statusInput = $("[name=status]");
        const option = new Option("Completado", "completado", true, true);
        statusInput.add(option);
        statusInput.value = "completado";
        markDirty();
        await save();
        if (
          draft &&
          $("#hc-form") &&
          !["completado", "cancelado"].includes(record?.status)
        ) {
          draft.status = oldStatus;
          const input = $("[name=status]");
          input.value = oldStatus;
          [...input.options]
            .filter((o) => o.value === "completado")
            .forEach((o) => o.remove());
          markDirty();
        }
      }
      if (a === "choose-photos") {
        pendingPhotoCheck = "";
        $("#hc-photo-input").click();
      }
      if (a === "take-photo") {
        pendingPhotoCheck = "";
        await startCamera();
      }
      if (a === "camera-context") await startCamera();
      if (a === "gallery-context") {
        stopCamera();
        $("#hc-dialog").close();
        $("#hc-photo-input").click();
      }
      if (a === "capture-photo") await capturePhoto();
      if (a === "back") await show("services");
      if (a === "refresh") await show(view);
      if (a === "open") await open(b.dataset.id);
      if (a === "clear-filters") {
        filters = { q: "", brand: "", type: "", status: "", from: "", to: "" };
        page = 0;
        await services();
      }
      if (a === "prev") {
        page--;
        await services();
      }
      if (a === "next") {
        page++;
        await services();
      }
      if (a === "resume") await resume(b.dataset.id);
      if (
        a === "discard-draft" &&
        confirm(
          "¿Descartar este borrador local? Las órdenes guardadas en Carlab se conservan.",
        )
      ) {
        await HCDrafts.remove(catalog.user.id, b.dataset.id);
        await services();
      }
      if (a === "edit") await editRecord();
      if (a === "reopen") await reopen();
      if (
        a === "reload-order" &&
        confirm(
          "¿Cargar la versión de Carlab? Tu borrador local quedará disponible en Órdenes.",
        )
      ) {
        const id = record.id;
        await open(id);
      }
      if (a === "new-from-record") await choose(record);
      if (a === "new-from-id")
        await choose(await api("/services/" + b.dataset.id));
      if (a === "record-history")
        await unitHistory(record.company, record.unit);
      if (a === "reuse-equipment") {
        readForm();
        const currentDraft = draft,
          company = draft.company,
          unit = draft.unit,
          source = await api("/services/" + b.dataset.id);
        if (
          draft !== currentDraft ||
          company !== draft.company ||
          unit !== draft.unit
        )
          return;
        if ((source.data.brand || "hispacold") !== draft.brand)
          throw new Error("El equipo pertenece a otra marca.");
        for (const key of [
          "equipment",
          "control",
          "compressorSerial",
          "chassis",
          "base",
        ])
          if (!draft[key]) draft[key] = source.data[key] || "";
        editor();
        markDirty();
        toast("Datos del equipo recuperados. Puedes corregirlos.");
      }
      if (a === "unit-history") {
        readForm();
        await unitHistory(draft.company, draft.unit);
      }
      if (a === "step-prev") setStep(step - 1);
      if (a === "step-next") setStep(step + 1);
      if (a === "suggest-date") suggestDate();
      if (a === "pick-parts") {
        readForm();
        const activeDraft = draft;
        await window.ACPartsPicker.open({
          brand: draft.brand || "hispacold",
          type: draft.type,
          interval: draft.interval,
          chassis: draft.chassis,
          equipment: draft.equipment,
          currentParts: draft.parts,
          onAdd: async (items, context) => {
            if (draft !== activeDraft)
              throw new Error("La orden cambió. Abre nuevamente el selector.");
            readForm();
            const used = new Set(
              draft.parts
                .map((p) =>
                  String(p.reference || "")
                    .trim()
                    .toUpperCase(),
                )
                .filter(Boolean),
            );
            const additions = items.filter(
              (p) =>
                !p.reference || !used.has(p.reference.trim().toUpperCase()),
            );
            if (draft.parts.length + additions.length > 60)
              throw new Error("La orden admite hasta 60 conceptos.");
            draft.parts.push(...additions);
            if (context.chassis) {
              draft.chassis = {
                man: "MAN",
                mb: "Mercedes-Benz",
                scania: "Scania",
                volvo: "Volvo",
              }[context.chassis];
              const field = $("#hc-form [name=chassis]");
              if (field) field.value = draft.chassis;
            }
            $("#hc-parts").innerHTML = partsHTML();
            markDirty();
            toast(
              additions.length +
                " conceptos agregados. Revisa cantidades y precios MXN; no se descuenta almacén.",
            );
          },
        });
      }
      if (a === "add-part") {
        readForm();
        draft.parts.push({
          kind: "refaccion",
          description: "",
          reference: "",
          quantity: 1,
          unitPrice: 0,
        });
        $("#hc-parts").innerHTML = partsHTML();
        markDirty();
      }
      if (a === "remove-part") {
        readForm();
        draft.parts.splice(Number(b.dataset.index), 1);
        $("#hc-parts").innerHTML = partsHTML();
        markDirty();
      }
      if (a === "add-finding") {
        readForm();
        draft.findings.push({
          id: crypto.randomUUID(),
          description: "",
          decision: "pendiente",
          authorizedBy: "",
          notes: "",
        });
        $("#hc-findings").innerHTML = findingsHTML();
        markDirty();
      }
      if (a === "remove-finding") {
        readForm();
        draft.findings.splice(Number(b.dataset.index), 1);
        $("#hc-findings").innerHTML = findingsHTML();
        markDirty();
      }
      if (a === "check-photo") photoDialog(b.dataset.check);
      if (a === "remove-photo") {
        readForm();
        draft.evidence.splice(Number(b.dataset.index), 1);
        $("#hc-evidence").innerHTML = evidenceHTML();
        $$("[data-photo-count]").forEach(
          (el) =>
            (el.textContent =
              draft.evidence.filter((p) => p.checkId === el.dataset.photoCount)
                .length || ""),
        );
        markDirty();
      }
      if (a === "clear-signature") {
        const s = signatures[b.dataset.key];
        if (s) {
          s.canvas
            .getContext("2d")
            .clearRect(0, 0, s.canvas.width, s.canvas.height);
          s.has = false;
          s.dirty = true;
          draft[b.dataset.key] = "";
          markDirty();
        }
      }
      if (a === "pdf") {
        b.disabled = true;
        try {
          await window.HispacoldPDF.export(record, catalog);
        } finally {
          b.disabled = false;
        }
      }
      if (a === "json")
        download(
          JSON.stringify(record, null, 2),
          "application/json",
          record.folio + ".json",
        );
      if (a === "csv") await csv();
      if (a === "manual") await manual(b.dataset.id, b.dataset.page);
      if (a === "import") $("#hc-manual-input").click();
      if (a === "history-prev") {
        historyQuery.offset -= 25;
        await history();
      }
      if (a === "history-next") {
        historyQuery.offset += 25;
        await history();
      }
      if (a === "calendar-bucket") {
        calendarBucket = b.dataset.bucket;
        calendarDay = "";
        calendarOffset = 0;
        await calendar();
      }
      if (a === "calendar-day") {
        calendarDay = b.dataset.date;
        calendarBucket = "all";
        calendarOffset = 0;
        await calendar();
      }
      if (a === "calendar-clear") {
        calendarDay = "";
        calendarOffset = 0;
        await calendar();
      }
      if (a === "month-prev") {
        shiftMonth(-1);
        await calendar();
      }
      if (a === "month-next") {
        shiftMonth(1);
        await calendar();
      }
      if (a === "calendar-prev") {
        calendarOffset = Math.max(0, calendarOffset - 100);
        await calendar();
      }
      if (a === "calendar-next") {
        calendarOffset += 100;
        await calendar();
      }
    } catch (err) {
      error(err.message);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && dirty) persistDraft();
  });
  window.addEventListener("beforeunload", (e) => {
    if (saving || (dirty && storedChange !== change)) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("online", () => {
    if (dirty)
      toast(
        "Conexión restablecida. Tu borrador local está disponible para guardar en Carlab.",
      );
  });
  window.addEventListener("offline", () =>
    toast("Sin conexión. La captura se protege en este dispositivo."),
  );
  async function boot() {
    try {
      bootToken = localStorage.getItem("carlabToken") || "";
      catalog = await api("/catalog");
      units = await api("/units");
      $("#hc-user").textContent = catalog.user.nombre + " · Administrador";
      window.ACPortal.setupNav();
      await window.ACOperations.ready;
      await show("home");
      const unitId = new URLSearchParams(location.search).get("unit");
      if (unitId) {
        await window.ACOperations.ready;
        await window.CarlabACNav.operations("fleet", unitId);
      }
    } catch (e) {
      $("#hc-user").textContent = "Acceso no disponible";
      $("#hc-main").innerHTML = heading(
        "CARLAB / CLIMATIZACIÓN",
        "Acceso de administrador",
        e.message,
        '<a class="hc-btn primary" href="/">Ir a Carlab Cloud</a>',
      );
    }
  }
  $("#hc-dialog").addEventListener("close", stopCamera);
  $("#hc-dialog").addEventListener("cancel", stopCamera);
  document.addEventListener("focusin", (e) => {
    if (e.target.name === "interval")
      e.target.dataset.previous = e.target.value;
  });
  window.CarlabACNav = {
    open,
    show,
    newFromFleet: async (u) => {
      await choose({
        company: u.company,
        unit: u.unit,
        data: {
          company: u.company,
          unit: u.unit,
          brand: u.brand,
          model: u.model,
          base: u.base,
          equipment: u.acModel,
          chassis: u.busBrand,
          workNumber: u.workNumber,
        },
      });
    },
    newFrom: async (id) => {
      const source = await api("/services/" + encodeURIComponent(id));
      await choose(source);
    },
    operations: async (name, id) => {
      if (!(await leave())) return false;
      await resetEditor();
      nav(name);
      await window.ACOperations.show(name, id);
      return true;
    },
  };
  // The shared portal is loaded by the following deferred scripts.
  if (document.readyState !== "complete")
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
