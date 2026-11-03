# Contribuir a KitForge

Gracias por querer mejorar KitForge. Este documento resume cómo preparar el
entorno, qué estilo sigue el código y cómo enviar cambios.

## Requisitos

- Node.js 20 o superior y npm.
- Windows x64 para probar el empaquetado y los instaladores. El núcleo y las
  pruebas unitarias funcionan en cualquier sistema.
- FL Studio es opcional: solo hace falta para ver la vista previa real de los
  iconos con la fuente `ILGlyphsEx`.

## Entorno de desarrollo

```powershell
git clone <URL-del-repositorio>
cd kitforge
npm install
npm start
```

## Pruebas

Antes de abrir un pull request, ejecuta:

```powershell
npm test        # pruebas unitarias del núcleo y del catálogo
npm run smoke   # carga la app y comprueba DOM, preload y CSP
npm run e2e     # flujo completo sobre un kit temporal
```

Si tocas el empaquetado:

```powershell
npm run pack    # dist/win-unpacked/
npm run dist    # instalador NSIS + portable
```

## Estilo de código

- CommonJS en `src/main` y `src/preload`; JavaScript clásico en `src/renderer`.
- Sin bundler y sin frameworks: se prefiere código pequeño y auditable.
- Dos espacios, punto y coma y comillas dobles, como el resto del proyecto.
- El núcleo (`src/core`) no debe importar Electron para poder probarse con
  `node --test`.
- Los handlers IPC nuevos deben validar el origen con `guard()` y comprobar que
  las rutas estén dentro del kit abierto.

## Limpieza de derechos

La fuente `ILGlyphsEx` pertenece a Image-Line: se lee de la instalación local y no se
redistribuye en el repositorio.

## Pull requests

1. Abre una rama descriptiva (`fix/orden-carpetas`, `feat/crear-carpetas`…).
2. Incluye pruebas para los cambios de comportamiento.
3. Actualiza el README si cambia la interfaz, los comandos o el empaquetado.
4. Describe qué problema resuelve y cómo lo probaste.

Para errores, indica la versión de Windows, si usas el instalador o el portable,
los pasos para reproducirlo y el mensaje de error.

## Licencia

Al contribuir aceptas que tu aportación se publique bajo la licencia MIT del
proyecto. Consulta [LICENSE](LICENSE).
