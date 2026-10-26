// Script de reparación de inasistencias huérfanas de instructor.
//
// Uso (por defecto SIMULACIÓN, no escribe nada):
//   node backend/scripts/reparar-instructor-inasistencias.js
// Para escribir de verdad:
//   node backend/scripts/reparar-instructor-inasistencias.js --apply
//
// La función pura de resolución se exporta SIN dependencias de mongoose para
// poder probarla sin conexión. El main carga mongoose, dotenv y los modelos con
// import dinámico, de modo que importar este archivo (p. ej. desde un test) NO
// obligue a cargar la conexión a base de datos.

// Resuelve el instructor de una inasistencia a partir de los documentos ya
// cargados. Orden de preferencia:
//   1) Clase.instructorId (vía claseId de la inasistencia).
//   2) Jornada.instructorId de (fichaId, fecha), solo si ese id existe en Instructor.
//   3) Ficha.instructorLiderId.
// Devuelve el instructorId resuelto o null si nada es resoluble.
export function resolverInstructorInasistencia({ clase, jornada, ficha, instructoresSet }) {
  if (clase?.instructorId) {
    return clase.instructorId
  }
  if (jornada?.instructorId && instructoresSet.has(String(jornada.instructorId))) {
    return jornada.instructorId
  }
  if (ficha?.instructorLiderId) {
    return ficha.instructorLiderId
  }
  return null
}

async function reparar() {
  const apply = process.argv.includes('--apply')

  const [{ default: mongoose }, { default: dotenv }] = await Promise.all([
    import('mongoose'),
    import('dotenv')
  ])
  dotenv.config()

  const [
    { default: Inasistencia },
    { default: Instructor },
    { default: Clase },
    { default: Jornada },
    { default: Ficha }
  ] = await Promise.all([
    import('../models/Inasistencia.js'),
    import('../models/Instructor.js'),
    import('../models/Clase.js'),
    import('../models/Jornada.js'),
    import('../models/Ficha.js')
  ])

  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('❌ MONGODB_URI no definida en variables de entorno.')
    process.exit(1)
  }

  console.log('Conectando a MongoDB Atlas...')
  await mongoose.connect(uri)
  console.log('✓ Conectado a MongoDB Atlas.')

  // Conjunto de ids de instructor que existen en la colección.
  const instructores = await Instructor.find().select('_id').lean()
  const instructoresSet = new Set(instructores.map((i) => String(i._id)))

  // Candidatas: no SUBIDA y con instructorId nulo/ausente o inexistente.
  const inasistencias = await Inasistencia.find({ estadoCarga: { $ne: 'SUBIDA' } }).lean()
  const candidatas = inasistencias.filter((a) => {
    if (!a.instructorId) return true
    return !instructoresSet.has(String(a.instructorId))
  })

  console.log(`Analizando ${inasistencias.length} inasistencias (no SUBIDA); ${candidatas.length} candidatas a reparar...`)

  // Cargar fichas, clases y jornadas necesarias en lote.
  const fichas = await Ficha.find().select('_id instructorLiderId').lean()
  const fichaMap = new Map(fichas.map((f) => [String(f._id), f]))

  const claseIds = [...new Set(candidatas.map((a) => (a.claseId ? String(a.claseId) : null)).filter(Boolean))]
  const clases = claseIds.length > 0
    ? await Clase.find({ _id: { $in: claseIds } }).select('_id instructorId').lean()
    : []
  const claseMap = new Map(clases.map((c) => [String(c._id), c]))

  const clavesJornada = [...new Set(candidatas.map((a) => `${String(a.fichaId)}|${a.fecha}`))]
  const jornadas = clavesJornada.length > 0
    ? await Jornada.find({
        $or: clavesJornada.map((k) => {
          const [fichaId, fecha] = k.split('|')
          return { fichaId, fecha }
        })
      }).select('_id fichaId fecha instructorId').lean()
    : []
  const jornadaMap = new Map(jornadas.map((j) => [`${String(j.fichaId)}|${j.fecha}`, j]))

  let aReparar = 0
  let reparadas = 0
  let sinResolver = 0
  const sinResolverLista = []
  const operaciones = []

  for (const a of candidatas) {
    const clase = a.claseId ? (claseMap.get(String(a.claseId)) || null) : null
    const jornada = jornadaMap.get(`${String(a.fichaId)}|${a.fecha}`) || null
    const ficha = fichaMap.get(String(a.fichaId)) || null

    const instructorResuelto = resolverInstructorInasistencia({ clase, jornada, ficha, instructoresSet })

    if (!instructorResuelto) {
      sinResolver++
      sinResolverLista.push({ _id: a._id, fichaId: a.fichaId, fecha: a.fecha })
      continue
    }

    aReparar++
    if (apply) {
      operaciones.push({
        updateOne: {
          filter: { _id: a._id, estadoCarga: { $ne: 'SUBIDA' } },
          update: { $set: { instructorId: instructorResuelto } }
        }
      })
    }
  }

  if (apply && operaciones.length > 0) {
    const res = await Inasistencia.bulkWrite(operaciones)
    reparadas = res.modifiedCount || 0
  }

  console.log('\n=============================================')
  console.log(apply ? '✓ REPARACIÓN COMPLETADA (--apply)' : 'SIMULACIÓN (dry-run): no se escribió nada.')
  console.log(`  - Total revisadas (no SUBIDA): ${inasistencias.length}`)
  console.log(`  - A reparar: ${aReparar}`)
  if (apply) console.log(`  - Reparadas (modificadas): ${reparadas}`)
  console.log(`  - Sin resolver: ${sinResolver}`)
  if (sinResolverLista.length > 0) {
    console.log('  - Sin resolver (máx. 20):')
    for (const s of sinResolverLista.slice(0, 20)) {
      console.log(`      _id=${s._id} fichaId=${s.fichaId} fecha=${s.fecha}`)
    }
  }
  console.log('=============================================\n')

  await mongoose.disconnect()
  process.exit(0)
}

import { fileURLToPath } from 'node:url'
import path from 'node:path'

const esMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (esMain) {
  reparar().catch((err) => {
    console.error('❌ Error en reparación:', err)
    process.exit(1)
  })
}
