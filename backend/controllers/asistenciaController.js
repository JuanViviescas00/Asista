import Asistencia from '../models/Asistencia.js'
import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'
import Dispositivo from '../models/Dispositivo.js'
import mongoose from 'mongoose'
import bcryptjs from 'bcryptjs'
import { getFichaIdList, getHoyString, calcularTardanzaDesdeInicioClase } from '../services/asistenciaService.js'
import { emitirAsistenciaRegistrada } from '../services/socketService.js'
import {
  upsertAsistenciaSQLite,
  upsertAsistenciasBatchSQLite,
  getSqliteFilePath,
  checkpointSQLite
} from '../services/sqliteExport.js'

export async function getAsistencias(req, res) {
  try {
    const { fichaId, fecha, fechaDesde, fechaHasta } = req.query
    const filter = {}
    if (fichaId) {
      const idsBuscar = await getFichaIdList(fichaId)
      filter.fichaId = { $in: idsBuscar }
    }
    if (fecha) filter.fecha = fecha
    if (fechaDesde || fechaHasta) {
      filter.fecha = {}
      if (fechaDesde) filter.fecha.$gte = fechaDesde
      if (fechaHasta) filter.fecha.$lte = fechaHasta
    }
    const asistencias = await Asistencia.find(filter)
      .populate('estudianteId')
      .populate('instructorId')
      .sort({ fecha: 1, createdAt: 1 })
    res.json(asistencias)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createAsistencia(req, res) {
  try {
    const {
      estudianteId,
      fichaId,
      fecha,
      estado,
      hora,
      horasTardanza,
      tiempoTardanza,
      motivoInhabilitacion,
      instructorId
    } = req.body

    if (fecha && fecha > getHoyString()) {
      return res.status(400).json({ error: 'No es posible registrar asistencias en fechas futuras.' })
    }

    const estudiante = await Estudiante.findById(estudianteId)
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' })
    }
    if (estudiante.estado !== 'Activo') {
      return res.status(400).json({ error: 'El estudiante está inactivo o retirado, no se puede registrar asistencia' })
    }

    // 1. Guardar en MongoDB Atlas
    const asistencia = await Asistencia.findOneAndUpdate(
      { estudianteId, fichaId, fecha },
      {
        estudianteId,
        fichaId,
        fecha,
        estado,
        hora: hora || '—',
        horasTardanza: horasTardanza || 0,
        tiempoTardanza: tiempoTardanza || (horasTardanza ? `${horasTardanza} ${horasTardanza === 1 ? 'hora' : 'horas'}` : '0 horas'),
        motivoInhabilitacion: motivoInhabilitacion || '',
        instructorId: instructorId || null
      },
      { new: true, upsert: true }
    )

    if (estado !== 'Inhabilitada') {
      await Estudiante.findByIdAndUpdate(estudianteId, { estadoAsistencia: estado })
    }

    // 2. Sincronizar automáticamente con el archivo SQLite único
    try {
      const [estudianteDoc, fichaDoc] = await Promise.all([
        Estudiante.findById(estudianteId),
        Ficha.findById(fichaId)
      ])

      if (estudianteDoc && fichaDoc) {
        upsertAsistenciaSQLite({
          fichaCodigo: fichaDoc.codigoFicha || String(fichaId),
          nombrePrograma: fichaDoc.nombrePrograma || '',
          jornada: fichaDoc.jornada || '',
          documentoAprendiz: estudianteDoc.numeroDocumento || '',
          nombreAprendiz: `${estudianteDoc.nombres || ''} ${estudianteDoc.apellidos || ''}`.trim(),
          correoAprendiz: estudianteDoc.correo || '',
          fecha: fecha,
          estado: estado,
          hora: hora || '—',
          horasTardanza: horasTardanza || 0,
          tiempoTardanza: tiempoTardanza || '0 horas'
        })
      }
    } catch (sqliteErr) {
      console.warn('[SQLite] Error en sincronización individual:', sqliteErr.message)
    }

    res.status(201).json(asistencia)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Procesa una única asistencia del batch de sincronización. Devuelve el resultado
// { uuid, estado: 'guardada'|'duplicada'|'error', error? } sin lanzar excepciones,
// para que un fallo individual no tumbe el resto del batch.
async function procesarAsistencia(item) {
  const { uuid, estudianteId, fichaId, instructorId, timestamp, metodo, horaInicioClase, claseId } = item || {}

  if (!uuid) {
    return { uuid: uuid || null, estado: 'error', error: 'uuid es requerido' }
  }
  if (!estudianteId || !fichaId) {
    return { uuid, estado: 'error', error: 'estudianteId y fichaId son requeridos' }
  }

  // Idempotencia a nivel de aplicación: si el uuid ya existe, es un reenvío.
  const existente = await Asistencia.findOne({ uuid }).catch(() => null)
  if (existente) {
    return { uuid, estado: 'duplicada' }
  }

  if (!mongoose.Types.ObjectId.isValid(String(estudianteId)) || !mongoose.Types.ObjectId.isValid(String(fichaId))) {
    return { uuid, estado: 'error', error: 'estudianteId o fichaId inválidos' }
  }

  const [estudiante, ficha] = await Promise.all([
    Estudiante.findById(estudianteId).catch(() => null),
    Ficha.findById(fichaId).catch(() => null),
  ])
  if (!estudiante) {
    return { uuid, estado: 'error', error: 'Estudiante no encontrado' }
  }
  if (estudiante.estado !== 'Activo') {
    return { uuid, estado: 'error', error: 'Estudiante inactivo o retirado' }
  }
  if (!ficha) {
    return { uuid, estado: 'error', error: 'Ficha no encontrada' }
  }

  const dateObj = timestamp ? new Date(timestamp) : new Date()
  if (Number.isNaN(dateObj.getTime())) {
    return { uuid, estado: 'error', error: 'timestamp inválido' }
  }
  const offsetMs = dateObj.getTimezoneOffset() * 60000
  const fecha = new Date(dateObj.getTime() - offsetMs).toISOString().split('T')[0]
  const hora = dateObj.toTimeString().slice(0, 8)

  // Hora real de inicio de clase (opcional). Si no llega o es inválida,
  // calcularTardanzaDesdeInicioClase cae al horario fijo de jornada (fallback).
  const horaInicioClaseDate = horaInicioClase ? new Date(horaInicioClase) : null
  const horaInicioClaseValida = (horaInicioClaseDate && !Number.isNaN(horaInicioClaseDate.getTime()))
    ? horaInicioClaseDate
    : null

  const resultado = calcularTardanzaDesdeInicioClase(horaInicioClaseValida, ficha.jornada, dateObj)
  const estado = resultado.estado
  // Falta = día completo de falla (6h), no horas de tardanza: se guarda 0 en
  // horasTardanza para que el banco de horas no cuente doble (ya cuenta como Falta).
  const horasTardanza = estado === 'Falta' ? 0 : resultado.horas
  const tiempoTardanza = `${horasTardanza} ${horasTardanza === 1 ? 'hora' : 'horas'}`

  const claseIdObj = claseId && mongoose.Types.ObjectId.isValid(String(claseId))
    ? new mongoose.Types.ObjectId(String(claseId))
    : null

  try {
    // Un solo registro por estudiante/ficha/día (regla de negocio): upsert atómico
    // con $setOnInsert. Si ya existía asistencia hoy, NO se modifica nada (primer
    // registro manda) y se reporta 'duplicada'. Distinto de Asistencia.create + uuid
    // fresco, que creaba un documento duplicado para el mismo estudiante/día.
    const doc = await Asistencia.findOneAndUpdate(
      { estudianteId, fichaId, fecha },
      {
        $setOnInsert: {
          uuid,
          estudianteId,
          fichaId,
          fecha,
          estado,
          hora,
          horasTardanza,
          tiempoTardanza,
          horaInicioClase: horaInicioClaseValida,
          claseId: claseIdObj,
          instructorId: instructorId || null,
          metodo: metodo === 'MANUAL' ? 'MANUAL' : 'HUELLA',
        },
      },
      { upsert: true, new: true }
    )

    if (doc && String(doc.uuid) === String(uuid)) {
      emitirAsistenciaRegistrada(String(fichaId), {
        fichaId: String(fichaId),
        estudianteId: String(estudianteId),
        nombres: estudiante.nombres || '',
        apellidos: estudiante.apellidos || '',
        hora,
        estado,
      })
      return { uuid, estado: 'guardada' }
    }
    return { uuid, estado: 'duplicada' }
  } catch (err) {
    // Clave duplicada (condición de carrera): el índice único sparse de uuid lo detiene.
    if (err?.code === 11000) {
      return { uuid, estado: 'duplicada' }
    }
    return { uuid, estado: 'error', error: err.message }
  }
}

export async function syncAsistencias(req, res) {
  try {
    const { deviceId, token, asistencias } = req.body

    // Validación de dispositivo (mismo patrón que el HELLO del WebSocket):
    // deviceId + token, comparando contra tokenHash con bcryptjs.
    if (!deviceId || !token) {
      return res.status(401).json({ error: 'deviceId y token son requeridos' })
    }
    const dispositivo = await Dispositivo.findOne({ deviceId: String(deviceId) })
    if (!dispositivo) {
      return res.status(401).json({ error: 'Dispositivo no registrado' })
    }
    if (dispositivo.activo !== true) {
      return res.status(403).json({ error: 'Dispositivo inactivo' })
    }
    const tokenValido = await bcryptjs.compare(String(token), dispositivo.tokenHash)
    if (!tokenValido) {
      return res.status(401).json({ error: 'Token de dispositivo inválido' })
    }

    if (!Array.isArray(asistencias)) {
      return res.status(400).json({ error: 'asistencias debe ser un array' })
    }

    const resultados = []
    for (const item of asistencias) {
      resultados.push(await procesarAsistencia(item))
    }

    res.json({ ok: true, resultados })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function inhabilitarJornada(req, res) {
  try {
    const { fichaId, fecha, motivo, instructorId } = req.body
    if (!fichaId || !fecha) {
      return res.status(400).json({ error: 'fichaId y fecha son requeridos' })
    }

    if (fecha > getHoyString()) {
      return res.status(400).json({ error: 'No es posible inhabilitar jornadas en fechas futuras.' })
    }

    const idsBuscar = await getFichaIdList(fichaId)
    const [estudiantes, fichaDoc] = await Promise.all([
      Estudiante.find({ fichaId: { $in: idsBuscar }, estado: { $ne: 'Retirado' } }),
      Ficha.findOne({ $or: [{ _id: mongoose.Types.ObjectId.isValid(fichaId) ? fichaId : null }, { codigoFicha: String(fichaId).trim() }] })
    ])
    const motivoFinal = motivo || 'Jornada no impartida / Actividad institucional'

    const operaciones = estudiantes.map(est => ({
      updateOne: {
        filter: { estudianteId: est._id, fecha },
        update: {
          $set: {
            estudianteId: est._id,
            fichaId: fichaDoc?._id || fichaId,
            fecha,
            estado: 'Inhabilitada',
            hora: '—',
            horasTardanza: 0,
            tiempoTardanza: '0 horas',
            motivoInhabilitacion: motivoFinal,
            instructorId: instructorId || null
          }
        },
        upsert: true
      }
    }))

    if (operaciones.length > 0) {
      await Asistencia.bulkWrite(operaciones)

      // Sincronizar en lote a SQLite
      if (fichaDoc) {
        const sqliteRows = estudiantes.map(est => ({
          fichaCodigo: fichaDoc.codigoFicha || String(fichaId),
          nombrePrograma: fichaDoc.nombrePrograma || '',
          jornada: fichaDoc.jornada || '',
          documentoAprendiz: est.numeroDocumento || '',
          nombreAprendiz: `${est.nombres || ''} ${est.apellidos || ''}`.trim(),
          correoAprendiz: est.correo || '',
          fecha: fecha,
          estado: 'Inhabilitada',
          hora: '—',
          horasTardanza: 0,
          tiempoTardanza: '0 horas'
        }))
        upsertAsistenciasBatchSQLite(sqliteRows)
      }
    }

    res.json({ ok: true, count: operaciones.length, motivo: motivoFinal })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function reactivarJornada(req, res) {
  try {
    const { fichaId, fecha } = req.body
    if (!fichaId || !fecha) {
      return res.status(400).json({ error: 'fichaId y fecha son requeridos' })
    }

    const idsBuscar = await getFichaIdList(fichaId)
    await Asistencia.deleteMany({ fichaId: { $in: idsBuscar }, fecha, estado: 'Inhabilitada' })
    res.json({ ok: true, message: 'Jornada reactivada exitosamente' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function downloadSqlite(req, res) {
  try {
    const filePath = getSqliteFilePath()

    const asistencias = await Asistencia.find()
      .populate('estudianteId')
      .populate('fichaId')

    const rows = []
    for (const a of asistencias) {
      if (!a.estudianteId || !a.fichaId) continue
      rows.push({
        fichaCodigo: a.fichaId.codigoFicha || String(a.fichaId._id || a.fichaId),
        nombrePrograma: a.fichaId.nombrePrograma || '',
        jornada: a.fichaId.jornada || '',
        documentoAprendiz: a.estudianteId.numeroDocumento || '',
        nombreAprendiz: `${a.estudianteId.nombres || ''} ${a.estudianteId.apellidos || ''}`.trim(),
        correoAprendiz: a.estudianteId.correo || '',
        fecha: a.fecha,
        estado: a.estado,
        hora: a.hora || '—',
        horasTardanza: a.horasTardanza || 0,
        tiempoTardanza: a.tiempoTardanza || '0 horas'
      })
    }
    upsertAsistenciasBatchSQLite(rows)
    checkpointSQLite()

    res.setHeader('Content-Type', 'application/vnd.sqlite3')
    res.setHeader('Content-Disposition', 'attachment; filename="asistencias_institucion.sqlite"')
    res.download(filePath, 'asistencias_institucion.sqlite')
  } catch (err) {
    console.error('[SQLite] Error en descarga:', err)
    res.status(500).json({ error: err.message })
  }
}

export async function syncAllSqlite(req, res) {
  try {
    const asistencias = await Asistencia.find()
      .populate('estudianteId')
      .populate('fichaId')

    const rows = []
    for (const a of asistencias) {
      if (!a.estudianteId || !a.fichaId) continue
      rows.push({
        fichaCodigo: a.fichaId.codigoFicha || String(a.fichaId._id || a.fichaId),
        nombrePrograma: a.fichaId.nombrePrograma || '',
        jornada: a.fichaId.jornada || '',
        documentoAprendiz: a.estudianteId.numeroDocumento || '',
        nombreAprendiz: `${a.estudianteId.nombres || ''} ${a.estudianteId.apellidos || ''}`.trim(),
        correoAprendiz: a.estudianteId.correo || '',
        fecha: a.fecha,
        estado: a.estado,
        hora: a.hora || '—',
        horasTardanza: a.horasTardanza || 0,
        tiempoTardanza: a.tiempoTardanza || '0 horas'
      })
    }

    const resultado = upsertAsistenciasBatchSQLite(rows)
    res.json({ ok: true, total: rows.length, ...resultado })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * Descarga el archivo .sqlite de un Docente específico
 */
export async function downloadSqliteDocente(req, res) {
  try {
    const { identificador } = req.params
    const { getDBDocente } = await import('../services/sqliteExport.js')
    const { filePath, db } = getDBDocente(identificador)
    try { db.close() } catch (e) {}

    res.setHeader('Content-Type', 'application/vnd.sqlite3')
    res.setHeader('Content-Disposition', `attachment; filename="asistencias_docente_${identificador}.sqlite"`)
    res.download(filePath, `asistencias_docente_${identificador}.sqlite`)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * Ejecuta bajo demanda la sincronización y agrupamiento nocturno de asistencias por Docente
 */
export async function ejecutarSincronizacionDocentes(req, res) {
  try {
    const { sincronizarSqlitePorDocente } = await import('../services/cronService.js')
    const resultado = await sincronizarSqlitePorDocente()
    res.json({ ok: true, mensaje: 'Sincronización por Docente (regla 3 días hábiles) ejecutada con éxito', ...resultado })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

