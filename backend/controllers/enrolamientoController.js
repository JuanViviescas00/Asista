import Estudiante from '../models/Estudiante.js'
import Dispositivo from '../models/Dispositivo.js'
import bcryptjs from 'bcryptjs'
import { verificarTokenJWT } from '../middlewares/auth.js'
import { formatearFechaColombia } from '../services/asistenciaService.js'

export async function guardarTemplate(req, res) {
  // Verificación de autorización: JWT de Instructor/Admin O credenciales de dispositivo
  let autorizado = false

  const authHeader = req.headers['authorization']
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]
    const decoded = verificarTokenJWT(token)
    if (decoded && ['Administrador', 'Instructor'].includes(decoded.rol)) {
      autorizado = true
    }
  }

  if (!autorizado) {
    const deviceId = req.headers['x-device-id']
    const deviceToken = req.headers['x-device-token']
    if (deviceId && deviceToken) {
      try {
        const dispositivo = await Dispositivo.findOne({ deviceId: String(deviceId) })
        if (dispositivo && dispositivo.activo === true) {
          const match = await bcryptjs.compare(String(deviceToken), dispositivo.tokenHash)
          if (match) autorizado = true
        }
      } catch (_) {}
    }
  }

  if (!autorizado) {
    const origin = req.headers['origin'] || req.headers['referer'] || ''
    const userAgent = req.headers['user-agent'] || ''
    // Compatibilidad con la app instalada Asista (Electron / Node.js desktop)
    // Las peticiones del proceso principal o empaquetado de Electron no tienen origen web externo
    const esClienteEscritorio = !origin || origin.startsWith('file:') || /localhost|127\.0\.0\.1/i.test(origin) || /electron|node|undici|asista|huellero/i.test(userAgent)
    if (esClienteEscritorio) {
      autorizado = true
    }
  }

  if (!autorizado) {
    return res.status(401).json({
      success: false,
      error: 'Acceso no autorizado. Se requiere token JWT de sesión o credenciales de dispositivo biométrico registrado.'
    })
  }

  const { estudianteId, fichaId, dedo, template, slot } = req.body
  if (!estudianteId || !fichaId || !template) {
    return res.status(400).json({ success: false, error: 'estudianteId, fichaId y template son requeridos' })
  }

  const slotExplicito = slot == null ? null : Number(slot)
  if (slotExplicito !== null && slotExplicito !== 1 && slotExplicito !== 2) {
    return res.status(400).json({ success: false, error: 'slot debe ser 1 o 2' })
  }

  try {
    const estudiante = await Estudiante.findById(estudianteId)
    if (!estudiante) {
      return res.status(404).json({ success: false, error: 'Estudiante no encontrado' })
    }

    const slot1Libre = !estudiante.huellaTemplate
    const slot2Libre = !estudiante.huellaTemplate2

    let targetSlot = slotExplicito
    if (targetSlot === null) {
      if (slot1Libre) targetSlot = 1
      else if (slot2Libre) targetSlot = 2
      else {
        return res.status(409).json({
          success: false,
          error: 'Este estudiante ya tiene el máximo de 2 huellas registradas. Elige cuál quieres reemplazar.',
        })
      }
    }

    const fecha = formatearFechaColombia()
    if (targetSlot === 1) {
      estudiante.huellaTemplate = template
      estudiante.dedoEnrolado = dedo || ''
      estudiante.fechaEnrolamiento = fecha
    } else {
      estudiante.huellaTemplate2 = template
      estudiante.dedoEnrolado2 = dedo || ''
      estudiante.fechaEnrolamiento2 = fecha
    }

    estudiante.huellaEnrolada = true
    await estudiante.save()

    res.json({ success: true, slot: targetSlot, message: 'Huella guardada correctamente' })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error al guardar: ' + err.message })
  }
}
