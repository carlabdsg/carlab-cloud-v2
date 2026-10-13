# CARLAB Cloud · Climatización V4

Supervisor AC externo, solicitudes de servicio y refacciones, inventario conectado a Stock y campanita de notificaciones. Incluye los ajustes de captura y reportes formales de V3.1.

## Instalación en GitHub y Render

1. Descomprime `CARLAB-CLIMATIZACION-V4-ACTUALIZACION.zip`.
2. Sube **el contenido de la carpeta `carlab-cloud-v2` a la raíz de tu repositorio**, conservando las subcarpetas. Reemplaza los archivos coincidentes.
3. Confirma los cambios y espera el despliegue automático de Render. Si está desactivado, utiliza **Manual Deploy → Deploy latest commit**.
4. Recarga la página y entra como administrador. Si conservabas pestañas abiertas, recárgalas también.

Esta actualización incluye `server.js`, las páginas principales y los scripts de acceso: son necesarios para reconocer el nuevo usuario y dirigirlo a su portal. Los cambios en estos archivos agregan el rol y su restricción de acceso; los flujos de los usuarios anteriores se conservan. Se comparó la base de estos archivos con la versión actual de `main` del repositorio antes de preparar la entrega.

No requiere nuevas dependencias de producción ni cambios en `package.json`, `render.yaml` o `agenda-runtime.js`. Las tablas nuevas se crean automáticamente al acceder al módulo. Se conservan las órdenes y los manuales previamente importados; no necesitas importar otra vez los PDF.

## Crear un Supervisor AC

Puedes hacerlo de dos formas:

- En **Usuarios y accesos**, elige el rol **Supervisor AC**. Aparecerá **Empresa / marca Supervisor AC** con Hispacold y Eberspächer.
- En **Aire acondicionado → Accesos Supervisor AC → Crear Supervisor AC**.

Captura nombre, correo, contraseña de al menos ocho caracteres, teléfono opcional y empresa/marca. Cada cuenta representa a una de las dos marcas. La empresa operadora de un autobús se captura por separado en las solicitudes.

Al iniciar sesión con esa cuenta, el sistema abre el portal Supervisor AC. El usuario puede solicitar servicios y refacciones, consultar sus solicitudes, ver las órdenes e información de su marca, descargar los reportes técnicos sin importes internos y consultar la biblioteca correspondiente. Las unidades conocidas se toman de intervenciones y solicitudes de esa marca; una unidad nueva puede capturarse manualmente.

El supervisor no crea ni modifica órdenes, no asigna técnicos, no cierra ni elimina servicios, no administra usuarios y no modifica inventario. Su acceso a los módulos generales de Carlab está bloqueado en el servidor. Los permisos y la marca se revisan contra la cuenta vigente, no solamente contra lo que muestra la pantalla.

Puedes cambiar la marca o desactivar el acceso desde Accesos Supervisor AC. El portal actualiza la asignación al consultar notificaciones; una cuenta desactivada pierde el acceso a los datos. Las solicitudes antiguas conservan la marca con la que fueron enviadas.

## Solicitudes de servicio

El supervisor pulsa **Solicitar servicio** y registra empresa operadora, unidad, descripción, prioridad y, opcionalmente, ubicación, contacto, fecha preferida y hasta cuatro fotografías.

La solicitud recibe un folio **SAC**. Carlab la revisa desde **Solicitudes AC** y puede registrar seguimiento, proponer una fecha, rechazarla o cancelarla con motivo. Desde **Crear orden desde esta solicitud**, Carlab selecciona servicio, atención normal/express y fecha; se abre una orden en borrador que conserva unidad, marca, motivo y evidencias.

Una solicitud solo puede generar una orden. Reintentar la conversión recupera el mismo folio. Al completar la orden, el supervisor ve la solicitud como Atendida y puede consultar su reporte. Crear una solicitud no equivale a crear una orden de servicio.

## Refacciones AC y Stock compartido

En **Aire acondicionado → Refacciones AC** puedes:

- Crear una ficha técnica con nombre, número de parte, marcas y modelos compatibles, fotografía, proveedor, ubicación y existencia mínima.
- Vincular una refacción que ya existe en Stock, conservando su cantidad e historial.
- Registrar entradas recibidas y devoluciones con cantidad y motivo/documento.
- Consultar sus movimientos y solicitar piezas para una unidad.

La ficha nueva se crea en Stock con existencia cero. Después registra la entrada real recibida. Una pieza compatible con ambas marcas puede habilitarse para ambas; conserva una sola existencia compartida. Los cambios registrados en el Stock general también se reflejan al actualizar Refacciones AC.

La solicitud de refacción recibe un folio **RAC**. Su flujo es Recibida → En revisión/Aprobada/Espera de compra → Entregada, con opciones de rechazo o cancelación antes de entregar. Si una pieza está fuera del catálogo, puede describirse y Carlab la vincula al inventario durante la revisión.

**Solicitar o aprobar no descuenta ni reserva inventario.** La entrega comprueba la existencia disponible, descuenta la cantidad y registra una salida en Stock en una sola transacción. Los reintentos o versiones desactualizadas no producen una segunda salida. Si no hay existencia suficiente, la solicitud conserva su estado anterior.

Las entradas y devoluciones quedan en los movimientos de Stock. El costo de una orden sigue registrándose en sus conceptos técnicos; una solicitud de pieza no agrega cargos automáticamente al reporte.

## Campanita y centro de notificaciones

La campanita aparece arriba a la derecha de Aire acondicionado y del portal Supervisor AC. El número indica las notificaciones sin leer para el usuario actual.

Incluye:

- Nuevas órdenes de aire acondicionado y cambios de estado.
- Nuevas solicitudes de servicio o refacciones y su seguimiento.
- Mantenimientos cuya fecha vigente está vencida.
- Para Carlab: órdenes Borrador/En proceso con fecha de servicio de hace dos días o más que siguen pendientes de cierre.

Al pulsar una notificación se abre su orden o solicitud. Puedes marcar una como leída o usar **Marcar todas leídas**. La lectura se guarda por usuario: un administrador no borra los avisos de otro. El supervisor recibe únicamente avisos de su marca; los recordatorios internos de cierre quedan para Carlab.

Las notificaciones se actualizan cada treinta segundos con la página activa y también al realizar una operación. Los avisos se deduplican; los recordatorios de cierre ya resueltos y los vínculos a órdenes en papelera se retiran de la bandeja. La lectura masiva usa el último aviso consultado, para no marcar como leída una notificación que llegue después.

El acceso desde una notificación conserva el mecanismo de borrador local de las órdenes en captura. La campana es una notificación interna del sitio; no envía correos, WhatsApp ni avisos del sistema operativo.

## Validación

Pruebas de API y PostgreSQL embebido: permisos por marca, acceso directo por ID, cuentas inactivas, rechazo de cambios no autorizados, contraseñas, solicitudes, conversión única a orden, inventario compartido, cantidades, entrega y reversión sin existencia, lectura individual, recordatorios y compatibilidad con V1/V2/V3.

Prueba de navegador: alta del rol desde Usuarios, inicio de sesión al portal externo, solicitud con fotografía, revisión por Carlab, conversión a orden, borrador conservado al abrir notificaciones, solicitud/aprobación/entrega de refacción, actualización de Stock, lectura independiente, PDF técnico sin precios y vista móvil sin desbordamiento. También se comprobó el cambio de marca de una cuenta.

Esta entrega está preparada para GitHub; no se ha desplegado en producción desde la conversación.
