# CARLAB AC V6.4 · Recambios y selección guiada en órdenes

Actualización acumulada para una instalación con V6.1, V6.2 o V6.3. Incluye el QR por unidad, eliminación recuperable de unidades, reportes semanales y mensuales y almacén exclusivo de AC de las entregas anteriores.

## Cargar en GitHub

1. Descomprime `CARLAB-AC-V6.4-RECAMBIOS-Y-ORDENES.zip`.
2. Abre la carpeta `carlab-cloud-v2` y sube **su contenido a la raíz del repositorio**, conservando las carpetas `modules`, `public` y `tests`. Reemplaza los archivos coincidentes y agrega los nuevos. No crees una segunda carpeta `carlab-cloud-v2` dentro del repositorio.
3. Incluye los 11 PDF de `modules/hispacold/parts-documents`. Deben permanecer en esa ruta; no los muevas a `public`.
4. Confirma los cambios y espera el despliegue habitual de Render. Recarga Carlab e ingresa a Aire acondicionado: el primer acceso importa las referencias automáticamente.

No requiere paquetes de producción nuevos ni ejecutar SQL manualmente. Este ZIP actualiza una instalación existente; no es el repositorio completo. La entrega se probó localmente y no se ha desplegado en producción.

## Cómo llenar las refacciones de una orden

**Orden → Paso 3: Intervención → ¿Se utilizaron refacciones o materiales? → Buscar refacciones / sugerencias.**

1. El selector toma la marca y el periodo de mantenimiento de la orden. Si la orden viene de una unidad de Flotas AC, también recibe su marca de chasis.
2. Para mantenimiento semestral o anual Hispacold, confirma MAN, Mercedes-Benz, Scania o Volvo.
3. Revisa el paquete sugerido y pulsa **Seleccionar piezas del paquete**, o marca solamente las piezas que necesitas. Ajusta las cantidades antes de agregarlas.
4. Pulsa **Agregar a la orden**. Los conceptos quedan en el llenado habitual, donde puedes revisar sus importes, modificarlos o quitarlos.

La búsqueda adicional permite localizar piezas por referencia o nombre y filtrar por Efficient, recambios, cotizaciones o piezas propias. El catálogo se puede desplegar cuando necesitas otra refacción. Se conserva **Concepto manual** para trabajos o materiales que no estén catalogados.

Las referencias ya incluidas no se duplican al abrir otra vez el selector. Cambiar el periodo de mantenimiento conserva los conceptos que ya capturaste: revisa si siguen correspondiendo al trabajo. Agregar refacciones no marca revisiones como realizadas ni descuenta inventario.

## Qué se incorporó

- 133 referencias únicas, agrupando las apariciones de una misma referencia en los documentos entregados.
- 9 paquetes documentales: trimestral, cuatro semestrales y cuatro anuales por chasis.
- Los dos catálogos y las nueve cotizaciones originales, con acceso al documento y página desde las refacciones.
- Identificación del origen de la referencia en Refacciones AC y en los conceptos agregados a la orden.
- Un selector adaptable a teléfono y computadora, con cierre visible, cantidades editables y botón de agregar fijo en la parte inferior.

Los paquetes son sugerencias de las cotizaciones suministradas y requieren confirmar la aplicación al equipo. No se consideran compatibles con todos los equipos Hispacold por tener la misma marca. Los filtros Efficient facilitan encontrar su catálogo sin sustituir automáticamente referencias de otros equipos.

No hay un paquete documentado mensual ni bianual en estas cotizaciones. Esos periodos conservan la búsqueda y captura de refacciones necesarias, sin copiarles el paquete trimestral o anual. Las listas de revisiones de mantenimiento existentes no se modifican.

## Cantidades y referencias que requieren revisión

- `9000061-R`: la cantidad 1 representa un **juego de 6 filtros para Irizar PB**, no seis juegos.
- Banda de Mercedes-Benz sin referencia en la cotización: no se elige una banda del catálogo por suposición. Confirma la referencia y agrégala manualmente.
- Gas R-134a: la cotización no especifica la unidad de medida de su cantidad. No se convierte en kilogramos ni se toma como carga del sistema. Se captura manualmente con cantidad y unidad verificadas.
- Banda MAN `3150423-N`: confirma la variante indicada para el equipo antes del suministro.
- La referencia `40501669` conserva los ocho dígitos impresos en el catálogo Efficient; confirma la referencia con el proveedor antes de solicitarla.
- Los sufijos y referencias distintas se conservan separados. No se asumen equivalencias entre referencias con y sin `-N`.
- Mano de obra y misceláneos se eligen individualmente. Las horas de la cotización son referencia y se ajustan a la intervención realizada.

## Precios y almacén

Los precios documentales en USD se muestran solo como referencia. **No se convierten ni se copian automáticamente a los importes MXN de la orden.** Si una pieza ya tiene precio de venta configurado en el almacén AC, el selector utiliza ese importe MXN.

Las referencias nuevas se crean con existencia, costo y precio de venta en cero. Configura los precios y registra las entradas físicas antes de utilizarlos como importes definitivos o existencias disponibles. El catálogo no representa mercancía recibida.

La importación reutiliza una pieza existente de AC cuando coincide exactamente su referencia y está asignada a Hispacold. Conserva sus datos, precios y saldos. Se ejecuta una sola vez: los reinicios no vuelven a sobrescribir las ediciones del administrador. No modifica Stock general.

Agregar piezas a una orden no genera salidas. La entrega de solicitudes mantiene el procedimiento del almacén AC. Las piezas sin mínimo configurado no se muestran como alerta de reposición; configura un mínimo mayor que cero cuando quieras seguimiento de bajo inventario.

## Accesos

El selector de órdenes y los documentos originales están disponibles para admin. Los supervisores conservan sus permisos de consulta y solicitudes, sin acceso a estos documentos ni a la creación de órdenes. Los filtros y restricciones por marca siguen vigentes.

Las órdenes Eberspächer buscan las refacciones asignadas a esa marca en el almacén AC; no reciben paquetes Hispacold. Esta actualización no añade documentos Hispacold a la biblioteca del supervisor.

## Validación

Pasaron 50 pruebas de servidor: datos y documentos, importación única, conservación de saldos y precios, separación de marcas, permisos, paquetes por periodo y chasis, guardado de procedencia, órdenes, intervalos, flotas, solicitudes y reportes.

También pasó la prueba de navegador con selección de paquetes, edición de cantidades, guardado, prevención de duplicados, búsqueda Efficient, acceso a documentos y vista de teléfono con cierre visible. Se utilizaron datos temporales y emulación móvil, sin modificar producción.

Pruebas de desarrollo: `node --test --test-concurrency=1 tests/ac-official-parts.test.cjs tests/ac-operations.test.cjs tests/ac-v63.test.cjs tests/ac-periodic.test.cjs tests/hispacold-v3.test.cjs`. Requieren las dependencias de `tests/harness.cjs`. La prueba `tests/ac-official-parts.browser.cjs` requiere Playwright y Chrome; admite `PLAYWRIGHT_MODULE` y `QA_OUTPUT`.
