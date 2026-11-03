# KitForge

Editor de estilos para las carpetas del navegador de FL Studio. KitForge lee y
escribe los archivos `.nfo` que FL Studio usa para pintar una carpeta (color,
icono, tooltip, badge, altura y orden), con una vista previa del resultado.

Es una **reimplementación limpia** de la app KitSkin: no contiene código,
iconos ni recursos del artefacto original. El comportamiento se dedujo del
análisis estático del `app.asar` original y el formato `.nfo` se implementó
desde cero.

> KitForge no está afiliado a Image-Line ni a KitSkin.

## Descargar

Las versiones compiladas se publican en
[Releases](../../releases). Hay dos formatos:

- **Instalador** (`KitForge-*-setup-x64.exe`): instala la app, crea accesos
  directos y permite elegir la carpeta de instalación.
- **Portable** (`KitForge-*-portable-x64.exe`): un único ejecutable que se puede
  copiar a cualquier carpeta o unidad sin instalar nada.

Windows puede mostrar un aviso de SmartScreen porque los ejecutables no están
firmados con un certificado de código.

## Puesta en marcha

Para desarrollar desde el código fuente: Node.js 20+ y npm. En Windows se ha
probado con Node 26 y Electron 45.

```powershell
cd kitforge
npm install
npm start
```

Otros comandos:

| Comando          | Qué hace                                                        |
| ---------------- | --------------------------------------------------------------- |
| `npm test`       | Pruebas unitarias del núcleo y del catálogo (49 casos).         |
| `npm run smoke`  | Abre la app oculta y comprueba DOM, preload y CSP.              |
| `npm run e2e`    | Flujo real: abrir kit temporal, editar, aplicar y deshacer.     |
| `npm start`      | Abre la aplicación en modo desarrollo.                          |
| `npm run pack`   | Genera la app sin instalador en `dist/win-unpacked/`.           |
| `npm run dist`   | Genera el instalador NSIS y el ejecutable portable en `dist/`.  |

Para capturar una imagen durante el E2E:

```powershell
$env:KITFORGE_E2E_SCREENSHOT="$env:TEMP\kitforge.png"
npm run e2e
```

## Compilar la aplicación

Requisitos para empaquetar: Windows x64, Node.js 20+ y npm. La primera vez hay
que instalar también las dependencias de desarrollo:

```powershell
cd kitforge
npm install
```

### Instalador y portable

```powershell
npm run dist
```

Esto produce:

| Archivo                                  | Uso                                            |
| ---------------------------------------- | ---------------------------------------------- |
| `dist\KitForge-0.1.0-setup-x64.exe`      | Instalador NSIS con accesos directos.          |
| `dist\KitForge-0.1.0-portable-x64.exe`   | Ejecutable único, sin instalación.             |
| `dist\win-unpacked\KitForge.exe`         | Versión de desarrollo ya empaquetada.          |

El instalador permite elegir la carpeta de instalación y crea accesos directos
en el escritorio y el menú Inicio. El portable se puede copiar a cualquier
carpeta o unidad y ejecutar directamente; guarda su configuración en el perfil
del usuario, igual que la versión instalada.

### Solo la carpeta ejecutable

```powershell
npm run pack
```

