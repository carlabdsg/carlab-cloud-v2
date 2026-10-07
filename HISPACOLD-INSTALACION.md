# CARLAB Cloud · Módulo de aire acondicionado

Paquete preparado sobre `main`, commit `fd61885` (11 de julio de 2026).

## Cargar a GitHub y Render

1. Descomprime el ZIP.
2. Abre `carlabdsg/carlab-cloud-v2` en GitHub. Sube el contenido de la carpeta `carlab-cloud-v2` a la raíz del repositorio, conservando las subcarpetas `public`, `modules` y `tests`. No subas la carpeta contenedora como otro nivel.
3. Confirma los cambios. Si Render tiene despliegue automático para esa rama, espera el deploy; de lo contrario usa **Manual Deploy → Deploy latest commit**.
4. Mantén las variables y comandos actuales. `npm start` sigue cargando `agenda-runtime.js`; no requiere nuevas dependencias de producción ni otra base de datos.
5. Inicia sesión como administrador y recarga la página. En el menú aparece **Aire acondicionado**. También puedes entrar a `/hispacold.html`.

Solo se agregaron un registro del módulo en `server.js` y un script de navegación en ambos `index.html`. Los demás archivos existentes se incluyen sin cambios. No borres archivos existentes ni restaures una base de datos. Si el repositorio cambió después del commit indicado, aplica los archivos nuevos y las cinco líneas de integración descritas en `modules/hispacold/README.md` en lugar de reemplazar esa versión más reciente.

## Importar los manuales de tu Escritorio

El repositorio de GitHub es público. El ZIP de código no incluye los PDF originales ni documentos fiscales.

1. Abre **Aire acondicionado → Biblioteca técnica → Importar manuales**.
2. Selecciona los PDF de la carpeta **Escritorio/Hispacold**. Puedes seleccionar todos a la vez.
3. El sistema reconoce 34 documentos técnicos y referencias por su contenido y los guarda en PostgreSQL. Los dos PDF de información fiscal e instalaciones no están catalogados y se omiten.
4. Al terminar, el botón **Consultar PDF** queda habilitado. Los archivos se conservan tras reinicios y despliegues, y solo un administrador activo puede consultarlos.

Puedes repetir la importación sin duplicar documentos. Los manuales con un contenido distinto al original se rechazan para evitar asociarlos a una referencia incorrecta.

## Trabajar con las órdenes

- **Nueva orden:** revisión, mantenimiento preventivo, reparación menor o reparación mayor.
- **Recepción:** selecciona una unidad existente o registra una unidad externa, cliente, equipo, serie, síntomas y técnico.
- **Lista de revisión:** registra acción V/R/S/L, resultado y observaciones. Para Hallazgo y No aplica escribe el motivo.
- **Mediciones:** datos antes/después, condiciones de prueba e intervención en circuito frigorífico.
- **Trabajo y evidencia:** diagnóstico, autorización, trabajo, conceptos e importes en MXN y hasta 8 fotos.
- **Entrega:** prueba funcional, condición de entrega, próximos servicios, pendientes y firmas opcionales.
- **Guardar orden:** conserva el estado seleccionado. El cierre exige información completa y checklist resuelto; una reparación mayor exige autorización y referencia técnica.
- **Consultar:** historial por empresa/unidad/folio/técnico, filtros y exportación CSV. Cada expediente permite descargar JSON o **Imprimir / PDF**; en el cuadro de impresión selecciona **Guardar como PDF**.
- Una orden completada o cancelada se reabre con un motivo. Los cambios quedan en la bitácora; no hay borrado de órdenes.

La fecha de próximo servicio es un recordatorio dentro de este módulo, no crea citas en Agenda. Los costos registrados no descuentan stock ni generan cargos en Cobranza. Las órdenes de climatización tienen folios HC y tablas propias. Los otros perfiles y módulos mantienen sus flujos actuales.

## Referencias técnicas

Se transcribieron las acciones por periodicidad del Plan B2 (página 1) y se organizaron los formatos con la Hoja de Servicio y la Guía CARLAB. Los códigos de Basic y Ecomaster Clima identifican su manual y página. Las categorías menor/mayor son organizativas CARLAB.

La documentación no fija valores universales de carga, presión, vacío, torque, amperaje o aceite. Se registra la especificación aplicable a cada equipo; no se autocompletan valores de aceptación. La referencia de garantía se consulta como documento, sin asumir vigencia ni cobertura automática.

## Validación realizada

Pruebas de API con PostgreSQL embebido: permisos, guardado de los cuatro tipos, validación, folios, importes, cierre, reapertura, control de versiones y acceso privado a PDF. Prueba en navegador: captura, unidad de flota, checklist, fotos, firma, reporte imprimible y vistas de escritorio/móvil.

El ZIP fue probado localmente. No se ha aplicado en producción desde esta conversación.
