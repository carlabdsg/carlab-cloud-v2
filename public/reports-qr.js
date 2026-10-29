/* Batch labels for the general reports system. AC labels stay independent. */
"use strict";
(() => {
  const valid = (token) => /^[a-f0-9]{48}$/.test(token || "");
  const target = (unit) => {
    if (!valid(unit.token))
      throw new Error("La etiqueta no tiene un código válido.");
    return location.origin + "/?reportqr=" + unit.token;
  };
  const layouts = {
    small: {
      width: 64,
      columns: 3,
      rows: 3,
      label: "Compactas · 64 × 88 mm · 9 por hoja A4",
    },
    medium: {
      width: 88,
      columns: 2,
      rows: 2,
      label: "Medianas · 88 × 121 mm · 4 por hoja A4",
    },
    individual: {
      width: 106,
      columns: 1,
      rows: 1,
      label: "Individuales · 106 × 146 mm",
    },
  };
  function draw(doc, unit, x, y, width) {
    const scale = width / 106;
    const rect = (a, b, w, h, color) => {
      doc.setFillColor(...color);
      doc.rect(x + a * scale, y + b * scale, w * scale, h * scale, "F");
    };
    const text = (
      value,
      a,
      b,
      size,
      bold = false,
      align = "left",
      color = [21, 21, 21],
    ) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size * scale);
      doc.setTextColor(...color);
      doc.text(String(value), x + a * scale, y + b * scale, { align });
    };
    function box(value, a, b, w, h, size, bold = true) {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setTextColor(21, 21, 21);
      let lines;
      do {
        doc.setFontSize(size * scale);
        lines = doc.splitTextToSize(
          String(value || "—")
            .replace(/\s+/g, " ")
            .trim(),
          w * scale,
        );
        if ((lines.length * size * 1.1) / 2.83465 <= h) break;
        size -= 0.25;
      } while (size > 4);
      doc.text(lines, x + a * scale, y + b * scale, {
        baseline: "top",
        lineHeightFactor: 1.1,
      });
    }
    const pink = [206, 128, 173];
    rect(10, 10, 86, 0.45, pink);
    rect(10, 34, 86, 0.45, pink);
    for (const left of [10, 95.55]) {
      rect(left, 10, 0.45, 7, pink);
      rect(left, 28, 0.45, 6.45, pink);
    }
    text("CARLAB", 53, 24.3, 28, false, "center");
    text(
      "S E R V I C I O S  I N T E G R A L E S",
      53,
      31,
      6.5,
      false,
      "center",
    );
    text("REPORTES", 10, 41, 9, true);
    rect(10, 45, 86, 0.2, [221, 221, 221]);
    box(unit.empresa, 10, 49, 86, 8, 11);
    text("UNIDAD", 10, 60, 7);
    text("FLOTA", 68, 60, 7);
    box(unit.numeroEconomico, 10, 63, 54, 15, 40);
    box(unit.nombreFlota || unit.marca || "CARLAB", 68, 64, 28, 6.2, 11);
    rect(68, 71, 28, 1, pink);
    const url = target(unit),
      qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    const count = qr.getModuleCount(),
      cell = 52 / (count + 8);
    for (let row = 0; row < count; row++)
      for (let col = 0; col < count; col++)
        if (qr.isDark(row, col))
          rect(
            27 + (col + 4) * cell,
            79 + (row + 4) * cell,
            cell,
            cell,
            [0, 0, 0],
          );
    doc.link(x + 27 * scale, y + 79 * scale, 52 * scale, 52 * scale, { url });
    text(
      unit.reportOptions?.ac === true
        ? "Reporte general o aire acondicionado"
        : "Daños y garantías",
      53,
      134,
      6.6,
      false,
      "center",
    );
    text(
      "Reporta sin crear una cuenta",
      53,
      139,
      6.5,
      true,
      "center",
      [85, 85, 85],
    );
  }
  async function documentFor(units, size = "small", progress = () => {}) {
    if (!Array.isArray(units) || !units.length)
      throw new Error("Selecciona al menos una unidad.");
    if (units.some((unit) => !valid(unit.token)))
      throw new Error(
        "No se recibieron todos los códigos QR. Actualiza e intenta nuevamente.",
      );
    const layout = layouts[size];
    if (!layout) throw new Error("Tamaño de etiqueta no válido.");
    const single = size === "individual",
      doc = new window.jspdf.jsPDF({
        unit: "mm",
        format: single ? [106, 146] : "a4",
        compress: true,
      });
    doc.setProperties({
      title: "CARLAB · Etiquetas de reportes",
      subject: `${units.length} unidades de flota`,
    });
    const capacity = layout.columns * layout.rows,
      height = (layout.width * 146) / 106,
      gap = 3;
    const startX = single
      ? 0
      : (210 - (layout.width * layout.columns + gap * (layout.columns - 1))) /
        2;
    for (let i = 0; i < units.length; i++) {
      if (i && i % capacity === 0) doc.addPage();
      const index = i % capacity;
      if (!single && index === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(65, 65, 65);
        doc.text("CARLAB / REPORTES · ETIQUETAS DE UNIDADES", 9, 11);
        doc.text("Imprimir al 100% · Recortar por las guías", 9, 16);
        doc.text(
          `Hoja ${Math.floor(i / capacity) + 1} de ${Math.ceil(units.length / capacity)} · ${units.length} unidades`,
          201,
          16,
          { align: "right" },
        );
      }
      const x = startX + (index % layout.columns) * (layout.width + gap),
        y = single
          ? 0
          : 20 + Math.floor(index / layout.columns) * (height + gap);
      if (!single) {
        doc.setDrawColor(215, 215, 215);
        doc.setLineWidth(0.15);
        doc.rect(x, y, layout.width, height);
      }
      draw(doc, units[i], x, y, layout.width);
      progress(i + 1, units.length);
      if (i % 9 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return doc;
  }
  window.ReportsQR = { layouts, target, documentFor };
})();
