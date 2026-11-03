"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sortNodes,
  flattenTree,
  parentOf,
  baseName,
  sortGroupsForOrder,
  moveInOrder,
  isInsidePosix,
  isIgnoredDir,
  isJunkFile,
} = require("../src/core/tree");

const node = (name, sortGroup, children = []) => ({
  name,
  path: name,
  nfo: sortGroup === undefined ? null : { sortGroup },
  children,
});

test("sortNodes ordena por SortGroup descendente y nombre natural", () => {
  const nodes = [
    node("kit 10", 0),
    node("kit 2", 0),
    node("top", 5),
    node("mid", 1),
  ];
  assert.deepEqual(
    sortNodes(nodes, (n) => n.nfo).map((n) => n.name),
    ["top", "mid", "kit 2", "kit 10"],
  );
});

test("sortNodes usa -1 cuando no hay SortGroup", () => {
  const nodes = [node("b"), node("a", -2), node("c", undefined)];
  assert.deepEqual(
    sortNodes(nodes, (n) => n.nfo).map((n) => n.name),
    ["b", "c", "a"],
  );
});

test("flattenTree recorre en pre-order", () => {
  const tree = [
    node("a", 0, [node("a1", 0), node("a2", 0, [node("a2x", 0)])]),
    node("b", 0),
  ];
  assert.deepEqual(
    flattenTree(tree).map((n) => n.name),
    ["a", "a1", "a2", "a2x", "b"],
  );
});

test("parentOf y baseName trabajan con rutas posix", () => {
  assert.equal(parentOf("C:/kits/drums"), "C:/kits");
  assert.equal(parentOf("/kits"), "");
  assert.equal(baseName("C:/kits/drums"), "drums");
  assert.equal(baseName("drums"), "drums");
});

test("sortGroupsForOrder deja el primero arriba", () => {
  const groups = sortGroupsForOrder(["a", "b", "c"]);
  assert.equal(groups.get("a"), 3);
  assert.equal(groups.get("b"), 2);
  assert.equal(groups.get("c"), 1);
});

test("moveInOrder mueve un bloque antes o después del destino", () => {
  const order = ["a", "b", "c", "d"];
  assert.deepEqual(moveInOrder(order, ["c"], "a", "above"), [
    "c",
    "a",
    "b",
    "d",
  ]);
  assert.deepEqual(moveInOrder(order, ["a"], "c", "below"), [
    "b",
    "c",
    "a",
    "d",
  ]);
  assert.deepEqual(moveInOrder(order, ["a", "b"], "d", "below"), [
    "c",
    "d",
    "a",
    "b",
  ]);
  // mover sobre sí mismo no altera el orden
  assert.deepEqual(moveInOrder(order, ["b"], "b", "above"), order);
  // destino inexistente
  assert.deepEqual(moveInOrder(order, ["b"], "zz", "above"), order);
});

test("isInsidePosix distingue prefijos y mayúsculas", () => {
  assert.equal(isInsidePosix("C:/kits", "C:/kits/drums"), true);
  assert.equal(isInsidePosix("C:/kits", "C:/kits"), true);
  assert.equal(isInsidePosix("c:/KITS", "C:/kits/drums"), true);
  assert.equal(isInsidePosix("C:/kits", "C:/kits-2/drums"), false);
  assert.equal(isInsidePosix("C:/kits", "C:/other"), false);
});

test("isIgnoredDir e isJunkFile filtran basura del sistema", () => {
  assert.equal(isIgnoredDir(".git"), true);
  assert.equal(isIgnoredDir("$RECYCLE.BIN"), true);
  assert.equal(isIgnoredDir("drums"), false);
  assert.equal(isJunkFile("Thumbs.db"), true);
  assert.equal(isJunkFile("._resource"), true);
  assert.equal(isJunkFile("kick.wav"), false);
});
