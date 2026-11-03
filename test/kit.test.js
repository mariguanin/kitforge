"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const kit = require("../src/core/kit");
const { flattenTree } = require("../src/core/tree");

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_ALT =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function makeRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitforge-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function mkdir(...parts) {
  const dir = path.join(...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function names(nodes) {
  return nodes.map((node) => node.name);
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

test("scanTree lee los .nfo hermanos y ordena como FL Studio", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "bass");
  mkdir(root, "drums");
  mkdir(root, "piano");
  mkdir(root, ".git", "ignored");
  mkdir(root, "drums", "kicks");
  mkdir(root, "drums", "snares");

  writeFile(path.join(root, "drums.nfo"), "Color=$a34fff\nSortGroup=10\nExtra=keep\n");
  writeFile(path.join(root, "bass.nfo"), "SortGroup=10\n");
  writeFile(path.join(root, "piano.nfo"), "SortGroup=20\n");
  writeFile(path.join(root, "drums", "kicks.nfo"), "SortGroup=5\n");
  writeFile(path.join(root, "drums", "snares.nfo"), "SortGroup=9\n");

  const tree = await kit.scanTree(kit.toPosix(root));

  assert.deepEqual(names(tree), ["piano", "bass", "drums"]);
  assert.deepEqual(names(tree[2].children), ["snares", "kicks"]);

  const drums = tree[2];
  assert.equal(drums.nfo.color, "#ff4fa3");
  assert.equal(drums.nfo.sortGroup, 10);
  assert.deepEqual(drums.nfo.unknown, { Extra: "keep" });
  assert.equal(drums.depth, 0);
  assert.equal(tree[2].children[0].depth, 1);

  const flat = flattenTree(tree);
  assert.equal(flat.length, 5);
  assert.equal(flat.some((node) => node.name === "ignored"), false);
});

test("scanTree ordena nombres con números de forma natural", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "Kit 10");
  mkdir(root, "Kit 2");
  mkdir(root, "Kit 1");

  const tree = await kit.scanTree(kit.toPosix(root));
  assert.deepEqual(names(tree), ["Kit 1", "Kit 2", "Kit 10"]);
  assert.equal(tree[0].nfo, null);
});

test("scanTree respeta el límite de profundidad (6 niveles)", async (t) => {
  const root = makeRoot(t);
  let current = root;
  for (const name of ["a", "b", "c", "d", "e", "f", "g"]) {
    current = mkdir(current, name);
  }

  const tree = await kit.scanTree(kit.toPosix(root));
  assert.deepEqual(
    flattenTree(tree).map((node) => node.name),
    ["a", "b", "c", "d", "e", "f"],
  );
});

test("scanTree acepta la variante `carpeta.nfo` para nombres con punto", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "Kit v1.0");
  writeFile(path.join(root, "Kit v1.0.nfo"), "SortGroup=7\n");

  const tree = await kit.scanTree(kit.toPosix(root));
  assert.equal(tree[0].name, "Kit v1.0");
  assert.equal(tree[0].nfo.sortGroup, 7);
});

test("scanTree no roba el .nfo sin extensión de un hermano", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "Kit v1");
  mkdir(root, "Kit v1.0");
  writeFile(path.join(root, "Kit v1.nfo"), "SortGroup=3\n");

  const tree = await kit.scanTree(kit.toPosix(root));
  const byName = new Map(tree.map((node) => [node.name, node]));

  assert.equal(byName.get("Kit v1").nfo.sortGroup, 3);
  assert.equal(byName.get("Kit v1.0").nfo, null);
  assert.deepEqual(byName.get("Kit v1.0").nfoClash, ["Kit v1"]);
});

test("scanTree detecta bitmaps que faltan en disco", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "drums");
  writeFile(
    path.join(root, "drums.nfo"),
    "Bitmap=-/missing.png\n",
  );

  const tree = await kit.scanTree(kit.toPosix(root));
  assert.equal(tree[0].bitmapMissing, true);
});

/* ------------------------------------------------------------------ */
/* Escritura                                                           */
/* ------------------------------------------------------------------ */

