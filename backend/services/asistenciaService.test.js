import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import Ficha from '../models/Ficha.js'
import Estudiante from '../models/Estudiante.js'
import Inasistencia from '../models/Inasistencia.js'
import Jornada from '../models/Jornada.js'
import DiaFestivo from '../models/DiaFestivo.js'
import Clase from '../models/Clase.js'
import { cerrarInasistenciasFicha, finalizarClase, calcularResumenAsistencia } from './asistenciaService.js'

const fichaId = '111111111111111111111111'
const est1 = '222222222222222222222222'
const est2 = '333333333333333333333333'
const claseId = '444444444444444444444444'
const instructorId = '555555555555555555555555'
const fecha = '2026-01-05'

const fichaFake = { _id: fichaId, jornada: 'Mañana', instructorLiderId: null }

const orig = {
  fichaOne: Ficha.findOne,
  estFind: Estudiante.find,
  estFindById: Estudiante.findById,
  inaFind: Inasistencia.find,
  inaBulk: Inasistencia.bulkWrite,
  inaDeleteMany: Inasistencia.deleteMany,
  jorFindOne: Jornada.findOne,
  jorFindOneAndUpdate: Jornada.findOneAndUpdate,
  jorFind: Jornada.find,
  diaFind: DiaFestivo.find,
  claseFindOneAndUpdate: Clase.findOneAndUpdate,
}

function base() {
  Ficha.findOne = async (filter) => (filter && filter.$or ? null : fichaFake)
  Estudiante.find = () => ({ select: () => Promise.resolve([{ _id: est1 }, { _id: est2 }]) })
  Inasistencia.find = () => ({ select: () => Promise.resolve([]) })
  Inasistencia.bulkWrite = async (ops) => ({ upsertedCount: ops.length })
  Inasistencia.deleteMany = async () => ({ deletedCount: 0 })
  Jornada.findOne = async () => null
  Jornada.findOneAndUpdate = async () => ({ _id: 'jornada', fichaId, fecha, presentes: [] })
  DiaFestivo.find = () => ({ select: () => Promise.resolve([]) })
  Clase.findOneAndUpdate = async () => null
}

after(() => {
  Ficha.findOne = orig.fichaOne
  Estudiante.find = orig.estFind
  Estudiante.findById = orig.estFindById
  Inasistencia.find = orig.inaFind
  Inasistencia.bulkWrite = orig.inaBulk
  Inasistencia.deleteMany = orig.inaDeleteMany
  Jornada.findOne = orig.jorFindOne
  Jornada.findOneAndUpdate = orig.jorFindOneAndUpdate
  Jornada.find = orig.jorFind
  DiaFestivo.find = orig.diaFind
  Clase.findOneAndUpdate = orig.claseFindOneAndUpdate
})

test('faltan solo los ausentes (los presentes se excluyen)', async () => {
  base()
  Jornada.findOne = async () => ({ _id: 'jornada', fichaId, fecha, presentes: [{ estudianteId: est1 }] })
  let ops = null
  Inasistencia.bulkWrite = async (operaciones) => { ops = operaciones; return { upsertedCount: operaciones.length } }
  const r = await cerrarInasistenciasFicha(fichaId, fecha, instructorId, claseId)
  assert.equal(r.creados, 1)
  assert.equal(ops.length, 1)
  assert.equal(String(ops[0].updateOne.filter.estudianteId), est2)
})

test('no pisa una novedad existente', async () => {
  base()
  Inasistencia.find = () => ({ select: () => Promise.resolve([{ estudianteId: est1 }]) })
  let ops = null
  Inasistencia.bulkWrite = async (operaciones) => { ops = operaciones; return { upsertedCount: operaciones.length } }
  const r = await cerrarInasistenciasFicha(fichaId, fecha, instructorId, claseId)
  assert.equal(r.creados, 1)
  assert.equal(ops.length, 1)
  assert.equal(String(ops[0].updateOne.filter.estudianteId), est2)
})

