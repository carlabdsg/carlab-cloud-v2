"use strict";
(() => {
  const pending = new Map();
  function load(src, ready) {
    if (ready()) return Promise.resolve();
    if (pending.has(src)) return pending.get(src);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let timer;
      const finish = (error) => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) {
          script.remove();
          reject(error);
        } else resolve();
      };
      script.src = src;
      script.async = true;
      script.onload = () =>
        finish(
          ready()
            ? null
            : new Error("No se pudo preparar el archivo. Intenta nuevamente."),
        );
      script.onerror = () =>
        finish(
          new Error(
            "No se pudo descargar la herramienta. Revisa tu conexión e intenta nuevamente.",
          ),
        );
      timer = setTimeout(
        () =>
          finish(new Error("La descarga tardó demasiado. Intenta nuevamente.")),
        20000,
      );
      document.head.appendChild(script);
    }).finally(() => pending.delete(src));
    pending.set(src, promise);
    return promise;
  }
  window.CarlabAssets = Object.freeze({
    async pdf({ tables = false } = {}) {
      await load("/vendor/hc-jspdf.umd.min.js", () => !!window.jspdf?.jsPDF);
      if (tables)
        await load(
          "/vendor/hc-autotable.min.js",
          () => !!window.jspdf?.jsPDF?.API?.autoTable,
        );
    },
    qr() {
      return load(
        "/vendor/ac-qrcode.js",
        () => typeof window.qrcode === "function",
      );
    },
  });
})();
