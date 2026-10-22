import { calcularDiasHabilesTranscurridos, DIAS_HABILES_VENTANA_EXCUSA } from './diasHabiles.js'
import { topeHorasPorJornada } from './jornadaUtils.js'

/**
 * Evalúa el riesgo de deserción de un aprendiz a partir de sus jornadas e
 * inasistencias. Función PURA: no accede a la base de datos.
 *
 * Reglas (Acuerdo 009/2024, Art. 28-31):
 * - Solo cuentan días de falta INJUSTIFICADA: tipo 'Falta' con la ventana de
 *   excusa (DIAS_HABILES_VENTANA_EXCUSA) ya vencida, más los días equivalentes
 *   por horas de tardanza (floor(horasTotalesTardanza / topeHorasPorJornada)).
 *   'Excusada' NO cuenta.
 * - Una 'Falta' aún dentro de la ventana es "pendiente": no cuenta.
 * - Deserción: 3 jornadas continuas con falta injustificada (máximo histórico),
 *   o 5 acumuladas en toda la ficha (no por mes).
 * - Riesgo: 2 continuas ACTUALES, o 4 acumuladas.
 * - "Continuas" se evalúa sobre las fechas de jornadas e inasistencias (unión),
 *   ordenadas. Un día asistido, con tardanza menor al tope, o excusado CORTA la
 *   cadena. Los días sin jornada (festivo, sin clase, o jornada inhabilitada)
 *   no cuentan ni cortan.
 *
 * @param {object} params
 * @param {Array<{fecha:string, inhabilitada?:boolean}>} params.jornadas días con lista (Jornada)
 * @param {Array<{fecha:string, tipo:string, horas:number}>} params.inasistencias
 * @param {Set<string>} params.festivosSet fechas 'YYYY-MM-DD' de festivos
 * @param {string} params.jornadaFicha 'Mañana' | 'Tarde' | 'Noche' | 'Mixta'
 * @param {string} params.hoyStr fecha 'YYYY-MM-DD' de referencia
 * @returns {{ nivel: 'ninguno'|'riesgo'|'desercion', continuas: number, continuasActuales: number, acumuladas: number, detalle: string }}
 */
export function evaluarRiesgoDesercion({ jornadas = [], inasistencias = [], festivosSet = new Set(), jornadaFicha = '', hoyStr }) {
  const tope = topeHorasPorJornada(jornadaFicha)

  const jornadaPorFecha = new Map()
  for (const j of jornadas) {
    if (j && j.fecha) jornadaPorFecha.set(j.fecha, j)
  }

  // Unión de fechas de jornadas e inasistencias, ordenada.
  const fechas = Array.from(new Set([
    ...jornadas.map((j) => j.fecha).filter(Boolean),
    ...inasistencias.map((i) => i.fecha).filter(Boolean),
  ])).sort()

  let continuas = 0
  let maxContinuas = 0
  let diasFaltaInjustificada = 0
  let horasTardanzaTotales = 0

  for (const fecha of fechas) {
    const jornada = jornadaPorFecha.get(fecha)
    if (jornada && jornada.inhabilitada === true) {
      // Jornada inhabilitada: no cuenta y no corta.
      continue
    }

    const inas = inasistencias.filter((i) => i.fecha === fecha)
    const falta = inas.find((i) => i.tipo === 'Falta')
    const excusada = inas.some((i) => i.tipo === 'Excusada')
    const tardanza = inas.find((i) => i.tipo === 'Tardanza')
    const hayJornada = !!jornada

    if (falta) {
      const diasHabiles = calcularDiasHabilesTranscurridos(fecha, festivosSet, hoyStr, jornadaFicha)
      if (diasHabiles >= DIAS_HABILES_VENTANA_EXCUSA + 1) {
        // Falta injustificada: cuenta para acumuladas; para continuas solo si
        // existe una jornada habilitada ese día.
        diasFaltaInjustificada++
        if (hayJornada) {
          continuas++
          if (continuas > maxContinuas) maxContinuas = continuas
        }
      }
      // Falta dentro de la ventana: pendiente, no cuenta y no corta.
      continue
    }

    if (tardanza) {
      horasTardanzaTotales += Number(tardanza.horas) || 0
      if (hayJornada) continuas = 0
      continue
    }

    if (excusada) {
      if (hayJornada) continuas = 0
      continue
    }

    if (hayJornada) continuas = 0 // día asistido
  }

  const continuasActuales = continuas
  const diasTardanzaEquivalentes = Math.floor(horasTardanzaTotales / tope)
  const acumuladas = diasFaltaInjustificada + diasTardanzaEquivalentes

  let nivel = 'ninguno'
  let detalle = 'Sin riesgo de deserción.'
  if (maxContinuas >= 3 || acumuladas >= 5) {
    nivel = 'desercion'
    detalle = maxContinuas >= 3
      ? `Deserción: ${maxContinuas} jornadas continuas con falta injustificada.`
      : `Deserción: ${acumuladas} inasistencias injustificadas acumuladas.`
  } else if (continuasActuales >= 2 || acumuladas >= 4) {
    nivel = 'riesgo'
    detalle = continuasActuales >= 2
      ? `Riesgo: ${continuasActuales} jornadas continuas con falta injustificada.`
      : `Riesgo: ${acumuladas} inasistencias injustificadas acumuladas.`
  }

  return { nivel, continuas: maxContinuas, continuasActuales, acumuladas, detalle }
}