test('no crea en jornada inhabilitada', async () => {
  base()
  Jornada.findOne = async () => ({ _id: 'jornada', fichaId, fecha, inhabilitada: true, presentes: [] })
  let bulkCalled = false
  Inasistencia.bulkWrite = async () => { bulkCalled = true; return { upsertedCount: 0 } }
  const r = await cerrarInasistenciasFicha(fichaId, fecha, instructorId, claseId)
  assert.equal(r.creados, 0)
  assert.equal(r.omitida, 'inhabilitada')
  assert.equal(bulkCalled, false)
})

test('segunda llamada es idempotente (crea 0)', async () => {
  base()
  const r1 = await cerrarInasistenciasFicha(fichaId, fecha, instructorId, claseId)
  assert.equal(r1.creados, 2)

  Inasistencia.find = () => ({ select: () => Promise.resolve([{ estudianteId: est1 }, { estudianteId: est2 }]) })
  let bulkCalled = false
  Inasistencia.bulkWrite = async () => { bulkCalled = true; return { upsertedCount: 0 } }
  const r2 = await cerrarInasistenciasFicha(fichaId, fecha, instructorId, claseId)
  assert.equal(r2.creados, 0)
  assert.equal(bulkCalled, false)
})

test('carrera: presente que llega durante el cierre borra su Falta', async () => {
  base()
  let findOneCalls = 0
  Jornada.findOne = async () => {
    findOneCalls++
    if (findOneCalls === 1) return { _id: 'jornada', fichaId, fecha, presentes: [] }
    return { _id: 'jornada', fichaId, fecha, presentes: [{ estudianteId: est1 }] }
  }
  let deleteFilter = null
  Inasistencia.deleteMany = async (filter) => { deleteFilter = filter; return { deletedCount: 1 } }
  const r = await cerrarInasistenciasFicha(fichaId, fecha, instructorId, claseId)
  assert.equal(r.creados, 2)
  assert.ok(deleteFilter)
  assert.equal(deleteFilter.tipo, 'Falta')
  assert.equal(deleteFilter.origen, 'huellero')
  assert.equal(deleteFilter.claseId, claseId)
  assert.deepEqual(deleteFilter.estadoCarga, { $ne: 'SUBIDA' })
  assert.equal(deleteFilter.estudianteId.$in.length, 1)
  assert.equal(String(deleteFilter.estudianteId.$in[0]), est1)
})

test('finalizarClase dos veces: la segunda devuelve yaFinalizada', async () => {
  base()
  const claseFake = {
    _id: claseId,
    fichaId,
    instructorId,
    iniciadaAt: new Date('2026-01-05T08:00:00-05:00'),
    deviceId: 'dev1',
    estado: 'Finalizada',
    finalizadaAt: new Date(),
  }
  let calls = 0
  Clase.findOneAndUpdate = async () => {
    calls++
    if (calls === 1) return claseFake
    return null
  }
  const r1 = await finalizarClase(claseId)
  assert.equal(r1.yaFinalizada, false)
  assert.ok(r1.clase)
  assert.equal(r1.creados, 2)

  const r2 = await finalizarClase(claseId)
  assert.equal(r2.yaFinalizada, true)
  assert.equal(r2.clase, undefined)
})

test('bulkWrite E11000: toma upsertedCount y continúa (limpia carrera)', async () => {
  base()
  let findOneCalls = 0
  Jornada.findOne = async () => {
    findOneCalls++
    if (findOneCalls === 1) return { _id: 'jornada', fichaId, fecha, presentes: [] }
    return { _id: 'jornada', fichaId, fecha, presentes: [{ estudianteId: est1 }] }
  }
  Inasistencia.bulkWrite = async () => {
    const err = new Error('duplicate')
    err.code = 11000
    err.result = { upsertedCount: 1 }
    throw err
  }
  let deleteManyCalled = false
  Inasistencia.deleteMany = async () => { deleteManyCalled = true; return { deletedCount: 0 } }
  const r = await cerrarInasistenciasFicha(fichaId, fecha, instructorId, claseId)
  assert.equal(r.creados, 1)
  assert.equal(r.error, undefined)
  assert.equal(deleteManyCalled, true)
})

