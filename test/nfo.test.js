"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  cssToNfoColor,
  nfoToCssColor,
  parseNfo,
  serializeNfo,
  isSpecEmpty,
  nfoBaseName,
  effectiveSpec,
} = require("../src/core/nfo");

test("cssToNfoColor convierte #RRGGBB a $BBGGRR", () => {
  assert.equal(cssToNfoColor("#ff4fa3"), "$a34fff");
  assert.equal(cssToNfoColor("#000000"), "$000000");
  assert.equal(cssToNfoColor("#FFFFFF"), "$ffffff");
});

test("cssToNfoColor expande la forma corta #RGB", () => {
  assert.equal(cssToNfoColor("#f0a"), "$aa00ff");
});

test("cssToNfoColor rechaza valores inválidos", () => {
  assert.throws(() => cssToNfoColor("nope"));
  assert.throws(() => cssToNfoColor("#12345"));
  assert.throws(() => cssToNfoColor("#gggggg"));
});

test("nfoToCssColor invierte el orden de bytes", () => {
  assert.equal(nfoToCssColor("$a34fff"), "#ff4fa3");
  assert.equal(nfoToCssColor("A34FFF"), "#ff4fa3");
  assert.equal(nfoToCssColor("$ffa34fff"), "#ff4fa3"); // $AABBGGRR
  assert.equal(nfoToCssColor("$zzzzzz"), undefined);
  assert.equal(nfoToCssColor(""), undefined);
  assert.equal(nfoToCssColor("$"), undefined);
});

test("parseNfo lee las claves conocidas y conserva las desconocidas", () => {
  const spec = parseNfo(
    [
      "; comentario",
      "Color=$a34fff",
      "IconIndex=772",
      "HeightOfs=3",
      "SortGroup=-1",
      "Tip=Punchy drums",
      "Bitmap=-/badge 1.png",
      "Visible=False",
      "CustomKey=keep me",
      "",
    ].join("\r\n"),
  );

  assert.deepEqual(spec, {
    color: "#ff4fa3",
    iconIndex: 772,
    heightOfs: 3,
    sortGroup: -1,
    tip: "Punchy drums",
    bitmap: "-/badge 1.png",
    visible: false,
    unknown: { CustomKey: "keep me" },
  });
});

test("parseNfo ignora líneas sin '=' y valores numéricos inválidos", () => {
  const spec = parseNfo("basura\nIconIndex=abc\nTip=x");
  assert.equal(spec.iconIndex, undefined);
  assert.equal(spec.tip, "x");
});

test("serializeNfo escribe en orden y conserva claves desconocidas", () => {
  const text = serializeNfo({
    color: "#ff4fa3",
    iconIndex: 772,
    heightOfs: 2,
    sortGroup: 13,
    tip: "Hello",
    bitmap: "-/badge.png",
    visible: true,
    unknown: { Extra: "1" },
  });

  assert.equal(
    text,
    [
      "Color=$a34fff",
      "IconIndex=772",
      "HeightOfs=2",
      "SortGroup=13",
      "Tip=Hello",
      "Bitmap=-/badge.png",
      "Visible=True",
      "Extra=1",
      "",
    ].join("\n"),
  );
});

test("serializeNfo omite claves nulas o ausentes", () => {
  assert.equal(serializeNfo({}), "\n");
  assert.equal(serializeNfo({ color: null, tip: undefined }), "\n");
});

test("serializeNfo no duplica claves conocidas de `unknown`", () => {
  const text = serializeNfo({ unknown: { color: "$000000", Note: "x" } });
  assert.equal(text, "Note=x\n");
});

test("parse + serialize conservan el contenido de ida y vuelta", () => {
  const original = [
    "Color=$a34fff",
    "IconIndex=2",
    "SortGroup=4",
    "Tip=808",
    "Bitmap=-/808.png",
    "Mystery=value",
    "",
  ].join("\n");
  const again = serializeNfo(parseNfo(original));
  assert.equal(again, original);
});

test("isSpecEmpty detecta specs sin datos útiles", () => {
  assert.equal(isSpecEmpty({}), true);
  assert.equal(isSpecEmpty({ color: null, tip: "" }), true);
  assert.equal(isSpecEmpty({ unknown: {} }), true);
  assert.equal(isSpecEmpty({ tip: "x" }), false);
  assert.equal(isSpecEmpty({ color: "#000000" }), false);
  assert.equal(isSpecEmpty({ iconIndex: 0 }), false);
  assert.equal(isSpecEmpty({ visible: false }), false);
});

test("nfoBaseName sigue la convención de FL Studio", () => {
  assert.equal(nfoBaseName("drums"), "drums.nfo");
  assert.equal(nfoBaseName("808 Kit"), "808 Kit.nfo");
  assert.equal(nfoBaseName("Kit v1.0"), "Kit v1.nfo");
  assert.equal(nfoBaseName("a.b.c"), "a.b.nfo");
});

test("effectiveSpec fusiona sin mutar el original", () => {
  const base = { color: "#111111", iconIndex: 1 };
  const merged = effectiveSpec(base, { iconIndex: 2 });
  assert.deepEqual(merged, { color: "#111111", iconIndex: 2 });
  assert.equal(base.iconIndex, 1);
});
