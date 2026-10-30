"use strict";
(() => {
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
  const icons = {
    incident: '<path d="M12 3 2 21h20zM12 9v5m0 3v1"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    parts: '<path d="m3 7 9-4 9 4v10l-9 4-9-4zm0 0 9 5 9-5M12 12v9M7 5l9 5"/>',
    order:
      '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2h6v5H9zm0 9h6m-6 4h6"/>',
    home: '<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',
    fleet:
      '<rect x="4" y="3" width="16" height="17" rx="3"/><path d="M4 12h16M8 20v2m8-2v2M8 16h1m6 0h1M8 7h8"/>',
    tracking:
      '<path d="M9 4h11M9 12h11M9 20h11m-17-16 2 2 3-4m-5 10 2 2 3-4m-5 10 2 2 3-4"/>',
    report: '<path d="M5 3h10l4 4v14H5zM9 17v-4m4 4V9m4 8v-6"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    company: '<path d="M4 21V4h12v17M16 10h4v11M8 8h4m-4 4h4m-4 4h4M2 21h20"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  };
  const icon = (key) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[key] || icons.fleet}</svg>`;
  const nav = (view, label, ico, cls = "") =>
    `<button type="button" class="hc-btn ${cls}" data-ac-view="${view}">${ico ? icon(ico) : ""}${label}</button>`;
  const action = (label, attrs, cls = "") =>
    `<button type="button" class="hc-btn ${cls}" ${attrs}>${label}</button>`;
  const stamp = (d) =>
    d
      ? new Date(d + "T12:00:00").toLocaleDateString("es-MX", {
          day: "numeric",
          month: "short",
        })
      : "Por programar";
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mazatlan",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const scopeName = (info) =>
    info.user.company || info.brands[info.user.brand] || "Aire acondicionado";
  const colors = {
    green: "Operativas",
    amber: "Seguimiento",
    red: "Atención crítica",
    gray: "Sin evaluar",
  };
  let ctx,
    companyData = [],
    companyQuery = "";
  function setupNav() {
    for (const el of document.querySelectorAll("[data-ac-nav]")) {
      if (!el.querySelector("svg"))
        el.insertAdjacentHTML("afterbegin", icon(el.dataset.acNav));
    }
  }
  function selectNav(view) {
    const key = ["fleet", "companies", "upcoming"].includes(view)
      ? "companies"
      : ["requests", "orders", "order", "parts"].includes(view)
        ? "requests"
        : view;
    document.querySelectorAll(".acp-nav [data-ac-view]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.acView === key);
      if (b.dataset.acView === key) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }
  const header = (title, desc, buttons = "") =>
    `<div class="acp-page-heading"><div><span class="acp-eyebrow">${esc(scopeName(ctx.info))} · CLIMATIZACIÓN</span><h1>${title}</h1><p>${desc}</p></div><div class="hc-actions">${buttons}</div></div>`;
  const companyCard = (c) =>
    `<button class="acp-company" type="button" data-aportal="company" data-company="${esc(c.id)}"><div class="acp-company-heading"><span class="acp-company-icon">${icon("company")}</span><span class="acp-open-arrow">${icon("arrow")}</span></div><h2>${esc(c.name)}</h2><p>${c.total} ${c.total === 1 ? "unidad" : "unidades"} de AC</p><div class="acp-state-bar" aria-hidden="true">${Object.keys(
      colors,
    )
      .map((k) => `<i class="${k}" style="flex:${c[k] || 0}"></i>`)
      .join("")}</div><div class="acp-company-states">${Object.entries(colors)
      .map(
        ([k, l]) => `<span><i class="${k}"></i><b>${c[k] || 0}</b> ${l}</span>`,
      )
      .join(
        "",
      )}</div><span class="acp-company-link">Ver autobuses ${icon("arrow")}</span></button>`;
  const priorityRow = (u) =>
    `<button class="acp-priority" type="button" data-aportal="unit" data-id="${esc(u.id)}"><span class="acp-small-bus ${u.signal}">${icon("fleet")}</span><span><strong>Unidad ${esc(u.unit)}</strong><small>${esc(u.company)}</small><span>${esc(u.reasons[0]?.text || u.signalLabel)}</span></span><span class="acp-priority-arrow">${icon("arrow")}</span></button>`;
  async function home(context) {
    ctx = context;
    const date = today();
    const [fleet, requests, calendar, incidents] = await Promise.all([
      ctx.api("/fleet/units?today=" + date),
      ctx.api("/requests?pending=true&summary=true"),
      ctx.api(
        "/calendar?" +
          new URLSearchParams({
            today: date,
            month: date.slice(0, 7),
            bucket: "week",
          }),
      ),
      ctx.api("/incidents?status=abiertos&summary=true"),
    ]);
    if (!context.active()) return;
    const s = fleet.summary,
      priority = fleet.items
        .filter((u) => u.signal === "red" || u.signal === "amber")
        .slice(0, 5);
    document.querySelector("#hc-main").innerHTML =
      header(
        context.info.permissions.manageOrders
          ? "El control de tu operación AC"
          : "Tu operación, de un vistazo",
        context.info.permissions.manageOrders
          ? "Atiende prioridades, organiza el taller y consulta cada empresa."
          : context.info.permissions.readOnly
            ? "Consulta el estado, los reportes y los servicios de tu empresa."
            : "Elige una prioridad o entra a tu flota para solicitar atención.",
        context.info.permissions.manageOrders
          ? action(
              icon("plus") + " Nueva orden",
              'data-action="new"',
              "primary",
            ) + nav("requests", "Ver solicitudes", "tracking")
          : context.info.permissions.readOnly
            ? ""
            : action(
                icon("plus") + " Solicitar atención",
                'data-aportal="request"',
                "primary",
              ),
      ) +
      `<section class="acp-kpis" aria-label="Resumen de tu operación">${[
        [
          "green",
          "Unidades operativas",
          s.green,
          "signal",
          "green",
          "Evaluación vigente, sin alertas",
        ],
        [
          "red",
          "Requieren atención",
          s.red + s.amber,
          "focus",
          "attention",
          "Críticas y en seguimiento",
        ],
        [
          "amber",
          "Servicios vencidos",
          calendar.summary.overdue,
          "calendar",
          "overdue",
          "Fechas pendientes de mantenimiento",
        ],
        [
          "teal",
          "Solicitudes pendientes",
          requests.total,
          "requests",
          "",
          "Servicio y refacciones",
        ],
      ]
        .map(
          ([color, label, count, filter, value, help]) =>
            `<button type="button" class="acp-kpi ${color}" data-aportal="metric" data-filter="${filter}" data-value="${value}"><span>${label}</span><strong>${count}</strong><small>${help} ${icon("arrow")}</small></button>`,
        )
        .join("")}</section>
    <section class="aci-home-callout"><div><h2>Reportes AC</h2><p>${incidents.summary.abiertos} abiertos · ${incidents.summary.urgentes} urgentes · ${incidents.summary.confirmacion} por confirmar</p></div><div class="hc-actions">${context.info.permissions.readOnly ? "" : action("+ Reportar falla", 'data-ac-action="new-incident"', "primary")}${nav("incidents", "Ver reportes", "incident")}</div></section>
    <div class="acp-home-grid"><section class="acp-panel"><div class="acp-panel-head"><div><h2>Atención prioritaria</h2><p>Primero lo que necesita seguimiento.</p></div><span class="acp-count">${s.red + s.amber}</span></div>${priority.map(priorityRow).join("") || '<div class="acp-empty">Sin alertas en las unidades registradas.<small>Las unidades sin evaluación se muestran en gris en Flotas.</small></div>'}${nav("companies", context.info.permissions.manageOrders ? "Ver flotas" : "Ver mis flotas", "fleet", "acp-wide")}</section>
    <section class="acp-panel"><div class="acp-panel-head"><div><h2>Próximos 7 días</h2><p>Servicios con fecha registrada.</p></div>${icon("calendar")}</div>${
      calendar.items
        .slice(0, 5)
        .map(
          (x) =>
            `<button type="button" class="acp-date-row" data-aportal="scheduled" data-id="${esc(x.fleetUnitId || "")}" data-order="${esc(x.orderId || "")}" data-incident="${esc(x.incidentId || "")}"><span>${stamp(x.nextDate)}</span><div><strong>Unidad ${esc(x.unit)}</strong><small>${esc(x.company)}</small></div>${icon("arrow")}</button>`,
        )
        .join("") ||
      '<div class="acp-empty">Sin servicios programados en estos días.</div>'
    }${nav("upcoming", "Abrir calendario", "calendar", "acp-wide")}</section></div>
    <div class="acp-section-head"><h2>${ctx.info.user.company ? "Mi empresa" : ctx.info.permissions.manageOrders ? "Empresas y flotas" : "Empresas de mi marca"}</h2>${nav("companies", "Ver todas", "arrow")}</div><section class="acp-companies acp-home-companies">${fleet.companies.slice(0, 3).map(companyCard).join("") || '<p class="hc-empty">Aún no hay unidades registradas para este acceso.</p>'}</section><p class="acp-updated">Información actualizada al abrir esta vista · ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} ${action("Actualizar", 'data-aportal="refresh"')}</p>`;
  }
  async function companies(context) {
    ctx = context;
    companyQuery = "";
    const [data, options] = await Promise.all([
      ctx.api("/fleet/units?today=" + today()),
      ctx.api("/fleet/options"),
    ]);
    if (!context.active()) return;
    companyData = options.companies.map((c) => ({
      ...c,
      total: 0,
      green: 0,
      amber: 0,
      red: 0,
      gray: 0,
      ...data.companies.find((x) => x.id === c.id),
    }));
    document.querySelector("#hc-main").innerHTML =
      header(
        ctx.info.user.company ? "Mi flota AC" : "Elige una empresa",
        "Abre una empresa para consultar sus autobuses y su estado de climatización.",
        (context.info.permissions.manageOrders
          ? nav("fleet", "Administrar unidades", "plus", "primary")
          : "") + nav("upcoming", "Calendario", "calendar"),
      ) +
      `<label class="acp-search"><span>Buscar empresa</span><input id="acp-company-search" type="search" placeholder="Escribe el nombre de la empresa" autocomplete="off"></label><section id="acp-company-grid" class="acp-companies"></section>`;
    renderCompanies();
  }
  function renderCompanies() {
    document.querySelector("#acp-company-grid").innerHTML =
      companyData
        .filter((c) => c.name.toLocaleLowerCase("es").includes(companyQuery))
        .map(companyCard)
        .join("") ||
      '<div class="hc-empty">No hay empresas para esta búsqueda.</div>';
  }
  function tools(context) {
    ctx = context;
    if (!ctx.info.permissions.manageOrders) return;
    const groups = [
      [
        "Operación",
        [
          [
            "calendar",
            "calendar",
            "Calendario",
            "Servicios próximos y fechas vencidas",
          ],
          [
            "parts",
            "parts",
            "Refacciones AC",
            "Catálogo oficial, existencias y movimientos",
          ],
          [
            "reports",
            "report",
            "Informes",
            "Resultados por semana, mes, empresa o marca",
          ],
        ],
      ],
      [
        "Consulta técnica",
        [
          [
            "history",
            "fleet",
            "Expedientes",
            "Historial técnico de cada unidad",
          ],
          [
            "library",
            "report",
            "Biblioteca técnica",
            "Manuales y documentos de los fabricantes",
          ],
          [
            "codes",
            "tracking",
            "Diagnóstico",
            "Códigos y referencias de fallas",
          ],
        ],
      ],
      [
        "Administración",
        [
          [
            "access",
            "company",
            "Supervisores AC",
            "Accesos por marca o empresa de flota",
          ],
          [
            "notifications",
            "tracking",
            "Notificaciones",
            "Solicitudes, órdenes y recordatorios",
          ],
          [
            "trash",
            "order",
            "Papelera de órdenes",
            "Consultar y recuperar órdenes eliminadas",
          ],
        ],
      ],
    ];
    document.querySelector("#hc-main").innerHTML =
      header(
        "Todo en su lugar",
        "Elige la herramienta que necesitas para continuar.",
      ) +
      groups
        .map(
          ([title, items]) =>
            `<section class="aca-tools-section"><h2>${title}</h2><div class="aca-tool-grid">${items.map(([view, ico, label, desc]) => `<button type="button" class="aca-tool" data-view="${view}"><span class="aca-tool-icon">${icon(ico)}</span><span><b>${label}</b><small>${desc}</small></span>${icon("arrow")}</button>`).join("")}</div></section>`,
        )
        .join("") +
      '<a class="hc-btn aca-cloud-link" href="/">← Volver a Carlab Cloud</a>';
  }
  function trackingTabs(view, info = ctx?.info) {
    return `<div class="acp-tabs" aria-label="Seguimiento">${nav("requests", "Solicitudes", "tracking", view === "requests" ? "primary" : "")}${nav("orders", "Órdenes de servicio", "fleet", view === "orders" ? "primary" : "")}${nav("parts", info?.permissions?.readOnly ? "Consultar refacciones" : "Solicitar refacciones", "plus", view === "parts" ? "primary" : "")}</div>`;
  }
  function progress(x) {
    const cancelled =
      ["rechazada", "cancelada"].includes(x.status) ||
      x.serviceStatus === "cancelado";
    if (cancelled)
      return `<div class="acp-outcome">${esc(x.serviceStatus === "cancelado" ? "Orden cancelada" : ctx.info.stages[x.status])}</div>`;
    let steps, position;
    if (x.kind === "part") {
      steps = ["Recibida", "Revisión", "Aprobada", "Entregada"];
      position =
        {
          recibida: 0,
          en_revision: 1,
          espera_compra: 1,
          aprobada: 2,
          entregada: 3,
        }[x.status] ?? 0;
    } else {
      steps = [
        "Recibida",
        x.serviceId ? "Orden abierta" : "Programada",
        "En atención",
        "Finalizada",
      ];
      position =
        x.status === "atendida" || x.serviceStatus === "completado"
          ? 3
          : x.serviceStatus &&
              ["en_proceso", "espera_refaccion"].includes(x.serviceStatus)
            ? 2
            : x.status === "programada" || x.status === "orden_creada"
              ? 1
              : 0;
    }
    return `<ol class="acp-progress" aria-label="Avance de la solicitud">${steps.map((s, i) => `<li class="${i <= position ? "reached" : ""}" ${i === position ? 'aria-current="step"' : ""}><i>${i < position ? "✓" : i + 1}</i><span>${s}</span></li>`).join("")}</ol>`;
  }
  function requestCard(x, info) {
    ctx = { ...ctx, info };
    return `<article class="acp-follow-card"><div class="acp-follow-head"><span class="acp-kind">${x.kind === "part" ? "REFACCIÓN" : "SERVICIO"} · ${esc(x.folio)}</span><span class="hc-badge">${esc(x.deletedAt ? "Eliminada" : info.stages[x.status])}</span></div><h2>Unidad ${esc(x.unit)}</h2><p class="acp-follow-company">${esc(x.company)} · ${esc(info.brands[x.brand])}</p><p class="acp-follow-description">${esc(x.kind === "part" ? `${x.data.quantity} × ${x.data.partName}` : x.data.description)}</p>${x.deletedAt ? `<p class="acp-outcome">Motivo: ${esc(x.deletionReason)}</p>` : progress(x)}${x.serviceStatus ? `<p class="acp-linked-status">Orden vinculada · ${esc({ borrador: "Por iniciar", en_proceso: "En proceso", espera_refaccion: "En espera de refacción", completado: "Completada", cancelado: "Cancelada" }[x.serviceStatus] || x.serviceStatus)}</p>` : ""}${x.data.reply ? `<p class="acp-reply"><b>Respuesta de Carlab:</b> ${esc(x.data.reply)}</p>` : ""}<div class="hc-actions">${action(info.permissions.manageOrders ? "Gestionar solicitud" : "Ver seguimiento", `data-ac-action="request-detail" data-id="${esc(x.id)}"`)}${x.serviceId ? action("Ver orden", `data-ac-action="order-detail" data-id="${esc(x.serviceId)}"`) : ""}${info.permissions.manageOrders && x.kind === "service" ? action(x.deletedAt ? "Recuperar" : "Eliminar solicitud", `data-ac-action="${x.deletedAt ? "request-restore" : "request-delete"}" data-id="${esc(x.id)}"`, x.deletedAt ? "" : "aca-danger") : ""}</div></article>`;
  }
  function requestChooser(context) {
    if (context.info.permissions.readOnly) return;
    ctx = context;
    ctx.dialog(
      `<h2>¿Qué necesita tu unidad?</h2><p>Elige el tipo de atención que quieres solicitar a Carlab.</p><div class="acp-request-choices">${action(icon("incident") + "<b>Reportar falla</b><span>Registrar una incidencia y darle seguimiento</span>", 'data-ac-action="new-incident"')}${action(icon("fleet") + "<b>Solicitar servicio</b><span>Revisión, mantenimiento o reparación</span>", 'data-ac-action="new-service"')}${action(icon("plus") + "<b>Solicitar refacción</b><span>Buscar una pieza o describir lo que necesitas</span>", 'data-ac-action="new-part"')}</div>`,
    );
  }
  document.addEventListener("input", (e) => {
    if (e.target.id === "acp-company-search") {
      companyQuery = e.target.value.trim().toLocaleLowerCase("es");
      renderCompanies();
    }
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-aportal]");
    if (!b || !ctx) return;
    try {
      const a = b.dataset.aportal;
      if (a === "company")
        await ctx.navigate("fleet", { company: b.dataset.company });
      if (a === "unit") await ctx.navigate("fleet", b.dataset.id);
      if (a === "request") requestChooser(ctx);
      if (a === "refresh") await ctx.navigate("home");
      if (a === "scheduled")
        await ctx.navigate(
          b.dataset.incident ? "incidents" : b.dataset.id ? "fleet" : "order",
          b.dataset.incident || b.dataset.id || b.dataset.order,
        );
      if (a === "metric") {
        if (b.dataset.filter === "requests")
          await ctx.navigate("requests", { pending: true });
        else if (b.dataset.filter === "calendar")
          await ctx.navigate("upcoming", { bucket: "overdue" });
        else
          await ctx.navigate("fleet", { [b.dataset.filter]: b.dataset.value });
      }
    } catch (err) {
      ctx.toast(err.message);
    }
  });
  window.ACPortal = {
    setupNav,
    selectNav,
    home,
    companies,
    tools,
    trackingTabs,
    requestCard,
    requestChooser,
    scopeName,
  };
})();
