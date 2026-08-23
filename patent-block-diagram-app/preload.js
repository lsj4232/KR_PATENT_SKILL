const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  saveJSON: (data, saveAs) => ipcRenderer.invoke('save-json', data, saveAs),
  loadJSON: () => ipcRenderer.invoke('load-json'),
  exportPNG: dataURL => ipcRenderer.invoke('export-png', dataURL),
  loadImage: () => ipcRenderer.invoke('load-image'),
  clipboardImage: () => ipcRenderer.invoke('clipboard-image'),
  onOpenFile: cb => ipcRenderer.on('open-file', (e, text) => cb(text))
})
