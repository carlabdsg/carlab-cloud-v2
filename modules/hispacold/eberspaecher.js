"use strict";

// Only the AC-188DD / KL2 references supplied with this installation are used.
// Hispacold service actions and numeric codes must never populate this catalog.
const manuals = require("./eberspaecher-manuals.json");
const manualId = "2dd0f21c86a4d8d4";
const source = (page) => ({ manualId, page });
const intervals = { semanal: 0, mensual: 1, trimestral: 3, semestral: 6, anual: 12 };
// Monthly values retain the legacy catalog shape; a weekly interval is 7 days,
// never a fractional month. Consumers should prefer intervalDays when present.
const intervalDays = { semanal: 7 };
const intervalLabels = {
  semanal: "A · Semanal",
  mensual: "B · Mensual",
  trimestral: "C · Trimestral",
  semestral: "D · Semestral",
  anual: "E · Anual",
};
const check = (id, group, label, page, actions = {}) => ({
  id: `eber-${id}`, group, label, actions, source: source(page),
});
const plan = (id, group, label, values) => check(
  `plan-${id}`, group, label, 15,
  Object.fromEntries(Object.keys(intervals).map((key, i) => [key, values.split(" ")[i]])),
);
// V = verificar, R = realizar/limpiar, S = sustituir según el plan aplicable.
// These are proposed actions, never automatic acknowledgements of work done.
// Page 15 makes C include B, D include C and E include D. Recurring A checks
// remain available on the longer services so the technician can confirm them.
const maintenance = [
  plan("filtros", "A · Aire y ventilación", "Limpiar las mallas del filtro de retorno", "R R R R R"),
  plan("motores", "A · Aire y ventilación", "Comprobar motores del evaporador y condensador", "V V V V V"),
  plan("mirillas", "B · Inspección mensual", "Revisar mirillas de refrigerante y humedad en las condiciones del manual", "- V V V V"),
  plan("bandas", "B · Inspección mensual", "Revisar tensión y desgaste de bandas del compresor", "- V V V V"),
  plan("aceite", "B · Inspección mensual", "Revisar nivel y condición del aceite", "- V V V V"),
  plan("fugas", "B · Inspección mensual", "Comprobar mangueras, conexiones y posibles fugas; realizar prueba de enfriamiento", "- V V V V"),
  plan("filtros-condicion", "B · Inspección mensual", "Evaluar sustitución del deshidratador por humedad y filtros de retorno por condición", "- V V V V"),
  plan("embrague", "C · Inspección trimestral", "Revisar funcionamiento del embrague y calibración del plato de arrastre", "- - V V V"),
  plan("drenes", "C · Inspección trimestral", "Comprobar y limpiar drenajes obstruidos", "- - R R R"),
  plan("serpentines", "C · Inspección trimestral", "Revisar serpentines y aletas del evaporador y condensador; limpiar según condición", "- - R R R"),
  plan("lavado", "D · Inspección semestral", "Limpiar serpentines y ventiladores según el procedimiento aplicable", "- - - R R"),
  plan("bulbo", "D · Inspección semestral", "Comprobar sujeción del bulbo de la válvula de expansión", "- - - V V"),
  plan("sujecion", "D · Inspección semestral", "Revisar tornillería, piezas desgastadas y lubricación de polea tensora", "- - - V V"),
  plan("acidez", "E · Inspección anual", "Comprobar acidez del aceite del compresor", "- - - - V"),
  plan("cambio-aceite", "E · Inspección anual", "Registrar cambio de aceite y filtro deshidratador conforme al plan", "- - - - S"),
  plan("protecciones", "E · Inspección anual", "Verificar función de interruptores de alta y baja presión", "- - - - V"),
  plan("compresor", "E · Inspección anual", "Revisar compresor, capacidad, montaje, mangueras y sellos", "- - - - V"),
  plan("funciones", "E · Inspección anual", "Comprobar enfriamiento, ventilación y, si equipa, calefacción y aire fresco", "- - - - V"),
];
const diagnosis = [
  check("rev-identificacion", "Diagnóstico", "Confirmar equipo y control; registrar síntoma o indicador observado", 11),
  check("rev-causa", "Diagnóstico", "Evaluar el componente afectado con la guía correspondiente", 53),
  check("rev-resultado", "Resultado", "Registrar resultado de la prueba de funcionamiento y pendientes", 49),
];
const repair = [
  check("rep-causa", "Diagnóstico", "Identificar causa y componente a reparar", 53),
  check("rep-trabajo", "Intervención", "Registrar trabajo y piezas compatibles con modelo y serie", 11),
  check("rep-prueba", "Validación", "Comprobar funcionamiento después de la reparación", 49),
];
const major = [
  check("may-procedimiento", "Reparación mayor", "Confirmar procedimiento y especificación aplicable al equipo", 44),
  check("may-circuito", "Circuito intervenido", "Cuando aplique, registrar recuperación, hermeticidad, vacío, aceite y carga", 46),
];
const templates = [
  { id: "revision", name: "Revisión y diagnóstico", checklist: diagnosis },
  { id: "preventivo", name: "Mantenimiento preventivo", checklist: maintenance },
  { id: "menor", name: "Reparación menor", checklist: repair },
  { id: "mayor", name: "Reparación mayor", checklist: [...repair, ...major] },
  { id: "express", name: "Servicio express", checklist: [
    check("exp-evento", "Atención express", "Evaluar el evento y registrar el diagnóstico", 53),
    check("exp-trabajo", "Atención express", "Documentar atención realizada y pendientes", 49),
    check("exp-prueba", "Atención express", "Comprobar resultado y condición de entrega", 49),
  ] },
].map((template) => ({ ...template, version: 1, source: source(template.id === "preventivo" ? 15 : 49) }));

