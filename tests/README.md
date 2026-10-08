# Pruebas de Hispacold

Pruebas sin credenciales de producción. Usan PostgreSQL embebido PGlite y servidores HTTP efímeros.

```sh
npm install
npm install --prefix ../hispacold-test-tools --no-package-lock @electric-sql/pglite
node --test --test-concurrency=1 tests/hispacold.test.cjs tests/hispacold-v2.test.cjs
```

Se puede cambiar el directorio de herramientas mediante `HISPACOLD_TEST_DEPS`, con la ruta al `node_modules` correspondiente.

Cubren permisos, catálogo, cinco tipos de orden, folios, importes, cierre, reapertura, conflictos de versión, idempotencia, historial sin imágenes, vencimientos por unidad, evidencias, autorizaciones, fechas y conservación de un expediente V1 durante la migración.

Si están disponibles los PDF privados locales, también comprueban la importación por hash y descarga de un original. En un checkout sin esos PDF se verifica que el manual pendiente devuelve 404 y que no acepta contenido no reconocido.

`preview.cjs` es una demo local efímera. No utilizarla como servidor de producción.
