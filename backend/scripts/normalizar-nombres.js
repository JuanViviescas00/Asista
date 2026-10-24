import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import Estudiante from '../models/Estudiante.js'
import Instructor from '../models/Instructor.js'
import Ficha from '../models/Ficha.js'
import {
  capitalizarTexto,
  normalizarTipoDocumento,
  normalizarJornada,
  normalizarNumeroDocumento
} from '../utils/textUtils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '..', '.env') })

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!uri) {
    console.error('No se encontro MONGO_URI en backend/.env')
    process.exit(1)
  }

  await mongoose.connect(uri)
  console.log('Conectado a MongoDB Atlas.')

  // 1. Normalizar Estudiantes
  const estudiantes = await Estudiante.find({})
  let estActualizados = 0
  for (const e of estudiantes) {
    const nuevoNom = capitalizarTexto(e.nombres)
    const nuevoApe = capitalizarTexto(e.apellidos)
    const nuevoTipoDoc = normalizarTipoDocumento(e.tipoDocumento)
    const nuevoNumDoc = normalizarNumeroDocumento(e.numeroDocumento)
    const nuevoCorreo = e.correo ? String(e.correo).trim().toLowerCase() : ''
    const nuevoTel = e.telefono ? String(e.telefono).trim() : ''
    const nuevoGen = e.genero ? capitalizarTexto(e.genero) : ''

    if (
      e.nombres !== nuevoNom ||
      e.apellidos !== nuevoApe ||
      e.tipoDocumento !== nuevoTipoDoc ||
      e.numeroDocumento !== nuevoNumDoc ||
      e.correo !== nuevoCorreo ||
      e.telefono !== nuevoTel ||
      e.genero !== nuevoGen
    ) {
      await Estudiante.updateOne(
        { _id: e._id },
        {
          $set: {
            nombres: nuevoNom,
            apellidos: nuevoApe,
            tipoDocumento: nuevoTipoDoc,
            numeroDocumento: nuevoNumDoc,
            correo: nuevoCorreo,
            telefono: nuevoTel,
            genero: nuevoGen
          }
        }
      )
      estActualizados++
    }
  }
  console.log(`Estudiantes analizados: ${estudiantes.length}. Actualizados a datos normalizados: ${estActualizados}`)

  // 2. Normalizar Instructores
  const instructores = await Instructor.find({})
  let instActualizados = 0
  for (const i of instructores) {
    const nuevoNom = capitalizarTexto(i.nombres)
    const nuevoApe = capitalizarTexto(i.apellidos)
    const nuevoTipoDoc = normalizarTipoDocumento(i.tipoDocumento)
    const nuevoNumDoc = normalizarNumeroDocumento(i.numeroDocumento)
    const nuevoCorreo = i.correo ? String(i.correo).trim().toLowerCase() : ''
    const nuevoTel = i.telefono ? String(i.telefono).trim() : ''
    const nuevaEsp = i.especialidad ? capitalizarTexto(i.especialidad) : ''

    if (
      i.nombres !== nuevoNom ||
      i.apellidos !== nuevoApe ||
      i.tipoDocumento !== nuevoTipoDoc ||
      i.numeroDocumento !== nuevoNumDoc ||
      i.correo !== nuevoCorreo ||
      i.telefono !== nuevoTel ||
      i.especialidad !== nuevaEsp
    ) {
      await Instructor.updateOne(
        { _id: i._id },
        {
          $set: {
            nombres: nuevoNom,
            apellidos: nuevoApe,
            tipoDocumento: nuevoTipoDoc,
            numeroDocumento: nuevoNumDoc,
            correo: nuevoCorreo,
            telefono: nuevoTel,
            especialidad: nuevaEsp
          }
        }
      )
      instActualizados++
    }
  }
  console.log(`Instructores analizados: ${instructores.length}. Actualizados a datos normalizados: ${instActualizados}`)

  // 3. Normalizar Fichas
  const fichas = await Ficha.find({})
  let fichasActualizadas = 0
  for (const f of fichas) {
    const nuevoCod = normalizarNumeroDocumento(f.codigoFicha)
    const nuevoNom = capitalizarTexto(f.nombrePrograma)
    const nuevaJor = normalizarJornada(f.jornada)
    const nuevaAula = capitalizarTexto(f.aulaAsignada)

    if (
      f.codigoFicha !== nuevoCod ||
      f.nombrePrograma !== nuevoNom ||
      f.jornada !== nuevaJor ||
      f.aulaAsignada !== nuevaAula
    ) {
      await Ficha.updateOne(
        { _id: f._id },
        {
          $set: {
            codigoFicha: nuevoCod,
            nombrePrograma: nuevoNom,
            jornada: nuevaJor,
            aulaAsignada: nuevaAula
          }
        }
      )
      fichasActualizadas++
    }
  }
  console.log(`Fichas analizadas: ${fichas.length}. Actualizadas a datos normalizados: ${fichasActualizadas}`)

  await mongoose.disconnect()
  console.log('Normalizacion completada con exito.')
}

run().catch(err => {
  console.error('Error durante la normalizacion:', err)
  process.exit(1)
})
