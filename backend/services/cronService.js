import cron from 'node-cron'
import Asistencia from '../models/Asistencia.js'
import Instructor from '../models/Instructor.js'
import DiaFestivo from '../models/DiaFestivo.js'
import Clase from '../models/Clase.js'
import SofiaPlusSync from '../models/SofiaPlusSync.js'
import Inasistencia from '../models/Inasistencia.js'
import { obtenerTodasAsistenciasConsolidadas } from '../controllers/asistenciaController.js'

import { getHoyString, finalizarClase } from './asistenciaService.js'
import { emitirDesactivacion, emitirClaseDesactivada, emitirAlertaSofiaPlus } from './socketService.js'
import { calcularDiasHabilesTranscurridos, DIAS_HABILES_VENTANA_EXCUSA } from '../utils/diasHabiles.js'
import { calcularEstadoCarga } from '../utils/inasistenciaEstado.js'

// Reexportados para no romper a quienes ya importaban estas utilidades desde cronService.
export { calcularDiasHabilesTranscurridos, DIAS_HABILES_VENTANA_EXCUSA }

/**
 * Cierra automáticamente las clases que lleven más de 3 horas activas.
 * Si el docente olvidó finalizar la clase, el sistema la finaliza de forma automática,
 * actualiza el estado en MongoDB ('Finalizada') y emite DEACTIVATE al lector físico y al frontend.
 */
export async function cerrarClasesExpiradas() {
  const LIMITE_HORAS = 3
  const limiteMs = LIMITE_HORAS * 60 * 60 * 1000
  const ahora = new Date()
  const fechaLimite = new Date(ahora.getTime() - limiteMs)

  try {
    const clasesExpiradas = await Clase.find({
      estado: 'Activa',
      iniciadaAt: { $lte: fechaLimite }
    }).populate('fichaId')

    if (!clasesExpiradas || clasesExpiradas.length === 0) {
      return { cerradas: 0 }
    }

    let cerradas = 0
    for (const clase of clasesExpiradas) {
      const fichaIdStr = String(clase.fichaId?._id || clase.fichaId)
      const instructorIdStr = String(clase.instructorId)

      // Cierre atómico + auto-cierre de inasistencias (antes de emitir).
      const resultado = await finalizarClase(clase._id, { motivo: 'AUTO_CIERRE_3_HORAS' })

      if (resultado.yaFinalizada) {
        // Ya se cerró en otro camino: no se vuelve a emitir.
        continue
      }

      // 1. Notificar al lector físico para que apague la captura de huellas
      if (clase.deviceId) {
        emitirDesactivacion(clase.deviceId, {
          type: 'DEACTIVATE',
          fichaId: fichaIdStr,
          instructorId: instructorIdStr,
          motivo: 'AUTO_CIERRE_3_HORAS'
        })
      }

      // 2. Notificar a las salas del frontend/dashboard
      emitirClaseDesactivada(fichaIdStr, {
        fichaId: fichaIdStr,
        motivo: 'AUTO_CIERRE_3_HORAS'
      })

      cerradas++
      const codFicha = clase.fichaId?.codigoFicha || fichaIdStr
      console.log(`[AutoCierre] ⏱ Clase de la ficha ${codFicha} finalizada automáticamente (superó las ${LIMITE_HORAS} horas).`)
    }

    return { cerradas }
  } catch (err) {
    console.error('[AutoCierre] ❌ Error en auto-cierre de clases:', err.message)
    return { cerradas: 0, error: err.message }
  }
}

/**
 * Recalcula el estado de carga (EN_ESPERA -> LISTO_PARA_SUBIR) de las
 * Inasistencias pendientes. Nunca toca las que ya están en 'SUBIDA'.
 */
export async function actualizarEstadosCarga() {
  const hoyStr = getHoyString()

  const festivosDocs = await DiaFestivo.find().select('fecha')
  const festivosSet = new Set(festivosDocs.map((f) => f.fecha))

  const enEspera = await Inasistencia.find({ estadoCarga: 'EN_ESPERA' }).populate('fichaId', 'jornada')

  const actualizaciones = []
  for (const ina of enEspera) {
    const jornada = ina.fichaId?.jornada || ''
    const nuevo = calcularEstadoCarga({ fecha: ina.fecha, tipo: ina.tipo, jornada, festivosSet, hoyStr })
    if (nuevo === 'LISTO_PARA_SUBIR') {
      actualizaciones.push({
        updateOne: {
          filter: { _id: ina._id },
          update: { $set: { estadoCarga: 'LISTO_PARA_SUBIR' } },
        },
      })
    }
  }

  let actualizadas = 0
  if (actualizaciones.length > 0) {
    const res = await Inasistencia.bulkWrite(actualizaciones)
    actualizadas = res.modifiedCount || 0
  }

  return { revisadas: enEspera.length, actualizadas }
}

