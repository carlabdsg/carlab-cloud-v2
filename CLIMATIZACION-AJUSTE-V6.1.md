# CARLAB AC V6.1 · Preventivos por periodo

Actualización sobre V6. Conserva la captura guiada y el formato técnico del reporte. Corrige el alcance de las listas de mantenimiento preventivo según la marca y el periodo seleccionado.

## Qué se corrigió

La captura anterior utilizaba la matriz general B2 de Hispacold (con más de 30 verificaciones mensuales) y añadía puntos generales de recepción y entrega. Ahora utiliza las tablas específicas por periodo del documento **Mantenimiento Preventivo_111756.pdf**, páginas 2–6. No se trata de ocultar casillas obligatorias: la lista que se muestra, se valida, se guarda y aparece en el reporte corresponde al periodo seleccionado.

| Hispacold | Actividades | Página |
|---|---:|---:|
| Mensual | 4 | 2 |
| Trimestral | 7 | 3 |
| Semestral | 9 | 4 |
| Anual | 14 | 5 |
| Bianual (cada 2 años) | 15 | 6 |

Las cuatro actividades mensuales son revisión general y funcionamiento, limpieza de bandeja del evaporador, limpieza del motor y turbinas, y limpieza de nodos, sensores, placa de fusibles y conectores. **La revisión general sigue siendo una actividad real**, no una aprobación automática ni una eliminación de la inspección del equipo. Los hallazgos se registran en observaciones y diagnóstico. El número de actividades no equivale al número de componentes físicos que se inspeccionan.

Se contrastaron las tablas con **Plan MTTO Hispacold.DOCX_093305.pdf** y **Mtto Hispacold Anual.pdf**. Estos documentos presentan alcances y algunas referencias diferentes. La captura por periodo sigue las tablas específicas de Mantenimiento Preventivo_111756, conservando los otros documentos como consulta. No se mezclan indiscriminadamente ambos alcances ni se asignan cantidades universales de aceite o refrigerante. Confirmar modelo, referencias y procedimiento al realizar el servicio.

Eberspächer utiliza exclusivamente la página 15 del manual **ilide.info-manual-ac-188dd-1-pr_3750c01509323902f8aa56426381e166.pdf**:

| Eberspächer AC-188DD | Actividades |
|---|---:|
| A · Semanal | 2 |
| B · Mensual | 5 |
| C · Trimestral | 9 |
| D · Semestral | 13 |
| E · Anual | 19 |

El mensual B no incorpora automáticamente el semanal A. C incluye B; D incluye C; E incluye D, tal como indica el manual. Las comprobaciones repetidas de aceite y bandas se muestran una sola vez. No se añade un plan bianual a Eberspächer porque no figura en el documento consultado. La revisión anual se reserva al personal especialista indicado por el manual.

## Funcionamiento

- Elegir el periodo en Recepción; Diagnóstico muestra el nombre del plan, número de actividades y acceso a su página del manual.
- Al cambiar el periodo se carga su alcance y se conservan notas y resultados de actividades comunes.
- Si el cambio eliminaría una revisión ya capturada o una foto asociada, se conserva el periodo anterior y se explica el motivo.
- Las acciones y resultados nunca se marcan automáticamente como realizados.
- El servidor verifica la misma lista que ve el usuario; no exige puntos de otro periodo para cerrar.
- Las órdenes nuevas derivadas de solicitudes AC también usan el plan actualizado.

## Órdenes anteriores

Los borradores del formulario actual que no tienen revisiones capturadas ni fotos asociadas a puntos adoptan la lista corregida al abrirse. Las órdenes con resultados, acciones, notas de revisión o fotos asociadas conservan el plan anterior y muestran un aviso, para no borrar trabajo documentado. Para otro alcance, crear una nueva orden.

Los expedientes cerrados, las órdenes antiguas de otros formularios y las reparaciones mantienen su información. Se protege también en el servidor contra cambios que intenten eliminar revisiones anteriores o degradar la versión del nuevo plan. No se requiere migración de base de datos.

## Instalación

1. Descomprimir `CARLAB-AC-V6.1-PREVENTIVOS-POR-PERIODO.zip`.
2. Abrir la carpeta `carlab-cloud-v2` del ZIP.
3. En GitHub, subir **su contenido** a la raíz del repositorio, conservando las carpetas `modules`, `public` y `tests`. No subir el ZIP ni crear una carpeta adicional dentro del repositorio.
4. Incluir todos los archivos: esta actualización cambia tanto la captura como la validación del servidor. El archivo nuevo `modules/hispacold/periodic-plans.js` es necesario.
5. Confirmar los cambios, esperar el despliegue habitual de Render y recargar el módulo.

## Verificación

43 pruebas automatizadas de planes, reglas del formulario y operaciones AC aprobadas. Después del ajuste final de etiquetas de acciones, las 12 pruebas específicas de periodicidades volvieron a pasar.

Prueba de navegador aprobada: diez periodicidades entre ambas marcas, referencias a las páginas correctas, cambio de periodo y conservación de notas, protección de revisiones capturadas, guardado y reapertura, cierre mensual con cuatro actividades, descarga de reporte técnico, actualización de borradores vacíos y conservación de órdenes anteriores con resultados.

Prueba rápida tras instalar: crear preventivo Hispacold mensual, entrar a Diagnóstico y comprobar **4 actividades**. Cambiar a anual antes de capturar revisiones y comprobar **14**. Guardar, volver a abrir y confirmar que se conserva el periodo.
