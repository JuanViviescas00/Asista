import crypto from 'crypto'
import bcryptjs from 'bcryptjs'
import mongoose from 'mongoose'
import Dispositivo from '../models/Dispositivo.js'
import Ficha from '../models/Ficha.js'
import { desconectarDispositivo } from '../services/socketService.js'

export async function registrar(req, res) {
  try {
    const { nombre, hardwareFingerprint, hostname } = req.body

    const deviceId = crypto.randomUUID()
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = await bcryptjs.hash(token, 10)

    // Hash de identidad (SHA-256) del MachineGuid, NO una contraseña:
    // solo necesitamos comparar por igualdad, así que SHA-256 es correcto y rápido.
    const hardwareFingerprintHash = hardwareFingerprint
      ? crypto.createHash('sha256').update(String(hardwareFingerprint)).digest('hex')
      : null

    // Los dispositivos se registran como PENDIENTES de aprobación:
    // activo=false y aprobadoEn=null hasta que el Admin los apruebe.
    await Dispositivo.create({
      deviceId,
      tokenHash,
      hardwareFingerprintHash,
      hostname: hostname || null,
      nombre: nombre || '',
      activo: false,
      aprobadoEn: null,
    })

    // Este es el ÚNICO momento en que el token viaja en texto plano:
    // el backend lo entrega aquí y nunca vuelve a exponerlo ni puede recuperarlo;
    // a futuro solo puede compararse contra tokenHash (bcryptjs).
    res.status(201).json({ deviceId, token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getDispositivos(req, res) {
  try {
    const dispositivos = await Dispositivo.find().sort({ createdAt: -1 })
    const resultado = []
    for (const d of dispositivos) {
      const obj = d.toObject()
      delete obj.tokenHash
      delete obj.hardwareFingerprintHash
      const fichas = await Ficha.find({ dispositivoId: d._id }).select('codigoFicha nombrePrograma jornada aulaAsignada')
      resultado.push({ ...obj, fichas })
    }
    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function asociarFichas(req, res) {
  try {
    const { id } = req.params
    const { fichaIds } = req.body

    const dispositivo = await Dispositivo.findById(id)
    if (!dispositivo) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' })
    }

    if (!Array.isArray(fichaIds)) {
      return res.status(400).json({ error: 'fichaIds debe ser un array' })
    }

    const idsValidos = fichaIds.filter((fid) => mongoose.Types.ObjectId.isValid(String(fid)))

    // El array recibido es el estado FINAL completo para este dispositivo:
    // 1) asocia las fichas que vienen (si apuntaban a otro dispositivo, se mueven);
    if (idsValidos.length > 0) {
      await Ficha.updateMany(
        { _id: { $in: idsValidos } },
        { $set: { dispositivoId: id } }
      )
    }

    // 2) desasocia las que ya no vienen en la lista (quedan sin dispositivo).
    //    ($nin: [] coincide con todo, así que un array vacío desasocia todas.)
    await Ficha.updateMany(
      { dispositivoId: id, _id: { $nin: idsValidos } },
      { $set: { dispositivoId: null } }
    )

    const fichas = await Ficha.find({ dispositivoId: id }).select('codigoFicha nombrePrograma jornada aulaAsignada')
    const obj = dispositivo.toObject()
    delete obj.tokenHash
    delete obj.hardwareFingerprintHash
    res.json({ ok: true, dispositivo: obj, fichas })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function resetFingerprint(req, res) {
  try {
    const { id } = req.params
    const dispositivo = await Dispositivo.findById(id)
    if (!dispositivo) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' })
    }

    dispositivo.hardwareFingerprintHash = null
    await dispositivo.save()

    res.json({ ok: true, message: 'Identidad de hardware reseteada. El dispositivo la re-adoptará en su próxima conexión.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function aprobar(req, res) {
  try {
    const { id } = req.params
    const dispositivo = await Dispositivo.findById(id)
    if (!dispositivo) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' })
    }

    dispositivo.activo = true
    dispositivo.aprobadoEn = new Date()
    await dispositivo.save()

    res.json({ ok: true, message: 'Dispositivo aprobado.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function deshabilitar(req, res) {
  try {
    const { id } = req.params
    const dispositivo = await Dispositivo.findById(id)
    if (!dispositivo) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' })
    }

    // activo=false sin tocar aprobadoEn: así se distingue de un "pendiente nuevo"
    // (aprobadoEn:null) en el HELLO.
    dispositivo.activo = false
    await dispositivo.save()

    // Si está conectado en este momento, desconéctalo al instante (el kiosko
    // mostrará "Este equipo fue deshabilitado por el administrador").
    desconectarDispositivo(dispositivo.deviceId)

    res.json({ ok: true, message: 'Dispositivo deshabilitado.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function eliminar(req, res) {
  try {
    const { id } = req.params
    const dispositivo = await Dispositivo.findById(id)
    if (!dispositivo) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' })
    }

    // Rechazar = eliminar el documento completo (el dispositivo podrá re-registrarse).
    await Dispositivo.deleteOne({ _id: id })

    res.json({ ok: true, message: 'Dispositivo rechazado y eliminado.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
