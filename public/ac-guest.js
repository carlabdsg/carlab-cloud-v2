"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const fromReport = params.has("reportqr");
  const code = params.get(fromReport ? "reportqr" : "code") || "";
  const state = {
    unit: null,
    token: "",
    photos: [],
    busy: false,
    processing: false,
    pending: null,
    sent: false,
  };
  const receiptKey =
    (fromReport ? "carlab-general-ac-receipt:" : "carlab-ac-guest-receipt:") +
    code;
  const storage = {
    get() {
      try {
        return JSON.parse(sessionStorage.getItem(receiptKey));
      } catch {
        return null;
      }
    },
    set(data) {
      try {
        sessionStorage.setItem(receiptKey, JSON.stringify(data));
      } catch {}
    },
    clear() {
      try {
        sessionStorage.removeItem(receiptKey);
      } catch {}
    },
  };
  $("accountLink").href = /^[a-f0-9]{48}$/.test(code)
    ? (fromReport ? "/?reportqr=" : "/?acqr=") + code + "&access=account"
    : "/";
  if (fromReport && /^[a-f0-9]{48}$/.test(code)) {
    $("chooseReport").href = "/reportar.html?code=" + code;
    $("chooseReport").hidden = false;
  }
  async function request(method, body) {
    let response;
    try {
      response = await fetch(
        "/api/public/ac-report-qr/" +
          (fromReport ? "from-report/" : "") +
          encodeURIComponent(code),
        {
          method,
          cache: "no-store",
          credentials: "omit",
          ...(body
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        },
      );
    } catch {
      throw Object.assign(
        Error(
          method === "POST"
            ? "No se pudo confirmar el envío por la conexión. Conserva esta página y pulsa Verificar envío."
            : "No se pudo consultar la unidad. Revisa tu conexión e intenta nuevamente.",
        ),
        { uncertain: method === "POST" },
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw Object.assign(
        Error(
          "No se pudo confirmar la respuesta del servidor. Intenta nuevamente.",
        ),
        { uncertain: method === "POST" },
      );
    }
    if (!response.ok && fromReport && data.code === "REPORT_QR_GENERAL_ONLY")
      location.replace("/reporte-qr.html?code=" + code);
    if (!response.ok)
      throw Object.assign(
        Error(data.error || "No se pudo completar la operación."),
        { uncertain: method === "POST" && response.status >= 500 },
      );
    return data;
  }
  function availability() {
    $("reportFields").disabled = state.busy || Boolean(state.pending);
    $("sendReport").disabled = state.busy || state.processing;
    $("takePhoto").disabled = state.busy || state.processing;
    $("choosePhotos").disabled = state.busy || state.processing;
    $("sendReport").textContent = state.busy
      ? "Enviando…"
      : state.pending
        ? "Verificar envío"
        : "Enviar reporte";
  }
  function showReceipt(data) {
    state.sent = true;
    state.pending = null;
    $("guestForm").hidden = true;
    $("pendingLinkNote").hidden = true;
    $("receiptFolio").textContent = data.folio;
    $("receiptUnit").textContent =
      `${data.unit.empresa} · Unidad ${data.unit.numeroEconomico} · ${data.unit.marca}`;
    $("receiptState").textContent = data.pendingLink
      ? "Pendiente de vincular a AC"
      : "Pendiente de revisión";
    $("receiptNote").textContent = data.pendingLink
      ? "Tu falla quedó registrada. Administración completará la marca y la ficha de AC; no necesitas enviarla otra vez."
      : "No necesitas volver a enviarlo. El equipo de CARLAB ya puede consultarlo.";
    $("receipt").hidden = false;
    $("receipt").focus();
    storage.set(data);
  }
  async function load() {
    $("retryLoad").hidden = true;
    $("loadMessage").textContent = "Consultando la unidad de tu etiqueta…";
    if (!/^[a-f0-9]{48}$/.test(code)) {
      $("loadMessage").textContent =
        "Escanea una etiqueta de aire acondicionado CARLAB para abrir la unidad correcta.";
      return;
    }
    try {
      const data = await request("GET");
      if (!fromReport && data.reportOptions?.general === true) {
        $("accountLink").href =
          "/?acqr=" + code + "&reportqr=" + code + "&access=account";
        if (params.get("type") !== "ac") {
          location.replace("/reportar.html?code=" + code);
          return;
        }
        $("chooseReport").href = "/reportar.html?code=" + code;
        $("chooseReport").hidden = false;
      }
      $("pendingLinkNote").hidden = !data.pendingLink;
      state.unit = data.unit;
      state.token = data.formToken;
      $("unitCompany").textContent = data.unit.empresa;
      $("unitNumber").textContent = "Unidad " + data.unit.numeroEconomico;
      $("unitModel").textContent = [data.unit.marca, data.unit.modelo]
        .filter(Boolean)
        .join(" · ");
      $("unitCard").hidden = false;
      $("loadMessage").textContent = "";
      const saved = storage.get();
      if (
        saved?.folio &&
        saved?.unit?.empresa === data.unit.empresa &&
        (fromReport || saved?.unit?.brand === data.unit.brand) &&
        saved?.unit?.numeroEconomico === data.unit.numeroEconomico
      )
        showReceipt(saved);
      else $("guestForm").hidden = false;
    } catch (error) {
      $("loadMessage").textContent = error.message;
      $("retryLoad").hidden = false;
    }
  }
  async function compress(file) {
    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024)
      throw Error(
        "Selecciona fotografías de hasta 20 MB. Se reducirán antes de enviarlas.",
      );
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () =>
          reject(
            Error(
              "No se pudo leer una foto. Prueba con otra imagen o tómala desde la cámara.",
            ),
          );
        img.src = url;
      });
      const scale = Math.min(
        1,
        1600 / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.68, 0.5]) {
        const data = canvas.toDataURL("image/jpeg", quality);
        if (data.length < (650 * 1024 * 4) / 3) return data;
      }
      throw Error(
        "Esta foto sigue siendo muy pesada. Prueba con una fotografía más cercana al detalle.",
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function renderPhotos() {
    $("photoCount").textContent = `${state.photos.length} / 4`;
    $("photoPreview").replaceChildren();
    state.photos.forEach((data, index) => {
      const figure = document.createElement("figure"),
        img = new Image(),
        remove = document.createElement("button");
      img.src = data;
      img.alt = `Fotografía ${index + 1} del reporte`;
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Quitar fotografía ${index + 1}`);
      remove.onclick = () => {
        state.photos.splice(index, 1);
        renderPhotos();
      };
      figure.append(img, remove);
      $("photoPreview").append(figure);
    });
  }
  async function addPhotos(input) {
    if (state.processing || state.busy || state.pending) return;
    const files = [...input.files];
    input.value = "";
    if (!files.length) return;
    if (files.length + state.photos.length > 4) {
      $("photoMessage").textContent =
        "Puedes agregar hasta 4 fotografías. Quita una antes de agregar otra.";
      return;
    }
    state.processing = true;
    availability();
    $("photoMessage").textContent = "Preparando fotografías…";
    try {
      const added = [];
      for (const file of files) added.push(await compress(file));
      state.photos.push(...added);
      renderPhotos();
      $("photoMessage").textContent = "";
    } catch (error) {
      $("photoMessage").textContent = error.message;
    } finally {
      state.processing = false;
      availability();
    }
  }
  $("takePhoto").onclick = () => $("cameraInput").click();
  $("choosePhotos").onclick = () => $("photosInput").click();
  $("cameraInput").onchange = () => addPhotos($("cameraInput"));
  $("photosInput").onchange = () => addPhotos($("photosInput"));
  $("retryLoad").onclick = load;
  $("guestForm").onsubmit = async (event) => {
    event.preventDefault();
    if (state.busy || state.processing || state.sent) return;
    const payload = state.pending || {
      formToken: state.token,
      name: $("guestName").value,
      phone: $("guestPhone").value,
      category: $("guestCategory").value,
      equipmentState: $("guestEquipmentState").value,
      priority: $("guestPriority").value,
      location: $("guestLocation").value,
      description: $("guestDescription").value,
      photos: [...state.photos],
      confirm: $("guestConfirm").checked,
      website: $("guestWebsite").value,
    };
    state.busy = true;
    availability();
    $("submitMessage").textContent = "Enviando tu reporte…";
    try {
      showReceipt(await request("POST", payload));
    } catch (error) {
      state.pending = error.uncertain ? payload : null;
      $("submitMessage").textContent = error.message;
    } finally {
      state.busy = false;
      availability();
    }
  };
  $("newReport").onclick = () => {
    storage.clear();
    state.sent = false;
    state.pending = null;
    state.photos = [];
    $("guestForm").reset();
    renderPhotos();
    $("receipt").hidden = true;
    $("submitMessage").textContent = "";
    $("photoMessage").textContent = "";
    availability();
    load();
  };
  load();
})();
