"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { ZipArchive } = require("archiver");

const {
  MAX_DEPTH,
  isIgnoredDir,
  isJunkFile,
  sortNodes,
} = require("./tree");
const {
  parseNfo,
  serializeNfo,
  isSpecEmpty,
  nfoBaseName,
} = require("./nfo");

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;
const IMAGE_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};

function toPosix(p) {
  return path.sep === "\\" ? String(p).replaceAll("\\", "/") : String(p);
}

function toNative(p) {
  return path.sep === "\\" ? String(p).replaceAll("/", "\\") : String(p);
}

function nfoPathForFolder(folderNative) {
  const parent = path.dirname(folderNative);
  return path.join(parent, nfoBaseName(path.basename(folderNative)));
}

function legacyNfoPathForFolder(folderNative) {
  return `${folderNative}.nfo`;
}

function resolveBitmapPath(folderNative, bitmap) {
  return path.resolve(path.dirname(folderNative), toNative(bitmap));
}

/* ------------------------------------------------------------------ */
/* Crear y renombrar carpetas                                          */
/* ------------------------------------------------------------------ */

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function validateFolderName(raw) {
  if (typeof raw !== "string") throw new Error("nombre de carpeta inválido");
  const name = raw.trim();
  if (!name) throw new Error("escribe un nombre para la carpeta");
  if (name === "." || name === "..") {
    throw new Error("ese nombre no es válido");
  }
  if (name.length > 120) throw new Error("el nombre es demasiado largo");
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name)) {
    throw new Error('el nombre no puede contener < > : " / \\ | ? *');
  }
  if (/[. ]$/.test(name)) {
    throw new Error("el nombre no puede terminar en punto o espacio");
  }
  if (WINDOWS_RESERVED.test(name)) {
    throw new Error("ese nombre está reservado por Windows");
  }
  if (name === "-") {
    throw new Error('"-" está reservado para la carpeta de assets');
  }
  return name;
}

function assertInsideRoot(rootNative, targetNative) {
  const rel = path.relative(rootNative, targetNative);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return;
  throw new Error("la carpeta está fuera del kit abierto");
}

async function createFolder(rootPosix, parentPosix, rawName) {
  const rootNative = path.resolve(toNative(rootPosix));
  const parentNative = path.resolve(toNative(parentPosix || rootPosix));
  assertInsideRoot(rootNative, parentNative);

  const stat = await fsp.stat(parentNative);
  if (!stat.isDirectory()) throw new Error("la ruta no es una carpeta");

  const name = validateFolderName(rawName);
  const entries = await fsp.readdir(parentNative, { withFileTypes: true });
  if (entries.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("ya existe una carpeta o archivo con ese nombre");
  }

  const dest = path.join(parentNative, name);
  await fsp.mkdir(dest);
  return { path: toPosix(dest), name };
}

/** Actualiza `Bitmap=vieja/...` a `Bitmap=nueva/...` conservando el resto. */
function rewriteBitmapFolder(text, oldName, newName) {
  return String(text).replace(
    /^(\s*Bitmap\s*=\s*)([^\r\n]*)$/gim,
    (full, prefix, value) => {
      const match = value.match(/^([^\\/]+)([\\/].*)?$/);
      if (
        !match ||
        !match[2] ||
        match[1].toLowerCase() !== oldName.toLowerCase()
      ) {
        return full;
      }
      return `${prefix}${newName}${match[2] ?? ""}`;
    },
  );
}

