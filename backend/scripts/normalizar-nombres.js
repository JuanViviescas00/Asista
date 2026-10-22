import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import Estudiante from '../models/Estudiante.js'
import Instructor from '../models/Instructor.js'
import { capitalizarTexto } from '../utils/textUtils.js'

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

  // Normalizar Estudiantes
  const estudiantes = await Estudiante.find({})
  let estActualizados = 0
  for (const e of estudiantes) {
    const nuevoNom = capitalizarTexto(e.nombres)
    const nuevoApe = capitalizarTexto(e.apellidos)
    const nuevoCorreo = e.correo ? String(e.correo).trim().toLowerCase() : ''
    if (e.nombres !== nuevoNom || e.apellidos !== nuevoApe || e.correo !== nuevoCorreo) {
      await Estudiante.updateOne(
        { _id: e._id },
        { $set: { nombres: nuevoNom, apellidos: nuevoApe, correo: nuevoCorreo } }
      )
      estActualizados++
    }
  }
  console.log(`Estudiantes analizados: ${estudiantes.length}. Actualizados a Title Case: ${estActualizados}`)

  // Normalizar Instructores
  const instructores = await Instructor.find({})
  let instActualizados = 0
  for (const i of instructores) {
    const nuevoNom = capitalizarTexto(i.nombres)
    const nuevoApe = capitalizarTexto(i.apellidos)
    const nuevoCorreo = i.correo ? String(i.correo).trim().toLowerCase() : ''
    if (i.nombres !== nuevoNom || i.apellidos !== nuevoApe || i.correo !== nuevoCorreo) {
      await Instructor.updateOne(
        { _id: i._id },
        { $set: { nombres: nuevoNom, apellidos: nuevoApe, correo: nuevoCorreo } }
      )
      instActualizados++
    }
  }
  console.log(`Instructores analizados: ${instructores.length}. Actualizados a Title Case: ${instActualizados}`)

  await mongoose.disconnect()
  console.log('Normalizacion completada con exito.')
}

run().catch(err => {
  console.error('Error durante la normalizacion:', err)
  process.exit(1)
})
