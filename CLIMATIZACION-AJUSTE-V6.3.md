# CARLAB AC V6.3 · Flotas, reportes y almacén independiente

Actualización acumulada para una instalación que ya tenga V6.1 o V6.2. Incluye también el QR por unidad de V6.2; no necesitas cargar ese ZIP por separado.

## Cargar en GitHub

1. Descomprime `CARLAB-AC-V6.3-FLOTAS-REPORTES-REFACCIONES.zip`.
2. Abre la carpeta `carlab-cloud-v2` y sube **su contenido a la raíz del repositorio**, conservando las rutas de `modules`, `public` y `tests`. No crees otra carpeta `carlab-cloud-v2` dentro del repositorio.
3. Reemplaza los archivos coincidentes y agrega los nuevos. Confirma los cambios y espera el despliegue habitual de Render.
4. Recarga Carlab e ingresa a Aire acondicionado. El primer acceso prepara automáticamente el almacén independiente.

No requiere paquetes nuevos ni ejecutar comandos de base de datos. El ZIP es una actualización de archivos, no un repositorio completo desde cero. Esta entrega fue probada localmente; no se ha subido ni desplegado automáticamente.

## Eliminar y recuperar unidades

**Flotas AC → abrir unidad → Eliminar unidad.**

El botón aparece directamente en la ficha, solo para admin. Se solicita el motivo y una confirmación. La unidad se retira de la flota activa, del acceso del supervisor y del QR. Sus órdenes, solicitudes e historial se conservan. La eliminación queda registrada en la bitácora.

Para recuperar: **Flotas AC → Registros: Eliminadas / archivadas → Aplicar filtros → abrir unidad → Restaurar unidad**. El QR vigente vuelve a funcionar. Los registros archivados con versiones anteriores también aparecen aquí.

Esta eliminación es recuperable, no borra definitivamente el expediente ni cambia la unidad del módulo de Flotas general. Las órdenes o solicitudes que sigan abiertas permanecen en el seguimiento y en los reportes de pendientes. El número económico queda reservado dentro de su empresa para conservar el vínculo con su historial; para reincorporarlo, restaura la unidad.

## Reportes semanales y mensuales

Nuevo apartado **Reportes AC**, tanto para admin como para Supervisor AC.

- Selecciona semana o mes y una fecha dentro del periodo. La semana abarca lunes a domingo; el mes, del primer al último día.
- Admin puede filtrar por Hispacold, Eberspächer o ambas, y por empresa.
- El supervisor solo consulta y exporta información de su marca. No recibe costos, saldos ni movimientos internos del almacén.
- Incluye resumen por empresa y marca, órdenes, solicitudes, pendientes acumulados, estado actual de unidades y mantenimientos vencidos de la flota activa.
- Admin incluye movimientos del almacén AC y refacciones en mínimo o por debajo. Al elegir una empresa, los movimientos se limitan a los asignados a esa empresa y se omiten los saldos generales. El supervisor únicamente consulta entregas correspondientes a su marca.
- Descarga un PDF formal o un CSV compatible con hojas de cálculo. La vista muestra los primeros 100 registros de cada tabla; las exportaciones incluyen todos los registros del reporte generado.

### Cómo interpretar las fechas

Las órdenes se incluyen por **fecha de servicio**. Las solicitudes y movimientos, por **fecha de registro en la zona de Mazatlán**. “Completadas del periodo” significa órdenes con fecha de servicio en el periodo que actualmente están completadas.

Los estados, semáforos, existencias y pendientes se consultan **al generar el reporte**. Los pendientes abarcan todos los periodos, para no ocultar órdenes antiguas sin cerrar. No se reconstruye cómo estaba cada registro al cierre de una semana histórica. Los registros eliminados de órdenes no se cuentan; las órdenes de unidades retiradas de la flota se conservan.

Si una consulta supera 10,000 órdenes, solicitudes o movimientos, el sistema pide acotar empresa, marca o semana. No exporta silenciosamente un reporte incompleto.

## Refacciones exclusivas de AC

**Refacciones AC** ahora utiliza tablas y movimientos propios. Crear, editar, recibir, devolver o entregar una refacción de AC ya no modifica Stock general. Se retiró la opción de vincular piezas nuevas al almacén anterior.

La primera actualización hace una copia única de las piezas que ya estaban vinculadas a AC, con sus datos, compatibilidad, fotografía y **saldo existente en ese momento**. Conserva sus identificadores para que las solicitudes pendientes puedan seguir utilizando esas piezas. Copia únicamente los movimientos históricos identificados como operaciones de AC y añade una referencia de saldo inicial; esa referencia no es una entrada nueva.

**El almacén general conserva sus piezas y saldos.** La copia inicial no representa un traslado físico ni descuenta existencias del almacén general. Desde la separación los dos saldos son independientes y no deben sumarse como si fueran un único conteo físico. Para piezas nuevas, registra su entrada en el almacén que corresponda. Los reinicios y despliegues posteriores no vuelven a copiar ni sobrescriben el saldo de AC.

Solicitar y aprobar siguen sin descontar piezas. La entrega de una solicitud aprobada descuenta una sola vez del almacén AC, con control de existencia y registro del movimiento. Las devoluciones se identifican como tales en la bitácora.

## QR incluido

**Flotas AC → abrir unidad activa → Etiqueta QR → Descargar etiqueta PDF.** Mantiene el inicio de sesión y los permisos por marca. Las órdenes técnicas incluyen el QR si coinciden con una unidad registrada. Consulta `CLIMATIZACION-AJUSTE-V6.2.md` para el uso detallado.

## Validación

Pruebas locales de servidor: eliminación/restauración con versiones y auditoría, migración única del inventario, conservación de Stock general, entregas sin duplicación ni existencias insuficientes, intervalos semanales/mensuales y año bisiesto, filtros de empresa y marca, permisos de supervisor, regresión de calendario, flotas, solicitudes, notificaciones y QR.

Pruebas de navegador: eliminación y recuperación desde la ficha, alta y entrada de refacción AC, filtros y exportación PDF/CSV, supervisor en vista móvil y ausencia de desbordamiento de la página. Revisión visual del PDF de varias páginas y de las vistas de escritorio y teléfono.

Las pruebas usan datos temporales y emulación móvil. No modifican la base de producción.

Para ejecutar las pruebas de servidor en un entorno de desarrollo con las dependencias de `tests/harness.cjs`: `node --test --test-concurrency=1 tests/ac-v63.test.cjs tests/ac-operations.test.cjs tests/ac-fleet.test.cjs tests/ac-calendar.test.cjs tests/ac-qr.test.cjs`. La prueba de navegador es `tests/ac-v63.browser.cjs` y requiere Playwright con Chrome; admite `PLAYWRIGHT_MODULE` y `QA_OUTPUT`.
