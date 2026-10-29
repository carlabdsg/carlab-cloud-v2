"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;
  const view = {
    reportFilter: "all",
    company: "",
    fleet: "",
    detailId: "",
    reportTab: "summary",
    fleetTab: "summary",
    step: 0,
    units: [],
    unitsLoading: false,
    unitsError: false,
    unitLoadId: 0,
    manualUnit: false,
    session: "",
    returnFocus: null,
  };
  const icons = {
    report: '<path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/>',
    bus: '<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M8 15h1m6 0h1M9 6h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    chart: '<path d="M4 3v18h17M9 17v-6m5 6V7m5 10V4"/>',
    box: '<path d="m12 3 9 5-9 5-9-5zM3 8v10l9 4 9-4V8M12 13v9"/>',
    people:
      '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m2 3a6 6 0 0 1 3 5"/>',
    folder: '<path d="M3 6h7l2 2h9v12H3z"/>',
    qr: '<path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6z"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>',
  };
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.folder}</svg>`;
  const status = (item) =>
    item.estatusValidacion === "rechazada"
      ? ["Rechazada", "muted"]
      : item.estatusOperativo === "terminada"
        ? ["Terminada", "green"]
        : ["nueva", "pendiente de revisión"].includes(item.estatusValidacion)
          ? ["Por revisar", "amber"]
          : item.estatusOperativo === "espera refacción"
            ? ["Espera refacción", "red"]
            : [item.estatusOperativo || "Sin iniciar", "blue"];
  const pill = (label, color) =>
    `<span class="rw-pill ${color}"><i></i>${esc(label)}</span>`;
  function element(tag, className, html) {
    const node = document.createElement(tag);
    node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }
  const labels = {
    board: ["Reportes", "Fallas, garantías y seguimiento"],
    fleet: ["Flotas", "Estado y expediente de cada unidad"],
    report: [
      "Nuevo reporte",
      "Identifica la unidad, describe la incidencia y adjunta evidencia",
    ],
    analytics: ["Indicadores", "Distribución de reportes y reincidencias"],
    history: [
      "Historial por unidad",
      "Consulta los antecedentes de cada vehículo",
    ],
    schedule: ["Agenda", "Ingresos y servicios programados"],
    services: ["Servicios", "Consulta y exporta el trabajo registrado"],
    parts: ["Refacciones", "Solicitudes y entregas pendientes"],
    stock: ["Inventario", "Existencias y movimientos de almacén"],
    cobranza: ["Cobranza", "Cotizaciones, ventas y pagos"],
    campaigns: ["Campañas", "Seguimiento de trabajos por flota"],
    users: ["Usuarios", "Personas y permisos de acceso"],
    requests: ["Solicitudes de acceso", "Revisión de registros de operadores"],
    quotes: ["Cotizaciones", "PDF por unidad y respuesta de la empresa"],
    companies: ["Empresas", "Directorio y contactos"],
  };
  function panelChanged(panel) {
    const [title, subtitle] = labels[panel] || labels.board;
    $("pageTitle").textContent =
      panel === "report" && state.editingGarantiaId ? "Editar reporte" : title;
    $("statusLegend").textContent = subtitle;
    $("workspaceMenu")?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("rw-menu-open");
    if (panel === "report") {
      updateSteps();
      loadFormUnits();
    }
  }
  function initShell() {
    $("rwPasswordToggle").addEventListener("click", () => {
      const show = $("loginPassword").type === "password";
      $("loginPassword").type = show ? "text" : "password";
      $("rwPasswordToggle").textContent = show ? "Ocultar" : "Ver";
      $("rwPasswordToggle").setAttribute("aria-pressed", String(show));
      $("rwPasswordToggle").setAttribute(
        "aria-label",
        show ? "Ocultar contraseña" : "Mostrar contraseña",
      );
    });
    const brand = document.querySelector(".brand-lockup");
    brand.innerHTML =
      '<div class="rw-brand">CARLAB<span>CLOUD</span></div><p>REPORTES Y FLOTAS</p>';
    document.querySelector(".topbar .topbar-kicker").textContent =
      "OPERACIÓN / CARLAB";
    const navIcons = {
      navBoardBtn: "report",
      navNewReportBtn: "plus",
      navQuotesBtn: "report",
      navFleetBtn: "bus",
      navScheduleBtn: "calendar",
      navAnalyticsBtn: "chart",
      navHistoryBtn: "folder",
      navServicesBtn: "report",
      navPartsBtn: "box",
      navStockBtn: "box",
      navCobranzaBtn: "chart",
      navCampaignsBtn: "calendar",
      navUsersBtn: "people",
      navRequestsBtn: "people",
      navCompaniesBtn: "folder",
    };
    for (const [id, name] of Object.entries(navIcons)) {
      const node = $(id);
      node.innerHTML = icon(name) + `<span>${esc(node.textContent)}</span>`;
    }
    $("navStockBtn").querySelector("span").textContent = "Inventario";
    const menu = button("☰", "rw-menu-toggle", () => {
      const open = document.body.classList.toggle("rw-menu-open");
      menu.setAttribute("aria-expanded", String(open));
    });
    menu.id = "workspaceMenu";
    menu.setAttribute("aria-label", "Abrir o cerrar navegación");
    menu.setAttribute("aria-expanded", "false");
    document.querySelector(".topbar").prepend(menu);
    const backdrop = button("", "rw-menu-backdrop", () => {
      document.body.classList.remove("rw-menu-open");
      menu.setAttribute("aria-expanded", "false");
    });
    backdrop.setAttribute("aria-label", "Cerrar navegación");
    document.body.append(backdrop);
    $("fleetPanel").querySelector(".fleet-title").textContent =
      "Empresas y unidades";
    $("fleetPanel").querySelector(".fleet-subtitle").textContent =
      "Selecciona una empresa para consultar su flota.";
    $("fleetRefreshBtn").textContent = "Actualizar";
    $("fleetSearchInput").setAttribute("aria-label", "Buscar en flotas");
    els.reportFormPanel.querySelector(".topbar-kicker").textContent =
      "REGISTRO DE INCIDENCIA";
    els.reportFormPanel.querySelector(".panel-head .badge").textContent =
      "Fallas y garantías";
    $("searchInput").setAttribute("aria-label", "Buscar reportes");
    $("searchInput").placeholder = "Buscar folio, unidad, empresa o falla…";
    const searchBox = element("div", "rw-report-search");
    searchBox.innerHTML =
      '<label id="rwSearchLabel" for="searchInput">Buscar reportes</label><div class="rw-search-controls"></div>';
    $("searchInput").before(searchBox);
    searchBox.querySelector(".rw-search-controls").append($("searchInput"));
    $("searchInput").type = "search";
    $("searchInput").autocomplete = "off";
    $("searchInput").spellcheck = false;
    const clearSearch = button("Limpiar", "btn btn-ghost", () => {
      $("searchInput").value = "";
      renderReports();
      $("searchInput").focus();
    });
    clearSearch.id = "rwClearSearch";
    clearSearch.hidden = true;
    clearSearch.setAttribute("aria-label", "Limpiar búsqueda de reportes");
    searchBox.querySelector(".rw-search-controls").append(clearSearch);
    $("searchInput").addEventListener("search", renderReports);
    $("validationFilter").setAttribute("aria-label", "Filtrar por validación");
    $("operationalFilter").setAttribute(
      "aria-label",
      "Filtrar por estado del trabajo",
    );
    const head = $("boardPanel").querySelector(".panel-head");
    head.innerHTML =
      '<div><div class="topbar-kicker">SEGUIMIENTO</div><h3 id="listTitle">Reportes registrados</h3><span id="rwReportCount" class="muted small"></span></div>';
    const create = button("+ Nuevo reporte", "btn btn-primary", () => {
      $("navNewReportBtn").click();
    });
    create.id = "rwNewReport";
    head.append(create);
    const summary = element("div", "rw-metrics");
    summary.id = "rwReportMetrics";
    $("filtersPanel").before(summary);
    const company = element("select", "");
    company.id = "rwReportCompany";
    company.setAttribute("aria-label", "Empresa de los reportes");
    company.innerHTML = '<option value="">Todas las empresas</option>';
    $("filtersPanel").append(company);
    company.addEventListener("change", renderReports);
    const reset = button("Limpiar filtros", "btn btn-ghost", () => {
      view.reportFilter = "all";
      company.value = "";
      resetBoardFilters();
    });
    $("filtersPanel").append(reset);
    const maintenance = element(
      "details",
      "rw-fleet-tools fleet-admin-only",
      "<summary>Administración de unidades</summary>",
    );
    $("fleetBulkDeleteBox").before(maintenance);
    maintenance.append($("fleetBulkDeleteBox"));
    const filters = element(
      "details",
      "rw-advanced-filters",
      '<summary>Filtros de reportes</summary><div class="rw-filter-fields"></div>',
    );
    filters.id = "rwAdvancedFilters";
    const filterFields = filters.querySelector(".rw-filter-fields");
    [els.validationFilter, els.operationalFilter, company, reset].forEach(
      (node) => filterFields.append(node),
    );
    $("filtersPanel").append(filters);
    const wide = matchMedia("(min-width:901px)");
    filters.open = wide.matches;
    wide.addEventListener("change", (e) => (filters.open = e.matches));
    const fleetNav = element("div", "rw-fleet-nav");
    fleetNav.id = "rwFleetNav";
    $("fleetFormBox").before(fleetNav);
    // Keep existing supplementary modules and their actions, with plain labels.
    const replacements = {
      "REFACCIÓN PREMIUM": "REFACCIONES",
      "Alta premium de solicitud independiente con trazabilidad y evidencia.":
        "Registra la pieza requerida y los datos para su seguimiento.",
      "Lectura comercial y operativa": "Indicadores de reportes",
      "FASE 3": "INDICADORES",
    };
    document
      .querySelectorAll(".topbar-kicker,.parts-request-head p,.panel-head h3")
      .forEach((node) => {
        if (replacements[node.textContent.trim()])
          node.textContent = replacements[node.textContent.trim()];
      });
  }
  function renderReports() {
    if (!state.user) return;
    const operator = state.user.role === "operador";
    const unitSearch = normalizeText($("searchInput").value).trim();
    const searchLabel = operator
      ? "Buscar reportes por unidad"
      : "Buscar reportes";
    $("rwSearchLabel").textContent = searchLabel;
    $("searchInput").setAttribute("aria-label", searchLabel);
    $("searchInput").placeholder = operator
      ? "Número de unidad · Ej. B310 o 325"
      : "Buscar folio, unidad, empresa o falla…";
    $("rwClearSearch").hidden = !$("searchInput").value;
    const all = state.garantias || [],
      groups = [
        ["all", "Todos", all.length],
        [
          "review",
          "Por revisar",
          all.filter((r) => status(r)[0] === "Por revisar").length,
        ],
        [
          "work",
          "En seguimiento",
          all.filter(
            (r) =>
              !["Por revisar", "Terminada", "Rechazada"].includes(status(r)[0]),
          ).length,
        ],
        [
          "closed",
          "Cerrados",
          all.filter((r) => ["Terminada", "Rechazada"].includes(status(r)[0]))
            .length,
        ],
      ];
    const metrics = $("rwReportMetrics");
    metrics.hidden = state.activePanel !== "board";
    metrics.innerHTML = groups
      .map(
        ([key, label, count]) =>
          `<button type="button" data-group="${key}" class="rw-metric ${key === view.reportFilter ? "selected" : ""}" aria-pressed="${key === view.reportFilter}"><span>${label}</span><strong>${count}</strong><small>${key === "all" ? "Reportes cargados" : key === "review" ? "Pendientes de validación" : key === "work" ? "Trabajo por completar" : "Terminados o rechazados"}</small></button>`,
      )
      .join("");
    metrics.querySelectorAll("button").forEach(
      (btn) =>
        (btn.onclick = () => {
          view.reportFilter = btn.dataset.group;
          renderReports();
        }),
    );
    const company = $("rwReportCompany"),
      previous = company.value;
    company.replaceChildren(
      new Option("Todas las empresas", ""),
      ...[...new Set(all.map((r) => r.empresa))]
        .sort()
        .map((name) => new Option(name, name)),
    );
    company.value = previous;
    const available = operator
      ? all.filter(
          (r) =>
            !unitSearch ||
            normalizeText(r.numeroEconomico).includes(unitSearch),
        )
      : filteredGarantias();
    const items = available
      .filter((r) => !company.value || r.empresa === company.value)
      .filter(
        (r) =>
          view.reportFilter === "all" ||
          (view.reportFilter === "review"
            ? status(r)[0] === "Por revisar"
            : view.reportFilter === "closed"
              ? ["Terminada", "Rechazada"].includes(status(r)[0])
              : !["Por revisar", "Terminada", "Rechazada"].includes(
                  status(r)[0],
                )),
      );
    $("rwNewReport").hidden = !isRole("admin", "operador");
    $("rwReportCount").textContent =
      `${items.length} de ${all.length} reportes cargados${all.length >= 300 ? " · Consulta antecedentes en Historial por unidad" : ""}`;
    const list = els.garantiasList;
    list.classList.add("rw-report-list");
    list.replaceChildren();
    for (const item of items) {
      const [label, color] = status(item),
        row = element("article", "rw-report-row");
      row.dataset.reportId = item.id;
      const open = element(
        "button",
        "rw-report-open",
        `<span class="rw-report-symbol">${icon("report")}</span><span class="rw-report-main"><span class="rw-eyebrow">${esc(item.folio || "Reporte")} <span>· ${esc(fmtDate(item.createdAt))}</span></span><strong>Unidad ${esc(item.numeroEconomico)} <span>${esc(item.empresa)}</span></strong><span class="rw-description">${esc(item.descripcionFallo || "Sin descripción")}</span><span class="rw-report-meta">${esc(item.modelo || "Modelo no indicado")} · Obra ${esc(item.numeroObra || "—")}${item.solicitaRefaccion ? " · Solicita refacción" : ""}</span></span><span class="rw-report-status">${pill(label, color)}<small>${esc(item.tipoIncidente || "Incidencia")}</small></span><span class="rw-arrow">${icon("arrow")}</span>`,
      );
      open.type = "button";
      open.onclick = () => {
        view.returnFocus = open;
        openReportDetailModal(item);
      };
      row.append(open);
      list.append(row);
    }
    els.emptyState.classList.toggle("hidden", !!items.length);
    $("rwReportMetrics").hidden = state.activePanel !== "board";
  }
  function tabs(root, entries, selected, onSelect) {
    const nav = element("div", "rw-tabs");
    nav.setAttribute("role", "tablist");
    entries.forEach(([key, label, nodes]) => {
      const section = element("section", "rw-tab-panel");
      section.dataset.tab = key;
      section.id = `rw-tab-${root.id}-${key}`;
      section.setAttribute("role", "tabpanel");
      nodes.filter(Boolean).forEach((node) => section.append(node));
      const tab = button(label, "rw-tab", () => activate(key));
      tab.setAttribute("role", "tab");
      tab.id = section.id + "-button";
      tab.setAttribute("aria-controls", section.id);
      section.setAttribute("aria-labelledby", tab.id);
      tab.dataset.key = key;
      nav.append(tab);
      root.append(section);
    });
    function activate(key) {
      entries.forEach(([id]) => {
        const tab = nav.querySelector(`[data-key="${id}"]`);
        tab.setAttribute("aria-selected", String(key === id));
        tab.tabIndex = key === id ? 0 : -1;
        root.querySelector(`[data-tab="${id}"]`).hidden = key !== id;
      });
      onSelect(key);
    }
    nav.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      const all = [...nav.children],
        index = all.indexOf(document.activeElement),
        next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? all.length - 1
              : (index + (e.key === "ArrowRight" ? 1 : -1) + all.length) %
                all.length;
      e.preventDefault();
      all[next].click();
      all[next].focus();
    });
    root.prepend(nav);
    activate(
      entries.some(([id]) => id === selected) ? selected : entries[0][0],
    );
  }
  function decorateReportDetail(full) {
    if (view.detailId !== full.id) view.reportTab = "summary";
    view.detailId = full.id;
    const root = els.reportDetailContent,
      body = root.querySelector(".report-detail-scroll");
    root.querySelector(".report-detail-head-sticky p").textContent =
      `${full.empresa} · ${status(full)[0]}`;
    const gallery = body.querySelector(".owner-gallery-card"),
      activities = body.querySelector("[data-authorized-activities-container]");
    const summary = [...body.children].filter(
      (node) => node !== gallery && node !== activities,
    );
    const actions = buildReportActions(full);
    // Existing actions keep the same permission checks and API handlers.
    [...actions.querySelectorAll(".action-row:first-child > button")]
      .filter((btn) =>
        ["Ver ficha", "PDF", "Asignar actividades autorizadas"].includes(
          btn.textContent,
        ),
      )
      .forEach((btn) => btn.remove());
    const guidance = element(
      "div",
      "rw-section-intro",
      "<h4>Seguimiento del reporte</h4><p>Registra la validación y el avance del trabajo. Los cambios conservan el mismo folio.</p>",
    );
    const management = element("div", "rw-management");
    management.append(guidance, actions);
    if (activities) management.append(activities);
    tabs(
      body,
      [
        ["summary", "Resumen", summary],
        ["evidence", "Evidencias", [gallery]],
        ["management", "Seguimiento", [management]],
      ],
      view.reportTab,
      (key) => (view.reportTab = key),
    );
    $("reportDetailClose").focus();
  }
  async function refreshReport(id) {
    delete state.garantiaFullCache[id];
    if (
      view.detailId === id &&
      !els.reportDetailModal.classList.contains("hidden")
    )
      await openReportDetailModal({ id });
  }
  function reportClosed() {
    if (view.detailId) state.boardDirtyIds.delete(view.detailId);
    view.detailId = "";
    view.returnFocus?.focus();
  }
  const scopedUnits = () =>
    (state.fleetUnits || [])
      .filter((u) => !view.company || u.empresa === view.company)
      .filter((u) => !view.fleet || u.nombreFlota === view.fleet);
  function fleetState(u) {
    return u.statusAuto === "critical"
      ? ["Requiere atención", "red"]
      : u.statusAuto === "warning"
        ? ["En seguimiento", "amber"]
        : u.campaignActiva
          ? ["Campaña activa", "blue"]
          : ["Operando", "green"];
  }
  function renderFleet() {
    if (!state.user || !els.fleetUnitsList) return;
    const all = state.fleetUnits || [],
      nav = $("rwFleetNav"),
      companyNames = [...new Set(all.map((u) => u.empresa))].sort();
    if (view.company && !companyNames.includes(view.company)) {
      view.company = "";
      view.fleet = "";
    }
    const scoped = scopedUnits(),
      query = normalizeText(els.fleetSearchInput.value.trim()),
      filter = els.fleetStatusFilter.value;
    nav.replaceChildren();
    const heading = element(
      "div",
      "rw-fleet-breadcrumb",
      `<div><span class="rw-eyebrow">FLOTAS REGISTRADAS</span><h3>${esc(view.company || "Todas las empresas")}</h3><p>${scoped.length} unidades${view.fleet ? " · " + esc(view.fleet) : ""}</p></div>`,
    );
    const controls = element("div", "rw-inline");
    if (view.company)
      controls.append(
        button("← Empresas", "btn btn-ghost", () => {
          view.company = "";
          view.fleet = "";
          els.fleetSearchInput.value = "";
          renderFleet();
        }),
      );
    if (view.company) {
      const fleets = [
        ...new Set(
          all
            .filter((u) => u.empresa === view.company)
            .map((u) => u.nombreFlota)
            .filter(Boolean),
        ),
      ].sort();
      if (fleets.length) {
        const select = element("select", "");
        select.setAttribute("aria-label", "Flota");
        select.replaceChildren(
          new Option("Todas las flotas", ""),
          ...fleets.map((f) => new Option(f, f)),
        );
        select.value = view.fleet;
        select.onchange = () => {
          view.fleet = select.value;
          renderFleet();
        };
        controls.append(select);
      }
    }
    const qr = button("Etiquetas QR", "btn btn-secondary", () =>
      openQr(scoped),
    );
    qr.id = "rwFleetQr";
    qr.disabled = !scoped.length;
    controls.append(qr);
    if (view.company && isRole("admin")) {
      const config = button("Configurar QR", "btn btn-primary", () =>
        openQrSettings(view.company, view.fleet || null),
      );
      config.id = "rwFleetQrSettings";
      controls.append(config);
    }
    heading.append(controls);
    nav.append(heading);
    const colors = ["green", "amber", "red", "blue"];
    const metrics = element("div", "rw-fleet-metrics");
    [
      ["green", "Operando"],
      ["amber", "En seguimiento"],
      ["red", "Requieren atención"],
      ["blue", "En campaña"],
    ].forEach(([color, label]) => {
      const n = scoped.filter((u) => fleetState(u)[1] === color).length;
      metrics.append(
        element(
          "div",
          `rw-fleet-metric ${color}`,
          `<span>${label}</span><strong>${n}</strong>`,
        ),
      );
    });
    nav.append(metrics);
    const list = els.fleetUnitsList;
    list.className = "rw-fleet-grid";
    list.replaceChildren();
    if (!view.company && !query && filter === "todos") {
      companyNames.forEach((name) => {
        const units = all.filter((u) => u.empresa === name),
          attention = units.filter((u) => fleetState(u)[1] !== "green").length;
        const card = element(
          "button",
          "rw-company-card",
          `<span class="rw-company-top">${icon("folder")}<span>${units.length} unidades</span></span><h4>${esc(name)}</h4><div class="rw-fleet-bar">${colors.map((color) => `<i class="${color}" style="flex:${units.filter((u) => fleetState(u)[1] === color).length}"></i>`).join("")}</div><span class="rw-company-bottom">${attention ? `${attention} con seguimiento pendiente` : "Flota operando"} ${icon("arrow")}</span>`,
        );
        card.type = "button";
        card.onclick = () => {
          view.company = name;
          view.fleet = "";
          renderFleet();
        };
        list.append(card);
      });
    } else {
      const items = scoped
        .filter(
          (u) =>
            !query ||
            normalizeText(
              `${u.numeroEconomico} ${u.empresa} ${u.modelo} ${u.numeroObra} ${u.nombreFlota}`,
            ).includes(query),
        )
        .filter(
          (u) =>
            filter === "todos" ||
            (filter === "poliza"
              ? u.polizaActiva
              : filter === "campania"
                ? u.campaignActiva
                : u.statusAuto === filter),
        );
      items.sort(
        (a, b) =>
          ({ red: 3, amber: 2, blue: 1, green: 0 })[fleetState(b)[1]] -
            { red: 3, amber: 2, blue: 1, green: 0 }[fleetState(a)[1]] ||
          String(a.numeroEconomico).localeCompare(
            String(b.numeroEconomico),
            "es",
            { numeric: true },
          ),
      );
      for (const unit of items) {
        const [label, color] = fleetState(unit);
        const card = element(
          "button",
          `rw-unit-card ${color}`,
          `<span class="rw-unit-top">${pill(label, color)}<span>${esc(unit.marca || "Unidad")}</span></span><strong class="rw-unit-number">${esc(unit.numeroEconomico)}</strong><span class="rw-unit-company">${esc(unit.empresa)}${unit.nombreFlota ? " · " + esc(unit.nombreFlota) : ""}</span><span class="rw-bus" style="--bus-image:url('${fleetBusAsset(unit)}')" aria-hidden="true"></span><span class="rw-unit-footer"><span><strong>${Number(unit.openReportsCount || 0)}</strong> reportes abiertos</span><span>Ver expediente ${icon("arrow")}</span></span>`,
        );
        card.type = "button";
        card.dataset.unitId = unit.id;
        card.onclick = () => {
          view.returnFocus = card;
          openFleetUnitDetail(unit.id);
        };
        list.append(card);
      }
    }
    if (!list.childElementCount)
      list.append(
        element(
          "div",
          "rw-empty",
          "No se encontraron unidades. Ajusta los filtros o registra una nueva unidad.",
        ),
      );
    renderFleetDetail();
  }
  function decorateFleetDetail(unit) {
    const root = $("fleetDetailModalContent");
    if (!root) return;
    const header = root.querySelector(".fleet-detail-head");
    const close = $("fleetCloseDetailBtn");
    close.textContent = "×";
    close.className = "rw-close";
    close.setAttribute("aria-label", "Cerrar expediente");
    const qr = button("Etiqueta QR", "btn btn-secondary", () => openQr([unit]));
    header.querySelector(".stack-inline").prepend(qr);
    const summary = root.querySelector(".fleet-detail-summary"),
      hero = root.querySelector(".fleet-hero"),
      insights = root.querySelector(".fleet-owner-insights"),
      gallery = root.querySelector(".owner-gallery-card"),
      columns = root.querySelector(".fleet-columns");
    const costForm = root.querySelector(".fleet-cost-form"),
      statusControl = root.querySelector(".fleet-status-admin");
    if (costForm) costForm.remove();
    if (view.fleetDetailId !== unit.id) {
      view.fleetTab = "summary";
      view.fleetDetailId = unit.id;
    }
    const body = element("div", "rw-fleet-detail-body");
    body.id = "rw-fleet-detail-body";
    root.append(body);
    const reports = columns?.children[0],
      costs = columns?.children[1];
    if (reports) {
      [...reports.querySelectorAll(".table-row")].forEach((row, index) => {
        const report = state.selectedFleetUnit.reports[index];
        if (!report) return;
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.setAttribute("aria-label", `Abrir reporte ${report.folio || ""}`);
        row.onclick = () => openReportDetailModal(report);
        row.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            row.click();
          }
        };
      });
    }
    tabs(
      body,
      [
        ["summary", "Unidad", [summary, hero]],
        ["reports", "Reportes", [reports]],
        ["services", "Servicios y piezas", [insights]],
        ["costs", "Costos", [costs, costForm]],
        ["evidence", "Evidencias", [gallery]],
      ],
      view.fleetTab,
      (key) => (view.fleetTab = key),
    );
    columns?.remove();
  }
  function fleetClosed() {
    view.fleetDetailId = "";
    view.fleetTab = "summary";
    view.returnFocus?.focus();
  }
  function initForm() {
    const form = els.reportForm,
      fields = [...form.children];
    form.classList.add("rw-guided-form");
    const steps = element("div", "rw-form-steps");
    steps.id = "rwFormSteps";
    ["Unidad y contacto", "Incidencia y evidencia", "Revisión y firma"].forEach(
      (label, i) => {
        const btn = button(`${i + 1}. ${label}`, "rw-form-step", () =>
          goStep(i),
        );
        btn.dataset.step = String(i);
        steps.append(btn);
      },
    );
    form.before(steps);
    const groups = [[2, 0, 1, 4, 5, 6], [7, 8, 9, 10, 11], [12]];
    groups.forEach((indexes, i) => {
      const section = element("section", "rw-form-section");
      section.dataset.step = String(i);
      section.id = `rw-form-step-${i}`;
      const titles = [
        "Identificación de la unidad",
        "Descripción técnica de la incidencia",
        "Verifica antes de enviar",
      ];
      const hints = [
        "Elige la empresa y después una de sus unidades. Sus datos se completan automáticamente.",
        "Describe el síntoma, cuándo ocurre y dónde se presenta. Agrega las fotografías necesarias.",
        "Revisa los datos y registra la firma del operador o responsable.",
      ];
      section.append(
        element(
          "div",
          "rw-form-intro",
          `<span class="rw-eyebrow">PASO ${i + 1} DE 3</span><h3>${titles[i]}</h3><p>${hints[i]}</p>`,
        ),
      );
      if (i === 0) {
        fields[3].classList.add("rw-company-field");
        const companyHint = element(
          "small",
          "rw-field-hint",
          "Asignada a tu cuenta. Solo puedes reportar unidades de esta empresa.",
        );
        companyHint.id = "rwCompanyHint";
        companyHint.hidden = true;
        fields[3].append(companyHint);
        section.append(fields[3]);
        const picker = element(
          "div",
          "rw-unit-picker",
          '<label for="rwUnitPicker">Unidad de la empresa</label><select id="rwUnitPicker" required aria-describedby="rwUnitHint"><option value="">Primero selecciona una empresa</option></select><p id="rwUnitHint" class="rw-field-hint" role="status"></p><div class="rw-unit-picker-actions"><button type="button" id="rwManualUnit" class="rw-text-button">Capturar unidad no registrada</button><button type="button" id="rwRetryUnits" class="rw-text-button" hidden>Volver a cargar unidades</button></div>',
        );
        section.append(picker);
        fields[2].id = "rwManualUnitField";
        fields[2].hidden = true;
        els.numeroEconomico.required = false;
        picker.querySelector("select").onchange = (e) => {
          const unit = companyUnits().find((u) => u.id === e.target.value);
          if (unit) prefillUnit(unit);
          else clearUnitFields();
        };
        picker.querySelector("#rwManualUnit").onclick = () => {
          view.manualUnit = !view.manualUnit;
          clearUnitFields();
          renderUnitPicker();
          if (view.manualUnit) els.numeroEconomico.focus();
          else $("rwUnitPicker").focus();
        };
        picker.querySelector("#rwRetryUnits").onclick = loadFormUnits;
        [els.numeroObra, els.modelo].forEach((input) => {
          input.required = false;
          input.addEventListener("blur", fillPendingDetails);
          input.parentElement.append(
            element(
              "small",
              "rw-field-hint",
              "Si no se conoce, se guarda como Pendiente.",
            ),
          );
        });
      }
      if (i === 2) {
        const preview = element("div", "rw-review-summary");
        preview.id = "rwReviewSummary";
        section.append(preview);
      }
      indexes.forEach((index) => section.append(fields[index]));
      form.append(section);
    });
    const actions = fields[13];
    actions.classList.add("rw-form-actions");
    form.append(actions);
    const back = button("← Anterior", "btn btn-ghost", () =>
      goStep(view.step - 1),
    );
    back.id = "rwFormBack";
    const next = button("Continuar →", "btn btn-primary", () =>
      goStep(view.step + 1),
    );
    next.id = "rwFormNext";
    actions.prepend(back);
    actions.append(next);
    form.addEventListener(
      "invalid",
      (event) => {
        const section = event.target.closest(".rw-form-section");
        if (section) {
          view.step = Number(section.dataset.step);
          updateSteps();
        }
      },
      true,
    );
    form.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" &&
        event.target.tagName === "INPUT" &&
        !["file", "checkbox", "radio"].includes(event.target.type) &&
        view.step < 2
      ) {
        event.preventDefault();
        goStep(view.step + 1);
      }
    });
    els.empresa.addEventListener("change", () => {
      view.manualUnit = false;
      clearUnitFields();
      view.units = [];
      loadFormUnits();
    });
    // Associate the original labels with their inputs without replacing controls.
    form
      .querySelectorAll("input[id],select[id],textarea[id],canvas[id]")
      .forEach((input) => {
        const label = input.parentElement.querySelector(":scope > label");
        if (label && !label.htmlFor) label.htmlFor = input.id;
      });
    updateSteps();
  }
  function goStep(step) {
    step = Math.max(0, Math.min(2, step));
    if (step > view.step) {
      fillPendingDetails();
      for (let i = 0; i < step; i++)
        for (const input of document.querySelectorAll(
          `#rw-form-step-${i} [required]`,
        ))
          if (!input.checkValidity()) {
            view.step = i;
            updateSteps();
            input.reportValidity();
            return;
          }
    }
    view.step = step;
    updateSteps();
    $("rwFormSteps").scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function updateSteps() {
    if (!$("rwFormSteps")) return;
    document
      .querySelectorAll(".rw-form-section")
      .forEach(
        (section) =>
          (section.hidden = Number(section.dataset.step) !== view.step),
      );
    document.querySelectorAll(".rw-form-step").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.step) === view.step);
      btn.setAttribute(
        "aria-current",
        Number(btn.dataset.step) === view.step ? "step" : "false",
      );
    });
    $("rwFormBack").hidden = view.step === 0;
    $("rwFormNext").hidden = view.step === 2;
    els.reportForm.querySelector('button[type="submit"]').hidden =
      view.step !== 2;
    $("rwReviewSummary").innerHTML = `<dl>${[
      ["Empresa", els.empresa.value],
      ["Unidad", els.numeroEconomico.value],
      ["Obra", els.numeroObra.value.trim() || "Pendiente"],
      ["Modelo", els.modelo.value.trim() || "Pendiente"],
      ["Contacto", els.contactoNombre.value],
      ["Teléfono", els.telefono.value],
      ["Kilometraje", els.kilometraje.value],
      ["Incidencia", selectedRadio("tipoIncidente")],
    ]
      .map(
        ([label, value]) =>
          `<div><dt>${label}</dt><dd>${esc(value || "No indicado")}</dd></div>`,
      )
      .join(
        "",
      )}</dl><h4>Descripción técnica</h4><p>${esc(els.descripcionFallo.value || "Sin descripción")}</p>${els.solicitaRefaccion.checked ? `<h4>Refacción solicitada</h4><p>${esc(els.detalleRefaccion.value || "Sin detalle")}</p>` : ""}<p class="muted">${state.currentEvidence.length} evidencias generales · ${state.currentRefEvidence.length} evidencias de refacción${state.editingFirmaOriginal ? " · Firma original conservada" : ""}</p>`;
    const title = els.reportFormPanel.querySelector(".panel-head h3");
    title.textContent = state.editingGarantiaId
      ? "Editar reporte"
      : "Nuevo reporte";
  }
  function resetForm() {
    view.step = 0;
    view.manualUnit = false;
    fillPendingDetails();
    els.reportFormPanel.querySelector(".topbar-kicker").textContent =
      "REGISTRO DE INCIDENCIA";
    els.reportFormPanel.querySelector(".panel-head .badge").textContent =
      "Fallas y garantías";
    renderUnitPicker();
    updateSteps();
  }
  function companyUnits() {
    const company = normalizeIdentityKey(els.empresa.value);
    if (!company) return [];
    return view.units
      .filter((unit) => normalizeIdentityKey(unit.empresa) === company)
      .sort((a, b) =>
        a.numeroEconomico.localeCompare(b.numeroEconomico, "es", {
          numeric: true,
        }),
      );
  }
  function fillPendingDetails() {
    for (const input of [els.numeroObra, els.modelo]) {
      if (!input.value.trim()) input.value = "Pendiente";
    }
  }
  function clearUnitFields() {
    els.numeroEconomico.value = "";
    els.numeroObra.value = "Pendiente";
    els.modelo.value = "Pendiente";
    els.kilometraje.value = "";
    $("rwUnitPicker").value = "";
  }
  async function loadFormUnits() {
    const requestId = ++view.unitLoadId;
    view.unitsLoading = true;
    view.unitsError = false;
    renderUnitPicker();
    try {
      const company = els.empresa.value;
      const units = company ? await api.request("/api/fleet/unit-options?empresa=" + encodeURIComponent(company)) : [];
      if (requestId !== view.unitLoadId) return;
      view.units = units;
    } catch {
      if (requestId !== view.unitLoadId) return;
      view.units = [];
      view.unitsError = true;
    } finally {
      if (requestId === view.unitLoadId) {
        view.unitsLoading = false;
        // A historical report may refer to a unit no longer registered. Preserve it.
        if (
          state.editingGarantiaId &&
          els.numeroEconomico.value &&
          !companyUnits().some(
            (unit) =>
              normalizeIdentityKey(unit.numeroEconomico) ===
              normalizeIdentityKey(els.numeroEconomico.value),
          )
        )
          view.manualUnit = true;
        renderUnitPicker();
      }
    }
  }
  function renderUnitPicker() {
    const select = $("rwUnitPicker");
    if (!select) return;
    const assigned = syncReportCompanyAssignment();
    $("rwCompanyHint").hidden = !assigned;
    els.empresa.parentElement.querySelector("label").textContent = assigned
      ? "Empresa asignada"
      : "Empresa";
    $("rw-form-step-0").querySelector(".rw-form-intro p").textContent = assigned
      ? "Tu empresa ya está asignada. Selecciona una de sus unidades para completar los datos del reporte."
      : "Elige la empresa y después una de sus unidades. Sus datos se completan automáticamente.";
    const units = companyUnits();
    const hasCompany = Boolean(els.empresa.value);
    const match = units.find(
      (unit) =>
        normalizeIdentityKey(unit.numeroEconomico) ===
        normalizeIdentityKey(els.numeroEconomico.value),
    );
    const placeholder = !hasCompany
      ? "Primero selecciona una empresa"
      : view.unitsLoading
        ? "Cargando unidades…"
        : view.unitsError
          ? "No se pudieron cargar las unidades"
          : units.length
            ? "Selecciona una unidad"
            : "Esta empresa no tiene unidades registradas";
    select.replaceChildren(
      new Option(placeholder, ""),
      ...units.map(
        (u) =>
          new Option(
            `${u.numeroEconomico}${u.modelo?.trim() ? " · " + u.modelo.trim() : ""}${u.nombreFlota ? " · " + u.nombreFlota : ""}`,
            u.id,
          ),
      ),
    );
    select.value = !view.manualUnit && match ? match.id : "";
    select.disabled = !hasCompany || view.manualUnit;
    select.required = !view.manualUnit;
    $("rwManualUnitField").hidden = !view.manualUnit;
    els.numeroEconomico.required = view.manualUnit;
    $("rwManualUnit").disabled = !hasCompany;
    $("rwManualUnit").textContent = view.manualUnit
      ? "Volver a las unidades de la empresa"
      : "Capturar unidad no registrada";
    $("rwRetryUnits").hidden = !view.unitsError;
    $("rwUnitHint").textContent = !hasCompany
      ? assigned
        ? "Tu cuenta no tiene una empresa asignada. Solicita al administrador que complete tu registro."
        : "Solo se mostrarán las unidades de la empresa seleccionada."
      : view.manualUnit
        ? "Captura el número económico. La empresa seleccionada se conservará."
        : view.unitsLoading
          ? "Consultando la flota…"
          : view.unitsError
            ? "Reintenta la consulta o captura la unidad manualmente."
            : units.length
              ? `${units.length} unidades de ${els.empresa.value}. Obra y modelo se completan al seleccionar.`
              : "Puedes capturar el número económico con la opción de abajo.";
  }
  function prefillUnit(unit) {
    if (
      unit.empresa &&
      !Array.from(els.empresa.options).some((o) => o.value === unit.empresa)
    )
      els.empresa.add(new Option(unit.empresa, unit.empresa));
    view.manualUnit = !unit.id;
    els.empresa.value = unit.empresa || "";
    els.numeroEconomico.value = unit.numeroEconomico || "";
    els.numeroObra.value = unit.numeroObra?.trim() || "Pendiente";
    els.modelo.value = unit.modelo?.trim() || "Pendiente";
    els.kilometraje.value = unit.kilometraje || "";
    renderUnitPicker();
    $("rwUnitPicker").value = unit.id;
    updateSteps();
  }
  function dialog(title, subtitle) {
    let root = $("rwDialog");
    if (root) {
      root.close();
      root.remove();
    }
    root = element("dialog", "rw-dialog");
    root.id = "rwDialog";
    root.setAttribute("aria-labelledby", "rwDialogTitle");
    root.innerHTML = `<header><div><span class="rw-eyebrow">CARLAB / REPORTES</span><h3 id="rwDialogTitle">${esc(title)}</h3><p>${esc(subtitle || "")}</p></div><button class="rw-close" type="button" aria-label="Cerrar ventana">×</button></header><div class="rw-dialog-content"></div>`;
    root.querySelector(".rw-close").onclick = () => root.close();
    root.addEventListener("click", (e) => {
      if (e.target === root) root.close();
    });
    document.body.append(root);
    root.showModal();
    return root;
  }
  async function openQrSettings(company, fleet) {
    const root = dialog(
      "Tipo de QR de la flota",
      company + (fleet ? " · " + fleet : " · Todas las flotas"),
    );
    const content = root.querySelector(".rw-dialog-content");
    content.innerHTML = '<p role="status">Consultando la configuración…</p>';
    try {
      const query = new URLSearchParams({ company });
      if (fleet) query.set("fleet", fleet);
      let config = await api.request("/api/report-qr/settings?" + query);
      if (!root.isConnected) return;
      const modeLabel = {
        single: "Sencillo",
        dual: "Doble",
        mixed: "Mixto: hay flotas con distintas opciones",
      };
      content.innerHTML = `<div class="rw-qr-setting-summary"><span class="rw-eyebrow">CONFIGURACIÓN ACTUAL</span><strong id="rwQrModeCurrent">${esc(modeLabel[config.mode])}</strong><p>${config.unitCount} unidades · ${fleet ? "Solo se modifica la flota seleccionada." : "Al guardar, todas las flotas de esta empresa usarán la opción elegida."}</p></div>
        <form id="rwQrModeForm"><fieldset class="rw-qr-mode-choices"><legend>¿Qué puede reportar quien escanea?</legend>
        <label class="rw-qr-mode"><input type="radio" name="mode" value="single" required ${config.mode === "single" ? "checked" : ""}><span><b>QR sencillo</b><small>Daños y garantías</small><span>Abre directamente el formulario general.</span></span></label>
        <label class="rw-qr-mode"><input type="radio" name="mode" value="dual" required ${config.mode === "dual" ? "checked" : ""}><span><b>QR doble</b><small>General + aire acondicionado</small><span>Permite elegir entre los dos tipos de reporte.</span></span></label></fieldset>
        <p class="rw-qr-setting-note">Aplica a los QR ya pegados y a las nuevas unidades de ${fleet ? "esta flota" : "esta empresa"}. No necesitas imprimir otras etiquetas. Los reportes recibidos se conservan.</p>
        <p id="rwQrModeMessage" role="status" aria-live="polite"></p><div class="rw-dialog-footer"><span>Puedes cambiar esta opción cuando lo necesites.</span><button id="rwQrModeSave" class="btn btn-primary" type="submit">Guardar configuración</button></div></form>`;
      const form = content.querySelector("form");
      form.onsubmit = async (event) => {
        event.preventDefault();
        const mode = new FormData(form).get("mode"),
          save = $("rwQrModeSave"),
          message = $("rwQrModeMessage");
        if (save.disabled) return;
        save.disabled = true;
        form.querySelector("fieldset").disabled = true;
        message.textContent = "Guardando…";
        try {
          config = await api.request("/api/report-qr/settings", {
            method: "PATCH",
            body: JSON.stringify({
              company,
              fleet,
              mode,
              version: config.version,
            }),
          });
          content.querySelector("#rwQrModeCurrent").textContent =
            modeLabel[config.mode];
          message.textContent =
            "Guardado. Los QR existentes ya usan el modo " +
            modeLabel[config.mode].toLowerCase() +
            ".";
          notify("Configuración de QR guardada.");
        } catch (error) {
          message.textContent = error.message;
        } finally {
          save.disabled = false;
          form.querySelector("fieldset").disabled = false;
        }
      };
    } catch (error) {
      content.textContent = error.message;
    }
  }
  function openQr(units) {
    if (!units.length) return;
    const sorted = [...units].sort(
      (a, b) =>
        a.empresa.localeCompare(b.empresa, "es") ||
        String(a.numeroEconomico).localeCompare(
          String(b.numeroEconomico),
          "es",
          { numeric: true },
        ),
    );
    const root = dialog(
        "Etiquetas QR de reportes",
        `${sorted.length} unidades disponibles. Descarga todas o selecciona las que necesitas.`,
      ),
      content = root.querySelector(".rw-dialog-content");
    content.innerHTML = `<div class="rw-qr-intro"><span>${icon("qr")}</span><p>El mismo formato de CARLAB, con la leyenda <strong>REPORTES</strong>. Cada etiqueta abre la unidad y conserva su código cuando vuelves a descargarla.</p></div><label class="rw-field">Tamaño de impresión<select id="rwQrSize">${Object.entries(
      ReportsQR.layouts,
    )
      .map(([key, layout]) => `<option value="${key}">${layout.label}</option>`)
      .join(
        "",
      )}</select></label><label class="rw-select-all"><input type="checkbox" id="rwQrAll" checked> Seleccionar todas <span id="rwQrCount"></span></label><div class="rw-qr-units">${sorted.map((unit, i) => `<label><input type="checkbox" data-qr-unit="${i}" checked><strong>${esc(unit.numeroEconomico)}</strong><span>${esc(unit.empresa)}${unit.nombreFlota ? " · " + esc(unit.nombreFlota) : ""}</span></label>`).join("")}</div><p id="rwQrProgress" role="status" aria-live="polite"></p><div class="rw-dialog-footer"><span>Un PDF con todas las etiquetas seleccionadas.</span><button type="button" class="btn btn-primary" id="rwQrDownload">Descargar PDF</button></div>`;
    const inputs = [...content.querySelectorAll("[data-qr-unit]")],
      all = $("rwQrAll"),
      download = $("rwQrDownload");
    const update = () => {
      const count = inputs.filter((i) => i.checked).length;
      $("rwQrCount").textContent = `${count} / ${inputs.length}`;
      all.checked = count === inputs.length;
      all.indeterminate = count > 0 && count < inputs.length;
      download.disabled = !count;
    };
    inputs.forEach((input) => (input.onchange = update));
    all.onchange = () => {
      inputs.forEach((i) => (i.checked = all.checked));
      update();
    };
    update();
    download.onclick = async () => {
      const selection = inputs
          .filter((i) => i.checked)
          .map((i) => sorted[Number(i.dataset.qrUnit)]),
        size = $("rwQrSize").value,
        progress = $("rwQrProgress");
      download.disabled = true;
      content
        .querySelectorAll("input,select")
        .forEach((input) => (input.disabled = true));
      try {
        progress.textContent = "Preparando los códigos de las unidades…";
        const data = await api.request("/api/report-qr/batch", {
          method: "POST",
          body: JSON.stringify({ unitIds: selection.map((u) => u.id) }),
        });
        if (data.units.length !== selection.length)
          throw new Error(
            "La lista de etiquetas está incompleta. Actualiza la flota e intenta de nuevo.",
          );
        const doc = await ReportsQR.documentFor(
          data.units,
          size,
          (done, total) =>
            (progress.textContent = `Generando etiqueta ${done} de ${total}…`),
        );
        const companies = [...new Set(selection.map((u) => u.empresa))];
        doc.save(
          `CARLAB-Reportes-QR-${companies.length === 1 ? companies[0].replace(/[^a-z0-9_-]/gi, "_") : "Flotas"}-${selection.length}-unidades.pdf`,
        );
        progress.textContent = `PDF listo: ${selection.length} etiquetas. Imprime al 100% para conservar el tamaño.`;
      } catch (error) {
        progress.textContent = error.message;
        notify(error.message, true);
      } finally {
        content
          .querySelectorAll("input,select")
          .forEach((input) => (input.disabled = false));
        update();
      }
    };
  }
  async function sessionReady() {
    const token = new URLSearchParams(location.search).get("reportqr");
    if (!token || view.session === state.token + token) return;
    view.session = state.token + token;
    try {
      if (!/^[a-f0-9]{48}$/.test(token))
        throw new Error("El código de la etiqueta no es válido.");
      const data = await api.request("/api/report-qr/" + token),
        unit = data.unit;
      const root = dialog(
          `Unidad ${unit.numeroEconomico}`,
          `${unit.empresa}${unit.nombreFlota ? " · " + unit.nombreFlota : ""}`,
        ),
        content = root.querySelector(".rw-dialog-content");
      content.innerHTML = `<div class="rw-scan-unit">${icon("bus")}<h4>Reportes de la unidad</h4><p>${esc(unit.marca)} ${esc(unit.modelo)} · Obra ${esc(unit.numeroObra || "No registrada")}</p></div>`;
      if (data.canReport)
        content.append(
          button("+ Registrar reporte", "btn btn-primary", () => {
            root.close();
            resetReportForm();
            prefillUnit(unit);
            switchPanel("report");
          }),
        );
      if (unit.id && isRole("admin", "operativo", "supervisor_flotas"))
        content.append(
          button("Consultar expediente", "btn btn-secondary", () => {
            root.close();
            openFleetUnitDetail(unit.id);
          }),
        );
      else
        content.append(
          button("Ver reportes disponibles", "btn btn-secondary", () => {
            root.close();
            resetBoardFilters({ render: false });
            els.searchInput.value = unit.numeroEconomico;
            switchPanel("board");
            renderReports();
          }),
        );
    } catch (error) {
      const root = dialog("No se pudo abrir la unidad", error.message);
      root.querySelector(".rw-dialog-content").append(
        button("Ir a mis reportes", "btn btn-secondary", () => {
          root.close();
          switchPanel("board");
        }),
      );
    }
  }
  // Modal keyboard focus is confined to the visible dialog, including on Safari.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      document.body.classList.remove("rw-menu-open");
      return;
    }
    if (
      event.key !== "Tab" ||
      $("rwDialog")?.open ||
      !$("imageLightbox")?.classList.contains("hidden")
    )
      return;
    const modal = !$("authorizedActivitiesModal")?.classList.contains("hidden")
      ? $("authorizedActivitiesModal")
      : !els.reportDetailModal.classList.contains("hidden")
        ? els.reportDetailModal
        : !$("fleetDetailModalRoot")?.classList.contains("hidden")
          ? $("fleetDetailModalRoot")
          : null;
    if (!modal) return;
    const nodes = [
      ...modal.querySelectorAll(
        'button,input,select,textarea,a[href],[tabindex="0"]',
      ),
    ].filter((node) => !node.disabled && node.getClientRects().length);
    if (!nodes.length) return;
    const first = nodes[0],
      last = nodes.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !modal.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !modal.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  });
  window.CarlabReportsUI = {
    renderReports,
    renderFleet,
    decorateReportDetail,
    decorateFleetDetail,
    refreshReport,
    reportClosed,
    fleetClosed,
    panelChanged(panel) {
      panelChanged(panel);
      $("rwReportMetrics").hidden = panel !== "board";
    },
    resetForm,
    refreshCompany() {
      renderUnitPicker();
      updateSteps();
    },
    sessionReady,
  };
  initShell();
  initForm();
  if (state.user) {
    panelChanged(state.activePanel);
    renderReports();
  }
})();
