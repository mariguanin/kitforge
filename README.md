# KitForge

Style editor for FL Studio browser folders. KitForge reads and writes the
`.nfo` files that FL Studio uses to paint a folder (color, icon, tooltip,
badge, height and order), with a preview of the result.

It is a **clean-room reimplementation** of the KitSkin app: it contains no
code, icons or assets from the original artifact. The behavior was inferred
from static analysis of the original `app.asar`, and the `.nfo` format was
implemented from scratch.

> KitForge is not affiliated with Image-Line or KitSkin.

## Download

Compiled builds are published in [Releases](../../releases). There are two
formats:

- **Installer** (`KitForge-*-setup-x64.exe`): installs the app, creates
  shortcuts and lets you choose the installation folder.
- **Portable** (`KitForge-*-portable-x64.exe`): a single executable that can be
  copied to any folder or drive without installing anything.

Windows may show a SmartScreen warning because the executables are not signed
with a code certificate.

## Getting started

To develop from source: Node.js 20+ and npm. On Windows it has been tested with
Node 26 and Electron 45.

```powershell
cd kitforge
npm install
npm start
```

Other commands:

| Command          | What it does                                                    |
| ---------------- | --------------------------------------------------------------- |
| `npm test`       | Unit tests for the core and the catalog (49 cases).             |
| `npm run smoke`  | Opens the app hidden and checks DOM, preload and CSP.           |
| `npm run e2e`    | Real flow: open a temporary kit, edit, apply and undo.          |
| `npm start`      | Opens the application in development mode.                      |
| `npm run pack`   | Builds the app without an installer in `dist/win-unpacked/`.    |
| `npm run dist`   | Builds the NSIS installer and the portable executable in `dist/`. |

To capture a screenshot during E2E:

```powershell
$env:KITFORGE_E2E_SCREENSHOT="$env:TEMP\kitforge.png"
npm run e2e
```

## Building the application

Requirements for packaging: Windows x64, Node.js 20+ and npm. The first time,
you also need to install the development dependencies:

```powershell
cd kitforge
npm install
```

### Installer and portable

```powershell
npm run dist
```

This produces:

| File                                     | Use                                            |
| ---------------------------------------- | ---------------------------------------------- |
| `dist\KitForge-0.1.0-setup-x64.exe`      | NSIS installer with shortcuts.                 |
| `dist\KitForge-0.1.0-portable-x64.exe`   | Single executable, no installation.            |
| `dist\win-unpacked\KitForge.exe`         | Already packaged development build.            |

The installer lets you choose the installation folder and creates shortcuts on
the desktop and in the Start menu. The portable build can be copied to any
folder or drive and run directly; it stores its configuration in the user
profile, just like the installed version.

### Executable folder only

```powershell
npm run pack
```

Generates `dist\win-unpacked\` with `KitForge.exe` and its DLLs. It is useful
for testing the packaging without creating installers.

### Packaging details

- The configuration lives in the `build` field of `package.json` and uses
  `electron-builder`.
- The application icon is `build/icon.ico`; it is generated from KitForge's own
  design in `build/icon.png`.
- The installer and portable versions take their version from `version` in
  `package.json`. To publish a new version, change it and run `npm run dist`
  again.
- Artifacts are generated in `dist/`, which is excluded from version control.
- No code signing certificate is configured, so Windows may show a SmartScreen
  warning the first time. To avoid it, sign the executable with your own
  certificate.
- The `ILGlyphsEx` font is not bundled: it is read from the FL Studio
  installation on the machine running KitForge.

### Publishing a release

The `.github/workflows/release.yml` workflow builds and attaches the installer
and the portable build to a GitHub release when a `v*` tag is pushed:

```powershell
npm version 0.2.0 --no-git-tag-version   # bumps the version in package.json
git add package.json package-lock.json
git commit -m "chore: version 0.2.0"
git tag v0.2.0
git push origin main --tags
```

The release is created automatically. If the repository does not have a remote
yet, create it on GitHub and add it with `git remote add origin <URL>`.

## What it does

- **Open a kit** with the button or by dragging a folder onto the window. It
  reads up to 6 levels of subfolders, like the FL Studio browser.
- **Sorted tree** by `SortGroup` (highest first) and, on ties, by natural name
  (`Kit 2` before `Kit 10`). The order can be changed by dragging rows;
  KitForge writes the `SortGroup` of the affected siblings.
- **Create folder** with the `+` button in the Folders panel or `Ctrl+Shift+N`.
  It is created inside the selected folder; if there is no selection, at the
  root.
- **Rename** with the pencil button, `F2` or the context menu (right click). It
  also renames its `.nfo` and updates `Bitmap` references at the same level.
- **Color** solid or gradient distributed across the selected folders. The
  interpolation is done in OKLab so the gradient does not fade out in the
  middle.
- **Icon** from FL Studio through its numeric `IconIndex`, with a **real
  preview** of the glyph in the panel, the tree and the simulated browser.
- **Badge**: copies the image to the kit's assets folder, scales it down to
  320×160 at most and writes the relative `Bitmap`. Identical images are
  reused and new ones are numbered (`badge 1.png`, `badge 2.png`…). If the
  destination is the assets folder itself, it is saved as
  `<kit> cover art.png`.
- **Tooltip** (`Tip`) and **height** (`HeightOfs`).
- **Multi-selection** with Ctrl/Cmd and Shift, batch editing and gradients.
- **Apply / undo / discard**: changes accumulate as a draft and only touch the
  disk when you press `apply to FL Studio`. `undo` restores the state before the
  last apply on disk and leaves the changes as pending.
- **Image cleanup**: moves to the trash the images in assets folders that no
  `.nfo` references, with prior confirmation.
- **Export** the whole kit to a `.zip` with progress and cancellation.
- **Preview** that mimics the FL Studio browser, with a configurable background
  and light/dark themes.

## Icon preview

KitForge does not include the icon PNGs from the original artifact. Most of the
`IconIndex` values in the FL Studio browser are glyphs from the **ILGlyphsEx**
font that FL Studio installs in `Help\fonts`. On startup, KitForge locates that
font in the FL Studio installation, loads it into the renderer and paints the
glyph corresponding to each index. If FL Studio is not installed, the panel
shows the number (`#772`) as a fallback.

