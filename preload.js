const { contextBridge, ipcRenderer } = require('electron');

// Expose APIs to the renderer thread safely
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  downloadToTemp: (url, filename) => ipcRenderer.invoke('recording:download', { url, filename }),
  exportPdf: (html, filename) => ipcRenderer.invoke('export:pdf', { html, filename }),
  notify: (title, body) => ipcRenderer.invoke('notify:show', { title, body }),
});

contextBridge.exposeInMainWorld('ai', {
  checkHealth: () => ipcRenderer.invoke('ai:checkHealth'),
  processCall: (audioPath, customerId) => ipcRenderer.invoke('ai:processCall', audioPath, customerId),
  processSampleCall: () => ipcRenderer.invoke('ai:processSampleCall'),
});


