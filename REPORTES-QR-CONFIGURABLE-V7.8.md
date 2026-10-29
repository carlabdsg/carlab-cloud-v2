# CARLAB V7.8 · QR sencillo o doble por flota

Actualización sobre V7.7. Los códigos QR ya pegados conservan su dirección: no necesitas cambiarlos ni imprimirlos otra vez.

## Cómo cambiar el tipo de QR

1. Entra como **Administrador** al sistema de reportes.
2. Abre **Flotas** y selecciona la empresa.
3. Si quieres modificar solo una flota, selecciónala en el filtro **Flota**. Para toda la empresa, deja **Todas las flotas**.
4. Pulsa **Configurar QR**, junto a **Etiquetas QR**.
5. Elige una opción y pulsa **Guardar configuración**:

| Opción | Al escanear |
| --- | --- |
| **QR sencillo** | Abre directamente daños y garantías, sin ofrecer aire acondicionado. |
| **QR doble** | Permite elegir entre reporte general y aire acondicionado. |

La pantalla indica la configuración actual y cuántas unidades abarca. Si las flotas de una empresa tienen modos distintos, muestra **Mixto**. Guardar una opción con **Todas las flotas** aplica ese modo a toda la empresa y reemplaza sus excepciones anteriores. Guardar con una flota seleccionada cambia únicamente esa flota.

Las nuevas unidades heredan la configuración de su empresa y flota. Si cambias la empresa o el nombre de flota de una unidad, pasa a usar la configuración del destino.

## Configuración inicial

- **Reportes AUS:** sencillo.
- **AUS DENISSE:** doble.
- Las demás empresas comienzan en sencillo.

Estos valores iniciales se toman de la empresa registrada en la unidad, ignorando mayúsculas y espacios repetidos. Después, administración puede activar o desactivar el modo doble en cualquier empresa o flota. Una elección guardada se conserva al reiniciar o actualizar el sistema.

## Qué conserva y qué cambia

- El cambio funciona con los QR existentes y los nuevos; no cambia los códigos ni las unidades.
- Los nuevos PDF indican **Daños y garantías** o **Reporte general o aire acondicionado**, según la configuración vigente de cada unidad.
- Solo administración puede cambiar la configuración. Supervisores y operadores no pueden modificarla.
- En sencillo, también se bloquea el envío a AC desde enlaces anteriores o formularios que se habían abierto cuando el QR era doble. El visitante vuelve al formulario general.
- Volver a doble reactiva la elección con el mismo código.
- Los reportes, solicitudes pendientes de vinculación, fotos, órdenes, usuarios y cotizaciones existentes se conservan. Desactivar AC no elimina lo que ya se recibió.
- En modo doble continúa el proceso de V7.7: coincidencia de empresa/unidad con AC genera un reporte IAC; si falta vincular, se recibe un PAC para administración.
- Los QR exclusivos del módulo de climatización conservan su funcionamiento. Este control corresponde a las etiquetas del sistema general de reportes y su opción doble.
- Cada cambio queda registrado con el administrador, fecha y configuración anterior/nueva. Si dos ventanas intentan sobrescribir una configuración, se solicita volver a abrirla para revisar el valor actual.

## Cargar a GitHub

**CARLAB-V7.8-QR-CONFIGURABLE-FACIL.zip contiene 22 archivos.** Es una actualización sobre V7.7 y se puede cargar en una sola operación.

1. Descomprime el ZIP.
2. En GitHub abre la raíz de `carlabdsg/carlab-cloud-v2`.
3. Selecciona **Add file → Upload files**.
4. Arrastra **todo el contenido** de la carpeta descomprimida: `index.html`, `modules`, `public`, `tests` y este documento, conservando las carpetas.
5. Confirma con **Commit changes** y espera a que Render complete el despliegue.
6. Comprueba **Flotas → empresa → Configurar QR** y escanea uno de los QR que ya tienes pegados.

No subas el ZIP directamente ni borres carpetas existentes. No requiere nuevas dependencias, variables de entorno ni cambios manuales a la base de datos. Se agregan automáticamente tablas de configuración e historial, sin reemplazar los datos del sistema.

## Validación

Probado con datos aislados: valores iniciales, permisos, cambios por empresa y flota, modo mixto, nuevas unidades, persistencia, códigos impresos estables, bloqueo de enlaces y formularios anteriores, reactivación y conservación de reportes. Verificado en Chrome y WebKit, con vistas de celular y escritorio, además de los flujos de reporte general y doble y la generación de etiquetas PDF.

Esta entrega prepara los archivos para que los cargues a GitHub. No modifica directamente producción.