test("applySpecs escribe el .nfo hermano con el orden esperado", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "drums");
  const folder = kit.toPosix(path.join(root, "drums"));

  const [result] = await kit.applySpecs([
    {
      folderPath: folder,
      spec: {
        color: "#ff4fa3",
        iconIndex: 772,
        sortGroup: 13,
        tip: "Punchy drums",
        bitmap: "-/badge 1.png",
        visible: true,
        unknown: { Extra: "keep" },
      },
    },
  ]);

  assert.equal(result.ok, true);
  assert.equal(
    fs.readFileSync(path.join(root, "drums.nfo"), "utf8"),
    [
      "Color=$a34fff",
      "IconIndex=772",
      "SortGroup=13",
      "Tip=Punchy drums",
      "Bitmap=-/badge 1.png",
      "Visible=True",
      "Extra=keep",
      "",
    ].join("\n"),
  );
});

test("applySpecs borra el .nfo cuando el spec queda vacío", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "drums");
  writeFile(path.join(root, "drums.nfo"), "SortGroup=4\n");
  const folder = kit.toPosix(path.join(root, "drums"));

  const [result] = await kit.applySpecs([{ folderPath: folder, spec: {} }]);
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(root, "drums.nfo")), false);
});

test("applySpecs informa errores sin detener el resto", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "ok");
  const missing = path.join(root, "missing");

  const results = await kit.applySpecs([
    { folderPath: kit.toPosix(missing), spec: { iconIndex: 1 } },
  ]);

  assert.equal(results[0].ok, false);
  assert.match(results[0].error, /ENOENT/);
});

/* ------------------------------------------------------------------ */
/* Assets y badges                                                     */
/* ------------------------------------------------------------------ */

test("ensureAssetsDir crea `-` con su `-.nfo` debajo de los hermanos", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "drums");
  mkdir(root, "bass");
  writeFile(path.join(root, "drums.nfo"), "SortGroup=5\n");
  writeFile(path.join(root, "bass.nfo"), "SortGroup=2\n");

  const assets = await kit.ensureAssetsDir(root);
  assert.equal(assets, path.join(root, "-"));
  assert.equal(fs.existsSync(path.join(root, "-", "-.nfo")), false);

  const text = fs.readFileSync(path.join(root, "-.nfo"), "utf8");
  assert.match(text, /IconIndex=2/);
  assert.match(text, /SortGroup=1/);
});

test("saveBadge reutiliza la carpeta de assets y deduplica imágenes", async (t) => {
  const root = makeRoot(t);
  const drums = mkdir(root, "drums");
  const bass = mkdir(root, "bass");
  const piano = mkdir(root, "piano");

  const saved = await kit.saveBadge(
    [kit.toPosix(drums), kit.toPosix(bass)],
    PNG,
  );
  assert.deepEqual(saved, {
    [kit.toPosix(drums)]: "-/badge 1.png",
    [kit.toPosix(bass)]: "-/badge 1.png",
  });
  assert.equal(
    fs.readFileSync(path.join(root, "-", "badge 1.png")).length > 0,
    true,
  );

  const second = await kit.saveBadge([kit.toPosix(piano)], PNG_ALT);
  assert.equal(second[kit.toPosix(piano)], "-/badge 2.png");

  const again = await kit.saveBadge([kit.toPosix(drums)], PNG);
  assert.equal(again[kit.toPosix(drums)], "-/badge 1.png");
  assert.deepEqual(
    fs.readdirSync(path.join(root, "-")).sort(),
    ["badge 1.png", "badge 2.png"],
  );
});

test("saveBadge usa '<kit> cover art' cuando el destino es la carpeta de assets", async (t) => {
  const root = makeRoot(t);
  const assets = mkdir(root, "-");

  const saved = await kit.saveBadge([kit.toPosix(assets)], PNG);
  const expected = `${path.basename(root)} cover art.png`;
  assert.equal(saved[kit.toPosix(assets)], `-/${expected}`);
  assert.equal(fs.existsSync(path.join(assets, expected)), true);
});

test("saveBadge rechaza data URLs inválidos", async () => {
  await assert.rejects(
    () => kit.saveBadge(["C:/tmp/x"], "no-es-una-imagen"),
    /data URL/,
  );
});

