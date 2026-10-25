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
  const dayOf = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = () => dayOf(new Date());
  const fmt = (s, opts = { day: "numeric", month: "long" }) =>
    new Date(s + "T12:00:00").toLocaleDateString("es-MX", opts);
  const btn = (label, action, extra = "", primary = false) =>
    `<button type="button" class="hc-btn ${primary ? "primary" : ""}" data-acc="${action}" ${extra}>${label}</button>`;
  const opts = (values, chosen, empty) =>
    `<option value="">${empty}</option>${Object.entries(values)
      .map(
        ([k, v]) =>
          `<option value="${esc(k)}" ${k === chosen ? "selected" : ""}>${esc(v)}</option>`,
      )
      .join("")}`;
  const state = {
    month: today().slice(0, 7),
    day: "",
    bucket: "month",
    company: "",
    brand: "",
    q: "",
    offset: 0,
  };
  let ctx,
    data,
    seq = 0,
    timer;
  const active = () => ctx?.active();
  function status(d) {
    return d < today()
      ? ["overdue", "Vencido"]
      : d === today()
        ? ["today", "Hoy"]
        : ["planned", "Programado"];
  }
  function monthGrid() {
    const [year, month] = state.month.split("-").map(Number),
      first = new Date(year, month - 1, 1, 12),
      last = new Date(year, month, 0, 12),
      shift = (first.getDay() + 6) % 7;
    const counts = new Map(data.days.map((d) => [d.date, d]));
    let cells = "";
    for (let n = 0; n < shift; n++)
      cells += '<div class="acc-blank" aria-hidden="true"></div>';
    for (let n = 1; n <= last.getDate(); n++) {
      const date = `${state.month}-${String(n).padStart(2, "0")}`,
        event = counts.get(date),
        nEvents = event?.total || 0,
        [cls, label] = status(date);
      cells += `<button type="button" class="acc-day ${date === today() ? "is-today" : ""} ${state.day === date ? "selected" : ""} ${nEvents ? "has-events " + cls : ""}" data-acc="day" data-date="${date}" aria-label="${esc(fmt(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}, ${nEvents} ${nEvents === 1 ? "servicio" : "servicios"}${nEvents ? ", " + label : ""}" aria-pressed="${state.day === date}" ${date === today() ? 'aria-current="date"' : ""}><span class="acc-date">${n}</span>${nEvents ? `<span class="acc-count">${nEvents}<span> ${nEvents === 1 ? "servicio" : "servicios"}</span></span><span class="acc-unit-hints">${event.units.map((u) => `<span>Unidad ${esc(u)}</span>`).join("")}${nEvents > 2 ? `<small>+${nEvents - 2} más</small>` : ""}</span>` : '<span class="acc-no-events" aria-hidden="true">—</span>'}</button>`;
    }
    return cells;
  }
  function item(row) {
    const [cls, label] = status(row.nextDate);
    return `<article class="acc-service ${cls}"><div class="acc-service-top"><div><span class="acc-eyebrow">${esc(ctx.info.brands[row.brand])}</span><h3>Unidad ${esc(row.unit)}</h3></div><span class="acc-status ${cls}">${label}</span></div><p class="acc-company">${esc(row.company)}</p><div class="acc-service-date"><b>${fmt(row.nextDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b>${row.base ? `<span>${esc(row.base)}</span>` : ""}</div><small class="acc-source">${row.source === "fleet" ? "Plan inicial registrado en Flotas AC" : "Seguimiento de " + esc(row.folio)}</small><div class="hc-actions">${row.incidentId ? btn("Ver reporte", "incident", `data-id="${esc(row.id)}"`, true) : ""}${row.orderId ? btn("Ver antecedente", "order", `data-id="${esc(row.id)}"`) : ""}${row.fleetUnitId ? btn("Ficha de unidad", "fleet", `data-id="${esc(row.id)}"`) : ""}${row.incidentId ? "" : ctx.external ? btn("Solicitar servicio", "request", `data-id="${esc(row.id)}"`, true) : row.orderId ? btn("Registrar servicio", "new-order", `data-id="${esc(row.id)}"`, true) : btn("Solicitar servicio", "request", `data-id="${esc(row.id)}"`, true)}</div></article>`;
  }
  function agendaTitle() {
    return state.day
      ? fmt(state.day, { weekday: "long", day: "numeric", month: "long" })
      : state.bucket === "overdue"
        ? "Servicios vencidos"
        : state.bucket === "week"
          ? "Próximos 7 días"
          : "Servicios del mes";
  }
  function render() {
    const monthLabel = fmt(state.month + "-01", {
      month: "long",
      year: "numeric",
    });
    $("#hc-main").innerHTML =
      `<div class="acc-heading"><div><div class="hc-kicker">PLANIFICACIÓN / ${ctx.external ? esc(ctx.info.user.company || ctx.info.brands[ctx.info.user.brand]).toUpperCase() : "CLIMATIZACIÓN"}</div><h1>Próximos servicios</h1><p>Selecciona un día y consulta las unidades que requieren mantenimiento.</p></div>${btn("Actualizar", "refresh")}</div>
    <section class="acc-summary" aria-label="Periodos de seguimiento">${[
      [
        "overdue",
        "Vencidos",
        data.summary.overdue,
        "Pendientes de fechas anteriores",
      ],
      ["week", "Próximos 7 días", data.summary.week, "Desde hoy"],
      ["month", "En el mes", data.summary.month, monthLabel],
    ]
      .map(
        ([id, title, count, note]) =>
          `<button type="button" class="acc-stat ${id} ${state.bucket === id && !state.day ? "selected" : ""}" data-acc="bucket" data-bucket="${id}" aria-pressed="${state.bucket === id && !state.day}"><span>${title}</span><strong>${count}</strong><small>${esc(note)}</small></button>`,
      )
      .join("")}</section>
    <form id="acc-filters" class="acc-filters">${ctx.external ? "" : `<label class="hc-field"><b>Marca AC</b><select name="brand">${opts(ctx.info.brands, state.brand, "Ambas marcas")}</select></label>`}<label class="hc-field"><b>Empresa</b><select name="company">${opts(Object.fromEntries(data.companies.map((c) => [c, c])), state.company, "Todas las empresas")}</select></label><label class="hc-field"><b>Buscar unidad o base</b><input name="q" type="search" value="${esc(state.q)}" maxlength="180" placeholder="Ej. 306, Mazatlán…"></label><div class="hc-actions"><button type="submit" class="hc-btn primary">Filtrar</button>${btn("Limpiar", "clear")}</div></form>
    <div class="acc-layout"><section class="acc-calendar" aria-label="Calendario de mantenimiento"><div class="acc-month-toolbar"><div><span class="acc-eyebrow">CALENDARIO MENSUAL</span><h2 id="acc-month-title">${esc(monthLabel)}</h2></div><div class="acc-month-actions">${btn("‹", "prev-month", 'aria-label="Mes anterior" ' + (state.month === "2000-01" ? "disabled" : ""))}${btn("Hoy", "today")}${btn("›", "next-month", 'aria-label="Mes siguiente" ' + (state.month === "2099-12" ? "disabled" : ""))}</div></div><label class="acc-month-picker"><span>Ir a mes</span><input id="acc-month" type="month" value="${state.month}" min="2000-01" max="2099-12" aria-label="Mes del calendario"></label><div class="acc-weekdays" aria-hidden="true">${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => `<span>${d}</span>`).join("")}</div><div class="acc-days">${monthGrid()}</div><div class="acc-legend"><span><i class="overdue"></i>Vencido</span><span><i class="today"></i>Hoy</span><span><i class="planned"></i>Programado</span></div><p class="acc-tip">Toca un día para ver todos sus servicios.${data.summary.month === 0 ? " Este mes no tiene servicios para los filtros elegidos." : ""}</p></section>
    <section class="acc-agenda" aria-labelledby="acc-agenda-title"><div class="acc-agenda-head"><div><span class="acc-eyebrow">AGENDA DE MANTENIMIENTO</span><h2 id="acc-agenda-title">${esc(agendaTitle())}</h2><p>${data.total} ${data.total === 1 ? "servicio" : "servicios"}</p></div>${state.day ? btn("Mes completo", "month") : ""}</div><div class="acc-agenda-items">${data.items.map(item).join("") || '<div class="acc-empty"><span>✓</span><h3>Sin servicios para esta selección</h3><p>Elige otro día, cambia de mes o consulta los vencidos.</p></div>'}</div><div class="acc-pager"><span>${data.total ? data.offset + 1 : 0}–${Math.min(data.offset + data.limit, data.total)} de ${data.total}</span><div class="hc-actions">${btn("Anterior", "prev-page", !data.offset ? "disabled" : "")}${btn("Siguiente", "next-page", data.offset + data.limit >= data.total ? "disabled" : "")}</div></div></section></div>
    <div class="acc-footer"><span id="acc-updated">Actualizado ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · Consulta automática cada 30 s</span><p>Se muestra la fecha de mantenimiento vigente por unidad y marca, incluyendo planes iniciales de Flotas AC. Al registrar un mantenimiento completado, su programación sustituye la anterior. Estas fechas de seguimiento no modifican la Agenda general.</p></div>`;
  }
  async function load() {
    const run = ++seq;
    $("#hc-main")?.setAttribute("aria-busy", "true");
    try {
      const r = await ctx.api(
        "/calendar?" + new URLSearchParams({ ...state, today: today() }),
      );
      if (run !== seq || !active()) return;
      data = r;
      render();
    } catch (e) {
      if (run === seq && active()) ctx.toast(e.message);
    } finally {
      if (run === seq) $("#hc-main")?.removeAttribute("aria-busy");
    }
  }
  async function show(context) {
    ctx = context;
    if (context.initialFilters) {
      Object.assign(state, { day: "", offset: 0 }, context.initialFilters);
    }
    await load();
    if (!timer)
      timer = setInterval(() => {
        if (
          active() &&
          !document.hidden &&
          !document.querySelector("dialog[open]") &&
          !document.activeElement?.closest("form")
        )
          load();
      }, 30000);
  }
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "acc-filters") return;
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.target));
    if (values.brand !== undefined && values.brand !== state.brand)
      values.company = "";
    Object.assign(state, values, { offset: 0 });
    await load();
  });
  document.addEventListener("change", async (e) => {
    if (e.target.id !== "acc-month") return;
    const month = e.target.value;
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
      ctx.toast("Elige un mes entre 2000 y 2099.");
      e.target.value = state.month;
      return;
    }
    Object.assign(state, { month, day: "", bucket: "month", offset: 0 });
    await load();
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-acc]");
    if (!b || !ctx) return;
    try {
      const a = b.dataset.acc,
        row = data?.items.find((r) => r.id === b.dataset.id);
      if (a === "refresh") await load();
      if (a === "prev-month" || a === "next-month") {
        const [year, m] = state.month.split("-").map(Number),
          d = new Date(year, m - 1 + (a === "next-month" ? 1 : -1), 1, 12);
        Object.assign(state, {
          month: dayOf(d).slice(0, 7),
          day: "",
          bucket: "month",
          offset: 0,
        });
        await load();
      }
      if (a === "today") {
        Object.assign(state, {
          month: today().slice(0, 7),
          day: today(),
          bucket: "month",
          offset: 0,
        });
        await load();
      }
      if (a === "month") {
        Object.assign(state, { day: "", bucket: "month", offset: 0 });
        await load();
      }
      if (a === "clear") {
        Object.assign(state, {
          company: "",
          brand: "",
          q: "",
          day: "",
          bucket: "month",
          offset: 0,
        });
        await load();
      }
      if (a === "bucket") {
        Object.assign(state, { bucket: b.dataset.bucket, day: "", offset: 0 });
        await load();
      }
      if (a === "day") {
        Object.assign(state, {
          day: b.dataset.date,
          bucket: "month",
          offset: 0,
        });
        await load();
        if (active()) {
          $("#acc-agenda-title")?.setAttribute("tabindex", "-1");
          $("#acc-agenda-title")?.focus({ preventScroll: true });
          if (matchMedia("(max-width:1000px)").matches)
            $("#acc-agenda-title")?.scrollIntoView({
              block: "start",
              behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
                ? "auto"
                : "smooth",
            });
        }
      }
      if (a === "prev-page" || a === "next-page") {
        state.offset = Math.max(
          0,
          state.offset + (a === "next-page" ? 20 : -20),
        );
        await load();
      }
      if (a === "order" && row) {
        if (ctx.external) await ctx.navigate("order", row.orderId);
        else await window.CarlabACNav.open(row.orderId);
      }
      if (a === "incident" && row)
        await ctx.navigate("incidents", row.incidentId);
      if (a === "fleet" && row) await ctx.navigate("fleet", row.fleetUnitId);
      if (a === "new-order" && row && !ctx.external)
        await window.CarlabACNav.newFrom(row.orderId);
      if (a === "request" && row)
        await ctx.newRequest("service", "", {
          id: row.fleetUnitId,
          brand: row.brand,
          company: row.company,
          unit: row.unit,
          base: row.base,
          preferredDate: row.nextDate < today() ? today() : row.nextDate,
          description:
            "Solicito mantenimiento programado del aire acondicionado.",
        });
    } catch (err) {
      ctx.toast(err.message);
    }
  });
  window.addEventListener("pagehide", () => clearInterval(timer));
  window.ACCalendar = { show };
})();