The index → code point table is in `src/renderer/icons.js`. It was derived from
the FL Studio 2026 font; in older versions some glyph may be missing. A few
internal icons (robot, graphs, steps, automation, fades…) have no equivalent
glyph; for those, custom SVGs are drawn, without reusing resources from the
original. If the font is in an unusual path, it can be specified with the
`KITFORGE_ICON_FONT` environment variable before starting:

```powershell
$env:KITFORGE_ICON_FONT = "D:\FL Studio\Help\fonts\ILGlyphsEx.ttf"
npm start
```

The ILGlyphsEx font belongs to Image-Line: KitForge reads it from the user's
installation and does not redistribute it.

## `.nfo` format

For the `drums/` folder, FL Studio reads the sibling file `drums.nfo`:

```ini
Color=$a34fff      ; BGR with a $ prefix; the UI uses #ff4fa3
IconIndex=772
HeightOfs=0
SortGroup=13
Tip=Punchy drums
Bitmap=-/badge 1.png
Visible=True
```

Format decisions implemented:

- The color is stored in **BGR** order (`$BBGGRR`), not RGB. `$AABBGGRR` is also
  accepted when reading.
- If the style becomes empty, KitForge **deletes** the `.nfo` instead of leaving
  a file with empty lines.
- Unknown keys are preserved as-is when rewriting the file.
- For folders with a dot in the name (`Kit v1.0`), both `Kit v1.0.nfo` (exact
  match, takes priority) and `Kit v1.nfo` (without the extension) are accepted,
  avoiding claiming a sibling's `.nfo`.
- System folders (`.git`, `$RECYCLE.BIN`, `System Volume Information`, etc.) are
  ignored. Junk files (`Thumbs.db`, `.DS_Store`, `._*`) are not exported.

## Architecture

```
kitforge/
├─ src/
│  ├─ core/
│  │  ├─ nfo.js       # parse/serialize, BGR, unknown keys
│  │  ├─ tree.js      # sorting, reordering, paths, filters
│  │  └─ kit.js       # scan, apply, assets, cleanup, zip
│  ├─ main/
│  │  └─ main.js      # window, image protocol, IPC
│  ├─ preload/
│  │  └─ preload.js   # minimal surface for the renderer
│  └─ renderer/
│     ├─ index.html
│     ├─ styles.css
│     ├─ icons.js     # index → ILGlyphsEx glyph + custom SVGs
│     └─ app.js       # state, editing, tree, inspector, preview
├─ build/             # app icons for electron-builder
├─ test/              # node:test (core)
└─ package.json       # scripts, dependencies and build configuration
```

- **No bundler**: CommonJS in main/preload and classic JavaScript in the
  renderer. Fewer pieces and easier to audit.
- **Pure, testable core**: `core/` does not import Electron. It is tested with
  `node --test`.
- **Change draft**: `edits[folder]` stores only the keys that differ from the
  original `.nfo`. A `null` value means "remove this key". On apply, it is
  merged with the original, the `null`s are removed and it is serialized.
- **History**: undo/redo with gesture coalescing (the color slider and keyboard
  do not generate one entry per pixel).
- **Validated IPC**: every handler checks that the message comes from the local
  main frame (`file://`). The renderer has no access to Node.
- **`kitforge-asset://` protocol**: serves images only if they are inside an
  open root and have an image extension. Generic `file://` is not exposed.
- **CSP**: `default-src 'self'`, no inline scripts; images from `data:` and the
  custom protocol; the icon font is loaded as `data:`.
- **Atomic export**: a `.part` file is written and renamed when finished; if it
  is canceled or fails, the `.part` is deleted.

## Evidence from the original artifact

