import DiaFestivo from '../models/DiaFestivo.js'

export async function getDiasFestivos(req, res) {
  try {
    const { anio } = req.query
    const filter = {}
    if (anio) filter.anio = Number(anio)
    const dias = await DiaFestivo.find(filter)
      .populate('fichasSeleccionadas', 'codigoFicha nombrePrograma')
      .sort({ fecha: 1 })
    res.json(dias)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createDiaFestivo(req, res) {
  try {
    const dia = new DiaFestivo(req.body)
    await dia.save()
    res.status(201).json(dia)
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Ya existe un día inhabilitado o festivo registrado para esta fecha.' })
    }
    res.status(500).json({ error: err.message })
  }
}

export async function updateDiaFestivo(req, res) {
  try {
    const diaAnterior = await DiaFestivo.findById(req.params.id)
    if (!diaAnterior) return res.status(404).json({ error: 'Día inhabilitado no encontrado' })

    const dia = await DiaFestivo.findByIdAndUpdate(req.params.id, req.body, { new: true })
    res.json(dia)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function deleteDiaFestivo(req, res) {
  try {
    const dia = await DiaFestivo.findByIdAndDelete(req.params.id)
    if (!dia) return res.status(404).json({ error: 'Día inhabilitado no encontrado' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function importarDiasFestivos(req, res) {
  try {
    const { dias } = req.body
    if (!dias || !Array.isArray(dias)) {
      return res.status(400).json({ error: 'Se requiere un array de días' })
    }
    const result = await DiaFestivo.insertMany(dias)
    res.status(201).json({ ok: true, count: result.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
