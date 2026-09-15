import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const DATA_DIR = resolve(process.cwd(), 'data')

const PLANTILLAS_PATH = resolve(DATA_DIR, 'plantillas.json')
const PENDIENTES_PATH = resolve(DATA_DIR, 'pendientes.json')
const ESTADO_PATH = resolve(DATA_DIR, 'estado.json')

let estado = { claseActiva: null }
let plantillas = {}
let pendientes = []

function asegurarDirectorio() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

function leerJSON(ruta, porDefecto) {
  if (!existsSync(ruta)) return porDefecto
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'))
  } catch {
    return porDefecto
  }
}

function escribirJSON(ruta, valor) {
  writeFileSync(ruta, JSON.stringify(valor, null, 2), 'utf8')
}

function persistirEstado() {
  escribirJSON(ESTADO_PATH, estado)
}

function persistirPendientes() {
  escribirJSON(PENDIENTES_PATH, pendientes)
}

function persistirPlantillas() {
  escribirJSON(PLANTILLAS_PATH, plantillas)
}

export async function init() {
  asegurarDirectorio()

  if (!existsSync(ESTADO_PATH)) {
    escribirJSON(ESTADO_PATH, { claseActiva: null })
  }
  if (!existsSync(PLANTILLAS_PATH)) {
    escribirJSON(PLANTILLAS_PATH, {})
  }
  if (!existsSync(PENDIENTES_PATH)) {
    escribirJSON(PENDIENTES_PATH, [])
  }

  estado = leerJSON(ESTADO_PATH, { claseActiva: null }) || { claseActiva: null }
  plantillas = leerJSON(PLANTILLAS_PATH, {}) || {}
  pendientes = leerJSON(PENDIENTES_PATH, [])

  if (!Array.isArray(pendientes)) pendientes = []
  if (typeof plantillas !== 'object' || plantillas === null) plantillas = {}
  if (typeof estado !== 'object' || estado === null) estado = { claseActiva: null }
}

export function getClaseActiva() {
  return estado.claseActiva || null
}

export function setClaseActiva(clase) {
  estado.claseActiva = clase || null
  persistirEstado()
}

export async function getPlantillasFicha(fichaId) {
  const clave = String(fichaId)
  const lista = plantillas[clave]
  return Array.isArray(lista) ? lista : []
}

export function guardarPlantillasFicha(fichaId, lista) {
  const clave = String(fichaId)
  plantillas[clave] = Array.isArray(lista) ? lista : []
  persistirPlantillas()
}

export function guardarPendiente(asistencia) {
  if (!asistencia) return
  pendientes.push(asistencia)
  persistirPendientes()
}

export function getPendientes() {
  return pendientes
}

export function marcarSincronizadas(uuids) {
  if (!Array.isArray(uuids) || uuids.length === 0) return
  const conjunto = new Set(uuids.map((u) => String(u)))
  pendientes = pendientes.filter((p) => !conjunto.has(String(p.uuid)))
  persistirPendientes()
}
