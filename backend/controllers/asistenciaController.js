import Asistencia from '../models/Asistencia.js'
import Inasistencia from '../models/Inasistencia.js'
import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'
import DiaFestivo from '../models/DiaFestivo.js'
import Dispositivo from '../models/Dispositivo.js'
import Clase from '../models/Clase.js'
import mongoose from 'mongoose'
import bcryptjs from 'bcryptjs'
import { getFichaIdList, getHoyString, calcularEstadoAsistencia, calcularTardanzaEscalonada, formatearFechaColombia, formatearHoraColombia } from '../services/asistenciaService.js'
import { emitirAsistenciaRegistrada } from '../services/socketService.js'
import { topeHorasPorJornada, validarHorasInasistencia } from '../utils/jornadaUtils.js'
import { calcularEstadoCarga } from '../utils/inasistenciaEstado.js'
import { asegurarJornada } from '../services/jornadaService.js'
import {
  upsertAsistenciaSQLite,
  upsertAsistenciasBatchSQLite,
  deleteAsistenciaSQLite,
  getSqliteFilePath,
  checkpointSQLite
} from '../services/sqliteExport.js'

// Shim de compatibilidad: expone la misma forma que el modelo Asistencia.
function toAsistenciaShape(a) {
  const obj = a.toObject ? a.toObject() : a
  return {
    ...obj,
    estado: a.tipo,
    horasTardanza: a.tipo === 'Tardanza' ? a.horas : 0,
    motivoInhabilitacion: '',
    subidoSofia: a.estadoCarga === 'SUBIDA',
    estadoCarga: a.estadoCarga,
  }
}

// Upsert con candado anti-carrera: no inserta ni actualiza si la novedad ya está SUBIDA.
async function upsertInasistencia(filter, update) {
  const filterConCandado = { ...filter, estadoCarga: { $ne: 'SUBIDA' } }
  try {
    return await Inasistencia.findOneAndUpdate(filterConCandado, update, { new: true, upsert: true })
  } catch (err) {
    if (err?.code !== 11000) throw err
    // Carrera de inserción: comprobar si el documento ya pasó a SUBIDA.
    const existente = await Inasistencia.findOne(filter)
    if (existente?.estadoCarga === 'SUBIDA') {
      const conflict = new Error('Esta inasistencia ya fue reportada a Sofía Plus y no se puede modificar.')
      conflict.status = 409
      throw conflict
    }
    if (!existente) throw err
    return Inasistencia.findOneAndUpdate(filterConCandado, update, { new: true })
  }
}