Genera `dist\win-unpacked\` con `KitForge.exe` y sus DLL. Es útil para probar el
empaquetado sin crear instaladores.

### Detalles del empaquetado

- La configuración está en el campo `build` de `package.json` y usa
  `electron-builder`.
- El icono de la aplicación es `build/icon.ico`; se genera a partir del diseño
  propio de KitForge en `build/icon.png`.
- La versión del instalador y del portable sale de `version` en
  `package.json`. Para publicar una nueva versión, cámbiala y vuelve a ejecutar
  `npm run dist`.
- Los artefactos se generan en `dist/`, que está excluido del control de
  versiones.
- No hay certificado de firma de código configurado, así que Windows puede
  mostrar un aviso de SmartScreen la primera vez. Para evitarlo hay que firmar
  el ejecutable con un certificado propio.
- La fuente `ILGlyphsEx` no se empaqueta: se lee de la instalación de FL Studio
  del equipo donde se ejecuta KitForge.

### Publicar una versión

El workflow `.github/workflows/release.yml` compila y adjunta el instalador y el
portable a una release de GitHub cuando se empuja un tag `v*`:

```powershell
npm version 0.2.0 --no-git-tag-version   # sube la versión en package.json
git add package.json package-lock.json
git commit -m "chore: versión 0.2.0"
git tag v0.2.0
git push origin main --tags
```

La release se crea automáticamente. Si el repositorio aún no tiene remoto,
créalo en GitHub y añádelo con `git remote add origin <URL>`.

## Qué hace

- **Abrir un kit** con el botón o arrastrando una carpeta a la ventana. Lee
  hasta 6 niveles de subcarpetas, como el navegador de FL Studio.
- **Árbol ordenado** por `SortGroup` (mayor primero) y, en empate, por nombre
  natural (`Kit 2` antes que `Kit 10`). El orden se puede cambiar arrastrando
  filas; KitForge escribe el `SortGroup` de los hermanos afectados.
- **Crear carpeta** con el botón `+` del panel Carpetas o `Ctrl+Shift+N`. Se
  crea dentro de la carpeta seleccionada; si no hay selección, en la raíz.
- **Cambiar el nombre** con el botón del lápiz, `F2` o el menú contextual
  (clic derecho). También renombra su `.nfo` y actualiza las referencias
  `Bitmap` del mismo nivel.
- **Color** sólido o degradado repartido entre las carpetas seleccionadas. La
  interpolación se hace en OKLab para que el degradado no se apague por el
  centro.
- **Icono** de FL Studio mediante su `IconIndex` numérico, con **vista previa
  real** del glifo en el panel, el árbol y el navegador simulado.
- **Badge**: copia la imagen a la carpeta de assets del kit, la reduce a
  320×160 como máximo y escribe el `Bitmap` relativo. Las imágenes idénticas se
  reutilizan y las nuevas se numeran (`badge 1.png`, `badge 2.png`…). Si el
  destino es la propia carpeta de assets, se guarda como
  `<kit> cover art.png`.
- **Tooltip** (`Tip`) y **altura** (`HeightOfs`).
- **Selección múltiple** con Ctrl/Cmd y Shift, edición en lote y degradados.
- **Aplicar / deshacer / descartar**: los cambios se acumulan como borrador y
  solo tocan el disco al pulsar `apply to FL Studio`. `undo` restaura en disco
  el estado anterior al último apply y deja los cambios como pendientes.
- **Limpieza de imágenes**: mueve a la papelera las imágenes de las carpetas
  de assets que ningún `.nfo` referencia, con confirmación previa.
- **Exportar** el kit completo a un `.zip` con progreso y cancelación.
- **Vista previa** que imita el navegador de FL Studio, con fondo configurable
  y temas claro/oscuro.

## Vista previa de iconos

KitForge no incluye los PNG de iconos del artefacto original. La mayoría de los
`IconIndex` del navegador de FL Studio son glifos de la fuente **ILGlyphsEx**
que FL Studio instala en `Help\fonts`. Al arrancar, KitForge localiza esa fuente
en la instalación de FL Studio, la carga en el renderer y pinta el glifo
correspondiente a cada índice. Si FL Studio no está instalado, el panel muestra
el número (`#772`) como respaldo.

La tabla índice → punto de código está en `src/renderer/icons.js`. Se derivó de
la fuente de FL Studio 2026; en versiones más antiguas puede faltar algún glifo.
Unos pocos iconos internos (robot, gráficas, pasos, automatización, fades…) no
tienen un glifo equivalente; para ellos se dibujan SVG propios, sin reutilizar
recursos del original. Si la fuente está en una ruta no habitual, se puede
indicar con la variable de entorno `KITFORGE_ICON_FONT` antes de arrancar:

```powershell
$env:KITFORGE_ICON_FONT = "D:\FL Studio\Help\fonts\ILGlyphsEx.ttf"
npm start
```

La fuente ILGlyphsEx pertenece a Image-Line: KitForge la lee de la instalación
del usuario y no la redistribuye.

## Formato `.nfo`

Para la carpeta `drums/`, FL Studio lee el archivo hermano `drums.nfo`:

```ini
Color=$a34fff      ; BGR con prefijo $; la UI usa #ff4fa3
IconIndex=772
HeightOfs=0
SortGroup=13
Tip=Punchy drums
Bitmap=-/badge 1.png
Visible=True
```

Decisiones del formato implementadas:

- El color se guarda en orden **BGR** (`$BBGGRR`), no RGB. Se acepta también
  `$AABBGGRR` al leer.
