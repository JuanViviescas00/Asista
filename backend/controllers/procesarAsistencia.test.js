import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import Inasistencia from '../models/Inasistencia.js'
import Jornada from '../models/Jornada.js'
import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'
import Clase from '../models/Clase.js'
import DiaFestivo from '../models/DiaFestivo.js'
import { procesarAsistencia, getAsistencias } from './asistenciaController.js'

const estudianteId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const fichaId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const claseId = 'cccccccccccccccccccccccc'
const jornadaId = 'dddddddddddddddddddddddd'

const estudianteFake = { _id: estudianteId, estado: 'Activo', nombres: 'Ana', apellidos: 'Pérez', numeroDocumento: '111', correo: 'ana@x.co' }
const fichaFake = { _id: fichaId, jornada: 'Mañana', codigoFicha: '123456', nombrePrograma: 'ADSO' }
const claseFake = { _id: claseId, iniciadaAt: new Date('2026-01-05T08:00:00-05:00') }

// Referencias originales para restaurar.
const orig = {
  est: Estudiante.findById,
  ficha: Ficha.findById,
  fichaOne: Ficha.findOne,
  clase: Clase.findOne,
  dia: DiaFestivo.find,
  jFindOne: Jornada.findOne,
  jFindOneAndUpdate: Jornada.findOneAndUpdate,
  jUpdateOne: Jornada.updateOne,
  jExists: Jornada.exists,
  iFindOne: Inasistencia.findOne,
  iFindOneAndUpdate: Inasistencia.findOneAndUpdate,
  iDeleteOne: Inasistencia.deleteOne,
}

function base() {
  Estudiante.findById = async () => estudianteFake
  Ficha.findById = async () => fichaFake
  Ficha.findOne = async () => null
  DiaFestivo.find = () => ({ select: () => Promise.resolve([]) })
  Clase.findOne = () => ({ sort: () => Promise.resolve(claseFake) })
  Jornada.findOne = async () => null
  Jornada.findOneAndUpdate = async () => ({ _id: jornadaId, fichaId, fecha: '2026-01-05', presentes: [] })
  Jornada.updateOne = async () => ({ modifiedCount: 1 })
  Inasistencia.findOne = async () => null
  Inasistencia.findOneAndUpdate = async (_f, _u) => ({ _id: 'eeeeeeeeeeeeeeeeeeeeeeee', uuid: _u?.$setOnInsert?.uuid || 'no-uuid' })
  Inasistencia.deleteOne = async () => ({ deletedCount: 1 })
}

after(() => {
  Estudiante.findById = orig.est
  Ficha.findById = orig.ficha
  Ficha.findOne = orig.fichaOne
  Clase.findOne = orig.clase
  DiaFestivo.find = orig.dia
  Jornada.findOne = orig.jFindOne
  Jornada.findOneAndUpdate = orig.jFindOneAndUpdate
  Jornada.updateOne = orig.jUpdateOne
  Jornada.exists = orig.jExists
  Inasistencia.findOne = orig.iFindOne
  Inasistencia.findOneAndUpdate = orig.iFindOneAndUpdate
  Inasistencia.deleteOne = orig.iDeleteOne
})

function item(uuid, minutos) {
  const t = new Date(new Date('2026-01-05T08:00:00-05:00').getTime() + minutos * 60000)
  return { uuid, estudianteId, fichaId, instructorId: null, timestamp: t.toISOString(), metodo: 'HUELLA' }
}

test('presente a tiempo -> guardada y push en Jornada.presentes', async () => {
  base()
  let pushFilter = null
  let pushUpdate = null
  Jornada.updateOne = async (filter, update) => {
    pushFilter = filter
    pushUpdate = update
    return { modifiedCount: 1 }
  }
  const r = await procesarAsistencia(item('u-presente', 5))
  assert.equal(r.estado, 'guardada')
  assert.deepEqual(pushFilter, { fichaId, fecha: '2026-01-05', 'presentes.estudianteId': { $ne: estudianteId } })
  assert.equal(pushUpdate.$push.presentes.estudianteId, estudianteId)
  assert.equal(pushUpdate.$push.presentes.uuid, 'u-presente')
})

test('tardanza -> Inasistencia tipo Tardanza', async () => {
  base()
  let upsertUpdate = null
  Inasistencia.findOneAndUpdate = async (_f, update) => {
    upsertUpdate = update
    return { _id: 'eeeeeeeeeeeeeeeeeeeeeeee', uuid: update.$setOnInsert.uuid }
  }
  const r = await procesarAsistencia(item('u-tardanza', 60))
  assert.equal(r.estado, 'guardada')
  assert.equal(upsertUpdate.$setOnInsert.tipo, 'Tardanza')
  assert.equal(upsertUpdate.$setOnInsert.horas, 1)
  assert.equal(upsertUpdate.$setOnInsert.origen, 'huellero')
})

