"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    code = new URLSearchParams(location.search).get("code") || "";
  const valid = /^[a-f0-9]{48}$/.test(code);
  if (valid) {
    $("generalChoice").href = "/reporte-qr.html?code=" + code;
    $("acChoice").href = "/ac-reporte-qr.html?reportqr=" + code;
    $("accountLink").href = "/?reportqr=" + code + "&access=account";
  }
  async function load() {
    $("retryLoad").hidden = true;
    if (!valid) {
      $("loadMessage").textContent =
        "Escanea una etiqueta de reportes CARLAB para abrir la unidad correcta.";
      return;
    }
    $("loadMessage").textContent = "Consultando la unidad de tu etiqueta…";
    try {
      const r = await fetch("/api/public/report-qr/" + code, {
        credentials: "omit",
        cache: "no-store",
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "No se pudo consultar la unidad.");
      $("unitCompany").textContent = data.unit.empresa;
      $("unitNumber").textContent = "Unidad " + data.unit.numeroEconomico;
      $("unitModel").textContent = [data.unit.marca, data.unit.modelo]
        .filter(Boolean)
        .join(" · ");
      $("loadMessage").textContent = "";
      for (const id of ["unitCard", "reportChoices", "choiceHint"])
        $(id).hidden = false;
    } catch (e) {
      $("loadMessage").textContent =
        e instanceof TypeError
          ? "No se pudo consultar la unidad. Revisa tu conexión e intenta nuevamente."
          : e.message;
      $("retryLoad").hidden = false;
    }
  }
  $("retryLoad").onclick = load;
  load();
})();