async function renameFolder(rootPosix, folderPosix, rawName) {
  const rootNative = path.resolve(toNative(rootPosix));
  const folderNative = path.resolve(toNative(folderPosix));
  assertInsideRoot(rootNative, folderNative);
  if (folderNative.toLowerCase() === rootNative.toLowerCase()) {
    throw new Error("no se puede renombrar la raíz del kit");
  }

  const stat = await fsp.stat(folderNative);
  if (!stat.isDirectory()) throw new Error("la ruta no es una carpeta");

  const oldName = path.basename(folderNative);
  if (oldName === "-") {
    throw new Error("la carpeta de assets no se puede renombrar");
  }
  const name = validateFolderName(rawName);
  if (name === oldName) {
    return {
      path: toPosix(folderNative),
      oldPath: toPosix(folderNative),
      name,
      warnings: [],
    };
  }

  const parentNative = path.dirname(folderNative);
  const entries = await fsp.readdir(parentNative, { withFileTypes: true });
  const clash = entries.some(
    (entry) =>
      entry.name !== oldName && entry.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) throw new Error("ya existe una carpeta o archivo con ese nombre");

  const dest = path.join(parentNative, name);
  const exactOld = `${folderNative}.nfo`;
  const primaryOld = path.join(parentNative, nfoBaseName(oldName));
  const siblingNames = entries
    .filter((entry) => entry.isDirectory() && entry.name !== oldName)
    .map((entry) => entry.name);
  const warnings = [];
  const nfoMoves = [];

  if (fs.existsSync(exactOld)) {
    nfoMoves.push({ from: exactOld, to: `${dest}.nfo` });
  }
  if (
    primaryOld.toLowerCase() !== exactOld.toLowerCase() &&
    fs.existsSync(primaryOld)
  ) {
    const primaryBase = path.basename(primaryOld).toLowerCase();
    const ownedBySibling = siblingNames.some(
      (other) => nfoBaseName(other).toLowerCase() === primaryBase,
    );
    if (!ownedBySibling) {
      const target = path.join(parentNative, nfoBaseName(name));
      if (nfoMoves.some((move) => move.to.toLowerCase() === target.toLowerCase())) {
        warnings.push(
          `se conservó ${path.basename(primaryOld)}: su nombre coincide con el .nfo principal`,
        );
      } else {
        nfoMoves.push({ from: primaryOld, to: target });
      }
    }
  }

  // Windows no distingue mayúsculas: para cambiar solo el caso se pasa por un
  // nombre temporal antes de aplicar el definitivo.
  let sourceNative = folderNative;
  let tempNative = null;
  if (oldName.toLowerCase() === name.toLowerCase()) {
    tempNative = path.join(
      parentNative,
      `.kitforge-rename-${process.pid}-${Date.now()}`,
    );
    await fsp.rename(folderNative, tempNative);
    sourceNative = tempNative;
  }

  try {
    await fsp.rename(sourceNative, dest);
  } catch (err) {
    if (tempNative) {
      await fsp.rename(tempNative, folderNative).catch(() => {});
    }
    throw err;
  }

  for (const move of nfoMoves) {
    if (fs.existsSync(move.to)) {
      warnings.push(`no se sobrescribió ${path.basename(move.to)}`);
      continue;
    }
    try {
      await fsp.rename(move.from, move.to);
    } catch (err) {
      warnings.push(
        `no se pudo renombrar ${path.basename(move.from)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // Las referencias Bitmap del mismo nivel apuntan a `carpeta/archivo`; se
  // actualizan para que los badges sigan funcionando tras el renombrado.
  const nfoFiles = entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.toLowerCase().endsWith(".nfo"),
    )
    .map((entry) => path.join(parentNative, entry.name));
  for (const move of nfoMoves) {
    if (!nfoFiles.includes(move.to)) nfoFiles.push(move.to);
  }
  for (const nfoFile of new Set(nfoFiles)) {
    try {
      if (!fs.existsSync(nfoFile)) continue;
      const before = await fsp.readFile(nfoFile, "utf8");
      const after = rewriteBitmapFolder(before, oldName, name);
      if (after !== before) await fsp.writeFile(nfoFile, after, "utf8");
    } catch (err) {
      warnings.push(
        `no se pudo actualizar ${path.basename(nfoFile)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return { path: toPosix(dest), oldPath: toPosix(folderNative), name, warnings };
}

/* ------------------------------------------------------------------ */
/* Lectura del árbol                                                   */
/* ------------------------------------------------------------------ */

function nfoConflicts(siblingNames) {
  const byTarget = new Map();
  for (const name of siblingNames) {
    const key = nfoBaseName(name).toLowerCase();
    const group = byTarget.get(key) ?? [];
    group.push(name);
    byTarget.set(key, group);
  }
  return new Map([...byTarget].filter(([, group]) => group.length > 1));
}

async function readNfoFor(folderNative, siblingNames) {
  const name = path.basename(folderNative);

  // 1) La variante exacta (`carpeta.nfo`) siempre tiene prioridad.
  const exact = legacyNfoPathForFolder(folderNative);
  try {
    return parseNfo(await fsp.readFile(exact, "utf8"));
  } catch {
    // sigue con la variante sin extensión
  }

  // 2) FL Studio también acepta el nombre sin la extensión del dossier
  //    (`Kit v1.0` -> `Kit v1.nfo`). No se toma si pertenece a un hermano.
  const primary = nfoPathForFolder(folderNative);
  if (primary === exact) return null;

  const target = path.basename(primary).toLowerCase();
  const ownedBySibling = siblingNames.some(
    (other) => other !== name && nfoBaseName(other).toLowerCase() === target,
  );
  if (ownedBySibling) return null;

  try {
    return parseNfo(await fsp.readFile(primary, "utf8"));
  } catch {
    return null;
  }
}

function bitmapFileMissing(folderNative, nfo) {
  if (!nfo?.bitmap) return false;
  return !fs.existsSync(resolveBitmapPath(folderNative, nfo.bitmap));
}

async function scanDir(dirNative, depth, maxDepth) {
  if (depth >= maxDepth) return [];

  const entries = await fsp.readdir(dirNative, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory() && !isIgnoredDir(entry.name))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );

  const siblingNames = dirs.map((entry) => entry.name);
  const clashes = nfoConflicts(siblingNames);

  return Promise.all(
    dirs.map(async (entry) => {
      const childNative = path.join(dirNative, entry.name);
      const [nfo, children] = await Promise.all([
        readNfoFor(childNative, siblingNames),
        scanDir(childNative, depth + 1, maxDepth),
      ]);
      const clash = clashes.get(nfoBaseName(entry.name).toLowerCase());
      return {
        name: entry.name,
        path: toPosix(childNative),
        depth,
        nfo,
        children,
        bitmapMissing: bitmapFileMissing(childNative, nfo),
        ...(clash
          ? { nfoClash: clash.filter((name) => name !== entry.name) }
          : {}),
      };
    }),
  );
}

/**
 * @param {string} rootPosix carpeta raíz del kit
 * @returns {Promise<Array>} nodos ordenados como los muestra FL Studio
 */
function sortTree(nodes) {
  return sortNodes(nodes, (node) => node.nfo).map((node) => ({
    ...node,
    children: sortTree(node.children ?? []),
  }));
}

async function scanTree(rootPosix, options = {}) {
  const rootNative = path.resolve(toNative(rootPosix));
  const maxDepth = options.maxDepth ?? MAX_DEPTH;
  const nodes = await scanDir(rootNative, 0, maxDepth);
  return sortTree(nodes);
}

/* ------------------------------------------------------------------ */
/* Escritura de estilos                                                */
/* ------------------------------------------------------------------ */

/**
 * @param {Array<{folderPath:string, spec:object}>} items
 */
async function applySpecs(items) {
  const results = [];
  for (const item of items) {
    try {
      const folderNative = path.resolve(toNative(item.folderPath));
      const stat = await fsp.stat(folderNative);
      if (!stat.isDirectory()) {
        throw new Error("la ruta no es una carpeta");
      }
      const nfoPath = nfoPathForFolder(folderNative);
      if (isSpecEmpty(item.spec)) {
        if (fs.existsSync(nfoPath)) await fsp.unlink(nfoPath);
      } else {
        await fsp.writeFile(nfoPath, serializeNfo(item.spec), "utf8");
      }
      results.push({ folderPath: item.folderPath, ok: true });
    } catch (err) {
      results.push({
        folderPath: item.folderPath,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Carpeta de assets y badges                                          */
/* ------------------------------------------------------------------ */

async function findAssetsDir(parentNative) {
  let entries;
  try {
    entries = await fsp.readdir(parentNative, { withFileTypes: true });
  } catch {
    return null;
  }
  const dirNames = new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );
  const counts = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".nfo")) continue;
    try {
      const spec = parseNfo(
        await fsp.readFile(path.join(parentNative, entry.name), "utf8"),
      );
      const slash = spec.bitmap?.indexOf("/") ?? -1;
      if (spec.bitmap && slash > 0) {
        const dir = spec.bitmap.slice(0, slash);
        if (dirNames.has(dir)) {
          counts.set(dir, (counts.get(dir) ?? 0) + 1);
        }
      }
    } catch {
      // .nfo ilegible: se ignora para la detección
    }
  }

  let best = null;
  for (const [dir, count] of counts) {
    if (best === null || count > counts.get(best)) best = dir;
  }
  return best ? path.join(parentNative, best) : null;
}

async function bottomSortGroup(parentNative, excludeName) {
  let entries = [];
  try {
    entries = await fsp.readdir(parentNative, { withFileTypes: true });
  } catch {
    return 0;
  }
  const groups = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || isIgnoredDir(entry.name)) continue;
    if (entry.name === excludeName) continue;
    try {
      const spec = parseNfo(
        await fsp.readFile(
          nfoPathForFolder(path.join(parentNative, entry.name)),
          "utf8",
        ),
      );
      groups.push(spec.sortGroup ?? -1);
    } catch {
      groups.push(-1);
    }
  }
  return groups.length === 0 ? 0 : Math.min(...groups) - 1;
}

/** Devuelve la carpeta de assets, creando `-` + `-.nfo` si no existe. */
async function ensureAssetsDir(parentNative) {
  const existing = await findAssetsDir(parentNative);
  if (existing) return existing;

  const assetsNative = path.join(parentNative, "-");
  await fsp.mkdir(assetsNative, { recursive: true });

  const assetsNfo = path.join(parentNative, "-.nfo");
  if (!fs.existsSync(assetsNfo)) {
    const spec = {
      iconIndex: 2,
      sortGroup: await bottomSortGroup(parentNative, "-"),
    };
    await fsp.writeFile(assetsNfo, serializeNfo(spec), "utf8");
  }
  return assetsNative;
}

async function nextFileName(dirNative, base, ext) {
  const taken = new Set(
    (await fsp.readdir(dirNative)).map((name) => name.toLowerCase()),
  );
  let candidate = `${base}${ext}`;
  for (let i = 2; taken.has(candidate.toLowerCase()); i += 1) {
    candidate = `${base} ${i}${ext}`;
  }
  return candidate;
}

async function findIdentical(dirNative, buffer, ext) {
  const entries = await fsp.readdir(dirNative, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (path.extname(entry.name).toLowerCase() !== ext.toLowerCase()) continue;
    const filePath = path.join(dirNative, entry.name);
    const stat = await fsp.stat(filePath);
    if (stat.size !== buffer.length) continue;
    const existing = await fsp.readFile(filePath);
    if (existing.equals(buffer)) return entry.name;
  }
  return null;
}

function parseImageDataUrl(dataUrl) {
  const match = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/i.exec(
    String(dataUrl),
  );
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const ext = mime === "jpeg" ? "jpg" : mime;
  if (!IMAGE_MIME[ext]) return null;
  return { ext, mime, buffer: Buffer.from(match[2], "base64") };
}

/**
 * Guarda la misma imagen en la carpeta de assets de cada destino y devuelve
 * el `Bitmap=` relativo que debe escribirse en cada `.nfo`.
 *
 * @param {string[]} targets rutas posix de carpetas
 * @param {string} dataUrl imagen (png/jpeg/webp/gif/bmp)
 */
async function saveBadge(targets, dataUrl) {
  const image = parseImageDataUrl(dataUrl);
  if (!image) throw new Error("la imagen no es un data URL válido");

  const result = {};
  for (const targetPosix of targets) {
    const targetNative = path.resolve(toNative(targetPosix));
    const parentNative = path.dirname(targetNative);
    const assetsNative = await ensureAssetsDir(parentNative);

    const existing = await findIdentical(assetsNative, image.buffer, `.${image.ext}`);
    let fileName = existing;
    if (!fileName) {
      const isCover = path.resolve(assetsNative) === path.resolve(targetNative);
      if (isCover) {
        fileName = await nextFileName(
          assetsNative,
          `${path.basename(parentNative)} cover art`,
          `.${image.ext}`,
        );
      } else {
        const names = await fsp.readdir(assetsNative);
        let max = 0;
        for (const name of names) {
          const match = /^badge (\d+)\./i.exec(name);
          if (match) max = Math.max(max, Number.parseInt(match[1], 10));
        }
        do {
          max += 1;
          fileName = `badge ${max}.${image.ext}`;
        } while (
          names.some(
            (name) => name.toLowerCase() === fileName.toLowerCase(),
          )
        );
      }
      await fsp.writeFile(path.join(assetsNative, fileName), image.buffer);
    }
    result[targetPosix] = `${path.basename(assetsNative)}/${fileName}`;
  }
  return result;
}

async function readImageDataUrl(folderPosix, bitmap) {
  if (typeof bitmap !== "string" || !bitmap) return null;
  if (bitmap.startsWith("data:")) return bitmap;
  const folderNative = path.resolve(toNative(folderPosix));
  const filePath = resolveBitmapPath(folderNative, bitmap);
  if (!IMAGE_EXT.test(filePath)) return null;
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = IMAGE_MIME[ext];
  if (!mime) return null;
  try {
    const buffer = await fsp.readFile(filePath);
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Limpieza de imágenes no referenciadas                               */
/* ------------------------------------------------------------------ */

async function collectCandidates(rootNative) {
  const candidates = new Set();
  const walk = async (dirNative, depth) => {
    if (depth >= MAX_DEPTH) return;
    let entries;
    try {
      entries = await fsp.readdir(dirNative, { withFileTypes: true });
    } catch {
      return;
    }
    const primary = await findAssetsDir(dirNative);
    if (primary) candidates.add(path.resolve(primary));
    for (const entry of entries) {
      if (!entry.isDirectory() || isIgnoredDir(entry.name)) continue;
      if (entry.name === "-") candidates.add(path.resolve(dirNative, entry.name));
      await walk(path.join(dirNative, entry.name), depth + 1);
    }
  };
  await walk(rootNative, 0);
  return candidates;
}

/**
 * Mueve a la papelera las imágenes de las carpetas de assets que ya no
 * referencia ningún `.nfo`.
 *
 * @param {string} rootPosix
 * @param {(filePath:string)=>Promise<void>} trashItem
 * @param {string[]} keep rutas nativas que deben conservarse
 */
async function cleanupUnusedAssets(rootPosix, trashItem, keep = []) {
  const rootNative = path.resolve(toNative(rootPosix));
  const tree = await scanTree(rootPosix);
  const used = new Set(keep.map((p) => path.resolve(p).toLowerCase()));

  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.nfo?.bitmap && !node.nfo.bitmap.startsWith("data:")) {
        used.add(
          resolveBitmapPath(
            path.resolve(toNative(node.path)),
            node.nfo.bitmap,
          ).toLowerCase(),
        );
      }
      walk(node.children ?? []);
    }
  };
  walk(tree);

  let removed = 0;
  const candidates = await collectCandidates(rootNative);
  for (const dir of candidates) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !IMAGE_EXT.test(entry.name)) continue;
      const filePath = path.join(dir, entry.name);
      if (used.has(path.resolve(filePath).toLowerCase())) continue;
      try {
        await trashItem(filePath);
        removed += 1;
      } catch {
        // archivo bloqueado: se deja para la próxima pasada
      }
    }
  }
  return removed;
}

