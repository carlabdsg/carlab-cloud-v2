"use strict";
// Operational lists from the supplied manuals. Never infer completed work or
// universal quantities from these references. Legacy B2 records stay intact.
// Cleaning tasks have no V/R/S recommendation: R means repair in the existing UI.
const manuals = require("./manuals.json");
const hispaId = manuals.find((m) =>
  m.filename.startsWith("Mantenimiento Preventivo_"),
).id;
const make = (prefix, manualId, interval, page, rows) =>
  rows.map(([id, label, action]) => ({
    id: `${prefix}-${id}`,
    group: "Actividades del periodo",
    label,
    actions: { [interval]: action },
    source: { manualId, page },
  }));
const clean = [
  ["bandeja", "Limpiar la bandeja del equipo evaporador", ""],
  [
    "motor-turbinas",
    "Limpiar el motor evaporador y sopletear las turbinas (rodetes)",
    "",
  ],
  [
    "componentes",
    "Limpiar nodos, sensores, placa de fusibles y conectores",
    "",
  ],
];
const filters = [
  [
    "filtros-retorno",
    "Sustituir filtros de retorno de aire del evaporador",
    "S",
  ],
  ["filtro-ucc", "Sustituir filtro de retorno de aire del operador (UCC)", "S"],
];
const wash = [
  ["serpentin-evaporador", "Lavar el serpentín del evaporador", ""],
  ["serpentin-condensador", "Lavar el serpentín del condensador", ""],
];
const bearings = [
  [
    "baleros-guia",
    "Sustituir baleros de poleas guía (referencia 6305; confirmar equipo)",
    "S",
  ],
  [
    "balero-embrague",
    "Sustituir balero de polea del embrague (3210 o 5210 según equipo)",
    "S",
  ],
];
const annual = [
  [
    "aceite",
    "Sustituir aceite del compresor según especificación del equipo",
    "S",
  ],
  ["cuna", "Sustituir cuña de la bomba de aceite", "S"],
  ["junta", "Sustituir junta de tapa de bomba", "S"],
  ["disco", "Sustituir disco de fricción", "S"],
  ["deshidratador", "Sustituir filtro deshidratador", "S"],
];
const cleaning = [clean[0], clean[1], ...wash, clean[2]];
const hispaRows = {
  mensual: [
    [
      "general",
      "Revisión general de puntos y comprobación del funcionamiento del sistema",
      "V",
    ],
    ...clean,
  ],
  trimestral: [...filters, ...cleaning],
  semestral: [...bearings, ...filters, ...cleaning],
  anual: [...bearings, ...filters, ...annual, ...cleaning],
  bianual: [
    ...bearings,
    ...annual.slice(0, 4),
    ...filters,
    annual[4],
    [
      "refrigerante",
      "Atender el refrigerante previsto en el plan; registrar tipo y carga según el equipo y procedimiento",
      "V",
    ],
    ...cleaning,
  ],
};
const hispa = Object.fromEntries(
  Object.entries(hispaRows).map(([interval, rows], i) => [
    interval,
    {
      name: "Hispacold · Mantenimiento por periodo",
      source: { manualId: hispaId, page: i + 2 },
      note: "Plan PB, i5, i6, i6s e i8. La revisión general mensual incluye los puntos de inspección del equipo; registra los hallazgos en observaciones. Confirma referencias y cantidades según modelo.",
      checklist: make("hp", hispaId, interval, i + 2, rows),
    },
  ]),
);
// AC-188DD p.15: B does not include A; C includes B; D includes C; E includes D.
// Repeated annual oil-level/belt checks are retained once through B.
const A = [
  ["filtros", "Limpiar mallas del filtro de retorno del evaporador", ""],
  [
    "motores",
    "Revisar funcionamiento de motores del evaporador y condensador",
    "V",
  ],
];
const B = [
  [
    "carga",
    "Revisar carga por mirilla en las condiciones de operación del manual",
    "V",
  ],
  [
    "bandas",
    "Revisar tensión de bandas del compresor y ajustar si es necesario",
    "V",
  ],
  ["aceite", "Revisar nivel y limpieza del aceite", "V"],
  [
    "humedad",
    "Revisar mirilla de humedad; cambiar deshidratador por humedad y filtros de retorno si es necesario",
    "V",
  ],
  [
    "fugas",
    "Revisar fugas en mangueras y conexiones y realizar prueba de enfriamiento",
    "V",
  ],
];
const C = [
  ...B,
  A[1],
  [
    "embrague",
    "Revisar embrague electromagnético y calibración del plato de arrastre",
    "V",
  ],
  [
    "drenes",
    "Revisar drenajes libres de obstrucciones y sopletear con aire",
    "",
  ],
  [
    "serpentines",
    "Revisar serpentines, limpiar según condición y peinar aletas dobladas",
    "V",
  ],
];
const D = [
  ...C,
  [
    "lavado",
    "Lavar serpentines y ventiladores del condensador y sopletear motores del evaporador conforme al procedimiento",
    "",
  ],
  [
    "bulbo",
    "Revisar sujeción del bulbo sensor de la válvula de expansión",
    "V",
  ],
  [
    "tornilleria",
    "Revisar torque de tornillería de sujeción y reapretar si es necesario",
    "V",
  ],
  [
    "desgaste",
    "Reemplazar partes desgastadas y lubricar polea tensora de bandas según condición",
    "",
  ],
];
const E = [
  ...D,
  ["acidez", "Comprobar acidez del aceite del compresor", "V"],
  [
    "cambio-aceite",
    "Cambiar aceite y filtro deshidratador conforme al procedimiento",
    "S",
  ],
  [
    "presostatos",
    "Revisar función de interruptores de alta y baja presión",
    "V",
  ],
  ["compresor", "Revisar compresor: fugas, capacidad y montaje", "V"],
  ["mangueras", "Revisar condiciones de mangueras, sellos y cerraduras", "V"],
  [
    "funciones",
    "Verificar enfriamiento, ventilación y, si equipa, calefacción y compuerta de aire fresco",
    "V",
  ],
];
const eberId = "2dd0f21c86a4d8d4";
const eber = Object.fromEntries(
  Object.entries({
    semanal: A,
    mensual: B,
    trimestral: C,
    semestral: D,
    anual: E,
  }).map(([interval, rows]) => [
    interval,
    {
      name: "Eberspächer · AC-188DD A–E",
      source: { manualId: eberId, page: 15 },
      note: "Programa AC-188DD, página 15. C incluye B; D incluye C; E incluye D. Las revisiones repetidas se muestran una vez. El servicio anual corresponde a personal especialista en refrigeración.",
      checklist: make("ep", eberId, interval, 15, rows),
    },
  ]),
);
module.exports = {
  hispacold: { id: "hispacold-periodos-v1", periods: hispa },
  eberspaecher: { id: "eberspaecher-periodos-v1", periods: eber },
};
