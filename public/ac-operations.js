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
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
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
  const button = (label, action, extra = "", cls = "") =>
    `<button type="button" class="hc-btn ${cls}" data-ac-action="${action}" ${extra}>${label}</button>`;
  const options = (items, selected = "", empty) =>
    `${empty === undefined ? "" : `<option value="">${esc(empty)}</option>`}${Object.entries(
      items,
    )
      .map(
        ([k, v]) =>
          `<option value="${esc(k)}" ${k === String(selected) ? "selected" : ""}>${esc(v)}</option>`,
      )
      .join("")}`;
  const field = (label, name, value = "", type = "text", extra = "") =>
    `<label class="hc-field ${type === "textarea" ? "wide" : ""}"><b>${esc(label)}</b>${type === "textarea" ? `<textarea name="${name}" maxlength="4000" ${extra}>${esc(value)}</textarea>` : `<input name="${name}" type="${type}" value="${esc(value)}" ${extra}>`}</label>`;
  const select = (label, name, items, value = "", empty) =>
    `<label class="hc-field"><b>${esc(label)}</b><select name="${name}">${options(items, value, empty)}</select></label>`;
  const heading = (title, description, actions = "") =>
    `<div class="hc-heading"><div><div class="hc-kicker">CARLAB / CLIMATIZACIÓN</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="hc-actions">${actions}</div></div>`;
  let info,
    library,
    currentView = "",
    offset = 0,
    filters = { kind: "", brand: "", status: "", pending: "", deleted: "" },
    parts = [],
    requests = [],
    users = [],
    currentRequest = null,
    currentPart = null,
    currentUser = null,
    noticeData = { items: [], unread: 0, throughId: "0" },
    requestPhotos = [],
    requestKey = "",
    movementKey = "",
    busy = false,
    notifying = false,
    refreshTimer,
    sessionToken = "";
  const external = document.body.dataset.acPortal === "external";
  async function api(path, settings = {}) {
    const token = localStorage.getItem("carlabToken");
    if (!token) throw new Error("Inicia sesión para continuar.");
    if (sessionToken && token !== sessionToken)
      throw new Error("La sesión cambió. Recarga para continuar.");
    const r = await fetch("/api/ac" + path, {
      ...settings,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        ...settings.headers,
      },
      cache: "no-store",
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const e = new Error(j.error || "No se pudo completar la operación.");
      e.status = r.status;
      throw e;
    }
    return settings.blob ? r.blob() : r.json();
  }
  function toast(s) {
    const el = $("#hc-toast");
    if (!el) return;
    el.textContent = s;
    el.hidden = false;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => (el.hidden = true), 5000);
  }
  function error(e) {
    const el = $("#ac-dialog-error");
    if (el && $("#ac-dialog")?.open) {
      el.textContent = e.message;
      el.scrollIntoView({ block: "nearest" });
    } else toast(e.message);
  }
  const name = (b) =>
    info?.brands[b] || b || info?.user.company || "Aire acondicionado";
  const portalContext = (view) => ({
    api,
    info,
    library,
    toast,
    navigate,
    newRequest,
    newIncident,
    compress,
    dialog,
    active: () => currentView === view,
  });
  async function newIncident(seed) {
    document.querySelector("#ac-dialog")?.close();
    await window.ACIncidents.create(portalContext("incidents"), seed);
  }
  function dialog(html) {
    let el = $("#ac-dialog");
    if (!el) {
      el = document.createElement("dialog");
      el.id = "ac-dialog";
      document.body.append(el);
    }
    el.innerHTML =
      '<div class="acp-dialog-top"><button type="button" class="hc-btn" data-ac-action="dialog-close" aria-label="Cerrar ventana">×</button></div>' +
      html +
      '<p id="ac-dialog-error" class="hc-error" role="alert"></p>';
    if (!el.open) el.showModal();
  }
  function closeDialog() {
    if (!busy) $("#ac-dialog")?.close();
  }
  async function navigate(view, id) {
    $("#ac-notification-panel").hidden = true;
    if (!external && window.CarlabACNav) {
      if (view === "order") return window.CarlabACNav.open(id);
      if (
        [
          "services",
          "orders",
          "history",
          "library",
          "codes",
          "trash",
          "calendar",
        ].includes(view)
      )
        return window.CarlabACNav.show(view === "orders" ? "services" : view);
      const result = await window.CarlabACNav.operations(view, id);
      if (result) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      return result;
    }
    await show(view, id);
    if (external) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return true;
  }
  const post = (body) => ({ method: "POST", body: JSON.stringify(body) });
  const patch = (body) => ({ method: "PATCH", body: JSON.stringify(body) });
  function panel() {
    let el = $("#ac-notification-panel");
    if (!el) {
      el = document.createElement("section");
      el.id = "ac-notification-panel";
      el.hidden = true;
      el.className = "ac-notification-panel";
      el.setAttribute("aria-label", "Notificaciones de climatización");
      document.body.append(el);
    }
    return el;
  }
  function notificationCards(items) {
    return (
      items
        .map(
          (n) =>
            `<article class="ac-notice ${n.read ? "read" : ""}"><button type="button" data-ac-action="notice-open" data-id="${n.id}"><div><b>${esc(n.title)}</b><span>${esc(n.body)}</span><small>${esc(name(n.brand))} · ${fmt(n.createdAt)}</small></div>${n.read ? "" : '<span class="ac-unread-dot" aria-label="Sin leer"></span>'}</button>${n.read ? "" : button("Marcar leída", "notice-read", `data-id="${n.id}"`, "hc-source")}</article>`,
        )
        .join("") ||
      '<div class="hc-empty">No hay notificaciones para mostrar.</div>'
    );
  }
  function refreshPanel() {
    panel().innerHTML = `<div class="ac-notification-head"><div><b>Notificaciones</b><small>${noticeData.unread} sin leer</small></div>${button("×", "notice-close", 'aria-label="Cerrar notificaciones"')}</div><div class="ac-notification-tools">${button("Marcar todas leídas", "notice-read-all", "", noticeData.unread ? "" : "")}${button("Actualizar", "notice-refresh")}</div><div class="ac-notification-feed">${notificationCards(noticeData.items)}</div><div class="ac-notification-footer">${button("Ver centro de notificaciones", "notice-center")}</div>`;
  }
  async function refreshNotifications() {
    if (notifying || !info || document.hidden) return;
    notifying = true;
    try {
      if (external) {
        const latest = await api("/me");
        if (
          latest.user.brand !== info.user.brand ||
          latest.user.companyId !== info.user.companyId ||
          latest.user.scopeType !== info.user.scopeType
        ) {
          location.reload();
          return;
        }
      }
      noticeData = await api("/notifications?today=" + today());
      const b = $("#ac-bell-count");
      if (b) {
        b.textContent = noticeData.unread > 99 ? "99+" : noticeData.unread;
        b.hidden = !noticeData.unread;
      }
      $("#ac-bell")?.setAttribute(
        "aria-label",
        `Notificaciones, ${noticeData.unread} sin leer`,
      );
      $("#ac-bell")?.setAttribute("title", "Notificaciones de climatización");
      refreshPanel();
      if (currentView === "notifications") renderNotifications();
    } catch (e) {
      if (external && e.status === 403) {
        noticeData = { items: [], unread: 0, throughId: "0" };
        refreshPanel();
        $("#ac-bell-count").hidden = true;
        $("#hc-main").innerHTML = heading(
          "Acceso actualizado",
          "La cuenta cambió o está inactiva. Inicia sesión nuevamente.",
          button("Iniciar sesión", "logout", "", "primary"),
        );
      }
      $("#ac-bell")?.setAttribute(
        "title",
        "No se pudieron actualizar las notificaciones. Pulsa para reintentar.",
      );
    } finally {
      notifying = false;
    }
  }
  function renderNotifications() {
    $("#hc-main").innerHTML =
      heading(
        "Centro de notificaciones",
        "Nuevas órdenes, solicitudes y recordatorios. La lectura se guarda solo para tu usuario.",
        button("Marcar todas leídas", "notice-read-all") +
          button("Actualizar", "notice-refresh"),
      ) +
      `<section class="hc-panel ac-notification-center">${notificationCards(noticeData.items)}</section>`;
  }
  async function show(view, id) {
    if (!info) await ready;
    if (view === "library" && !info.permissions.viewLibrary) {
      toast(
        "La biblioteca técnica está disponible únicamente para el administrador.",
      );
      return;
    }
    currentView = view;
    if (external) window.ACPortal.selectNav(view);
    document
      .querySelectorAll("[data-ac-view]")
      .forEach((el) =>
        el.classList.toggle("selected", el.dataset.acView === view),
      );
    if (["home", "companies", "tools"].includes(view)) {
      await window.ACPortal[view](portalContext(view));
      return;
    }
    if (view === "fleet") {
      await window.ACFleet.show({
        api,
        info,
        library,
        external,
        visual: true,
        toast,
        navigate,
        newRequest,
        newIncident,
        active: () => currentView === "fleet",
        initialFilters: id && typeof id === "object" ? id : {},
      });
      if (typeof id === "string") await window.ACFleet.openDetail(id);
    } else if (view === "incidents") {
      await window.ACIncidents.show(portalContext("incidents"), id);
    } else if (view === "requests") {
      if (id?.pending) {
        filters = {
          kind: "",
          brand: "",
          status: "",
          pending: "true",
          deleted: "",
        };
        offset = 0;
      }
      await showRequests();
      if (typeof id === "string") await requestDetail(id);
    } else if (view === "parts") await showParts();
    else if (view === "reports")
      await window.ACReports.show({
        api,
        info,
        library,
        external,
        toast,
        active: () => currentView === "reports",
      });
    else if (view === "access") await showUsers();
    else if (view === "notifications") {
      await refreshNotifications();
      renderNotifications();
    } else if (view === "orders") await showOrders();
    else if (view === "order") await showOrder(id);
    else if (view === "upcoming") await showUpcoming(id);
    else if (view === "library") showLibrary();
  }
  async function showRequests() {
    const r = await api(
      "/requests?" + new URLSearchParams({ ...filters, offset }),
    );
    requests = r.items;
    if (external) {
      $("#hc-main").innerHTML =
        heading(
          "Seguimiento",
          `${name(info.user.brand)} · Consulta tus solicitudes y sus órdenes vinculadas.`,
          button("+ Solicitar atención", "portal-request", "", "primary"),
        ) +
        window.ACPortal.trackingTabs("requests") +
        `<details class="acp-filter-details" ${Object.values(filters).some(Boolean) ? "open" : ""}><summary>Filtrar solicitudes ${filters.pending === "true" ? "· Solo pendientes" : ""}</summary><form id="ac-request-filters" class="hc-filters">${select("Tipo", "kind", { service: "Servicio", part: "Refacción" }, filters.kind, "Todos")}${select("Estado", "status", info.stages, filters.status, "Todos")}${select("Mostrar", "pending", { true: "Solo pendientes" }, filters.pending, "Todas las solicitudes")}<button type="submit" class="hc-btn primary">Aplicar</button></form></details><section class="acp-follow-grid">${requests.map((x) => window.ACPortal.requestCard(x, info)).join("") || '<div class="hc-empty">No hay solicitudes para esta selección.</div>'}</section><div class="hc-pager"><span>${r.total} solicitudes</span><div class="hc-actions">${button("Anterior", "request-prev", offset === 0 ? "disabled" : "")}${button("Siguiente", "request-next", offset + 25 >= r.total ? "disabled" : "")}</div></div>`;
      return;
    }
    const deleted = filters.deleted === "true";
    $("#hc-main").innerHTML =
      heading(
        "Solicitudes AC",
        "Revisa cada solicitud, programa la atención y consulta su avance.",
        button("+ Solicitar servicio", "new-service", "", "primary") +
          button("+ Solicitar refacción", "new-part"),
      ) +
      `<div class="acp-tabs" aria-label="Bandejas de solicitudes">${button("Activas", "request-inbox", 'data-deleted="" aria-pressed="' + !deleted + '"', !deleted ? "primary" : "")}${button("Eliminadas", "request-inbox", 'data-deleted="true" aria-pressed="' + deleted + '"', deleted ? "primary" : "")}</div>
    ${deleted ? '<p class="hc-note">Solicitudes de servicio eliminadas. Puedes recuperarlas con su seguimiento y su orden vinculada.</p>' : ""}
    <details class="acp-filter-details" ${[filters.brand, filters.kind, filters.status, filters.pending].some(Boolean) ? "open" : ""}><summary>Buscar por marca, tipo o estado ${filters.pending === "true" ? "· Solo pendientes" : ""}</summary><form id="ac-request-filters" class="hc-filters"><input type="hidden" name="deleted" value="${deleted ? "true" : ""}">${select("Marca", "brand", info.brands, filters.brand, "Todas las marcas")}${select("Tipo", "kind", { service: "Servicio", part: "Refacción" }, filters.kind, "Todos")}${select("Estado", "status", info.stages, filters.status, "Todos")}${select("Mostrar", "pending", { true: "Solo pendientes" }, filters.pending, "Todas las solicitudes")}<button class="hc-btn primary" type="submit">Aplicar</button>${button("Actualizar", "refresh")}</form></details>
    <section class="acp-follow-grid">${requests.map((x) => window.ACPortal.requestCard(x, info)).join("") || '<div class="hc-empty">No hay solicitudes para esta selección.</div>'}</section>
    <div class="hc-pager"><span>${r.total} solicitudes</span><div class="hc-actions">${button("Anterior", "request-prev", offset === 0 ? "disabled" : "")}${button("Siguiente", "request-next", offset + 25 >= r.total ? "disabled" : "")}</div></div>`;
  }
  async function requestRemoval(id, restore) {
    currentRequest = await api("/requests/" + id);
    if (currentRequest.incident) return navigate("incidents", id);
    const x = currentRequest;
    dialog(
      `<div class="hc-kicker">SOLICITUD DE SERVICIO</div><h2>${restore ? "Recuperar" : "Eliminar"} ${esc(x.folio)}</h2><p><b>${esc(x.company)} · Unidad ${esc(x.unit)}</b></p><p>${restore ? "Volverá a las solicitudes activas con el estado y seguimiento que tenía." : "Se moverá a Eliminadas y dejará de aparecer en los pendientes. Podrás recuperarla después."}</p>${x.serviceId ? '<div class="hc-note">La orden vinculada conservará su estado, trabajos, fotografías y reporte técnico.</div>' : ""}<form id="ac-request-removal"><input type="hidden" name="restore" value="${restore}">${restore ? "" : field("Motivo de eliminación *", "reason", "", "textarea", 'required maxlength="1000" rows="3" placeholder="Por ejemplo: solicitud duplicada"')}<div class="hc-actions">${button("Cancelar", "dialog-close")}<button type="submit" class="hc-btn ${restore ? "primary" : "aca-danger"}">${restore ? "Recuperar solicitud" : "Eliminar solicitud"}</button></div></form>`,
    );
  }
  async function newRequest(kind, partId = "", seed = null) {
    requestPhotos = [];
    requestKey = crypto.randomUUID();
    const available = await api("/parts");
    parts = available;
    const chosen = parts.find((p) => p.id === partId);
    const b =
      external && info.user.brand
        ? info.user.brand
        : seed?.brand || chosen?.brands[0] || "";
    const units = await api("/units");
    const unitOptions = Object.fromEntries(
      units.map((u, i) => [
        String(i),
        `${u.company} · ${u.unit}${u.brand ? " · " + name(u.brand) : ""}`,
      ]),
    );
    window._acRequestUnits = units;
    dialog(
      `<div class="hc-kicker">NUEVA SOLICITUD</div><h2>${kind === "service" ? "Solicitar servicio AC" : "Solicitar refacción AC"}</h2><p>La solicitud será revisada por Carlab. ${kind === "part" ? "La existencia se confirma al entregar." : "Carlab programará el servicio y abrirá la orden."}</p><form id="ac-new-request"><input name="kind" type="hidden" value="${kind}"><div class="hc-grid">${external && info.user.brand ? `<div class="hc-field"><b>Marca de aire acondicionado</b><span class="hc-badge">${esc(name(b))}</span><input name="brand" type="hidden" value="${b}"></div>` : select("Marca *", "brand", info.brands, b, "Seleccionar marca")}${select("Unidad conocida (opcional)", "knownUnit", unitOptions, "", "Captura manual")}${field("Empresa operadora *", "company", "", "text", 'required maxlength="180"')}${field("Número económico *", "unit", "", "text", 'required maxlength="80"')}${kind === "part" ? select("Refacción de catálogo", "partId", Object.fromEntries(parts.filter((p) => !b || p.brands.includes(b)).map((p) => [p.id, p.name + (p.reference ? " · " + p.reference : "")])), partId, "Pieza fuera de catálogo") + `<div id="ac-custom-part" ${partId ? "hidden" : ""}>${field("Refacción solicitada *", "partName", "", "text")}${field("Número de parte / referencia", "reference")}</div>` + field("Cantidad *", "quantity", "1", "number", 'min="0.01" step="0.01" required') : ""}${field(kind === "service" ? "Falla o servicio solicitado *" : "Motivo de la solicitud *", "description", "", "textarea", 'required rows="3"')}${select("Prioridad", "priority", { normal: "Normal", alta: "Alta", urgente: "Urgente" }, "normal")}${field("Ubicación de atención", "location")}${field("Contacto / teléfono", "contact")}${field("Fecha preferida (opcional)", "preferredDate", "", "date")}</div><label class="hc-field"><b>Evidencia fotográfica (hasta 4)</b><input id="ac-request-photo" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div id="ac-request-photos" class="ac-photos"></div><div class="hc-actions">${button("Cancelar", "dialog-close")}<button type="submit" class="hc-btn primary">Enviar solicitud</button></div></form>`,
    );
    if (external) {
      const form = $("#ac-new-request");
      if (info.user.company) {
        form.elements.company.value = info.user.company;
        form.elements.company.readOnly = true;
      }
      const optional = document.createElement("details");
      optional.className = "acp-form-optional";
      optional.innerHTML =
        "<summary>Ubicación, contacto y fecha preferida (opcional)</summary><div class=hc-grid></div>";
      for (const key of ["location", "contact", "preferredDate"])
        optional.lastElementChild.append(form.elements[key].closest("label"));
      form.querySelector(".hc-grid").after(optional);
    }
    if (seed) {
      const form = $("#ac-new-request");
      for (const key of ["company", "unit"]) {
        form.elements[key].value = seed[key];
        form.elements[key].readOnly = true;
      }
      form.elements.knownUnit.disabled = true;
      if (form.elements.brand.tagName === "SELECT") {
        form.elements.brand.disabled = true;
        form.insertAdjacentHTML(
          "beforeend",
          `<input type="hidden" name="brand" value="${esc(seed.brand)}">`,
        );
      }
      form.elements.location.value = seed.base || "";
      if (seed.id)
        form.insertAdjacentHTML(
          "beforeend",
          `<input type="hidden" name="fleetUnitId" value="${esc(seed.id)}">`,
        );
      if (seed.preferredDate)
        form.elements.preferredDate.value = seed.preferredDate;
      if (seed.description) form.elements.description.value = seed.description;
    }
  }
  async function compress(file) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 20000000
    )
      throw new Error("Usa JPEG, PNG o WebP de hasta 20 MB.");
    const image = await createImageBitmap(file),
      scale = Math.min(1, 1200 / Math.max(image.width, image.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    let quality = 0.75,
      data = canvas.toDataURL("image/jpeg", quality);
    while (data.length > 1700000 && quality > 0.3) {
      quality -= 0.15;
      data = canvas.toDataURL("image/jpeg", quality);
    }
    if (data.length > 1800000)
      throw new Error(
        "La imagen es demasiado grande. Usa una de menor resolución.",
      );
    return data;
  }
  async function requestDetail(id) {
    currentRequest = await api("/requests/" + id);
    const x = currentRequest,
      available = x.deletedAt
        ? []
        : info.transitions?.[x.kind]?.[x.status] || [];
    if (info.permissions.manageInventory)
      parts = await api("/parts?brand=" + x.brand);
    dialog(`<div class="hc-kicker">${esc(name(x.brand))} / ${x.kind === "service" ? "SOLICITUD DE SERVICIO" : "SOLICITUD DE REFACCIÓN"}</div><h2>${esc(x.folio)}</h2>${x.deletedAt ? `<div class="acp-outcome"><b>Solicitud eliminada · ${fmt(x.deletedAt)}</b><p>${esc(x.deletionReason)}</p></div>` : ""}<div class="hc-chips"><span>${esc(info.stages[x.status])}</span><span>${esc(x.company)} · ${esc(x.unit)}</span></div><p class="ac-detail-description">${esc(x.data.description)}</p><div class="hc-grid ac-summary">${[
      [
        "Prioridad",
        { normal: "Normal", alta: "Alta", urgente: "Urgente" }[x.data.priority],
      ],
      ["Ubicación", x.data.location],
      ["Contacto", x.data.contact],
      [
        "Fecha preferida",
        x.data.preferredDate ? fmt(x.data.preferredDate) : "",
      ],
      [
        "Fecha programada",
        x.data.scheduledDate ? fmt(x.data.scheduledDate) : "",
      ],
      ["Refacción", x.data.partName],
      ["Referencia", x.data.reference],
      ["Cantidad", x.data.quantity],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`)
      .join(
        "",
      )}</div>${x.data.reply ? `<div class="hc-note"><b>Respuesta de Carlab</b><p>${esc(x.data.reply)}</p></div>` : ""}<div class="ac-photos">${x.data.evidence.map((p) => `<img src="${esc(p.data)}" alt="Evidencia de solicitud">`).join("")}</div>${x.serviceId ? button("Consultar orden vinculada", "linked-order", `data-id="${x.serviceId}"`) : ""}
 ${available.length ? `<details class="hc-extra-fields" open><summary>Seguimiento Carlab</summary><form id="ac-request-update" class="hc-extra-content"><div class="hc-grid">${select("Nuevo estado *", "status", Object.fromEntries(available.map((s) => [s, info.stages[s]])), "", "Seleccionar estado")}${field("Fecha programada (para programar)", "scheduledDate", x.data.scheduledDate || "", "date")}${x.kind === "part" ? select("Refacción a entregar", "partId", Object.fromEntries(parts.map((p) => [p.id, `${p.name} · disponible ${p.stock}`])), x.data.partId, "Seleccionar pieza de inventario") : ""}${field("Respuesta / motivo / seguimiento", "notes", "", "textarea")}</div><button class="hc-btn primary" type="submit">Guardar seguimiento</button></form></details>` : ""}
 ${info.permissions.manageOrders && !x.deletedAt && x.kind === "service" && !x.serviceId && !["rechazada", "cancelada", "orden_creada"].includes(x.status) ? `<details class="hc-extra-fields"><summary>Crear orden desde esta solicitud</summary><form id="ac-convert-request" class="hc-extra-content"><div class="hc-grid">${select("Servicio *", "type", info.serviceTypes, "", "Seleccionar servicio")}${select("Atención", "attention", { normal: "Normal", express: "Express" }, x.data.priority === "urgente" ? "express" : "normal")}${field("Fecha del servicio", "serviceDate", today(), "date", "required")}</div><p class="hc-subtle">Se abrirá una orden en borrador con la unidad, el motivo y las fotografías de la solicitud.</p><button class="hc-btn primary" type="submit">Crear orden</button></form></details>` : ""}
 <details class="hc-extra-fields"><summary>Bitácora de seguimiento</summary><div class="hc-timeline">${x.events.map((e) => `<div class="hc-event"><b>${esc(e.actor_name)}</b> · ${fmt(e.created_at)}<small>${esc(info.stages[e.details.status] || { eliminacion: "Solicitud eliminada", restauracion: "Solicitud recuperada" }[e.action] || e.action)}${e.details.notes ? " · " + esc(e.details.notes) : ""}${e.details.folio ? " · " + esc(e.details.folio) : ""}</small></div>`).join("")}</div></details><div class="hc-actions">${button("Cerrar", "dialog-close")}${info.permissions.manageOrders && x.kind === "service" ? button(x.deletedAt ? "Recuperar solicitud" : "Eliminar solicitud", x.deletedAt ? "request-restore" : "request-delete", `data-id="${esc(x.id)}"`, x.deletedAt ? "" : "aca-danger") : ""}</div>`);
  }
  async function showParts() {
    parts = await api("/parts");
    $("#hc-main").innerHTML =
      heading(
        "Refacciones AC",
        external
          ? "Consulta piezas de tu marca y solicita su suministro."
          : "Almacén exclusivo de aire acondicionado. Las existencias y movimientos son independientes del almacén general.",
        info.permissions.manageInventory
          ? button("+ Nueva refacción", "new-inventory", "", "primary")
          : button("+ Solicitar refacción", "new-part", "", "primary"),
      ) +
      `<form id="ac-parts-filter" class="hc-filters">${external ? "" : select("Marca", "brand", info.brands, "", "Todas las marcas")}${select("Origen", "family", { efficient: "Catálogo Efficient", recambios: "Recambios Hispacold 2025", cotizaciones: "Referencias de cotizaciones 2026", custom: "Otras piezas AC" }, "", "Todo el catálogo")}${field("Buscar pieza o referencia", "q", "", "search")}<button class="hc-btn" type="submit">Buscar</button>${button("Actualizar", "refresh")}</form><div id="ac-parts-list" class="ac-parts-grid">${partCards(parts)}</div>`;
    if (external)
      $("#ac-parts-filter").insertAdjacentHTML(
        "beforebegin",
        window.ACPortal.trackingTabs("parts"),
      );
  }
  function partCards(rows) {
    return (
      rows
        .map(
          (p) =>
            `<article class="hc-panel ac-part-card">${p.image ? `<img class="ac-part-image" src="${esc(p.image)}" alt="${esc(p.name)}">` : ""}<div class="hc-kicker">${p.brands.map(name).map(esc).join(" · ")}</div><h2>${esc(p.name)}</h2>${p.official ? '<span class="acp-official-badge">Referencia documental Hispacold</span>' : ""}<p>${esc(p.reference || "Sin referencia registrada")}</p>${p.official?.notes ? `<p class="hc-subtle">${esc(p.official.notes)}</p>` : ""}${p.models ? `<p class="hc-subtle">Aplicación / equipo: ${esc(p.models)}</p>` : ""}${info.permissions.manageInventory ? `<div class="ac-stock-row"><b>${p.stock} disponibles</b><span class="hc-badge ${p.minimum > 0 && p.stock <= p.minimum ? "cancelado" : ""}">${p.minimum > 0 ? "Mínimo " + p.minimum : "Sin mínimo configurado"}</span></div><p class="hc-subtle">${esc(p.location || "Ubicación por registrar")}</p><div class="hc-actions">${button("Editar ficha", "edit-part", `data-id="${p.id}"`)}${button("Entrada / devolución", "movement", `data-id="${p.id}"`)}${button("Movimientos", "movements", `data-id="${p.id}"`)}${p.official ? button("Documentos de referencia", "official-sources", `data-id="${p.id}"`) : ""}</div>` : `<span class="hc-badge">${p.available ? "Disponible para solicitud" : "Consultar suministro"}</span>`}<div class="hc-actions">${button("Solicitar pieza", "request-part", `data-id="${p.id}"`)}</div></article>`,
        )
        .join("") ||
      '<div class="hc-empty">No hay piezas catalogadas con este filtro.</div>'
    );
  }
  function brandChecks(selected = []) {
    return `<fieldset class="ac-brand-checks"><legend>Marcas compatibles *</legend>${Object.entries(
      info.brands,
    )
      .map(
        ([b, label]) =>
          `<label><input type="checkbox" name="brands" value="${b}" ${selected.includes(b) ? "checked" : ""}>${esc(label)}</label>`,
      )
      .join("")}</fieldset>`;
  }
  async function partForm(p = null) {
    currentPart = p;
    dialog(
      `<h2>${p ? "Ficha de refacción" : "Nueva refacción AC"}</h2><p>${p ? "Compatibilidad y datos del inventario." : "Se creará en el almacén AC con existencia cero. Registra después la entrada recibida."}</p><form id="ac-part-form"><div class="hc-grid">${field("Nombre *", "name", p?.name || "", "text", 'required maxlength="300"')}${field("Referencia / número de parte", "reference", p?.reference || "")}${field("Modelos / equipos compatibles", "models", p?.models || "")}${field("Ubicación", "location", p?.location || "")}${field("Proveedor", "supplier", p?.supplier || "")}${field("Existencia mínima", "minimum", p?.minimum || 0, "number", 'min="0" step="0.01"')}${field("Costo unitario MXN", "cost", p?.cost || 0, "number", 'min="0" step="0.01"')}${field("Precio de referencia MXN", "price", p?.price || 0, "number", 'min="0" step="0.01"')}${field("Notas", "notes", p?.notes || "", "textarea")}</div>${brandChecks(p?.brands || [])}<label class="hc-field"><b>Fotografía de la pieza</b><input id="ac-part-image" type="file" accept="image/jpeg,image/png,image/webp"></label><input name="image" type="hidden" value="${esc(p?.image || "")}"><div id="ac-part-preview">${p?.image ? `<img src="${esc(p.image)}" class="ac-part-image" alt="Pieza">` : ""}</div><div class="hc-actions">${button("Cancelar", "dialog-close")}<button class="hc-btn primary" type="submit">Guardar ficha</button></div></form>`,
    );
  }
  function movementForm(p) {
    currentPart = p;
    movementKey = crypto.randomUUID();
    dialog(
      `<h2>Movimiento de refacción</h2><p>${esc(p.name)} · ${p.stock} disponibles</p><form id="ac-movement-form"><div class="hc-grid">${select("Movimiento", "kind", { entrada: "Entrada recibida", devolucion: "Devolución al almacén" }, "entrada")}${field("Cantidad *", "quantity", "1", "number", 'min="0.01" step="0.01" required')}${field("Documento / motivo *", "notes", "", "textarea", "required")}</div><p class="hc-subtle">Las salidas se registran al entregar una solicitud aprobada.</p><div class="hc-actions">${button("Cancelar", "dialog-close")}<button class="hc-btn primary" type="submit">Registrar movimiento</button></div></form>`,
    );
  }
  async function showUsers() {
    users = await api("/users");
    const cards = (kind) =>
      users
        .filter((u) => (u.scopeType || "brand") === kind)
        .map(
          (u) =>
            `<article class="hc-order-card"><h3>${esc(u.nombre)}</h3><p>${esc(u.email)}</p><div class="hc-chips"><span>${esc(u.company || u.empresa)}</span><span>${u.activo ? "Activo" : "Inactivo"}</span></div>${button("Editar acceso", "edit-user", `data-id="${u.id}"`)}</article>`,
        )
        .join("") ||
      '<div class="hc-empty">No hay usuarios de este tipo.</div>';
    $("#hc-main").innerHTML =
      heading(
        "Accesos Supervisor AC",
        "Dos tipos de acceso, separados por marca o por empresa.",
      ) +
      `<section class="hc-panel"><div class="hc-heading"><div><h2>Supervisores de flota AC</h2><p>Una empresa asignada y sus unidades Hispacold y Eberspächer.</p></div>${button("+ Supervisor de flota AC", "new-fleet-user", "", "primary")}</div><div class="hc-order-cards">${cards("fleet")}</div></section><section class="hc-panel"><div class="hc-heading"><div><h2>Supervisores de marca AC</h2><p>Las empresas con unidades de su marca asignada.</p></div>${button("+ Supervisor de marca AC", "new-user")}</div><div class="hc-order-cards">${cards("brand")}</div></section>`;
  }
  async function userForm(u = null) {
    const fleetOptions = await api("/fleet/options");
    currentUser = u;
    const b = u
      ? Object.keys(info.brands).find((b) => info.brands[b] === u.empresa)
      : "";
    dialog(
      `<h2>${u ? "Editar acceso" : "Crear Supervisor AC"}</h2><p>Elige el alcance: una marca en sus empresas o una empresa con sus unidades de AC. Puede consultar y solicitar; Carlab administra las órdenes y el inventario.</p><form id="ac-user-form"><div class="hc-grid">${field("Nombre *", "nombre", u?.nombre || "", "text", "required")}${field("Correo *", "email", u?.email || "", "email", "required")}${select("Tipo de supervisor *", "scopeType", { brand: "Supervisor de marca AC", fleet: "Supervisor de flota AC" }, u?.scopeType || "brand")}${select("Marca asignada *", "brand", info.brands, b, "Seleccionar marca")}${select("Empresa de la flota *", "companyId", Object.fromEntries(fleetOptions.companies.map((c) => [c.id, c.name])), u?.companyId || "", "Seleccionar empresa")}${field(u ? "Contraseña nueva (opcional)" : "Contraseña *", "password", "", "password", `${u ? "" : "required"} minlength="8" maxlength="128" autocomplete="new-password"`)}${field("Teléfono", "telefono", u?.telefono || "")}${select("Acceso", "activo", { true: "Activo", false: "Inactivo" }, u?.activo === false ? "false" : "true")}</div><div class="hc-actions">${button("Cancelar", "dialog-close")}<button class="hc-btn primary" type="submit">Guardar usuario</button></div></form>`,
    );
  }
  function userScopeFields() {
    const form = $("#ac-user-form");
    if (!form) return;
    const fleet = form.elements.scopeType.value === "fleet";
    for (const key of ["brand", "companyId"]) {
      const el = form.elements[key],
        visible = key === "companyId" ? fleet : !fleet;
      el.closest("label").hidden = !visible;
      el.closest("label").style.display = visible ? "" : "none";
      el.disabled = !visible;
      el.required = visible;
    }
  }
  async function showOrders() {
    const r = await api("/orders?offset=" + offset);
    $("#hc-main").innerHTML =
      heading(
        "Órdenes de servicio",
        `${name(info.user.brand)} · Consulta de avances y reportes.`,
      ) +
      (external ? window.ACPortal.trackingTabs("orders") : "") +
      `<div class="hc-order-cards">${r.items.map((o) => `<article class="hc-order-card"><div class="hc-order-top"><b>${esc(o.folio)}</b><span class="hc-badge ${esc(o.status)}">${esc(library.statuses[o.status])}</span></div><h3>${esc(o.company)} · ${esc(o.unit)}</h3><b>${esc(library.types[o.type])}</b><p>${esc(o.symptoms)}</p><small>${fmt(o.serviceDate)} · ${esc(o.technician || "Responsable por asignar")}</small>${button("Consultar orden", "order-detail", `data-id="${o.id}"`)}</article>`).join("") || '<div class="hc-empty">No hay órdenes de tu marca para mostrar.</div>'}</div><div class="hc-pager"><span>${r.total} órdenes</span><div>${button("Anterior", "order-prev", offset === 0 ? "disabled" : "")}${button("Siguiente", "order-next", offset + 25 >= r.total ? "disabled" : "")}</div></div>`;
  }
  let viewedOrder = null;
  async function showOrder(id) {
    viewedOrder = await api("/orders/" + id);
    const r = viewedOrder,
      d = r.data;
    $("#hc-main").innerHTML =
      heading(
        r.folio,
        `${d.company} · Unidad ${d.unit} · ${name(d.brand || "hispacold")}`,
        button("← Órdenes", "orders") +
          button("Descargar PDF", "order-pdf", "", "primary"),
      ) +
      `<article class="hc-report"><div class="hc-print-header"><div><div class="hc-kicker">REPORTE TÉCNICO DE CLIMATIZACIÓN</div><h1>${esc(library.types[d.type])}</h1><p>${fmt(d.serviceDate)} · ${d.attention === "express" || d.type === "express" ? "Express" : "Normal"}</p></div><span class="hc-badge ${d.status}">${esc(library.statuses[d.status])}</span></div><div class="hc-grid ac-summary">${[
        ["Empresa", d.company],
        ["Unidad", d.unit],
        ["Técnico", d.technician],
        ["Equipo", d.equipment],
        ["Control", d.control],
        [
          "Resultado",
          {
            operativo: "Operativo",
            con_observaciones: "Con observaciones",
            no_operativo: "No operativo",
          }[d.result],
        ],
        ["Próximo servicio", d.nextDate ? fmt(d.nextDate) : ""],
      ]
        .filter(([, v]) => v)
        .map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`)
        .join("")}</div>${[
        ["Recepción y motivo del servicio", d.symptoms],
        ["Diagnóstico técnico", d.diagnosis],
        ["Intervención realizada", d.workDone],
        ["Verificación funcional y entrega", d.finalTest],
        ["Recomendaciones y pendientes", d.recommendations],
      ]
        .filter(([, v]) => v)
        .map(([k, v]) => `<h2>${k}</h2><p>${esc(v)}</p>`)
        .join(
          "",
        )}${d.parts.length ? `<h2>Refacciones y materiales</h2><div class="hc-table-wrap"><table><thead><tr><th>Concepto</th><th>Referencia</th><th>Cantidad</th></tr></thead><tbody>${d.parts.map((p) => `<tr><td>${esc(p.description)}</td><td>${esc(p.reference)}</td><td>${esc(p.quantity)}</td></tr>`).join("")}</tbody></table></div>` : ""}${d.evidence.length ? `<h2>Evidencia fotográfica</h2><div class="hc-report-photos">${d.evidence.map((p) => `<figure><img src="${esc(p.data)}" alt="Evidencia"><figcaption>${esc(p.caption || p.name)}</figcaption></figure>`).join("")}</div>` : ""}</article>`;
  }
  async function showUpcoming(initialFilters) {
    await window.ACCalendar.show({
      api,
      info,
      external,
      toast,
      navigate,
      newRequest,
      active: () => currentView === "upcoming",
      initialFilters:
        typeof initialFilters === "object" ? initialFilters : null,
    });
  }
  function showLibrary() {
    $("#hc-main").innerHTML =
      heading(
        "Biblioteca técnica",
        `${name(info.user.brand)} · Documentos e indicadores del equipo.`,
      ) +
      `<div class="hc-library">${library.manuals.map((m) => `<article class="hc-manual"><div class="hc-kicker">${esc(m.category)}</div><h2>${esc(m.title)}</h2><p>${m.pages} páginas</p>${m.available ? button("Consultar manual", "manual", `data-id="${m.id}"`) : '<span class="hc-badge">Pendiente de importación por Carlab</span>'}</article>`).join("")}</div>`;
  }
  async function submit(form) {
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form));
    busy = true;
    form.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      if (form.id === "ac-new-request") {
        body.clientKey = requestKey;
        body.evidence = requestPhotos;
        const r = await api("/requests", post(body));
        $("#ac-dialog").close();
        await navigate("requests");
        toast(
          r.replayed
            ? "Solicitud ya registrada: " + r.folio
            : "Solicitud enviada: " + r.folio,
        );
      }
      if (form.id === "ac-request-removal") {
        const restore = body.restore === "true";
        await api(
          "/requests/" + currentRequest.id + (restore ? "/restore" : ""),
          {
            method: restore ? "POST" : "DELETE",
            body: JSON.stringify({
              version: currentRequest.version,
              reason: body.reason,
            }),
          },
        );
        $("#ac-dialog").close();
        await showRequests();
        toast(
          restore
            ? "Solicitud recuperada."
            : "Solicitud eliminada. Puedes recuperarla en Eliminadas.",
        );
      }
      if (form.id === "ac-request-update") {
        body.version = currentRequest.version;
        const r = await api("/requests/" + currentRequest.id, patch(body));
        await showRequests();
        await requestDetail(r.id);
        toast("Seguimiento actualizado.");
      }
      if (form.id === "ac-convert-request") {
        body.version = currentRequest.version;
        const r = await api(
          "/requests/" + currentRequest.id + "/create-order",
          post(body),
        );
        $("#ac-dialog").close();
        await window.CarlabACNav.open(r.id);
        toast("Orden " + r.folio + " creada desde la solicitud.");
      }
      if (form.id === "ac-part-form") {
        body.brands = new FormData(form).getAll("brands");
        await api(
          "/parts" + (currentPart ? "/" + currentPart.id : ""),
          currentPart ? patch(body) : post(body),
        );
        $("#ac-dialog").close();
        await showParts();
        toast("Ficha de refacción guardada.");
      }
      if (form.id === "ac-movement-form") {
        body.clientKey = movementKey;
        await api("/parts/" + currentPart.id + "/movements", post(body));
        $("#ac-dialog").close();
        await showParts();
        toast("Movimiento registrado en el almacén AC.");
      }
      if (form.id === "ac-user-form") {
        body.activo = body.activo === "true";
        await api(
          "/users" + (currentUser ? "/" + currentUser.id : ""),
          currentUser ? patch(body) : post(body),
        );
        $("#ac-dialog").close();
        await showUsers();
        toast("Acceso Supervisor AC guardado.");
      }
      await refreshNotifications();
    } finally {
      busy = false;
      form.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }
  document.addEventListener("submit", async (e) => {
    if (!e.target.id.startsWith("ac-")) return;
    e.preventDefault();
    try {
      if (e.target.id === "ac-request-filters") {
        filters = Object.fromEntries(new FormData(e.target));
        offset = 0;
        await showRequests();
      } else if (e.target.id === "ac-parts-filter") {
        const list = $("#ac-parts-list");
        list.inert = true;
        list.setAttribute("aria-busy", "true");
        try {
          const r = await api(
            "/parts?" +
              new URLSearchParams(Object.fromEntries(new FormData(e.target))),
          );
          if (list.isConnected) {
            parts = r;
            list.innerHTML = partCards(r);
          }
        } finally {
          list.inert = false;
          list.removeAttribute("aria-busy");
        }
      } else await submit(e.target);
    } catch (err) {
      error(err);
    }
  });
  document.addEventListener("change", async (e) => {
    try {
      if (e.target.closest("#ac-user-form") && e.target.name === "scopeType")
        userScopeFields();
      if (e.target.id === "ac-request-photo") {
        if (requestPhotos.length + e.target.files.length > 4)
          throw new Error("Puedes adjuntar hasta cuatro fotos.");
        busy = true;
        try {
          for (const file of e.target.files)
            requestPhotos.push({ data: await compress(file), caption: "" });
          $("#ac-request-photos").innerHTML = requestPhotos
            .map(
              (p, i) =>
                `<figure><img src="${esc(p.data)}" alt="Evidencia ${i + 1}">${button("Quitar", "request-photo-remove", `data-index="${i}"`)}</figure>`,
            )
            .join("");
        } finally {
          busy = false;
          e.target.value = "";
        }
      }
      if (e.target.id === "ac-part-image") {
        busy = true;
        try {
          const file = e.target.files[0];
          if (file) {
            const data = await compress(file);
            $("#ac-part-form [name=image]").value = data;
            $("#ac-part-preview").innerHTML =
              `<img src="${esc(data)}" class="ac-part-image" alt="Pieza">`;
          }
        } finally {
          busy = false;
        }
      }
      if (
        e.target.closest("#ac-new-request") &&
        e.target.name === "knownUnit"
      ) {
        const u = window._acRequestUnits[Number(e.target.value)];
        if (e.target.value !== "" && u) {
          $("#ac-new-request [name=company]").value = u.company;
          $("#ac-new-request [name=unit]").value = u.unit;
          const brandField = $("#ac-new-request [name=brand]");
          if (u.brand && brandField.tagName === "SELECT") {
            brandField.value = u.brand;
            brandField.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }
      if (e.target.closest("#ac-new-request") && e.target.name === "partId")
        $("#ac-custom-part").hidden = !!e.target.value;
      if (e.target.closest("#ac-new-request") && e.target.name === "brand") {
        const select = $("#ac-new-request [name=partId]");
        if (select) {
          select.innerHTML = options(
            Object.fromEntries(
              parts
                .filter((p) => p.brands.includes(e.target.value))
                .map((p) => [p.id, p.name]),
            ),
            "",
            "Pieza fuera de catálogo",
          );
          $("#ac-custom-part").hidden = false;
        }
      }
    } catch (err) {
      error(err);
    }
  });
  document.addEventListener("click", async (e) => {
    const nav = e.target.closest("[data-ac-view]");
    if (nav) {
      offset = 0;
      await navigate(nav.dataset.acView);
      return;
    }
    const b = e.target.closest("[data-ac-action]");
    if (!b || busy) return;
    const a = b.dataset.acAction;
    try {
      if (a === "dialog-close") closeDialog();
      if (a === "refresh") await show(currentView);
      if (a === "portal-request")
        window.ACPortal.requestChooser(portalContext(currentView));
      if (a === "new-incident") await newIncident();
      if (a === "new-service") await newRequest("service");
      if (a === "new-part") await newRequest("part");
      if (a === "request-part") await newRequest("part", b.dataset.id);
      if (a === "request-detail") await requestDetail(b.dataset.id);
      if (a === "request-delete" || a === "request-restore")
        await requestRemoval(b.dataset.id, a === "request-restore");
      if (a === "request-inbox") {
        filters = {
          kind: "",
          brand: "",
          status: "",
          pending: "",
          deleted: b.dataset.deleted,
        };
        offset = 0;
        await showRequests();
      }
      if (a === "request-prev") {
        offset -= 25;
        await showRequests();
      }
      if (a === "request-next") {
        offset += 25;
        await showRequests();
      }
      if (a === "request-photo-remove") {
        requestPhotos.splice(Number(b.dataset.index), 1);
        $("#ac-request-photos").innerHTML = requestPhotos
          .map(
            (p, i) =>
              `<figure><img src="${esc(p.data)}" alt="Evidencia">${button("Quitar", "request-photo-remove", `data-index="${i}"`)}</figure>`,
          )
          .join("");
      }
      if (a === "official-sources") {
        const p = parts.find((p) => p.id === b.dataset.id);
        dialog(
          `<h2>${esc(p.name)}</h2><p>${esc(p.reference)} · Verifica la aplicación en el documento.</p>${p.official.sources.map((s) => `<article class="hc-panel"><b>${esc(s.title)}</b><p>Página ${s.page} · ${esc(s.description)}</p>${button("Abrir documento", "official-document", `data-doc="${esc(s.documentId)}" data-page="${s.page}"`)}</article>`).join("")}${button("Cerrar", "dialog-close")}`,
        );
      }
      if (a === "official-document")
        await window.ACPartsPicker.documentSource(
          b.dataset.doc,
          b.dataset.page,
        );
      if (a === "new-inventory") await partForm();
      if (a === "edit-part")
        await partForm(parts.find((p) => p.id === b.dataset.id));
      if (a === "movement")
        movementForm(parts.find((p) => p.id === b.dataset.id));
      if (a === "movements") {
        const rows = await api("/parts/" + b.dataset.id + "/movements");
        dialog(
          `<h2>Movimientos de inventario</h2><div class="hc-table-wrap"><table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Cantidad</th><th>Orden / solicitud</th><th>Registrado por</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${fmt(r.created_at)}</td><td>${esc(r.tipo)}<small>${esc(r.notas)}</small></td><td>${esc(r.cantidad)}</td><td>${esc(r.garantia_folio)}</td><td>${esc(r.actor)}</td></tr>`).join("")}</tbody></table></div>${button("Cerrar", "dialog-close")}`,
        );
      }
      if (a === "new-fleet-user") {
        await userForm();
        $("#ac-user-form [name=scopeType]").value = "fleet";
        userScopeFields();
      }
      if (a === "new-user") {
        await userForm();
        userScopeFields();
      }
      if (a === "edit-user") {
        await userForm(users.find((u) => u.id === b.dataset.id));
        userScopeFields();
      }
      if (a === "orders") await navigate("orders");
      if (a === "order-detail") await navigate("order", b.dataset.id);
      if (a === "order-prev") {
        offset -= 25;
        await showOrders();
      }
      if (a === "order-next") {
        offset += 25;
        await showOrders();
      }
      if (a === "linked-order") {
        closeDialog();
        if (external) await navigate("order", b.dataset.id);
        else await window.CarlabACNav.open(b.dataset.id);
      }
      if (a === "order-pdf") {
        b.disabled = true;
        try {
          await window.HispacoldPDF.export(viewedOrder, library);
        } finally {
          b.disabled = false;
        }
      }
      if (a === "manual") {
        if (!info.permissions.viewLibrary)
          throw new Error(
            "La biblioteca técnica está disponible únicamente para el administrador.",
          );
        const tab = window.open("about:blank", "_blank");
        if (!tab)
          throw new Error("Permite abrir pestañas para consultar manuales.");
        try {
          const blob = await api("/manuals/" + b.dataset.id, { blob: true });
          const url = URL.createObjectURL(blob);
          tab.location.href = url;
          setTimeout(() => URL.revokeObjectURL(url), 120000);
        } catch (e) {
          tab.close();
          throw e;
        }
      }
      if (a === "bell") {
        panel().hidden = !panel().hidden;
        $("#ac-bell").setAttribute("aria-expanded", String(!panel().hidden));
        if (!panel().hidden) await refreshNotifications();
      }
      if (a === "notice-close") {
        panel().hidden = true;
        $("#ac-bell").setAttribute("aria-expanded", "false");
      }
      if (a === "notice-refresh") await refreshNotifications();
      if (a === "notice-center") await navigate("notifications");
      if (a === "notice-read") {
        await api("/notifications/read", post({ ids: [b.dataset.id] }));
        await refreshNotifications();
      }
      if (a === "notice-read-all") {
        await api(
          "/notifications/read",
          post({ throughId: noticeData.throughId }),
        );
        await refreshNotifications();
      }
      if (a === "notice-open") {
        const n = noticeData.items.find((n) => n.id === b.dataset.id);
        await api("/notifications/read", post({ ids: [n.id] }));
        await refreshNotifications();
        if (n.targetType === "order") {
          panel().hidden = true;
          if (external) await navigate("order", n.targetId);
          else await window.CarlabACNav.open(n.targetId);
        } else if (n.targetType === "fleet")
          await navigate("fleet", n.targetId);
        else await navigate("requests", n.targetId);
      }
      if (a === "logout") {
        localStorage.removeItem("carlabToken");
        location.href = "/";
      }
    } catch (err) {
      error(err);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#ac-notification-panel"))
      $("#ac-notification-panel").hidden = true;
  });
  document.addEventListener("click", (e) => {
    if (
      $("#ac-notification-panel") &&
      !e.target.closest("#ac-notification-panel,#ac-bell")
    )
      $("#ac-notification-panel").hidden = true;
  });
  const ready = (async () => {
    try {
      sessionToken = localStorage.getItem("carlabToken") || "";
      info = await api("/me");
      library = await api("/catalog");
      if (external && info.user.role !== "supervisor_ac") {
        location.replace("/hispacold.html");
        return;
      }
      const top = $(".hc-topbar");
      top.insertAdjacentHTML(
        "beforeend",
        `<button id="ac-bell" type="button" class="ac-bell" data-ac-action="bell" aria-label="Notificaciones" aria-expanded="false" aria-controls="ac-notification-panel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span id="ac-bell-count" hidden></span></button>`,
      );
      panel();
      if (external) {
        window.ACPortal.setupNav();
        $("#hc-user").textContent =
          info.user.nombre +
          (info.user.scopeType === "fleet"
            ? " · Supervisor de flota AC"
            : " · Supervisor de marca AC");
        $(".hc-space-label").textContent =
          name(info.user.brand).toUpperCase() + " / PORTAL EXTERNO";
        $(".hc-topbar>span:first-child").textContent =
          name(info.user.brand) + " / AC";
        const unitId = new URLSearchParams(location.search).get("unit");
        await show(unitId ? "fleet" : "home", unitId);
      }
      await refreshNotifications();
      refreshTimer = setInterval(() => refreshNotifications(), 30000);
    } catch (e) {
      if (external)
        $("#hc-main").innerHTML = heading(
          "Acceso Supervisor AC",
          e.message,
          '<a class="hc-btn primary" href="/">Iniciar sesión</a>',
        );
    }
  })();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshNotifications();
  });
  window.addEventListener("pagehide", () => clearInterval(refreshTimer));
  window.ACOperations = {
    show,
    refreshNotifications,
    ready,
    deactivate: () => {
      currentView = "";
    },
  };
})();
