import mongoose from 'mongoose'
import Ficha from '../models/Ficha.js'
import Asistencia from '../models/Asistencia.js'
import Estudiante from '../models/Estudiante.js'
import Clase from '../models/Clase.js'
import Inasistencia from '../models/Inasistencia.js'
import Jornada from '../models/Jornada.js'
import DiaFestivo from '../models/DiaFestivo.js'
import { calcularEstadoCarga } from '../utils/inasistenciaEstado.js'
import { topeHorasPorJornada } from '../utils/jornadaUtils.js'
import { asegurarJornada } from './jornadaService.js'

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

/**
 * Auto-cierre de inasistencias sobre los modelos NUEVOS (Inasistencia + Jornada):
 * para una ficha y fecha dada, identifica a los aprendices activos que no están en
 * Jornada.presentes ni tienen ninguna Inasistencia (Falta/Tardanza/Excusada) ese día,
 * y les crea una Falta (origen 'huellero'). Idempotente.
 */
export async function cerrarInasistenciasFicha(fichaId, fecha = getHoyString(), instructorId = null, claseId = null) {
  try {
    if (!fichaId || !fecha) return { creados: 0 }

    const fichaIds = await getFichaIdList(fichaId)
    if (!fichaIds.length) return { creados: 0 }

    const fichaDoc = await Ficha.findOne({ _id: { $in: fichaIds } })
    const instId = instructorId || fichaDoc?.instructorLiderId || null
    const fichaTarget = fichaDoc?._id || fichaIds[0]

    // Jornada inhabilitada: no se crea ninguna falta.
    const jornada = await Jornada.findOne({ fichaId: { $in: fichaIds }, fecha })
    if (jornada?.inhabilitada) {
      return { creados: 0, omitida: 'inhabilitada' }
    }

    const estudiantes = await Estudiante.find({
      fichaId: { $in: fichaIds },
      estado: 'Activo'
    }).select('_id')

    if (!estudiantes.length) return { creados: 0 }

    // Excluir a quienes ya están en presentes o tienen cualquier Inasistencia ese día.
    const inasistencias = await Inasistencia.find({ fichaId: { $in: fichaIds }, fecha }).select('estudianteId')

    const excluidos = new Set((jornada?.presentes || []).map((p) => String(p.estudianteId)))
    for (const ina of inasistencias) excluidos.add(String(ina.estudianteId))

    const tope = topeHorasPorJornada(fichaDoc?.jornada || '')
    const festivosDocs = await DiaFestivo.find().select('fecha').catch(() => [])
    const festivosSet = new Set((festivosDocs || []).map((d) => d.fecha))
    const estadoCarga = calcularEstadoCarga({ fecha, tipo: 'Falta', jornada: fichaDoc?.jornada || '', festivosSet, hoyStr: getHoyString() })

    const operaciones = []
    for (const est of estudiantes) {
      if (excluidos.has(String(est._id))) continue
      operaciones.push({
        updateOne: {
          filter: { estudianteId: est._id, fichaId: fichaTarget, fecha },
          update: {
            $setOnInsert: {
              estudianteId: est._id,
              fichaId: fichaTarget,
              fecha,
              tipo: 'Falta',
              horas: tope,
              hora: '—',
              tiempoTardanza: '0 horas',
              instructorId: instId,
              claseId: claseId || null,
              origen: 'huellero',
              estadoCarga,
            },
          },
          upsert: true,
        },
      })
    }

    let creados = 0
    if (operaciones.length > 0) {
      try {
        const res = await Inasistencia.bulkWrite(operaciones, { ordered: false })
        creados = res.upsertedCount || 0
      } catch (err) {
        const soloDuplicados =
          err?.code === 11000 ||
          (Array.isArray(err?.writeErrors) && err.writeErrors.length > 0 && err.writeErrors.every((w) => w?.code === 11000))
        if (soloDuplicados) {
          creados = err.result?.upsertedCount ?? err.result?.nUpserted ?? 0
        } else {
          throw err
        }
      }
    }

    try {
      await asegurarJornada({ fichaId: fichaTarget, fecha, instructorId: instId, origen: 'huellero', claseId: claseId || null })
    } catch (jornadaErr) {
      console.error('[cerrarInasistenciasFicha] Error asegurando jornada:', jornadaErr.message)
    }

    // Carrera: si un aprendiz que recibió Falta por ESTE cierre ya está en presentes,
    // se borra esa Falta (marcación que llegó durante el cierre).
    try {
      const jornadaAfter = await Jornada.findOne({ fichaId: { $in: fichaIds }, fecha })
      const presentesIds = [...new Set((jornadaAfter?.presentes || []).map((p) => String(p.estudianteId)))]
      if (presentesIds.length > 0) {
        await Inasistencia.deleteMany({
          fichaId: { $in: fichaIds },
          fecha,
          tipo: 'Falta',
          origen: 'huellero',
          claseId: claseId || null,
          estadoCarga: { $ne: 'SUBIDA' },
          estudianteId: { $in: presentesIds.map((id) => new mongoose.Types.ObjectId(id)) },
        })
      }
    } catch (raceErr) {
      console.error('[cerrarInasistenciasFicha] Error en la reconciliación de carrera:', raceErr.message)
    }

    return { creados }
  } catch (err) {
    console.error('[cerrarInasistenciasFicha] Error:', err.message)
    return { creados: 0, error: err.message }
  }
}

/**
 * Finaliza atómicamente una clase Activa y completa las inasistencias de los
 * ausentes. Los emits quedan en quien llama. Si la clase ya no estaba Activa,
 * devuelve { yaFinalizada: true } y no hace nada más.
 */
export async function finalizarClase(claseId, { motivo } = {}) {
  const clase = await Clase.findOneAndUpdate(
    { _id: claseId, estado: 'Activa' },
    { $set: { estado: 'Finalizada', finalizadaAt: new Date() } },
    { new: true }
  )

  if (!clase) {
    return { yaFinalizada: true }
  }

  let creados = 0
  try {
    const res = await cerrarInasistenciasFicha(
      clase.fichaId,
      formatearFechaColombia(clase.iniciadaAt),
      clase.instructorId,
      clase._id
    )
    creados = res?.creados || 0
  } catch (err) {
    console.error('[finalizarClase] Error en auto-cierre de inasistencias:', err.message)
  }

  return { clase, creados, yaFinalizada: false }
}

