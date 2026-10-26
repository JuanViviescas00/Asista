import { test } from 'node:test'
import assert from 'node:assert'
import { normalizarDescripcion, textoJustificacion } from '../utils/descripcionInasistencia.js'

test('normalizarDescripcion: undefined/null -> ""', () => {
  assert.strictEqual(normalizarDescripcion(undefined), '')
  assert.strictEqual(normalizarDescripcion(null), '')
})

test("normalizarDescripcion: '  hola  ' -> 'hola'", () => {
  assert.strictEqual(normalizarDescripcion('  hola  '), 'hola')
})

test('normalizarDescripcion: texto de 500 caracteres -> longitud 200', () => {
  const largo = normalizarDescripcion('a'.repeat(500))
  assert.strictEqual(largo.length, 200)
})

test('textoJustificacion: con descripcion -> devuelve la descripcion', () => {
  assert.strictEqual(textoJustificacion({ tipo: 'Falta', descripcion: '  Enfermedad  ' }), 'Enfermedad')
})

test('textoJustificacion: sin descripcion -> textos fijos exactos', () => {
  assert.strictEqual(textoJustificacion({ tipo: 'Excusada' }), 'Con excusa')
  assert.strictEqual(textoJustificacion({ tipo: 'Falta' }), 'Sin excusa')
  assert.strictEqual(textoJustificacion({ tipo: 'Tardanza' }), 'Sin excusa')
})

test('textoJustificacion: descripcion de solo espacios -> texto fijo', () => {
  assert.strictEqual(textoJustificacion({ tipo: 'Falta', descripcion: '   ' }), 'Sin excusa')
})
