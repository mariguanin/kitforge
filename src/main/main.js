"use strict";

const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  protocol,
  session,
  shell,
} = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const kit = require("../core/kit");

const SMOKE = process.argv.includes("--smoke");
const E2E = process.argv.includes("--e2e");
const TEST_PARTITION = "kitforge-test";
const ASSET_SCHEME = "kitforge-asset";

/** Raíces abiertas en esta sesión: única superficie que sirve el protocolo. */
const activeRoots = new Set();
let mainWindow = null;
let exportController = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: { standard: true, secure: true, stream: true },
  },
]);

function isTrusted(event) {
  const frame = event.senderFrame;
  if (!frame || frame.parent) return false;
  return String(frame.url).startsWith("file://");
}

/** Envuelve un handler IPC con la comprobación de origen. */
function guard(handler) {
  return (event, ...args) => {
    if (!isTrusted(event)) {
      throw new Error("origen IPC no autorizado");
    }
    return handler(event, ...args);
  };
}

function rememberRoot(rootPosix) {
  if (typeof rootPosix === "string" && rootPosix) activeRoots.add(rootPosix);
}

function isInsideActiveRoot(filePath) {
  const resolved = path.resolve(filePath);
  for (const root of activeRoots) {
    const rel = path.relative(path.resolve(kit.toNative(root)), resolved);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return true;
  }
  return false;
}

function isActiveRoot(rootPosix) {
  const target = path.resolve(kit.toNative(rootPosix));
  for (const root of activeRoots) {
    if (
      path.resolve(kit.toNative(root)).toLowerCase() === target.toLowerCase()
    ) {
      return true;
    }
  }
  return false;
}

function assetPathFromUrl(rawUrl) {
  const pathname = decodeURIComponent(new URL(rawUrl).pathname);
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}

