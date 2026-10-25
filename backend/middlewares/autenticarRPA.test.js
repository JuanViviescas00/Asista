import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autenticarRPA, generarToken } from './auth.js'

const CLAVE = 'clave-rpa-super-secreta'

function ejecutar(headers = {}) {
  const req = { headers }
  const res = {
    statusCode: 0,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    }
  }
  let paso = false
  autenticarRPA(req, res, () => { paso = true })
  return { statusCode: res.statusCode, body: res.body, paso }
}

test('sin clave => 401', () => {
  process.env.RPA_API_KEY = CLAVE
  const r = ejecutar({})
  assert.equal(r.paso, false)
  assert.equal(r.statusCode, 401)
  assert.equal(r.body.ok, false)
  assert.ok(r.body.error)
})

test('clave errónea => 401', () => {
  process.env.RPA_API_KEY = CLAVE
  const r = ejecutar({ 'x-rpa-key': 'clave-incorrecta' })
  assert.equal(r.paso, false)
  assert.equal(r.statusCode, 401)
  assert.equal(r.body.ok, false)
})

test('clave correcta => pasa', () => {
  process.env.RPA_API_KEY = CLAVE
  const r = ejecutar({ 'x-rpa-key': CLAVE })
  assert.equal(r.paso, true)
})

test('JWT Administrador => pasa', () => {
  process.env.RPA_API_KEY = CLAVE
  const token = generarToken({ id: 'admin1', rol: 'Administrador', correo: 'admin@test.com', nombre: 'Admin' })
  const r = ejecutar({ authorization: `Bearer ${token}` })
  assert.equal(r.paso, true)
})

test('JWT Instructor => 401', () => {
  process.env.RPA_API_KEY = CLAVE
  const token = generarToken({ id: 'inst1', rol: 'Instructor', correo: 'inst@test.com', nombre: 'Instructor' })
  const r = ejecutar({ authorization: `Bearer ${token}` })
  assert.equal(r.paso, false)
  assert.equal(r.statusCode, 401)
  assert.equal(r.body.ok, false)
})

test('RPA_API_KEY sin definir y cualquier clave => 401', () => {
  delete process.env.RPA_API_KEY
  const r = ejecutar({ 'x-rpa-key': 'cualquier-clave' })
  assert.equal(r.paso, false)
  assert.equal(r.statusCode, 401)
  assert.equal(r.body.ok, false)
})