const symptomGuides = [
  ["no_enfria", "No enfría / compresor no arranca", 53, [
    "Registrar modo del control KL2 e indicadores presentes.",
    "Comprobar alimentación, fusibles, continuidad y funcionamiento del embrague.",
    "Identificar la causa de una protección activa antes de intervenir.",
  ]],
  ["enfria_poco", "Enfría poco", 54, [
    "Revisar limpieza y flujo de aire del evaporador y condensador.",
    "Registrar temperaturas y presiones con la especificación del equipo.",
    "Evaluar expansión y rendimiento del compresor según el diagnóstico.",
  ]],
  ["se_corta", "Arranca y se detiene", 53, [
    "Registrar las condiciones del corte y los indicadores del control.",
    "Identificar si actúa la protección de alta o baja presión.",
    "Revisar ventilación, restricciones y posibles fugas según el circuito afectado.",
  ]],
  ["ruido", "Ruido o vibración", 55, [
    "Localizar el origen del ruido y revisar soportes y tornillería.",
    "Comprobar bandas, alineación y embrague del compresor.",
    "Registrar hallazgos antes de determinar sustituciones.",
  ]],
  ["agua", "Tira agua", 15, [
    "Revisar bandeja y drenajes del evaporador.",
    "Retirar obstrucciones con el procedimiento aplicable.",
    "Comprobar el drenaje después de la atención.",
  ]],
  ["no_ventila", "No ventila / poco aire", 20, [
    "Revisar filtros y funcionamiento de ventiladores.",
    "Comprobar fusibles, conexiones y alimentación del circuito afectado.",
    "Consultar el diagrama de la versión instalada y registrar el resultado.",
  ]],
  ["control_kl2", "Indicador de taller, batería o CAN", 36, [
    "Registrar o fotografiar el símbolo y si permanece fijo o parpadea.",
    "Identificar control KL2 y revisar la referencia del indicador.",
    "Guardar el diagnóstico antes de realizar cambios o reinicios.",
  ]],
  ["fuga", "Posible fuga de refrigerante", 17, [
    "Localizar e identificar la posible fuga antes de definir la reparación.",
    "Documentar el punto intervenido y la comprobación de hermeticidad.",
    "Registrar los trabajos sobre el circuito y su prueba final cuando corresponda.",
  ]],
  ["otro", "Otro / mantenimiento programado", 15, [
    "Confirmar modelo, motivo y alcance del servicio.",
    "Seleccionar el plan A, B, C, D o E cuando corresponda.",
    "Registrar únicamente las actividades realmente verificadas o realizadas.",
  ]],
].map(([id, label, page, steps]) => ({ id, label, steps, source: source(page) }));

// KL2 uses display indicators here, not the Basic/Ecomaster codes of Hispacold.
const codes = [
  ["Taller fijo", "Indicador de problema de clima o sensor; revisar sensores y cableado según diagnóstico.", 36],
  ["Taller intermitente", "Indicador de error de la unidad de aire acondicionado; leer y documentar el diagnóstico.", 41],
  ["Batería", "Advertencia de alimentación baja. Confirmar medición, condición de operación y especificación del control.", 36],
  ["CAN", "El control no tiene comunicación con al menos un nodo CAN; identificar el nodo afectado mediante diagnóstico.", 36],
].map(([code, description, page]) => ({
  control: "KL2 / Klimatlogic 2", code, description, kind: "indicador",
  source: source(page), relatedSource: { manualId: "e3ab20ee12ae24ab", page: 1 },
}));

const notices = [
  "Las referencias disponibles corresponden a AC-188DD y control KL2. Confirmar la placa y versión del equipo antes de aplicar el procedimiento.",
  "El plan A-E procede de la página 15 del manual. Las acciones propuestas no confirman trabajo realizado; el técnico registra su aplicación.",
  "El manual describe baja tensión en contextos distintos en las páginas 36 y 38. No se asignan límites automáticos de voltaje, presiones, aceite, carga o torque.",
  "El archivo de códigos contiene varios fabricantes: para Eberspächer solo aplica la sección Klimatlogic 2 de la página 1. No usar códigos de otras marcas.",
];

module.exports = {
  brand: "eberspaecher", label: "Eberspächer", models: ["AC-188DD"], controls: ["KL2 / Klimatlogic 2"],
  planName: "AC-188DD · Plan A-E", manuals, templates, intervals, intervalDays, intervalLabels,
  symptomGuides, codes, notices,
};
