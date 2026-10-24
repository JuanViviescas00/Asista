import Programa from '../models/Programa.js'
import Ficha from '../models/Ficha.js'
import { quitarAcentos, normalizarNombrePrograma } from '../utils/textUtils.js'

export async function getProgramas(req, res) {
  try {
    const { estado } = req.query
    const filter = {}
    if (estado) filter.estado = estado

    const programas = await Programa.find(filter).sort({ nombre: 1 }).lean()

    // Enriquecer con el conteo de fichas activas que usan cada programa
    const fichas = await Ficha.find({}, 'nombrePrograma').lean()
    const conteoMap = new Map()
    for (const f of fichas) {
      if (!f.nombrePrograma) continue
      const norm = quitarAcentos(f.nombrePrograma).toLowerCase()
      conteoMap.set(norm, (conteoMap.get(norm) || 0) + 1)
    }

    const resultado = programas.map(p => {
      const normProg = quitarAcentos(p.nombre).toLowerCase()
      return {
        ...p,
        conteoFichas: conteoMap.get(normProg) || 0,
      }
    })

    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createPrograma(req, res) {
  try {
    let { nombre, codigo, sigla, nivel, alias, descripcion } = req.body

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre del programa es obligatorio.' })
    }

    // Normalizar nombre canónico
    const nombreNormalizado = normalizarNombrePrograma(nombre)
    const sinAcentosNuevo = quitarAcentos(nombreNormalizado).toLowerCase()

    // Validar duplicado por acentos o mayúsculas
    const existente = await Programa.find({}).lean()
    const duplicado = existente.find(p => quitarAcentos(p.nombre).toLowerCase() === sinAcentosNuevo)
    if (duplicado) {
      return res.status(400).json({ error: `Ya existe el programa "${duplicado.nombre}".` })
    }

    const programa = new Programa({
      nombre: nombreNormalizado,
      codigo: codigo ? codigo.trim().toUpperCase() : '',
      sigla: sigla ? sigla.trim().toUpperCase() : '',
      nivel: nivel || 'Tecnólogo',
      alias: Array.isArray(alias) ? alias.map(a => a.trim()).filter(Boolean) : [],
      descripcion: descripcion ? descripcion.trim() : '',
      estado: 'Activo',
    })

    await programa.save()
    res.status(201).json(programa)
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Ya existe un programa con este nombre oficial.' })
    }
    res.status(500).json({ error: err.message })
  }
}

export async function updatePrograma(req, res) {
  try {
    const { id } = req.params
    const { nombre, codigo, sigla, nivel, alias, estado, descripcion } = req.body

    const programa = await Programa.findById(id)
    if (!programa) {
      return res.status(404).json({ error: 'Programa no encontrado.' })
    }

    const nombreAnterior = programa.nombre
    let nombreNuevo = programa.nombre

    if (nombre && nombre.trim() && nombre.trim() !== programa.nombre) {
      nombreNuevo = normalizarNombrePrograma(nombre)
      const sinAcentosNuevo = quitarAcentos(nombreNuevo).toLowerCase()

      // Verificar que no choque con otro programa distinto
      const otros = await Programa.find({ _id: { $ne: id } }).lean()
      const duplicado = otros.find(p => quitarAcentos(p.nombre).toLowerCase() === sinAcentosNuevo)
      if (duplicado) {
        return res.status(400).json({ error: `Ya existe otro programa con el nombre "${duplicado.nombre}".` })
      }
      programa.nombre = nombreNuevo
    }

    if (codigo !== undefined) programa.codigo = codigo ? codigo.trim().toUpperCase() : ''
    if (sigla !== undefined) programa.sigla = sigla ? sigla.trim().toUpperCase() : ''
    if (nivel) programa.nivel = nivel
    if (estado) programa.estado = estado
    if (descripcion !== undefined) programa.descripcion = descripcion ? descripcion.trim() : ''
    if (Array.isArray(alias)) {
      programa.alias = alias.map(a => a.trim()).filter(Boolean)
    }

    await programa.save()

    // Si cambió el nombre del programa, actualizar en cascada todas las fichas vinculadas
    if (nombreAnterior !== nombreNuevo) {
      await Ficha.updateMany(
        { nombrePrograma: nombreAnterior },
        { $set: { nombrePrograma: nombreNuevo } }
      )
    }

    res.json(programa)
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Ya existe un programa con este nombre oficial.' })
    }
    res.status(500).json({ error: err.message })
  }
}

export async function deletePrograma(req, res) {
  try {
    const { id } = req.params
    const programa = await Programa.findById(id)
    if (!programa) {
      return res.status(404).json({ error: 'Programa no encontrado.' })
    }

    // Verificar si hay fichas vinculadas
    const fichasVinculadas = await Ficha.countDocuments({ nombrePrograma: programa.nombre })
    if (fichasVinculadas > 0) {
      return res.status(400).json({
        error: `No se puede eliminar porque hay ${fichasVinculadas} ficha(s) vinculadas a "${programa.nombre}". Puedes cambiar su estado a Inactivo.`
      })
    }

    await Programa.findByIdAndDelete(id)
    res.json({ ok: true, message: `Programa "${programa.nombre}" eliminado exitosamente.` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
