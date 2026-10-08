"use strict";
const manuals = require("./manuals.json");
const source = (prefix, page) => ({
  manualId: manuals.find((m) => m.filename.startsWith(prefix)).id,
  page,
});
const planSource = source("Plan MTTO", 1);
const sheetSource = source("HOJA DE SERVICIO", 1);
const types = {
  revision: "Revisión y diagnóstico",
  preventivo: "Mantenimiento preventivo",
  menor: "Reparación menor",
  mayor: "Reparación mayor",
  express: "Servicio express",
};
const intervals = {
  mensual: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
  bianual: 24,
};
const statuses = {
  borrador: "Borrador",
  en_proceso: "En proceso",
  espera_refaccion: "Espera refacción",
  completado: "Completado",
  cancelado: "Cancelado",
};
// V/R/S are reference actions from the one-page B2 plan, not completed work.
const groups = {
  Compresor: [
    ["Alineación y tensión de bandas", "V V V V V"],
    ["Estado de bandas", "V V S S S"],
    ["Nivel y cambio de aceite", "V V V S S"],
    ["Embrague electromagnético", "V V V V/R V/R"],
    ["Bobina: amperaje y resistencia", "V V V V V"],
    ["Baleros de polea", "V V R/S S S"],
    ["Alineación del compresor", "V V V V V"],
    ["Mecanismo de tensado", "V V V V V"],
    ["Protección por baja presión", "V V V V V"],
    ["Protección por alta presión", "V V V V V"],
    ["Diodo", "V V V V V"],
    ["Tacones y base", "V V V V V"],
    ["Cuña de bomba de aceite", "- - - S S"],
    ["Junta de tapa de bomba", "- - - S S"],
    ["Disco de fricción", "- - - V/S S"],
    ["Conexiones", "- - V/R V/R V/R"],
    ["Tornillería", "V V V/R V/R V/R"],
  ],
  Condensador: [
    ["Limpieza y condición de aletas", "V V R R R"],
    ["Motores", "V V V V V"],
    ["Electrónicas", "V V V V V"],
    ["Aspas", "V V V V V"],
    ["Tierras", "V V V V V"],
    ["Filtro deshidratador", "V V V V V/S"],
    ["Soportes de serpentines", "V V V V V"],
    ["Protecciones", "V V V V/S V/S"],
    ["Conexiones", "- - V/R V/R V/R"],
  ],
  Evaporador: [
    ["Limpieza y condición de aletas", "V V R R R"],
    ["Motores", "V V V V V"],
    ["Electrónicas", "V V V V V"],
    ["Turbinas y rodetes", "V V V V V"],
    ["Tierras", "V V V V V"],
    ["Válvulas de expansión", "V V V V V/S"],
    ["Filtros de retorno", "V V S S S"],
    ["Limpieza general", "V V V V V"],
    ["Conexiones", "- - V/R V/R V/R"],
    ["Electroválvulas de calefacción", "V V V V V"],
  ],
  "Circuito y control": [
    ["Hermeticidad del circuito", "V V V V V"],
    ["Carga y detección de fugas", "V V V V V"],
    ["Circuito eléctrico", "V V V V V"],
    ["Control y botones", "V V V V V"],
    ["Bornes eléctricos", "V V V V V"],
  ],
};
const checklist = Object.entries(groups).flatMap(([group, rows], gi) =>
  rows.map(([label, actions], i) => ({
    id: `b2-${gi + 1}-${i + 1}`,
    group,
    label,
    actions: Object.fromEntries(
      Object.keys(intervals).map((key, j) => [key, actions.split(" ")[j]]),
    ),
    source: planSource,
  })),
);
const extra = [
  ["recepcion", "Recepción", "Registrar síntoma, códigos y antecedentes", 3],
  ["drenes", "Evaporador", "Bandeja y drenajes", 3],
  [
    "prueba",
    "Prueba final",
    "Comprobar ventilación, enfriamiento y control",
    3,
  ],
].map(([id, group, label, page]) => ({
  id,
  group,
  label,
  actions: {},
  source: source("Guia_CARLAB", page),
}));
const repair = [
  ["causa", "Diagnóstico", "Identificar causa y componente afectado"],
  [
    "autorizacion",
    "Intervención",
    "Registrar alcance y autorización del cliente",
  ],
  [
    "pieza",
    "Intervención",
    "Confirmar compatibilidad de pieza por modelo y serie",
  ],
  [
    "trabajo",
    "Intervención",
    "Documentar reparación y piezas retiradas/instaladas",
  ],
  ["estanqueidad", "Validación", "Comprobar fugas si se intervino el circuito"],
  ["funcional", "Validación", "Repetir prueba funcional y registrar resultado"],
].map(([id, group, label]) => ({
  id: `rep-${id}`,
  group,
  label,
  actions: {},
  source: source("Guia_CARLAB", 3),
}));
const major = [
  {
    id: "may-procedimiento",
    group: "Reparación mayor",
    label: "Identificar procedimiento, valores y referencia aplicable",
    actions: {},
    source: source("Guia_CARLAB", 9),
  },
  {
    id: "may-recuperacion",
    group: "Reparación mayor",
    label: "Registrar recuperación, vacío, aceite y carga cuando aplique",
    actions: {},
    source: source("Guia_CARLAB", 9),
  },
];
const templates = Object.keys(types).map((id) => ({
  id,
  name: types[id],
  version: 1,
  source: sheetSource,
  checklist:
    id === "express"
      ? [
          {
            id: "exp-evento",
            group: "Atención express",
            label: "Evaluar el evento y registrar el diagnóstico",
            actions: {},
            source: source("Guia_CARLAB", 3),
          },
          {
            id: "exp-atencion",
            group: "Atención express",
            label: "Registrar la atención realizada y pendientes",
            actions: {},
            source: source("Guia_CARLAB", 3),
          },
          {
            id: "exp-prueba",
            group: "Atención express",
            label: "Comprobar resultado y condición de entrega",
            actions: {},
            source: source("Guia_CARLAB", 3),
          },
        ]
      : id === "preventivo"
        ? [...checklist, ...extra]
        : id === "revision"
          ? [
              ...extra,
              ...checklist.filter(
                (x) => !["b2-1-13", "b2-1-14", "b2-1-15"].includes(x.id),
              ),
            ]
          : [...extra, ...repair, ...(id === "mayor" ? major : [])],
}));
const measurements = [
  ["ambiente", "Temperatura ambiente", "°C"],
  ["retorno", "Aire de retorno", "°C"],
  ["impulsion", "Aire de impulsión", "°C"],
  ["rpm", "Régimen del motor", "RPM"],
  ["voltaje", "Alimentación", "V"],
  ["amperaje", "Consumo total", "A"],
  ["succion", "Presión de succión", "psi"],
  ["descarga", "Presión de descarga", "psi"],
  ["bobina", "Resistencia de bobina", "Ω"],
].map(([id, label, unit]) => ({ id, label, unit }));
const codes = [
  ...[
    "Sonda ambiente",
    "Sonda antihielo",
    "Corto en salida de compresor",
    "Corto evaporador, velocidad mínima",
    "Corto evaporador, velocidad máxima",
    "Corto en trampillas de recirculación",
    "Corto PWM evaporador",
    "Corto PWM condensador",
    "Sin retorno de presostatos",
    "Batería baja",
    "Sin señal de alternador",
    "Error interno 1",
    "Error interno 2",
    "Error interno 3",
  ].map((description, i) => ({
    control: "Basic",
    code: String(i + 1),
    description,
    source: source("Basic Errores", 1),
  })),
  ...[
    ["INT", "Sonda interior abierta o en corto"],
    ["ICE", "Sonda de hielo abierta o en corto"],
    ["CHN", "Sonda de canal abierta o en corto"],
    ["EXT", "Sonda exterior abierta o en corto"],
    ["CMP", "Corto en salida de compresor"],
    ["MP", "Corto bomba principal"],
    ["FP", "Corto bomba de recirculación"],
    ["RV", "Corto válvula techo"],
    ["HV", "Corto válvula suelo"],
    ["PRF", "Corto trampillas recirculación"],
    ["RB / LB", "Corto ventilación regulable derecha / izquierda"],
    ["CNDB", "Corto regulación condensador"],
    ["EVAP1 / EVAP2 / EVAP3", "Corto velocidad del evaporador"],
    ["DRF", "Corto bloqueo antivaho"],
    ["POT", "Error AutoPot"],
    ["RV MOT / HV MOT", "Sin retorno válvula motorizada techo / suelo"],
    ["CND", "Corto velocidad condensador"],
  ].map(([code, description]) => ({
    control: "Ecomaster Clima",
    code,
    description,
    source: source("MH-012", 7),
  })),
];
const notices = [
  "Las acciones B2 son una referencia del plan, no un registro de trabajo realizado. El técnico confirma aplicación según equipo y condición.",
  "El plan B2 y el listado Preventivo difieren en algunas sustituciones. Registrar el plan acordado con la flota y confirmar piezas por modelo y serie.",
  "Cargas de refrigerante, aceite, presiones, vacío y torques requieren la especificación de la unidad. El módulo no asigna límites universales.",
  "Reparación menor y mayor son categorías de organización CARLAB; el alcance técnico se registra en cada orden.",
];
const symptomGuides = [
  [
    "no_enfria",
    "No enfría",
    [
      "Guardar códigos y comprobar modo de control.",
      "Revisar alimentación, señal de alternador y transmisión del compresor.",
      "Comprobar protecciones y registrar mediciones según el equipo.",
    ],
  ],
  [
    "enfria_poco",
    "Enfría poco",
    [
      "Revisar filtros, serpentines y flujo de aire.",
      "Comparar temperatura de retorno e impulsión.",
      "Documentar fugas o restricciones antes de determinar la intervención.",
    ],
  ],
  [
    "se_corta",
    "Se corta",
    [
      "Registrar código y condiciones en que ocurre el corte.",
      "Revisar ventilación del condensador y consumo de motores.",
      "Verificar protecciones y la especificación aplicable sin puentearlas.",
    ],
  ],
  [
    "ruido",
    "Ruido o vibración",
    [
      "Revisar alineación y tensión de la transmisión.",
      "Inspeccionar poleas, baleros, soportes y tacones.",
      "Localizar el origen del ruido antes de sustituir piezas.",
    ],
  ],
  [
    "congela",
    "Se congela",
    [
      "Revisar filtro, turbinas y flujo de aire.",
      "Comprobar posición del sensor antihielo y sus códigos.",
      "Registrar temperaturas y revisar expansión según el procedimiento del equipo.",
    ],
  ],
  [
    "agua",
    "Tira agua",
    [
      "Inspeccionar bandeja y drenajes.",
      "Comprobar congelamiento y sellado.",
      "Validar que el drenaje funcione después de la atención.",
    ],
  ],
  [
    "no_ventila",
    "No ventila / poco aire",
    [
      "Revisar fusibles, alimentación y tierras.",
      "Comparar motores, turbinas y señales de ambos lados.",
      "Registrar consumos e identificar la carga afectada.",
    ],
  ],
  [
    "antivaho",
    "Falla de antivaho",
    [
      "Guardar códigos del control.",
      "Revisar sensores, trampillas y ventiladores.",
      "Comprobar válvula o motor de agua cuando aplique.",
    ],
  ],
  [
    "otro",
    "Otro / mantenimiento programado",
    [
      "Registrar motivo y antecedentes.",
      "Definir el alcance de la revisión.",
      "Usar el manual correspondiente al equipo.",
    ],
  ],
].map(([id, label, steps]) => ({
  id,
  label,
  steps,
  source: source("Guia_CARLAB", 4),
}));
const eventKinds = {
  urgencia: "Urgencia",
  extraordinario: "Evento extraordinario",
  asistencia: "Asistencia en ruta",
};
module.exports = {
  symptomGuides,
  eventKinds,
  manuals,
  types,
  intervals,
  statuses,
  templates,
  measurements,
  codes,
  notices,
};
