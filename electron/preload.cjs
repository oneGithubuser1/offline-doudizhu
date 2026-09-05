const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("riverLab", {
  loadSave: () => ipcRenderer.invoke("save:load"),
  saveGame: (data) => ipcRenderer.invoke("save:write", data),
});
