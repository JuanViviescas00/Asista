import mongoose from 'mongoose'
import Ficha from '../models/Ficha.js'
import Asistencia from '../models/Asistencia.js'

/**
 * Retorna la fecha actual local en formato YYYY-MM-DD
 */
export function getHoyString() {
  const ahora = new Date()
  const offsetMs = ahora.getTimezoneOffset() * 60000
  const localDate = new Date(ahora.getTime() - offsetMs)
  return localDate.toISOString().split('T')[0]
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

/**
 * Horarios de inicio de jornada (minutos desde medianoche) — fuente de verdad única.
 * Mañana: 06:00 · Tarde: 12:00 · Noche: 18:00
 */
export const HORARIOS_JORNADA = {
  'Mañana': 360,
  'Tarde': 720,
  'Noche': 1080,
}

// Tolerancia de 5 minutos antes de considerar tardanza.
const TOLERANCIA_MIN = 5

/**
 * Escala escalonada de penalización por tardanza (helper compartido).
 * Devuelve { estado, horas } a partir de los minutos de tardanza:
 *   hasta 5 min  → Presente  (0h)
 *   5 min - 1h   → Tardanza (1h)
 *   1h - 2h      → Tardanza (2h)
 *   más de 2h    → Falta    (6h = día completo)
 *
 * La "horas" de una Falta (6) representa el día completo de falla; NO se
 * persiste en `horasTardanza` (que es solo tardanza), para que el banco de
 * horas no cuente doble.
 */
function escalaDesdeMinutos(minutosTardanza) {
  if (minutosTardanza <= TOLERANCIA_MIN) {
    return { estado: 'Presente', horas: 0 }
  }
  if (minutosTardanza <= 60) {
    return { estado: 'Tardanza', horas: 1 }
  }
  if (minutosTardanza <= 120) {
    return { estado: 'Tardanza', horas: 2 }
  }
  return { estado: 'Falta', horas: 6 }
}

/**
 * Escala escalonada contra el horario FIJO de jornada (HORARIOS_JORNADA).
 * Devuelve { estado, horas, minutosTardanza }.
 */
export function calcularTardanzaEscalonada(jornada, fechaHora = new Date()) {
  const inicio = HORARIOS_JORNADA[jornada] ?? HORARIOS_JORNADA['Mañana']
  const minutosMarcacion = fechaHora.getHours() * 60 + fechaHora.getMinutes()
  const minutosTardanza = minutosMarcacion - inicio
  return { ...escalaDesdeMinutos(minutosTardanza), minutosTardanza }
}

/**
 * Escala escalonada contra la hora REAL de inicio de clase (horaInicioClase),
 * con FALLBACK al horario fijo de jornada si horaInicioClase es null/inválida
 * (payload viejo o huellero desactualizado durante un despliegue).
 * Devuelve { estado, horas, minutosTardanza }.
 */
export function calcularTardanzaDesdeInicioClase(horaInicioClase, jornada, fechaHora = new Date()) {
  const inicio = horaInicioClase ? new Date(horaInicioClase) : null
  if (inicio && !Number.isNaN(inicio.getTime())) {
    const minutosTardanza = Math.round((fechaHora.getTime() - inicio.getTime()) / 60000)
    return { ...escalaDesdeMinutos(minutosTardanza), minutosTardanza }
  }
  return calcularTardanzaEscalonada(jornada, fechaHora)
}

/**
 * Retrocompatible: devuelve solo el estado de la marcación.
 */
export function calcularEstadoAsistencia(jornada, fechaHora = new Date()) {
  return calcularTardanzaEscalonada(jornada, fechaHora).estado
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
export function calcularResumenDesdeAsistencias(asistencias = []) {
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

  const diasFallaPorHoras = Math.floor(horasTardanzaAcumuladas / 6)
  const horasPendientes = horasTardanzaAcumuladas % 6
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
 * cálculo puro).
 */
export async function calcularResumenAsistencia(estudianteId) {
  const asistencias = await Asistencia.find({ estudianteId }).sort({ fecha: 1 })
  return calcularResumenDesdeAsistencias(asistencias)
}