function registerAssetProtocol() {
  const activeSession =
    SMOKE || E2E
      ? session.fromPartition(TEST_PARTITION)
      : session.defaultSession;
  activeSession.protocol.handle(ASSET_SCHEME, async (request) => {
    let filePath;
    try {
      filePath = assetPathFromUrl(request.url);
    } catch {
      return new Response("bad request", { status: 400 });
    }
    if (!kit.IMAGE_EXT.test(filePath)) {
      return new Response("forbidden", { status: 403 });
    }
    if (!isInsideActiveRoot(filePath)) {
      return new Response("forbidden", { status: 403 });
    }
    try {
      const data = await fsp.readFile(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      return new Response(data, {
        headers: {
          "content-type": kit.IMAGE_MIME[ext] ?? "application/octet-stream",
          "cache-control": "no-cache",
        },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Fuente de iconos de FL Studio                                       */
/* ------------------------------------------------------------------ */

const ICON_FONT_FILES = ["ILGlyphsEx.ttf", "ILGlyphsEx.otf", "ILGlyphsEx.woff"];
let iconFontPromise = null;

async function isFile(filePath) {
  try {
    return (await fsp.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function iconFontDirs(root) {
  return [
    path.join(root, "Help", "fonts"),
    path.join(root, "Resources", "Help", "fonts"),
    path.join(root, "Contents", "Resources", "Help", "fonts"),
    path.join(root, "Contents", "Resources", "fonts"),
  ];
}

/** Busca ILGlyphsEx en instalaciones habituales de FL Studio. */
async function findIconFont() {
  const override = process.env.KITFORGE_ICON_FONT;
  if (override && (await isFile(override))) return override;

  const roots = [];
  if (process.platform === "win32") {
    for (const key of ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"]) {
      const base = process.env[key];
      if (base) roots.push(path.join(base, "Image-Line"));
    }
  } else if (process.platform === "darwin") {
    roots.push("/Applications/FL Studio.app");
    roots.push(path.join(os.homedir(), "Applications/FL Studio.app"));
  } else {
    roots.push(
      path.join(os.homedir(), ".wine/drive_c/Program Files/Image-Line"),
    );
    roots.push("/opt/FL Studio");
  }

  const dirs = [];
  for (const root of roots) {
    dirs.push(...iconFontDirs(root));
    try {
      const entries = await fsp.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && /^FL Studio/i.test(entry.name)) {
          dirs.push(...iconFontDirs(path.join(root, entry.name)));
        }
      }
    } catch {
      // La instalación no está en esta ruta.
    }
  }

  for (const dir of dirs) {
    for (const name of ICON_FONT_FILES) {
      const candidate = path.join(dir, name);
      if (await isFile(candidate)) return candidate;
    }
  }
  return null;
}

function loadIconFont() {
  if (!iconFontPromise) {
    iconFontPromise = (async () => {
      try {
        const fontPath = await findIconFont();
        if (!fontPath) {
          return { ok: false, error: "no se encontró ILGlyphsEx" };
        }
        const ext = path.extname(fontPath).slice(1).toLowerCase();
        const mime =
          ext === "otf"
            ? "font/otf"
            : ext === "woff"
              ? "font/woff"
              : "font/ttf";
        const data = await fsp.readFile(fontPath);
        return {
          ok: true,
          format: ext,
          path: kit.toPosix(fontPath),
          dataUrl: `data:${mime};base64,${data.toString("base64")}`,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })();
  }
  return iconFontPromise;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1020,
    minHeight: 680,
    show: false,
    backgroundColor: "#0b0b0f",
    title: "KitForge",
    titleBarStyle:
      process.platform === "win32"
        ? "hidden"
        : process.platform === "darwin"
          ? "hiddenInset"
          : "default",
    ...(process.platform === "win32"
      ? {
          titleBarOverlay: {
            color: "#0b0b0f",
            symbolColor: "#e7e7ee",
            height: 46,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Los modos de prueba usan una partición en memoria: no heredan el
      // último kit abierto ni dejan rastro en el perfil del usuario.
      ...(SMOKE || E2E ? { partition: TEST_PARTITION } : {}),
    },
  });

  win.once("ready-to-show", () => {
    if (!SMOKE && !E2E) win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadFile(path.join(__dirname, "../renderer/index.html"));
  return win;
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function registerIpc() {
  ipcMain.handle(
    "kit:choose",
    guard(async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: "Elegir carpeta del kit",
        buttonLabel: "Usar este kit",
        properties: ["openDirectory"],
      });
      if (canceled || !filePaths[0]) return null;
      const root = kit.toPosix(filePaths[0]);
      rememberRoot(root);
      return root;
    }),
  );

  ipcMain.handle(
    "kit:resolve-dropped",
    guard(async (_event, rawPath) => {
      if (typeof rawPath !== "string" || !rawPath) return null;
      try {
        const stat = await fsp.stat(rawPath);
        if (!stat.isDirectory()) return null;
        const root = kit.toPosix(path.resolve(rawPath));
        rememberRoot(root);
        return root;
      } catch {
        return null;
      }
    }),
  );

  ipcMain.handle(
    "kit:scan",
    guard(async (_event, rootPosix) => {
      if (typeof rootPosix !== "string" || !rootPosix) {
        throw new Error("ruta de kit inválida");
      }
      const stat = await fsp.stat(kit.toNative(rootPosix));
      if (!stat.isDirectory()) throw new Error("la ruta no es una carpeta");
      rememberRoot(rootPosix);
      return kit.scanTree(rootPosix);
    }),
  );

  ipcMain.handle(
    "kit:create-folder",
    guard(async (_event, rootPosix, parentPosix, name) => {
      if (typeof rootPosix !== "string" || !isActiveRoot(rootPosix)) {
        throw new Error("kit no autorizado");
      }
      return kit.createFolder(rootPosix, parentPosix, name);
    }),
  );

  ipcMain.handle(
    "kit:rename-folder",
    guard(async (_event, rootPosix, folderPosix, name) => {
      if (typeof rootPosix !== "string" || !isActiveRoot(rootPosix)) {
        throw new Error("kit no autorizado");
      }
      return kit.renameFolder(rootPosix, folderPosix, name);
    }),
  );

  ipcMain.handle(
    "kit:apply",
    guard(async (_event, items) => {
      if (!Array.isArray(items)) throw new Error("lista de cambios inválida");
      const clean = items
        .filter((item) => item && typeof item.folderPath === "string")
        .map((item) => ({
          folderPath: item.folderPath,
          spec: item.spec && typeof item.spec === "object" ? item.spec : {},
        }));

      const authorized = [];
      const denied = [];
      for (const item of clean) {
        if (isInsideActiveRoot(item.folderPath)) authorized.push(item);
        else {
          denied.push({
            folderPath: item.folderPath,
            ok: false,
            error: "carpeta fuera del kit abierto",
          });
        }
      }

      const results = await kit.applySpecs(authorized);
      return [...results, ...denied];
    }),
  );

  ipcMain.handle(
    "kit:save-badge",
    guard(async (_event, targets, dataUrl) => {
      if (!Array.isArray(targets) || targets.length === 0) {
        throw new Error("no hay carpetas de destino");
      }
      const clean = targets.filter((target) => typeof target === "string");
      for (const target of clean) {
        if (!isInsideActiveRoot(target)) {
          throw new Error("carpeta fuera del kit abierto");
        }
      }
      return kit.saveBadge(clean, dataUrl);
    }),
  );

  ipcMain.handle(
    "kit:pick-image",
    guard(async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: "Elegir imagen",
        buttonLabel: "Usar imagen",
        properties: ["openFile"],
        filters: [
          {
            name: "Imágenes",
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
          },
        ],
      });
      if (canceled || !filePaths[0]) return null;
      const filePath = filePaths[0];
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime = kit.IMAGE_MIME[ext];
      if (!mime) return null;
      const buffer = await fsp.readFile(filePath);
      return {
        name: path.basename(filePath),
        dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
      };
    }),
  );

  ipcMain.handle(
    "font:icon",
    guard(() => loadIconFont()),
  );

  ipcMain.handle(
    "kit:cleanup",
    guard(async (_event, rootPosix, keep) => {
      if (typeof rootPosix !== "string" || !rootPosix) return 0;
      if (!isActiveRoot(rootPosix)) throw new Error("kit no autorizado");
      return kit.cleanupUnusedAssets(
        rootPosix,
        (filePath) => shell.trashItem(filePath),
        Array.isArray(keep) ? keep : [],
      );
    }),
  );

  ipcMain.handle(
    "kit:export",
    guard(async (event, rootPosix) => {
      if (typeof rootPosix !== "string" || !rootPosix) {
        return { ok: false, error: "no hay kit abierto" };
      }
      if (!isActiveRoot(rootPosix)) {
        return { ok: false, error: "kit no autorizado" };
      }
      const win = BrowserWindow.fromWebContents(event.sender);
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: "Exportar kit como zip",
        buttonLabel: "Exportar",
        defaultPath: path.join(
          app.getPath("downloads"),
          `${path.basename(kit.toNative(rootPosix))}.zip`,
        ),
        filters: [{ name: "Zip", extensions: ["zip"] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };

      exportController?.abort();
      const controller = new AbortController();
      exportController = controller;
      let lastSent = 0;

      try {
        const result = await kit.exportKit(rootPosix, filePath, {
          signal: controller.signal,
          onProgress: (done, total) => {
            const now = Date.now();
            if (done < total && now - lastSent < 100) return;
            lastSent = now;
            if (!event.sender.isDestroyed()) {
              event.sender.send("kit:export-progress", { done, total });
            }
          },
        });
        return { ok: true, path: kit.toPosix(filePath), ...result };
      } catch (err) {
        return {
          ok: false,
          canceled: controller.signal.aborted,
          error: err instanceof Error ? err.message : String(err),
        };
      } finally {
        if (exportController === controller) exportController = null;
      }
    }),
  );

  ipcMain.handle(
    "kit:export-cancel",
    guard(() => {
      exportController?.abort();
    }),
  );

  ipcMain.handle(
    "kit:reveal",
    guard((_event, targetPath) => {
      if (typeof targetPath !== "string" || !targetPath) return;
      if (!isInsideActiveRoot(targetPath) && !isActiveRoot(targetPath)) return;
      shell.showItemInFolder(kit.toNative(targetPath));
    }),
  );

  ipcMain.on("window:theme", (event, theme) => {
    if (!isTrusted(event)) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || process.platform !== "win32") return;
    const palette =
      theme === "light"
        ? { color: "#f2f2f5", symbolColor: "#242430", height: 46 }
        : { color: "#0b0b0f", symbolColor: "#e7e7ee", height: 46 };
    win.setTitleBarOverlay(palette);
  });
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

function runSmokeTest(win) {
  const fail = (message) => {
    console.error(`SMOKE_ERROR ${message}`);
    app.exit(1);
  };
  const timer = setTimeout(() => fail("timeout de arranque"), 20000);
  win.webContents.on("console-message", (details) => {
    if (details.level === "error") {
      console.error(`SMOKE_CONSOLE ${details.message}`);
    }
  });
  win.webContents.once("did-fail-load", (_event, code, description) => {
    clearTimeout(timer);
    fail(`did-fail-load ${code} ${description}`);
  });
  win.webContents.once("did-finish-load", async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        let iconFont = false;
        try {
          const font = await window.kitforge.loadIconFont();
          iconFont = !!(font && font.ok && font.dataUrl);
        } catch {}
        return {
          api: Object.keys(window.kitforge ?? {}).length,
          app: !!document.getElementById("app"),
          tree: !!document.getElementById("tree"),
          inspector: !!document.getElementById("inspector"),
          icons: Object.keys(window.KitForgeIcons?.glyphs ?? {}).length +
            Object.keys(window.KitForgeIcons?.svgs ?? {}).length,
          iconFont,
          title: document.title
        };
      })()`);
      console.log(`SMOKE_RESULT ${JSON.stringify(result)}`);
      clearTimeout(timer);
      if (!result.iconFont) console.error("SMOKE_WARN fuente de iconos ausente");
      const ok =
        result.app &&
        result.tree &&
        result.inspector &&
        result.api > 0 &&
        result.icons === 198;
      app.exit(ok ? 0 : 1);
    } catch (err) {
      clearTimeout(timer);
      fail(err instanceof Error ? err.message : String(err));
    }
  });
}

/* ------------------------------------------------------------------ */
/* E2E (desarrollo)                                                    */
/* ------------------------------------------------------------------ */

function runE2E(win) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitforge-e2e-"));
  const drums = path.join(root, "drums");
  const assets = path.join(root, "-");
  const nfoFile = path.join(root, "drums.nfo");
  const exportPath = `${root}-export.zip`;
  const original = "SortGroup=5\nTip=old\nBitmap=-/badge 1.png\n";
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  fs.mkdirSync(drums);
  fs.mkdirSync(assets);
  fs.writeFileSync(path.join(assets, "badge 1.png"), png);
  fs.writeFileSync(nfoFile, original);

  const cleanup = () => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(exportPath, { force: true });
    } catch {
      // la carpeta temporal se puede borrar a mano
    }
  };

  const failed = (message) => {
    console.error(`E2E_ERROR ${message}`);
    cleanup();
    app.exit(1);
  };

  const timer = setTimeout(() => failed("timeout global"), 30000);

  win.webContents.on("console-message", (details) => {
    if (E2E) {
      console.error(`E2E_CONSOLE ${details.level} ${details.message}`);
    } else if (details.level === "error") {
      console.error(`E2E_CONSOLE ${details.message}`);
    }
  });

  win.webContents.once("did-finish-load", async () => {
    try {
      const rootPosix = kit.toPosix(root);

      const interactions = await win.webContents.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (fn, label) => {
          const started = Date.now();
          while (Date.now() - started < 8000) {
            try {
              const value = fn();
              if (value) return value;
            } catch {}
            await sleep(50);
          }
          throw new Error("timeout " + label);
        };

        await window.openRoot(${JSON.stringify(rootPosix)});

        const row = await waitFor(
          () => [...document.querySelectorAll(".row")].find(
            (node) => node.querySelector(".name")?.textContent === "drums",
          ),
          "fila drums",
        );
        row.click();
        document.querySelector('.swatch[data-color="#ff4fa3"]').click();

        const badge = document.querySelector("#badge-preview");
        await waitFor(
          () => !badge.hidden && badge.complete && badge.naturalWidth > 0,
          "badge cargado por el protocolo",
        );

        const icon = document.querySelector("#icon-input");
        icon.value = "772";
        icon.dispatchEvent(new Event("input", { bubbles: true }));

        const iconPreview = document.querySelector("#icon-preview");
        await waitFor(
          () =>
            iconPreview.classList.contains("is-glyph") ||
            iconPreview.classList.contains("is-index"),
          "preview del icono",
        );

        const tip = document.querySelector("#tip-input");
        tip.value = "Punchy";
        tip.dispatchEvent(new Event("input", { bubbles: true }));

        const apply = document.querySelector("#apply");
        if (apply.disabled) throw new Error("apply deshabilitado tras editar");
        apply.click();

        await waitFor(
          () =>
            document.querySelector("#status").textContent.includes("estilizadas"),
          "status estilizadas",
        );

        return {
          status: document.querySelector("#status").textContent,
          rows: document.querySelectorAll(".row").length,
          undoEnabled: !document.querySelector("#undo-apply").disabled,
          badgeWidth: badge.naturalWidth,
          iconClass: iconPreview.classList.contains("is-glyph") ? "glyph" : "index",
          iconCode: iconPreview.textContent.codePointAt(0) ?? 0,
        };
      })()`);

      const font = await loadIconFont();
      if (font.ok && interactions.iconClass !== "glyph") {
        throw new Error("el icono 772 no se previsualizó con la fuente");
      }
      if (font.ok && interactions.iconCode !== 0xf404) {
        throw new Error(
          `glifo inesperado para el icono 772: U+${interactions.iconCode.toString(16).toUpperCase()}`,
        );
      }

      const outsidePosix = kit.toPosix(`${root}-outside`);
      const denied = await win.webContents.executeJavaScript(`(async () => {
        try {
          const results = await window.kitforge.apply([{
            folderPath: ${JSON.stringify(outsidePosix)},
            spec: { color: "#ffffff" },
          }]);
          return results.length === 1 &&
            results[0].ok === false &&
            String(results[0].error).includes("fuera del kit abierto");
        } catch {
          return false;
        }
      })()`);
      if (!denied) {
        throw new Error("apply fuera del kit abierto no fue rechazado");
      }
      if (fs.existsSync(`${root}-outside.nfo`)) {
        throw new Error("se escribió un .nfo fuera del kit abierto");
      }

      const written = await fsp.readFile(nfoFile, "utf8");
      if (!written.includes("Color=$a34fff")) {        throw new Error(`color no escrito: ${written}`);
      }
      if (!written.includes("IconIndex=772")) {
        throw new Error(`icono no escrito: ${written}`);
      }
      if (!written.includes("Tip=Punchy")) {
        throw new Error(`tip no escrito: ${written}`);
      }
      if (!written.includes("SortGroup=5")) {
        throw new Error("se perdió el SortGroup existente");
      }
      if (!interactions.undoEnabled) {
        throw new Error("undo no se habilitó tras aplicar");
      }

      const undo = await win.webContents.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (fn, label) => {
          const started = Date.now();
          while (Date.now() - started < 8000) {
            try {
              const value = fn();
              if (value) return value;
            } catch {}
            await sleep(50);
          }
          throw new Error("timeout " + label);
        };

        document.querySelector("#undo-apply").click();
        await waitFor(
          () =>
            document.querySelector("#status").textContent.includes("apply deshecho"),
          "status apply deshecho",
        );

        return {
          status: document.querySelector("#status").textContent,
          applyEnabled: !document.querySelector("#apply").disabled,
        };
      })()`);

      const restored = await fsp.readFile(nfoFile, "utf8");
      if (restored !== original) {
        throw new Error(`undo no restauró el .nfo: ${JSON.stringify(restored)}`);
      }
      if (!undo.applyEnabled) {
        throw new Error("los cambios no quedaron como pendientes tras el undo");
      }

      const exported = await kit.exportKit(kit.toPosix(root), exportPath);
      const zipHead = (await fsp.readFile(exportPath))
        .subarray(0, 2)
        .toString("latin1");
      if (zipHead !== "PK" || exported.zipBytes <= 0) {
        throw new Error("la exportación zip no produjo un archivo válido");
      }
      await fsp.rm(exportPath, { force: true });

      await fsp.mkdir(path.join(root, "aaa"));
      await fsp.mkdir(path.join(root, "zzz"));

      const reorderRows = await win.webContents.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (fn, label) => {
          const started = Date.now();
          while (Date.now() - started < 8000) {
            try {
              const value = fn();
              if (value) return value;
            } catch {}
            await sleep(50);
          }
          throw new Error("timeout " + label);
        };
        const rowFor = (name) => [...document.querySelectorAll(".row")]
          .find((node) => node.querySelector(".name")?.textContent === name);

        await window.openRoot(${JSON.stringify(rootPosix)});
        const dragged = await waitFor(() => rowFor("drums"), "fila drums");
        const target = await waitFor(() => rowFor("zzz"), "fila zzz");
        const data = new DataTransfer();
        dragged.dispatchEvent(new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        }));
        const rect = target.getBoundingClientRect();
        const clientY = rect.bottom - 1;
        target.dispatchEvent(new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
          clientY,
        }));
        if (!dragged.isConnected || !target.isConnected) {
          throw new Error("el árbol se reconstruyó durante el arrastre");
        }
        target.dispatchEvent(new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
          clientY,
        }));
        await waitFor(
          () => [...document.querySelectorAll(".row")].pop() === rowFor("drums"),
          "orden tras soltar",
        );
        return [...document.querySelectorAll(".row")]
          .map((node) => node.querySelector(".name")?.textContent);
      })()`);
      if (reorderRows.join(",") !== "-,aaa,zzz,drums") {
        throw new Error(`el orden arrastrado no se aplicó: ${reorderRows.join(",")}`);
      }

      const folderUi = await win.webContents.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (fn, label) => {
          const started = Date.now();
          while (Date.now() - started < 8000) {
            try {
              const value = fn();
              if (value) return value;
            } catch {}
            await sleep(50);
          }
          throw new Error("timeout " + label);
        };
        const rowFor = (name) => [...document.querySelectorAll(".row")]
          .find((node) => node.querySelector(".name")?.textContent === name);
        const dialog = document.querySelector("#name-dialog");
        const input = document.querySelector("#name-input");

        document.querySelector("#new-folder").click();
        await waitFor(() => dialog.open, "diálogo nueva carpeta");
        input.value = "Nueva carpeta";
        document.querySelector("#name-form").requestSubmit();
        const created = await waitFor(
          () => rowFor("Nueva carpeta"),
          "fila creada",
        );

        await waitFor(
          () => !document.querySelector("#rename-folder").disabled,
          "botón renombrar habilitado",
        );
        document.querySelector("#rename-folder").click();
        await waitFor(() => dialog.open, "diálogo renombrar");
        input.value = "Renombrada";
        document.querySelector("#name-form").requestSubmit();
        await waitFor(() => rowFor("Renombrada"), "fila renombrada");

        return {
          created: !!created,
          selected: rowFor("Renombrada").classList.contains("selected"),
          rows: [...document.querySelectorAll(".row")]
            .map((node) => node.querySelector(".name")?.textContent),
        };
      })()`);
      if (!folderUi.created || !folderUi.selected) {
        throw new Error("la creación o el renombrado de carpetas falló");
      }

      await win.webContents.executeJavaScript(
        "localStorage.removeItem('kitforge:root')",
      );

      if (process.env.KITFORGE_E2E_SCREENSHOT) {
        win.show();
        await new Promise((resolve) => setTimeout(resolve, 300));
        const image = await win.webContents.capturePage();
        await fsp.writeFile(process.env.KITFORGE_E2E_SCREENSHOT, image.toPNG());
      }

      clearTimeout(timer);
      cleanup();
      console.log(
        `E2E_RESULT ${JSON.stringify({
          rows: interactions.rows,
          status: interactions.status,
          undoStatus: undo.status,
          zipBytes: exported.zipBytes,
          reorder: reorderRows,
          folders: folderUi.rows,
        })}`,
      );
      app.exit(0);
    } catch (err) {
      clearTimeout(timer);
      const diagnostic = await win.webContents
        .executeJavaScript(`(() => {
          const img = document.querySelector("#badge-preview");
          return {
            badge: img
              ? { src: img.src, hidden: img.hidden, width: img.naturalWidth }
              : null,
            tree: [...document.querySelectorAll(".badge-mini")].map((node) => ({
              src: node.src,
              width: node.naturalWidth,
            })),
          };
        })()`)
        .catch(() => null);
      if (diagnostic) console.error(`E2E_DIAG ${JSON.stringify(diagnostic)}`);
      failed(err instanceof Error ? err.message : String(err));
    }
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerAssetProtocol();
  registerIpc();
  mainWindow = createWindow();

  if (E2E) runE2E(mainWindow);
  else if (SMOKE) runSmokeTest(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
