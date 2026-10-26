# CARLAB V7.6 · Reportar fallas de aire acondicionado por QR sin cuenta

Actualización sobre V7.5 para los QR de las flotas de **Hispacold y Eberspächer**.

## Uso del operador

1. Escanea el QR de aire acondicionado que ya tiene la unidad.
2. Sin cuenta ni contraseña, abre el formulario **Reportar falla de A/C**. La empresa, unidad y marca se toman de la etiqueta y no se pueden cambiar.
3. Escribe su nombre y teléfono; selecciona la falla, condición del equipo y prioridad; describe lo observado. La ubicación y las fotografías son opcionales.
4. Puede tomar fotos con la cámara del dispositivo o elegir hasta cuatro imágenes de su galería.
5. Confirma los datos y recibe un folio **IAC-000001** o el siguiente consecutivo disponible.

Las fallas disponibles son: no enfría, enfriamiento insuficiente, sin ventilación, fuga visible, ruido o vibración, código de alarma y otra incidencia.

## Dónde aparece y cómo se atiende

- El registro aparece en **Aire acondicionado → Reportes AC**, con estado **Nuevo** y distintivo **Visitante QR**. El nombre y teléfono son los declarados por la persona que envía el reporte.
- Se genera un aviso en la campanita para administración y los supervisores que tienen permiso sobre esa marca o empresa.
- La ficha conserva descripción, contacto, prioridad, ubicación, fotografías y bitácora. Administración puede revisar, asignar atención, programar y crear una orden desde el reporte con el proceso habitual.
- El visitante únicamente envía la incidencia y recibe su folio. No puede consultar expedientes, órdenes, otros reportes, cotizaciones ni biblioteca técnica.
- El reporte no crea una orden automáticamente ni cambia la condición técnica verificada de la unidad. Sigue el proceso de revisión de CARLAB.
- Si otra persona reporta la misma categoría de falla, se conserva como otra observación y el sistema muestra las reincidencias al personal autorizado. Un reintento del mismo envío conserva su folio y no genera otro registro.

## Etiquetas actuales y acceso con cuenta

**No necesitas reimprimir las etiquetas existentes.** Los QR vigentes siguen identificando la misma unidad y marca. Los nuevos PDF incluyen **Reporta sin crear una cuenta**.

Un administrador o supervisor AC con sesión iniciada sigue abriendo la ficha autorizada de la unidad al escanear. En el formulario público, **Tengo cuenta** permite entrar al acceso habitual.

Las etiquetas reemplazadas y las unidades retiradas de la flota no aceptan nuevos reportes. Cambiar la empresa o marca de una unidad invalida un formulario abierto con los datos anteriores; se debe volver a escanear.

## Conexión y confirmación

Se necesita internet para enviar. Las fotos se reducen antes de cargarse. Si la conexión falla al confirmar, conserva la página y pulsa **Verificar envío**. Después de la confirmación, el folio sigue visible al recargar esa misma pestaña; guárdalo para pedir seguimiento.

Cada formulario vence después de 12 horas. Se permiten hasta 10 reportes por unidad por hora y 30 por día para reducir uso indebido. El límite no bloquea la confirmación de un envío ya registrado.

## Subir a GitHub en una sola carga

El archivo `CARLAB-V7.6-AC-QR-SIN-CUENTA-FACIL.zip` contiene **18 archivos**.

1. Descomprime el ZIP.
2. Abre la página principal del repositorio `carlabdsg/carlab-cloud-v2`, fuera de cualquier carpeta.
3. Selecciona **Add file → Upload files**.
4. Arrastra **todo el contenido** de la carpeta descomprimida: `server.js`, las carpetas `modules`, `public`, `tests` y este documento. Conserva los archivos dentro de sus carpetas.
5. Pulsa **Commit changes** y espera a que Render termine el despliegue.
6. Escanea un QR de AC desde un navegador sin sesión, envía una prueba identificada como tal y verifica su folio en **Reportes AC** y en la campanita.

No subas el ZIP directamente ni borres las carpetas existentes. Requiere V7.5 instalada; es una actualización, no una instalación desde cero. No necesita nuevas dependencias ni cambios de configuración.

Se conservan las unidades, empresas, usuarios, reportes, órdenes, evidencias y cotizaciones actuales, así como el acceso por QR del sistema general de reportes. La nueva tabla de confirmaciones de AC se crea automáticamente sin borrar datos existentes.

## Verificación

Probado con datos aislados de producción: ambas marcas, permisos por empresa y marca, notificaciones, fotografías, reintentos sin duplicar, conversión a orden, etiquetas reemplazadas y unidades retiradas. El formulario se comprobó en Chrome y WebKit en tamaños móvil y escritorio. También se verificaron los flujos anteriores de acceso con cuenta, etiquetas, solicitudes y reportes AC, y el envío público de reportes generales.