test("findAssetsDir detecta la carpeta referenciada por Bitmap", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "drums");
  mkdir(root, "bass");
  mkdir(root, "assets");
  mkdir(root, "-");
  writeFile(path.join(root, "drums.nfo"), "Bitmap=assets/808.png\n");
  writeFile(path.join(root, "bass.nfo"), "Bitmap=assets/909.png\n");
  writeFile(path.join(root, "assets", "808.png"), "x");
  writeFile(path.join(root, "assets", "909.png"), "x");

  assert.equal(await kit.findAssetsDir(root), path.join(root, "assets"));
});

test("readImageDataUrl devuelve un data URL solo para imágenes existentes", async (t) => {
  const root = makeRoot(t);
  const drums = mkdir(root, "drums");
  mkdir(root, "-");
  const bitmapPath = path.join(root, "-", "badge 1.png");
  writeFile(bitmapPath, Buffer.from("fake png"));

  const dataUrl = await kit.readImageDataUrl(
    kit.toPosix(drums),
    "-/badge 1.png",
  );
  assert.match(dataUrl, /^data:image\/png;base64,/);

  assert.equal(
    await kit.readImageDataUrl(kit.toPosix(drums), "-/notes.txt"),
    null,
  );
  assert.equal(
    await kit.readImageDataUrl(kit.toPosix(drums), "-/nope.png"),
    null,
  );
});

test("cleanupUnusedAssets mueve solo imágenes no referenciadas", async (t) => {
  const root = makeRoot(t);
  const drums = mkdir(root, "drums");
  const assets = mkdir(root, "-");
  writeFile(path.join(root, "drums.nfo"), "Bitmap=-/used.png\n");
  writeFile(path.join(assets, "used.png"), "used");
  writeFile(path.join(assets, "unused.png"), "unused");
  writeFile(path.join(assets, "keep.nfo"), "SortGroup=1\n");

  const trashed = [];
  const removed = await kit.cleanupUnusedAssets(
    kit.toPosix(root),
    async (filePath) => {
      trashed.push(path.basename(filePath));
      await fsp.rm(filePath);
    },
  );

  assert.equal(removed, 1);
  assert.deepEqual(trashed, ["unused.png"]);
  assert.equal(fs.existsSync(path.join(assets, "used.png")), true);
  assert.equal(fs.existsSync(path.join(assets, "unused.png")), false);
  assert.equal(fs.existsSync(path.join(assets, "keep.nfo")), true);
});

test("cleanupUnusedAssets respeta la lista `keep`", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "drums");
  const assets = mkdir(root, "-");
  writeFile(path.join(assets, "pending.png"), "pending");

  const removed = await kit.cleanupUnusedAssets(
    kit.toPosix(root),
    async (filePath) => fsp.rm(filePath),
    [path.join(assets, "pending.png")],
  );
  assert.equal(removed, 0);
  assert.equal(fs.existsSync(path.join(assets, "pending.png")), true);
});

/* ------------------------------------------------------------------ */
/* Crear y renombrar carpetas                                          */
/* ------------------------------------------------------------------ */

test("createFolder crea una subcarpeta y valida el nombre", async (t) => {
  const root = makeRoot(t);
  const drums = mkdir(root, "drums");

  const result = await kit.createFolder(
    kit.toPosix(root),
    kit.toPosix(drums),
    "  snares  ",
  );
  assert.equal(result.name, "snares");
  assert.equal(result.path, kit.toPosix(path.join(drums, "snares")));
  assert.equal(fs.existsSync(path.join(drums, "snares")), true);

  await assert.rejects(
    kit.createFolder(kit.toPosix(root), kit.toPosix(drums), "SNARES"),
    /ya existe/,
  );
  await assert.rejects(
    kit.createFolder(kit.toPosix(root), kit.toPosix(root), "-"),
    /assets/,
  );
  await assert.rejects(
    kit.createFolder(kit.toPosix(root), kit.toPosix(root), "bad/name"),
    /no puede contener/,
  );
  await assert.rejects(
    kit.createFolder(kit.toPosix(root), kit.toPosix(root), "CON"),
    /reservado/,
  );
  await assert.rejects(
    kit.createFolder(
      kit.toPosix(root),
      kit.toPosix(path.dirname(root)),
      "outside",
    ),
    /fuera del kit/,
  );
});

