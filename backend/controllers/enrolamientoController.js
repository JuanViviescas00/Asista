import Estudiante from '../models/Estudiante.js'

export async function guardarTemplate(req, res) {
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

    // Validación de duplicado exacto en base de datos
    const otro = await Estudiante.findOne({
      _id: { $ne: estudianteId },
      huellaEnrolada: true,
      $or: [
        { huellaTemplate: { $ne: '' } },
        { huellaTemplate2: { $ne: '' } },
      ],
    })

    if (otro) {
      return res.status(409).json({
        success: false,
        error: `Esta huella ya está registrada a nombre de "${otro.nombres} ${otro.apellidos}" (${otro.tipoDocumento} ${otro.numeroDocumento})`,
      })
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

    const fecha = new Date().toISOString().split('T')[0]
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
