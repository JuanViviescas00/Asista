import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('huellero', {
  getStatus: () => ipcRenderer.invoke('huellero:getStatus'),
  capturarYVerificar: () => ipcRenderer.invoke('huellero:capture'),
  loginDocente: (correo, password) => ipcRenderer.invoke('huellero:login', correo, password),
  logoutDocente: () => ipcRenderer.invoke('huellero:logout'),
  getFichasLider: () => ipcRenderer.invoke('huellero:getFichasLider'),
  getEstudiantesFicha: (fichaId) => ipcRenderer.invoke('huellero:getEstudiantesFicha', fichaId),
  enrolarEstudiante: (payload) => ipcRenderer.invoke('huellero:enrolar', payload),
  cancelarEnrolamiento: () => ipcRenderer.invoke('huellero:cancelarEnrolar'),
  cancelarCaptura: () => ipcRenderer.invoke('huellero:cancelarCaptura'),
  onEnrolarProgreso: (callback) => {
    const listener = (_event, progreso) => callback(progreso)
    ipcRenderer.on('huellero:enrolar-progreso', listener)
    return () => ipcRenderer.removeListener('huellero:enrolar-progreso', listener)
  },
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('huellero:status', listener)
    return () => ipcRenderer.removeListener('huellero:status', listener)
  },
})
