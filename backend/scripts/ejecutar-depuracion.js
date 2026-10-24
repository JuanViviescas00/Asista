import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import mongoose from 'mongoose'
import Ficha from '../models/Ficha.js'
import Estudiante from '../models/Estudiante.js'
import Instructor from '../models/Instructor.js'
import Asistencia from '../models/Asistencia.js'
import Clase from '../models/Clase.js'
import Excusa from '../models/Excusa.js'
import PermisoDatosPersonales from '../models/PermisoDatosPersonales.js'
import Admin from '../models/Admin.js'
import Dispositivo from '../models/Dispositivo.js'
import DiaFestivo from '../models/DiaFestivo.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const FICHAS_OBJETIVO = ['3139319', '3598464']

async function ejecutarDepuracion() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('ERROR: No se encontró MONGODB_URI en .env')
    process.exit(1)
  }

  console.log('Conectando a MongoDB para DEPURACIÓN CONTROLADA...')
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 })
  console.log('Conexión establecida con éxito.\n')

  // 1. Fichas
  const todasLasFichas = await Ficha.find().lean()
  const fichasPreservadas = todasLasFichas.filter(f => FICHAS_OBJETIVO.includes(String(f.codigoFicha).trim()))
  if (fichasPreservadas.length !== 2) {
    throw new Error(`ABORTANDO POR SEGURIDAD: Se esperaban 2 fichas a preservar pero se encontraron ${fichasPreservadas.length}.`)
  }

  const idsFichasPreservadas = fichasPreservadas.map(f => f._id)
  const codigosFichasPreservadas = fichasPreservadas.map(f => String(f.codigoFicha).trim())

  // 2. Instructores vinculados a las fichas
  const instructorIdsSet = new Set()
  fichasPreservadas.forEach(f => {
    if (f.instructorLiderId) instructorIdsSet.add(String(f.instructorLiderId))
    if (Array.isArray(f.instructores)) {
      f.instructores.forEach(instId => {
        if (instId) instructorIdsSet.add(String(instId))
      })
    }
  })

  const clasesFichas = await Clase.find({ fichaId: { $in: idsFichasPreservadas } }).lean()
  clasesFichas.forEach(c => {
    if (c.instructorId) instructorIdsSet.add(String(c.instructorId))
  })

  const asistenciasFichas = await Asistencia.find({ fichaId: { $in: idsFichasPreservadas } }).lean()
  asistenciasFichas.forEach(a => {
    if (a.instructorId) instructorIdsSet.add(String(a.instructorId))
  })

  const idsInstructoresPreservados = Array.from(instructorIdsSet).map(id => new mongoose.Types.ObjectId(id))

  // 3. Estudiantes vinculados a las fichas
  const todosLosEstudiantes = await Estudiante.find().lean()
  const estudiantesPreservados = todosLosEstudiantes.filter(e => {
    if (!e.fichaId) return false
    const fIdStr = String(e.fichaId)
    return idsFichasPreservadas.some(id => String(id) === fIdStr) || codigosFichasPreservadas.includes(fIdStr)
  })
  const idsEstudiantesPreservados = estudiantesPreservados.map(e => e._id)

  console.log(`Plan de preservación validado:`)
  console.log(`- Fichas preservadas: ${fichasPreservadas.length} (${codigosFichasPreservadas.join(', ')})`)
  console.log(`- Instructores vinculados preservados: ${idsInstructoresPreservados.length}`)
  console.log(`- Estudiantes vinculados preservados: ${idsEstudiantesPreservados.length}`)
  console.log(`- Admin / Dispositivos / DiasFestivos: Intactos sin modificar\n`)

  console.log('Iniciando eliminación de registros ajenos...')

  // Ejecución de borrado
  const resFichas = await Ficha.deleteMany({ _id: { $nin: idsFichasPreservadas } })
  console.log(`✓ Fichas ajenas eliminadas: ${resFichas.deletedCount}`)

  const resInstructores = await Instructor.deleteMany({ _id: { $nin: idsInstructoresPreservados } })
  console.log(`✓ Instructores ajenos eliminados: ${resInstructores.deletedCount}`)

  const resEstudiantes = await Estudiante.deleteMany({ _id: { $nin: idsEstudiantesPreservados } })
  console.log(`✓ Estudiantes ajenos eliminados: ${resEstudiantes.deletedCount}`)

  const resClases = await Clase.deleteMany({ fichaId: { $nin: idsFichasPreservadas } })
  console.log(`✓ Clases ajenas eliminadas: ${resClases.deletedCount}`)

  const resAsistencias = await Asistencia.deleteMany({
    $and: [
      { fichaId: { $nin: idsFichasPreservadas } },
      { estudianteId: { $nin: idsEstudiantesPreservados } }
    ]
  })
  console.log(`✓ Asistencias ajenas eliminadas: ${resAsistencias.deletedCount}`)

  const resExcusas = await Excusa.deleteMany({
    $and: [
      { fichaId: { $nin: idsFichasPreservadas } },
      { estudianteId: { $nin: idsEstudiantesPreservados } }
    ]
  })
  console.log(`✓ Excusas ajenas eliminadas: ${resExcusas.deletedCount}`)

  const resPermisos = await PermisoDatosPersonales.deleteMany({
    estudianteId: { $nin: idsEstudiantesPreservados }
  })
  console.log(`✓ Permisos ajenos eliminados: ${resPermisos.deletedCount}`)

  // Verificación final
  const postFichas = await Ficha.countDocuments()
  const postInstructores = await Instructor.countDocuments()
  const postEstudiantes = await Estudiante.countDocuments()
  const postClases = await Clase.countDocuments()
  const postAsistencias = await Asistencia.countDocuments()
  const postExcusas = await Excusa.countDocuments()
  const postPermisos = await PermisoDatosPersonales.countDocuments()
  const postAdmins = await Admin.countDocuments()
  const postDispositivos = await Dispositivo.countDocuments()
  const postFestivos = await DiaFestivo.countDocuments()

  console.log('\n====================================================')
  console.log('ESTADO FINAL DE LA BASE DE DATOS')
  console.log('====================================================')
  console.table([
    { Coleccion: 'fichas', RegistrosRestantes: postFichas },
    { Coleccion: 'instructores', RegistrosRestantes: postInstructores },
    { Coleccion: 'estudiantes', RegistrosRestantes: postEstudiantes },
    { Coleccion: 'asistencias', RegistrosRestantes: postAsistencias },
    { Coleccion: 'clases', RegistrosRestantes: postClases },
    { Coleccion: 'excusas', RegistrosRestantes: postExcusas },
    { Coleccion: 'permisos_datos', RegistrosRestantes: postPermisos },
    { Coleccion: 'admin (PROTEGIDO)', RegistrosRestantes: postAdmins },
    { Coleccion: 'dispositivos (PROTEGIDO)', RegistrosRestantes: postDispositivos },
    { Coleccion: 'dias_festivos (PROTEGIDO)', RegistrosRestantes: postFestivos }
  ])

  await mongoose.disconnect()
  console.log('\nDepuración completada exitosamente.')
}

ejecutarDepuracion().catch(err => {
  console.error('ERROR DURANTE LA DEPURACIÓN:', err)
  process.exit(1)
})
