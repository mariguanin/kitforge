"use strict";

/** Utilidades puras compartidas por el proceso principal y la interfaz. */

const IGNORED_DIRS = new Set([
  ".git",
  ".svn",
  ".hg",
  ".bzr",
  ".idea",
  ".vscode",
  ".trash",
  ".trashes",
  ".spotlight-v100",
  ".fseventsd",
  ".temporaryitems",
  ".documentrevisions-v100",
  "$recycle.bin",
  "system volume information",
]);

const JUNK_FILES = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
  "__macosx",
]);

const MAX_DEPTH = 6;

function isIgnoredDir(name) {
  return IGNORED_DIRS.has(String(name).toLowerCase());
}

function isJunkFile(name) {
  const lower = String(name).toLowerCase();
  return JUNK_FILES.has(lower) || lower.startsWith("._");
}

/** Orden visible de FL Studio: SortGroup descendente, empate por nombre natural. */
function sortNodes(nodes, specOf) {
  return [...nodes].sort((a, b) => {
    const ga = specOf(a)?.sortGroup ?? -1;
    const gb = specOf(b)?.sortGroup ?? -1;
    if (ga !== gb) return gb - ga;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

/** Aplana un árbol ya ordenado (pre-order). */
function flattenTree(nodes) {
  const out = [];
  for (const node of nodes) {
    out.push(node);
    if (node.children?.length) out.push(...flattenTree(node.children));
  }
  return out;
}

function parentOf(posixPath) {
  const cut = String(posixPath).lastIndexOf("/");
  return cut <= 0 ? "" : String(posixPath).slice(0, cut);
}

function baseName(posixPath) {
  const cut = String(posixPath).lastIndexOf("/");
  return cut === -1 ? String(posixPath) : String(posixPath).slice(cut + 1);
}

/**
 * Asigna SortGroup a una lista de hermanos en el orden dado.
 * El primero queda arriba (valor más alto).
 */
function sortGroupsForOrder(orderedPaths) {
  const groups = new Map();
  orderedPaths.forEach((path, index) => {
    groups.set(path, orderedPaths.length - index);
  });
  return groups;
}

/** Reordena `orderedPaths` moviendo `moved` antes/después de `target`. */
function moveInOrder(order, moved, target, position) {
  const moving = new Set(moved);
  if (moving.has(target)) return order;
  const rest = order.filter((path) => !moving.has(path));
  const at = rest.indexOf(target);
  if (at === -1) return order;
  const next = [...rest];
  next.splice(at + (position === "below" ? 1 : 0), 0, ...moved.filter((p) => order.includes(p)));
  return next;
}

/** true si `child` está dentro de `root` (rutas posix, sin `..`). */
function isInsidePosix(root, child) {
  const a = root.replace(/\/+$/, "");
  const b = String(child).replace(/\/+$/, "");
  if (a.toLowerCase() === b.toLowerCase()) return true;
  return b.toLowerCase().startsWith(`${a.toLowerCase()}/`);
}

module.exports = {
  IGNORED_DIRS,
  MAX_DEPTH,
  isIgnoredDir,
  isJunkFile,
  sortNodes,
  flattenTree,
  parentOf,
  baseName,
  sortGroupsForOrder,
  moveInOrder,
  isInsidePosix,
};
