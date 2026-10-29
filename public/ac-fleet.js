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
  const fmt = (v) =>
    v
      ? new Date(
          String(v).length === 10 ? v + "T12:00:00" : v,
        ).toLocaleDateString("es-MX", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "Sin registro";
  const btn = (label, action, extra = "", primary = false) =>
    `<button type="button" class="hc-btn ${primary ? "primary" : ""}" data-af="${action}" ${extra}>${label}</button>`;
  const options = (items, value, placeholder) =>
    `${placeholder === undefined ? "" : `<option value="">${esc(placeholder)}</option>`}${Object.entries(
      items,
    )
      .map(
        ([k, v]) =>
          `<option value="${esc(k)}" ${String(value) === k ? "selected" : ""}>${esc(v)}</option>`,
      )
      .join("")}`;
  const field = (label, name, value = "", type = "text", extra = "") =>
    `<label class="hc-field"><b>${esc(label)}</b><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const select = (label, name, items, value = "", placeholder) =>
    `<label class="hc-field"><b>${esc(label)}</b><select name="${name}">${options(items, value, placeholder)}</select></label>`;
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  let ctx,
    config,
    data,
    detail,
    editingCompany,
    editingUnit,
    working = false,
    seq = 0,
    timer,
    importOffset = 0,
    importSearch = "";
  const filters = {
    q: "",
    company: "",
    brand: "",
    region: "",
    base: "",
    signal: "",
    focus: "",
    archived: "",
    offset: 0,
  };
  const labels = {
    red: "Atención crítica",
    amber: "Seguimiento",
    green: "AC operativo",
    gray: "Sin verificación",
  };
  const brandName = (b) => ctx.info.brands[b] || b || "Ambas marcas AC";
  const query = () => new URLSearchParams({ ...filters, today: today() });
  const active = () => ctx?.active();
  const post = (b) => ({ method: "POST", body: JSON.stringify(b) }),
    patch = (b) => ({ method: "PATCH", body: JSON.stringify(b) });
  function dialog(html) {
    let d = $("#acf-dialog");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "acf-dialog";
      document.body.append(d);
      d.addEventListener("cancel", (e) => {
        if (working) e.preventDefault();
      });
    }
    d.innerHTML =
      '<div class="acf-dialog-bar"><span>Flotas AC</span><button type="button" class="acf-dialog-close" data-af="close" aria-label="Cerrar ventana de Flotas AC" title="Cerrar" autofocus>×</button></div><div class="acf-dialog-content">' +
      html +
      '<p id="acf-error" class="hc-error" role="alert"></p></div>';
    if (!d.open) d.showModal();
  }
  const close = () => {
    if (!working) $("#acf-dialog")?.close();
  };
  function error(e) {
    if ($("#acf-dialog")?.open) $("#acf-error").textContent = e.message;
    else ctx.toast(e.message);
  }
  const toolbar = () =>
    `<form id="acf-filters" class="acf-filters">${field("Buscar unidad, empresa o equipo", "q", filters.q, "search", 'placeholder="Ej. 306, i8, serie AC…" maxlength="180"')}${select("Empresa", "company", Object.fromEntries(config.companies.map((c) => [c.id, c.name])), filters.company, "Todas las empresas")}${ctx.external ? "" : select("Marca AC", "brand", ctx.info.brands, filters.brand, "Ambas marcas")}${select("Región", "region", Object.fromEntries(config.regions.map((v) => [v, v])), filters.region, "Todas las regiones")}${select("Base", "base", Object.fromEntries(config.bases.map((v) => [v, v])), filters.base, "Todas las bases")}${select("Prioridad", "focus", { attention: "Críticas o en seguimiento", overdue: "Mantenimiento vencido", recurring: "Reparaciones recurrentes", pending: "Con órdenes o solicitudes" }, filters.focus, "Todas las prioridades")}${config.canManage ? select("Registros", "archived", { "": "Activos", true: "Eliminadas / archivadas" }, filters.archived) : ""}<div class="hc-actions"><button type="submit" class="hc-btn primary">Aplicar filtros</button>${btn("Limpiar", "clear")}</div></form>`;
  function bus(u) {
    const asset = u.busBrand.toLowerCase().includes("volvo")
      ? "bus-volvo.svg"
      : "bus-irizar.svg";
    return `<div class="acf-bus" style="--bus:url('/assets/buses/${asset}')" aria-hidden="true"></div>`;
  }
  function card(u) {
    return `<button type="button" class="acf-unit ${u.signal}" data-af="detail" data-id="${esc(u.id)}" aria-label="Unidad ${esc(u.unit)}, ${esc(u.company)}, ${esc(u.signalLabel)}"><div class="acf-unit-top"><span class="acf-badge ${u.signal}"><i></i>${esc(labels[u.signal])}</span><span>${esc(brandName(u.brand))}</span></div><div class="acf-unit-id">${esc(u.unit)}</div><div class="acf-unit-company">${esc(u.company)}</div><div class="acf-unit-model">${esc([u.busBrand, u.model].filter(Boolean).join(" · ") || "Modelo por registrar")}</div>${bus(u)}<div class="acf-unit-reason">${esc(u.reasons[0].text)}</div><div class="acf-unit-stats"><span><strong>${u.openOrders}</strong> órdenes abiertas</span><span><strong>${u.serviceRequests + u.partRequests}</strong> solicitudes</span></div><div class="acf-unit-foot"><span>${esc(u.base || u.fleet || "Base por registrar")}</span><span>${u.pendingDays ? u.pendingDays + " días pendiente" : u.verifiedOn ? "Evaluado " + fmt(u.verifiedOn) : "Por evaluar"} →</span></div></button>`;
  }
  function render() {
    if (ctx.external || ctx.visual) {
      renderPortalFleet();
      return;
    }
    const s = data.summary,
      pct = s.total ? Math.round((s.green / s.total) * 100) : 0;
    $("#hc-main").innerHTML =
      `<div class="acf-heading"><div><div class="hc-kicker">CONTROL REGIONAL / ${ctx.external ? esc(brandName(ctx.info.user.brand)).toUpperCase() : "CLIMATIZACIÓN"}</div><h1>Flotas de aire acondicionado</h1><p>Una vista clara de cada unidad. Del estado del equipo a la siguiente acción.</p></div><div class="hc-actions">${config.canManage ? btn("+ Registrar unidades", "new-unit", "", true) + btn("Empresas", "companies") : ""}${btn("Exportar CSV", "export")}${btn("Actualizar", "refresh")}</div></div>
      <section class="acf-hero"><div><span class="acf-eyebrow">PANORAMA DE LA FLOTA</span><h2>${s.total} ${s.total === 1 ? "unidad registrada" : "unidades registradas"}</h2><p>${data.companies.length} empresas · ${s.openOrders} órdenes abiertas · ${s.serviceRequests + s.partRequests} solicitudes pendientes</p><div class="acf-health-bar" aria-label="Distribución de estados">${["green", "amber", "red", "gray"].map((k) => `<span class="${k}" style="width:${s.total ? (s[k] / s.total) * 100 : 0}%"></span>`).join("")}</div><small>El semáforo refleja la información registrada de AC.</small></div><div class="acf-health-number"><strong>${pct}<small>%</small></strong><span>AC operativo verificado</span><small>${s.green} de ${s.total} unidades sin alertas</small></div></section>
      <section class="acf-kpis" aria-label="Filtrar por semáforo">${[
        ["", "Todas las unidades", s.total],
        ["green", "AC operativo", s.green],
        ["amber", "Seguimiento", s.amber],
        ["red", "Atención crítica", s.red],
        ["gray", "Sin verificación", s.gray],
      ]
        .map(
          ([k, l, n]) =>
            `<button type="button" class="acf-kpi ${k || "all"} ${filters.signal === k ? "selected" : ""}" data-af="signal" data-signal="${k}" aria-pressed="${filters.signal === k}"><span>${l}</span><strong>${n}</strong><small>${{ green: "Evaluación vigente, sin pendientes", amber: "Servicios y acciones de seguimiento", red: "No operativo, urgencia o refacción", gray: "Sin evaluación vigente", "": "Pulsa un estado para filtrar" }[k]}</small></button>`,
        )
        .join("")}</section>
      ${toolbar()}
      <div class="acf-shortcuts">${btn(`${s.overdue} mantenimientos vencidos`, "focus", 'data-focus="overdue"')}${btn(`${s.recurring} unidades con reparaciones recurrentes`, "focus", 'data-focus="recurring"')}${filters.signal ? `<span class="acf-badge ${filters.signal}">Filtro: ${labels[filters.signal]}</span>` : ""}<span id="acf-updated">Actualizado ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · Consulta automática cada 30 s</span></div>
      ${data.companies.length > 1 ? `<details class="acf-company-overview"><summary>Comparar empresas · ${data.companies.length}</summary><div class="acf-company-grid">${data.companies.map((c) => `<button type="button" data-af="company-filter" data-id="${esc(c.id)}"><b>${esc(c.name)}</b><span>${c.total} unidades</span><small><i class="red">${c.red} críticas</i> · <i class="amber">${c.amber} seguimiento</i> · ${c.green} operativas · ${c.gray} sin verificar</small></button>`).join("")}</div></details>` : ""}
      <section class="acf-grid" aria-label="Unidades de climatización">${data.items.map(card).join("") || `<div class="hc-empty acf-empty"><h2>${s.total ? "Sin coincidencias" : "Comienza con una empresa y sus unidades"}</h2><p>${s.total ? "Cambia los filtros para consultar otras unidades." : config.canManage ? "Registra una empresa y asigna la marca de AC de cada autobús. También puedes copiar datos desde Flotas." : "Carlab aún no ha registrado unidades para esta selección."}</p>${config.canManage && !s.total ? btn("Registrar unidades", "new-unit", "", true) : btn("Limpiar filtros", "clear")}</div>`}</section>
      <div class="hc-pager"><span>${data.total ? filters.offset + 1 : 0}–${Math.min(filters.offset + 60, data.total)} de ${data.total} unidades</span><div class="hc-actions">${btn("Anterior", "prev", filters.offset === 0 ? "disabled" : "")}${btn("Siguiente", "next", filters.offset + 60 >= data.total ? "disabled" : "")}</div></div>
      <details class="acf-guide"><summary>Cómo interpretar el semáforo</summary><p><b>Verde:</b> evaluación operativa vigente y sin pendientes. <b>Amarillo:</b> órdenes, solicitudes, observaciones, vencimientos o reparaciones recurrentes. <b>Rojo:</b> AC no operativo, orden en espera de refacción o solicitud urgente. <b>Gris:</b> falta una evaluación vigente. Abre cada autobús para conocer la causa exacta.</p><p>La vigencia de evaluación es de 90 días por defecto y el administrador puede ajustarla por unidad. Es una política de seguimiento de Carlab; la periodicidad de mantenimiento se establece según el equipo y su fabricante. Dos reparaciones menores o mayores cerradas en 90 días generan una alerta de recurrencia. El porcentaje corresponde al estado documentado del AC.</p></details>`;
  }
  function renderPortalFleet() {
    const s = data.summary,
      company = config.companies.find((c) => c.id === filters.company);
    $("#hc-main").innerHTML =
      `<div class="acp-fleet-compact"><div class="acp-page-heading"><div><span class="acp-eyebrow">FLOTAS / ${esc(ctx.info.user.company || brandName(ctx.info.user.brand))}</span><h1>${esc(company?.name || ctx.info.user.company || (config.canManage ? "Unidades de aire acondicionado" : "Mis unidades AC"))}</h1><p>${s.total} unidades · Pulsa un autobús para consultar su expediente.</p></div><div class="hc-actions">${config.canManage ? btn("+ Registrar unidades", "new-unit", "", true) + btn("Gestionar empresas", "companies") : ""}<button type="button" class="hc-btn" data-ac-view="companies">← Empresas</button><button type="button" class="hc-btn" data-ac-view="upcoming">Calendario</button></div></div><section class="acf-kpis">${[
        ["", "Todas", s.total],
        ["green", "Operativas", s.green],
        ["amber", "Seguimiento", s.amber],
        ["red", "Críticas", s.red],
        ["gray", "Sin evaluar", s.gray],
      ]
        .map(
          ([key, label, count]) =>
            `<button type="button" class="acf-kpi ${key || "all"} ${filters.signal === key ? "selected" : ""}" data-af="signal" data-signal="${key}" aria-pressed="${filters.signal === key}"><span>${label}</span><strong>${count}</strong></button>`,
        )
        .join(
          "",
        )}</section><details class="acp-filter-details"><summary>Buscar y filtrar unidades ${filters.q || filters.signal || filters.focus ? "· Hay filtros activos" : ""}</summary>${toolbar()}<div class="hc-actions">${btn("Exportar unidades", "export")}${btn("Actualizar", "refresh")}</div></details><section class="acf-grid">${data.items.map(card).join("") || '<div class="hc-empty">No hay unidades para esta selección.</div>'}</section><div class="hc-pager"><span>${data.total ? filters.offset + 1 : 0}–${Math.min(filters.offset + 60, data.total)} de ${data.total}</span><div class="hc-actions">${btn("Anterior", "prev", filters.offset === 0 ? "disabled" : "")}${btn("Siguiente", "next", filters.offset + 60 >= data.total ? "disabled" : "")}</div></div><p class="acp-updated">Verde: evaluación vigente sin alertas · Amarillo: seguimiento · Rojo: atención crítica · Gris: sin evaluación vigente.</p></div>`;
  }
  async function load(withOptions = true) {
    const n = ++seq;
    try {
      const [o, r] = await Promise.all([
        withOptions ? ctx.api("/fleet/options") : config,
        ctx.api("/fleet/units?" + query()),
      ]);
      if (n !== seq || !active()) return;
      config = o;
      data = r;
      render();
    } catch (e) {
      if (n === seq && active()) error(e);
    }
  }
  async function show(context) {
    ctx = context;
    if (ctx.external || ctx.initialFilters)
      Object.assign(
        filters,
        {
          q: "",
          company: ctx.info.user.companyId || "",
          brand: "",
          region: "",
          base: "",
          signal: "",
          focus: "",
          archived: "",
          offset: 0,
        },
        ctx.initialFilters || {},
      );
    await load();
    if (!timer)
      timer = setInterval(() => {
        if (
          active() &&
          !document.hidden &&
          !$("#acf-dialog")?.open &&
          !$("#ac-dialog")?.open &&
          !document.activeElement?.closest("form")
        )
          load(false);
      }, 30000);
  }
  async function companyList() {
    config = await ctx.api("/fleet/options");
    dialog(
      `<div class="hc-kicker">ADMINISTRACIÓN AC</div><h2>Empresas operadoras</h2><p>Una empresa puede tener unidades de ambas marcas. El supervisor solo consulta las de su marca.</p><div class="acf-company-list">${config.companies.map((c) => `<article><div><b>${esc(c.name)}</b><span>${esc([c.region, c.city].filter(Boolean).join(" · ") || "Sin región")}</span></div>${btn("Editar", "edit-company", `data-id="${esc(c.id)}"`)}</article>`).join("") || "<p>No hay empresas registradas.</p>"}</div><div class="hc-actions">${btn("Cerrar", "close")}${btn("+ Nueva empresa", "new-company", "", true)}</div>`,
    );
  }
  function companyForm(c = null) {
    editingCompany = c;
    dialog(
      `<div class="hc-kicker">ADMINISTRACIÓN AC</div><h2>${c ? "Editar empresa" : "Registrar empresa"}</h2><p>Usa el mismo nombre que aparece en las órdenes para conectar automáticamente su historial.</p><form id="acf-company-form"><div class="hc-grid">${field("Empresa operadora *", "name", c?.name || "", "text", 'required maxlength="180" ' + (c ? "readonly" : ""))}${field("Región", "region", c?.region || "", "text", 'maxlength="120" placeholder="Ej. Pacífico, Norte, Centro"')}${field("Ciudad", "city", c?.city || "", "text", 'maxlength="120"')}${field("Contacto de flota", "contact", c?.contact || "", "text", 'maxlength="180"')}${field("Teléfono", "phone", c?.phone || "", "tel", 'maxlength="80"')}</div><div class="hc-actions">${btn("Cancelar", "companies")}<button type="submit" class="hc-btn primary">Guardar empresa</button></div></form>`,
    );
  }
  async function unitForm(u = null, seed = null) {
    config = await ctx.api("/fleet/options");
    if (!config.companies.length) {
      companyForm();
      ctx.toast("Primero registra la empresa operadora.");
      return;
    }
    editingUnit = u;
    const v = u || seed || {},
      company =
        v.companyId ||
        config.companies.find(
          (c) =>
            c.name.toLowerCase().trim() ===
            String(v.company || "")
              .toLowerCase()
              .trim(),
        )?.id ||
        filters.company ||
        config.companies[0].id;
    dialog(`<div class="hc-kicker">ADMINISTRACIÓN AC</div><h2>${u ? "Ficha de unidad " + esc(u.unit) : "Registrar unidades"}</h2><p>${u ? "Actualiza datos del equipo y documenta su condición. La empresa, el número económico y la marca conservan el vínculo con su historial." : "Asigna la marca del aire acondicionado instalado. Puedes capturar una unidad o un lote. Si una unidad fue eliminada, se reincorpora con su ficha anterior, historial y QR al usar la misma empresa, número económico y marca. Después puedes actualizar sus datos en Editar ficha."}</p>${!u ? `<div class="hc-actions">${btn("Copiar desde Flotas existentes", "import")}${btn("+ Nueva empresa", "new-company")}</div>` : ""}<form id="acf-unit-form"><div class="hc-grid">${select("Empresa operadora *", "companyId", Object.fromEntries(config.companies.map((c) => [c.id, c.name])), company)}${select("Marca de aire acondicionado *", "brand", ctx.info.brands, v.brand || filters.brand || "hispacold")}${field("Número económico *", "unit", v.unit || "", "text", 'required maxlength="80"')}${field("Nombre de flota", "fleet", v.fleet || "", "text", 'maxlength="120"')}${field("Base / terminal", "base", v.base || "", "text", 'maxlength="120"')}${field("Marca del autobús", "busBrand", v.busBrand || "", "text", 'maxlength="120" placeholder="Volvo, Irizar…"')}${field("Modelo del autobús", "model", v.model || "", "text", 'maxlength="120"')}${field("Modelo del equipo AC", "acModel", v.acModel || "", "text", 'maxlength="120"')}${field("Serie del equipo AC", "acSerial", v.acSerial || "", "text", 'maxlength="120"')}</div>
      ${!u ? `<details class="acf-form-section"><summary>Registro por lote · hasta 100 unidades</summary><p>Una unidad por línea, o separadas por comas. Todos los registros usarán la misma empresa, marca y datos compartidos. La serie del equipo y las placas se dejan vacías para completarlas por unidad.</p><label class="hc-field"><b>Números económicos</b><textarea name="batch" rows="4" maxlength="8500" placeholder="301&#10;302&#10;303"></textarea></label><small id="acf-batch-count">Sin lote: se registrará el número económico individual.</small></details>` : ""}
      <details class="acf-form-section"><summary>Identificación y planificación</summary><div class="hc-grid">${field("Año", "year", v.year || "", "text", 'inputmode="numeric" pattern="(19|20)[0-9]{2}" maxlength="4"')}${field("Kilometraje", "mileage", v.mileage || "", "text", 'inputmode="numeric" pattern="[0-9]{1,9}" maxlength="9"')}${field("Número de obra", "workNumber", v.workNumber || "", "text", 'maxlength="120"')}${field("Placas", "plate", v.plate || "", "text", 'maxlength="120"')}${field("Vigencia de garantía del AC", "warrantyEnd", v.warrantyEnd || "", "date")}${field("Próximo servicio inicial", "initialNextDate", v.initialNextDate || "", "date")}${field("Vigencia de evaluación (días)", "reviewDays", v.reviewDays || 90, "number", 'min="1" max="365" required')}</div><p>El próximo servicio inicial se usa hasta que una orden de mantenimiento cerrada establezca una nueva programación.</p></details>
      <details class="acf-form-section" ${u ? "open" : ""}><summary>Evaluación del aire acondicionado</summary><p>Registra solo una condición comprobada. Sin evaluación, la unidad comienza en gris.</p><div class="hc-grid">${select("Condición comprobada", "manualCondition", config.conditions, v.manualCondition || "sin_evaluar")}${field("Fecha de evaluación", "checkedOn", v.checkedOn || "", "date", `max="${today()}"`)}</div><label class="hc-field"><b>Sustento de evaluación / observaciones</b><textarea name="conditionNote" rows="3" maxlength="2000">${esc(v.conditionNote || "")}</textarea></label></details>
      ${u ? `<label class="acf-active"><input name="active" type="checkbox" ${u.active ? "checked" : ""}> Unidad activa en Flotas AC</label><small>Al desactivar, se archiva en Flotas AC y se oculta al supervisor. Las órdenes y su historial se conservan.</small>` : ""}<div class="hc-actions">${btn("Cancelar", "close")}<button type="submit" class="hc-btn primary">${u ? "Guardar cambios" : "Registrar unidades"}</button></div></form>`);
    if (u) {
      $("#acf-unit-form [name=unit]").readOnly = true;
      $("#acf-unit-form [name=brand]").disabled = true;
      $("#acf-unit-form [name=companyId]").disabled = true;
    }
    $("#acf-unit-form [name=batch]")?.addEventListener("input", (e) => {
      const units = batchUnits(e.target.value);
      $("#acf-unit-form [name=unit]").required = !units.length;
      $("#acf-batch-count").textContent = units.length
        ? `${units.length} unidades en el lote · ${new Set(units.map((v) => v.toLowerCase())).size} números únicos`
        : "Sin lote: se registrará el número económico individual.";
    });
  }
  const batchUnits = (s) =>
    s
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  async function importList() {
    const r = await ctx.api(
      "/fleet/import-candidates?" +
        new URLSearchParams({ q: importSearch, offset: importOffset }),
    );
    window._acfCandidates = r.items;
    dialog(
      `<h2>Copiar datos desde Flotas</h2><p>Selecciona un autobús. Después asigna su marca de AC y verifica los datos; el registro original de Flotas se conserva.</p><form id="acf-import-form" class="hc-actions"><label class="hc-field"><b>Empresa o unidad</b><input name="q" value="${esc(importSearch)}" maxlength="180"></label><button type="submit" class="hc-btn primary">Buscar</button></form><div class="acf-company-list">${r.items.map((u, i) => `<article><div><b>${esc(u.company)} · ${esc(u.unit)}</b><span>${esc([u.busBrand, u.model].filter(Boolean).join(" · "))}</span></div>${btn("Seleccionar", "import-select", `data-index="${i}"`)}</article>`).join("") || "<p>Sin unidades para esta búsqueda.</p>"}</div><div class="hc-actions">${btn("Volver", "new-unit")}${btn("Anterior", "import-prev", importOffset === 0 ? "disabled" : "")}${btn("Siguiente", "import-next", r.hasMore ? "" : "disabled")}</div>`,
    );
  }
  let qrData;
  async function qrLabel() {
    qrData = await ctx.api(
      "/fleet/units/" + encodeURIComponent(detail.id) + "/qr",
    );
    await window.CarlabAssets.qr();
    const url = window.ACQR.url(qrData);
    dialog(
      `<h2>Etiqueta QR · Unidad ${esc(detail.unit)}</h2><p>${esc(detail.company)} · ${esc(brandName(detail.brand))}</p><img class="acf-qr-image" src="${window.ACQR.png(url)}" alt="QR del expediente de esta unidad"><p>Etiqueta frontal de 10.6 × 14.6 cm, con empresa, unidad y marca de AC. Imprime el PDF a tamaño real (100 %). Cualquier operador puede reportar una falla sin cuenta. Consultar el expediente y dar seguimiento requiere iniciar sesión.</p><div class="hc-actions">${btn("Descargar etiqueta PDF", "qr-download", "", true)}<a class="hc-btn" href="${esc(url)}" target="_blank" rel="noopener">Probar acceso</a>${btn("Volver a la ficha", "qr-back")}</div><details class="acf-qr-replace"><summary>Reemplazar un código perdido o comprometido</summary><p>El QR anterior dejará de funcionar, incluso en etiquetas y reportes ya impresos. Para reimprimir el mismo código, descarga la etiqueta.</p><label class="hc-field"><b>Motivo del reemplazo</b><input id="acf-qr-reason" maxlength="500"></label>${btn("Invalidar anterior y generar nuevo", "qr-replace")}</details>`,
    );
  }
  async function openDetail(id) {
    const r = await ctx.api(
      "/fleet/units/" + encodeURIComponent(id) + "?today=" + today(),
    );
    detail = r.unit;
    const u = detail;
    // Safari does not focus a button on pointer activation. Give the dialog
    // a concrete return target, including when opened from a QR or shortcut.
    if (!$("#acf-dialog")?.open)
      $(`.acf-unit[data-id="${CSS.escape(u.id)}"]`)?.focus({
        preventScroll: true,
      });
    dialog(`<div class="acf-detail-heading"><div><div class="hc-kicker">EXPEDIENTE DE CLIMATIZACIÓN</div><h2>Unidad ${esc(u.unit)}</h2><p>${esc(u.company)} · ${esc(brandName(u.brand))}</p></div><span class="acf-badge ${u.signal}">${esc(u.signalLabel)}</span></div>
      <div class="hc-actions">${btn("Cerrar", "close")}${config.canManage ? btn("Editar ficha / evaluación", "edit-unit") + (u.active ? btn("Etiqueta QR", "qr-label") + btn("Crear orden", "new-order") + btn("Eliminar unidad", "delete-unit") : btn("Restaurar unidad", "restore-unit")) : ""}${u.active ? btn("Reportar falla", "report-incident", "", true) + btn("Solicitar servicio", "request-service") + btn("Solicitar refacción", "request-part") : ""}</div>
      <section class="acf-reasons"><h3>Qué requiere atención</h3>${u.reasons.map((r) => `<div class="acf-reason ${r.color}"><i></i><div><b>${esc(r.text)}</b><p>${esc(r.detail)}</p></div></div>`).join("")}</section>
      ${ctx.external || ctx.visual ? '<details class="acp-filter-details"><summary>Datos de la unidad y del equipo AC</summary>' : ""}<dl class="acf-detail-facts">${[
        ["Región / base", [u.region, u.base].filter(Boolean).join(" · ")],
        ["Autobús", [u.busBrand, u.model, u.year].filter(Boolean).join(" · ")],
        ["Flota", u.fleet],
        ["Equipo AC", u.acModel],
        ["Serie AC", u.acSerial],
        ["Kilometraje", u.mileage],
        ["Número de obra", u.workNumber],
        ["Placas", u.plate],
        ["Garantía del equipo", fmt(u.warrantyEnd)],
        ["Próximo servicio", fmt(u.nextDate)],
        ["Evaluación de referencia", fmt(u.verifiedOn)],
        ["Origen de evaluación", u.verificationSource],
      ]
        .map(
          ([k, v]) =>
            `<div><dt>${esc(k)}</dt><dd>${esc(v || "Sin registrar")}</dd></div>`,
        )
        .join("")}</dl>${ctx.external || ctx.visual ? "</details>" : ""}
      ${u.conditionNote ? `<div class="hc-note"><b>Última evaluación manual · ${fmt(u.checkedOn)}</b><p>${esc(u.conditionNote)}</p></div>` : ""}
      <div class="acf-detail-tabs"><button type="button" data-af="tab" data-tab="orders" aria-pressed="true">Órdenes (${r.orders.length}${r.orders.length === 30 ? "+" : ""})</button><button type="button" data-af="tab" data-tab="requests" aria-pressed="false">Solicitudes / reportes (${r.requests.length}${r.requests.length === 30 ? "+" : ""})</button><button type="button" data-af="tab" data-tab="events" aria-pressed="false">Bitácora</button></div>
      <section data-af-panel="orders"><p class="acf-muted">Últimas 30 órdenes del equipo, de la más reciente a la más antigua.</p>${r.orders.map((o) => `<article class="acf-history"><div><b>${esc(o.folio)} · ${esc(ctx.library.statuses[o.status] || o.status)}</b><small>${fmt(o.service_date)} · ${esc(ctx.library.types[o.type] || o.type)}</small><p>${esc(o.symptoms || "Sin motivo registrado")}</p></div>${btn("Ver orden", "order", `data-id="${esc(o.id)}"`)}</article>`).join("") || '<div class="hc-empty">Sin órdenes registradas para esta unidad y marca.</div>'}</section>
      <section data-af-panel="requests" hidden><p class="acf-muted">Últimos 30 reportes y solicitudes de servicio o refacciones.</p>${r.requests.map((r) => `<article class="acf-history"><div><b>${esc(r.folio)} · ${esc(ctx.info.stages[r.status] || { nuevo: "Nuevo", revision: "En revisión", atencion: "En atención", confirmacion: "Por confirmar", resuelto: "Resuelto", descartado: "Descartado" }[r.status] || r.status)}</b><small>${fmt(r.created_at)} · ${r.incident_number ? "Reporte AC" : r.kind === "service" ? "Servicio" : "Refacciones"}</small><p>${esc(r.kind === "part" ? `${r.quantity} × ${r.part_name}` : r.description)}</p></div>${btn(r.incident_number ? "Ver reporte" : "Ver solicitud", "request", `data-id="${esc(r.id)}"`)}</article>`).join("") || '<div class="hc-empty">Sin solicitudes registradas.</div>'}</section>
      <section data-af-panel="events" hidden><p class="acf-muted">Últimos 30 cambios del registro de flota.</p>${r.events.map((e) => `<article class="acf-history"><div><b>${esc(e.action)}</b><small>${fmt(e.created_at)} · ${esc(e.actor_name)}</small><p>${esc(e.notes)}</p></div></article>`).join("")}</section>`);
  }
  function removalForm(restore = false) {
    dialog(
      `<h2>${restore ? "Restaurar" : "Eliminar"} unidad ${esc(detail.unit)}</h2><p>${esc(detail.company)} · ${esc(brandName(detail.brand))}</p><p>${restore ? "La unidad volverá a mostrarse en la flota y su QR estará disponible." : "Se retirará de la flota activa y dejará de estar disponible para el supervisor y mediante QR. Las órdenes, solicitudes e historial se conservan. Podrás recuperarla en Eliminadas / archivadas."}</p><form id="acf-removal-form" data-restore="${restore}">${field("Motivo *", "reason", "", "text", 'required minlength="3" maxlength="1000"')}<div class="hc-actions">${btn("Cancelar", "qr-back")}<button type="submit" class="hc-btn ${restore ? "primary" : "acf-danger"}">${restore ? "Restaurar unidad" : "Confirmar eliminación"}</button></div></form>`,
    );
  }
  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (!form.id.startsWith("acf-")) return;
    e.preventDefault();
    if (working) return;
    const b = Object.fromEntries(new FormData(form));
    if (form.id === "acf-filters") {
      Object.assign(filters, b, { offset: 0 });
      await load();
      return;
    }
    if (form.id === "acf-import-form") {
      importSearch = b.q;
      importOffset = 0;
      await importList();
      return;
    }
    if (!form.reportValidity()) return;
    working = true;
    form.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      if (form.id === "acf-removal-form") {
        const restore = form.dataset.restore === "true";
        await ctx.api(
          "/fleet/units/" + detail.id + (restore ? "/restore" : ""),
          {
            method: restore ? "POST" : "DELETE",
            body: JSON.stringify({ version: detail.version, reason: b.reason }),
          },
        );
        $("#acf-dialog").close();
        await load();
        ctx.toast(
          restore
            ? "Unidad restaurada."
            : "Unidad eliminada de la flota activa. Su historial se conserva.",
        );
      }
      if (form.id === "acf-company-form") {
        if (editingCompany) b.version = editingCompany.version;
        await ctx.api(
          "/fleet/companies" + (editingCompany ? "/" + editingCompany.id : ""),
          editingCompany ? patch(b) : post(b),
        );
        $("#acf-dialog").close();
        await load();
        ctx.toast("Empresa guardada. Ya puedes registrar sus unidades.");
      }
      if (form.id === "acf-unit-form") {
        let registered;
        b.reviewDays = Number(b.reviewDays);
        b.active = editingUnit
          ? form.querySelector("[name=active]").checked
          : true;
        if (editingUnit) {
          b.version = editingUnit.version;
          await ctx.api("/fleet/units/" + editingUnit.id, patch(b));
        } else {
          const units = batchUnits(b.batch || "");
          if (units.length) {
            if (units.length > 100)
              throw new Error("El lote admite hasta 100 unidades.");
            if (
              new Set(units.map((u) => u.toLowerCase())).size !== units.length
            )
              throw new Error("Hay números económicos repetidos en el lote.");
            registered = await ctx.api(
              "/fleet/units",
              post({
                companyId: b.companyId,
                units: units.map((unit) => ({
                  ...b,
                  unit,
                  acSerial: "",
                  plate: "",
                })),
              }),
            );
          } else registered = await ctx.api("/fleet/units", post(b));
          Object.assign(filters, {
            company: b.companyId,
            brand: b.brand,
            q: "",
            region: "",
            base: "",
            signal: "",
            focus: "",
            archived: "",
            offset: 0,
          });
        }
        $("#acf-dialog").close();
        await load();
        if (registered?.restoredCount && registered.count === 1) {
          await openDetail(registered.ids[0]);
          ctx.toast(
            "Unidad reincorporada. Conserva su ficha, historial y QR; puedes actualizar sus datos en Editar ficha.",
          );
        } else
          ctx.toast(
            editingUnit
              ? "Ficha actualizada."
              : registered?.restoredCount
                ? `${registered.createdCount} nuevas · ${registered.restoredCount} reincorporadas con su ficha, historial y QR.`
                : "Unidades registradas.",
          );
      }
    } catch (err) {
      error(err);
    } finally {
      working = false;
      form.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-af]");
    if (!b || working) return;
    try {
      const a = b.dataset.af;
      if (!$("#acf-dialog")?.open && ["new-unit", "companies"].includes(a))
        b.focus({ preventScroll: true });
      if (a === "delete-unit") removalForm();
      if (a === "restore-unit") removalForm(true);
      if (a === "qr-label") await qrLabel();
      if (a === "qr-back") await openDetail(detail.id);
      if (a === "qr-download")
        await window.ACQR.label(detail, qrData, brandName(detail.brand));
      if (a === "qr-replace") {
        const reason = $("#acf-qr-reason").value.trim();
        if (reason.length < 3)
          throw new Error("Escribe el motivo del reemplazo.");
        working = true;
        b.disabled = true;
        try {
          await ctx.api(
            "/fleet/units/" + encodeURIComponent(detail.id) + "/qr/replace",
            post({ generation: qrData.generation, reason }),
          );
          await qrLabel();
          ctx.toast("Código reemplazado. Imprime la nueva etiqueta.");
        } finally {
          working = false;
          b.disabled = false;
        }
      }
      if (a === "new-order") {
        close();
        await window.CarlabACNav.newFromFleet(detail);
      }
      if (a === "close") close();
      if (a === "refresh") await load();
      if (a === "clear") {
        Object.keys(filters).forEach(
          (k) => (filters[k] = k === "offset" ? 0 : ""),
        );
        await load();
      }
      if (a === "signal") {
        filters.signal = b.dataset.signal;
        if (ctx.external) filters.focus = "";
        filters.offset = 0;
        await load(false);
      }
      if (a === "focus") {
        filters.focus =
          filters.focus === b.dataset.focus ? "" : b.dataset.focus;
        filters.offset = 0;
        filters.signal = "";
        await load(false);
      }
      if (a === "company-filter") {
        filters.company = b.dataset.id;
        filters.offset = 0;
        await load();
      }
      if (a === "next" || a === "prev") {
        filters.offset += a === "next" ? 60 : -60;
        await load(false);
      }
      if (a === "companies") await companyList();
      if (a === "new-company") companyForm();
      if (a === "edit-company")
        companyForm(config.companies.find((c) => c.id === b.dataset.id));
      if (a === "new-unit") await unitForm();
      if (a === "edit-unit") await unitForm(detail);
      if (a === "detail") await openDetail(b.dataset.id);
      if (a === "import") {
        importOffset = 0;
        importSearch = "";
        await importList();
      }
      if (a === "import-prev" || a === "import-next") {
        importOffset += a === "import-next" ? 50 : -50;
        await importList();
      }
      if (a === "import-select") {
        const u = window._acfCandidates[Number(b.dataset.index)],
          company = config.companies.find(
            (c) =>
              c.name.trim().toLowerCase() === u.company.trim().toLowerCase(),
          );
        if (!company) {
          companyForm();
          $("#acf-company-form [name=name]").value = u.company;
          ctx.toast(
            "Registra primero esta empresa y vuelve a seleccionar su unidad.",
          );
        } else await unitForm(null, { ...u, companyId: company.id });
      }
      if (a === "tab") {
        document
          .querySelectorAll("[data-af-panel]")
          .forEach((p) => (p.hidden = p.dataset.afPanel !== b.dataset.tab));
        document
          .querySelectorAll("[data-af=tab]")
          .forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
      }
      if (a === "report-incident") {
        close();
        await ctx.newIncident(detail);
      }
      if (a === "request-service" || a === "request-part") {
        close();
        await ctx.newRequest(
          a === "request-service" ? "service" : "part",
          "",
          detail,
        );
      }
      if (a === "order") {
        close();
        if (ctx.external) await ctx.navigate("order", b.dataset.id);
        else await window.CarlabACNav.open(b.dataset.id);
      }
      if (a === "request") {
        close();
        await ctx.navigate("requests", b.dataset.id);
      }
      if (a === "export") {
        b.disabled = true;
        try {
          const blob = await ctx.api("/fleet/export?" + query(), {
              blob: true,
            }),
            url = URL.createObjectURL(blob),
            link = document.createElement("a");
          link.href = url;
          link.download = "Flotas-AC-" + today() + ".csv";
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } finally {
          b.disabled = false;
        }
      }
    } catch (err) {
      error(err);
    }
  });
  window.addEventListener("pagehide", () => clearInterval(timer));
  window.ACFleet = { show, openDetail };
})();
