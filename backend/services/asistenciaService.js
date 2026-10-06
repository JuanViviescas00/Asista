import mongoose from 'mongoose'
import Ficha from '../models/Ficha.js'
import Asistencia from '../models/Asistencia.js'
import Estudiante from '../models/Estudiante.js'

/**
 * Retorna la fecha actual en zona horaria de Colombia (America/Bogota) en formato YYYY-MM-DD
 */
export function getHoyString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
}

/**
 * Formatea una fecha u objeto Date en formato YYYY-MM-DD según la zona horaria de Colombia
 */
export function formatearFechaColombia(date = new Date()) {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d)
}

/**
 * Formatea la hora en HH:mm:ss según la zona horaria de Colombia
 */
export function formatearHoraColombia(date = new Date()) {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return d.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false })
}

/**
 * Obtiene lista de ObjectIds compatibles buscando por _id o por codigoFicha
 */
export async function getFichaIdList(fichaId) {
  if (!fichaId) return []
  const ids = []
  if (mongoose.Types.ObjectId.isValid(fichaId)) {
    ids.push(new mongoose.Types.ObjectId(fichaId))
  }
  try {
    const queryFicha = []
    if (mongoose.Types.ObjectId.isValid(fichaId)) {
      queryFicha.push({ _id: fichaId })
    }
    queryFicha.push({ codigoFicha: String(fichaId).trim() })
    const fichaDoc = await Ficha.findOne({ $or: queryFicha })
    if (fichaDoc) {
      const docId = fichaDoc._id
      if (!ids.some(id => String(id) === String(docId))) {
        ids.push(docId)
      }
    }
  } catch (e) {}
  return ids
}

// Umbrales de tardanza medidos en MINUTOS desde la hora de inicio de la clase.
// Regla del negocio:
//   0 a 10 min  -> Presente (tolerancia oficial de 10 min tras inicio de clase)
//   10 a 70 min -> Tardanza de 1 hora
//   70 a 130 min -> Tardanza de 2 horas
//   más de 130 min (2h tarde) -> Falta (asistencia fallida)
export const TOLERANCIA_MINUTOS = 10
export const LIMITE_TARDANZA_1_HORA = 70
export const LIMITE_TARDANZA_2_HORAS = 130

/**
 * Calcula el estado de una marcación (Presente / Tardanza / Falta) según los
 * minutos transcurridos desde la hora de inicio de la clase (`inicioClase`).
 *
 * Devuelve un objeto con:
 *   - estado: 'Presente' | 'Tardanza' | 'Falta'
 *   - horasTardanza: número de horas de retraso (0 si no aplica)
 *   - tiempoTardanza: texto legible del retraso ('0 horas', '1 hora', '2 horas')
 */
export function calcularEstadoAsistencia(inicioClase, fechaHora = new Date()) {
  const inicioMs = inicioClase ? new Date(inicioClase).getTime() : Date.now()
  const marcacionMs = fechaHora ? new Date(fechaHora).getTime() : Date.now()

  const minutos = Math.floor((marcacionMs - inicioMs) / 60000)

  if (minutos < 0 || minutos <= TOLERANCIA_MINUTOS) {
    return { estado: 'Presente', horasTardanza: 0, tiempoTardanza: '0 horas' }
  }
  if (minutos <= LIMITE_TARDANZA_1_HORA) {
    return { estado: 'Tardanza', horasTardanza: 1, tiempoTardanza: '1 hora' }
  }
  if (minutos <= LIMITE_TARDANZA_2_HORAS) {
    return { estado: 'Tardanza', horasTardanza: 2, tiempoTardanza: '2 horas' }
  }
  return { estado: 'Falta', horasTardanza: 0, tiempoTardanza: '0 horas' }
}

/**
 * Horarios de inicio de jornada fijos (minutos desde medianoche) — fallback si no hay clase activa.
 * Mañana: 06:30 (390 min) · Tarde: 12:30 (750 min) · Noche: 18:30 (1110 min)
 */
export const HORARIOS_JORNADA = {
  'Mañana': 390,
  'Tarde': 750,
  'Noche': 1110,
}

// Escala escalonada de penalización por tardanza (helper compartido del fallback).
// Usa los MISMOS umbrales que calcularEstadoAsistencia (5 / 65 / 125) para no
// generar resultados distintos según la fuente del inicio.
function escalaDesdeMinutos(minutosTardanza, jornada = '') {
  if (minutosTardanza <= TOLERANCIA_MINUTOS) {
    return { estado: 'Presente', horas: 0 }
  }
  if (minutosTardanza <= LIMITE_TARDANZA_1_HORA) {
    return { estado: 'Tardanza', horas: 1 }
  }
  if (minutosTardanza <= LIMITE_TARDANZA_2_HORAS) {
    return { estado: 'Tardanza', horas: 2 }
  }
  const j = String(jornada || '').toLowerCase()
  const horasFalta = (j.includes('noche') || j.includes('nocturn')) ? 5 : 6
  return { estado: 'Falta', horas: horasFalta }
}

