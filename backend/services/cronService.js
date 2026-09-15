import cron from 'node-cron'
import Asistencia from '../models/Asistencia.js'
import Instructor from '../models/Instructor.js'
import DiaFestivo from '../models/DiaFestivo.js'
import { getDBDocente, upsertAsistenciasBatchSQLite } from './sqliteExport.js'
import { getHoyString } from './asistenciaService.js'

/**
 * Calcula la cantidad de días hábiles transcurridos entre una fecha y la fecha actual (hoy).
 * - Para jornadas Diurnas (Mañana / Tarde): los días hábiles son Lunes a Viernes (omite Sábados y Domingos).
 * - Para jornadas Nocturnas (Noche / Nocturna): los SÁBADOS SÍ son días hábiles con clases (solo omite Domingos).
 * - En ambas jornadas se omiten los Días Festivos institucionales.
 * 
 * @param {string} fechaStr - 'YYYY-MM-DD'
 * @param {Set<string>} festivosSet - Set de strings 'YYYY-MM-DD'
 * @param {string} hoyStr - 'YYYY-MM-DD'
 * @param {string} jornada - 'Mañana' | 'Tarde' | 'Noche' | 'Nocturna'
 * @returns {number} Número de días hábiles transcurridos
 */
export function calcularDiasHabilesTranscurridos(fechaStr, festivosSet = new Set(), hoyStr = getHoyString(), jornada = '') {
  if (!fechaStr || fechaStr >= hoyStr) return 0

  const [y1, m1, d1] = fechaStr.split('-').map(Number)
  const [y2, m2, d2] = hoyStr.split('-').map(Number)

  let cursor = new Date(y1, m1 - 1, d1, 12, 0, 0)
  const fechaFin = new Date(y2, m2 - 1, d2, 12, 0, 0)

  // Determinar si la jornada incluye sábados lectivos
  const jNorm = String(jornada || '').toLowerCase()
  const esJornadaNocturna = jNorm.includes('noche') || jNorm.includes('nocturn')

  // Avanzar un día para no contar el día de la propia clase
  cursor.setDate(cursor.getDate() + 1)

  let diasHabiles = 0
  while (cursor <= fechaFin) {
    const diaSemana = cursor.getDay() // 0 = Domingo, 6 = Sábado
    const mes = String(cursor.getMonth() + 1).padStart(2, '0')
    const dia = String(cursor.getDate()).padStart(2, '0')
    const fechaISO = `${cursor.getFullYear()}-${mes}-${dia}`

    // Si es festivo institucional, no cuenta como día hábil
    if (!festivosSet.has(fechaISO)) {
      if (diaSemana !== 0) { // No es domingo
        if (diaSemana !== 6 || esJornadaNocturna) {
          // Es Lunes a Viernes, O es Sábado en jornada nocturna
          diasHabiles++
        }
      }
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return diasHabiles
}


/**
 * Servicio Cron Job para exportación y sincronización nocturna de asistencias agrupadas por Docente.
 * Se ejecuta periódicamente según CRON_SCHEDULE (por defecto medianoche: '0 0 * * *').
 */
export function iniciarCronJobs() {
  const schedule = process.env.CRON_SCHEDULE || '0 0 * * *'
  const timezone = process.env.CRON_TIMEZONE || 'America/Bogota'

  cron.schedule(schedule, async () => {
    console.log(`\n[CRON] ⏰ ${new Date().toLocaleTimeString('es-CO')}: Iniciando procesamiento nocturno de SQLite por DOCENTE (filtro 3 días hábiles)...`)
    try {
      const resultado = await sincronizarSqlitePorDocente()
      console.log(`[CRON] ✅ Proceso finalizado. Docentes: ${resultado.totalDocentes}, Clases/Registros: ${resultado.totalRegistros}, Elegibles subida: ${resultado.totalElegiblesSubida}`)
    } catch (err) {
      console.error('[CRON] ❌ Error en ejecución del Cron Job:', err.message)
    }
  }, {
    timezone
  })

  console.log(`[CRON] Programador nocturno listo (${schedule} - ${timezone}) - Agrupación por Docente`)
}

/**
 * Genera y actualiza un archivo SQLite independiente para cada Docente que haya impartido clases.
 * - Incluye todas las clases dictadas diariamente por el profesor (sin importar si es líder o apoyo).
 * - Evalúa los 3 días hábiles posteriores a la clase:
 *   - Si días hábiles < 3: Estado de carga 'EN_ESPERA' (ventana para excusas/justificaciones).
 *   - Si días hábiles >= 3: Estado de carga 'LISTO_PARA_SUBIR' (elegible para el servidor institucional).
 */
export async function sincronizarSqlitePorDocente() {
  const hoyStr = getHoyString()

  // 1. Cargar conjunto de días festivos para cálculo de días hábiles
  const festivosDocs = await DiaFestivo.find().select('fecha')
  const festivosSet = new Set(festivosDocs.map(f => f.fecha))

  // 2. Obtener todos los instructores
  const instructores = await Instructor.find()
  const instructoresMap = new Map()
  instructores.forEach(inst => instructoresMap.set(String(inst._id), inst))

  // 3. Obtener todas las asistencias registradas
  const asistencias = await Asistencia.find()
    .populate('estudianteId', 'nombres apellidos numeroDocumento correo')
    .populate('fichaId', 'codigoFicha nombrePrograma jornada')
    .populate('instructorId', 'nombres apellidos numeroDocumento especialidad correo')
    .sort({ fecha: 1 })

  if (!asistencias || asistencias.length === 0) {
    return { ok: true, totalDocentes: 0, totalRegistros: 0, totalElegiblesSubida: 0 }
  }

  // 4. Agrupar asistencias por Docente (usando su número de documento o id)
  const asistenciasPorDocente = new Map()

  for (const a of asistencias) {
    if (!a.estudianteId || !a.fichaId) continue

    const inst = a.instructorId || (a.fichaId.instructorLiderId ? instructoresMap.get(String(a.fichaId.instructorLiderId)) : null)
    const docenteKey = inst?.numeroDocumento ? String(inst.numeroDocumento) : (inst?._id ? String(inst._id) : 'sin_asignar')

    if (!asistenciasPorDocente.has(docenteKey)) {
      asistenciasPorDocente.set(docenteKey, {
        docente: inst,
        rows: []
      })
    }

    const diasHabiles = calcularDiasHabilesTranscurridos(a.fecha, festivosSet, hoyStr, a.fichaId?.jornada || '')
    const esElegible = diasHabiles >= 3
    const estadoCarga = esElegible ? 'LISTO_PARA_SUBIR' : 'EN_ESPERA'

    asistenciasPorDocente.get(docenteKey).rows.push({
      fichaCodigo: a.fichaId.codigoFicha || 'Sin Ficha',
      nombrePrograma: a.fichaId.nombrePrograma || '',
      jornada: a.fichaId.jornada || '',
      documentoAprendiz: a.estudianteId.numeroDocumento || '',
      nombreAprendiz: `${a.estudianteId.nombres || ''} ${a.estudianteId.apellidos || ''}`.trim(),
      correoAprendiz: a.estudianteId.correo || '',
      fecha: a.fecha,
      estado: a.estado,
      hora: a.hora || '—',
      horasTardanza: Number(a.horasTardanza) || 0,
      tiempoTardanza: a.tiempoTardanza || '0 horas',
      instructorId: inst ? String(inst._id) : null,
      instructorDocumento: inst?.numeroDocumento || 'Sin documento',
      instructorNombre: inst ? `${inst.nombres || ''} ${inst.apellidos || ''}`.trim() : 'Sin asignar',
      instructorEspecialidad: inst?.especialidad || '',
      diasHabilesTranscurridos: diasHabiles,
      estadoCarga: estadoCarga
    })
  }

  let totalDocentes = 0
  let totalRegistros = 0
  let totalElegiblesSubida = 0
  const archivosGenerados = []

  // 5. Generar archivo SQLite independiente por cada Docente
  for (const [docenteKey, info] of asistenciasPorDocente.entries()) {
    const { rows } = info
    const { db, filePath } = getDBDocente(docenteKey)

    try {
      const resBatch = upsertAsistenciasBatchSQLite(rows, db)
      totalDocentes++
      totalRegistros += (resBatch.count || 0)
      const elegiblesDocente = rows.filter(r => r.estadoCarga === 'LISTO_PARA_SUBIR').length
      totalElegiblesSubida += elegiblesDocente

      archivosGenerados.push({
        documentoDocente: docenteKey,
        totalClases: rows.length,
        elegiblesParaSubir: elegiblesDocente,
        enEsperaDiasHabiles: rows.length - elegiblesDocente,
        archivo: filePath
      })

      console.log(`[CRON] Docente ${docenteKey}: ${rows.length} registros guardados (${elegiblesDocente} listos tras 3 días hábiles) en ${filePath}`)
    } finally {
      try { db.close() } catch (e) {}
    }
  }

  return {
    ok: true,
    totalDocentes,
    totalRegistros,
    totalElegiblesSubida,
    archivosGenerados
  }
}
