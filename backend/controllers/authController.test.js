import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import Admin from '../models/Admin.js'
import Instructor from '../models/Instructor.js'
import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'
import { hashPassword } from '../services/passwordService.js'
import { decrypt } from '../services/cryptoService.js'
import { login, completarPrimerLoginInstructor } from './authController.js'

const orig = {
  adminFindOne: Admin.findOne,
  instructorFindOne: Instructor.findOne,
  instructorFindById: Instructor.findById,
  estudianteFindOne: Estudiante.findOne,
  fichaFindOne: Ficha.findOne,
}

after(() => {
  Admin.findOne = orig.adminFindOne
  Instructor.findOne = orig.instructorFindOne
  Instructor.findById = orig.instructorFindById
  Estudiante.findOne = orig.estudianteFindOne
  Ficha.findOne = orig.fichaFindOne
})

function mockRes() {
  const res = {}
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

test('authController - login de instructor por primera vez incluye primerLogin: true', async () => {
  Admin.findOne = async () => null
  Estudiante.findOne = async () => null

  const initialPasswordHash = await hashPassword('1005229628')
  const mockInstructor = {
    _id: '6ad013bcb79fd8afb173762c',
    nombres: 'Jorge Luis',
    apellidos: 'Roa Toro',
    numeroDocumento: '1005229628',
    correo: 'jorge.roa@sena.edu.co',
    password: initialPasswordHash,
    passwordSofiaPlus: '',
    primerLogin: true,
    debeCambiarPassword: true,
    estado: 'Activo',
    save: async () => mockInstructor
  }

  Instructor.findOne = async () => mockInstructor
  Ficha.findOne = async () => null

  const req = {
    body: {
      correo: '1005229628',
      password: '1005229628'
    }
  }
  const res = mockRes()
  await login(req, res)

  assert.equal(res.body.ok, true)
  assert.equal(res.body.usuario.primerLogin, true)
  assert.equal(res.body.usuario.tienePasswordSofia, false)
})

test('authController - completarPrimerLoginInstructor rechaza contraseña actual incorrecta', async () => {
  const initialPasswordHash = await hashPassword('1005229628')
  const mockInstructor = {
    _id: '6ad013bcb79fd8afb173762c',
    nombres: 'Jorge Luis',
    apellidos: 'Roa Toro',
    numeroDocumento: '1005229628',
    correo: 'jorge.roa@sena.edu.co',
    password: initialPasswordHash,
    passwordSofiaPlus: '',
    primerLogin: true,
    debeCambiarPassword: true,
    save: async () => mockInstructor
  }

  Instructor.findById = async () => mockInstructor

  const req = {
    usuario: { id: mockInstructor._id },
    body: {
      passwordActual: 'clave_erronea',
      nuevaPassword: 'NuevaClaveSegura2026',
      passwordSofiaPlus: 'SofiaClave123'
    }
  }
  const res = mockRes()
  await completarPrimerLoginInstructor(req, res)

  assert.equal(res.statusCode, 400)
  assert.match(res.body.error, /contraseña actual/i)
})

test('authController - completarPrimerLoginInstructor rechaza si la nueva contraseña es igual a la actual o < 6 caracteres', async () => {
  const initialPasswordHash = await hashPassword('1005229628')
  const mockInstructor = {
    _id: '6ad013bcb79fd8afb173762c',
    password: initialPasswordHash,
    save: async () => mockInstructor
  }
  Instructor.findById = async () => mockInstructor

  // Caso corta (< 6 caracteres)
  const req1 = {
    usuario: { id: mockInstructor._id },
    body: {
      passwordActual: '1005229628',
      nuevaPassword: '123',
      passwordSofiaPlus: 'Sofia123'
    }
  }
  const res1 = mockRes()
  await completarPrimerLoginInstructor(req1, res1)
  assert.equal(res1.statusCode, 400)
  assert.match(res1.body.error, /al menos 6 caracteres/i)

  // Caso igual a la actual
  const req2 = {
    usuario: { id: mockInstructor._id },
    body: {
      passwordActual: '1005229628',
      nuevaPassword: '1005229628',
      passwordSofiaPlus: 'Sofia123'
    }
  }
  const res2 = mockRes()
  await completarPrimerLoginInstructor(req2, res2)
  assert.equal(res2.statusCode, 400)
  assert.match(res2.body.error, /diferente/i)
})

test('authController - completarPrimerLoginInstructor guarda con éxito, cifra Sofia Plus y desactiva primerLogin', async () => {
  const initialPasswordHash = await hashPassword('1005229628')
  let guardado = false
  const mockInstructor = {
    _id: '6ad013bcb79fd8afb173762c',
    nombres: 'Jorge Luis',
    apellidos: 'Roa Toro',
    numeroDocumento: '1005229628',
    correo: 'jorge.roa@sena.edu.co',
    password: initialPasswordHash,
    passwordSofiaPlus: '',
    primerLogin: true,
    debeCambiarPassword: true,
    save: async () => {
      guardado = true
      return mockInstructor
    }
  }

  Instructor.findById = async () => mockInstructor
  Ficha.findOne = async () => null

  const req = {
    usuario: { id: mockInstructor._id },
    body: {
      passwordActual: '1005229628',
      nuevaPassword: 'NuevaPassword2026',
      passwordSofiaPlus: 'ClaveSofiaSecreta123'
    }
  }
  const res = mockRes()
  await completarPrimerLoginInstructor(req, res)

  assert.equal(guardado, true)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.usuario.primerLogin, false)
  assert.equal(res.body.usuario.tienePasswordSofia, true)
  assert.equal(mockInstructor.primerLogin, false)
  assert.equal(mockInstructor.debeCambiarPassword, false)
  assert.equal(decrypt(mockInstructor.passwordSofiaPlus), 'ClaveSofiaSecreta123')
})
