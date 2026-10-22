# CARLAB AC V6.2 · QR por unidad

Actualización sobre V6.1 para acceder al expediente de aire acondicionado de cada unidad mediante QR.

## Uso

1. Entrar como admin a **Flotas AC** y abrir una unidad activa.
2. Pulsar **Etiqueta QR** y **Descargar etiqueta PDF**.
3. Imprimir la etiqueta al tamaño original (10 × 14 cm; QR de 6 cm) y colocarla en una superficie protegida. Se puede volver a descargar para reimprimir el mismo código.
4. Escanear con la cámara del teléfono. Si no hay sesión, iniciar sesión; el sistema regresa a la unidad escaneada.

Admin puede consultar la ficha, crear una orden con empresa, unidad y marca precargadas, y solicitar atención o refacciones. El supervisor consulta solamente las unidades permitidas por su marca y puede enviar solicitudes; no puede crear órdenes ni administrar códigos.

Los códigos se generan automáticamente al registrar unidades. Las unidades existentes obtienen su código al abrir la etiqueta o descargar un reporte de una orden coincidente. El código es estable entre visitas y servicios; no es una contraseña y no sustituye los permisos del usuario.

## Reporte técnico

Los PDF descargados incluyen el QR en el encabezado cuando la orden corresponde a una unidad activa de Flotas AC, por empresa, número económico y marca. El QR también es un enlace clicable. El cuerpo del reporte conserva su información técnica y no se agrega una página exclusiva para el QR.

Una orden sin unidad coincidente en Flotas AC sigue generando su reporte. No se crea una unidad automáticamente a partir del texto de la orden. Los PDF descargados anteriormente no cambian: descargar de nuevo para incorporar el código.

## Reimpresión y reemplazo

- Para una etiqueta dañada, descargar e imprimir otra copia del mismo QR.
- Para invalidar un código: abrir Etiqueta QR, desplegar **Reemplazar un código perdido o comprometido**, indicar el motivo y generar uno nuevo.
- El código anterior deja de funcionar, incluidas etiquetas y reportes ya impresos. Los nuevos PDF utilizan el código vigente.
- El reemplazo queda registrado en el historial de la unidad. Se controla el doble envío para no reemplazar dos veces por accidente.
- Al archivar una unidad, su QR deja de abrir el expediente. Al reactivarla vuelve a funcionar el código vigente.

## Instalación en GitHub

1. Descomprimir el ZIP y abrir su carpeta `carlab-cloud-v2`.
2. Subir **su contenido** a la raíz del repositorio, conservando las carpetas `modules`, `public` y `tests`.
3. Incluir todos los archivos del paquete. Hay cambios mínimos en los archivos de acceso del sistema para regresar al QR después de iniciar sesión.
4. Confirmar los cambios y esperar el despliegue habitual de Render.
5. Recargar Carlab, abrir una unidad de Flotas AC y descargar su etiqueta.

No requiere instalar paquetes nuevos en producción. El servidor crea una tabla adicional para los códigos y conserva las tablas y registros actuales. El generador QR se incluye localmente con su licencia; no se envían datos a generadores externos.

Generar las etiquetas desde la dirección de producción que se usará con los teléfonos. El enlace utiliza ese dominio; si cambia la dirección del sitio será necesario conservar una redirección desde el dominio anterior o reimprimir las etiquetas desde el nuevo dominio. Los PDF de prueba locales no sirven para las unidades reales.

## Alcance de esta entrega

Incluye el QR, etiquetas, acceso según permisos, regreso después del inicio de sesión, creación de orden desde la ficha, reemplazo de códigos y QR del reporte técnico. La eliminación visible de unidades, los reportes semanales/mensuales y la separación del inventario AC fueron propuestas previas y no forman parte de esta entrega enfocada en QR.

## Pruebas

- 21 pruebas automatizadas aprobadas: QR y regresión de Flotas AC.
- Navegador: lectura del QR con un decodificador independiente, acceso admin y supervisor, regreso desde el inicio de sesión, orden precargada, solicitud desde vista móvil, rechazo de otra marca, PDF y reemplazo del código.
- Revisión visual de la etiqueta y el reporte. Decodificación de los códigos renderizados desde ambos PDF.
- Las pruebas usan datos temporales y emulación móvil. Después del despliegue, comprobar una etiqueta impresa con un teléfono real antes de imprimir el lote.

Pruebas de servidor: `node --test --test-concurrency=1 tests/ac-qr.test.cjs tests/ac-fleet.test.cjs`.
Prueba de navegador: `node tests/ac-qr.browser.cjs` (Playwright, Chrome y jsQR como dependencias de prueba; acepta `PLAYWRIGHT_MODULE`, `JSQR_MODULE` y `QA_OUTPUT`).
