"use strict";

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

const api = window.kitforge;
const MOD = api?.platform === "darwin" ? "⌘" : "Ctrl";
const ICONS = window.KitForgeIcons ?? { glyphs: {}, svgs: {} };

const SPEC_KEYS = [
  "color",
  "iconIndex",
  "heightOfs",
  "sortGroup",
  "tip",
  "bitmap",
  "visible",
];

const SWATCHES = [
  "#ffffff",
  "#ff4fa3",
  "#ff5c5c",
  "#ff9e3d",
  "#ffd24d",
  "#7ee081",
  "#4de3c0",
  "#5cc8ff",
  "#8b7cff",
  "#c9d4c9",
  "#9aa0a6",
  "#1b1b21",
];

const BADGE_MAX = { w: 320, h: 160 };
const HISTORY_LIMIT = 100;
const GESTURE_WINDOW_MS = 1000;
const AUTO_COLLAPSE_OVER = 30;

const state = {
  rootPath: null,
  tree: [],
  selection: new Set(),
  collapsed: new Set(),
  edits: {},
  history: { past: [], future: [] },
  lastApply: null,
  isApplying: false,
  isExporting: false,
  status: "",
  mainStatus: "Listo.",
  theme: localStorage.getItem("kitforge:theme") === "light" ? "light" : "dark",
  previewBg: localStorage.getItem("kitforge:preview-bg") || null,
  colorMode: "solid",
  gradFrom: "#ff4fa3",
  gradTo: "#5cc8ff",
  activeStop: "from",
  anchor: null,
  dragPath: null,
  dropTarget: null,
};

let lastGesture = null;

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const $ = (selector, root = document) => root.querySelector(selector);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}

/* ------------------------------------------------------------------ */
/* Iconos                                                              */
/* ------------------------------------------------------------------ */

let iconFontReady = false;
let iconFontAttempted = false;

function setIconHint(ok) {
  const hint = $("#icon-hint");
  if (!hint) return;
  hint.textContent = ok
    ? "Vista previa con ILGlyphsEx."
    : "Sin ILGlyphsEx: se muestra el índice.";
}

async function ensureIconFont() {
  if (iconFontAttempted) return iconFontReady;
  iconFontAttempted = true;
  try {
    const info = await api?.loadIconFont?.();
    if (!info?.ok || !info.dataUrl) {
      setIconHint(false);
      return false;
    }
    const face = new FontFace("KitForgeIcons", `url("${info.dataUrl}")`);
    await face.load();
    document.fonts.add(face);
    iconFontReady = true;
    setIconHint(true);
  } catch (err) {
    console.warn("KitForge: no se pudo cargar la fuente de iconos", err);
    setIconHint(false);
  }
  return iconFontReady;
}

function paintIcon(node, index) {
  node.classList.remove("is-glyph", "is-svg", "is-index");
  node.textContent = "";

  const key = String(index);
  const svg = ICONS.svgs[key];
  if (svg) {
    node.innerHTML = svg;
    node.classList.add("is-svg");
    node.title = `Icono FL #${index}`;
    return;
  }

  const codepoint = ICONS.glyphs[key];
  if (codepoint && iconFontReady) {
    node.textContent = String.fromCodePoint(codepoint);
    node.classList.add("is-glyph");
    node.title = `Icono FL #${index}`;
    return;
  }

  node.textContent = `#${index}`;
  node.classList.add("is-index");
  node.title = iconFontReady
    ? `Icono FL #${index} (sin glifo)`
    : `Icono FL #${index} (fuente no disponible)`;
}

function toPosix(p) {
  return String(p).replaceAll("\\", "/");
}

function parentOf(posixPath) {
  const cut = String(posixPath).lastIndexOf("/");
  return cut <= 0 ? "" : String(posixPath).slice(0, cut);
}

function baseName(posixPath) {
  const cut = String(posixPath).lastIndexOf("/");
  return cut === -1 ? String(posixPath) : String(posixPath).slice(cut + 1);
}

