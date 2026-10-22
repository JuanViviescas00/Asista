import dotenv from 'dotenv'
dotenv.config({ path: 'backend/.env' })
dotenv.config()
import mongoose from 'mongoose'
import Programa from '../models/Programa.js'
import Ficha from '../models/Ficha.js'
import { PROGRAMAS_ESTANDAR, normalizarNombrePrograma } from '../utils/textUtils.js'

async function seedProgramas() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('Error: MONGODB_URI no definida en .env')
    process.exit(1)
  }

  console.log('Conectando a MongoDB Atlas...')
  await mongoose.connect(uri)
  console.log('Conectado con éxito.\n')

  console.log('--- 1. SEMBRANDO PROGRAMAS ESTÁNDAR ---')
  for (const prog of PROGRAMAS_ESTANDAR) {
    const existente = await Programa.findOne({ nombre: prog.nombre })
    if (!existente) {
      await Programa.create({
        nombre: prog.nombre,
        sigla: prog.sigla,
        codigo: prog.codigo,
        nivel: prog.nivel,
        alias: prog.alias,
        estado: 'Activo',
        descripcion: `Programa oficial SENA (${prog.nivel})`
      })
      console.log(`[CREADO] Programa: "${prog.nombre}" (${prog.sigla})`)
    } else {
      existente.sigla = prog.sigla
      existente.codigo = prog.codigo
      existente.nivel = prog.nivel
      existente.alias = [...new Set([...(existente.alias || []), ...(prog.alias || [])])]
      await existente.save()
      console.log(`[ACTUALIZADO] Programa existente: "${prog.nombre}"`)
    }
  }

  console.log('\n--- 2. NORMALIZANDO FICHAS EXISTENTES EN BD ---')
  const fichas = await Ficha.find({})
  console.log(`Fichas encontradas: ${fichas.length}`)

  let actualizadas = 0
  for (const f of fichas) {
    const original = f.nombrePrograma
    const normalizado = normalizarNombrePrograma(original)

    if (original !== normalizado) {
      f.nombrePrograma = normalizado
      await f.save()
      console.log(`Ficha ${f.codigoFicha}: "${original}" -> "${normalizado}"`)
      actualizadas++
    } else {
      console.log(`Ficha ${f.codigoFicha}: Ya está estandarizada ("${original}")`)
    }
  }

  console.log(`\nResumen: ${actualizadas} ficha(s) normalizadas con éxito.`)

  const totalProgramas = await Programa.countDocuments()
  console.log(`Total programas registrados en catálogo: ${totalProgramas}`)

  await mongoose.disconnect()
  console.log('Desconectado de MongoDB Atlas. Proceso finalizado con éxito.')
}

seedProgramas().catch(err => {
  console.error('Error fatal durante seed y migración:', err)
  process.exit(1)
})