test("renameFolder renombra la carpeta, su .nfo y las referencias Bitmap", async (t) => {
  const root = makeRoot(t);
  const drums = mkdir(root, "drums");
  mkdir(drums, "kicks");
  writeFile(
    path.join(root, "drums.nfo"),
    "SortGroup=5\nTip=old\nBitmap=drums/cover.png\nExtra=keep\n",
  );
  writeFile(path.join(root, "bass.nfo"), "Bitmap=drums/badge 1.png\n");

  const result = await kit.renameFolder(
    kit.toPosix(root),
    kit.toPosix(drums),
    "percussion",
  );

  assert.equal(result.name, "percussion");
  assert.equal(result.oldPath, kit.toPosix(drums));
  assert.deepEqual(result.warnings, []);
  assert.equal(fs.existsSync(path.join(root, "percussion", "kicks")), true);
  assert.equal(fs.existsSync(path.join(root, "drums")), false);
  assert.equal(fs.existsSync(path.join(root, "percussion.nfo")), true);

  const nfo = fs.readFileSync(path.join(root, "percussion.nfo"), "utf8");
  assert.match(nfo, /Bitmap=percussion\/cover\.png/);
  assert.match(nfo, /Extra=keep/);
  const bass = fs.readFileSync(path.join(root, "bass.nfo"), "utf8");
  assert.match(bass, /Bitmap=percussion\/badge 1\.png/);
});

test("renameFolder conserva el .nfo exacto de nombres con punto", async (t) => {
  const root = makeRoot(t);
  const folder = mkdir(root, "Kit v1.0");
  writeFile(path.join(root, "Kit v1.0.nfo"), "SortGroup=2\n");

  await kit.renameFolder(kit.toPosix(root), kit.toPosix(folder), "Kit v2.0");

  assert.equal(fs.existsSync(path.join(root, "Kit v2.0.nfo")), true);
  assert.equal(fs.existsSync(path.join(root, "Kit v1.0.nfo")), false);
});

test("renameFolder rechaza colisiones, la raíz y la carpeta de assets", async (t) => {
  const root = makeRoot(t);
  const drums = mkdir(root, "drums");
  mkdir(root, "bass");
  const assets = mkdir(root, "-");

  await assert.rejects(
    kit.renameFolder(kit.toPosix(root), kit.toPosix(drums), "BASS"),
    /ya existe/,
  );
  await assert.rejects(
    kit.renameFolder(kit.toPosix(root), kit.toPosix(root), "otro"),
    /raíz del kit/,
  );
  await assert.rejects(
    kit.renameFolder(kit.toPosix(root), kit.toPosix(assets), "assets"),
    /assets/,
  );
});

/* ------------------------------------------------------------------ */
/* Exportación                                                        */
/* ------------------------------------------------------------------ */

test("exportKit genera un zip con un .part intermedio", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "drums");
  mkdir(root, "-");
  writeFile(path.join(root, "drums.nfo"), "SortGroup=1\n");
  writeFile(path.join(root, "-", "badge 1.png"), Buffer.from("png"));

  const dest = path.join(path.dirname(root), `${path.basename(root)}.zip`);
  t.after(() => fs.rmSync(dest, { force: true }));

  const result = await kit.exportKit(kit.toPosix(root), dest);

  assert.equal(result.files, 2);
  assert.equal(result.bytes > 0, true);
  assert.equal(result.zipBytes > 0, true);
  assert.equal(fs.existsSync(`${dest}.part`), false);

  const header = fs.readFileSync(dest).subarray(0, 4).toString("latin1");
  assert.equal(header, "PK\u0003\u0004");
});

test("exportKit rechaza un destino dentro del kit", async (t) => {
  const root = makeRoot(t);
  mkdir(root, "drums");
  const dest = path.join(root, "kit.zip");

  await assert.rejects(
    () => kit.exportKit(kit.toPosix(root), dest),
    /fuera de la carpeta del kit/,
  );
});
