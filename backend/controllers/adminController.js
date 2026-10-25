import Admin from '../models/Admin.js'
import { hashPassword } from '../services/passwordService.js'

export async function getPerfil(req, res) {
  try {
    const admin = await Admin.findById(req.usuario?.id).select('-password -codigoRecuperacion')
    if (!admin) return res.status(404).json({ error: 'Admin no encontrado' })
    res.json(admin)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function updatePerfil(req, res) {
  try {
    const { nombre, telefono, correo, password } = req.body
    const admin = await Admin.findById(req.usuario?.id)
    if (!admin) return res.status(404).json({ error: 'Admin no encontrado' })

    if (nombre !== undefined) admin.nombre = nombre
    if (telefono !== undefined) admin.telefono = telefono
    if (correo !== undefined) admin.correo = correo
    if (password) admin.password = await hashPassword(String(password))

    await admin.save()

    const perfil = admin.toObject()
    delete perfil.password
    res.json({ ok: true, perfil })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
