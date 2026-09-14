import Ficha from '../models/Ficha.js'
import Estudiante from '../models/Estudiante.js'
import Dispositivo from '../models/Dispositivo.js'
import mongoose from 'mongoose'
import bcryptjs from 'bcryptjs'

export async function getFichas(req, res) {
  try {
    const { instructorId } = req.query
    const filter = {}
    if (instructorId) {
      filter.$or = [
        { instructorLiderId: instructorId },
        { instructores: instructorId }
      ]
    }
    const fichas = await Ficha.find(filter)
      .populate('instructorLiderId', 'nombres apellidos correo')
      .populate('instructores', 'nombres apellidos correo')
      .sort({ createdAt: -1 })
    res.json(fichas)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getMisFichas(req, res) {
  try {
    const { instructorId } = req.params
    const fichas = await Ficha.find({
      $or: [
        { instructorLiderId: instructorId },
        { instructores: instructorId }
      ]
    })
      .populate('instructorLiderId', 'nombres apellidos correo')
      .populate('instructores', 'nombres apellidos correo')
      .sort({ createdAt: -1 })

    const resultado = fichas.map(f => {
      const liderIdStr = f.instructorLiderId ? String(f.instructorLiderId._id || f.instructorLiderId) : ''
      const esLider = liderIdStr === String(instructorId)
      return {
        ...f.toObject(),
        esLider
      }
    })

    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getPlantillasFicha(req, res) {
  try {
    const { id } = req.params
    const deviceId = req.headers['x-device-id']
    const token = req.headers['x-device-token']

    // Autenticación del dispositivo (mismo patrón que POST /api/asistencias/sync
    // y el HELLO del WebSocket): deviceId + token contra tokenHash con bcryptjs.
    // No usa JWT de usuario porque quien llama es la app local del huellero.
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

    // Resuelve el id (ObjectId o codigoFicha) a los posibles valores de fichaId
    // que puede tener un Estudiante (campo Mixed), igual que el resto del backend.
    const idsBuscar = [id]
    if (mongoose.Types.ObjectId.isValid(id)) {
      idsBuscar.push(new mongoose.Types.ObjectId(id))
    }
    try {
      const queryFicha = []
      if (mongoose.Types.ObjectId.isValid(id)) queryFicha.push({ _id: id })
      queryFicha.push({ codigoFicha: String(id).trim() })
      const fichaDoc = await Ficha.findOne({ $or: queryFicha })
      if (fichaDoc) {
        idsBuscar.push(fichaDoc._id)
        if (fichaDoc.codigoFicha) idsBuscar.push(fichaDoc.codigoFicha)
      }
    } catch (_) {
      // ignorar: seguimos con el id tal cual llegó
    }

    const estudiantes = await Estudiante.find({
      fichaId: { $in: idsBuscar },
      estado: 'Activo',
      huellaEnrolada: true,
      huellaTemplate: { $ne: '' },
    }).select('nombres apellidos huellaTemplate')

    // Formato mínimo que consume el huellero (verify.js → toEngineRecord):
    // { estudianteId, nombres, apellidos, template }
    const plantillas = estudiantes.map((e) => ({
      estudianteId: String(e._id),
      nombres: e.nombres,
      apellidos: e.apellidos,
      template: e.huellaTemplate,
    }))

    res.json(plantillas)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createFicha(req, res) {
  try {
    if (req.body.instructorLiderId) {
      const otraFicha = await Ficha.findOne({ instructorLiderId: req.body.instructorLiderId })
      if (otraFicha) {
        return res.status(409).json({
          error: `Este instructor ya es líder de la ficha ${otraFicha.codigoFicha}. Un instructor solo puede ser líder de una ficha a la vez.`,
        })
      }
    }

    const ficha = new Ficha(req.body)
    await ficha.save()
    const populated = await ficha
      .populate('instructorLiderId', 'nombres apellidos correo')
    await populated.populate('instructores', 'nombres apellidos correo')
    res.status(201).json(populated)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function updateFicha(req, res) {
  try {
    if (req.body.instructorLiderId) {
      const otraFicha = await Ficha.findOne({
        instructorLiderId: req.body.instructorLiderId,
        _id: { $ne: req.params.id },
      })
      if (otraFicha) {
        return res.status(409).json({
          error: `Este instructor ya es líder de la ficha ${otraFicha.codigoFicha}. Un instructor solo puede ser líder de una ficha a la vez.`,
        })
      }
    }

    const ficha = await Ficha.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('instructorLiderId', 'nombres apellidos correo')
      .populate('instructores', 'nombres apellidos correo')
    if (!ficha) return res.status(404).json({ error: 'Ficha no encontrada' })
    res.json(ficha)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function deleteFicha(req, res) {
  try {
    const ficha = await Ficha.findByIdAndDelete(req.params.id)
    if (!ficha) return res.status(404).json({ error: 'Ficha no encontrada' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function importarFichas(req, res) {
  try {
    const { fichas } = req.body
    if (!fichas || !Array.isArray(fichas)) {
      return res.status(400).json({ error: 'Se requiere un array de fichas' })
    }
    const result = await Ficha.insertMany(fichas)
    res.status(201).json({ ok: true, count: result.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