export async function getAsistencias(req, res) {
  try {
    const { fichaId, estudianteId, fecha, fechaDesde, fechaHasta } = req.query
    const filter = {}
    if (estudianteId) {
      filter.estudianteId = estudianteId
    }
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
    const inasistencias = await Inasistencia.find(filter)
      .populate('estudianteId')
      .populate('instructorId')
      .sort({ fecha: 1, createdAt: 1 })

    res.json(inasistencias.map(toAsistenciaShape))
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

    const fichaDoc = await Ficha.findById(fichaId)

    // Verificar propiedad y permisos de solo lectura entre docentes
    const existente = await Inasistencia.findOne({ estudianteId, fichaId, fecha })
    const esAdmin = req.usuario?.rol === 'Administrador'
    const usuarioId = req.usuario?.id ? String(req.usuario.id) : (instructorId ? String(instructorId) : null)

    if (existente && existente.instructorId) {
      const creadorId = String(existente.instructorId)
      if (!esAdmin && usuarioId && creadorId !== usuarioId) {
        return res.status(403).json({
          error: 'Solo de lectura: No puedes modificar la asistencia registrada por otro docente.'
        })
      }
    }

    const instructorFinal = usuarioId || existente?.instructorId || null

    // Bloqueo por subida a Sofía Plus: una novedad ya subida no puede editarse
    // ni quitarse, sin importar su origen (manual o huellero).
    if (existente?.estadoCarga === 'SUBIDA') {
      return res.status(409).json({
        error: 'Esta inasistencia ya fue reportada a Sofía Plus y no se puede modificar.'
      })
    }

    // Tardanza con 0 horas equivale a "Presente": no hay novedad que guardar.
    const esPresente = estado === 'Presente' || (estado === 'Tardanza' && (horasTardanza || 0) === 0)

    if (esPresente) {
      const debeBorrar = !!existente
      if (debeBorrar) {
        const borrado = await Inasistencia.deleteOne({ estudianteId, fichaId, fecha, estadoCarga: { $ne: 'SUBIDA' } })
        if (borrado.deletedCount === 0) {
          const doc = await Inasistencia.findOne({ estudianteId, fichaId, fecha })
          if (doc?.estadoCarga === 'SUBIDA') {
            return res.status(409).json({ error: 'Esta inasistencia ya fue reportada a Sofía Plus y no se puede modificar.' })
          }
        }
        await Estudiante.findByIdAndUpdate(estudianteId, { estadoAsistencia: 'Presente' })

        if (fichaDoc) {
          deleteAsistenciaSQLite({
            fichaCodigo: fichaDoc.codigoFicha || String(fichaId),
            documentoAprendiz: estudiante.numeroDocumento || '',
            fecha
          })
        }
      }
      return res.json({ ok: true, estado: 'Presente', eliminado: debeBorrar })
    }

    if (!['Falta', 'Tardanza', 'Excusada'].includes(estado)) {
      return res.status(400).json({ error: 'Estado de asistencia no válido.' })
    }

    // Derivar y validar las horas según el tipo y el tope de la jornada.
    const jornada = fichaDoc?.jornada || ''
    const tope = topeHorasPorJornada(jornada)
    const horasPropuestas = estado === 'Tardanza' ? (horasTardanza || 0) : tope
    const validacion = validarHorasInasistencia(horasPropuestas, jornada)
    if (!validacion.ok) {
      return res.status(400).json({ error: validacion.error })
    }
    const horas = validacion.horas

    // Calcular el estado de carga (ciclo EN_ESPERA -> LISTO_PARA_SUBIR -> SUBIDA).
    const festivosDocs = await DiaFestivo.find().select('fecha')
    const festivosSet = new Set(festivosDocs.map((d) => d.fecha))
    const estadoCarga = calcularEstadoCarga({ fecha, tipo: estado, jornada, festivosSet, hoyStr: getHoyString() })

    // 1. Guardar en MongoDB Atlas (upsert de la novedad)
    const inasistencia = await upsertInasistencia(
      { estudianteId, fichaId, fecha },
      {
        $set: {
          tipo: estado,
          horas,
          hora: hora || formatearHoraColombia(),
          tiempoTardanza: tiempoTardanza || (estado === 'Tardanza' ? `${horas} ${horas === 1 ? 'hora' : 'horas'}` : '0 horas'),
          instructorId: instructorFinal,
          estadoCarga,
        },
        $setOnInsert: {
          origen: 'manual',
        },
      }
    )

    await Estudiante.findByIdAndUpdate(estudianteId, { estadoAsistencia: estado })

    // 2. Asegurar la Jornada (un documento por ficha + fecha)
    try {
      await asegurarJornada({ fichaId, fecha, instructorId: instructorFinal, origen: 'manual' })
    } catch (jornadaErr) {
      console.warn('[Jornada] Error asegurando jornada:', jornadaErr.message)
    }

    // 3. Sincronizar automáticamente con el archivo SQLite único
    try {
      if (fichaDoc) {
        upsertAsistenciaSQLite({
          fichaCodigo: fichaDoc.codigoFicha || String(fichaId),
          nombrePrograma: fichaDoc.nombrePrograma || '',
          jornada: fichaDoc.jornada || '',
          documentoAprendiz: estudiante.numeroDocumento || '',
          nombreAprendiz: `${estudiante.nombres || ''} ${estudiante.apellidos || ''}`.trim(),
          correoAprendiz: estudiante.correo || '',
          fecha: fecha,
          estado: estado,
          hora: hora || '—',
          horasTardanza: estado === 'Tardanza' ? horas : 0,
          tiempoTardanza: tiempoTardanza || '0 horas'
        })
      }
    } catch (sqliteErr) {
      console.warn('[SQLite] Error en sincronización individual:', sqliteErr.message)
    }

    // 4. Emitir evento por Socket.io para actualización en tiempo real en otros computadores
    try {
      emitirAsistenciaRegistrada(String(fichaId), {
        asistenciaId: inasistencia._id,
        estudianteId,
        nombres: estudiante.nombres || '',
        apellidos: estudiante.apellidos || '',
        estado,
        hora: inasistencia.hora,
        tiempoTardanza: inasistencia.tiempoTardanza,
        horasTardanza: estado === 'Tardanza' ? inasistencia.horas : 0,
        metodo: 'MANUAL',
        fecha
      })
    } catch (wsErr) {
      console.warn('[Socket] Error emitiendo asistencia registrada:', wsErr.message)
    }

    res.status(201).json(toAsistenciaShape(inasistencia))
  } catch (err) {
    if (err?.status === 409) {
      return res.status(409).json({ error: err.message })
    }
    res.status(500).json({ error: err.message })
  }
}

