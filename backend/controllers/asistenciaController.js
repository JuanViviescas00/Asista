import Asistencia from '../models/Asistencia.js'
import Inasistencia from '../models/Inasistencia.js'
import Jornada from '../models/Jornada.js'
import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'
import Instructor from '../models/Instructor.js'
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
    const jornadaFilter = {}
    const jornadaInhabFilter = { inhabilitada: true }

    if (fichaId) {
      const idsBuscar = await getFichaIdList(fichaId)
      filter.fichaId = { $in: idsBuscar }
      jornadaFilter.fichaId = { $in: idsBuscar }
      jornadaInhabFilter.fichaId = { $in: idsBuscar }
    }
    if (estudianteId) {
      filter.estudianteId = estudianteId
      jornadaFilter['presentes.estudianteId'] = estudianteId
    }
    if (fecha) {
      filter.fecha = fecha
      jornadaFilter.fecha = fecha
      jornadaInhabFilter.fecha = fecha
    }
    if (fechaDesde || fechaHasta) {
      filter.fecha = {}
      jornadaFilter.fecha = {}
      jornadaInhabFilter.fecha = {}
      if (fechaDesde) {
        filter.fecha.$gte = fechaDesde
        jornadaFilter.fecha.$gte = fechaDesde
        jornadaInhabFilter.fecha.$gte = fechaDesde
      }
      if (fechaHasta) {
        filter.fecha.$lte = fechaHasta
        jornadaFilter.fecha.$lte = fechaHasta
        jornadaInhabFilter.fecha.$lte = fechaHasta
      }
    }

    const inasistencias = await Inasistencia.find(filter)
      .populate('estudianteId')
      .populate('instructorId')
      .sort({ fecha: 1, createdAt: 1 })

    // Claves (ficha|fecha|estudiante) que ya tienen novedad registrada.
    const conNovedad = new Set(
      inasistencias.map((a) => `${String(a.fichaId)}|${a.fecha}|${String(a.estudianteId?._id || a.estudianteId)}`)
    )

    // Sintetizar registros 'Presente' desde Jornada.presentes (solo si ese aprendiz
    // NO tiene Inasistencia ese día). Así el panel vuelve a mostrar la hora de marcación.
    const jornadas = await Jornada.find(jornadaFilter)
      .populate('instructorId')
      .populate('presentes.estudianteId')
      .populate('presentes.instructorId')

    const sintetizados = []
    for (const jornada of jornadas) {
      if (jornada.inhabilitada) continue
      const jFicha = String(jornada.fichaId)
      for (const p of (jornada.presentes || [])) {
        const estId = String(p.estudianteId?._id || p.estudianteId)
        if (!estId) continue
        if (estudianteId && estId !== String(estudianteId)) continue
        if (conNovedad.has(`${jFicha}|${jornada.fecha}|${estId}`)) continue
        sintetizados.push({
          _id: `presente-${String(jornada._id)}-${estId}`,
          estudianteId: p.estudianteId,
          fichaId: jornada.fichaId,
          fecha: jornada.fecha,
          estado: 'Presente',
          hora: p.hora || '',
          horasTardanza: 0,
          tiempoTardanza: '0 horas',
          metodo: p.metodo || 'HUELLA',
          origen: 'huellero',
          instructorId: p.instructorId || jornada.instructorId || null,
          subidoSofia: false,
          estadoCarga: null,
          motivoInhabilitacion: '',
        })
      }
    }

    // Sintetizar 'Inhabilitada' para cada aprendiz activo de una jornada inhabilitada.
    // No se persisten filas por aprendiz: se derivan de Jornada.inhabilitada.
    const jornadasInhabilitadas = await Jornada.find(jornadaInhabFilter)
      .populate('instructorId')

    const inhabilitados = []
    if (jornadasInhabilitadas.length > 0) {
      const fichaIdsInhab = [...new Set(jornadasInhabilitadas.map((j) => String(j.fichaId)))]
      const aprendices = await Estudiante.find({
        fichaId: { $in: fichaIdsInhab },
        estado: { $ne: 'Retirado' },
      }).select('_id fichaId')

      const aprendicesPorFicha = new Map()
      for (const a of aprendices) {
        const fk = String(a.fichaId)
        if (!aprendicesPorFicha.has(fk)) aprendicesPorFicha.set(fk, [])
        aprendicesPorFicha.get(fk).push(a)
      }

      for (const j of jornadasInhabilitadas) {
        const jFicha = String(j.fichaId)
        for (const a of (aprendicesPorFicha.get(jFicha) || [])) {
          const estId = String(a._id)
          if (estudianteId && estId !== String(estudianteId)) continue
          if (conNovedad.has(`${jFicha}|${j.fecha}|${estId}`)) continue
          inhabilitados.push({
            _id: `inhabilitada-${String(j._id)}-${estId}`,
            estudianteId: a._id,
            fichaId: j.fichaId,
            fecha: j.fecha,
            estado: 'Inhabilitada',
            hora: '—',
            horasTardanza: 0,
            tiempoTardanza: '0 horas',
            metodo: null,
            origen: null,
            instructorId: j.instructorId || null,
            subidoSofia: false,
            estadoCarga: null,
            motivoInhabilitacion: j.motivoInhabilitacion || 'Jornada no impartida',
          })
        }
      }
    }

    const todos = [...inasistencias.map(toAsistenciaShape), ...sintetizados, ...inhabilitados]
    todos.sort((a, b) => {
      if (a.fecha < b.fecha) return -1
      if (a.fecha > b.fecha) return 1
      const ha = a.hora || ''
      const hb = b.hora || ''
      if (ha < hb) return -1
      if (ha > hb) return 1
      return 0
    })

    res.json(todos)
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

