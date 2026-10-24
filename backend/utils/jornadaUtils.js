/**
 * Utilidades puras relacionadas con la jornada académica y las horas de
 * inasistencia. Deben coincidir exactamente con las reglas ya usadas en el
 * backend (asistenciaService.js: escalaDesdeMinutos y calcularResumenDesdeAsistencias).
 */

/**
 * Tope de horas de clase por jornada.
 * - Noche / Nocturna: 5 horas.
 * - Cualquier otra (Mañana, Tarde, Mixta, vacío): 6 horas.
 * @param {string} jornada
 * @returns {number} 5 o 6
 */
export function topeHorasPorJornada(jornada) {
  const j = String(jornada || '').toLowerCase()
  return (j.includes('noche') || j.includes('nocturn')) ? 5 : 6
}

/**
 * Valida que las horas de inasistencia sean un entero >= 0 y no superen el
 * tope de la jornada. Acepta números y strings numéricos enteros; rechaza
 * decimales, negativos, NaN y valores mayores al tope.
 * @param {number|string} horas
 * @param {string} jornada
 * @returns {{ok: true, horas: number} | {ok: false, error: string}}
 */
export function validarHorasInasistencia(horas, jornada) {
  const tope = topeHorasPorJornada(jornada)

  if (horas === null || horas === undefined) {
    return { ok: false, error: 'Las horas de inasistencia son obligatorias.' }
  }
  if (typeof horas === 'string' && horas.trim() === '') {
    return { ok: false, error: 'Las horas de inasistencia son obligatorias.' }
  }

  const n = Number(horas)
  if (Number.isNaN(n)) {
    return { ok: false, error: 'Las horas de inasistencia deben ser un número entero.' }
  }
  if (!Number.isInteger(n)) {
    return { ok: false, error: 'Las horas de inasistencia deben ser un número entero (sin decimales).' }
  }
  if (n < 0) {
    return { ok: false, error: 'Las horas de inasistencia no pueden ser negativas.' }
  }
  if (n > tope) {
    return { ok: false, error: `Las horas de inasistencia no pueden superar el tope de la jornada (${tope} horas).` }
  }

  return { ok: true, horas: n }
}
