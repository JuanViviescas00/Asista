import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Instructor from '../models/Instructor.js'
import Ficha from '../models/Ficha.js'
import Inasistencia from '../models/Inasistencia.js'
import SofiaPlusSync from '../models/SofiaPlusSync.js'
import { getInasistenciasParaRPA, confirmarSubidaSofia } from './instructorController.js'
import { revisarYEncolarSofiaPlus } from '../services/cronService.js'
import { encrypt } from '../services/cryptoService.js'

const instId = '111111111111111111111111'
const fichaId = '222222222222222222222222'
const estId = '333333333333333333333333'
const inaId = '444444444444444444444444'

const orig = {
  instFindOne: Instructor.findOne,
  fichaFind: Ficha.find,
  inaFind: Inasistencia.find,
  inaFindOneAndUpdate: Inasistencia.findOneAndUpdate,
  sofiaFind: SofiaPlusSync.find,
  sofiaFindOneAndUpdate: SofiaPlusSync.findOneAndUpdate,
  sofiaInsertMany: SofiaPlusSync.insertMany,
}

after(() => {
  Instructor.findOne = orig.instFindOne
  Ficha.find = orig.fichaFind
  Inasistencia.find = orig.inaFind
  Inasistencia.findOneAndUpdate = orig.inaFindOneAndUpdate
  SofiaPlusSync.find = orig.sofiaFind
  SofiaPlusSync.findOneAndUpdate = orig.sofiaFindOneAndUpdate
  SofiaPlusSync.insertMany = orig.sofiaInsertMany
})

