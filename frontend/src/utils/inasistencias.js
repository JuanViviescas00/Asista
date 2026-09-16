// ============================================================
// Utilidades de análisis de inasistencias graves.
//
// Permite detectar aprendices con:
//   - 3 o más días CONSECUTIVOS fallados (racha máxima)
//   - 5 o más días NO consecutivos fallados (total acumulado)
// ============================================================

export const LIMITE_DIAS_CONSECUTIVOS = 3
export const LIMITE_DIAS_NO_CONSECUTIVOS = 5

function esDiaFinDeSemana(date) {
  const d = date.getDay()
  return d === 0 || d === 6
}

/**
 * ¿Dos fechas de falta son "consecutivas" (en días de clase)?
 * Se consideran consecutivas si son días calendario adyacentes o si
 * entre ellas solo hay fin de semana (sábado/domingo), porque no hay
 * clase esos días y la racha de ausencia no se interrumpe.
 */
export function esDiasConsecutivos(d1, d2) {
  if (!d1 || !d2) return false
  const a = new Date(`${d1}T00:00:00`)
  const b = new Date(`${d2}T00:00:00`)
  if (b <= a) return false
  const diff = Math.round((b - a) / 86400000)
  if (diff === 1) return true
  // Puente de fin de semana: todos los días intermedios son sábado o domingo.
  for (let i = 1; i < diff; i++) {
    const dia = new Date(a.getTime() + i * 86400000)
    if (!esDiaFinDeSemana(dia)) return false
  }
  return diff <= 3
}

/**
 * Retorna la racha máxima de días consecutivos fallados.
 * @param {string[]} fechas lista de fechas "YYYY-MM-DD" de faltas
 * @returns {number}
 */
export function rachaMaximaConsecutiva(fechas) {
  if (!Array.isArray(fechas) || fechas.length === 0) return 0
  const sorted = [...fechas].sort()
  let max = 1
  let actual = 1
  for (let i = 1; i < sorted.length; i++) {
    if (esDiasConsecutivos(sorted[i - 1], sorted[i])) {
      actual++
    } else {
      actual = 1
    }
    if (actual > max) max = actual
  }
  return max
}

/**
 * Analiza los aprendices y calcula sus inasistencias graves.
 *
 * @param {Array} estudiantes lista de aprendices
 * @param {Array} asistencias lista de asistencias (estudianteId puede venir poblado)
 * @returns {Array} lista ordenada por gravedad con:
 *   { estudiante, totalFallas, rachaMaxima, porcentaje, fechasFallas,
 *     consecutivoGrave, noConsecutivoGrave }
 */
export function analizarInasistenciasGraves(estudiantes, asistencias) {
  const lista = (estudiantes || []).map((est) => {
    const registros = (asistencias || []).filter(
      (a) => String(a.estudianteId?._id || a.estudianteId) === String(est._id)
    )
    const fallas = registros.filter((a) => a.estado === 'Falta' || a.estado === 'Ausente')
    const fechasFallas = fallas.map((a) => a.fecha).sort()
    const totalFallas = fechasFallas.length
    const rachaMaxima = rachaMaximaConsecutiva(fechasFallas)

    const presentes = registros.filter((a) => a.estado === 'Presente').length
    const excusadas = registros.filter((a) => a.estado === 'Excusada').length
    const total = registros.length
    const porcentaje = total > 0 ? Math.round(((presentes + excusadas) / total) * 100) : 0

    return {
      estudiante: est,
      totalFallas,
      rachaMaxima,
      porcentaje,
      fechasFallas,
      consecutivoGrave: rachaMaxima >= LIMITE_DIAS_CONSECUTIVOS,
      noConsecutivoGrave: totalFallas >= LIMITE_DIAS_NO_CONSECUTIVOS,
    }
  })

  // Ordena por gravedad: primero rachas consecutivas (más grave), luego
  // mayor número de faltas totales.
  return lista.sort((a, b) => {
    if (a.consecutivoGrave !== b.consecutivoGrave) return a.consecutivoGrave ? -1 : 1
    if (a.rachaMaxima !== b.rachaMaxima) return b.rachaMaxima - a.rachaMaxima
    return b.totalFallas - a.totalFallas
  })
}