test('calcularResumenAsistencia: Falta + Tardanza + Excusada + presentes => mismo resumen', async () => {
  base()
  Inasistencia.find = () => ({ sort: () => Promise.resolve([
    { estudianteId: est1, fecha: '2026-01-05', tipo: 'Falta', horas: 6 },
    { estudianteId: est1, fecha: '2026-01-06', tipo: 'Tardanza', horas: 2 },
    { estudianteId: est1, fecha: '2026-01-07', tipo: 'Excusada', horas: 6 },
  ]) })
  Jornada.find = () => Promise.resolve([
    { fichaId, fecha: '2026-01-08', presentes: [{ estudianteId: est1 }] },
    { fichaId, fecha: '2026-01-09', presentes: [{ estudianteId: est1 }] },
  ])
  Estudiante.findById = () => ({ populate: () => Promise.resolve({ _id: est1, fichaId: { jornada: 'Mañana' } }) })

  const r = await calcularResumenAsistencia(est1)
  assert.equal(r.diasFallaLiteral, 1)        // solo la Falta
  assert.equal(r.horasTardanzaAcumuladas, 2) // solo la Tardanza
  assert.equal(r.diasFallaPorHoras, 0)       // 2 // 6
  assert.equal(r.horasPendientes, 2)
  assert.equal(r.diasFallaTotales, 1)
  assert.equal(r.rachaConsecutivaActual, 0)  // termina en Presente
  assert.equal(r.critico, false)
})

test('calcularResumenAsistencia: horas de Tardanza acumulan y no se leen horas de Falta/Excusada', async () => {
  base()
  Inasistencia.find = () => ({ sort: () => Promise.resolve([
    { estudianteId: est1, fecha: '2026-01-05', tipo: 'Tardanza', horas: 3 },
    { estudianteId: est1, fecha: '2026-01-06', tipo: 'Tardanza', horas: 3 },
    { estudianteId: est1, fecha: '2026-01-07', tipo: 'Falta', horas: 6 },
    { estudianteId: est1, fecha: '2026-01-08', tipo: 'Excusada', horas: 6 },
  ]) })
  Jornada.find = () => Promise.resolve([])
  Estudiante.findById = () => ({ populate: () => Promise.resolve({ _id: est1, fichaId: { jornada: 'Mañana' } }) })

  const r = await calcularResumenAsistencia(est1)
  assert.equal(r.horasTardanzaAcumuladas, 6)
  assert.equal(r.diasFallaLiteral, 1)
  assert.equal(r.diasFallaPorHoras, 1) // 6 // 6
  assert.equal(r.horasPendientes, 0)
  assert.equal(r.diasFallaTotales, 2)
})

test('racha: Presente 01-05 + Faltas 01-06 y 01-07 => racha 2', async () => {
  base()
  Inasistencia.find = () => ({ sort: () => Promise.resolve([
    { estudianteId: est1, fecha: '2026-01-06', tipo: 'Falta', horas: 6 },
    { estudianteId: est1, fecha: '2026-01-07', tipo: 'Falta', horas: 6 },
  ]) })
  Jornada.find = () => Promise.resolve([
    { fichaId, fecha: '2026-01-05', presentes: [{ estudianteId: est1 }] },
  ])
  Estudiante.findById = () => ({ populate: () => Promise.resolve({ _id: est1, fichaId: { jornada: 'Mañana' } }) })

  const r = await calcularResumenAsistencia(est1)
  assert.equal(r.rachaConsecutivaActual, 2)
  assert.equal(r.diasFallaLiteral, 2)
})

test('racha: Faltas 01-05 y 01-06 + Presente 01-07 => racha 0', async () => {
  base()
  Inasistencia.find = () => ({ sort: () => Promise.resolve([
    { estudianteId: est1, fecha: '2026-01-05', tipo: 'Falta', horas: 6 },
    { estudianteId: est1, fecha: '2026-01-06', tipo: 'Falta', horas: 6 },
  ]) })
  Jornada.find = () => Promise.resolve([
    { fichaId, fecha: '2026-01-07', presentes: [{ estudianteId: est1 }] },
  ])
  Estudiante.findById = () => ({ populate: () => Promise.resolve({ _id: est1, fichaId: { jornada: 'Mañana' } }) })

  const r = await calcularResumenAsistencia(est1)
  assert.equal(r.rachaConsecutivaActual, 0)
  assert.equal(r.diasFallaLiteral, 2)
})
