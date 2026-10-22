import { test } from 'node:test'
import assert from 'node:assert/strict'
import Inasistencia from '../models/Inasistencia.js'
import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'
import DiaFestivo from '../models/DiaFestivo.js'
import { createAsistencia } from './asistenciaController.js'

const estudianteId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const fichaId = 'bbbbbbbbbbbbbbbbbbbbbbbb'

const estudianteFake = { _id: estudianteId, estado: 'Activo', nombres: 'Ana', apellidos: 'Pérez', numeroDocumento: '111', correo: 'ana@x.co' }
const fichaFake = { _id: fichaId, jornada: 'Mañana', codigoFicha: '123456', nombrePrograma: 'ADSO' }

function mockRes() {
  const res = {}
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

test('carrera en upsert: E11000 con doc SUBIDA responde 409', async () => {
  const origFindOne = Inasistencia.findOne
  const origFindOneAndUpdate = Inasistencia.findOneAndUpdate
  const origEstFindById = Estudiante.findById
  const origFichaFindById = Ficha.findById
  const origDiaFind = DiaFestivo.find

  Estudiante.findById = async () => estudianteFake
  Ficha.findById = async () => fichaFake
  DiaFestivo.find = () => ({ select: () => Promise.resolve([]) })

  let findOneCalls = 0
  Inasistencia.findOne = async () => {
    findOneCalls++
    if (findOneCalls === 1) return null // `existente` inicial
    return { _id: 'cccccccccccccccccccccccc', estadoCarga: 'SUBIDA' }
  }
  Inasistencia.findOneAndUpdate = async () => { throw { code: 11000 } }

  try {
    const req = { body: { estudianteId, fichaId, fecha: '2026-01-05', estado: 'Falta', hora: '08:00', horasTardanza: 0, tiempoTardanza: '0 horas', instructorId: null }, usuario: { id: 'dddddddddddddddddddddddd', rol: 'Administrador' } }
    const res = mockRes()
    await createAsistencia(req, res)
    assert.equal(res.statusCode, 409)
    assert.equal(res.body.error, 'Esta inasistencia ya fue reportada a Sofía Plus y no se puede modificar.')
  } finally {
    Inasistencia.findOne = origFindOne
    Inasistencia.findOneAndUpdate = origFindOneAndUpdate
    Estudiante.findById = origEstFindById
    Ficha.findById = origFichaFindById
    DiaFestivo.find = origDiaFind
  }
})

test('carrera en deleteOne: deletedCount 0 con doc SUBIDA responde 409', async () => {
  const origFindOne = Inasistencia.findOne
  const origDeleteOne = Inasistencia.deleteOne
  const origEstFindById = Estudiante.findById
  const origFichaFindById = Ficha.findById

  Estudiante.findById = async () => estudianteFake
  Ficha.findById = async () => fichaFake

  let findOneCalls = 0
  Inasistencia.findOne = async () => {
    findOneCalls++
    if (findOneCalls === 1) return { _id: 'cccccccccccccccccccccccc', estadoCarga: 'EN_ESPERA', instructorId: null }
    return { _id: 'cccccccccccccccccccccccc', estadoCarga: 'SUBIDA' }
  }
  Inasistencia.deleteOne = async () => ({ deletedCount: 0 })

  try {
    const req = { body: { estudianteId, fichaId, fecha: '2026-01-05', estado: 'Presente', hora: '08:00', horasTardanza: 0, tiempoTardanza: '0 horas', instructorId: null }, usuario: { id: 'dddddddddddddddddddddddd', rol: 'Administrador' } }
    const res = mockRes()
    await createAsistencia(req, res)
    assert.equal(res.statusCode, 409)
    assert.equal(res.body.error, 'Esta inasistencia ya fue reportada a Sofía Plus y no se puede modificar.')
  } finally {
    Inasistencia.findOne = origFindOne
    Inasistencia.deleteOne = origDeleteOne
    Estudiante.findById = origEstFindById
    Ficha.findById = origFichaFindById
  }
})