test('falta (>130 min) -> Inasistencia tipo Falta con horas del tope', async () => {
  base()
  let upsertUpdate = null
  Inasistencia.findOneAndUpdate = async (_f, update) => {
    upsertUpdate = update
    return { _id: 'eeeeeeeeeeeeeeeeeeeeeeee', uuid: update.$setOnInsert.uuid }
  }
  const r = await procesarAsistencia(item('u-falta', 240))
  assert.equal(r.estado, 'guardada')
  assert.equal(upsertUpdate.$setOnInsert.tipo, 'Falta')
  assert.equal(upsertUpdate.$setOnInsert.horas, 6) // tope Mañana
  assert.equal(upsertUpdate.$setOnInsert.origen, 'huellero')
})

test('reenvío del mismo uuid -> duplicada', async () => {
  base()
  Jornada.findOne = async () => ({ _id: jornadaId }) // ese uuid ya está en presentes
  const r = await procesarAsistencia(item('u-dup', 5))
  assert.equal(r.estado, 'duplicada')
})

test('marcación tardía (presente) borra la Falta huellero no SUBIDA del cierre', async () => {
  base()
  let deleteFilter = null
  Inasistencia.deleteOne = async (filter) => {
    deleteFilter = filter
    return { deletedCount: 1 }
  }
  const r = await procesarAsistencia(item('u-tardia-presente', 5))
  assert.equal(r.estado, 'guardada')
  assert.deepEqual(deleteFilter, {
    estudianteId,
    fichaId,
    fecha: '2026-01-05',
    tipo: 'Falta',
    origen: 'huellero',
    estadoCarga: { $ne: 'SUBIDA' },
  })
})

test('el borrado NO alcanza a una Falta manual ni a una SUBIDA', async () => {
  base()
  let deleteFilter = null
  Inasistencia.deleteOne = async (filter) => {
    deleteFilter = filter
    return { deletedCount: 0 }
  }
  await procesarAsistencia(item('u-presente2', 5))
  // El filtro restringe a tipo Falta, origen huellero y estadoCarga distinto de SUBIDA:
  // por construcción excluye fallas manuales (origen 'manual') y las ya SUBIDA.
  assert.equal(deleteFilter.tipo, 'Falta')
  assert.equal(deleteFilter.origen, 'huellero')
  assert.deepEqual(deleteFilter.estadoCarga, { $ne: 'SUBIDA' })
})

test('tardanza reemplaza una Falta huellero no SUBIDA (y no toca otras novedades)', async () => {
  base()
  let guardado = null
  Inasistencia.findOne = async (filter) => {
    if (filter && filter.uuid) return null // idempotencia: no existe ese uuid
    return {
      _id: 'eeeeeeeeeeeeeeeeeeeeeeee',
      tipo: 'Falta',
      origen: 'huellero',
      estadoCarga: 'EN_ESPERA',
      save: async function () { guardado = { tipo: this.tipo, horas: this.horas, uuid: this.uuid } },
    }
  }
  const r = await procesarAsistencia(item('u-tardanza-reemplazo', 60))
  assert.equal(r.estado, 'guardada')
  assert.equal(guardado.tipo, 'Tardanza')
  assert.equal(guardado.horas, 1)
  assert.equal(guardado.uuid, 'u-tardanza-reemplazo')
})

test('updateOne sin modificar y exists=false -> error', async () => {
  base()
  Jornada.updateOne = async () => ({ modifiedCount: 0 })
  Jornada.exists = async () => null // no existe el presente
  const r = await procesarAsistencia(item('u-error-presente', 5))
  assert.equal(r.estado, 'error')
  assert.equal(r.error, 'No se pudo registrar el presente')
})

test('asegurarJornada lanza -> error sin excepción', async () => {
  base()
  Jornada.findOneAndUpdate = async () => { throw new Error('boom jornada') }
  const r = await procesarAsistencia(item('u-error-jornada', 5))
  assert.equal(r.estado, 'error')
  assert.equal(r.error, 'boom jornada')
})

function mockRes() {
  const res = {}
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

test('el Presente sintetizado usa el instructor de la marcación', async () => {
  base()
  const instructorMarcacion = { _id: 'mmmmmmmmmmmmmmmmmmmmmmmm', nombres: 'Marc', apellidos: 'M' }
  const instructorJornada = { _id: 'jjjjjjjjjjjjjjjjjjjjjjjj', nombres: 'Jor', apellidos: 'J' }
  const estudiantePopulado = { _id: estudianteId, nombres: 'Ana', apellidos: 'Pérez' }

  Inasistencia.find = () => ({
    populate: () => ({
      populate: () => ({
        sort: () => Promise.resolve([]),
      }),
    }),
  })
  Jornada.find = () => ({
    populate: () => ({
      populate: () => ({
        populate: () => Promise.resolve([{
          _id: jornadaId,
          fichaId,
          fecha: '2026-01-05',
          instructorId: instructorJornada,
          presentes: [{ estudianteId: estudiantePopulado, hora: '08:05:00', uuid: 'u-sint', metodo: 'HUELLA', instructorId: instructorMarcacion }],
        }]),
      }),
    }),
  })

  const req = { query: { fichaId } }
  const res = mockRes()
  await getAsistencias(req, res)

  const presente = res.body.find((x) => x.estado === 'Presente')
  assert.ok(presente)
  assert.equal(presente.instructorId, instructorMarcacion)
  assert.equal(String(presente.estudianteId._id), estudianteId)
})
