import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { actualizarNombre } from './dispositivoController.js'
import Dispositivo from '../models/Dispositivo.js'

test('actualizarNombre: valida id inválido y retorna 400', async () => {
  let statusEnviado = null
  let jsonEnviado = null
  const req = {
    params: { id: 'id-invalido' },
    body: { nombre: 'Portátil Prof. Silvia' }
  }
  const res = {
    status(code) { statusEnviado = code; return this },
    json(data) { jsonEnviado = data; return this }
  }

  await actualizarNombre(req, res)
  assert.equal(statusEnviado, 400)
  assert.equal(jsonEnviado.error, 'ID de dispositivo inválido')
})

test('actualizarNombre: actualiza el nombre del dispositivo correctamente', async () => {
  const fakeId = new mongoose.Types.ObjectId()
  const fakeDoc = {
    _id: fakeId,
    nombre: '',
    tokenHash: 'hash-secreto',
    hardwareFingerprintHash: 'hash-hw',
    save: async function() { return this },
    toObject: function() { return { ...this } }
  }

  // Guardar stub original
  const originalFindById = Dispositivo.findById
  Dispositivo.findById = async (id) => {
    if (String(id) === String(fakeId)) return fakeDoc
    return null
  }

  try {
    let statusEnviado = null
    let jsonEnviado = null
    const req = {
      params: { id: fakeId.toString() },
      body: { nombre: '   Portátil Prof. Silvia   ' }
    }
    const res = {
      status(code) { statusEnviado = code; return this },
      json(data) { jsonEnviado = data; return this }
    }

    await actualizarNombre(req, res)
    assert.equal(fakeDoc.nombre, 'Portátil Prof. Silvia')
    assert.equal(jsonEnviado.ok, true)
    assert.equal(jsonEnviado.dispositivo.nombre, 'Portátil Prof. Silvia')
    assert.equal(jsonEnviado.dispositivo.tokenHash, undefined)
  } finally {
    Dispositivo.findById = originalFindById
  }
})
