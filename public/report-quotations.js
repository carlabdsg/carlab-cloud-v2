"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    esc = escapeHtml;
  const labels = {
    sin_cotizacion: "Sin cotización",
    cotizada: "Cotizada · pendiente",
    aceptada: "Aceptada",
    rechazada: "Rechazada",
  };
  const view = {
    units: [],
    company: "",
    filter: "",
    query: "",
    role: "",
    selected: null,
    detail: null,
    reportId: "",
    busy: false,
    loading: false,
    blob: "",
    viewer: null,
    pdfRequest: 0,
    detailRequest: 0,
    returnFocus: null,
  };
  const date = (value) =>
    value
      ? new Date(value).toLocaleString("es-MX", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "";
  const pill = (status) =>
    `<span class="rq-status rq-${status}"><i></i>${esc(labels[status] || status)}</span>`;
  const message = (text) => {
    $("rqMessage").textContent = text;
  };
  const panel = $("quotesPanel");
  panel.innerHTML = `<div class="rq-heading"><div><span class="rw-eyebrow">AUTORIZACIÓN DE TRABAJOS</span><h2>Cotizaciones por unidad</h2><p id="rqIntro"></p></div><button type="button" class="btn btn-primary" id="rqNew">+ Subir cotización</button></div>
    <div class="rq-legend" aria-label="Estados de cotización">${Object.keys(
      labels,
    )
      .map((s) => pill(s))
      .join("")}</div>
    <div class="rq-filters"><label>Empresa<select id="rqCompany"><option value="">Todas las empresas</option></select></label><label>Buscar unidad<input id="rqSearch" type="search" placeholder="Número económico, empresa o flota" /></label><label>Estado<select id="rqStatus"><option value="">Todos los estados</option>${Object.keys(
      labels,
    )
      .map((s) => `<option value="${s}">${labels[s]}</option>`)
      .join("")}</select></label></div>
    <div class="rq-list-head"><span id="rqCount"></span><button type="button" class="rq-link" id="rqRefresh">Actualizar</button></div><p id="rqMessage" role="status" aria-live="polite"></p><div id="rqGrid" class="rq-grid"></div>`;
  const dialog = document.createElement("dialog");
  dialog.id = "rqDialog";
  dialog.className = "rq-dialog";
  dialog.setAttribute("aria-labelledby", "rqDialogTitle");
  dialog.innerHTML = `<header class="rq-dialog-head"><div><span class="rw-eyebrow">CARLAB / COTIZACIONES</span><h2 id="rqDialogTitle">Cotización</h2><p id="rqDialogSubtitle"></p></div><button type="button" class="rq-close" aria-label="Cerrar cotización">×</button></header><div class="rq-dialog-body"><div id="rqUnitField"><label for="rqUnitSelect">Unidad de la empresa</label><select id="rqUnitSelect"></select></div><div id="rqReportField"><label for="rqReportSelect">Reporte relacionado</label><select id="rqReportSelect"></select></div><p id="rqDetailMessage" role="status" aria-live="polite"></p><div id="rqReportContent"></div></div>`;
  document.body.append(dialog);
  function releasePdf() {
    view.pdfRequest++;
    view.viewer?.destroy();
    view.viewer = null;
    if (view.blob) URL.revokeObjectURL(view.blob);
    view.blob = "";
  }
  dialog.querySelector(".rq-close").onclick = () => {
    if (!view.busy) dialog.close();
  };
  dialog.addEventListener("cancel", (e) => {
    if (view.busy) e.preventDefault();
  });
  dialog.addEventListener("close", () => {
    releasePdf();
    view.detailRequest++;
    view.selected = null;
    view.detail = null;
    view.reportId = "";
    view.returnFocus?.focus();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog && !view.busy) dialog.close();
  });
  const hasDraft = () =>
    Boolean($("rqPdfInput")?.files?.length || $("rqDecisionBox"));
  async function load(silent = false) {
    if (view.loading || !["admin", "operador"].includes(state.user?.role))
      return;
    view.loading = true;
    const sessionToken = state.token;
    if (!silent) message("Cargando cotizaciones…");
    try {
      const data = await api.request("/api/report-quotes");
      if (
        !state.user ||
        state.token !== sessionToken ||
        state.activePanel !== "quotes"
      )
        return;
      view.role = data.role;
      const previous = JSON.stringify(view.units);
      view.units = data.units.sort(
        (a, b) =>
          a.empresa.localeCompare(b.empresa, "es") ||
          a.numeroEconomico.localeCompare(b.numeroEconomico, "es", {
            numeric: true,
          }),
      );
      $("rqNew").hidden = view.role !== "admin";
      $("rqIntro").textContent =
        view.role === "admin"
          ? "Selecciona una unidad, relaciona el reporte y carga su cotización en PDF."
          : "Consulta las cotizaciones de tu empresa y registra tu respuesta.";
      const names = [...new Set(view.units.map((u) => u.empresa))];
      $("rqCompany").replaceChildren(
        new Option(
          view.role === "admin"
            ? "Todas las empresas"
            : data.company || "Mi empresa",
          "",
        ),
        ...(view.role === "admin"
          ? names.map((name) => new Option(name, name))
          : []),
      );
      if (!names.includes(view.company)) view.company = "";
      $("rqCompany").value = view.company;
      $("rqCompany").disabled = view.role !== "admin";
      if (previous !== JSON.stringify(view.units) || !silent) render();
      message("");
      if (dialog.open && view.selected && !view.busy && !hasDraft())
        await loadDetail(view.reportId, true);
    } catch (error) {
      message(error.message + " Pulsa Actualizar para reintentar.");
    } finally {
      view.loading = false;
    }
  }
  function render() {
    const search = normalizeText(view.query);
    const units = view.units.filter(
      (u) =>
        (!view.company || u.empresa === view.company) &&
        (!view.filter || u.status === view.filter) &&
        (!search ||
          normalizeText(
            `${u.empresa} ${u.numeroEconomico} ${u.modelo} ${u.nombreFlota}`,
          ).includes(search)),
    );
    $("rqCount").textContent =
      `${units.length} unidades · ${view.units.filter((u) => u.pending).length} con cotización pendiente`;
    $("rqGrid").replaceChildren();
    if (!units.length) {
      $("rqGrid").innerHTML =
        '<div class="rq-empty">No hay unidades que coincidan con esta búsqueda.</div>';
      return;
    }
    for (const unit of units) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `rq-unit rq-${unit.status}`;
      card.dataset.quoteUnit = unit.key;
      card.dataset.status = unit.status;
      card.innerHTML = `<div class="rq-card-top">${pill(unit.status)}<span>${esc(unit.marca || "Unidad")}</span></div><strong class="rq-unit-number">${esc(unit.numeroEconomico)}</strong><span class="rq-unit-company">${esc(unit.empresa)}</span><span class="rq-bus" style="--rq-bus-image:url('${fleetBusAsset(unit)}')" aria-hidden="true"></span><div class="rq-card-bottom"><span>${unit.quoteCount ? `${unit.quoteCount} cotización${unit.quoteCount !== 1 ? "es" : ""}${unit.pending ? ` · ${unit.pending} pendiente${unit.pending !== 1 ? "s" : ""}` : ""}` : `${unit.reportCount} reporte${unit.reportCount !== 1 ? "s" : ""} · sin PDF`}</span><strong>Ver ficha →</strong></div>`;
      card.onclick = () => open(unit);
      $("rqGrid").append(card);
    }
  }
  function open(unit = null) {
    view.returnFocus = document.activeElement;
    view.selected = unit;
    view.detail = null;
    view.reportId = "";
    $("rqDialogTitle").textContent = unit
      ? `Unidad ${unit.numeroEconomico}`
      : "Subir cotización";
    $("rqDialogSubtitle").textContent =
      unit?.empresa ||
      "Elige la unidad y el reporte al que corresponde el PDF.";
    $("rqUnitField").hidden = view.role !== "admin";
    $("rqUnitSelect").replaceChildren(
      new Option("Selecciona una unidad", ""),
      ...view.units
        .filter((u) => !view.company || u.empresa === view.company)
        .map(
          (u) =>
            new Option(`${u.empresa} · Unidad ${u.numeroEconomico}`, u.key),
        ),
    );
    $("rqUnitSelect").value = unit?.key || "";
    $("rqReportField").hidden = true;
    $("rqReportContent").replaceChildren();
    $("rqDetailMessage").textContent = "";
    dialog.showModal();
    if (unit) loadDetail();
  }
  async function loadDetail(reportId = "", silent = false) {
    if (!view.selected) return;
    const ticket = ++view.detailRequest,
      unit = view.selected;
    if (!silent)
      $("rqDetailMessage").textContent = "Cargando reportes y cotizaciones…";
    try {
      const detail = await api.request(
        "/api/report-quotes/unit?" +
          new URLSearchParams({
            company: unit.empresa,
            unit: unit.numeroEconomico,
          }),
      );
      if (ticket !== view.detailRequest || !dialog.open) return;
      const old = JSON.stringify(view.detail);
      view.detail = detail;
      $("rqDetailMessage").textContent = "";
      if (silent && old === JSON.stringify(detail)) return;
      $("rqReportField").hidden = !detail.reports.length;
      $("rqReportSelect").replaceChildren(
        ...detail.reports.map(
          (r) =>
            new Option(
              `${r.folio} · ${labels[r.current?.status || "sin_cotizacion"]}${r.archived ? " · Historial" : ""}`,
              r.id,
            ),
        ),
      );
      const selection =
        detail.reports.find((r) => r.id === reportId) ||
        detail.reports.find((r) => r.current?.status === "cotizada") ||
        detail.reports.find((r) => r.current) ||
        detail.reports[0];
      view.reportId = selection?.id || "";
      $("rqReportSelect").value = view.reportId;
      renderReport();
    } catch (error) {
      if (ticket === view.detailRequest)
        $("rqDetailMessage").textContent = error.message;
    }
  }
  function currentReport() {
    return view.detail?.reports.find((r) => r.id === view.reportId);
  }
  function renderReport() {
    releasePdf();
    const report = currentReport(),
      content = $("rqReportContent");
    if (!report) {
      content.innerHTML =
        '<div class="rq-empty"><h3>Esta unidad todavía no tiene reportes</h3><p>La cotización debe relacionarse con un reporte registrado.</p></div>';
      return;
    }
    const quote = report.current;
    content.innerHTML = `<div class="rq-report-summary"><div><span class="rw-eyebrow">${esc(report.folio)}</span><h3>${esc(report.description || "Reporte de la unidad")}</h3></div>${pill(quote?.status || "sin_cotizacion")}</div>`;
    if (quote) {
      content.insertAdjacentHTML(
        "beforeend",
        `<div class="rq-file-bar"><div><strong>${esc(quote.fileName)}</strong><span>Versión ${quote.revision} · ${(quote.fileSize / 1024).toFixed(0)} KB · ${date(quote.createdAt)}</span></div><div id="rqPdfActions"></div></div><p id="rqPdfMessage" role="status">Abriendo PDF…</p><div id="rqPdfViewer" hidden><div class="rq-pdf-toolbar"><button type="button" id="rqPdfPrev" aria-label="Página anterior">←</button><span id="rqPdfPage" role="status"></span><button type="button" id="rqPdfNext" aria-label="Página siguiente">→</button><span class="rq-pdf-spacer"></span><button type="button" id="rqPdfLess" aria-label="Reducir PDF">−</button><button type="button" id="rqPdfMore" aria-label="Ampliar PDF">+</button></div><div id="rqPdfPages" class="rq-pdf-pages" tabindex="0" aria-label="Vista previa de la cotización"></div></div>`,
      );
      if (quote.status !== "cotizada")
        content.insertAdjacentHTML(
          "beforeend",
          `<div class="rq-response rq-${quote.status}"><strong>${esc(labels[quote.status])} por ${esc(quote.respondedBy)}</strong><span>${date(quote.respondedAt)}</span>${quote.responseNote ? `<p>${esc(quote.responseNote)}</p>` : ""}</div>`,
        );
      if (
        view.role === "operador" &&
        quote.status === "cotizada" &&
        quote.reportId &&
        !report.archived
      ) {
        content.insertAdjacentHTML(
          "beforeend",
          `<div class="rq-decision"><p>Revisa el PDF de esta versión antes de responder.</p><div class="rq-actions"><button type="button" id="rqAccept" class="rq-accept">Aceptar cotización</button><button type="button" id="rqReject" class="rq-reject">Rechazar cotización</button></div><div id="rqDecisionArea"></div></div>`,
        );
        $("rqAccept").onclick = () => decisionForm("aceptada");
        $("rqReject").onclick = () => decisionForm("rechazada");
      }
      if (!quote.reportId || report.archived)
        content.insertAdjacentHTML(
          "beforeend",
          '<p class="rq-note">El reporte ya no está disponible en esta unidad. Esta cotización se conserva como historial.</p>',
        );
      loadPdf(quote);
    } else
      content.insertAdjacentHTML(
        "beforeend",
        '<div class="rq-empty rq-empty-small">Sin cotización en PDF para este reporte.</div>',
      );
    if (view.role === "admin" && report.canUpload) {
      content.insertAdjacentHTML(
        "beforeend",
        `<form id="rqUploadForm" class="rq-upload"><h3>${quote ? "Subir nueva versión" : "Cargar cotización"}</h3><p>${quote ? "La nueva versión quedará pendiente de respuesta. Las anteriores se conservan en el historial." : "Selecciona el PDF que revisará el operador de esta empresa."}</p><label for="rqPdfInput">Archivo PDF · máximo 10 MB</label><input id="rqPdfInput" type="file" accept="application/pdf,.pdf" required /><div class="rq-actions"><button type="submit" class="btn btn-primary" id="rqUpload">${quote ? "Publicar nueva versión" : "Publicar cotización"}</button><span id="rqUploadStatus" role="status"></span></div></form>`,
      );
      $("rqUploadForm").onsubmit = upload;
    }
    const previous = report.versions.filter((v) => !v.isCurrent);
    if (previous.length) {
      const history = document.createElement("details");
      history.className = "rq-history";
      history.innerHTML = `<summary>Versiones anteriores (${previous.length})</summary>${previous.map((q) => `<div><span><strong>Versión ${q.revision}</strong> · ${esc(labels[q.status])}<small>${date(q.createdAt)}${q.respondedBy ? ` · ${esc(q.respondedBy)}` : ""}</small></span><button type="button" class="rq-link" data-history-pdf="${esc(q.id)}">Descargar PDF</button></div>`).join("")}`;
      content.append(history);
      history.querySelectorAll("[data-history-pdf]").forEach(
        (btn) =>
          (btn.onclick = () =>
            downloadVersion(
              report.versions.find((q) => q.id === btn.dataset.historyPdf),
              btn,
            )),
      );
    }
  }
  async function fetchPdf(quote) {
    const response = await fetch(
      `/api/report-quotes/${encodeURIComponent(quote.id)}/pdf`,
      {
        headers: { Authorization: `Bearer ${state.token}` },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      let error;
      try {
        error = await response.json();
      } catch {}
      throw Error(error?.error || "No se pudo abrir el PDF.");
    }
    return response.blob();
  }
  async function loadPdf(quote) {
    const ticket = ++view.pdfRequest;
    try {
      const blob = await fetchPdf(quote);
      if (ticket !== view.pdfRequest || !dialog.open) return;
      view.blob = URL.createObjectURL(blob);
      $("rqPdfActions").innerHTML =
        `<a class="rq-link" target="_blank" rel="noopener" href="${view.blob}">Abrir PDF</a><a class="rq-link" href="${view.blob}" download="${esc(quote.fileName)}">Descargar</a>`;
      const pdfjs = await import("/vendor/pdfjs/pdf.min.mjs");
      if (ticket !== view.pdfRequest || !dialog.open) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        isEvalSupported: false,
        cMapUrl: "/vendor/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
        wasmUrl: "/vendor/pdfjs/wasm/",
      });
      if (ticket !== view.pdfRequest || !dialog.open) {
        task.destroy().catch(() => {});
        return;
      }
      const viewer = createPdfViewer(task, ticket);
      view.viewer = viewer;
      await viewer.start();
    } catch (error) {
      if (ticket === view.pdfRequest && $("rqPdfMessage"))
        $("rqPdfMessage").textContent = view.blob
          ? "No se pudo mostrar la vista previa. Puedes abrir o descargar el PDF original."
          : error.message;
    }
  }
  function createPdfViewer(task, ticket) {
    let doc,
      renderTask,
      pageNumber = 1,
      zoom = 1,
      generation = 0,
      resizeTimer;
    const pages = $("rqPdfPages"),
      viewer = $("rqPdfViewer");
    const active = () => ticket === view.pdfRequest && dialog.open;
    const controls = () => {
      if (!active() || !doc) return;
      $("rqPdfPage").textContent = `${pageNumber} / ${doc.numPages}`;
      $("rqPdfPrev").disabled = view.busy || pageNumber <= 1;
      $("rqPdfNext").disabled = view.busy || pageNumber >= doc.numPages;
      $("rqPdfLess").disabled = view.busy || zoom <= 1;
      $("rqPdfMore").disabled = view.busy || zoom >= 2;
    };
    async function draw() {
      if (!active() || !doc) return;
      const turn = ++generation;
      renderTask?.cancel();
      controls();
      $("rqPdfMessage").textContent = "Preparando página…";
      try {
        const page = await doc.getPage(pageNumber);
        if (!active() || turn !== generation) return;
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: (Math.max(1, pages.clientWidth - 24) / natural.width) * zoom,
        });
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(4000000 / (viewport.width * viewport.height)),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute("role", "img");
        canvas.setAttribute(
          "aria-label",
          `Cotización, página ${pageNumber} de ${doc.numPages}. Usa Abrir PDF para acceder al documento original.`,
        );
        const rendering = page.render({
          canvasContext: canvas.getContext("2d"),
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        renderTask = rendering;
        await rendering.promise;
        if (!active() || turn !== generation) return;
        pages.replaceChildren(canvas);
        pages.scrollTo(0, 0);
        $("rqPdfMessage").textContent =
          "Vista previa del PDF original. Puedes ampliarlo o descargarlo.";
      } catch (error) {
        if (
          active() &&
          turn === generation &&
          error.name !== "RenderingCancelledException"
        )
          $("rqPdfMessage").textContent =
            "No se pudo mostrar esta página. Abre o descarga el PDF original.";
      }
    }
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(draw, 150);
    });
    return {
      controls,
      async start() {
        doc = await task.promise;
        if (!active()) return;
        viewer.hidden = false;
        $("rqPdfPrev").onclick = () => {
          pageNumber = Math.max(1, pageNumber - 1);
          draw();
        };
        $("rqPdfNext").onclick = () => {
          pageNumber = Math.min(doc.numPages, pageNumber + 1);
          draw();
        };
        $("rqPdfLess").onclick = () => {
          zoom = Math.max(1, zoom - 0.25);
          draw();
        };
        $("rqPdfMore").onclick = () => {
          zoom = Math.min(2, zoom + 0.25);
          draw();
        };
        await draw();
        if (active()) observer.observe(pages);
      },
      destroy() {
        generation++;
        clearTimeout(resizeTimer);
        observer.disconnect();
        renderTask?.cancel();
        task.destroy().catch(() => {});
      },
    };
  }
  async function downloadVersion(quote, btn) {
    btn.disabled = true;
    try {
      const url = URL.createObjectURL(await fetchPdf(quote));
      const a = document.createElement("a");
      a.href = url;
      a.download = quote.fileName;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      $("rqDetailMessage").textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  }
  function setBusy(busy) {
    view.busy = busy;
    dialog
      .querySelectorAll("button,input,select,textarea")
      .forEach((el) => (el.disabled = busy));
    dialog.querySelector(".rq-close").disabled = busy;
    view.viewer?.controls();
  }
  async function upload(event) {
    event.preventDefault();
    if (view.busy) return;
    const report = currentReport(),
      unit = view.selected,
      file = $("rqPdfInput").files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024 || !/\.pdf$/i.test(file.name)) {
      $("rqUploadStatus").textContent = "Selecciona un PDF de hasta 10 MB.";
      return;
    }
    setBusy(true);
    $("rqUploadStatus").textContent = "Subiendo PDF…";
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(Error("No se pudo leer el archivo."));
        reader.readAsDataURL(file);
      });
      await api.request("/api/report-quotes", {
        method: "POST",
        body: JSON.stringify({
          reportId: report.id,
          company: unit.empresa,
          unit: unit.numeroEconomico,
          fileName: file.name,
          pdfBase64: base64,
          expectedRevision:
            report.latestRevision ?? report.current?.revision ?? 0,
        }),
      });
      await loadDetail(report.id);
      await load(true);
      notify(
        "Cotización publicada. La unidad queda en azul hasta recibir respuesta.",
      );
    } catch (error) {
      if ($("rqUploadStatus")) $("rqUploadStatus").textContent = error.message;
    } finally {
      setBusy(false);
    }
  }
  function decisionForm(decision) {
    const quote = currentReport()?.current;
    if (!quote || view.busy) return;
    $("rqDecisionArea").innerHTML =
      `<form id="rqDecisionBox"><strong>${decision === "aceptada" ? "Confirmar aceptación" : "Confirmar rechazo"} · versión ${quote.revision}</strong><p>Tu respuesta quedará registrada para ${esc(view.selected.empresa)}, unidad ${esc(view.selected.numeroEconomico)}.</p><label for="rqResponseNote">Comentario ${decision === "rechazada" ? "o motivo " : ""}(opcional)</label><textarea id="rqResponseNote" maxlength="1500" rows="3"></textarea><div class="rq-actions"><button type="submit" class="${decision === "aceptada" ? "rq-accept" : "rq-reject"}" id="rqConfirm">${decision === "aceptada" ? "Confirmar aceptación" : "Confirmar rechazo"}</button><button type="button" class="btn btn-ghost" id="rqCancelDecision">Cancelar</button></div><p id="rqDecisionStatus" role="status"></p></form>`;
    $("rqCancelDecision").onclick = () => $("rqDecisionArea").replaceChildren();
    $("rqDecisionBox").onsubmit = async (event) => {
      event.preventDefault();
      if (view.busy) return;
      const note = $("rqResponseNote").value,
        reportId = view.reportId;
      setBusy(true);
      $("rqDecisionStatus").textContent = "Guardando respuesta…";
      try {
        await api.request(
          `/api/report-quotes/${encodeURIComponent(quote.id)}/decision`,
          { method: "POST", body: JSON.stringify({ decision, note }) },
        );
        await loadDetail(reportId);
        await load(true);
        notify(
          decision === "aceptada"
            ? "Cotización aceptada. La unidad queda en verde cuando todas sus cotizaciones estén aceptadas."
            : "Cotización rechazada. El administrador puede consultar tu respuesta.",
        );
      } catch (error) {
        if ($("rqDecisionStatus"))
          $("rqDecisionStatus").textContent = error.message;
      } finally {
        setBusy(false);
      }
    };
    $("rqResponseNote").focus();
  }
  $("rqUnitSelect").onchange = () => {
    releasePdf();
    view.selected =
      view.units.find((u) => u.key === $("rqUnitSelect").value) || null;
    view.reportId = "";
    view.detail = null;
    view.detailRequest++;
    $("rqReportContent").replaceChildren();
    $("rqReportField").hidden = true;
    if (view.selected) {
      $("rqDialogTitle").textContent =
        `Unidad ${view.selected.numeroEconomico}`;
      $("rqDialogSubtitle").textContent = view.selected.empresa;
      loadDetail();
    }
  };
  $("rqReportSelect").onchange = () => {
    view.reportId = $("rqReportSelect").value;
    renderReport();
  };
  $("rqCompany").onchange = () => {
    view.company = $("rqCompany").value;
    render();
  };
  $("rqStatus").onchange = () => {
    view.filter = $("rqStatus").value;
    render();
  };
  $("rqSearch").oninput = () => {
    view.query = $("rqSearch").value;
    render();
  };
  $("rqNew").onclick = () => open();
  $("rqRefresh").onclick = () => load();
  $("globalRefreshBtn").addEventListener("click", () => {
    if (state.activePanel === "quotes") load();
  });
  const refresh = () => {
    if (state.activePanel === "quotes" && !document.hidden && !view.busy)
      load(true);
  };
  setInterval(refresh, 15000);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  window.CarlabQuotations = {
    panelChanged(name) {
      if (name === "quotes") load();
      else if (dialog.open && !view.busy) dialog.close();
    },
  };
  if (state.activePanel === "quotes") load();
})();
