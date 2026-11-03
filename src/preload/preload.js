"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

/**
 * Superficie mínima expuesta al renderer. No se expone `ipcRenderer` ni
 * acceso al sistema de archivos: todo pasa por handlers validados.
 */
const api = {
  platform: process.platform,

  // Kit
  chooseKit: () => ipcRenderer.invoke("kit:choose"),
  resolveDroppedFolder: (file) => {
    let filePath;
    try {
      filePath = webUtils.getPathForFile(file);
    } catch {
      return Promise.resolve(null);
    }
    return filePath
      ? ipcRenderer.invoke("kit:resolve-dropped", filePath)
      : Promise.resolve(null);
  },
  scan: (root) => ipcRenderer.invoke("kit:scan", root),
  createFolder: (root, parent, name) =>
    ipcRenderer.invoke("kit:create-folder", root, parent, name),
  renameFolder: (root, folder, name) =>
    ipcRenderer.invoke("kit:rename-folder", root, folder, name),
  apply: (items) => ipcRenderer.invoke("kit:apply", items),
  cleanupUnused: (root, keep) => ipcRenderer.invoke("kit:cleanup", root, keep),
  exportKit: (root) => ipcRenderer.invoke("kit:export", root),
  cancelExport: () => ipcRenderer.invoke("kit:export-cancel"),
  onExportProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on("kit:export-progress", handler);
    return () => ipcRenderer.removeListener("kit:export-progress", handler);
  },
  reveal: (target) => ipcRenderer.invoke("kit:reveal", target),

  // Imágenes
  pickImage: () => ipcRenderer.invoke("kit:pick-image"),
  saveBadge: (targets, dataUrl) =>
    ipcRenderer.invoke("kit:save-badge", targets, dataUrl),

  // Iconos: fuente ILGlyphsEx instalada con FL Studio
  loadIconFont: () => ipcRenderer.invoke("font:icon"),

  // Ventana
  setTheme: (theme) => ipcRenderer.send("window:theme", theme),
};

contextBridge.exposeInMainWorld("kitforge", api);
