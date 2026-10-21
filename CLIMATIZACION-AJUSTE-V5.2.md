# CARLAB · Ajuste V5.2 · Cierre visible y calendario dinámico

Actualización del 21 de octubre de 2026 sobre V5.1.

## Cambios

### X siempre visible en la ficha

Las ventanas de Flotas AC tienen una barra superior con una X de cierre de 44 × 44 píxeles. El contenido se desplaza dentro de la ventana; la barra y la X permanecen visibles, también en celular. Se conserva el cierre con Escape y la protección mientras se está guardando un formulario.

### Próximos servicios en calendario

Administrador y Supervisor AC usan el nuevo calendario:

- Navegación por mes, selector directo de mes y botón Hoy.
- Días con número de servicios y distinción visual entre vencidos, hoy y programados.
- Selección de día para consultar sus unidades en el panel de servicios; en celular se desplaza al panel seleccionado.
- Indicadores para vencidos, próximos siete días —incluido hoy— y mes visible.
- Filtro por empresa y búsqueda de unidad/base. Admin puede filtrar por marca; el supervisor solo ve la suya.
- Acceso al antecedente y a la ficha de Flotas AC cuando existe.
- Solicitud de servicio prellenada con empresa, unidad, marca y fecha preferida. Para fechas vencidas se propone hoy.
- Admin puede iniciar una nueva orden desde el antecedente mediante el flujo existente de registro de servicios.
- Consulta automática cada 30 segundos cuando la pantalla está visible, sin interrumpir formularios ni ventanas abiertas. También incluye botón Actualizar.
- Agenda paginada de 20 registros, con conteos completos por día. No hay un recorte oculto a los primeros 100 servicios.

## Qué fechas aparecen

Se utiliza una sola fecha vigente por empresa, número económico y marca, con las reglas actuales del seguimiento de mantenimiento:

1. La última orden completada de mantenimiento que define o sustituye la programación.
2. Si todavía no existe ese antecedente, se utiliza el próximo servicio inicial registrado en Flotas AC.

La nueva programación reemplaza la anterior; no se duplica. Un preventivo completado sin fecha siguiente puede limpiar la programación anterior, igual que en el seguimiento existente. Una intervención sin nueva programación conserva el mantenimiento pendiente según esas reglas.

Las unidades archivadas en Flotas AC no aparecen en este calendario. Las órdenes canceladas o en papelera no se usan como antecedentes vigentes. Las fechas son de seguimiento de mantenimiento y no modifican ni crean citas en la Agenda general.

Se conserva la biblioteca técnica exclusiva para admin.

## Instalación desde GitHub

1. Descomprime `CARLAB-AC-V5.2-CALENDARIO-Y-CIERRE.zip`.
2. Carga el contenido de su carpeta `carlab-cloud-v2` en la raíz del repositorio existente, sustituyendo los archivos incluidos y conservando las rutas `modules/`, `public/` y `tests/`.
3. Confirma el commit y espera el despliegue de Render. Si el despliegue automático está desactivado, despliega el último commit desde Render.
4. Recarga las pestañas abiertas de Carlab. En Safari: Opción + Comando + R.

Es un ajuste sobre V5.1, no un repositorio completo. No requiere dependencias, variables de entorno ni importación de manuales. No modifica el esquema de la base de datos.

## Validación

Pruebas locales de permisos, operaciones, flotas y calendario. Incluyen empresa con ambas marcas, cambio de marca del usuario, sustitución de fechas, años bisiestos, vencimientos, filtros y un día con 101 servicios para comprobar conteos y paginación.

Revisión de navegador en computadora y celular: X visible después de bajar al final de la ficha, cierre efectivo, calendario sin desbordamiento horizontal, selección de día/mes, filtros, solicitudes prellenadas y apertura del formulario de nueva orden para admin.

Esta entrega está lista para cargar a GitHub; no se ha desplegado en producción desde este chat.