/**
 * Servicio Cron Job para:
 * 1. Auto-cierre de clases que superen las 3 horas (cada minuto).
 * 2. Exportación y sincronización nocturna de asistencias agrupadas por Docente (medianoche).
 */
export function iniciarCronJobs() {
  const schedule = process.env.CRON_SCHEDULE || '0 0 * * *'
  const timezone = process.env.CRON_TIMEZONE || 'America/Bogota'

  // 1. Cron de auto-cierre de clases cada minuto
  cron.schedule('* * * * *', async () => {
    await cerrarClasesExpiradas()
  })

  // Ejecución inicial preventiva al arrancar el servidor
  cerrarClasesExpiradas().catch(e => console.warn('[AutoCierre] Error inicial:', e.message))
  console.log('[CRON] Auto-cierre de clases cada minuto activo (límite 3 horas)')

  // 2. Cron nocturno de sincronización SQLite por Docente
  cron.schedule(schedule, async () => {
    console.log(`\n[CRON] ⏰ ${new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' })}: Iniciando procesamiento nocturno de SQLite por DOCENTE (filtro ${DIAS_HABILES_VENTANA_EXCUSA} días hábiles)...`)
    try {
      const estados = await actualizarEstadosCarga()
      console.log(`[CRON] Estados de carga: ${estados.revisadas} revisadas, ${estados.actualizadas} pasaron a LISTO_PARA_SUBIR.`)
    } catch (err) {
      console.error('[CRON] Error actualizando estados de carga:', err.message)
    }
  }, {
    timezone
  })

  console.log(`[CRON] Programador nocturno listo (${schedule} - ${timezone}) - Agrupación por Docente`)

  // 3. Cron semanal de detección de fallas/excusas para Sofía Plus (desactivado por defecto; activar con ENABLE_SOFIA_SYNC=true)
  if (process.env.ENABLE_SOFIA_SYNC === 'true') {
    const scheduleSofia = process.env.CRON_SOFIA_SCHEDULE || '0 0 * * 6'
    cron.schedule(scheduleSofia, async () => {
      console.log(`\n[CRON] ⏰ ${new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' })}: Iniciando revisión semanal de fallas para Sofía Plus (Sábado 12:00 AM)...`)
      try {
        const encolado = await revisarYEncolarSofiaPlus()
        console.log(`[CRON] SofiaPlus: ${encolado.encolados} encolados, ${encolado.omitidosYaExistentes} ya existentes, ${encolado.enEsperaDiasHabiles} en espera de días hábiles.`)
        const alertas = await revisarAlertasSofiaPlus()
        console.log(`[CRON] SofiaPlus: ${alertas.alertasEmitidas} alertas emitidas.`)
      } catch (err) {
        console.error('[CRON] ❌ Error en revisión de Sofía Plus:', err.message)
      }
    }, {
      timezone: 'America/Bogota'
    })
    console.log(`[CRON] Revisión semanal Sofía Plus activa (Cada Sábado a las 12:00 AM / ${scheduleSofia} - America/Bogota)`)
  }
}

/**
 * Genera y actualiza un archivo SQLite independiente para cada Docente que haya impartido clases.
 * - Incluye todas las clases dictadas diariamente por el profesor (sin importar si es líder o apoyo).
 * - Evalúa la ventana de excusa (DIAS_HABILES_VENTANA_EXCUSA, Acuerdo 0009 de 2024, Art. 28 Parágrafo 3):
 *   - Si la ventana no venció: Estado de carga 'EN_ESPERA' (ventana reglamentaria para radicar excusas).
 *   - Si la ventana venció (diasHabiles >= DIAS_HABILES_VENTANA_EXCUSA + 1): 'LISTO_PARA_SUBIR'.
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

  // 3. Obtener todas las asistencias consolidadas (Inasistencia + Jornada)
  const asistencias = await obtenerTodasAsistenciasConsolidadas()

  if (!asistencias || asistencias.length === 0) {
    return { ok: true, totalDocentes: 0, totalRegistros: 0, totalElegiblesSubida: 0 }
  }

  // 4. Agrupar asistencias por Docente (usando su número de documento o id)
  const asistenciasPorDocente = new Map()

  for (const a of asistencias) {
    const inst = a.instructorDoc || (a.fichaDoc?.instructorLiderId ? instructoresMap.get(String(a.fichaDoc.instructorLiderId)) : null)
    const docenteKey = inst?.numeroDocumento ? String(inst.numeroDocumento) : (inst?._id ? String(inst._id) : 'sin_asignar')

    if (!asistenciasPorDocente.has(docenteKey)) {
      asistenciasPorDocente.set(docenteKey, {
        docente: inst,
        rows: []
      })
    }

    const diasHabiles = calcularDiasHabilesTranscurridos(a.fecha, festivosSet, hoyStr, a.jornada || '')
    const esElegible = a.estadoCarga === 'LISTO_PARA_SUBIR' || diasHabiles >= DIAS_HABILES_VENTANA_EXCUSA + 1
    const estadoCarga = esElegible ? 'LISTO_PARA_SUBIR' : 'EN_ESPERA'

    asistenciasPorDocente.get(docenteKey).rows.push({
      fichaCodigo: a.fichaCodigo || 'Sin Ficha',
      nombrePrograma: a.nombrePrograma || '',
      jornada: a.jornada || '',
      documentoAprendiz: a.documentoAprendiz || '',
      nombreAprendiz: a.nombreAprendiz || '',
      correoAprendiz: a.correoAprendiz || '',
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

      console.log(`[CRON] Docente ${docenteKey}: ${rows.length} registros guardados (${elegiblesDocente} listos tras ${DIAS_HABILES_VENTANA_EXCUSA} días hábiles) en ${filePath}`)
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

/**
 * Revisa las asistencias con estado 'Falta' o 'Excusada' y las encola en la
 * colección SofiaPlusSync para que otro proceso (RPA) las suba a Sofía Plus.
 * - 'Excusada' se encola de inmediato como justificada, sin esperar días hábiles.
 * - 'Falta' solo se encola cuando hayan transcurrido >= 6 días hábiles desde la
 *   fecha de la inasistencia (Acuerdo 0009 de 2024, Art. 28 Parágrafo 3 y Art. 29 Numeral 1).
 *   Esto garantiza al aprendiz sus 5 días hábiles completos para radicar soportes;
 *   la falta se considera vencida e injustificada una vez culminado el 5to día hábil.
 * - No duplica: si ya existe un SofiaPlusSync para una asistencia, la omite.
 */
