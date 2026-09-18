import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import os from 'os'
import { app } from 'electron'
import { obtenerHardwareFingerprint } from './hardware-fingerprint.js'

function getStorageDir() {
  try {
    if (app) {
      const userData = app.getPath('userData')
      if (!existsSync(userData)) {
        mkdirSync(userData, { recursive: true })
      }
      return userData
    }
  } catch (_) {}
  return process.cwd()
}

function getConfigPath() {
  const localPath = resolve(process.cwd(), 'config.json')
  if (!app?.isPackaged && existsSync(localPath)) {
    return localPath
  }
  const dir = getStorageDir()
  return resolve(dir, 'config.json')
}

const DEFAULTS = {
  deviceId: null,
  token: null,
  backendUrl: process.env.HUELLERO_BACKEND_URL || 'http://127.0.0.1:3000',
  wsUrl: process.env.HUELLERO_WS_URL || 'ws://127.0.0.1:3000',
  BIOMETRIC_MATCH_THRESHOLD: 21474,
}

let cache = null

export function getConfig() {
  if (cache) return cache

  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    try {
      cache = { ...DEFAULTS, ...JSON.parse(readFileSync(configPath, 'utf8')) }
    } catch {
      cache = { ...DEFAULTS }
    }
  } else {
    // Si no existe en userData pero existe en process.cwd(), migrarlo
    const localPath = resolve(process.cwd(), 'config.json')
    if (existsSync(localPath)) {
      try {
        cache = { ...DEFAULTS, ...JSON.parse(readFileSync(localPath, 'utf8')) }
        try { writeFileSync(configPath, JSON.stringify(cache, null, 2), 'utf8') } catch (_) {}
      } catch {
        cache = { ...DEFAULTS }
      }
    } else {
      cache = { ...DEFAULTS }
    }
  }

  return cache
}

export function saveConfig(patch) {
  cache = { ...getConfig(), ...patch }
  const configPath = getConfigPath()
  writeFileSync(configPath, JSON.stringify(cache, null, 2), 'utf8')
  return cache
}

export async function registrarDispositivoSiNoExiste() {
  const config = getConfig()

  if (config.deviceId && config.token) {
    return { ok: true, yaRegistrado: true, deviceId: config.deviceId }
  }

  let res
  try {
    res = await fetch(`${config.backendUrl}/api/dispositivos/registrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hardwareFingerprint: obtenerHardwareFingerprint(), hostname: os.hostname() }),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return { ok: false, error: 'Sin conexión: no se pudo registrar el dispositivo' }
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    return { ok: false, error: data?.error || 'No se pudo registrar el dispositivo' }
  }

  const { deviceId, token } = await res.json().catch(() => ({}))
  if (!deviceId || !token) {
    return { ok: false, error: 'Respuesta inválida al registrar el dispositivo' }
  }

  saveConfig({ deviceId, token })
  return { ok: true, yaRegistrado: false, deviceId }
}

let reintentoTimer = null
let onRegistradoCb = null

export function tieneIdentidad() {
  const c = getConfig()
  return Boolean(c.deviceId && c.token)
}

export function iniciarRegistroDispositivo(onRegistrado) {
  onRegistradoCb = onRegistrado || null
  void intentarRegistro()
}

export async function reiniciarIdentidadYRegistrar() {
  saveConfig({ deviceId: null, token: null })
  const resultado = await registrarDispositivoSiNoExiste()
  if (resultado.ok && resultado.yaRegistrado === false && onRegistradoCb) {
    onRegistradoCb(resultado)
  }
  return resultado
}

async function intentarRegistro() {
  const resultado = await registrarDispositivoSiNoExiste()

  if (resultado.ok) {
    if (resultado.yaRegistrado === false && onRegistradoCb) {
      onRegistradoCb(resultado)
    }
    return
  }

  reintentoTimer = setTimeout(intentarRegistro, 60000)
}