// Procesa una única asistencia del batch de sincronización del huellero. Devuelve
// { uuid, estado: 'guardada'|'duplicada'|'error', error? } sin lanzar excepciones,
// para que un fallo individual no tumbe el resto del batch.
export async function procesarAsistencia(item) {
  const { uuid, estudianteId, fichaId, instructorId, timestamp, metodo } = item || {}

  if (!uuid) {
    return { uuid: uuid || null, estado: 'error', error: 'uuid es requerido' }
  }
  if (!estudianteId || !fichaId) {
    return { uuid, estado: 'error', error: 'estudianteId y fichaId son requeridos' }
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
  let claseIdObj = null

  if (claseDoc?.iniciadaAt) {
    const resultado = calcularEstadoAsistencia(claseDoc.iniciadaAt, dateObj)
    estado = resultado.estado
    horasTardanza = resultado.horasTardanza
    tiempoTardanza = resultado.tiempoTardanza
    claseIdObj = claseDoc._id
  } else {
    // Fallback: horario fijo de jornada (ficha sin Clase nunca activada).
    const resultado = calcularTardanzaEscalonada(ficha.jornada, dateObj)
    estado = resultado.estado
    horasTardanza = estado === 'Falta' ? 0 : resultado.horas
    tiempoTardanza = `${horasTardanza} ${horasTardanza === 1 ? 'hora' : 'horas'}`
  }

  // Idempotencia por uuid (Jornada.presentes.uuid o Inasistencia.uuid).
  const [enJornada, enInasistencia] = await Promise.all([
    Jornada.findOne({ 'presentes.uuid': uuid }).catch(() => null),
    Inasistencia.findOne({ uuid }).catch(() => null),
  ])
  if (enJornada || enInasistencia) {
    return { uuid, estado: 'duplicada' }
  }

  try {
    // Asegurar la Jornada (origen huellero) para esta ficha y fecha.
    await asegurarJornada({ fichaId: ficha._id, fecha, instructorId: instructorId || null, origen: 'huellero' })

    if (estado === 'Presente') {
      return procesarPresente({ uuid, estudianteId, fichaId: ficha._id, fecha, hora, claseIdObj, instructorId, metodo })
    }

    // Tardanza o Falta
    const tipo = estado
    const horas = estado === 'Tardanza' ? horasTardanza : topeHorasPorJornada(ficha.jornada)

    const festivosDocs = await DiaFestivo.find().select('fecha').catch(() => [])
    const festivosSet = new Set((festivosDocs || []).map((d) => d.fecha))
    const estadoCarga = calcularEstadoCarga({ fecha, tipo, jornada: ficha.jornada || '', festivosSet, hoyStr: getHoyString() })

    return procesarNovedad({ uuid, estudianteId, fichaId: ficha._id, fecha, tipo, horas, hora, tiempoTardanza, claseIdObj, instructorId, estadoCarga })
  } catch (err) {
    return { uuid, estado: 'error', error: err.message }
  }
}

async function procesarPresente({ uuid, estudianteId, fichaId, fecha, hora, claseIdObj, instructorId, metodo }) {
  try {
    const res = await Jornada.updateOne(
      { fichaId, fecha, 'presentes.estudianteId': { $ne: estudianteId } },
      {
        $push: {
          presentes: {
            estudianteId,
            hora,
            uuid,
            claseId: claseIdObj || null,
            instructorId: instructorId || null,
            metodo: metodo === 'MANUAL' ? 'MANUAL' : 'HUELLA',
          },
        },
      }
    )
    if (!res.modifiedCount) {
      const yaPresente = await Jornada.exists({ fichaId, fecha, 'presentes.estudianteId': estudianteId })
      if (yaPresente) {
        return { uuid, estado: 'duplicada' }
      }
      return { uuid, estado: 'error', error: 'No se pudo registrar el presente' }
    }

    // Marcación tardía: si el cierre ya creó una Falta huellero no SUBIDA, se borra
    // (el aprendiz sí asistió). No se toca una Falta manual, una Excusada ni una Tardanza.
    try {
      await Inasistencia.deleteOne({
        estudianteId,
        fichaId,
        fecha,
        tipo: 'Falta',
        origen: 'huellero',
        estadoCarga: { $ne: 'SUBIDA' },
      })
    } catch (err) {
      console.error(`[procesarPresente] Error al borrar la Falta tardía (uuid ${uuid}, estudiante ${estudianteId}, ficha ${fichaId}, fecha ${fecha}):`, err.message)
    }

    return { uuid, estado: 'guardada' }
  } catch (err) {
    if (err?.code === 11000) return { uuid, estado: 'duplicada' }
    return { uuid, estado: 'error', error: err.message }
  }
}

async function procesarNovedad({ uuid, estudianteId, fichaId, fecha, tipo, horas, hora, tiempoTardanza, claseIdObj, instructorId, estadoCarga }) {
  const existente = await Inasistencia.findOne({ estudianteId, fichaId, fecha }).catch(() => null)

  if (existente) {
    // Reemplazo Falta-huellero -> Tardanza (marcación con retraso que corrige el cierre).
    if (tipo === 'Tardanza' && existente.tipo === 'Falta' && existente.origen === 'huellero' && existente.estadoCarga !== 'SUBIDA') {
      try {
        existente.tipo = 'Tardanza'
        existente.horas = horas
        existente.hora = hora
        existente.tiempoTardanza = tiempoTardanza
        existente.uuid = uuid
        existente.claseId = claseIdObj || null
        existente.estadoCarga = estadoCarga
        await existente.save()
        return { uuid, estado: 'guardada' }
      } catch (err) {
        if (err?.code === 11000) return { uuid, estado: 'duplicada' }
        return { uuid, estado: 'error', error: err.message }
      }
    }
    // Cualquier otra novedad existente: no se modifica.
    return { uuid, estado: 'duplicada' }
  }

  try {
    const doc = await Inasistencia.findOneAndUpdate(
      { estudianteId, fichaId, fecha },
      {
        $setOnInsert: {
          uuid,
          estudianteId,
          fichaId,
          fecha,
          tipo,
          horas,
          hora,
          tiempoTardanza,
          instructorId: instructorId || null,
          claseId: claseIdObj || null,
          origen: 'huellero',
          estadoCarga,
        },
      },
      { upsert: true, new: true }
    )

    if (doc && String(doc.uuid) === String(uuid)) {
      return { uuid, estado: 'guardada' }
    }
    return { uuid, estado: 'duplicada' }
  } catch (err) {
    if (err?.code === 11000) return { uuid, estado: 'duplicada' }
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
    const fichaDoc = await Ficha.findOne({ $or: [{ _id: mongoose.Types.ObjectId.isValid(fichaId) ? fichaId : null }, { codigoFicha: String(fichaId).trim() }] })
    const motivoFinal = motivo || 'Jornada no impartida / Actividad institucional'

    // Novedades ya reportadas a Sofía Plus: se conservan (no se borran ni sobrescriben).
    const subidas = await Inasistencia.find({
      fichaId: { $in: idsBuscar },
      fecha,
      estadoCarga: 'SUBIDA'
    }).select('estudianteId')

    // 1. Marcar la jornada como inhabilitada (un solo documento por ficha + fecha).
    await Jornada.findOneAndUpdate(
      { fichaId: fichaDoc?._id || fichaId, fecha },
      {
        $set: { inhabilitada: true, motivoInhabilitacion: motivoFinal, instructorId: instructorId || null },
        $setOnInsert: { fichaId: fichaDoc?._id || fichaId, fecha, origen: 'manual' }
      },
      { upsert: true, new: true }
    )

    // 2. Borrar las novedades NO 'SUBIDA' de esa ficha + fecha (antes se sobrescribían con 'Inhabilitada').
    const borradas = await Inasistencia.deleteMany({
      fichaId: { $in: idsBuscar },
      fecha,
      estadoCarga: { $ne: 'SUBIDA' }
    })

    res.json({ ok: true, count: borradas.deletedCount || 0, bloqueadas: subidas.length, motivo: motivoFinal })
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
    const fichaDoc = await Ficha.findOne({ $or: [{ _id: mongoose.Types.ObjectId.isValid(fichaId) ? fichaId : null }, { codigoFicha: String(fichaId).trim() }] })

    const bloqueadas = await Inasistencia.countDocuments({
      fichaId: { $in: idsBuscar },
      fecha,
      estadoCarga: 'SUBIDA'
    })

    await Jornada.findOneAndUpdate(
      { fichaId: fichaDoc?._id || fichaId, fecha },
      { $set: { inhabilitada: false, motivoInhabilitacion: '' } },
      { new: true }
    )

    res.json({ ok: true, message: 'Jornada reactivada exitosamente', bloqueadas })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}


export async function obtenerTodasAsistenciasConsolidadas() {
  const [inasistencias, jornadas] = await Promise.all([
    Inasistencia.find().populate('estudianteId').populate('fichaId').populate('instructorId'),
    Jornada.find().populate('fichaId').populate('instructorId').populate('presentes.estudianteId').populate('presentes.instructorId')
  ])

  const rows = []
  const marcasRegistradas = new Set()

  for (const a of inasistencias) {
    if (!a.estudianteId || !a.fichaId) continue
    const key = `${String(a.fichaId._id || a.fichaId)}|${a.fecha}|${String(a.estudianteId._id || a.estudianteId)}`
    marcasRegistradas.add(key)
    rows.push({
      fichaDoc: a.fichaId,
      estudianteDoc: a.estudianteId,
      instructorDoc: a.instructorId,
      fichaCodigo: a.fichaId.codigoFicha || String(a.fichaId._id || a.fichaId),
      nombrePrograma: a.fichaId.nombrePrograma || '',
      jornada: a.fichaId.jornada || '',
      documentoAprendiz: a.estudianteId.numeroDocumento || '',
      nombreAprendiz: `${a.estudianteId.nombres || ''} ${a.estudianteId.apellidos || ''}`.trim(),
      correoAprendiz: a.estudianteId.correo || '',
      fecha: a.fecha,
      estado: a.tipo,
      hora: a.hora || '—',
      horasTardanza: a.tipo === 'Tardanza' ? (a.horas || 0) : 0,
      tiempoTardanza: a.tiempoTardanza || '0 horas',
      estadoCarga: a.estadoCarga || 'EN_ESPERA'
    })
  }

  for (const j of jornadas) {
    if (!j.fichaId) continue
    for (const p of (j.presentes || [])) {
      if (!p.estudianteId) continue
      const estId = String(p.estudianteId._id || p.estudianteId)
      const key = `${String(j.fichaId._id || j.fichaId)}|${j.fecha}|${estId}`
      if (marcasRegistradas.has(key)) continue
      marcasRegistradas.add(key)
      rows.push({
        fichaDoc: j.fichaId,
        estudianteDoc: p.estudianteId,
        instructorDoc: p.instructorId || j.instructorId,
        fichaCodigo: j.fichaId.codigoFicha || String(j.fichaId._id || j.fichaId),
        nombrePrograma: j.fichaId.nombrePrograma || '',
        jornada: j.fichaId.jornada || '',
        documentoAprendiz: p.estudianteId.numeroDocumento || '',
        nombreAprendiz: `${p.estudianteId.nombres || ''} ${p.estudianteId.apellidos || ''}`.trim(),
        correoAprendiz: p.estudianteId.correo || '',
        fecha: j.fecha,
        estado: 'Presente',
        hora: p.hora || '—',
        horasTardanza: 0,
        tiempoTardanza: '0 horas',
        estadoCarga: 'EN_ESPERA'
      })
    }
  }

  return rows
}

export async function downloadSqlite(req, res) {
  try {
    const filePath = getSqliteFilePath()
    const rows = await obtenerTodasAsistenciasConsolidadas()
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
    const rows = await obtenerTodasAsistenciasConsolidadas()
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