// Procesa una única asistencia del batch de sincronización. Devuelve el resultado
// { uuid, estado: 'guardada'|'duplicada'|'error', error? } sin lanzar excepciones,
// para que un fallo individual no tumbe el resto del batch.
async function procesarAsistencia(item) {
  const { uuid, estudianteId, fichaId, instructorId, timestamp, metodo } = item || {}

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
  const fecha = formatearFechaColombia(dateObj)
  const hora = formatearHoraColombia(dateObj)

  // Fuente PRIMARIA: la clase en curso al momento de la marcación (iniciadaAt).
  // Se consulta el modelo Clase con el _id de ficha YA RESUELTO (no el fichaId
  // crudo del payload), sin depender de que el huellero envíe horaInicioClase.
  let claseDoc = null
  try {
    const queryClase = { fichaId: ficha._id, iniciadaAt: { $lte: dateObj } }
    if (instructorId) queryClase.instructorId = instructorId
    claseDoc = await Clase.findOne(queryClase).sort({ iniciadaAt: -1 })
  } catch (_) {
    // Sin clase localizable: se cae al fallback de horario fijo (jornada).
  }

  let estado
  let horasTardanza
  let tiempoTardanza
  let horaInicioClaseValida = null
  let claseIdObj = null

  if (claseDoc?.iniciadaAt) {
    const resultado = calcularEstadoAsistencia(claseDoc.iniciadaAt, dateObj)
    estado = resultado.estado
    horasTardanza = resultado.horasTardanza
    tiempoTardanza = resultado.tiempoTardanza
    horaInicioClaseValida = claseDoc.iniciadaAt
    claseIdObj = claseDoc._id
  } else {
    // Fallback: horario fijo de jornada (ficha sin Clase nunca activada).
    // Falta = día completo de falla: se guarda 0 en horasTardanza para que el
    // banco de horas no cuente doble (ya cuenta como Falta).
    const resultado = calcularTardanzaEscalonada(ficha.jornada, dateObj)
    estado = resultado.estado
    horasTardanza = estado === 'Falta' ? 0 : resultado.horas
    tiempoTardanza = `${horasTardanza} ${horasTardanza === 1 ? 'hora' : 'horas'}`
  }

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

    // Aprendices con novedades ya reportadas a Sofía Plus: no se sobrescriben.
    const bloqueados = await Asistencia.find({
      fichaId: { $in: idsBuscar },
      fecha,
      subidoSofia: true
    }).select('estudianteId')
    const bloqueadosSet = new Set(bloqueados.map(b => String(b.estudianteId)))
    const editables = estudiantes.filter(est => !bloqueadosSet.has(String(est._id)))

    const operaciones = editables.map(est => ({
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
        const sqliteRows = editables.map(est => ({
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

    res.json({ ok: true, count: operaciones.length, bloqueadas: bloqueados.length, motivo: motivoFinal })
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

    const bloqueadas = await Asistencia.countDocuments({
      fichaId: { $in: idsBuscar },
      fecha,
      estado: 'Inhabilitada',
      subidoSofia: true
    })

    await Asistencia.deleteMany({
      fichaId: { $in: idsBuscar },
      fecha,
      estado: 'Inhabilitada',
      subidoSofia: { $ne: true }
    })

    res.json({ ok: true, message: 'Jornada reactivada exitosamente', bloqueadas })
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
    res.json({ ok: true, mensaje: 'Sincronización por Docente (regla 5 días hábiles) ejecutada con éxito', ...resultado })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

