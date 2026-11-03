"use strict";

/*
 * Catálogo de iconos de FL Studio para la vista previa.
 *
 * La mayoría de los `IconIndex` del navegador de FL corresponden a glifos de
 * la fuente ILGlyphsEx que viene instalada con FL Studio. KitForge no copia
 * los PNG del artefacto original: lee la fuente instalada en tiempo de
 * ejecución y pinta el glifo. Este archivo solo contiene la tabla
 * índice → punto de código y unos pocos dibujos vectoriales propios para los
 * iconos internos que no existen como glifo.
 */

const KITFORGE_ICON_GLYPHS = Object.freeze({
  1: 0xF101,
  2: 0xF102,
  3: 0xF103,
  4: 0xF104,
  5: 0xF105,
  6: 0xF106,
  8: 0xF108,
  9: 0xF014,
  11: 0xF10B,
  12: 0xF10C,
  13: 0xF10D,
  14: 0xF10E,
  16: 0xF110,
  17: 0xF111,
  18: 0xF112,
  19: 0xF113,
  20: 0xF114,
  22: 0xF41B,
  23: 0xF117,
  24: 0xF118,
  25: 0xF119,
  26: 0xF11A,
  27: 0xF11B,
  28: 0xF11C,
  29: 0xF11D,
  30: 0xF11E,
  31: 0xF11F,
  32: 0xF120,
  33: 0xF09E,
  34: 0xF014,
  35: 0xF123,
  36: 0xF124,
  37: 0xF10B,
  38: 0xF126,
  39: 0xF031,
  41: 0xF014,
  42: 0xF123,
  44: 0xF12C,
  45: 0xF12D,
  46: 0xF12E,
  47: 0xF12F,
  48: 0xF130,
  49: 0xF131,
  50: 0xF132,
  51: 0xF133,
  52: 0xF134,
  768: 0xF05D,
  769: 0xF401,
  770: 0xF402,
  771: 0xF403,
  772: 0xF404,
  773: 0xF405,
  775: 0xF407,
  776: 0xF408,
  777: 0xF409,
  778: 0xF40A,
  779: 0xF40B,
  781: 0xF40D,
  782: 0xF40E,
  783: 0xF40F,
  784: 0xF410,
  787: 0xF413,
  788: 0xF414,
  789: 0xF415,
  790: 0xF416,
  792: 0xF12C,
  793: 0xF419,
  794: 0xF123,
  795: 0xF116,
  796: 0xF41C,
  798: 0xF41E,
  799: 0xF41F,
  800: 0xF420,
  801: 0xF421,
  802: 0xF422,
  804: 0xF424,
  805: 0xF425,
  806: 0xF426,
  807: 0xF427,
  808: 0xF428,
  809: 0xF062,
  811: 0xF42B,
  812: 0xF42C,
  813: 0xF42D,
  814: 0xF42E,
  815: 0xF42F,
  816: 0xF430,
  817: 0xF431,
  818: 0xF432,
  819: 0xF433,
  820: 0xF434,
  821: 0xF435,
  822: 0xF436,
  823: 0xF437,
  824: 0xF438,
  825: 0xF439,
  826: 0xF43A,
  828: 0xF43C,
  829: 0xF43D,
  830: 0xF43E,
  832: 0xF43F,
  834: 0xF442,
  835: 0xF443,
  836: 0xF444,
  837: 0xF445,
  842: 0xF06F,
  843: 0xF127,
  846: 0xF44E,
  848: 0xF450,
  849: 0xF451,
  856: 0xF458,
  857: 0xF459,
  858: 0xF45A,
  859: 0xF45B,
  860: 0xF45C,
  861: 0xF013,
  862: 0xF45E,
  863: 0xF02B,
  864: 0xF00A,
  865: 0xF00B,
  866: 0xF00D,
  867: 0xF011,
  868: 0xF464,
  869: 0xF025,
  870: 0xF024,
  871: 0xF073,
  872: 0xF102,
  875: 0xF46B,
  876: 0xF46C,
  878: 0xF46E,
  879: 0xF46F,
  880: 0xF470,
  881: 0xF471,
  882: 0xF472,
  883: 0xF473,
  884: 0xF474,
  885: 0xF475,
  886: 0xF476,
  887: 0xF477,
  888: 0xF478,
  889: 0xF479,
  890: 0xF47A,
  891: 0xF47B,
  892: 0xF47C,
  894: 0xF47E,
  895: 0xF47F,
  896: 0xF480,
  897: 0xF481,
  898: 0xF482,
  904: 0xF488,
  906: 0xF48A,
  907: 0xF48B,
  908: 0xF51A,
  912: 0xF490,
  914: 0xF492,
  920: 0xF498,
  921: 0xF499,
  922: 0xF49A,
  923: 0xF49B,
  924: 0xF49C,
  925: 0xF49D,
  926: 0xF49E,
  927: 0xF49F,
  928: 0xF4A0,
  929: 0xF4A1,
  931: 0xF4A3,
  932: 0xF4A4,
  933: 0xF4A5,
  935: 0xF4A7,
  940: 0xF4AC,
  941: 0xF4AD,
  947: 0xF4B3,
  948: 0xF4B4,
  949: 0xF4B5,
  950: 0xF4B6,
  951: 0xF4B7,
  954: 0xF4BA,
  958: 0xF4BE,
  959: 0xF4BF,
  960: 0xF4C0,
  961: 0xF4C1,
  970: 0xF4CA,
  972: 0xF4CC,
  975: 0xF4CF,
  986: 0xF4DA,
  999: 0xF4EE,
});