- Si el estilo queda vacío, KitForge **borra** el `.nfo` en lugar de dejar un
  archivo con líneas vacías.
- Las claves desconocidas se conservan tal cual al reescribir el archivo.
- Para carpetas con punto en el nombre (`Kit v1.0`) se acepta tanto
  `Kit v1.0.nfo` (coincidencia exacta, tiene prioridad) como `Kit v1.nfo` (sin
  la extensión), evitando apropiarse del `.nfo` de un hermano.
- Las carpetas de sistema (`.git`, `$RECYCLE.BIN`, `System Volume Information`,
  etc.) se ignoran. La basura (`Thumbs.db`, `.DS_Store`, `._*`) no se exporta.

## Arquitectura

```
kitforge/
├─ src/
│  ├─ core/
│  │  ├─ nfo.js       # parse/serialize, BGR, claves desconocidas
│  │  ├─ tree.js      # orden, reordenación, rutas, filtros
│  │  └─ kit.js       # escaneo, apply, assets, limpieza, zip
│  ├─ main/
│  │  └─ main.js      # ventana, protocolo de imágenes, IPC
│  ├─ preload/
│  │  └─ preload.js   # superficie mínima para el renderer
│  └─ renderer/
│     ├─ index.html
│     ├─ styles.css
│     ├─ icons.js     # índice → glifo de ILGlyphsEx + SVG propios
│     └─ app.js       # estado, edición, árbol, inspector, preview
├─ build/             # iconos de la app para electron-builder
├─ test/              # node:test (núcleo)
└─ package.json       # scripts, dependencias y configuración de build
```

- **Sin bundler**: CommonJS en main/preload y JavaScript clásico en el
  renderer. Menos piezas y más fácil de auditar.
- **Núcleo puro y testeable**: `core/` no importa Electron. Se prueba con
  `node --test`.
- **Borrador de cambios**: `edits[carpeta]` guarda solo las claves distintas
  del `.nfo` original. Un valor `null` significa “quitar esta clave”. Al
  aplicar se fusiona con el original, se eliminan los `null` y se serializa.
- **Historial**: undo/redo con coalescencia de gestos (slider de color y
  teclado no generan una entrada por píxel).
- **IPC validado**: todos los handlers comprueban que el mensaje venga del
  frame principal local (`file://`). El renderer no tiene acceso a Node.
- **Protocolo `kitforge-asset://`**: sirve imágenes solo si están dentro de una
  raíz abierta y tienen extensión de imagen. No se expone `file://` genérico.
- **CSP**: `default-src 'self'`, sin scripts inline; imágenes desde `data:` y
  el protocolo propio; la fuente de iconos se carga como `data:`.
- **Exportación atómica**: se escribe un `.part` y se renombra al terminar; si
  se cancela o falla, el `.part` se borra.

## Evidencia del artefacto original

Análisis realizado con REA sobre
`%LOCALAPPDATA%\Programs\KitSkin\resources\app.asar` (55.486.673 bytes,
SHA-256 `22117846…b6471688`):

- `ev_390f0c46…b999b790`: ejecución sobre la app completa; 6.889 archivos,
  3.944 archivos JS parseados. La ejecución agotó el presupuesto de 300 s antes
  de terminar el bundle del renderer.
- `ev_38a99519…bfe756713`: ejecución dirigida a `out/main/index.js` y
  `out/preload/index.js`; identificó 1 `BrowserWindow`, 29 miembros expuestos
  en el preload, 26 handlers IPC y **ninguna validación de remitente** en el
  original.

De ahí se documentaron: `.nfo` hermano, colores BGR, borrado al quedar vacío,
`SortGroup` con orden descendente, detección de assets por prefijo de `Bitmap`
o carpeta `-`, exportación zip, licencia/trial y el flujo del panel Style. La
copia limpia **no reutiliza** ese código: añade validación de origen, CSP,
sandbox, protocolo con lista blanca y una UI propia.

Mapa evidencia → función:

