# Pruebas del módulo Hispacold

No requieren credenciales ni base de producción. Usan PostgreSQL embebido PGlite y un servidor HTTP aislado.

```sh
npm install
npm install --prefix ../hispacold-test-tools --no-package-lock @electric-sql/pglite
node --test tests/hispacold.test.cjs
```

Se puede indicar otra carpeta de dependencias con `HISPACOLD_TEST_DEPS` (ruta al directorio `node_modules`).

Cubren control de acceso de administrador activo, catálogo, cuatro formatos, folios, costos, persistencia, filtros, cierre, reapertura, concurrencia optimista, validación y aislamiento. La comprobación del PDF original es opcional cuando los manuales privados están instalados localmente; en un checkout público se verifica que el manual pendiente devuelve 404 y que se rechaza contenido no reconocido.

`preview.cjs` levanta una demo efímera con datos ficticios. Nunca usar esa demo como servidor de producción.
