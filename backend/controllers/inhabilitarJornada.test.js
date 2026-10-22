import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import Inasistencia from '../models/Inasistencia.js'
import Jornada from '../models/Jornada.js'
import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'
import { inhabilitarJornada, reactivarJornada, getAsistencias } from './asistenciaController.js'

const estudianteId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const fichaId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const fecha = '2026-01-05'

const orig = {
  fichaFindOne: Ficha.findOne,
  inaFind: Inasistencia.find,
  inaDeleteMany: Inasistencia.deleteMany,
  inaCount: Inasistencia.countDocuments,
  jorFindOneAndUpdate: Jornada.findOneAndUpdate,
  jorFind: Jornada.find,
  estFind: Estudiante.find,
}

after(() => {
  Ficha.findOne = orig.fichaFindOne
  Inasistencia.find = orig.inaFind
  Inasistencia.deleteMany = orig.inaDeleteMany
  Inasistencia.countDocuments = orig.inaCount
  Jornada.findOneAndUpdate = orig.jorFindOneAndUpdate
  Jornada.find = orig.jorFind
  Estudiante.find = orig.estFind
})

function mockRes() {
  const res = {}
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

function base() {
  Ficha.findOne = async () => ({ _id: fichaId, codigoFicha: '123456', nombrePrograma: 'ADSO', jornada: 'Mañana' })
  Inasistencia.find = () => ({ select: () => Promise.resolve([]) })
  Inasistencia.deleteMany = async () => ({ deletedCount: 0 })
  Inasistencia.countDocuments = async () => 0
  Jornada.findOneAndUpdate = async () => ({})
  Jornada.find = () => ({ populate: () => Promise.resolve([]) })
  Estudiante.find = () => ({ select: () => Promise.resolve([]) })
}

test('inhabilitarJornada: upsert Jornada inhabilitada + borra no SUBIDA + reporta bloqueadas', async () => {
  base()
  Inasistencia.find = () => ({ select: () => Promise.resolve([{ estudianteId }]) }) // 1 SUBIDA

  let deleteFilter = null
  Inasistencia.deleteMany = async (filter) => { deleteFilter = filter; return { deletedCount: 2 } }

  let jorFilter = null
  let jorUpdate = null
  Jornada.findOneAndUpdate = async (filter, update) => { jorFilter = filter; jorUpdate = update; return {} }

  const req = { body: { fichaId, fecha, motivo: 'Reunión', instructorId: null } }
  const res = mockRes()
  await inhabilitarJornada(req, res)

  assert.equal(res.body.ok, true)
  assert.equal(res.body.bloqueadas, 1)
  assert.equal(res.body.count, 2)
  assert.equal(res.body.motivo, 'Reunión')
  assert.equal(jorFilter.fecha, fecha)
  assert.equal(jorUpdate.$set.inhabilitada, true)
  assert.equal(jorUpdate.$set.motivoInhabilitacion, 'Reunión')
  assert.deepEqual(deleteFilter.estadoCarga, { $ne: 'SUBIDA' })
  assert.equal(deleteFilter.fecha, fecha)
})

test('reactivarJornada: inhabilitada=false, limpia motivo y conserva bloqueadas SUBIDA', async () => {
  base()
  Inasistencia.countDocuments = async () => 3

  let jorUpdate = null
  Jornada.findOneAndUpdate = async (_filter, update) => { jorUpdate = update; return {} }

  const req = { body: { fichaId, fecha } }
  const res = mockRes()
  await reactivarJornada(req, res)

  assert.equal(res.body.ok, true)
  assert.equal(res.body.bloqueadas, 3)
  assert.equal(jorUpdate.$set.inhabilitada, false)
  assert.equal(jorUpdate.$set.motivoInhabilitacion, '')
})

test('getAsistencias: sintetiza Inhabilitada para cada aprendiz activo de una jornada inhabilitada', async () => {
  base()
  Inasistencia.find = () => ({ populate: () => ({ populate: () => ({ sort: () => Promise.resolve([]) }) }) })

  const instructor = { _id: 'mmmmmmmmmmmmmmmmmmmmmmmm', nombres: 'M', apellidos: 'M' }
  Jornada.find = (filter) => {
    if (filter && filter.inhabilitada) {
      return {
        populate: () => Promise.resolve([
          { _id: 'jjjjjjjjjjjjjjjjjjjjjjjj', fichaId, fecha, inhabilitada: true, motivoInhabilitacion: 'Reunión', instructorId: instructor },
        ]),
      }
    }
    return { populate: () => ({ populate: () => ({ populate: () => Promise.resolve([]) }) }) }
  }
  Estudiante.find = () => ({ select: () => Promise.resolve([
    { _id: estudianteId, fichaId },
    { _id: 'eeeeeeeeeeeeeeeeeeeeeeee', fichaId },
  ]) })

  const req = { query: { fichaId } }
  const res = mockRes()
  await getAsistencias(req, res)

  const inhabilitadas = res.body.filter((x) => x.estado === 'Inhabilitada')
  assert.equal(inhabilitadas.length, 2)
  assert.equal(inhabilitadas[0].motivoInhabilitacion, 'Reunión')
  assert.equal(String(inhabilitadas[0].estudianteId), estudianteId)
})