/* ------------------------------------------------------------------ */
/* Exportar el kit como zip                                            */
/* ------------------------------------------------------------------ */

async function listKitFiles(rootNative) {
  const files = [];
  const dirs = [];
  let bytes = 0;
  const walk = async (dirNative) => {
    const entries = await fsp.readdir(dirNative, { withFileTypes: true });
    for (const entry of entries) {
      if (isJunkFile(entry.name)) continue;
      const abs = path.join(dirNative, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        dirs.push(abs);
        await walk(abs);
      } else if (entry.isFile()) {
        const stat = await fsp.stat(abs);
        files.push({ abs, size: stat.size });
        bytes += stat.size;
      }
    }
  };
  await walk(rootNative);
  return { files, dirs, bytes };
}

async function exportKit(rootPosix, destNative, options = {}) {
  const rootNative = path.resolve(toNative(rootPosix));
  const dest = path.resolve(toNative(destNative));
  const rel = path.relative(rootNative, dest);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
    throw new Error("elige una ubicación fuera de la carpeta del kit");
  }

  const listing = await listKitFiles(rootNative);
  const kitName = path.basename(rootNative);
  const part = `${dest}.part`;
  const output = fs.createWriteStream(part);
  const archive = new ZipArchive({ zlib: { level: 6 } });

  output.on("close", () => {});
  const finished = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") reject(err);
    });
  });

  if (options.onProgress) {
    archive.on("progress", (data) =>
      options.onProgress(data.fs.processedBytes, listing.bytes),
    );
  }
  const onAbort = () => archive.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    archive.pipe(output);
    for (const dir of listing.dirs) {
      archive.append("", {
        name: `${kitName}/${toPosix(path.relative(rootNative, dir))}/`,
      });
    }
    for (const file of listing.files) {
      archive.file(file.abs, {
        name: `${kitName}/${toPosix(path.relative(rootNative, file.abs))}`,
      });
    }
    await archive.finalize();
    await finished;
    if (options.signal?.aborted) throw new Error("exportación cancelada");
    await fsp.rename(part, dest);
    const stat = await fsp.stat(dest);
    return {
      files: listing.files.length,
      bytes: listing.bytes,
      zipBytes: stat.size,
    };
  } catch (err) {
    await fsp.rm(part, { force: true }).catch(() => {});
    throw options.signal?.aborted
      ? new Error("exportación cancelada")
      : err;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}

module.exports = {
  IMAGE_EXT,
  IMAGE_MIME,
  toPosix,
  toNative,
  nfoPathForFolder,
  resolveBitmapPath,
  validateFolderName,
  createFolder,
  renameFolder,
  scanTree,
  applySpecs,
  findAssetsDir,
  ensureAssetsDir,
  saveBadge,
  readImageDataUrl,
  cleanupUnusedAssets,
  exportKit,
};
