/* Local PDF export; no service data is sent to a third party. jsPDF + AutoTable (MIT). */
(() => {
  const clean = (v) =>
    String(v ?? "")
      .replace(/Ω/g, "ohm")
      .replace(/[→←]/g, "-")
      .replace(/\u0000/g, "");
  const date = (v) =>
    v
      ? new Date(
          String(v).length === 10 ? v + "T12:00:00" : v,
        ).toLocaleDateString("es-MX")
      : "";
  const cash = (n) =>
    "$" +
    Number(n || 0).toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    " MXN";
  const statuses = {
    pendiente: "Pendiente",
    bien: "Bien",
    corregido: "Corregido",
    hallazgo: "Hallazgo",
    no_aplica: "No aplica",
  };
  const decisions = {
    pendiente: "Por autorizar",
    autorizado: "Autorizado",
    no_autorizado: "No autorizado",
    realizado: "Realizado",
    descartado: "Descartado",
  };
  const results = {
    operativo: "Operativo",
    con_observaciones: "Con observaciones",
    no_operativo: "No operativo",
  };
  const phases = {
    antes: "Antes",
    durante: "Durante",
    despues: "Después",
    sin_clasificar: "Sin clasificar",
  };
  const components = {
    compresor: "Compresor",
    evaporador: "Evaporador",
    condensador: "Condensador",
    circuito: "Circuito / fuga",
    electrico: "Eléctrico / control",
    pieza: "Pieza sustituida",
    unidad: "Unidad",
    otro: "Otro",
  };
  async function exportPDF(record, catalog) {
    await window.CarlabAssets.pdf({ tables: true });
    if (!window.jspdf?.jsPDF)
      throw new Error(
        "No se cargó el generador PDF. Recarga y vuelve a intentar.",
      );
    const doc = new window.jspdf.jsPDF({
      unit: "mm",
      format: "a4",
      compress: true,
    });
    const unitQR =
      window.ACQR && !record.deletedAt
        ? await window.ACQR.order(record.id)
        : null;
    const d = record.data;
    const isV3 = Number(d.formVersion) >= 3;
    const showCosts = record.permissions?.costs !== false;
    const brand = d.brand || "hispacold";
    const brandLabel =
      { hispacold: "Hispacold", eberspaecher: "Eberspächer" }[brand] ||
      "Climatización";
    const serviceLabel = catalog.types?.[d.type] || "Servicio de climatización";
    const attentionLabel =
      d.attention === "express" || d.type === "express"
        ? "Servicio express"
        : "Atención normal";
    const statusLabel =
      (record.deletedAt ? "En papelera · " : "") +
      (catalog.statuses?.[d.status] || d.status || "Borrador");
    const evidence = Array.isArray(d.evidence) ? d.evidence : [];
    const optionalChecklist = isV3 && ["revision", "menor"].includes(d.type);
    const checklist = (Array.isArray(d.checklist) ? d.checklist : []).filter(
      (check) =>
        !optionalChecklist ||
        (check.outcome && check.outcome !== "pendiente") ||
        String(check.notes || "").trim() ||
        check.action ||
        evidence.some((photo) => photo.checkId === check.id),
    );
    const parts = Array.isArray(d.parts) ? d.parts : [];
    let y = 32;
    const ink = [20, 44, 62],
      teal = [8, 127, 130],
      muted = [101, 119, 129];
    doc.setProperties({
      title: record.folio + " · " + brandLabel + " · " + serviceLabel,
      subject: "Reporte técnico de climatización",
      author: "CARLAB",
      creator: "CARLAB Cloud · " + brandLabel,
    });
    function newPage() {
      doc.addPage();
      y = 32;
    }
    function room(height) {
      if (y + height > 274) newPage();
    }
    let pendingTitle = "";
    function title(text) {
      pendingTitle = text;
    }
    function flushTitle(contentHeight = 12) {
      if (!pendingTitle) {
        room(Math.min(contentHeight, 220));
        return;
      }
      const text = pendingTitle;
      pendingTitle = "";
      room(12 + Math.min(contentHeight, 220));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...ink);
      doc.text(clean(text), 14, y + 4);
      doc.setDrawColor(217, 228, 233);
      doc.line(14, y + 8, 196, y + 8);
      y += 12;
    }
    function table(head, rows, widths) {
      if (!rows.length) return;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const rowHeight =
        Math.max(
          ...rows[0].map(
            (v, i) =>
              doc.splitTextToSize(
                clean(v),
                (widths?.[i]?.cellWidth || 182 / rows[0].length) - 6,
              ).length,
          ),
        ) *
          3.5 +
        6;
      flushTitle(rowHeight + (head ? 10 : 0) + 2);
      doc.autoTable({
        startY: y,
        head: head ? [head.map(clean)] : undefined,
        body: rows.map((r) => r.map(clean)),
        theme: head ? "striped" : "plain",
        margin: { left: 14, right: 14, top: 32, bottom: 22 },
        styles: {
          font: "helvetica",
          fontSize: 8.5,
          textColor: ink,
          cellPadding: 3,
          overflow: "linebreak",
          lineColor: [225, 233, 236],
        },
        headStyles: {
          fillColor: ink,
          textColor: 255,
          fontSize: 8,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [245, 249, 250] },
        columnStyles: widths || {},
        rowPageBreak: "avoid",
      });
      y = doc.lastAutoTable.finalY + 6;
    }
    function paragraph(label, text) {
      if (!String(text || "").trim()) return;
      title(label);
      table(null, [[text]]);
    }
    function pairRows(entries) {
      return entries
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([label, value]) => [label, value]);
    }
    function clipped(value, max = 4) {
      const lines = doc.splitTextToSize(
        clean(value || "Pendiente de registrar"),
        177,
      );
      return lines.length > max
        ? [...lines.slice(0, max - 1), lines[max - 1].slice(0, -5) + "…"]
        : lines;
    }
    // V3 grows from a compact report; legacy records keep their executive summary.
    doc.setFillColor(...ink);
    doc.rect(0, 0, 210, 40, "F");
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text("CARLAB", 14, 19);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(clean("CLIMATIZACIÓN / " + brandLabel.toUpperCase()), 14, 29);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(record.folio, unitQR ? 168 : 196, 18, { align: "right" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(date(d.serviceDate), unitQR ? 168 : 196, 27, { align: "right" });
    if (unitQR) {
      doc.addImage(unitQR.image, "PNG", 174, 3, 32, 32);
      doc.link(174, 3, 32, 32, { url: unitQR.url });
      doc.setFontSize(7);
      doc.text("Expediente · acceso con cuenta", 190, 38, { align: "center" });
    }
    doc.setFillColor(233, 246, 242);
    doc.roundedRect(14, 47, 182, 22, 2, 2, "F");
    doc.setTextColor(...teal);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(clean(serviceLabel), 20, 56);
    doc.setFontSize(9);
    doc.text(
      clean(
        (results[d.result] || "Entrega pendiente") +
          " · " +
          statusLabel +
          (isV3 ? " · " + attentionLabel : ""),
      ),
      20,
      63,
    );
    y = 77;
    if (!isV3)
      table(
        null,
        [
          [
            "Cliente",
            clean(d.company).slice(0, 100),
            "Unidad",
            clean(d.unit).slice(0, 70),
          ],
          [
            "Equipo",
            clean(d.equipment || d.model || "No registrado").slice(0, 100),
            "Técnico",
            clean(d.technician || "Por asignar").slice(0, 80),
          ],
        ],
        {
          0: { cellWidth: 20, fontStyle: "bold" },
          1: { cellWidth: 71 },
          2: { cellWidth: 20, fontStyle: "bold" },
          3: { cellWidth: 71 },
        },
      );
    function summary(label, value) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...ink);
      doc.text(label, 14, y + 3);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...muted);
      const lines = clipped(value, 4);
      doc.text(lines, 14, y + 10);
      y += 15 + lines.length * 4;
    }
    if (!isV3) {
      summary("DIAGNÓSTICO", d.diagnosis || d.symptoms);
      summary("TRABAJO REALIZADO", d.workDone);
      summary("VALIDACIÓN Y ENTREGA", d.finalTest);
      doc.setFillColor(245, 248, 250);
      doc.roundedRect(14, y + 2, 182, 21, 2, 2, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...ink);
      doc.text(
        "Próximo servicio: " + (date(d.nextDate) || "No programado"),
        19,
        y + 10,
      );
      if (showCosts)
        doc.text("Importe registrado: " + cash(d.total), 19, y + 17);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(
        "Resumen de entrega. El expediente completo continúa en las siguientes páginas.",
        14,
        267,
      );
      newPage();
      title("Expediente técnico · " + record.folio);
    }
    const metadata = pairRows([
      ["Cliente", d.company],
      ["Unidad", d.unit],
      ["Fecha", isV3 ? "" : date(d.serviceDate)],
      ["Marca del A/C", isV3 ? "" : brandLabel],
      ["Tipo de servicio", isV3 ? "" : serviceLabel],
      ["Tipo de atención", !isV3 && d.attention ? attentionLabel : ""],
      ["Estado", isV3 ? "" : statusLabel],
      ["En papelera desde", date(record.deletedAt)],
      ["Técnico", d.technician],
      ["Cliente / representante", d.clientName],
      ["Modelo", d.model],
      ["Chasis", d.chassis],
      ["Equipo", d.equipment],
      ["Control", d.control],
      ["Serie compresor", d.compressorSerial],
      ["Número de obra", d.workNumber],
      ["Kilometraje", d.mileage],
      ["Base", d.base],
      ["Periodicidad", d.type === "preventivo" ? d.interval : ""],
      ["Prioridad", d.priority],
      ["Próximo servicio", date(d.nextDate)],
      ["Evento", catalog.eventKinds?.[d.eventKind]],
      ["Ubicación del evento", d.eventLocation],
      ["Contacto", d.eventContact],
      ["Aviso (hora local)", d.reportedAt],
      ["Llegada (hora local)", d.arrivalAt],
      ["Resolución (hora local)", d.resolvedAt],
    ]);
    if (isV3) {
      const paired = [];
      for (let i = 0; i < metadata.length; i += 2)
        paired.push([...metadata[i], ...(metadata[i + 1] || ["", ""])]);
      table(null, paired, {
        0: { cellWidth: 30, fontStyle: "bold" },
        1: { cellWidth: 61 },
        2: { cellWidth: 30, fontStyle: "bold" },
        3: { cellWidth: 61 },
      });
    } else {
      table(null, metadata, {
        0: { cellWidth: 47, fontStyle: "bold" },
        1: { cellWidth: 135 },
      });
    }
    paragraph("Recepción y motivo del servicio", d.symptoms);
    if (record.deletedAt)
      paragraph("Motivo de eliminación", record.deleteReason);
    paragraph("Códigos observados", d.faultCodes);
    paragraph("Diagnóstico técnico", d.diagnosis);
    paragraph("Intervención realizada", d.workDone);
    paragraph("Alcance y autorización general", d.authorization);
    if ((d.findings || []).length) {
      title("Trabajos detectados y autorización");
      table(
        ["Trabajo", "Decisión", "Autorizado por", "Observaciones"],
        d.findings.map((f) => [
          f.description,
          decisions[f.decision],
          f.authorizedBy,
          f.notes,
        ]),
        {
          0: { cellWidth: 60 },
          1: { cellWidth: 30 },
          2: { cellWidth: 35 },
          3: { cellWidth: 57 },
        },
      );
    }
    if (checklist.length) {
      title("Lista de revisión");
      table(
        ["Sistema / punto", "Acción", "Resultado", "Observaciones"],
        checklist.map((c) => [
          c.group + " / " + c.label,
          c.action || "—",
          statuses[c.outcome],
          (c.notes || "") +
            (evidence.some((p) => p.checkId === c.id)
              ? " · Ver evidencia fotográfica"
              : ""),
        ]),
        {
          0: { cellWidth: 71 },
          1: { cellWidth: 16 },
          2: { cellWidth: 27 },
          3: { cellWidth: 68 },
        },
      );
    }
    const measurements = (d.measurements || []).filter(
      (m) =>
        (m.before != null && m.before !== "") ||
        (m.after != null && m.after !== "") ||
        m.conditions,
    );
    if (measurements.length) {
      title("Mediciones antes y después");
      table(
        ["Medición", "Antes", "Después", "Condiciones"],
        measurements.map((m) => [
          m.label + " (" + m.unit + ")",
          m.before ?? "—",
          m.after ?? "—",
          m.conditions,
        ]),
        {
          0: { cellWidth: 55 },
          1: { cellWidth: 23 },
          2: { cellWidth: 23 },
          3: { cellWidth: 81 },
        },
      );
    }
    if (d.circuitOpened) {
      title("Intervención en circuito frigorífico");
      table(
        null,
        pairRows([
          ["Refrigerante", d.refrigerant],
          ["Recuperado (kg)", d.recoveredKg],
          ["Cargado (kg)", d.chargedKg],
          ["Aceite", d.oilType],
          ["Añadido (ml)", d.oilMl],
          ["Vacío (micrones)", d.vacuumMicrons],
          ["Tiempo de prueba (min)", d.vacuumMinutes],
        ]),
      );
      paragraph("Pruebas del circuito", d.refrigerantNotes);
    }
    paragraph("Referencia técnica / procedimiento", d.technicalReference);
    paragraph("Plan acordado con la flota", d.planReference);
    if (parts.length && !showCosts) {
      title("Refacciones y materiales");
      table(
        ["Concepto / referencia", "Cantidad"],
        parts.map((p) => [
          p.description + (p.reference ? " / " + p.reference : ""),
          p.quantity,
        ]),
        { 0: { cellWidth: 152 }, 1: { cellWidth: 30 } },
      );
    } else if (parts.length) {
      title("Refacciones, materiales y mano de obra");
      table(
        ["Concepto / referencia", "Cantidad", "Precio unitario", "Importe"],
        parts.map((p) => [
          p.description + (p.reference ? " / " + p.reference : ""),
          p.quantity,
          cash(p.unitPrice),
          cash(p.total),
        ]),
        {
          0: { cellWidth: 84 },
          1: { cellWidth: 20 },
          2: { cellWidth: 39 },
          3: { cellWidth: 39 },
        },
      );
      room(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Total registrado: " + cash(d.total), 196, y, {
        align: "right",
      });
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(
        "Registro de servicio. Importes en MXN, sin cálculo fiscal.",
        14,
        y,
      );
      y += 9;
    }
    paragraph("Verificación funcional y entrega", d.finalTest);
    paragraph("Condición de entrega", results[d.result]);
    paragraph("Recomendaciones y pendientes", d.recommendations);
    paragraph("Cancelación", d.cancelReason);
    paragraph("Reapertura", d.reopenReason);
    let firstEvidence = true;
    for (const [phase, label] of Object.entries(phases)) {
      const images = evidence.filter(
        (p) => (p.phase || "sin_clasificar") === phase,
      );
      if (!images.length) continue;
      if (firstEvidence) {
        if (!isV3) newPage();
        firstEvidence = false;
      }
      title("Evidencia · " + label);
      for (const photo of images) {
        const props = doc.getImageProperties(photo.data),
          width = Math.min(176, (props.width / props.height) * 82),
          height = Math.min(82, (props.height / props.width) * 176);
        const caption = [
          components[photo.component] || "",
          photo.caption || photo.name,
          photo.checkId
            ? checklist.find((c) => c.id === photo.checkId)?.label
            : "",
        ]
          .filter(Boolean)
          .join(" · ");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        const lines = doc.splitTextToSize(clean(caption), 176);
        flushTitle(height + lines.length * 4 + 14);
        doc.addImage(
          photo.data,
          props.fileType || "JPEG",
          14,
          y,
          width,
          height,
          undefined,
          "FAST",
        );
        y += height + 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text(lines, 14, y);
        y += lines.length * 4 + 9;
      }
    }
    const signers = [
      ["Técnico", d.technician, d.technicianSignature],
      ["Representante del cliente", d.clientName, d.clientSignature],
    ].filter(([, name, image]) => image || (!isV3 && name));
    if (signers.length) {
      title("Constancia de entrega");
      flushTitle(50);
      signers.forEach(([label, name, image], i) => {
        const x = 14 + i * 94;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...ink);
        doc.text(label, x, y + 2);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(
          doc.splitTextToSize(clean(name || "Sin nombre"), 85).slice(0, 2),
          x,
          y + 8,
        );
        if (image) {
          const p = doc.getImageProperties(image);
          const w = Math.min(80, (p.width / p.height) * 22);
          doc.addImage(
            image,
            p.fileType || "PNG",
            x,
            y + 17,
            w,
            Math.min(22, (p.height / p.width) * 80),
            undefined,
            "FAST",
          );
        } else doc.text("Sin firma capturada", x, y + 27);
        doc.setDrawColor(190, 207, 215);
        doc.line(x, y + 42, x + 85, y + 42);
      });
      y += 50;
    }
    const refs = new Map();
    checklist.forEach((c) => {
      if (c.source) refs.set(c.source.manualId + ":" + c.source.page, c.source);
    });
    title("Referencias del formato");
    table(
      null,
      [...refs.values()].map((s) => [
        catalog.manuals?.find((m) => m.id === s.manualId)?.title ||
          "Documento técnico",
        "Pág. " + s.page,
      ]),
      { 0: { cellWidth: 162 }, 1: { cellWidth: 20 } },
    );
    if (record.events?.length) {
      title("Trazabilidad");
      table(
        ["Fecha", "Responsable", "Versión / estado"],
        record.events.map((e) => {
          const details = e.details || {};
          const eventLabel =
            {
              eliminacion: "Enviada a papelera",
              restauracion: "Recuperada de papelera",
            }[e.action] ||
            catalog.statuses?.[details.to] ||
            details.to ||
            e.action ||
            "Actualización";
          return [
            new Date(e.created_at).toLocaleString("es-MX"),
            e.actor_name,
            (details.version ? "V" + details.version + " · " : "") +
              eventLabel +
              (details.reason ? " · " + details.reason : ""),
          ];
        }),
        { 0: { cellWidth: 38 }, 1: { cellWidth: 49 }, 2: { cellWidth: 95 } },
      );
    }
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      if (i > 1) {
        doc.setFillColor(...ink);
        doc.rect(0, 0, 210, 21, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(255);
        doc.text("CARLAB", 14, 13);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(
          clean(record.folio + " / " + brandLabel + " / " + serviceLabel),
          196,
          13,
          {
            align: "right",
          },
        );
      }
      doc.setDrawColor(211, 224, 230);
      doc.line(14, 281, 196, 281);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...muted);
      doc.text(
        record.folio +
          " · Versión " +
          record.version +
          " · CARLAB Servicios integrales",
        14,
        287,
      );
      doc.text(`Página ${i} de ${pages}`, 196, 287, { align: "right" });
    }
    doc.save(record.folio + "-" + brandLabel + ".pdf");
  }
  window.HispacoldPDF = { export: exportPDF };
})();