Analysis performed with REA on
`%LOCALAPPDATA%\Programs\KitSkin\resources\app.asar` (55,486,673 bytes,
SHA-256 `22117846…b6471688`):

- `ev_390f0c46…b999b790`: run over the whole app; 6,889 files, 3,944 JS files
  parsed. The run exhausted the 300 s budget before finishing the renderer
  bundle.
- `ev_38a99519…bfe756713`: run targeted at `out/main/index.js` and
  `out/preload/index.js`; it identified 1 `BrowserWindow`, 29 members exposed
  in the preload, 26 IPC handlers and **no sender validation** in the original.

From that, the following were documented: sibling `.nfo`, BGR colors, deletion
when empty, `SortGroup` with descending order, asset detection by `Bitmap`
prefix or `-` folder, zip export, license/trial and the Style panel flow. The
clean copy **does not reuse** that code: it adds origin validation, CSP,
sandbox, an allowlisted protocol and its own UI.

Evidence → function map:

| Observed behavior                            | Implementation in KitForge              |
| -------------------------------------------- | --------------------------------------- |
| `.nfo` sibling of the folder                 | `nfoPathForFolder` / `applySpecs`       |
| `Color=$BBGGRR`                              | `cssToNfoColor` / `nfoToCssColor`       |
| Delete `.nfo` when no style remains          | `isSpecEmpty` + `applySpecs`            |
| `SortGroup` highest on top, ties by name     | `sortNodes` / `sortTree`                |
| Asset detection by `Bitmap`                  | `findAssetsDir` / `ensureAssetsDir`     |
| Numbered and deduplicated badges             | `saveBadge` / `nextFileName`            |
| Cleanup of unused images                     | `cleanupUnusedAssets`                   |
| Zip export                                   | `exportKit` with `archiver`             |

## Tests

`npm test` covers:

- `.nfo` round trip, key order, unknown keys, BGR colors, `$AABBGGRR`, empty
  specs and naming convention.
- Scanning: order, nesting, depth 6, natural names, exact vs. extensionless
  `.nfo`, collisions between siblings, missing bitmaps.
- Apply: writing, deletion when emptied, per-folder errors without aborting the
  batch.
- Folders: creation, name validation, collisions, renaming of the folder and
  its `.nfo`, and updating `Bitmap` references.
- Assets: creation of `-`/`-.nfo`, numbering, byte-level deduplication, cover
  art, `Bitmap` detection, image reading.
- Cleanup: only unreferenced images, respecting the `keep` list.
- Export: zip header, `.part` removed, rejection of destinations inside the
  kit.
- Tree utilities: sorting, block reordering, paths and filters.
- Icon catalog: 198 non-overlapping indexes, font private use area, segmented
  digits, routing and fallback SVGs.

`npm run smoke` verifies that the window loads, that the preload exposes the
API, that the panels exist, that the catalog has 198 entries and whether the
FL Studio icon font was found. `npm run e2e` opens a temporary kit, selects a
folder, applies color/icon/tooltip, checks the `.nfo` on disk, undoes the apply
and verifies that the file returns to its original content. It also loads a
real badge through the custom protocol, checks that an `apply` outside the open
root is rejected without writing anything, exports the kit to a zip and
simulates a drag to verify that the tree is not rebuilt during the gesture and
that the new order remains pending apply. Then it creates a folder and renames
it from the UI, checking that the dialog and the tree are updated.

## Known differences

- **Icons**: `IconIndex` is written by hand; there is a glyph preview, but no
  visual selector for the full library and its PNGs are not included.
- **Badge**: automatic downscaling to 320×160; there is no interactive
  cropping.
- **Cleanup**: explicit and with confirmation; it does not run automatically on
  apply.
- **Folder operations**: folders can be created and renamed, but not duplicated
  or moved to another level. The `-` assets folder cannot be renamed so as not
  to break existing `Bitmap`s.
- **Watermark**: the original wrote a watermark line; KitForge does not write
  it.
- **Visual parity**: the original renderer bundle (1.49 MB minified) was never
  analyzed by AST, so the interface is an original design inspired by the
  observed flow, not a pixel-perfect copy.
- **Platforms**: tested on Windows x64. The title bar has variants for
  macOS/Linux, but they have not been validated.
- **Signing**: the installer and the portable build are not signed; Windows may
  warn with SmartScreen.

## Contributing

The instructions for setting up the environment, the code style and the pull
request flow are in [CONTRIBUTING.md](CONTRIBUTING.md). In short:

```powershell
npm install
npm test
npm run smoke
npm run e2e
```

Copies of code, icons or resources from the original KitSkin artifact are not
accepted. The `ILGlyphsEx` font belongs to Image-Line and is not redistributed.

## License

KitForge is released under the [MIT](LICENSE) license.

Copyright (c) 2026 KitForge contributors.

KitForge is not affiliated with Image-Line. FL Studio is a trademark of
Image-Line; this project only reads and writes the `.nfo` files used by its
browser.
