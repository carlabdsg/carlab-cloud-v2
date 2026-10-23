# CARLAB AC V6.6 · Portal visual y Supervisor de flota AC

Actualización acumulada para una instalación con V6.1, V6.2, V6.3, V6.4 o V6.5. Incluye los recambios, el selector de refacciones de las órdenes, las etiquetas QR frontales y las mejoras anteriores de Flotas AC, reportes y almacén independiente.

## Instalar

1. Descomprime `CARLAB-AC-V6.6-PORTAL-SUPERVISORES.zip`.
2. Sube **el contenido** de la carpeta `carlab-cloud-v2` a la raíz del repositorio. Reemplaza los archivos coincidentes y agrega los nuevos conservando las carpetas `modules`, `public` y `tests`.
3. Espera el despliegue habitual de Render y recarga Carlab. Conserva los PDF de recambios en `modules/hispacold/parts-documents`.

No requiere nuevas dependencias de producción ni SQL manual. Al acceder al módulo se prepara automáticamente el registro de asignaciones de supervisores. Es una actualización de archivos sobre una instalación existente, no el repositorio completo desde cero. Esta entrega no se ha subido ni desplegado automáticamente.

## Dos tipos de supervisor

| Perfil | Alcance |
| --- | --- |
| Supervisor de marca AC | Las empresas con unidades de su marca asignada: Hispacold o Eberspächer. Conserva el alcance de los usuarios existentes. |
| Supervisor de flota AC | Una empresa asignada y sus registros de climatización, tanto Hispacold como Eberspächer. No consulta otras empresas. |

Ambos pueden consultar sus unidades, órdenes, reportes y calendario, además de solicitar servicios y refacciones. No crean ni editan órdenes, administran existencias, registran unidades ni consultan la biblioteca técnica o los documentos originales de recambios. La creación y administración siguen a cargo de Carlab.

Los perfiles usan el acceso existente de Supervisor AC para mantener el inicio de sesión y su aislamiento del resto del sistema. No se convierten en supervisores del módulo general de Flotas.

## Crear un Supervisor de flota AC

**Admin → Aire acondicionado → Accesos Supervisor AC → Supervisores de flota AC → + Supervisor de flota AC.**

1. Registra nombre, correo y contraseña.
2. Selecciona la empresa de la flota. Debe existir previamente en **Flotas AC → Empresas**.
3. Guarda el acceso. El usuario entra por el inicio de sesión habitual y abre su portal de AC.

En el mismo apartado puedes crear un Supervisor de marca AC, seleccionando su marca. Al editar un usuario puedes cambiar su tipo, empresa o marca, restablecer su contraseña o desactivarlo. Cambiar la asignación aplica a las siguientes consultas del servidor; el portal verifica cambios de acceso al actualizar las notificaciones y recarga si detecta una asignación distinta.

Los usuarios de marca ya existentes conservan su funcionamiento sin tener que recrearlos.

## Navegación del portal

El menú principal se reduce a **Inicio, Flotas, Seguimiento y Reportes**. En teléfono aparece fijo en la parte inferior; las notificaciones permanecen en la campanita.

### Inicio

Cuatro indicadores que abren la información correspondiente: unidades operativas, unidades que requieren atención, mantenimientos vencidos y solicitudes pendientes. Debajo aparecen las primeras prioridades y los servicios de los próximos siete días, con accesos a la flota completa y al calendario.

Los indicadores usan los registros disponibles, no mediciones en vivo del equipo. Las solicitudes pendientes incluyen también las de unidades sin registro en la flota. El calendario conserva el seguimiento por empresa, unidad y marca de AC.

Para facilitar la lectura, las listas de Inicio muestran hasta cinco casos en computadora y tres en teléfono. Las tarjetas destacadas muestran hasta tres empresas en computadora y una en teléfono. **Flotas**, **Ver todas**, **Ver mis flotas** y **Abrir calendario** permiten consultar el resto.

### Flotas

Primero se muestran tarjetas de empresas con la distribución de estados. Al elegir una empresa aparecen sus autobuses, número económico, marca de AC y motivo principal del semáforo. Los filtros adicionales y la exportación están dentro de **Buscar y filtrar unidades**.

La ficha mantiene sus acciones de solicitar servicio o refacción. Los datos técnicos se despliegan al abrir **Datos de la unidad y del equipo AC**; órdenes, solicitudes y bitácora conservan sus pestañas. Se mantiene el botón de cierre visible.

La lógica del semáforo no cambia: verde significa evaluación vigente sin alertas; amarillo, seguimiento; rojo, atención crítica; gris, sin evaluación vigente. Los vencimientos y pendientes pueden determinar el estado aunque todavía falte una evaluación manual.

### Seguimiento

Las solicitudes muestran una línea de avance basada en su estado registrado, la respuesta de Carlab y el acceso a la orden vinculada. Una orden abierta no se presenta como trabajo iniciado: se distingue de **En atención** y **Finalizada**. Las solicitudes rechazadas o canceladas se identifican explícitamente.

Desde aquí se consultan también todas las órdenes autorizadas y el catálogo para solicitar refacciones. Las solicitudes de servicio y refacciones conservan sus estados y procedimientos actuales; la nueva presentación no cambia por sí sola ningún estado.

### Solicitar atención

Un botón permite elegir **Servicio** o **Refacción**. Al solicitar desde un autobús se completan empresa, unidad y marca. El Supervisor de flota AC tiene su empresa fija. Si selecciona una unidad conocida, se carga su marca de AC.

Ubicación, contacto y fecha preferida quedan en un apartado opcional desplegable. Se conserva la evidencia fotográfica y la captura de piezas fuera de catálogo.

### Reportes y calendario

Conservan su funcionamiento, con la información limitada al alcance del usuario. El Supervisor de flota AC consulta y exporta su empresa, incluso si cambia los filtros o intenta acceder mediante un enlace de otra empresa. El calendario está disponible desde Inicio y Flotas.

## Permisos y validación

La restricción por empresa se aplica en el servidor a listados, fichas, órdenes, solicitudes, historial, calendario, reportes, exportaciones, notificaciones y resolución de QR. No depende de ocultar botones. Los enlaces a órdenes vinculadas verifican la coincidencia de empresa, unidad y marca.

Pasaron 49 pruebas de servidor en la validación de regresión y permisos. Se verificaron adicionalmente los ajustes finales de asignación, cuentas inactivas, empresa obligatoria y reintentos de solicitudes después de cambiar el acceso.

Pasaron las pruebas de navegador del nuevo portal y del flujo de QR: creación de usuario desde admin, navegación por empresa, ambas marcas dentro de la misma empresa, llenado de solicitudes, seguimiento vinculado, calendario, exportación limitada a la empresa y vistas de computadora y teléfono emulado. Se revisaron visualmente las pantallas con datos de prueba.

Pruebas nuevas: `tests/ac-portal.test.cjs` y `tests/ac-portal.browser.cjs`. Usan el entorno de `tests/harness.cjs`; la prueba visual requiere Playwright y Chrome y admite `PLAYWRIGHT_MODULE` y `QA_OUTPUT`. Las pruebas no modifican la base de producción.
