import Instructor from '../models/Instructor.js'
import Ficha from '../models/Ficha.js'
import { hashPassword } from '../services/passwordService.js'

export async function getInstructores(req, res) {
  try {
    const instructores = await Instructor.find().sort({ createdAt: -1 })
    const fichasLideres = await Ficha.find({ instructorLiderId: { $ne: null } })
    const idsLideres = new Set(fichasLideres.map(f => String(f.instructorLiderId)))

    const resultado = instructores.map(inst => {
      const obj = inst.toObject()
      delete obj.password // No exponer el hash en la respuesta
      const esLiderEnFicha = idsLideres.has(String(inst._id))
      return {
        ...obj,
        esLider: !!(inst.esLider || esLiderEnFicha)
      }
    })

    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createInstructor(req, res) {
  try {
    const data = { ...req.body }
    const clavePlana = data.password || 'sena2026'
    data.password = await hashPassword(clavePlana)

    const instructor = new Instructor(data)
    await instructor.save()

    const obj = instructor.toObject()
    delete obj.password
    res.status(201).json(obj)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function updateInstructor(req, res) {
  try {
    const data = { ...req.body }
    if (data.password) {
      data.password = await hashPassword(data.password)
    } else {
      delete data.password
    }

    const instructor = await Instructor.findByIdAndUpdate(req.params.id, data, { new: true })
    if (!instructor) return res.status(404).json({ error: 'Instructor no encontrado' })

    const obj = instructor.toObject()
    delete obj.password
    res.json(obj)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function deleteInstructor(req, res) {
  try {
    const instructor = await Instructor.findByIdAndDelete(req.params.id)
    if (!instructor) return res.status(404).json({ error: 'Instructor no encontrado' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function importarInstructores(req, res) {
  try {
    const { instructores } = req.body
    if (!instructores || !Array.isArray(instructores)) {
      return res.status(400).json({ error: 'Se requiere un array de instructores' })
    }

    let creados = 0
    let actualizados = 0
    let errores = 0

    for (const inst of instructores) {
      try {
        const { fichaId, fichas, esLider, password, ...rest } = inst
        if (!rest.rol) rest.rol = 'Instructor'

        const existe = await Instructor.findOne({
          $or: [
            { numeroDocumento: String(rest.numeroDocumento).trim() },
            { correo: rest.correo }
          ]
        })

        let instructor
        if (!existe) {
          const clavePlana = password || 'sena2026'
          const passwordHash = await hashPassword(clavePlana)
          instructor = await Instructor.create({
            ...rest,
            password: passwordHash
          })
          creados++
        } else {
          const datos = { ...rest }
          if (password) {
            datos.password = await hashPassword(password)
          }
          instructor = await Instructor.findByIdAndUpdate(existe._id, datos, { new: true })
          actualizados++
        }

        // Normalizar lista de fichas
        let listaFichas = []
        if (Array.isArray(fichas) && fichas.length > 0) {
          listaFichas = fichas
        } else if (fichaId) {
          listaFichas = [{ fichaId, esLider: !!esLider }]
        }

        for (const item of listaFichas) {
          const targetFichaId = item.fichaId || item
          const esLiderFicha = item.esLider !== undefined ? item.esLider : esLider
          if (targetFichaId) {
            if (esLiderFicha) {
              await Ficha.findByIdAndUpdate(targetFichaId, { instructorLiderId: instructor._id })
            } else {
              await Ficha.findByIdAndUpdate(targetFichaId, { $addToSet: { instructores: instructor._id } })
            }
          }
        }
      } catch (err) {
        errores++
      }
    }

    res.status(201).json({ ok: true, creados, actualizados, errores })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