/**
 * Escala escalonada contra el horario FIJO de jornada (HORARIOS_JORNADA).
 * Se usa SOLO como fallback cuando no hay una Clase localizable para la marcación
 * (ficha sin clase nunca activada). Devuelve { estado, horas, minutosTardanza }.
 */
export function calcularTardanzaEscalonada(jornada, fechaHora = new Date()) {
  const inicio = HORARIOS_JORNADA[jornada] ?? HORARIOS_JORNADA['Mañana']
  const d = typeof fechaHora === 'string' || typeof fechaHora === 'number' ? new Date(fechaHora) : fechaHora
  const partes = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d)
  const horas = parseInt(partes.find((p) => p.type === 'hour')?.value || '0', 10)
  const minutos = parseInt(partes.find((p) => p.type === 'minute')?.value || '0', 10)
  const minutosMarcacion = horas * 60 + minutos
  let minutosTardanza = minutosMarcacion - inicio
  // Solo jornada Noche: un negativo es casi seguro un cruce de medianoche
  // (marcación de madrugada tras un inicio a las 18:00), no una llegada
  // anticipada real. Se "envuelve" sumando 24h antes de evaluar la escala.
  if (jornada === 'Noche' && minutosTardanza < 0) {
    minutosTardanza += 1440
  }
  return { ...escalaDesdeMinutos(minutosTardanza, jornada), minutosTardanza }
}

/**
 * Calcula el resumen acumulado de asistencia de un estudiante a partir de sus
 * registros de asistencia (en cualquier orden). Lógica pura, reutilizable por el
 * endpoint individual y el batch de ficha.
 *
 * - horasTardanzaAcumuladas: suma de horas de tardanza (solo registros Tardanza).
 * - diasFallaPorHoras: floor(horasTardanzaAcumuladas / 6) — conversión del banco.
 * - horasPendientes: horasTardanzaAcumuladas % 6.
 * - diasFallaLiteral: conteo de registros con estado 'Falta'.
 * - diasFallaTotales: diasFallaLiteral + diasFallaPorHoras.
 * - rachaConsecutivaActual: faltas 'Falta' adyacentes al final de la lista ordenada
 *   por fecha (clases consecutivas; los días sin registro no rompen la racha).
 * - critico: rachaConsecutivaActual >= 3 || diasFallaTotales >= 5.
 */
export function calcularResumenDesdeAsistencias(asistencias = [], jornada = '') {
  const ordenadas = [...asistencias].sort((a, b) => {
    if (a.fecha < b.fecha) return -1
    if (a.fecha > b.fecha) return 1
    return 0
  })

  let horasTardanzaAcumuladas = 0
  let diasFallaLiteral = 0
  for (const a of ordenadas) {
    if (a.estado === 'Tardanza') {
      horasTardanzaAcumuladas += Number(a.horasTardanza) || 0
    } else if (a.estado === 'Falta') {
      diasFallaLiteral++
    }
  }

  const jNorm = String(jornada || '').toLowerCase()
  const esNoche = jNorm.includes('noche') || jNorm.includes('nocturn')
  const divisorHoras = esNoche ? 5 : 6

  const diasFallaPorHoras = Math.floor(horasTardanzaAcumuladas / divisorHoras)
  const horasPendientes = horasTardanzaAcumuladas % divisorHoras
  const diasFallaTotales = diasFallaLiteral + diasFallaPorHoras

  let rachaConsecutivaActual = 0
  for (let i = ordenadas.length - 1; i >= 0; i--) {
    if (ordenadas[i].estado === 'Falta') rachaConsecutivaActual++
    else break
  }

  const critico = rachaConsecutivaActual >= 3 || diasFallaTotales >= 5

  return {
    horasTardanzaAcumuladas,
    diasFallaPorHoras,
    horasPendientes,
    diasFallaLiteral,
    diasFallaTotales,
    rachaConsecutivaActual,
    critico,
  }
}

/**
 * Resumen acumulado de un estudiante (consulta sus asistencias y delega en el
 * cálculo puro, respetando las horas por jornada).
 */
export async function calcularResumenAsistencia(estudianteId) {
  const [asistencias, estudiante] = await Promise.all([
    Asistencia.find({ estudianteId }).sort({ fecha: 1 }),
    Estudiante.findById(estudianteId).populate('fichaId', 'jornada')
  ])
  const jornada = estudiante?.fichaId?.jornada || ''
  return calcularResumenDesdeAsistencias(asistencias, jornada)
}