function mockRes() {
  const res = {}
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

function sampleInasistencia(estadoCarga = 'LISTO_PARA_SUBIR') {
  return {
    _id: inaId,
    fecha: '2026-10-15',
    tipo: 'Falta',
    horas: 6,
    estadoCarga,
    estudianteId: {
      _id: estId,
      tipoDocumento: 'CC',
      numeroDocumento: '1098765432',
      nombres: 'Carlos',
      apellidos: 'Ramirez'
    },
    fichaId: {
      _id: fichaId,
      codigoFicha: '2670123',
      nombrePrograma: 'Análisis y Desarrollo de Software',
      jornada: 'Mañana'
    }
  }
}

test('getInasistenciasParaRPA: lista solo LISTO_PARA_SUBIR con forma exacta de contrato RPA', async () => {
  Instructor.findOne = async () => ({
    _id: instId,
    nombres: 'Laura',
    apellidos: 'Gomez',
    tipoDocumento: 'CC',
    numeroDocumento: '987654321',
    passwordSofiaPlus: encrypt('ClaveSecreta123')
  })

  Ficha.find = async () => [{ _id: fichaId, codigoFicha: '2670123' }]

  let capturedFilter = null
  Inasistencia.find = (filter) => {
    capturedFilter = filter
    return {
      populate: () => ({
        populate: () => ({
          sort: () => Promise.resolve([sampleInasistencia('LISTO_PARA_SUBIR')])
        })
      })
    }
  }

  const req = { params: { documento: '987654321' }, query: {} }
  const res = mockRes()

  await getInasistenciasParaRPA(req, res)

  assert.equal(res.body.ok, true)
  assert.equal(capturedFilter.estadoCarga, 'LISTO_PARA_SUBIR')
  assert.equal(String(capturedFilter.instructorId), instId)
  assert.deepEqual(capturedFilter.tipo, { $in: ['Falta', 'Tardanza', 'Excusada'] })
  assert.equal(res.body.total, 1)

  const item = res.body.inasistencias[0]
  assert.equal(item.asistenciaId, inaId)
  assert.equal(item.fecha, '2026-10-15')
  assert.equal(item.estado, 'Falta')
  assert.equal(item.horas, 6)
  assert.equal(item.ficha.codigo, '2670123')
  assert.equal(item.ficha.nombre, 'Análisis y Desarrollo de Software')
  assert.equal(item.aprendiz.numeroDocumento, '1098765432')
  assert.equal(item.aprendiz.nombreCompleto, 'Carlos Ramirez')
  assert.equal(item.justificacion, 'Falla injustificada')
  assert.equal(res.body.instructor.numeroDocumento, '987654321')
  assert.equal(res.body.instructor.passwordSofiaPlus, 'ClaveSecreta123')
})

test('confirmarSubidaSofia: pasa estadoCarga a SUBIDA, guarda fechaSubidaSofia y sincroniza SofiaPlusSync', async () => {
  let capturedQuery = null
  let capturedUpdate = null

  Inasistencia.findOneAndUpdate = async (query, update) => {
    capturedQuery = query
    capturedUpdate = update
    return {
      _id: inaId,
      fecha: '2026-10-15',
      estadoCarga: 'SUBIDA',
      fechaSubidaSofia: new Date()
    }
  }

  let capturedSyncUpdate = null
  SofiaPlusSync.findOneAndUpdate = async (query, update) => {
    capturedSyncUpdate = { query, update }
    return {}
  }

  const req = { body: { asistenciaId: inaId } }
  const res = mockRes()

  await confirmarSubidaSofia(req, res)

  assert.equal(res.body.ok, true)
  assert.equal(capturedQuery._id, inaId)
  assert.equal(capturedUpdate.$set.estadoCarga, 'SUBIDA')
  assert.ok(capturedUpdate.$set.fechaSubidaSofia instanceof Date)
  assert.equal(res.body.asistencia.subidoSofia, true)
  assert.equal(capturedSyncUpdate.update.$set.estadoSync, 'subido')
})

test('confirmarSubidaSofia: doble confirmación es idempotente y no falla', async () => {
  Inasistencia.findOneAndUpdate = async () => ({
    _id: inaId,
    fecha: '2026-10-15',
    estadoCarga: 'SUBIDA',
    fechaSubidaSofia: new Date()
  })
  SofiaPlusSync.findOneAndUpdate = async () => ({})

  const req = { body: { asistenciaId: inaId } }
  const res1 = mockRes()
  const res2 = mockRes()

  await confirmarSubidaSofia(req, res1)
  await confirmarSubidaSofia(req, res2)

  assert.equal(res1.body.ok, true)
  assert.equal(res2.body.ok, true)
  assert.equal(res1.body.asistencia.subidoSofia, true)
  assert.equal(res2.body.asistencia.subidoSofia, true)
})

test('una inasistencia SUBIDA ya no sale en getInasistenciasParaRPA', async () => {
  Instructor.findOne = async () => ({
    _id: instId,
    nombres: 'Laura',
    apellidos: 'Gomez',
    numeroDocumento: '987654321',
    passwordSofiaPlus: encrypt('ClaveSecreta123')
  })

  Ficha.find = async () => [{ _id: fichaId }]

  Inasistencia.find = (filter) => {
    // Si el filtro busca LISTO_PARA_SUBIR, una inasistencia SUBIDA no hace match
    const docs = filter.estadoCarga === 'LISTO_PARA_SUBIR' ? [] : [sampleInasistencia('SUBIDA')]
    return {
      populate: () => ({
        populate: () => ({
          sort: () => Promise.resolve(docs)
        })
      })
    }
  }

  const req = { params: { documento: '987654321' }, query: {} }
  const res = mockRes()

  await getInasistenciasParaRPA(req, res)

  assert.equal(res.body.ok, true)
  assert.equal(res.body.total, 0)
  assert.equal(res.body.inasistencias.length, 0)
})

test('revisarYEncolarSofiaPlus: lee Inasistencias LISTO_PARA_SUBIR y encola sin duplicar', async () => {
  Inasistencia.find = () => ({
    populate: () => Promise.resolve([
      {
        _id: inaId,
        estudianteId: estId,
        fichaId: { _id: fichaId, jornada: 'Mañana', instructorLiderId: instId },
        fecha: '2026-10-15',
        tipo: 'Falta',
        estadoCarga: 'LISTO_PARA_SUBIR'
      }
    ])
  })

  // Primer pase: no hay nada encolado
  SofiaPlusSync.find = () => ({
    select: () => Promise.resolve([])
  })

  let encolados = []
  SofiaPlusSync.insertMany = async (items) => {
    encolados.push(...items)
    return items
  }

  const resultado1 = await revisarYEncolarSofiaPlus()
  assert.equal(resultado1.encolados, 1)
  assert.equal(encolados.length, 1)
  assert.equal(String(encolados[0].inasistenciaId), inaId)
  assert.equal(encolados[0].resultado, 'Falta')

  // Segundo pase: ya está encolado -> omitidosYaExistentes
  SofiaPlusSync.find = () => ({
    select: () => Promise.resolve([{ inasistenciaId: inaId }])
  })

  const resultado2 = await revisarYEncolarSofiaPlus()
  assert.equal(resultado2.encolados, 0)
  assert.equal(resultado2.omitidosYaExistentes, 1)
})
