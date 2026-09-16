import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import os from 'os'
import { obtenerHardwareFingerprint } from './hardware-fingerprint.js'

const CONFIG_PATH = resolve(process.cwd(), 'config.json')

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

  if (existsSync(CONFIG_PATH)) {
    try {
      cache = { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) }
    } catch {
      cache = { ...DEFAULTS }
    }
  } else {
    cache = { ...DEFAULTS }
  }

  return cache
}

export function saveConfig(patch) {
  cache = { ...getConfig(), ...patch }
  writeFileSync(CONFIG_PATH, JSON.stringify(cache, null, 2), 'utf8')
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
