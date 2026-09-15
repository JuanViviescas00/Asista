import mongoose from 'mongoose'
import Clase from '../models/Clase.js'
import Ficha from '../models/Ficha.js'
import Dispositivo from '../models/Dispositivo.js'
import { emitirActivacion, emitirDesactivacion, emitirClaseActivada, emitirClaseDesactivada } from '../services/socketService.js'

export async function activar(req, res) {
  const { fichaId, instructorId } = req.body
  if (!fichaId || !instructorId) {
    return res.status(400).json({ success: false, error: 'fichaId e instructorId son requeridos' })
  }

  // El instructor solo puede activar clases a su nombre (identidad del JWT).
  if (String(req.usuario?.id) !== String(instructorId)) {
    return res.status(403).json({ success: false, error: 'No puedes activar una clase a nombre de otro instructor' })
  }

  try {
    // Resuelve el deviceId desde la asociación ficha→dispositivo (Ficha.dispositivoId).
    // Ya no se recibe deviceId en el body (asociación dispositivo↔ficha implementada).
    if (!mongoose.Types.ObjectId.isValid(String(fichaId))) {
      return res.status(400).json({ success: false, error: 'fichaId inválido' })
    }
    const ficha = await Ficha.findById(fichaId)
    if (!ficha) {
      return res.status(404).json({ success: false, error: 'Ficha no encontrada' })
    }
    if (!ficha.dispositivoId) {
      return res.status(400).json({
        success: false,
        error: 'Esta ficha no tiene un dispositivo asociado. Pide al administrador que la asigne desde Dispositivos.',
      })
    }

    // Ficha.dispositivoId es el ObjectId del documento Dispositivo (ref),
    // NO el campo deviceId (UUID string). Hay que resolver el documento para
    // obtener el UUID real que identifica al huellero en WebSocket.
    const dispositivo = await Dispositivo.findById(ficha.dispositivoId)
    if (!dispositivo) {
      return res.status(400).json({ success: false, error: 'Dispositivo asociado no encontrado' })
    }
    const deviceId = String(dispositivo.deviceId)

    // Operación atómica: upsert sobre la clase Activa de ese deviceId.
    // Evita la ventana de carrera de findOne + save/create (que podía crear
    // dos documentos Activa para el mismo dispositivo bajo concurrencia).
    const clase = await Clase.findOneAndUpdate(
      { deviceId, estado: 'Activa' },
      {
        $set: { fichaId, instructorId, iniciadaAt: new Date() },
        $setOnInsert: { deviceId, estado: 'Activa' },
      },
      { upsert: true, new: true }
    )

    const enviado = emitirActivacion(deviceId, {
      type: 'ACTIVATE',
      fichaId: String(ficha._id),
      instructorId,
      codigoFicha: ficha.codigoFicha,
    })

    emitirClaseActivada(String(ficha._id), {
      fichaId: String(ficha._id),
      instructorId: String(instructorId),
      iniciadaAt: clase.iniciadaAt,
    })

    res.json({ success: true, clase, enviadoPorWebSocket: enviado })
  } catch (err) {
    // Carrera real (rara): el índice parcial único rechazó un segundo insert casi
    // simultáneo de una clase Activa para el mismo deviceId.
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Ya hay una clase activándose para este dispositivo. Reintenta en un momento.',
      })
    }
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function finalizar(req, res) {
  const { fichaId, instructorId } = req.body
  if (!fichaId || !instructorId) {
    return res.status(400).json({ success: false, error: 'fichaId e instructorId son requeridos' })
  }

  // El instructor solo puede finalizar clases a su nombre (identidad del JWT).
  if (String(req.usuario?.id) !== String(instructorId)) {
    return res.status(403).json({ success: false, error: 'No puedes finalizar una clase a nombre de otro instructor' })
  }

  try {
    const clase = await Clase.findOne({ fichaId, instructorId, estado: 'Activa' })
    if (!clase) {
      return res.status(404).json({ success: false, error: 'No hay clase activa que finalizar para esa ficha e instructor' })
    }

    clase.estado = 'Finalizada'
    clase.finalizadaAt = new Date()
    await clase.save()

    const enviado = emitirDesactivacion(clase.deviceId, {
      type: 'DEACTIVATE',
      fichaId: String(clase.fichaId),
      instructorId: String(clase.instructorId),
    })

    emitirClaseDesactivada(String(clase.fichaId), {
      fichaId: String(clase.fichaId),
    })

    res.json({ success: true, clase, enviadoPorWebSocket: enviado })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function estado(req, res) {
  try {
    const clase = await Clase.findOne({ instructorId: req.usuario.id, estado: 'Activa' }).populate('fichaId')
    if (!clase) {
      return res.json({ activa: false, ficha: null, iniciadaAt: null })
    }
    res.json({
      activa: true,
      ficha: clase.fichaId || null,
      iniciadaAt: clase.iniciadaAt,
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}
