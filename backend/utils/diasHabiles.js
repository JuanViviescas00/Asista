/**
 * Utilidades puras para el cómputo de días hábiles según la jornada académica.
 * Sin imports de modelos, sockets ni SQLite (Acuerdo 009/2024, Art. 28-31).
 */

/**
 * Días hábiles de ventana para radicar la excusa de una inasistencia.
 * La falta se considera "injustificada" (vencida) recién cuando ese 5.º día
 * hábil ya terminó. Como calcularDiasHabilesTranscurridos cuenta el día actual
 * (los cron corren a las 00:00), la ventana vence cuando
 * diasHabilesTranscurridos >= DIAS_HABILES_VENTANA_EXCUSA + 1.
 */
export const DIAS_HABILES_VENTANA_EXCUSA = 5

/**
 * Calcula la cantidad de días hábiles transcurridos entre fechaStr y hoyStr.
 * - Diurnas (Mañana/Tarde): Lunes a Viernes (omite Sábados y Domingos).
 * - Nocturnas (Noche/Nocturna): los SÁBADOS SÍ son hábiles (solo omite Domingos).
 * - Ambas omiten los días festivos institucionales.
 *
 * @param {string} fechaStr 'YYYY-MM-DD'
 * @param {Set<string>} festivosSet Set de 'YYYY-MM-DD'
 * @param {string} hoyStr 'YYYY-MM-DD' (obligatorio)
 * @param {string} jornada 'Mañana' | 'Tarde' | 'Noche' | 'Nocturna'
 * @returns {number} Número de días hábiles transcurridos
 */
export function calcularDiasHabilesTranscurridos(fechaStr, festivosSet = new Set(), hoyStr, jornada = '') {
  if (!fechaStr || !hoyStr || fechaStr >= hoyStr) return 0

  const [y1, m1, d1] = fechaStr.split('-').map(Number)
  const [y2, m2, d2] = hoyStr.split('-').map(Number)

  let cursor = new Date(y1, m1 - 1, d1, 12, 0, 0)
  const fechaFin = new Date(y2, m2 - 1, d2, 12, 0, 0)

  const jNorm = String(jornada || '').toLowerCase()
  const esJornadaNocturna = jNorm.includes('noche') || jNorm.includes('nocturn')

  // Avanzar un día para no contar el día de la propia clase.
  cursor.setDate(cursor.getDate() + 1)

  let diasHabiles = 0
  while (cursor <= fechaFin) {
    const diaSemana = cursor.getDay() // 0 = Domingo, 6 = Sábado
    const mes = String(cursor.getMonth() + 1).padStart(2, '0')
    const dia = String(cursor.getDate()).padStart(2, '0')
    const fechaISO = `${cursor.getFullYear()}-${mes}-${dia}`

    if (!festivosSet.has(fechaISO)) {
      if (diaSemana !== 0) { // No es domingo
        if (diaSemana !== 6 || esJornadaNocturna) {
          // Es Lunes a Viernes, O es Sábado en jornada nocturna.
          diasHabiles++
        }
      }
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return diasHabiles
}
