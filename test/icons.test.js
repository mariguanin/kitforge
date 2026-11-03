"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const icons = require("../src/renderer/icons.js");

const CUSTOM = new Set([
  "791",
  "909",
  "930",
  "943",
  "952",
  "953",
  "962",
  "963",
  "968",
  "976",
  "977",
  "978",
]);

test("el catálogo cubre los 198 iconos conocidos sin solaparse", () => {
  const glyphs = Object.keys(icons.glyphs);
  const svgs = Object.keys(icons.svgs);
  const all = new Set([...glyphs, ...svgs]);

  assert.equal(glyphs.length + svgs.length, 198);
  assert.equal(all.size, 198);

  for (const key of all) {
    assert.match(key, /^\d+$/);
    const inGlyphs = Object.prototype.hasOwnProperty.call(icons.glyphs, key);
    const inSvgs = Object.prototype.hasOwnProperty.call(icons.svgs, key);
    assert.notEqual(inGlyphs, inSvgs, `índice duplicado: ${key}`);
  }
});

test("los glifos están en el área de uso privado de ILGlyphsEx", () => {
  for (const [index, codepoint] of Object.entries(icons.glyphs)) {
    assert.equal(typeof codepoint, "number", `índice ${index}`);
    assert.ok(
      codepoint >= 0xf000 && codepoint <= 0xf8ff,
      `índice ${index}: U+${codepoint.toString(16)}`,
    );
  }
});

test("los iconos de batería y routing apuntan a sus glifos", () => {
  assert.equal(icons.glyphs[772], 0xf404); // Snare_drum
  assert.equal(icons.glyphs[773], 0xf405); // Kick_drum
  assert.equal(icons.glyphs[836], 0xf444); // routing 1→2
  assert.equal(icons.glyphs[837], 0xf445); // routing 1→3
});

test("los dígitos de siete segmentos usan los glifos segmentados", () => {
  assert.equal(icons.glyphs[828], 0xf43c); // Two
  assert.equal(icons.glyphs[829], 0xf43d); // Three
  assert.equal(icons.glyphs[830], 0xf43e); // Four
  assert.equal(icons.glyphs[832], 0xf43f); // Five
  assert.equal(icons.glyphs[834], 0xf442); // Eight
  assert.equal(icons.glyphs[835], 0xf443); // Nine
});

test("los iconos sin glifo exacto tienen un SVG propio", () => {
  for (const index of CUSTOM) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(icons.glyphs, index),
      false,
      `el índice ${index} no debe tener glifo`,
    );
    const svg = icons.svgs[index];
    assert.equal(typeof svg, "string", `falta el SVG del índice ${index}`);
    assert.match(svg, /^\s*<svg[\s\S]*<\/svg>\s*$/);
  }
  assert.equal(icons.glyphs[999], 0xf4ee); // rejilla de pasos
});
