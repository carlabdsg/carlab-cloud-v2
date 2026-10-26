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
  function matrix(value) {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    return qr;
  }
  function png(value) {
    const qr = matrix(value);
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
  function labelDocument(unit, data, brand) {
    const target = url(data);
    const doc = new window.jspdf.jsPDF({
      unit: "mm",
      format: [106, 146],
      compress: true,
    });
    doc.setProperties({
      title: "CARLAB · Unidad " + unit.unit,
      subject: "Expediente de aire acondicionado",
    });
    // Fixed text boxes keep long company/unit names on this single label.
    function box(value, x, top, width, height, size) {
      const text = String(value || "")
        .replace(/\s+/g, " ")
        .trim();
      let lines;
      for (; size >= 5; size -= 0.25) {
        doc.setFontSize(size);
        lines = doc.splitTextToSize(text, width);
        if ((lines.length * size * 1.1) / doc.internal.scaleFactor <= height)
          break;
      }
      doc.text(lines, x, top, { baseline: "top", lineHeightFactor: 1.1 });
    }
    const accent = [206, 128, 173];
    doc.setFillColor(...accent);
    doc.rect(10, 10, 86, 0.45, "F");
    doc.rect(10, 34, 86, 0.45, "F");
    for (const x of [10, 95.55]) {
      doc.rect(x, 10, 0.45, 7, "F");
      doc.rect(x, 28, 0.45, 6.45, "F");
    }
    doc.setTextColor(21, 21, 21);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(28);
    doc.text("CARLAB", 53, 24.3, { align: "center" });
    doc.setFontSize(6.5);
    doc.text("S E R V I C I O S  I N T E G R A L E S", 53, 31, {
      align: "center",
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("EXPEDIENTE DE AIRE ACONDICIONADO", 10, 41);
    doc.setFillColor(221, 221, 221);
    doc.rect(10, 45, 86, 0.2, "F");
    box(unit.company, 10, 49, 86, 7.5, 11);
    doc.setTextColor(85, 85, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("UNIDAD", 10, 60);
    doc.text("SISTEMA A/C", 68, 60);
    doc.setTextColor(21, 21, 21);
    doc.setFont("helvetica", "bold");
    box(unit.unit, 10, 63, 54, 17, 43);
    box(brand, 68, 64, 28, 6.2, 12);
    doc.setFillColor(...accent);
    doc.rect(68, 71, 28, 1, "F");
    // Vector modules remain sharp at print size. Four white modules surround
    // every edge of the QR; no decoration or text enters that quiet zone.
    const qr = matrix(target),
      count = qr.getModuleCount();
    const cell = 52 / (count + 8),
      left = 27,
      top = 79;
    doc.setFillColor(0, 0, 0);
    for (let row = 0; row < count; row++)
      for (let col = 0; col < count; col++)
        if (qr.isDark(row, col))
          doc.rect(
            left + (col + 4) * cell,
            top + (row + 4) * cell,
            cell,
            cell,
            "F",
          );
    doc.link(left, top, 52, 52, { url: target });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Escanea para reportar una falla de A/C", 53, 134, {
      align: "center",
    });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(85, 85, 85);
    doc.setFontSize(6.5);
    doc.text("Reporta sin crear una cuenta", 53, 139, { align: "center" });
    return doc;
  }
  function label(unit, data, brand) {
    labelDocument(unit, data, brand).save(
      "CARLAB-QR-Unidad-" + String(unit.unit).replace(/[^\w-]/g, "_") + ".pdf",
    );
  }
  window.ACQR = {
    valid,
    url,
    png,
    label,
    labelDocument,
    order: async (id) => {
      const data = await api("/fleet/order-qr/" + encodeURIComponent(id));
      return data ? { url: url(data), image: png(url(data)) } : null;
    },
  };
})();
