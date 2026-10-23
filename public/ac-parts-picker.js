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
  const option = (rows, value) =>
    rows
      .map(
        ([k, v]) =>
          `<option value="${esc(k)}" ${k === value ? "selected" : ""}>${esc(v)}</option>`,
      )
      .join("");
  const normalize = (v) =>
    String(v || "")
      .trim()
      .toUpperCase();
  const intervals = {
    mensual: "Mensual",
    trimestral: "Trimestral",
    semestral: "Semestral",
    anual: "Anual",
    bianual: "Cada 2 años",
  };
  let context,
    query,
    result,
    seq = 0,
    selected = new Map(),
    adding = false,
    loading = false,
    catalogOpen = false,
    session = "";
  async function api(route) {
    const token = localStorage.getItem("carlabToken");
    if (!token) throw new Error("Inicia sesión para continuar.");
    if (session && token !== session)
      throw new Error(
        "La sesión cambió. Cierra el selector y vuelve a abrirlo.",
      );
    const r = await fetch("/api/ac" + route, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || "No se pudo consultar el catálogo.");
    }
    return r;
  }
  async function documentSource(id, page = 1) {
    const tab = window.open("about:blank", "_blank");
    if (!tab)
      throw new Error("Permite abrir pestañas para consultar la referencia.");
    try {
      const r = await api("/parts/documents/" + encodeURIComponent(id)),
        blob = await r.blob(),
        url = URL.createObjectURL(blob);
      tab.location.href = url + "#page=" + Number(page || 1);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) {
      tab.close();
      throw e;
    }
  }
  function existing(ref) {
    return (
      ref &&
      context.currentParts.some(
        (p) => normalize(p.reference) === normalize(ref),
      )
    );
  }
  function error(e) {
    const el = $("#acp-error");
    if (el) el.textContent = e.message || e;
  }
  function close() {
    if (!adding) {
      seq++;
      $("#acp-dialog")?.close();
    }
  }
  const docButton = (s) =>
    s
      ? `<button type="button" class="hc-btn acp-source" data-ap="document" data-doc="${esc(s.documentId)}" data-page="${s.page}">Ver documento · pág. ${s.page}</button>`
      : "";
  function itemFromCatalog(p) {
    return {
      key: p.reference ? normalize(p.reference) : "stock:" + p.id,
      reference: p.reference,
      description: p.name,
      quantity: 1,
      kind: p.official?.kind || "refaccion",
      unit: p.official?.unit || "pieza",
      part: p,
      source: p.official?.sources[0],
      note: p.official?.notes || "",
      manualQuantity: true,
    };
  }
  function itemFromPackage(p) {
    return {
      ...p,
      description: p.description,
      manualQuantity: !p.selectableAsPackage,
    };
  }
  function keyOf(row) {
    return row.reference
      ? normalize(row.reference)
      : "package:" + result.package?.id + ":" + row.key;
  }
  function line(row, origin, index) {
    const key = keyOf(row),
      dup = existing(row.reference),
      needsRef = !row.reference && row.kind === "refaccion",
      needsUnit = row.unit === "unidad no indicada",
      entry = selected.get(key),
      p = row.part;
    const disabled = dup || needsRef || needsUnit;
    return `<article class="acp-item ${dup ? "acp-existing" : ""}"><div class="acp-item-main"><label><input type="checkbox" data-ap-select="${origin}" data-index="${index}" ${entry ? "checked" : ""} ${disabled ? "disabled" : ""}><span><b>${esc(row.description)}</b><small>${esc(row.reference || "Sin referencia en el documento")} · ${esc(row.unit || "pieza")}</small></span></label>${dup ? '<span class="hc-badge">Ya incluida en la orden</span>' : ""}${p ? `<span class="hc-subtle">Almacén AC: ${p.stock} · ${p.priceMXN ? `Precio configurado: $${p.priceMXN.toFixed(2)} MXN` : "Precio MXN por capturar"}</span>` : ""}${row.note ? `<p class="acp-warning">${esc(row.note)}</p>` : ""}${needsRef ? '<p class="acp-warning">Confirma la referencia y agrégala como concepto manual; no se sustituye por otra banda automáticamente.</p>' : ""}${needsUnit ? '<p class="acp-warning">Agrega este material como concepto manual indicando la cantidad y unidad verificadas. No se toma la cantidad de la cotización como carga del equipo.</p>' : ""}${origin === "package" && row.quoteUnitPriceUSD != null ? `<small class="hc-subtle">Precio unitario documental: ${row.quoteUnitPriceUSD.toFixed(2)} USD. No se aplica al importe MXN.</small>` : ""}${docButton(row.source)}</div><label class="hc-field acp-quantity"><b>Cantidad${row.unit ? " · " + esc(row.unit) : ""}</b><input type="number" data-ap-quantity="${origin}" data-index="${index}" min="0.001" max="100000" step="any" value="${esc(entry?.quantity ?? row.quantity)}" ${disabled ? "disabled" : ""}></label></article>`;
  }
  function render() {
    const el = $("#acp-dialog"),
      pack = result.package;
    el.innerHTML = `<header class="acp-head"><div><div class="hc-kicker">REFACCIONES AC / ${context.brand === "eberspaecher" ? "EBERSPÄCHER" : "HISPACOLD"}</div><h2>${context.type === "preventivo" ? `Refacciones para mantenimiento ${esc(intervals[context.interval] || context.interval)}` : "Seleccionar refacciones"}</h2></div><button type="button" class="hc-btn acp-close" data-ap="close" aria-label="Cerrar selector de refacciones">×</button></header><div class="acp-body">${context.equipment ? `<p><b>Equipo registrado:</b> ${esc(context.equipment)}</p>` : ""}<div class="hc-note">${esc(result.message)}</div>
   ${
     context.brand === "hispacold" &&
     context.type === "preventivo" &&
     ["semestral", "anual"].includes(context.interval)
       ? `<label class="hc-field acp-chassis"><b>Chasis de esta unidad</b><select id="acp-chassis">${option(
           [
             ["", "Seleccionar chasis"],
             ["man", "MAN"],
             ["mb", "Mercedes-Benz"],
             ["scania", "Scania"],
             ["volvo", "Volvo"],
           ],
           result.chassis,
         )}</select></label>`
       : ""
   }
   ${pack ? `<section class="acp-pack"><div class="acp-section-head"><div><h3>Sugeridas según cotización</h3><small>${esc(pack.source.title)}</small></div><button type="button" class="hc-btn" data-ap="select-package">Seleccionar piezas del paquete</button></div><p class="hc-subtle">Puedes cambiar cantidades o quitar piezas. Materiales sin unidad confirmada, misceláneos y horas de mano de obra se seleccionan individualmente.</p>${pack.lines.map((p, i) => line(itemFromPackage(p), "package", i)).join("")}</section>` : ""}
   <details class="acp-catalog" ${!pack || catalogOpen ? "open" : ""}><summary>Buscar otras refacciones · catálogo y almacén AC</summary><section><form id="acp-search" class="acp-search"><label class="hc-field"><b>Referencia o descripción</b><input name="q" type="search" maxlength="180" value="${esc(query.q)}" placeholder="Ej. filtro, 9000061-R, motor…"></label>${
     context.brand === "hispacold"
       ? `<label class="hc-field"><b>Documento / familia</b><select name="family">${option(
           [
             ["", "Todo el catálogo AC"],
             ["efficient", "Catálogo Efficient"],
             ["recambios", "Recambios 2025"],
             ["cotizaciones", "Referencias de cotizaciones 2026"],
             ["custom", "Otras piezas del almacén AC"],
           ],
           query.family,
         )}</select></label>`
       : ""
   }<button type="submit" class="hc-btn primary">Buscar</button></form><p class="hc-subtle">Figurar en un catálogo no confirma la compatibilidad con esta unidad. Revisa el modelo, la referencia y el documento.</p>${result.items.map((p, i) => line(itemFromCatalog(p), "catalog", i)).join("") || "<p>Sin coincidencias.</p>"}<div class="hc-actions"><button type="button" class="hc-btn" data-ap="previous" ${query.offset === 0 ? "disabled" : ""}>Anterior</button><span>${result.total ? query.offset + 1 : 0}–${Math.min(query.offset + 30, result.total)} de ${result.total}</span><button type="button" class="hc-btn" data-ap="next" ${query.offset + 30 >= result.total ? "disabled" : ""}>Siguiente</button></div></section></details></div><footer class="acp-footer"><details class="acp-disclaimer"><summary>Precios en MXN · sin salida automática de almacén</summary><p>${esc(result.currencyNote)}</p><p>Agregar conceptos a la orden no descuenta existencias ni confirma que el trabajo se haya realizado.</p></details><p id="acp-error" role="alert" class="hc-error"></p><div class="hc-actions"><span id="acp-selected"></span><button type="button" class="hc-btn" data-ap="clear">Limpiar selección</button><button type="button" class="hc-btn" data-ap="close">Cancelar</button><button type="button" class="hc-btn primary" data-ap="add">Agregar a la orden</button></div></footer>`;
    updateCount();
  }
  function updateCount() {
    if ($("#acp-selected"))
      $("#acp-selected").textContent =
        selected.size + " conceptos seleccionados";
    if ($("#acp-dialog [data-ap=add]"))
      $("#acp-dialog [data-ap=add]").disabled = !selected.size || loading;
  }
  async function load() {
    const n = ++seq;
    loading = true;
    updateCount();
    try {
      const r = await api(
        "/parts/assistant?" +
          new URLSearchParams({
            ...query,
            brand: context.brand,
            type: context.type,
            interval: context.interval,
            chassis: query.chassis,
          }),
      );
      const j = await r.json();
      if (n !== seq || !$("#acp-dialog")?.open) return;
      result = j;
      render();
    } finally {
      if (n === seq) {
        loading = false;
        updateCount();
      }
    }
  }
  function syncRows() {
    document
      .querySelectorAll("#acp-dialog [data-ap-select]")
      .forEach((input) => {
        const row = rowFrom(
            input.dataset.apSelect,
            Number(input.dataset.index),
          ),
          entry = selected.get(keyOf(row));
        input.checked = !!entry;
        if (entry)
          input.closest(".acp-item").querySelector("[data-ap-quantity]").value =
            entry.quantity;
      });
    updateCount();
  }
  async function open(options) {
    context = options;
    session = localStorage.getItem("carlabToken") || "";
    selected = new Map();
    adding = false;
    loading = false;
    catalogOpen = false;
    query = {
      q: "",
      family: /efficient/i.test(options.equipment || "") ? "efficient" : "",
      offset: 0,
      chassis: options.chassis || "",
    };
    let el = $("#acp-dialog");
    if (!el) {
      el = document.createElement("dialog");
      el.id = "acp-dialog";
      el.setAttribute("aria-label", "Selector de refacciones");
      document.body.append(el);
      el.addEventListener("cancel", () => seq++);
    }
    el.innerHTML =
      '<header class="acp-head"><h2>Consultando refacciones…</h2><button class="hc-btn acp-close" data-ap="close" aria-label="Cerrar selector de refacciones">×</button></header><p id="acp-error" class="hc-error" role="alert"></p>';
    if (!el.open) el.showModal();
    try {
      await load();
    } catch (e) {
      error(e);
    }
  }
  function rowFrom(origin, index) {
    return origin === "package"
      ? itemFromPackage(result.package.lines[index])
      : itemFromCatalog(result.items[index]);
  }
  document.addEventListener(
    "toggle",
    (e) => {
      if (
        e.target.matches?.("#acp-dialog .acp-catalog") &&
        e.target.isConnected
      )
        catalogOpen = e.target.open;
    },
    true,
  );
  document.addEventListener("change", async (e) => {
    if (!e.target.closest("#acp-dialog")) return;
    if (e.target.id === "acp-chassis") {
      query.chassis = e.target.value;
      selected.clear();
      try {
        await load();
      } catch (err) {
        error(err);
      }
      return;
    }
    if (e.target.dataset.apQuantity) {
      syncRows();
      return;
    }
    if (e.target.dataset.apSelect) {
      const row = rowFrom(
          e.target.dataset.apSelect,
          Number(e.target.dataset.index),
        ),
        key = keyOf(row),
        qty = e.target
          .closest(".acp-item")
          .querySelector("[data-ap-quantity]").value;
      if (e.target.checked)
        selected.set(key, { ...row, quantity: Number(qty) });
      else selected.delete(key);
      syncRows();
    }
  });
  document.addEventListener("input", (e) => {
    if (!e.target.dataset.apQuantity) return;
    const row = rowFrom(
        e.target.dataset.apQuantity,
        Number(e.target.dataset.index),
      ),
      key = keyOf(row);
    if (selected.has(key)) selected.get(key).quantity = Number(e.target.value);
  });
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "acp-search") return;
    e.preventDefault();
    query = {
      ...query,
      ...Object.fromEntries(new FormData(e.target)),
      offset: 0,
    };
    try {
      await load();
    } catch (err) {
      error(err);
    }
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ap]");
    if (!b || adding) return;
    const action = b.dataset.ap;
    if (loading && action !== "close") return;
    try {
      if (action === "close") close();
      if (action === "document")
        await documentSource(b.dataset.doc, b.dataset.page);
      if (action === "clear") {
        selected.clear();
        render();
      }
      if (action === "select-package") {
        for (const line of result.package.lines) {
          if (
            line.selectableAsPackage &&
            line.part &&
            !existing(line.reference)
          ) {
            const row = itemFromPackage(line);
            if (!selected.has(keyOf(row))) selected.set(keyOf(row), row);
          }
        }
        render();
      }
      if (action === "next" || action === "previous") {
        query.offset += action === "next" ? 30 : -30;
        await load();
        $("#acp-search").scrollIntoView({ block: "start" });
      }
      if (action === "add") {
        if (context.currentParts.length + selected.size > 60)
          throw new Error("La orden admite hasta 60 conceptos.");
        const items = [...selected.values()];
        if (
          items.some(
            (i) =>
              !Number.isFinite(Number(i.quantity)) ||
              Number(i.quantity) < 0.001 ||
              Number(i.quantity) > 100000,
          )
        )
          throw new Error("Revisa las cantidades de las piezas seleccionadas.");
        adding = true;
        b.disabled = true;
        try {
          await context.onAdd(
            items.map((i) => ({
              kind: i.kind,
              description: i.description,
              reference: i.reference,
              quantity: Number(i.quantity),
              unitPrice: i.part?.priceMXN || 0,
              ...(i.part?.official
                ? {
                    officialKey: i.part.official.key,
                    sourceDocumentId: i.source?.documentId,
                  }
                : {}),
            })),
            { chassis: result.chassis },
          );
          $("#acp-dialog").close();
        } finally {
          adding = false;
          b.disabled = false;
        }
      }
    } catch (err) {
      error(err);
    }
  });
  window.ACPartsPicker = { open, documentSource };
})();
