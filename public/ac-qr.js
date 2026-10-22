"use strict";
(() => {
  const valid = (code) => /^[a-f0-9]{48}$/.test(code || "");
  async function api(path) {
    const r = await fetch("/api/ac" + path, {
      headers: {
        Authorization: "Bearer " + (localStorage.getItem("carlabToken") || ""),
      },
      cache: "no-store",
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || "No se pudo consultar el QR.");
    return body;
  }
  function url(data) {
    if (!valid(data?.token)) throw new Error("Código QR inválido.");
    return location.origin + "/ac-unit.html?code=" + data.token;
  }
  function png(value) {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount(),
      scale = 8,
      size = (count + 8) * scale;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const c = canvas.getContext("2d");
    c.fillStyle = "#fff";
    c.fillRect(0, 0, size, size);
    c.fillStyle = "#000";
    for (let row = 0; row < count; row++)
      for (let col = 0; col < count; col++)
        if (qr.isDark(row, col))
          c.fillRect((col + 4) * scale, (row + 4) * scale, scale, scale);
    return canvas.toDataURL("image/png");
  }
  function label(unit, data, brand) {
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: [100, 140] });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("CARLAB", 50, 14, { align: "center" });
    doc.setFontSize(10);
    doc.text("EXPEDIENTE DE AIRE ACONDICIONADO", 50, 21, { align: "center" });
    let y = 30;
    for (const [text, size] of [
      [unit.company, 11],
      ["Unidad " + unit.unit, 15],
      [brand, 11],
    ]) {
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(String(text), 88);
      doc.text(lines, 50, y, { align: "center" });
      y += lines.length * 5 + 2;
    }
    // Long company/unit names use a second page instead of shrinking the QR.
    if (y > 60) {
      doc.addPage();
      y = 12;
    }
    doc.addImage(png(url(data)), "PNG", 20, y, 60, 60);
    doc.link(20, y, 60, 60, { url: url(data) });
    y += 67;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Escanea para consultar o solicitar servicio", 50, y, {
      align: "center",
    });
    doc.text("Acceso con cuenta autorizada", 50, y + 5, { align: "center" });
    doc.save(
      "CARLAB-QR-Unidad-" + String(unit.unit).replace(/[^\w-]/g, "_") + ".pdf",
    );
  }
  window.ACQR = {
    valid,
    url,
    png,
    label,
    order: async (id) => {
      const data = await api("/fleet/order-qr/" + encodeURIComponent(id));
      return data ? { url: url(data), image: png(url(data)) } : null;
    },
  };
})();
