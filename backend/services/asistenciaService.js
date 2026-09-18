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

// Umbrales de tardanza medidos en MINUTOS desde la hora de inicio de la clase.
// Regla del negocio:
//   0 a 5 min  -> Presente (a tiempo)
//   5 a 65 min -> Tardanza de 1 hora
//   65 a 125 min -> Tardanza de 2 horas
//   más de 125 min -> Falta (asistencia fallida)
export const TOLERANCIA_MINUTOS = 5
export const LIMITE_TARDANZA_1_HORA = 65
export const LIMITE_TARDANZA_2_HORAS = 125

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
 * Horarios de inicio de jornada (minutos desde medianoche) — fuente de verdad única.
 * Mañana: 06:00 · Tarde: 12:00 · Noche: 18:00
 */
export const HORARIOS_JORNADA = {
  'Mañana': 360,
  'Tarde': 720,
  'Noche': 1080,
}

// Escala escalonada de penalización por tardanza (helper compartido del fallback).
// Usa los MISMOS umbrales que calcularEstadoAsistencia (5 / 65 / 125) para no
// generar resultados distintos según la fuente del inicio.
function escalaDesdeMinutos(minutosTardanza) {
  if (minutosTardanza <= TOLERANCIA_MINUTOS) {
    return { estado: 'Presente', horas: 0 }
  }
  if (minutosTardanza <= LIMITE_TARDANZA_1_HORA) {
    return { estado: 'Tardanza', horas: 1 }
  }
  if (minutosTardanza <= LIMITE_TARDANZA_2_HORAS) {
    return { estado: 'Tardanza', horas: 2 }
  }
  return { estado: 'Falta', horas: 6 }
}

/**
 * Escala escalonada contra el horario FIJO de jornada (HORARIOS_JORNADA).
 * Se usa SOLO como fallback cuando no hay una Clase localizable para la marcación
 * (ficha sin clase nunca activada). Devuelve { estado, horas, minutosTardanza }.
 */
export function calcularTardanzaEscalonada(jornada, fechaHora = new Date()) {
  const inicio = HORARIOS_JORNADA[jornada] ?? HORARIOS_JORNADA['Mañana']
  const minutosMarcacion = fechaHora.getHours() * 60 + fechaHora.getMinutes()
  let minutosTardanza = minutosMarcacion - inicio
  // Solo jornada Noche: un negativo es casi seguro un cruce de medianoche
  // (marcación de madrugada tras un inicio a las 18:00), no una llegada
  // anticipada real. Se "envuelve" sumando 24h antes de evaluar la escala.
  if (jornada === 'Noche' && minutosTardanza < 0) {
    minutosTardanza += 1440
  }
  return { ...escalaDesdeMinutos(minutosTardanza), minutosTardanza }
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
