# Pruebas de climatización

Pruebas sin credenciales de producción. Usan PostgreSQL embebido PGlite y servidores HTTP efímeros.

```sh
npm install
npm install --prefix ../hispacold-test-tools --no-package-lock @electric-sql/pglite
node --test --test-concurrency=1 tests/hispacold.test.cjs tests/hispacold-v2.test.cjs tests/hispacold-v3.test.cjs tests/ac-operations.test.cjs tests/ac-fleet.test.cjs
```

Se puede cambiar el directorio de herramientas mediante `HISPACOLD_TEST_DEPS`, con la ruta al `node_modules` correspondiente.

Cubren permisos, catálogo, cinco tipos de orden, folios, importes, cierre, reapertura, conflictos de versión, idempotencia, historial sin imágenes, vencimientos por unidad, evidencias, autorizaciones, fechas y conservación de un expediente V1 durante la migración.

Si están disponibles los PDF privados locales, también comprueban la importación por hash y descarga de un original. En un checkout sin esos PDF se verifica que el manual pendiente devuelve 404 y que no acepta contenido no reconocido.

`preview.cjs` es una demo local efímera. No utilizarla como servidor de producción.

V3 añade pruebas de captura sencilla y cierre, dos marcas, planes por periodicidad, papelera y restauración con auditoría, conflictos de versión, copias cuyo origen fue eliminado, aislamiento de calendarios e importación binaria mayor de 50 MB con verificación SHA.

V4 cubre aislamiento por marca y por identificador, usuarios externos activos/inactivos, solicitudes sin permiso de crear órdenes, conversión idempotente, Stock compartido, entregas únicas y reversión por existencia insuficiente, avisos por marca, lectura individual y el bloqueo real de APIs anteriores para Supervisor AC.

V5 añade 14 pruebas de empresas mixtas, aislamiento por marca/identificador/exportación, lotes atómicos, semáforo por fuentes y vigencia, conversión/cierre, mantenimiento, recurrencia, versiones, identidad inmutable, solicitudes vinculadas a unidad, archivo, campanita, copia de Flotas sin mutación y revocación inmediata de acceso.