function sortNodes(nodes, specOf) {
  return [...nodes].sort((a, b) => {
    const ga = specOf(a)?.sortGroup ?? -1;
    const gb = specOf(b)?.sortGroup ?? -1;
    if (ga !== gb) return gb - ga;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

function flattenAll(nodes) {
  const out = [];
  for (const node of nodes) {
    out.push(node);
    if (node.children?.length) out.push(...flattenAll(node.children));
  }
  return out;
}

function indexByPath() {
  return new Map(flattenAll(state.tree).map((node) => [node.path, node]));
}

function effective(node) {
  const merged = { ...(node.nfo ?? {}), ...(state.edits[node.path] ?? {}) };
  for (const key of Object.keys(merged)) {
    if (merged[key] == null) delete merged[key];
  }
  return merged;
}

function effectiveBitmap(node) {
  const edit = state.edits[node.path];
  if (edit && "bitmap" in edit) return edit.bitmap || undefined;
  if (node.bitmapMissing) return undefined;
  return node.nfo?.bitmap;
}

function sortedChildren(nodes) {
  return sortNodes(nodes, effective);
}

function visibleRows() {
  const rows = [];
  const walk = (nodes) => {
    for (const node of sortedChildren(nodes)) {
      rows.push(node);
      if (node.children?.length && !state.collapsed.has(node.path)) {
        walk(node.children);
      }
    }
  };
  walk(state.tree);
  return rows;
}

function selectedNodes() {
  return visibleRows().filter((node) => state.selection.has(node.path));
}

function sortedTree(nodes) {
  return sortedChildren(nodes).map((node) => ({
    ...node,
    children: sortedTree(node.children ?? []),
  }));
}

function orderedSelection() {
  return flattenAll(sortedTree(state.tree)).filter((node) =>
    state.selection.has(node.path),
  );
}

function assetUrl(folderPath, bitmap) {
  if (!bitmap) return "";
  if (bitmap.startsWith("data:")) return bitmap;
  const abs = `${parentOf(folderPath)}/${bitmap}`;
  const pathname = abs.split("/").map(encodeURIComponent).join("/");
  return `kitforge-asset://local${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function gradientColors(from, to, count) {
  if (count <= 0) return [];
  const a = hexToOklab(from);
  const b = hexToOklab(to);
  if (count === 1) return [oklabToHex(a)];
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return oklabToHex([
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ]);
  });
}

/* --- color: sRGB <-> OKLab (interpolación perceptualmente uniforme) --- */

function hexToRgb(hex) {
  const value = String(hex).replace("#", "");
  const full =
    value.length === 3
      ? [...value].map((c) => c + c).join("")
      : value.padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((offset) =>
    Number.parseInt(full.slice(offset, offset + 2), 16) / 255,
  );
}

function rgbToHex(rgb) {
  const channel = (value) => {
    const v = Math.max(0, Math.min(1, value));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${rgb.map(channel).join("")}`;
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

function hexToOklab(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklabToHex([L, A, B]) {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgbToHex(linear.map(linearToSrgb));
}

/* --- imágenes --- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("no se pudo leer la imagen"));
    image.src = src;
  });
}

async function downscale(dataUrl, max) {
  const image = await loadImage(dataUrl);
  const { naturalWidth: width, naturalHeight: height } = image;
  if (width <= max.w && height <= max.h) return dataUrl;
  const scale = Math.min(max.w / width, max.h / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

/* ------------------------------------------------------------------ */
/* Ediciones pendientes                                                */
/* ------------------------------------------------------------------ */

function normalizeEdits(next) {
  const byPath = indexByPath();
  const clean = {};

  for (const [path, partial] of Object.entries(next ?? {})) {
    const node = byPath.get(path);
    if (!node) continue;
    const base = node.nfo ?? {};
    const values = {};

    for (const key of SPEC_KEYS) {
      if (!partial || !(key in partial)) continue;
      const raw = partial[key];
      // `null`/undefined/"" piden quitar la clave del .nfo.
      const remove =
        raw === null ||
        raw === undefined ||
        raw === "" ||
        (key === "heightOfs" && raw === 0);
      if (remove) {
        if (key in base) values[key] = null;
        continue;
      }
      if (base[key] === raw) continue;
      values[key] = raw;
    }
    if (Object.keys(values).length > 0) clean[path] = values;
  }
  return clean;
}

function stableEdits(edits) {
  return JSON.stringify(
    Object.keys(edits)
      .sort()
      .map((path) => [
        path,
        SPEC_KEYS.filter((key) => key in edits[path]).map((key) => [
          key,
          edits[path][key],
        ]),
      ]),
  );
}

function pushHistory(gestureKey) {
  const now = Date.now();
  if (
    gestureKey &&
    lastGesture &&
    lastGesture.key === gestureKey &&
    now - lastGesture.at < GESTURE_WINDOW_MS
  ) {
    lastGesture.at = now;
    return;
  }
  state.history.past.push(state.edits);
  if (state.history.past.length > HISTORY_LIMIT) state.history.past.shift();
  state.history.future = [];
  lastGesture = gestureKey ? { key: gestureKey, at: now } : null;
}

function commit(nextEdits, gestureKey = null) {
  const normalized = normalizeEdits(nextEdits);
  if (stableEdits(normalized) === stableEdits(state.edits)) return;
  pushHistory(gestureKey);
  state.edits = normalized;
  renderAll();
}

function setEdit(partial, gestureKey = null) {
  if (state.selection.size === 0) return;
  const next = { ...state.edits };
  for (const path of state.selection) {
    next[path] = { ...(next[path] ?? {}), ...partial };
  }
  commit(next, gestureKey);
}

function setEditsBulk(updates, gestureKey = null) {
  const next = { ...state.edits };
  for (const [path, partial] of Object.entries(updates)) {
    next[path] = { ...(next[path] ?? {}), ...partial };
  }
  commit(next, gestureKey);
}

function undo() {
  if (state.history.past.length === 0) return;
  const past = [...state.history.past];
  state.history.future.push(state.edits);
  state.edits = normalizeEdits(past.pop());
  state.history.past = past;
  lastGesture = null;
  renderAll();
}

function redo() {
  if (state.history.future.length === 0) return;
  const future = [...state.history.future];
  state.history.past.push(state.edits);
  state.edits = normalizeEdits(future.pop());
  state.history.future = future;
  lastGesture = null;
  renderAll();
}

/* ------------------------------------------------------------------ */
/* Render: cabecera y estado                                           */
/* ------------------------------------------------------------------ */

function renderChrome() {
  const kitName = state.rootPath ? baseName(state.rootPath) : "Sin kit";
  $("#kit-name").textContent = kitName;
  $("#kit-path").textContent = state.rootPath ?? "abre una carpeta para empezar";
  const exportButton = $("#export-kit");
  exportButton.disabled = !state.rootPath;
  exportButton.textContent = state.isExporting ? "Cancelar" : "Exportar";
  exportButton.title = state.isExporting
    ? "Cancelar la exportación en curso"
    : "Exportar el kit como zip";
  $("#refresh").disabled = !state.rootPath;
  $("#cleanup").disabled = !state.rootPath;
  $("#new-folder").disabled = !state.rootPath;
  const onlySelection =
    state.selection.size === 1 ? [...state.selection][0] : null;
  $("#rename-folder").disabled =
    !onlySelection || baseName(onlySelection) === "-";

  const total = flattenAll(state.tree).length;
  const styled = flattenAll(state.tree).filter((node) => {
    const spec = effective(node);
    return (
      spec.color !== undefined ||
      spec.iconIndex !== undefined ||
      spec.bitmap !== undefined ||
      (spec.tip !== undefined && spec.tip !== "") ||
      spec.heightOfs !== undefined
    );
  }).length;

  $("#tree-meta").textContent = state.rootPath
    ? `${total} carpeta${total === 1 ? "" : "s"} · ${styled} con estilo`
    : "Abre un kit para empezar";
}

function renderStatus() {
  const status = $("#status");
  status.textContent = state.status || "";
  status.hidden = !state.status;
  $("#status-main").textContent = state.mainStatus || "Listo.";
}

function setStatus(text) {
  state.status = text || "";
  renderStatus();
}

function setMainStatus(text) {
  state.mainStatus = text || "";
  renderStatus();
}

/* ------------------------------------------------------------------ */
/* Render: árbol                                                       */
/* ------------------------------------------------------------------ */

function paintDropTarget() {
  for (const row of document.querySelectorAll("#tree .row")) {
    const path = row.dataset.path;
    row.classList.toggle("dragging", state.dragPath === path);
    row.classList.remove("drop-above", "drop-below");
    if (state.dropTarget?.path === path) {
      row.classList.add(
        state.dropTarget.position === "above" ? "drop-above" : "drop-below",
      );
    }
  }
}

function renderTree() {
  const list = $("#tree");
  list.textContent = "";
  const rows = visibleRows();

  $("#empty-state").hidden = rows.length > 0 || !!state.rootPath;

  for (const node of rows) {
    const row = el("li", "row");
    row.dataset.path = node.path;
    row.style.paddingLeft = `${6 + node.depth * 16}px`;
    row.draggable = true;
    row.dataset.collapsed = String(state.collapsed.has(node.path));

    if (state.selection.has(node.path)) row.classList.add("selected");
    if (state.dragPath === node.path) row.classList.add("dragging");
    if (state.dropTarget?.path === node.path) {
      row.classList.add(
        state.dropTarget.position === "above" ? "drop-above" : "drop-below",
      );
    }

    const spec = effective(node);

    if (node.children.length > 0) {
      const chevron = el("button", "chevron");
      chevron.type = "button";
      chevron.title = state.collapsed.has(node.path) ? "Expandir" : "Contraer";
      chevron.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
      chevron.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.collapsed.has(node.path)) state.collapsed.delete(node.path);
        else state.collapsed.add(node.path);
        renderTree();
      });
      row.append(chevron);
    } else {
      const spacer = el("span", "chevron");
      row.append(spacer);
    }

    const dot = el("span", "dot");
    dot.style.background = spec.color ?? "var(--border)";
    row.append(dot);

    if (spec.iconIndex !== undefined) {
      const icon = el("span", "icon-chip");
      paintIcon(icon, spec.iconIndex);
      row.append(icon);
    }

    const name = el("span", "name", node.name);
    if (spec.color) name.style.color = spec.color;
    row.append(name);

    if (spec.tip) {
      row.append(el("span", "row-tip", `· ${spec.tip}`));
      row.title = spec.tip;
    }

    const bitmap = effectiveBitmap(node);
    if (bitmap) {
      const img = el("img", "badge-mini");
      img.alt = "";
      img.src = assetUrl(node.path, bitmap);
      img.addEventListener("error", () => img.remove());
      row.append(img);
    }

    row.append(el("span", "grip", "⋮⋮"));

    row.addEventListener("click", (event) => onRowClick(event, node));
    row.addEventListener("contextmenu", (event) => openTreeMenu(event, node));
    row.addEventListener("dblclick", () => {
      if (node.children.length > 0) {
        if (state.collapsed.has(node.path)) state.collapsed.delete(node.path);
        else state.collapsed.add(node.path);
        renderTree();
      }
    });

    row.addEventListener("dragstart", (event) => {
      state.dragPath = node.path;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", node.path);
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      state.dragPath = null;
      state.dropTarget = null;
      paintDropTarget();
    });
    row.addEventListener("dragover", (event) => {
      if (!state.dragPath || state.dragPath === node.path) return;
      if (parentOf(state.dragPath) !== parentOf(node.path)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const rect = row.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2
        ? "above"
        : "below";
      if (
        state.dropTarget?.path !== node.path ||
        state.dropTarget?.position !== position
      ) {
        state.dropTarget = { path: node.path, position };
        paintDropTarget();
      }
    });
    row.addEventListener("dragleave", (event) => {
      if (row.contains(event.relatedTarget)) return;
      if (state.dropTarget?.path === node.path) {
        state.dropTarget = null;
        paintDropTarget();
      }
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const dragged = state.dragPath || event.dataTransfer.getData("text/plain");
      const rect = row.getBoundingClientRect();
      const target = state.dropTarget?.path === node.path
        ? state.dropTarget
        : {
            path: node.path,
            position: event.clientY < rect.top + rect.height / 2
              ? "above"
              : "below",
          };
      state.dragPath = null;
      state.dropTarget = null;
      if (dragged && parentOf(dragged) === parentOf(target.path)) {
        reorder(dragged, target.path, target.position);
      }
      paintDropTarget();
    });

    list.append(row);
  }
}

function onRowClick(event, node) {
  const additive = event.ctrlKey || event.metaKey;
  const ranged = event.shiftKey;

  if (ranged && state.anchor) {
    const rows = visibleRows().map((item) => item.path);
    const from = rows.indexOf(state.anchor);
    const to = rows.indexOf(node.path);
    if (from !== -1 && to !== -1) {
      const [start, end] = from < to ? [from, to] : [to, from];
      state.selection = new Set(rows.slice(start, end + 1));
    }
  } else if (additive) {
    if (state.selection.has(node.path)) state.selection.delete(node.path);
    else state.selection.add(node.path);
    state.anchor = node.path;
  } else {
    state.selection = new Set([node.path]);
    state.anchor = node.path;
  }

  if (state.colorMode === "gradient" && state.selection.size >= 2) {
    applyGradient(state.gradFrom, state.gradTo, "gradient-selection");
  } else {
    renderAll();
  }
}

function reorder(draggedPath, targetPath, position) {
  if (draggedPath === targetPath) return;
  if (parentOf(draggedPath) !== parentOf(targetPath)) return;

  const siblings =
    parentOf(draggedPath) === toPosix(state.rootPath)
      ? state.tree
      : indexByPath().get(parentOf(draggedPath))?.children;
  if (!siblings) return;

  const displayOrder = sortedChildren(siblings).map((node) => node.path);
  const moved = state.selection.has(draggedPath)
    ? displayOrder.filter((path) => state.selection.has(path))
    : [draggedPath];
  if (moved.includes(targetPath)) return;

  const rest = displayOrder.filter((path) => !moved.includes(path));
  const at = rest.indexOf(targetPath);
  if (at === -1) return;
  const order = [...rest];
  order.splice(at + (position === "below" ? 1 : 0), 0, ...moved);
  if (order.every((path, index) => path === displayOrder[index])) return;

  const next = { ...state.edits };
  order.forEach((path, index) => {
    next[path] = { ...(next[path] ?? {}), sortGroup: order.length - index };
  });
  commit(next);
  setStatus("orden actualizado — apply to FL Studio para guardarlo");
}

/* ------------------------------------------------------------------ */
/* Render: inspector                                                   */
/* ------------------------------------------------------------------ */

function renderInspector() {
  const nodes = selectedNodes();
  const none = nodes.length === 0;

  $("#inspector-empty").hidden = !none;
  $("#inspector-body").hidden = none;
  $("#selection-count").textContent = none
    ? ""
    : `${nodes.length} selected`;

  const dirty = Object.keys(state.edits).length;
  $("#dirty-dot").hidden = dirty === 0;
  $("#reset-all").disabled = none;

  const applyButton = $("#apply");
  applyButton.disabled = dirty === 0 || state.isApplying;
  applyButton.textContent = state.isApplying
    ? "aplicando…"
    : `apply to FL Studio${dirty ? ` (${dirty})` : ""}`;
  $("#undo-apply").disabled = !state.lastApply;
  $("#discard").disabled = dirty === 0 || state.isApplying;

  if (none) {
    renderStatus();
    return;
  }

  const first = effective(nodes[0]);
  const bitmap = effectiveBitmap(nodes[0]);

  // Colores
  for (const button of document.querySelectorAll("#color-mode button")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.mode === state.colorMode),
    );
  }
  $("#grad-row").hidden = state.colorMode !== "gradient";

  const activeColor =
    state.colorMode === "gradient"
      ? state.activeStop === "from"
        ? state.gradFrom
        : state.gradTo
      : first.color;

  if (document.activeElement !== $("#color-input")) {
    $("#color-input").value = activeColor ?? "#ff4fa3";
  }
  $("#color-hex").textContent = activeColor ?? "sin color";

  for (const swatch of document.querySelectorAll(".swatch")) {
    swatch.setAttribute(
      "aria-pressed",
      String(
        activeColor !== undefined &&
          swatch.dataset.color.toLowerCase() === activeColor.toLowerCase(),
      ),
    );
  }

  $("#grad-from").value = state.gradFrom;
  $("#grad-to").value = state.gradTo;

  const hint = $("#grad-hint");
  if (state.colorMode === "gradient") {
    hint.hidden = false;
    hint.textContent =
      nodes.length >= 2
        ? `${nodes.length} carpetas · de arriba a abajo`
        : "selecciona dos o más carpetas para repartir el degradado";
  } else {
    hint.hidden = true;
  }

  // Icono
  const iconInput = $("#icon-input");
  if (document.activeElement !== iconInput) {
    iconInput.value = first.iconIndex !== undefined ? String(first.iconIndex) : "";
  }
  const iconPreview = $("#icon-preview");
  iconPreview.className = "icon-preview";
  if (first.iconIndex !== undefined) {
    paintIcon(iconPreview, first.iconIndex);
  } else {
    iconPreview.textContent = "—";
    iconPreview.classList.add("is-empty");
    iconPreview.removeAttribute("title");
  }

  // Badge
  const badgeImg = $("#badge-preview");
  const badgeEmpty = $("#badge-empty");
  if (bitmap) {
    badgeImg.src = assetUrl(nodes[0].path, bitmap);
    badgeImg.hidden = false;
    badgeEmpty.hidden = true;
    $("#badge-hint").textContent = bitmap.split("/").pop();
  } else {
    badgeImg.removeAttribute("src");
    badgeImg.hidden = true;
    badgeEmpty.hidden = false;
    $("#badge-hint").textContent = "Se copia a la carpeta de assets del kit.";
  }

  // Tooltip y altura
  const tipInput = $("#tip-input");
  if (document.activeElement !== tipInput) {
    tipInput.value = first.tip ?? "";
  }
  const heightInput = $("#height-input");
  if (document.activeElement !== heightInput) {
    heightInput.value =
      first.heightOfs !== undefined ? String(first.heightOfs) : "";
  }

  renderStatus();
}

/* ------------------------------------------------------------------ */
/* Render: preview                                                     */
/* ------------------------------------------------------------------ */

function renderPreview() {
  const preview = $("#preview");
  preview.textContent = "";
  $("#preview-note").textContent = state.rootPath
    ? `${visibleRows().length} filas visibles`
    : "—";

  if (!state.rootPath) {
    const empty = el("div", "pv-root", "SIN KIT");
    preview.append(empty);
    return;
  }

  const root = el("div", "pv-root");
  root.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>';
  root.append(el("span", "", baseName(state.rootPath)));
  preview.append(root);

  const rows = visibleRows();
  for (const node of rows) {
    const spec = effective(node);
    const collapsed = state.collapsed.has(node.path);

    const row = el("div", "pv-row");
    row.style.paddingLeft = `${8 + node.depth * 16}px`;
    if (state.selection.has(node.path)) row.classList.add("selected");
    if (spec.tip) {
      row.classList.add("has-tip");
      row.title = spec.tip;
    }

    const height = Math.max(0, Math.min(100, spec.heightOfs ?? 0));
    if (height > 0) {
      row.style.paddingTop = `${2 + height * 0.35}px`;
      row.style.paddingBottom = `${2 + height * 0.35}px`;
    }

    if (node.children.length > 0) {
      row.append(el("span", "pv-chevron", collapsed ? "▸" : "▾"));
    } else {
      row.append(el("span", "pv-chevron", " "));
    }

    if (spec.iconIndex !== undefined) {
      const icon = el("span", "pv-icon");
      paintIcon(icon, spec.iconIndex);
      row.append(icon);
    }

    const name = el("span", "pv-name", node.name);
    if (spec.color) name.style.color = spec.color;
    row.append(name);

    const bitmap = effectiveBitmap(node);
    if (bitmap) {
      const img = el("img", "pv-badge");
      img.alt = "";
      img.src = assetUrl(node.path, bitmap);
      img.addEventListener("error", () => img.remove());
      row.append(img);
    }

    row.addEventListener("click", (event) => onRowClick(event, node));
    preview.append(row);
  }
}

/* ------------------------------------------------------------------ */
/* Render global                                                       */
/* ------------------------------------------------------------------ */

function renderAll() {
  renderChrome();
  renderTree();
  renderInspector();
  renderPreview();
  renderStatus();
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

async function openKit() {
  try {
    const root = await api.chooseKit();
    if (root) await openRoot(root);
  } catch (err) {
    setMainStatus(`no se pudo abrir el kit: ${messageOf(err)}`);
  }
}

async function openRoot(root) {
  state.rootPath = root;
  state.tree = [];
  state.selection.clear();
  state.collapsed.clear();
  state.edits = {};
  state.history = { past: [], future: [] };
  state.lastApply = null;
  state.status = "";
  state.anchor = null;
  lastGesture = null;
  setMainStatus("leyendo…");
  renderAll();

  try {
    const tree = await api.scan(root);
    state.tree = tree;
    const all = flattenAll(tree);
    if (all.length > AUTO_COLLAPSE_OVER) {
      state.collapsed = new Set(
        all.filter((node) => node.children.length > 0).map((node) => node.path),
      );
    }
    localStorage.setItem("kitforge:root", root);
    setMainStatus(`${all.length} carpetas · ${root}`);
  } catch (err) {
    state.tree = [];
    setMainStatus(`no se pudo leer el kit: ${messageOf(err)}`);
  }
  renderAll();
}

async function rescan({ silent = false } = {}) {
  if (!state.rootPath) return;
  try {
    const tree = await api.scan(state.rootPath);
    state.tree = tree;
    const live = new Set(flattenAll(tree).map((node) => node.path));
    state.selection = new Set(
      [...state.selection].filter((path) => live.has(path)),
    );
    state.collapsed = new Set(
      [...state.collapsed].filter((path) => live.has(path)),
    );
    state.edits = normalizeEdits(state.edits);
    if (!silent) setMainStatus(`${live.size} carpetas · ${state.rootPath}`);
  } catch (err) {
    if (!silent) setMainStatus(`no se pudo refrescar: ${messageOf(err)}`);
  }
  renderAll();
}

function selectPath(path) {
  if (!indexByPath().has(path)) return;
  state.selection = new Set([path]);
  state.anchor = path;
  const root = toPosix(state.rootPath ?? "");
  let parent = parentOf(path);
  while (parent && parent !== root) {
    state.collapsed.delete(parent);
    parent = parentOf(parent);
  }
  renderAll();
}

function pendingEditsUnder(folderPath) {
  const prefix = `${folderPath}/`;
  return Object.keys(state.edits).some(
    (path) => path === folderPath || path.startsWith(prefix),
  );
}

/* ------------------------------------------------------------------ */
/* Diálogo de nombre y menú contextual                                 */
/* ------------------------------------------------------------------ */

let namePrompt = null;
let menuTarget = null;

function cleanIpcError(err) {
  return messageOf(err).replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    "",
  );
}

function openNameDialog(options) {
  return new Promise((resolve) => {
    const dialog = $("#name-dialog");
    const input = $("#name-input");
    const error = $("#name-error");
    namePrompt = { resolve, submit: options.submit };

    $("#name-title").textContent = options.title;
    $("#name-hint").textContent = options.hint ?? "";
    input.value = options.value ?? "";
    $("#name-confirm").textContent = options.confirmLabel ?? "Crear";
    $("#name-confirm").disabled = false;
    $("#name-cancel").disabled = false;
    error.textContent = "";
    error.hidden = true;

    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

function closeNameDialog(result) {
  const dialog = $("#name-dialog");
  const prompt = namePrompt;
  namePrompt = null;
  if (dialog.open) dialog.close();
  prompt?.resolve(result);
}

async function submitNameDialog() {
  const prompt = namePrompt;
  if (!prompt) return;
  const input = $("#name-input");
  const error = $("#name-error");
  const value = input.value.trim();
  if (!value) {
    error.textContent = "Escribe un nombre para la carpeta.";
    error.hidden = false;
    input.focus();
    return;
  }

  $("#name-confirm").disabled = true;
  $("#name-cancel").disabled = true;
  error.hidden = true;
  try {
    const result = await prompt.submit(value);
    if (namePrompt === prompt) closeNameDialog(result);
  } catch (err) {
    if (namePrompt !== prompt) return;
    error.textContent = cleanIpcError(err);
    error.hidden = false;
    $("#name-confirm").disabled = false;
    $("#name-cancel").disabled = false;
    input.focus();
    input.select();
  }
}

function openTreeMenu(event, node) {
  event.preventDefault();
  if (!state.selection.has(node.path)) {
    state.selection = new Set([node.path]);
    state.anchor = node.path;
    renderAll();
  }
  menuTarget = node.path;

  const menu = $("#tree-menu");
  menu.querySelector('[data-action="rename"]').disabled = node.name === "-";
  menu.style.left = "0px";
  menu.style.top = "0px";
  menu.hidden = false;

  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8))}px`;
}

function closeTreeMenu() {
  $("#tree-menu").hidden = true;
  menuTarget = null;
}

/* ------------------------------------------------------------------ */
/* Operaciones con carpetas                                            */
/* ------------------------------------------------------------------ */

async function createFolder(parentPath = null) {
  if (!state.rootPath || $("#name-dialog").open) return;
  const root = toPosix(state.rootPath);
  const parent =
    parentPath ??
    (state.selection.size === 1 ? [...state.selection][0] : root);
  const parentNode = indexByPath().get(parent);

  await openNameDialog({
    title: "Nueva carpeta",
    hint:
      parent === root
        ? "Se creará en la raíz del kit."
        : `Se creará dentro de “${parentNode?.name ?? baseName(parent)}”.`,
    confirmLabel: "Crear",
    submit: async (name) => {
      const result = await api.createFolder(state.rootPath, parent, name);
      await rescan();
      selectPath(result.path);
      setMainStatus(`carpeta creada: ${result.name}`);
      return result;
    },
  });
}

async function renameFolder(targetPath = null) {
  if (!state.rootPath || $("#name-dialog").open) return;
  const folderPath =
    targetPath ??
    (state.selection.size === 1 ? [...state.selection][0] : null);
  if (!folderPath) {
    setMainStatus("selecciona una carpeta para cambiarle el nombre");
    return;
  }

  const oldName = baseName(folderPath);
  if (oldName === "-") {
    setMainStatus("la carpeta de assets no se puede renombrar");
    return;
  }
  if (pendingEditsUnder(folderPath)) {
    setMainStatus(
      "aplica o descarta los cambios pendientes de esa carpeta antes de renombrarla",
    );
    return;
  }

  await openNameDialog({
    title: "Cambiar nombre",
    hint: "También se renombra su .nfo y se actualizan los Bitmap del mismo nivel.",
    value: oldName,
    confirmLabel: "Renombrar",
    submit: async (name) => {
      if (name === oldName) return { path: folderPath, name, warnings: [] };
      const result = await api.renameFolder(state.rootPath, folderPath, name);
      await rescan();
      selectPath(result.path);
      setMainStatus(
        result.warnings?.length
          ? `carpeta renombrada con avisos: ${result.warnings[0]}`
          : `carpeta renombrada: ${result.name}`,
      );
      return result;
    },
  });
}

async function apply() {
  if (!state.rootPath || state.isApplying) return;
  const byPath = indexByPath();
  const items = Object.entries(state.edits).map(([folderPath, partial]) => {
    const base = byPath.get(folderPath)?.nfo ?? {};
    const spec = { ...base, ...partial };
    for (const key of Object.keys(spec)) {
      if (spec[key] == null) delete spec[key];
    }
    return { folderPath, spec };
  });
  if (items.length === 0) return;

  state.isApplying = true;
  setStatus("aplicando…");
  renderInspector();

  try {
    const results = await api.apply(items);
    const failed = results.filter((result) => !result.ok);
    const ok = new Set(
      results.filter((result) => result.ok).map((result) => result.folderPath),
    );
    const changes = items
      .filter((item) => ok.has(item.folderPath))
      .map((item) => ({
        folderPath: item.folderPath,
        before: byPath.get(item.folderPath)?.nfo ?? null,
        after: item.spec,
      }));

    state.lastApply = changes.length
      ? { rootPath: state.rootPath, changes }
      : null;

    // Solo se descartan las ediciones que sí se escribieron: si alguna
    // carpeta falló, su cambio pendiente se conserva para reintentar.
    const failedSet = new Set(failed.map((result) => result.folderPath));
    const remaining = {};
    for (const [folderPath, partial] of Object.entries(state.edits)) {
      if (failedSet.has(folderPath)) remaining[folderPath] = partial;
    }

    state.history = { past: [], future: [] };
    lastGesture = null;

    await rescan({ silent: true });
    state.edits = normalizeEdits(remaining);
    setStatus(
      failed.length
        ? `${failed.length} de ${results.length} fallaron: ${failed[0].error ?? "error"}`
        : `estilizadas ${results.length} carpeta${results.length === 1 ? "" : "s"} — refresca el navegador de FL`,
    );
    setMainStatus(`${results.length - failed.length} cambios escritos en disco`);
  } catch (err) {
    setStatus(`no se pudo aplicar: ${messageOf(err)}`);
  } finally {
    state.isApplying = false;
    renderAll();
  }
}

function restageEdit(before, after) {
  const draft = {};
  for (const key of SPEC_KEYS) {
    const oldValue = before?.[key];
    const newValue = after?.[key];
    if (oldValue === newValue) continue;
    draft[key] = newValue === undefined ? null : newValue;
  }
  return draft;
}

async function undoLastApply() {
  const last = state.lastApply;
  if (!last || last.rootPath !== state.rootPath) return;

  const byPath = indexByPath();
  const changes = last.changes.filter((change) => byPath.has(change.folderPath));
  if (changes.length === 0) {
    state.lastApply = null;
    setStatus("no queda nada que deshacer: esas carpetas ya no existen.");
    renderAll();
    return;
  }

  setStatus("deshaciendo el último apply…");
  try {
    const results = await api.apply(
      changes.map((change) => ({
        folderPath: change.folderPath,
        spec: change.before ?? {},
      })),
    );
    const restored = new Set(
      results.filter((result) => result.ok).map((result) => result.folderPath),
    );

    state.lastApply = null;

    // Primero se relee el disco restaurado: las ediciones pendientes se
    // calculan contra el estado nuevo, no contra el que se acaba de deshacer.
    await rescan({ silent: true });

    const next = { ...state.edits };
    for (const change of changes) {
      if (!restored.has(change.folderPath)) continue;
      const draft = restageEdit(change.before ?? {}, change.after);
      if (Object.keys(draft).length > 0) {
        next[change.folderPath] = {
          ...draft,
          ...(next[change.folderPath] ?? {}),
        };
      }
    }
    state.edits = normalizeEdits(next);
    state.history.past.push(state.edits);
    state.history.future = [];

    setStatus(
      `apply deshecho — ${restored.size} carpeta${restored.size === 1 ? "" : "s"}`,
    );
    setMainStatus("cambios restaurados en disco");
  } catch (err) {
    setStatus(`no se pudo deshacer: ${messageOf(err)}`);
  }
  renderAll();
}

function discard() {
  state.edits = {};
  state.history = { past: [], future: [] };
  lastGesture = null;
  setStatus("cambios pendientes descartados.");
  renderAll();
}

async function chooseBadge() {
  const paths = [...state.selection];
  if (paths.length === 0) return;
  try {
    const picked = await api.pickImage();
    if (!picked) return;
    setStatus("guardando imagen…");
    const dataUrl = await downscale(picked.dataUrl, BADGE_MAX);
    const saved = await api.saveBadge(paths, dataUrl);
    await rescan({ silent: true });

    const updates = {};
    for (const [path, bitmap] of Object.entries(saved ?? {})) {
      updates[path] = { bitmap };
    }
    setEditsBulk(updates);
    setStatus(`badge guardado: ${picked.name}`);
  } catch (err) {
    setStatus(`no se pudo guardar el badge: ${messageOf(err)}`);
  }
}

function applyGradient(from, to, gestureKey = null) {
  const ordered = orderedSelection();
  if (ordered.length < 2) {
    renderAll();
    return;
  }
  const colors = gradientColors(from, to, ordered.length);
  const updates = {};
  ordered.forEach((node, index) => {
    updates[node.path] = { color: colors[index] };
  });
  setEditsBulk(updates, gestureKey);
}

async function cleanupAssets() {
  if (!state.rootPath) return;
  const confirmed = window.confirm(
    "Se moverán a la papelera las imágenes que ningún .nfo referencia. ¿Continuar?",
  );
  if (!confirmed) return;

  // Los badges guardados pero aún sin aplicar solo existen en disco y en el
  // borrador: se conservan para que el apply posterior encuentre la imagen.
  const keep = [];
  for (const [folderPath, partial] of Object.entries(state.edits)) {
    if (partial && typeof partial.bitmap === "string" && partial.bitmap) {
      keep.push(`${parentOf(folderPath)}/${partial.bitmap}`);
    }
  }

  try {
    setMainStatus("limpiando imágenes sin usar…");
    const removed = await api.cleanupUnused(state.rootPath, keep);
    await rescan({ silent: true });
    setMainStatus(
      removed > 0
        ? `${removed} imagen${removed === 1 ? "" : "es"} movida${removed === 1 ? "" : "s"} a la papelera`
        : "no había imágenes sin usar",
    );
  } catch (err) {
    setMainStatus(`no se pudo limpiar: ${messageOf(err)}`);
  }
}

async function exportKit() {
  if (!state.rootPath) return;
  if (state.isExporting) {
    await api.cancelExport();
    return;
  }
  if (Object.keys(state.edits).length > 0) {
    const confirmed = window.confirm(
      "Hay cambios sin aplicar. ¿Aplicarlos antes de exportar?",
    );
    if (!confirmed) return;
    await apply();
    if (Object.keys(state.edits).length > 0) {
      setMainStatus("quedan cambios sin aplicar; exportación cancelada");
      return;
    }
  }

  state.isExporting = true;
  renderChrome();

  const unsubscribe = api.onExportProgress(({ done, total }) => {
    const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    setMainStatus(`comprimiendo… ${percent}%`);
  });

  try {
    const result = await api.exportKit(state.rootPath);
    if (result.ok) {
      setMainStatus(
        `exportado ${baseName(result.path)} · ${result.files} archivos · ${formatBytes(result.zipBytes)}`,
      );
    } else if (result.canceled) {
      setMainStatus("exportación cancelada");
    } else {
      setMainStatus(`falló la exportación: ${result.error ?? "error"}`);
    }
  } catch (err) {
    setMainStatus(`falló la exportación: ${messageOf(err)}`);
  } finally {
    unsubscribe();
    state.isExporting = false;
    renderChrome();
  }
}

function formatBytes(bytes) {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/* ------------------------------------------------------------------ */
/* Tema y preview                                                      */
/* ------------------------------------------------------------------ */

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  api?.setTheme(state.theme);
  localStorage.setItem("kitforge:theme", state.theme);
}

function applyPreviewBg() {
  if (state.previewBg) {
    document.documentElement.style.setProperty("--preview-bg", state.previewBg);
    $("#preview-bg").value = state.previewBg;
    $("#reset-preview-bg").hidden = false;
  } else {
    document.documentElement.style.removeProperty("--preview-bg");
    $("#reset-preview-bg").hidden = true;
  }
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

function buildSwatches() {
  const container = $("#swatches");
  for (const color of SWATCHES) {
    const button = el("button", "swatch");
    button.type = "button";
    button.dataset.color = color;
    button.style.background = color;
    button.title = color;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      if (state.colorMode === "solid") {
        setEdit({ color }, "color");
      } else {
        if (state.activeStop === "from") state.gradFrom = color;
        else state.gradTo = color;
        applyGradient(state.gradFrom, state.gradTo, "gradient");
      }
      renderInspector();
    });
    container.append(button);
  }
}

function bindEvents() {
  $("#open-kit").addEventListener("click", () => void openKit());
  $("#export-kit").addEventListener("click", () => void exportKit());
  $("#refresh").addEventListener("click", () => void rescan());
  $("#cleanup").addEventListener("click", () => void cleanupAssets());
  $("#new-folder").addEventListener("click", () => void createFolder());
  $("#rename-folder").addEventListener("click", () => void renameFolder());
  $("#toggle-theme").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    renderAll();
  });

  $("#color-input").addEventListener("input", (event) => {
    const color = event.target.value;
    if (state.colorMode === "solid") {
      setEdit({ color }, "color-custom");
    } else {
      if (state.activeStop === "from") state.gradFrom = color;
      else state.gradTo = color;
      applyGradient(state.gradFrom, state.gradTo, "gradient");
    }
    renderInspector();
  });

  $("#grad-from").addEventListener("input", (event) => {
    state.gradFrom = event.target.value;
    state.activeStop = "from";
    applyGradient(state.gradFrom, state.gradTo, "gradient");
    renderInspector();
  });
  $("#grad-to").addEventListener("input", (event) => {
    state.gradTo = event.target.value;
    state.activeStop = "to";
    applyGradient(state.gradFrom, state.gradTo, "gradient");
    renderInspector();
  });
  $("#grad-swap").addEventListener("click", () => {
    [state.gradFrom, state.gradTo] = [state.gradTo, state.gradFrom];
    applyGradient(state.gradFrom, state.gradTo, "gradient");
    renderInspector();
  });

  for (const button of document.querySelectorAll("#color-mode button")) {
    button.addEventListener("click", () => {
      state.colorMode = button.dataset.mode;
      state.activeStop = "from";
      if (state.colorMode === "gradient" && state.selection.size >= 2) {
        applyGradient(state.gradFrom, state.gradTo, "gradient");
      }
      renderInspector();
    });
  }

  $("#icon-input").addEventListener("input", (event) => {
    const raw = event.target.value.trim();
    if (raw === "") {
      setEdit({ iconIndex: undefined });
      return;
    }
    const value = Number.parseInt(raw, 10);
    if (Number.isNaN(value)) return;
    setEdit({ iconIndex: Math.max(0, value) }, "icon");
  });

  $("#tip-input").addEventListener("input", (event) => {
    setEdit({ tip: event.target.value }, "tip");
  });

  $("#height-input").addEventListener("input", (event) => {
    const raw = event.target.value.trim();
    if (raw === "") {
      setEdit({ heightOfs: undefined });
      return;
    }
    const value = Math.max(0, Math.min(100, Number.parseInt(raw, 10)));
    if (Number.isNaN(value)) return;
    setEdit({ heightOfs: value }, "height");
  });

  $("#badge-choose").addEventListener("click", () => void chooseBadge());
  $("#reset-badge").addEventListener("click", () => setEdit({ bitmap: undefined }));
  $("#reset-color").addEventListener("click", () => setEdit({ color: undefined }));
  $("#reset-icon").addEventListener("click", () => setEdit({ iconIndex: undefined }));
  $("#reset-tip").addEventListener("click", () =>
    setEdit({ tip: undefined, heightOfs: undefined }),
  );
  $("#reset-all").addEventListener("click", () =>
    setEdit({
      color: undefined,
      iconIndex: undefined,
      heightOfs: undefined,
      sortGroup: undefined,
      tip: undefined,
      bitmap: undefined,
    }),
  );

  $("#apply").addEventListener("click", () => void apply());
  $("#undo-apply").addEventListener("click", () => void undoLastApply());
  $("#discard").addEventListener("click", () => discard());

  $("#name-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void submitNameDialog();
  });
  $("#name-cancel").addEventListener("click", () => closeNameDialog(null));
  $("#name-dialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeNameDialog(null);
  });

  $("#tree-menu").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const target = menuTarget;
    closeTreeMenu();
    if (action === "new") void createFolder(target);
    else if (action === "rename") void renameFolder(target);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("#tree-menu")) closeTreeMenu();
  });
  document.querySelector(".tree-scroll").addEventListener("scroll", closeTreeMenu);
  window.addEventListener("blur", closeTreeMenu);
  window.addEventListener("resize", closeTreeMenu);

  $("#preview-bg").addEventListener("input", (event) => {
    state.previewBg = event.target.value;
    localStorage.setItem("kitforge:preview-bg", state.previewBg);
    applyPreviewBg();
  });
  $("#reset-preview-bg").addEventListener("click", () => {
    state.previewBg = null;
    localStorage.removeItem("kitforge:preview-bg");
    applyPreviewBg();
  });

  $("#preview-scroll").addEventListener("mousedown", (event) => {
    if (!event.target.closest(".pv-row")) {
      state.selection.clear();
      renderAll();
    }
  });

  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const root = await api.resolveDroppedFolder(file);
    if (root) await openRoot(root);
    else setMainStatus("esa entrada no es una carpeta válida");
  });

  window.addEventListener("keydown", (event) => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(
      document.activeElement?.tagName ?? "",
    );
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === "Escape") closeTreeMenu();
    if (!mod) {
      if (!inField && event.key === "F2") {
        event.preventDefault();
        void renameFolder();
      }
      return;
    }
    const key = event.key.toLowerCase();

    if (key === "o") {
      event.preventDefault();
      void openKit();
      return;
    }
    if (inField) return;
    if (key === "s") {
      event.preventDefault();
      void apply();
    } else if (key === "n" && event.shiftKey) {
      event.preventDefault();
      void createFolder();
    } else if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (key === "y") {
      event.preventDefault();
      redo();
    }
  });
}

function initKeyboardLabels() {
  for (const id of ["#mod-key", "#mod-key-2", "#mod-key-3"]) {
    const node = $(id);
    if (node) node.textContent = MOD;
  }
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

function boot() {
  document.documentElement.dataset.platform = api?.platform ?? "";
  applyTheme();
  applyPreviewBg();
  buildSwatches();
  bindEvents();
  initKeyboardLabels();
  renderAll();

  void ensureIconFont().then((ok) => {
    if (ok) renderAll();
  });

  const lastRoot = localStorage.getItem("kitforge:root");
  if (lastRoot && api) {
    void openRoot(lastRoot).catch(() => {});
  }
}

boot();
