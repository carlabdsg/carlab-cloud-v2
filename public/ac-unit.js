"use strict";
(async () => {
  const code = new URLSearchParams(location.search).get("code");
  const status = document.querySelector("#qr-status"),
    login = document.querySelector("#qr-login"),
    retry = document.querySelector("#qr-retry");
  retry.onclick = () => location.reload();
  if (!/^[a-f0-9]{48}$/.test(code || "")) {
    status.textContent =
      "Este código no es válido. Solicita la etiqueta actual a administración.";
    return;
  }
  const signin = () => {
    if (new URLSearchParams(location.search).get("access") !== "account") {
      location.replace("/ac-reporte-qr.html?code=" + code);
      return;
    }
    status.textContent =
      "Inicia sesión para consultar el expediente de esta unidad y dar seguimiento.";
    login.href = "/?acqr=" + code + "&access=account";
    login.hidden = false;
  };
  const token = localStorage.getItem("carlabToken");
  if (!token) {
    signin();
    return;
  }
  try {
    const get = async (path) =>
      fetch("/api/ac" + path, {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
    const me = await get("/me");
    if (me.status === 401 || me.status === 403) {
      signin();
      return;
    }
    const info = await me.json();
    if (!me.ok)
      throw new Error(info.error || "Tu cuenta no tiene acceso a Flotas AC.");
    const response = await get("/fleet/qr/resolve/" + code);
    const data = await response.json();
    if (response.status === 401) {
      signin();
      return;
    }
    if (!response.ok) throw new Error(data.error || "Código no disponible.");
    const page =
      info.user.role === "admin" ? "/hispacold.html" : "/ac-supervisor.html";
    location.replace(page + "?unit=" + encodeURIComponent(data.unitId));
  } catch (e) {
    status.textContent = e.message;
    retry.hidden = false;
  }
})();
