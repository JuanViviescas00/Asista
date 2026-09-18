import { app, BrowserWindow, ipcMain } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as engine from './engine.js'
import { iniciarScheduler } from './scheduler.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow = null

function broadcastStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('huellero:status', engine.getStatus())
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    fullscreen: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  })

  mainWindow.setMenuBarVisibility(false)

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle('huellero:getStatus', () => engine.getStatus())
ipcMain.handle('huellero:capture', () => engine.capturarYVerificar())
ipcMain.handle('huellero:login', (_e, correo, password) => engine.loginDocente(correo, password))
ipcMain.handle('huellero:logout', () => engine.logoutDocente())
ipcMain.handle('huellero:getFichasLider', () => engine.getFichasLider())
ipcMain.handle('huellero:getEstudiantesFicha', (_e, fichaId) => engine.getEstudiantesFicha(fichaId))
ipcMain.handle('huellero:enrolar', (_e, payload) => engine.enrolarEstudiante(payload))
ipcMain.handle('huellero:cancelarEnrolar', () => engine.cancelarEnrolamiento())
ipcMain.handle('huellero:cancelarCaptura', () => engine.cancelarCapturaEnCurso())

engine.setOnEstadoChange(broadcastStatus)
engine.setOnEnrolarProgreso((progreso) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('huellero:enrolar-progreso', progreso)
  }
})

app.whenReady().then(async () => {
  createWindow()
  broadcastStatus()
  await engine.init()
  iniciarScheduler()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

export { broadcastStatus }
