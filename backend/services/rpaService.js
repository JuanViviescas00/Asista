import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RPA_SCRIPT_PATH = path.resolve(__dirname, '../../rpa/bot_inasistencias_sofia.js')

// Estado en memoria de la ejecución del robot RPA
const estadoRPA = {
  enEjecucion: false,
  procesoPid: null,
  iniciadoEn: null,
  finalizadoEn: null,
  codigoSalida: null,
  ultimoError: null,
  ultimosLogs: []
}

function agregarLog(tipo, linea) {
  const ts = new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' })
  const logFormateado = `[${ts}] [${tipo}] ${linea.trim()}`
  estadoRPA.ultimosLogs.push(logFormateado)
  if (estadoRPA.ultimosLogs.length > 200) {
    estadoRPA.ultimosLogs.shift()
  }
}

/**
 * Retorna el estado actual de la ejecución del robot RPA
 */
export function obtenerEstadoRPA() {
  return {
    enEjecucion: estadoRPA.enEjecucion,
    procesoPid: estadoRPA.procesoPid,
    iniciadoEn: estadoRPA.iniciadoEn,
    finalizadoEn: estadoRPA.finalizadoEn,
    codigoSalida: estadoRPA.codigoSalida,
    ultimoError: estadoRPA.ultimoError,
    ultimosLogs: estadoRPA.ultimosLogs.slice(-40)
  }
}

/**
 * Ejecuta de forma autónoma el robot RPA de inasistencias en Sofia Plus
 * @param {Object} opciones
 * @param {boolean} [opciones.batch=true] - Procesar todos los docentes con fallas pendientes
 * @param {string} [opciones.doc] - Documento de un docente específico
 * @param {string} [opciones.fecha] - Fecha de inasistencias (YYYY-MM-DD)
 * @param {string} [opciones.ficha] - Código de ficha específico
 * @param {boolean} [opciones.headless=true] - Ejecución sin ventana gráfica
 * @param {boolean} [opciones.dryRun] - Modo seguro (no hace clic en Registrar)
 * @param {number} [opciones.limite] - Límite de inasistencias por docente
 */
export function ejecutarRPAInasistencias(opciones = {}) {
  return new Promise((resolve) => {
    if (estadoRPA.enEjecucion) {
      return resolve({
        ok: false,
        error: 'Ya existe una ejecución del Robot RPA en curso.',
        estado: obtenerEstadoRPA()
      })
    }

    if (!fs.existsSync(RPA_SCRIPT_PATH)) {
      const err = `No se encontró el script del robot RPA en: ${RPA_SCRIPT_PATH}`
      console.error(`[RPA Service] ❌ ${err}`)
      return resolve({ ok: false, error: err })
    }

    const args = [RPA_SCRIPT_PATH]

    // Ámbito: batch (todos los docentes) o documento específico
    if (opciones.doc) {
      args.push('--doc', String(opciones.doc).trim())
    } else {
      args.push('--batch')
    }

    // Modo desatendido obligatorio para cron / backend
    args.push('--auto')

    // Modo headless (gráfico o silencioso)
    const headless = opciones.headless !== undefined
      ? opciones.headless
      : (process.env.HEADLESS !== 'false' && process.env.RPA_HEADLESS !== 'false')
    if (headless) {
      args.push('--headless')
    } else {
      args.push('--no-headless')
    }

    // Modo real vs Dry-Run
    // Por defecto en cron/producción: si RPA_DRY_RUN es false o no está en dryRun, confirma en Sofia
    const dryRun = opciones.dryRun !== undefined
      ? opciones.dryRun
      : (process.env.RPA_DRY_RUN === 'true')
    if (dryRun) {
      args.push('--dry-run')
    } else {
      args.push('--confirmar-registro')
    }

    if (opciones.fecha) args.push('--fecha', String(opciones.fecha).trim())
    if (opciones.ficha) args.push('--ficha', String(opciones.ficha).trim())
    if (opciones.limite) args.push('--limite', String(opciones.limite))

    const apiPort = process.env.PORT || 3000
    const envChild = {
      ...process.env,
      API_BASE_URL: process.env.API_BASE_URL || `http://localhost:${apiPort}`
    }

    estadoRPA.enEjecucion = true
    estadoRPA.iniciadoEn = new Date()
    estadoRPA.finalizadoEn = null
    estadoRPA.codigoSalida = null
    estadoRPA.ultimoError = null
    estadoRPA.ultimosLogs = []

    console.log(`[RPA Service] 🤖 Iniciando Robot RPA: node ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`)
    agregarLog('INFO', `Iniciando Robot RPA (${dryRun ? 'Modo Seguro/Dry-Run' : 'Modo Real/Confirmar'})`)

    const child = spawn(process.execPath, args, {
      env: envChild,
      cwd: path.dirname(RPA_SCRIPT_PATH),
      shell: false
    })

    estadoRPA.procesoPid = child.pid

    child.stdout.on('data', (chunk) => {
      const texto = chunk.toString('utf8')
      texto.split(/\r?\n/).forEach((linea) => {
        if (linea.trim()) {
          console.log(`[RPA] ${linea}`)
          agregarLog('STDOUT', linea)
        }
      })
    })

    child.stderr.on('data', (chunk) => {
      const texto = chunk.toString('utf8')
      texto.split(/\r?\n/).forEach((linea) => {
        if (linea.trim()) {
          console.error(`[RPA ERROR] ${linea}`)
          agregarLog('STDERR', linea)
        }
      })
    })

    child.on('error', (err) => {
      console.error('[RPA Service] ❌ Error al invocar el proceso del Robot RPA:', err.message)
      estadoRPA.enEjecucion = false
      estadoRPA.finalizadoEn = new Date()
      estadoRPA.ultimoError = err.message
      agregarLog('ERROR', err.message)
      resolve({
        ok: false,
        error: `Fallo al lanzar el proceso del Robot RPA: ${err.message}`,
        logs: estadoRPA.ultimosLogs
      })
    })

    child.on('close', (code) => {
      estadoRPA.enEjecucion = false
      estadoRPA.finalizadoEn = new Date()
      estadoRPA.codigoSalida = code
      estadoRPA.procesoPid = null

      if (code === 0) {
        console.log('[RPA Service] ✓ Robot RPA finalizó exitosamente (código 0).')
        agregarLog('INFO', 'Robot RPA finalizado con éxito (código 0)')
        resolve({
          ok: true,
          mensaje: 'Robot RPA ejecutado exitosamente.',
          codigo: code,
          logs: estadoRPA.ultimosLogs
        })
      } else {
        const errorMsg = `Robot RPA finalizó con código de error ${code}.`
        console.warn(`[RPA Service] ⚠️ ${errorMsg}`)
        estadoRPA.ultimoError = errorMsg
        agregarLog('WARN', errorMsg)
        resolve({
          ok: false,
          error: errorMsg,
          codigo: code,
          logs: estadoRPA.ultimosLogs
        })
      }
    })
  })
}