/*
 * Dibujos propios para índices que no tienen un glifo equivalente en la
 * fuente (robot, gráficas, pasos, automatización...). Son SVG mínimos, no
 * recursos del KitSkin original.
 */
const KITFORGE_ICON_SVGS = Object.freeze({
  791: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3.5v2"/>
      <circle cx="12" cy="2.6" r="1.1" fill="currentColor" stroke="none"/>
      <rect x="5" y="7" width="14" height="10" rx="2.4"/>
      <path d="M3 10v3M21 10v3"/>
      <circle cx="9.2" cy="11.2" r="1" fill="currentColor" stroke="none"/>
      <circle cx="14.8" cy="11.2" r="1" fill="currentColor" stroke="none"/>
      <path d="M9 14h6"/>
      <path d="M8 17v2M16 17v2"/>
    </svg>`,
  909: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="3.5" width="18" height="17" rx="1.5"/>
      <path d="M3 9h18M3 14.5h18M8.5 3.5v17M14 3.5v17M19 3.5v17"/>
      <path d="M4.5 18.5c3.8-.8 4.6-8.2 8.8-8.2 3.3 0 4.2 2.9 6.2 2.9" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`,
  930: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/>
      <path d="M6.3 13v-1.2a5.7 5.7 0 0 1 11.4 0V13"/>
      <rect x="4.8" y="12" width="3" height="5.2" rx="1.5"/>
      <rect x="16.2" y="12" width="3" height="5.2" rx="1.5"/>
    </svg>`,
  943: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 3v8a4 4 0 0 0 8 0V3"/>
      <path d="M12 15v6"/>
      <path d="M9.5 21h5"/>
    </svg>`,
  952: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 19c5.5 0 6-12 9-12"/>
      <path d="M12 3.5v17"/>
      <path d="M15.5 6.5 21 17.5"/>
    </svg>`,
  953: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 6.5c5.5 0 6 12 9 12"/>
      <path d="M12 3.5v17"/>
      <path d="M15.5 17.5 21 6.5"/>
    </svg>`,
  962: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1"/>
      <rect x="13.5" y="3.5" width="7" height="7" rx="1"/>
      <rect x="3.5" y="13.5" width="7" height="7" rx="1"/>
      <rect x="13.5" y="13.5" width="7" height="7" rx="1"/>
    </svg>`,
  963: `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="2.5" y="10" width="5" height="4" rx="1"/>
      <rect x="9.5" y="10" width="5" height="4" rx="1"/>
      <rect x="16.5" y="10" width="5" height="4" rx="1"/>
    </svg>`,
  968: `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1"/>
      <rect x="13.5" y="3.5" width="7" height="7" rx="1"/>
      <rect x="3.5" y="13.5" width="7" height="7" rx="1"/>
      <rect x="13.5" y="13.5" width="7" height="7" rx="1"/>
    </svg>`,
  976: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 6h5c2.8 0 4-1.8 6-1.8h7"/>
      <path d="M3 12h15"/>
      <path d="M3 18h5c2.8 0 4 1.8 6 1.8h7"/>
    </svg>`,
  977: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <path d="M2 12c2.2-5.2 4.4-5.2 6.6 0s4.4 5.2 6.6 0 4.4-5.2 6.8 0"/>
    </svg>`,
  978: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="1.2"/>
      <path d="M3 8.5h18M3 13h18M3 17.5h18M8 4v16M13 4v16M18 4v16"/>
      <path d="M5 17l4-5 3.5 2.5 4-5 3 1.5" stroke-width="2" stroke-linecap="round"/>
      <circle cx="12.5" cy="14.5" r="1.4" fill="currentColor" stroke="none"/>
    </svg>`,
});

const KitForgeIcons = Object.freeze({
  glyphs: KITFORGE_ICON_GLYPHS,
  svgs: KITFORGE_ICON_SVGS,
});

if (typeof window !== "undefined") {
  window.KitForgeIcons = KitForgeIcons;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = KitForgeIcons;
}