| Comportamiento observado                     | Implementación en KitForge              |
| -------------------------------------------- | --------------------------------------- |
| `.nfo` hermano de la carpeta                 | `nfoPathForFolder` / `applySpecs`       |
| `Color=$BBGGRR`                              | `cssToNfoColor` / `nfoToCssColor`       |
| Borrar `.nfo` si no queda estilo             | `isSpecEmpty` + `applySpecs`            |
| `SortGroup` mayor arriba, empate por nombre  | `sortNodes` / `sortTree`                |
| Detección de assets por `Bitmap`             | `findAssetsDir` / `ensureAssetsDir`     |
| Badges numerados y deduplicados              | `saveBadge` / `nextFileName`            |
| Limpieza de imágenes no usadas               | `cleanupUnusedAssets`                   |
| Exportación zip                              | `exportKit` con `archiver`              |

## Pruebas

`npm test` cubre:

- Ida y vuelta de `.nfo`, orden de claves, claves desconocidas, colores BGR,
  `$AABBGGRR`, specs vacíos y convención de nombres.
- Escaneo: orden, anidamiento, profundidad 6, nombres naturales, `.nfo`
  exacto vs. sin extensión, colisiones entre hermanos, bitmaps ausentes.
- Apply: escritura, borrado al vaciar, errores por carpeta sin abortar el lote.
- Carpetas: creación, validación de nombres, colisiones, renombrado de la
  carpeta y su `.nfo`, y actualización de referencias `Bitmap`.
- Assets: creación de `-`/`-.nfo`, numeración, deduplicación por bytes, cover
  art, detección por `Bitmap`, lectura de imágenes.
- Limpieza: solo imágenes no referenciadas, respeto de la lista `keep`.
- Exportación: cabecera zip, `.part` eliminado, rechazo de destinos dentro del
  kit.
- Utilidades de árbol: orden, reordenación por bloques, rutas y filtros.
- Catálogo de iconos: 198 índices sin solaparse, área privada de la fuente,
  dígitos segmentados, routing y SVG de respaldo.

`npm run smoke` verifica que la ventana carga, que el preload expone la API, que
existen los paneles, que el catálogo tiene 198 entradas y si se encontró la
fuente de iconos de FL Studio. `npm run e2e` abre un kit temporal, selecciona una
carpeta, aplica color/icono/tooltip, comprueba el `.nfo` en disco, deshace el
apply y verifica que el archivo vuelve a su contenido original. También carga
un badge real a través del protocolo propio, comprueba que un `apply` fuera de
la raíz abierta se rechaza sin escribir nada, exporta el kit a un zip y simula
un arrastre para verificar que el árbol no se reconstruye durante el gesto y que
el nuevo orden queda pendiente de aplicar. Después crea una carpeta y la
renombra desde la interfaz, comprobando que el diálogo y el árbol se actualizan.

## Diferencias conocidas

- **Iconos**: se escribe `IconIndex` a mano; hay vista previa del glifo, pero no
  un selector visual de la librería completa ni se incluyen sus PNG.
- **Badge**: reducción automática a 320×160; no hay recorte interactivo.
- **Limpieza**: explícita y con confirmación; no se ejecuta automáticamente al
  aplicar.
- **Operaciones de carpeta**: se pueden crear y renombrar carpetas, pero no
  duplicarlas ni moverlas a otro nivel. La carpeta de assets `-` no se puede
  renombrar para no romper los `Bitmap` existentes.
- **Marca de agua**: el original escribía una línea de marca; KitForge no la
  escribe.
- **Paridad visual**: el bundle del renderer del original (1,49 MB minificado)
  no llegó a analizarse por AST, así que la interfaz es un diseño propio
  inspirado en el flujo observado, no una copia píxel a píxel.
- **Plataformas**: probado en Windows x64. La barra de título tiene variantes
  para macOS/Linux, pero no se han validado.
- **Firma**: el instalador y el portable no están firmados; Windows puede
  avisar con SmartScreen.

## Contribuir

Las instrucciones para preparar el entorno, el estilo de código y el flujo de
pull requests están en [CONTRIBUTING.md](CONTRIBUTING.md). En resumen:

```powershell
npm install
npm test
npm run smoke
npm run e2e
```

No se aceptan copias de código, iconos ni recursos del artefacto original de
KitSkin. La fuente `ILGlyphsEx` pertenece a Image-Line y no se redistribuye.

## Licencia

KitForge se publica bajo la licencia [MIT](LICENSE).

Copyright (c) 2026 KitForge contributors.

KitForge no está afiliado a Image-Line. FL Studio es una marca de Image-Line;
este proyecto solo lee y escribe los archivos `.nfo` que usa su navegador.
