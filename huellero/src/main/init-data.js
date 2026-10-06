import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs'

// Copia recursiva de una carpeta sin sobrescribir archivos ya existentes.
function copiarRecursivo(src, dest) {
  if (!existsSync(src)) return
  mkdirSync(dest, { recursive: true })
  for (const nombre of readdirSync(src)) {
    const origen = join(src, nombre)
    const destino = join(dest, nombre)
    if (statSync(origen).isDirectory()) {
      copiarRecursivo(origen, destino)
    } else if (!existsSync(destino)) {
      copyFileSync(origen, destino)
    }
  }
}

// Fija la carpeta de datos a %APPDATA%\huellero (independiente del productName)
// y, una sola vez, migra los datos desde la carpeta antigua derivada del
// productName "Huellero SENA" si aún existen ahí. Se ejecuta al importar este
// módulo, ANTES de que store.js/config.js lean userData (ver index.js).
export function fijarCarpetaDeDatos() {
  const appData = app.getPath('appData')
  const carpetaFija = join(appData, 'huellero')
  app.setPath('userData', carpetaFija)

  const carpetaAntigua = join(appData, 'Huellero SENA')
  const configFijo = join(carpetaFija, 'config.json')
  const configAntiguo = join(carpetaAntigua, 'config.json')

  if (!existsSync(configFijo) && existsSync(configAntiguo)) {
    try {
      mkdirSync(carpetaFija, { recursive: true })
      copyFileSync(configAntiguo, configFijo)
      console.log('[migracion] config.json copiado a la carpeta fija de datos.')
      copiarRecursivo(join(carpetaAntigua, 'data'), join(carpetaFija, 'data'))
      console.log('[migracion] carpeta data/ migrada (sin sobrescribir existentes).')
    } catch (err) {
      console.log('[migracion] no se pudo migrar la carpeta de datos:', err.message)
    }
  }
}

fijarCarpetaDeDatos()
