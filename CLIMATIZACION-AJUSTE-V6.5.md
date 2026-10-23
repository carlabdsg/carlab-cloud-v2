# CARLAB AC V6.5 · Etiquetas QR frontales

Las etiquetas descargadas desde **Flotas AC → abrir unidad → Etiqueta QR → Descargar etiqueta PDF** ahora siguen el diseño de la muestra proporcionada: encabezado CARLAB / Servicios Integrales, marco y acento rosa, empresa, número de unidad destacado, marca del sistema A/C y QR centrado.

## Impresión

- Tamaño del PDF: **106 × 146 mm (10.6 × 14.6 cm)**, una página por etiqueta.
- Imprime en **tamaño real / 100 %**. Si usas una hoja mayor, conserva ese tamaño al colocar la etiqueta.
- Los textos se ajustan al espacio disponible para que los nombres largos no generen una segunda página.
- El QR se dibuja con elementos vectoriales y conserva margen blanco para facilitar su lectura.

Empresa, unidad y marca se toman de la ficha actual; no se fija la unidad 325 de la muestra. Aplica a Hispacold y Eberspächer.

## Cargar la actualización

1. Descomprime `CARLAB-AC-V6.5-ETIQUETAS-QR.zip`.
2. Sube el **contenido** de la carpeta `carlab-cloud-v2` a la raíz de tu repositorio. Reemplaza los archivos coincidentes y conserva la estructura de carpetas.
3. Espera el despliegue de Render, recarga la página y descarga nuevamente las etiquetas que quieras imprimir con este diseño.

El ZIP es acumulativo sobre V6.1, V6.2, V6.3 o V6.4 e incluye las mejoras de refacciones y órdenes de V6.4. No es un repositorio completo para instalar desde cero. No requiere nuevas dependencias de producción.

Descargar una etiqueta conserva el código de la unidad. Los QR impresos anteriormente siguen funcionando y el acceso mantiene los permisos existentes. No es necesario usar la opción de invalidar/reemplazar el código para obtener el nuevo diseño. Los PDF que ya descargaste conservan su diseño anterior.

## Verificación

Se comprobaron PDF de una página con las dimensiones correctas, ambas marcas y los límites de longitud de empresa y unidad. Se revisaron visualmente y se decodificaron los QR de los PDF renderizados para confirmar sus destinos. También pasó la prueba de navegador del flujo completo de QR, inicio de sesión, apertura de la unidad, orden precargada, solicitud del supervisor y reemplazo del código.

Prueba específica: `tests/ac-qr-label.browser.cjs`; prueba del flujo: `tests/ac-qr.browser.cjs`. Requieren Playwright y Chrome en desarrollo. Las pruebas fueron locales; esta entrega no modifica producción.
