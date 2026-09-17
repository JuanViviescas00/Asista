import Estudiante from '../models/Estudiante.js'

export async function guardarTemplate(req, res) {
  const { estudianteId, fichaId, dedo, template } = req.body
  if (!estudianteId || !fichaId || !template) {
    return res.status(400).json({ success: false, error: 'estudianteId, fichaId y template son requeridos' })
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
      huellaTemplate: template,
    })

    if (otro) {
      return res.status(409).json({
        success: false,
        error: `Esta huella ya está registrada a nombre de "${otro.nombres} ${otro.apellidos}" (${otro.tipoDocumento} ${otro.numeroDocumento})`,
      })
    }

    estudiante.huellaEnrolada = true
    estudiante.huellaTemplate = template
    estudiante.dedoEnrolado = dedo || ''
    estudiante.fechaEnrolamiento = new Date().toISOString().split('T')[0]
    await estudiante.save()

    res.json({ success: true, message: 'Huella guardada correctamente' })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error al guardar: ' + err.message })
  }
}
