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
  const $ = (s) => document.querySelector(s),
    btn = (text, action, attrs = "") =>
      `<button class="hc-btn" type="button" data-aqi="${action}" ${attrs}>${text}</button>`;
  let ctx,
    current,
    offset = 0,
    query = "",
    status = "pending",
    busy = false,
    sequence = 0;
  const date = (v) => new Date(v).toLocaleString("es-MX");
  function error(e) {
    const el = $("#aqi-error");
    if (el) {
      el.textContent = e.message;
      el.scrollIntoView({ block: "nearest" });
    } else ctx.toast(e.message);
  }
  function header(title, description) {
    return `<div class="acp-page-heading"><div><span class="acp-eyebrow">REPORTES AC / RECEPCIÓN POR QR</span><h1>${title}</h1><p>${description}</p></div><div class="hc-actions">${btn("← Reportes AC", "reports")}${btn("Actualizar", "refresh")}</div></div>`;
  }
  async function show(context, id) {
    ctx = context;
    if (!ctx.info.permissions.manageOrders) return;
    current = null;
    if (id) await detail(id);
    else await list();
  }
  async function list() {
    const seq = ++sequence,
      r = await ctx.api(
        "/qr-intakes?" + new URLSearchParams({ offset, q: query, status }),
      );
    if (seq !== sequence || !ctx.active()) return;
    current = null;
    $("#hc-main").innerHTML =
      header(
        "Pendientes de vincular",
        "Fallas recibidas desde los QR generales. Asocia cada reporte con su ficha de aire acondicionado.",
      ) +
      `<form id="aqi-filter" class="aci-filters"><label class="hc-field"><b>Buscar unidad, empresa o folio PAC</b><input name="q" type="search" value="${esc(query)}" maxlength="180"></label><label class="hc-field"><b>Mostrar</b><select name="status"><option value="pending" ${status === "pending" ? "selected" : ""}>Pendientes de vincular</option><option value="linked" ${status === "linked" ? "selected" : ""}>Vinculados</option></select></label><button class="hc-btn" type="submit">Buscar</button></form><p>${r.total} reporte(s)</p>
  <section class="aci-grid">${r.items.map((x) => `<article class="aci-card ${x.data.priority === "urgente" ? "urgent" : ""}"><div class="aci-card-top"><b>${esc(x.folio)}</b><span class="aci-status">${x.status === "pending" ? "Por vincular" : "Vinculado"}</span></div><h2>Unidad ${esc(x.unit)}</h2><p class="aci-company">${esc(x.company)}</p><p class="aci-description">${esc(x.data.description)}</p><div class="hc-chips"><span>${esc(x.data.priority)}</span><span>${x.photoCount} foto(s)</span></div><div class="aci-card-bottom"><small>${esc(date(x.createdAt))}</small>${btn(x.status === "pending" ? "Revisar y vincular" : "Ver vinculación", "detail", `data-id="${esc(x.id)}"`)}</div></article>`).join("") || '<div class="hc-empty">No hay reportes para estos filtros.</div>'}</section><div class="aci-pagination">${btn("Anterior", "prev", offset ? "" : "disabled")}<span>${r.total ? offset + 1 : 0}–${Math.min(offset + 25, r.total)} de ${r.total}</span>${btn("Siguiente", "next", offset + 25 < r.total ? "" : "disabled")}</div><p id="aqi-error" class="hc-error" role="alert"></p>`;
  }
  async function candidates(q) {
    const seq = ++sequence,
      r = await ctx.api(
        "/qr-intakes/" +
          current.id +
          "/candidates?" +
          new URLSearchParams({ q }),
      );
    if (seq !== sequence || !ctx.active()) return;
    $("#aqi-unit").innerHTML =
      '<option value="">Seleccionar ficha de AC</option>' +
      r.items
        .map(
          (x) =>
            `<option value="${esc(x.id)}">${esc(x.company)} · Unidad ${esc(x.unit)} · ${esc(x.brandName)}${x.model ? " · " + esc(x.model) : ""}</option>`,
        )
        .join("");
    $("#aqi-candidate-note").textContent = r.items.length
      ? r.hasMore
        ? "Hay más coincidencias. Escribe empresa y unidad para precisar la búsqueda."
        : "La marca se tomará de la ficha que selecciones."
      : "No hay coincidencias. Busca por otro nombre o registra primero la unidad en Flotas AC; este reporte seguirá guardado.";
    $("#aqi-confirm").checked = false;
  }
  async function detail(id) {
    const seq = ++sequence,
      x = await ctx.api("/qr-intakes/" + id);
    if (seq !== sequence || !ctx.active()) return;
    current = x;
    $("#hc-main").innerHTML =
      header(
        esc(x.folio) + " · Unidad " + esc(x.unit),
        esc(x.company) +
          " · " +
          (x.status === "pending" ? "Pendiente de vincular" : "Vinculado a AC"),
      ) +
      `<div class="hc-panel hc-section"><div class="hc-actions">${btn("← Bandeja de vinculación", "list")}</div><h2>Falla reportada</h2><p class="aqi-description">${esc(x.data.description)}</p><p><b>Contacto:</b> ${esc(x.data.contact)}</p><p><b>Ubicación:</b> ${esc(x.data.location || "No indicada")} · <b>Prioridad:</b> ${esc(x.data.priority)}</p>${x.data.evidence.length ? `<details class="hc-extra-fields"><summary>Fotografías (${x.photoCount})</summary><div class="aci-photos">${x.data.evidence.map((p, i) => `<figure><img src="${esc(p.data)}" alt="Evidencia ${i + 1}"><figcaption>${esc(p.caption)}</figcaption></figure>`).join("")}</div></details>` : ""}
   ${
     x.status === "linked"
       ? `<p>El reporte ya está asociado. Se conserva el folio de recepción para su seguimiento.</p>${btn("Abrir reporte AC", "open-report")}`
       : `<h2>Seleccionar la ficha correcta</h2><p>Revisa la empresa, el número económico y la marca. El reporte conservará los datos originales y la vinculación quedará en la bitácora.</p><form id="aqi-search" class="aci-filters"><label class="hc-field"><b>Buscar en flotas AC</b><input name="q" value="${esc(x.unit)}" maxlength="180" placeholder="Empresa o número económico"></label><button class="hc-btn" type="submit">Buscar unidad</button>${btn("Ir a Flotas AC", "fleet")}</form>
   <form id="aqi-link"><label class="hc-field"><b>Empresa, unidad y marca de destino</b><select id="aqi-unit" name="unitId" required><option value="">Cargando fichas…</option></select></label><p id="aqi-candidate-note" class="hc-subtle"></p><label class="aqi-confirm"><input id="aqi-confirm" type="checkbox" required> Confirmo que la ficha seleccionada corresponde al autobús reportado.</label><button class="hc-btn primary" type="submit">Vincular y abrir reporte AC</button></form>`
   }
   <p id="aqi-error" class="hc-error" role="alert"></p></div>`;
    if (x.status === "pending") await candidates(x.unit);
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-aqi]");
    if (!b || !ctx || !ctx.active() || busy) return;
    try {
      const a = b.dataset.aqi;
      if (a === "reports") await ctx.navigate("incidents");
      if (a === "fleet") await ctx.navigate("fleet");
      if (a === "detail") await detail(b.dataset.id);
      if (a === "list") {
        offset = 0;
        await list();
      }
      if (a === "refresh") await (current ? detail(current.id) : list());
      if (a === "next" || a === "prev") {
        offset = Math.max(0, offset + (a === "next" ? 25 : -25));
        await list();
      }
      if (a === "open-report")
        await ctx.navigate("incidents", current.requestId);
    } catch (err) {
      error(err);
    }
  });
  document.addEventListener("submit", async (e) => {
    if (
      !["aqi-filter", "aqi-search", "aqi-link"].includes(e.target.id) ||
      !ctx?.active()
    )
      return;
    e.preventDefault();
    if (busy) return;
    const form = e.target,
      b = Object.fromEntries(new FormData(form));
    try {
      if (form.id === "aqi-filter") {
        query = b.q;
        status = b.status;
        offset = 0;
        await list();
      }
      if (form.id === "aqi-search") await candidates(b.q);
      if (form.id === "aqi-link") {
        busy = true;
        form.querySelector("button").disabled = true;
        const r = await ctx.api("/qr-intakes/" + current.id + "/link", {
          method: "POST",
          body: JSON.stringify({
            unitId: b.unitId,
            version: current.version,
            confirm: $("#aqi-confirm").checked,
          }),
        });
        await window.ACOperations.refreshNotifications();
        await ctx.navigate("incidents", r.requestId);
        ctx.toast(
          "Reporte vinculado. Se conservaron el contacto y las fotografías.",
        );
      }
    } catch (err) {
      error(err);
    } finally {
      busy = false;
      if (form.isConnected && form.id === "aqi-link")
        form.querySelector("button").disabled = false;
    }
  });
  window.ACQrIntakes = { show };
})();