export async function revisarYEncolarSofiaPlus() {
  // 1. Leer Inasistencias que estén en LISTO_PARA_SUBIR (Falta o Excusada)
  const inasistencias = await Inasistencia.find({
    tipo: { $in: ['Falta', 'Excusada'] },
    estadoCarga: 'LISTO_PARA_SUBIR'
  }).populate('fichaId', 'jornada instructorLiderId')

  if (!inasistencias || inasistencias.length === 0) {
    return { encolados: 0, omitidosYaExistentes: 0, enEsperaDiasHabiles: 0 }
  }

  // 2. IDs ya encolados en SofiaPlusSync
  const idsInasistencias = inasistencias.map(ina => ina._id)
  const yaEncoladosDocs = await SofiaPlusSync.find({
    $or: [
      { inasistenciaId: { $in: idsInasistencias } },
      { asistenciaId: { $in: idsInasistencias } }
    ]
  }).select('inasistenciaId asistenciaId')

  const yaEncolados = new Set(
    yaEncoladosDocs.map(s => String(s.inasistenciaId || s.asistenciaId))
  )

  const aEncolar = []
  let omitidosYaExistentes = 0

  for (const ina of inasistencias) {
    if (!ina.fichaId) continue

    const idStr = String(ina._id)
    if (yaEncolados.has(idStr)) {
      omitidosYaExistentes++
      continue
    }

    const instructorId = ina.instructorId || (ina.fichaId.instructorLiderId || null)

    aEncolar.push({
      inasistenciaId: ina._id,
      asistenciaId: ina._id,
      estudianteId: ina.estudianteId,
      fichaId: ina.fichaId._id || ina.fichaId,
      instructorId,
      fecha: ina.fecha,
      resultado: ina.tipo,
    })
  }

  if (aEncolar.length > 0) {
    try {
      await SofiaPlusSync.insertMany(aEncolar, { ordered: false })
    } catch (err) {
      if (err.code !== 11000) {
        console.error('[SofiaPlus] Error al encolar registros:', err.message)
      }
    }
  }

  console.log(`[SofiaPlus] Encolados: ${aEncolar.length}, ya existentes: ${omitidosYaExistentes}`)

  return { encolados: aEncolar.length, omitidosYaExistentes, enEsperaDiasHabiles: 0 }
}

/**
 * Revisa los SofiaPlusSync en estado 'error' con intentos >= 3 y sin alerta
 * enviada, emite una alerta por WebSocket y marca alertaEnviada = true.
 */
export async function revisarAlertasSofiaPlus() {
  const errores = await SofiaPlusSync.find({
    estadoSync: 'error',
    intentos: { $gte: 3 },
    alertaEnviada: false,
  })

  let alertasEmitidas = 0
  for (const s of errores) {
    const emitido = emitirAlertaSofiaPlus({
      type: 'ALERTA_SOFIA_PLUS',
      syncId: String(s._id),
      asistenciaId: String(s.asistenciaId),
      estudianteId: String(s.estudianteId),
      fichaId: String(s.fichaId),
      fecha: s.fecha,
      resultado: s.resultado,
      intentos: s.intentos,
      ultimoError: s.ultimoError,
    })

    if (emitido) {
      s.alertaEnviada = true
      await s.save()
      alertasEmitidas++
    }
  }

  return { alertasEmitidas }
}
