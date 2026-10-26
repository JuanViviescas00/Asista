import ConfiguracionSistema from '../models/ConfiguracionSistema.js'

const CLAVE_GENERAL = 'general'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function getCorreosReporte(req, res) {
  try {
    const config = await ConfiguracionSistema.findOne({ clave: CLAVE_GENERAL })
    res.json({
      correoCoordinador: config?.correoCoordinador || '',
      correoBienestar: config?.correoBienestar || '',
    })
  } catch (err) {
    console.error('Error al leer los correos de reporte:', err.message)
    res.status(500).json({ error: 'Error interno al leer la configuración.' })
  }
}

export async function updateCorreosReporte(req, res) {
  try {
    const { correoCoordinador, correoBienestar } = req.body || {}

    const normalizar = (valor) => String(valor ?? '').trim().toLowerCase()

    const coord = normalizar(correoCoordinador)
    if (coord && !EMAIL_REGEX.test(coord)) {
      return res.status(400).json({ error: 'El campo correoCoordinador debe ser un único correo válido o estar vacío.' })
    }

    const bien = normalizar(correoBienestar)
    if (bien && !EMAIL_REGEX.test(bien)) {
      return res.status(400).json({ error: 'El campo correoBienestar debe ser un único correo válido o estar vacío.' })
    }

    const config = await ConfiguracionSistema.findOneAndUpdate(
      { clave: CLAVE_GENERAL },
      {
        $set: {
          correoCoordinador: coord,
          correoBienestar: bien,
          actualizadoPor: { id: req.usuario?.id, rol: req.usuario?.rol },
        },
        $setOnInsert: { clave: CLAVE_GENERAL },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    )

    res.json({
      correoCoordinador: config.correoCoordinador,
      correoBienestar: config.correoBienestar,
    })
  } catch (err) {
    console.error('Error al guardar los correos de reporte:', err.message)
    res.status(500).json({ error: 'Error interno al guardar la configuración.' })
  }
}
