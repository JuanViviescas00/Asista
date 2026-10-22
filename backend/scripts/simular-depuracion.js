import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

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

const FICHAS_OBJETIVO = ['3139319', '3598464']

async function simular() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('ERROR: No se encontró MONGODB_URI en .env')
    process.exit(1)
  }

  console.log('Conectando a MongoDB para simulación (SOLO LECTURA)...')
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
  })
  console.log('Conexión exitosa a MongoDB.\n')

  // 1. Fichas
  const todasLasFichas = await Ficha.find().lean()
  const fichasPreservadas = todasLasFichas.filter(f => FICHAS_OBJETIVO.includes(String(f.codigoFicha).trim()))
  const fichasEliminar = todasLasFichas.filter(f => !FICHAS_OBJETIVO.includes(String(f.codigoFicha).trim()))

  const idsFichasPreservadas = fichasPreservadas.map(f => f._id)
  const codigosFichasPreservadas = fichasPreservadas.map(f => String(f.codigoFicha).trim())

  console.log('====================================================')
  console.log('1. FICHAS ENCONTRADAS')
  console.log('====================================================')
  console.log(`Fichas solicitadas a preservar: ${FICHAS_OBJETIVO.join(', ')}`)
  console.log(`Total fichas en BD: ${todasLasFichas.length}`)
  console.log(`Fichas a PRESERVAR (${fichasPreservadas.length}):`)
  fichasPreservadas.forEach(f => {
    console.log(`   - Código: ${f.codigoFicha} | Programa: ${f.nombrePrograma} | ID: ${f._id}`)
  })
  if (fichasEliminar.length > 0) {
    console.log(`Fichas que se ELIMINARÍAN (${fichasEliminar.length}):`)
    fichasEliminar.forEach(f => {
      console.log(`   - Código: ${f.codigoFicha} | Programa: ${f.nombrePrograma} | ID: ${f._id}`)
    })
  } else {
    console.log('   (No hay otras fichas para eliminar)')
  }

  // 2. Instructores vinculados a las fichas preservadas
  const instructorIdsSet = new Set()
  fichasPreservadas.forEach(f => {
    if (f.instructorLiderId) instructorIdsSet.add(String(f.instructorLiderId))
    if (Array.isArray(f.instructores)) {
      f.instructores.forEach(instId => {
        if (instId) instructorIdsSet.add(String(instId))
      })
    }
  })

  // Buscar también en clases históricas o asistencias de esas fichas
  const clasesPreservadas = await Clase.find({ fichaId: { $in: idsFichasPreservadas } }).lean()
  clasesPreservadas.forEach(c => {
    if (c.instructorId) instructorIdsSet.add(String(c.instructorId))
  })

  const asistenciasPreservadasFicha = await Asistencia.find({ fichaId: { $in: idsFichasPreservadas } }).lean()
  asistenciasPreservadasFicha.forEach(a => {
    if (a.instructorId) instructorIdsSet.add(String(a.instructorId))
  })

  const todosLosInstructores = await Instructor.find().lean()
  const instructoresPreservados = todosLosInstructores.filter(i => instructorIdsSet.has(String(i._id)))
  const instructoresEliminar = todosLosInstructores.filter(i => !instructorIdsSet.has(String(i._id)))

  console.log('\n====================================================')
  console.log('2. INSTRUCTORES / DOCENTES')
  console.log('====================================================')
  console.log(`Total instructores en BD: ${todosLosInstructores.length}`)
  console.log(`Instructores a PRESERVAR (${instructoresPreservados.length}) vinculados a las fichas:`)
  instructoresPreservados.forEach(i => {
    console.log(`   - ${i.nombres} ${i.apellidos} (${i.correo}) | Doc: ${i.numeroDocumento} | ID: ${i._id}`)
  })
  if (instructoresEliminar.length > 0) {
    console.log(`Instructores que se ELIMINARÍAN (${instructoresEliminar.length}) sin relación a las fichas:`)
    instructoresEliminar.forEach(i => {
      console.log(`   - ${i.nombres} ${i.apellidos} (${i.correo}) | Doc: ${i.numeroDocumento} | ID: ${i._id}`)
    })
  } else {
    console.log('   (No hay otros instructores ajenos)')
  }

  // 3. Estudiantes vinculados a las fichas preservadas
  const todosLosEstudiantes = await Estudiante.find().lean()
  const estudiantesPreservados = todosLosEstudiantes.filter(e => {
    if (!e.fichaId) return false
    const fIdStr = String(e.fichaId)
    return idsFichasPreservadas.some(id => String(id) === fIdStr) || codigosFichasPreservadas.includes(fIdStr)
  })
  const estudiantesEliminar = todosLosEstudiantes.filter(e => !estudiantesPreservados.some(ep => String(ep._id) === String(e._id)))
  const idsEstudiantesPreservados = estudiantesPreservados.map(e => e._id)

  console.log('\n====================================================')
  console.log('3. ESTUDIANTES')
  console.log('====================================================')
  console.log(`Total estudiantes en BD: ${todosLosEstudiantes.length}`)
  console.log(`Estudiantes a PRESERVAR (${estudiantesPreservados.length}):`)
  fichasPreservadas.forEach(f => {
    const enFicha = estudiantesPreservados.filter(e => String(e.fichaId) === String(f._id) || String(e.fichaId) === String(f.codigoFicha))
    console.log(`   -> Ficha ${f.codigoFicha} (${f.nombrePrograma}): ${enFicha.length} estudiantes`)
  })
  console.log(`Estudiantes que se ELIMINARÍAN (${estudiantesEliminar.length}) [huérfanos o de otras fichas]`)

  // 4. Asistencias
  const totalAsistencias = await Asistencia.countDocuments()
  const asistenciasPreservadasCount = await Asistencia.countDocuments({
    $or: [
      { fichaId: { $in: idsFichasPreservadas } },
      { estudianteId: { $in: idsEstudiantesPreservados } }
    ]
  })
  const asistenciasEliminarCount = totalAsistencias - asistenciasPreservadasCount

  // 5. Clases
  const totalClases = await Clase.countDocuments()
  const clasesPreservadasCount = await Clase.countDocuments({
    fichaId: { $in: idsFichasPreservadas }
  })
  const clasesEliminarCount = totalClases - clasesPreservadasCount

  // 6. Excusas
  const totalExcusas = await Excusa.countDocuments()
  const excusasPreservadasCount = await Excusa.countDocuments({
    $or: [
      { fichaId: { $in: idsFichasPreservadas } },
      { estudianteId: { $in: idsEstudiantesPreservados } }
    ]
  })
  const excusasEliminarCount = totalExcusas - excusasPreservadasCount

  // 7. Permisos de datos
  const totalPermisos = await PermisoDatosPersonales.countDocuments()
  const permisosPreservadosCount = await PermisoDatosPersonales.countDocuments({
    estudianteId: { $in: idsEstudiantesPreservados }
  })
  const permisosEliminarCount = totalPermisos - permisosPreservadosCount

  // 8. Colecciones protegidas que NUNCA se tocan
  const admins = await Admin.find().select('nombre correo rol').lean()
  const totalAdmins = admins.length
  console.log('\n====================================================')
  console.log('ADMINISTRADORES ENCONTRADOS (100% PROTEGIDOS):')
  admins.forEach(a => console.log(`   - ${a.nombre} | ${a.correo} | Rol: ${a.rol}`))
  console.log('====================================================')
  const totalDispositivos = await Dispositivo.countDocuments()
  const totalFestivos = await DiaFestivo.countDocuments()

  console.log('\n====================================================')
  console.log('RESUMEN GENERAL DE LA SIMULACIÓN')
  console.log('====================================================')
  console.table([
    { Coleccion: 'fichas', TotalActual: todasLasFichas.length, SePreservan: fichasPreservadas.length, SeEliminarian: fichasEliminar.length },
    { Coleccion: 'instructores', TotalActual: todosLosInstructores.length, SePreservan: instructoresPreservados.length, SeEliminarian: instructoresEliminar.length },
    { Coleccion: 'estudiantes', TotalActual: todosLosEstudiantes.length, SePreservan: estudiantesPreservados.length, SeEliminarian: estudiantesEliminar.length },
    { Coleccion: 'asistencias', TotalActual: totalAsistencias, SePreservan: asistenciasPreservadasCount, SeEliminarian: asistenciasEliminarCount },
    { Coleccion: 'clases', TotalActual: totalClases, SePreservan: clasesPreservadasCount, SeEliminarian: clasesEliminarCount },
    { Coleccion: 'excusas', TotalActual: totalExcusas, SePreservan: excusasPreservadasCount, SeEliminarian: excusasEliminarCount },
    { Coleccion: 'permisos_datos', TotalActual: totalPermisos, SePreservan: permisosPreservadosCount, SeEliminarian: permisosEliminarCount },
    { Coleccion: 'admin (PROTEGIDO)', TotalActual: totalAdmins, SePreservan: totalAdmins, SeEliminarian: 0 },
    { Coleccion: 'dispositivos (PROTEGIDO)', TotalActual: totalDispositivos, SePreservan: totalDispositivos, SeEliminarian: 0 },
    { Coleccion: 'dias_festivos (PROTEGIDO)', TotalActual: totalFestivos, SePreservan: totalFestivos, SeEliminarian: 0 }
  ])

  await mongoose.disconnect()
  console.log('\nSimulación finalizada sin modificar la base de datos.')
}

simular().catch(err => {
  console.error('Error durante la simulación:', err)
  process.exit(1)
})
