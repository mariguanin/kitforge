"use strict";

/**
 * Lector/escritor de los archivos `.nfo` que FL Studio usa para describir
 * una carpeta de su navegador. Implementación propia del formato:
 *
 *   Color=$BBGGRR      (orden BGR con prefijo $; la UI usa #RRGGBB)
 *   IconIndex=772
 *   HeightOfs=0
 *   SortGroup=13
 *   Tip=texto
 *   Bitmap=carpeta/imagen.png
 *   Visible=True|False
 *
 * Cualquier otra clave se conserva sin tocar.
 */

const KNOWN_KEYS = new Set([
  "color",
  "iconindex",
  "heightofs",
  "sortgroup",
  "tip",
  "bitmap",
  "visible",
]);

/** Claves que la aplicación puede editar (en orden de serialización). */
const SPEC_KEYS = [
  "color",
  "iconIndex",
  "heightOfs",
  "sortGroup",
  "tip",
  "bitmap",
  "visible",
];

function toLowerHex(value) {
  return String(value).trim().replace(/^[#$]/, "").toLowerCase();
}

/** "#RRGGBB" | "#RGB" -> "$BBGGRR" */
function cssToNfoColor(css) {
  let hex = String(css).trim().replace(/^#/, "").toLowerCase();
  if (hex.length === 3) {
    hex = [...hex].map((c) => c + c).join("");
  }
  if (!/^[0-9a-f]{6}$/.test(hex)) {
    throw new Error(`color CSS inválido: ${css}`);
  }
  const r = hex.slice(0, 2);
  const g = hex.slice(2, 4);
  const b = hex.slice(4, 6);
  return `$${b}${g}${r}`;
}

/** "$BBGGRR" | "$AABBGGRR" -> "#RRGGBB" (undefined si no se puede leer) */
function nfoToCssColor(raw) {
  let hex = toLowerHex(raw);
  if (!hex) return undefined;
  if (hex.length === 8) hex = hex.slice(2);
  hex = hex.padStart(6, "0");
  if (!/^[0-9a-f]{6}$/.test(hex)) return undefined;
  const b = hex.slice(0, 2);
  const g = hex.slice(2, 4);
  const r = hex.slice(4, 6);
  return `#${r}${g}${b}`;
}

function parseIntStrict(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * @param {string} text contenido del .nfo
 * @returns {{color?:string, iconIndex?:number, heightOfs?:number, sortGroup?:number,
 *            tip?:string, bitmap?:string, visible?:boolean, unknown?:Record<string,string>}}
 */
function parseNfo(text) {
  const spec = {};
  for (const line of String(text).split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue; // comentarios / marca de agua / líneas vacías

    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1);

    switch (key.toLowerCase()) {
      case "color": {
        const color = nfoToCssColor(value);
        if (color) spec.color = color;
        break;
      }
      case "iconindex": {
        const n = parseIntStrict(value);
        if (n !== undefined) spec.iconIndex = n;
        break;
      }
      case "heightofs": {
        const n = parseIntStrict(value);
        if (n !== undefined) spec.heightOfs = n;
        break;
      }
      case "sortgroup": {
        const n = parseIntStrict(value);
        if (n !== undefined) spec.sortGroup = n;
        break;
      }
      case "tip":
        spec.tip = value;
        break;
      case "bitmap":
        if (value) spec.bitmap = value;
        break;
      case "visible":
        if (value.trim()) spec.visible = value.trim().toLowerCase() === "true";
        break;
      default:
        (spec.unknown ??= {})[key] = value;
    }
  }
  return spec;
}

/** Serializa un spec respetando el orden de claves de FL Studio. */
function serializeNfo(spec = {}) {
  const lines = [];
  if (spec.color != null) lines.push(`Color=${cssToNfoColor(spec.color)}`);
  if (spec.iconIndex != null) {
    lines.push(`IconIndex=${Math.trunc(Number(spec.iconIndex))}`);
  }
  if (spec.heightOfs != null) {
    lines.push(`HeightOfs=${Math.trunc(Number(spec.heightOfs))}`);
  }
  if (spec.sortGroup != null) {
    lines.push(`SortGroup=${Math.trunc(Number(spec.sortGroup))}`);
  }
  if (spec.tip != null) lines.push(`Tip=${spec.tip}`);
  if (spec.bitmap != null) lines.push(`Bitmap=${spec.bitmap}`);
  if (spec.visible != null) {
    lines.push(`Visible=${spec.visible ? "True" : "False"}`);
  }
  for (const [key, value] of Object.entries(spec.unknown ?? {})) {
    if (KNOWN_KEYS.has(key.toLowerCase())) continue;
    if (value == null) continue;
    lines.push(`${key}=${value}`);
  }
  return lines.join("\n") + "\n";
}

/** true cuando no queda nada que FL Studio pueda interpretar. */
function isSpecEmpty(spec = {}) {
  return (
    spec.color == null &&
    spec.iconIndex == null &&
    spec.heightOfs == null &&
    spec.sortGroup == null &&
    (spec.tip == null || spec.tip === "") &&
    spec.bitmap == null &&
    spec.visible == null &&
    Object.keys(spec.unknown ?? {}).length === 0
  );
}

/** `drums` -> `drums.nfo`; `Kit v1.0` -> `Kit v1.nfo` (convención de FL). */
function nfoBaseName(folderName) {
  const dot = folderName.lastIndexOf(".");
  return `${dot === -1 ? folderName : folderName.slice(0, dot)}.nfo`;
}

/** Devuelve el spec fusionado con las ediciones pendientes de una carpeta. */
function effectiveSpec(nfo, partial) {
  return { ...(nfo ?? {}), ...(partial ?? {}) };
}

module.exports = {
  KNOWN_KEYS,
  SPEC_KEYS,
  cssToNfoColor,
  nfoToCssColor,
  parseNfo,
  serializeNfo,
  isSpecEmpty,
  nfoBaseName,
  effectiveSpec,
};
