import { test } from 'node:test'
import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// Pruebas de la lógica de decisión de instructorController.confirmarSubidaSofia.
//
// NOTA DE ALCANCE: este entorno no tiene `node_modules` instalado (mongoose,
// jsonwebtoken, etc.) y el alcance del cambio prohíbe `npm install`. Por eso,
// en lugar de importar el controlador (que requiere mongoose), se replica aquí
// la MISMA lógica pura de decisión de la función `confirmarSubidaSofia`
// (backend/controllers/instructorController.js, aprox. líneas 522-593), con la
// referencia de línea de cada bloque, y se valida su comportamiento. Los tests
// de este archivo son TESTS DE RÉPLICA (no ejercitan el controlador real).
// ---------------------------------------------------------------------------

const ID_A = '507f1f77bcf86cd799439011'
const ID_B = '507f1f77bcf86cd799439012'
const ID_C = '507f1f77bcf86cd799439013'

// Réplica de la validación de ObjectId (mongoose.Types.ObjectId.isValid).
// El controlador usa `mongoose.Types.ObjectId.isValid(String(id))`; aquí se
// replica la regla para strings de 24 caracteres hexadecimales.
function esObjectIdValido(id) {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)
}

// Réplica pura de la decisión de confirmarSubidaSofia. Recibe los parámetros
// del body y el listado de documentos coincidentes ({ _id, estadoCarga }) que
// en el controlador devuelve `Inasistencia.find(query).select('_id estadoCarga')`.
function confirmarSubidaDecision(params, coincidentes) {
  const { asistenciaId, inasistenciaId, asistenciaIds, estudianteId, fichaId, fecha } = params

  // Líneas 526-528: construir la lista de ids.
  const idsList = Array.isArray(asistenciaIds) && asistenciaIds.length > 0
    ? asistenciaIds
    : (inasistenciaId || asistenciaId ? [inasistenciaId || asistenciaId] : [])

  // Líneas 530-541: validar ObjectIds.
  for (const id of idsList) {
    if (!esObjectIdValido(String(id))) {
      return { status: 400, body: { ok: false, error: 'Identificador de inasistencia no válido' } }
    }
  }
  if (fichaId && !esObjectIdValido(String(fichaId))) {
    return { status: 400, body: { ok: false, error: 'Identificador de ficha no válido' } }
  }
  if (estudianteId && !esObjectIdValido(String(estudianteId))) {
    return { status: 400, body: { ok: false, error: 'Identificador de estudiante no válido' } }
  }

  // Líneas 543-545: se requiere id(s) o (estudianteId y fecha).
  if (idsList.length === 0 && (!estudianteId || !fecha)) {
    return { status: 400, body: { ok: false, error: 'Se requiere asistenciaId, asistenciaIds o (estudianteId y fecha)' } }
  }

  // Líneas 547-550: sin ids, la búsqueda por (estudianteId, fecha) exige fichaId.
  if (idsList.length === 0 && !fichaId) {
    return { status: 400, body: { ok: false, error: 'Se requiere fichaId junto con estudianteId y fecha' } }
  }

  // Líneas 555-559: countDocuments === 0 -> 404.
  if (coincidentes.length === 0) {
    return { status: 404, body: { ok: false, error: 'Registro(s) de inasistencia no encontrado(s)' } }
  }

  // Líneas 561-573: clasificar estados. El updateMany solo actúa sobre
  // estadoCarga === 'LISTO_PARA_SUBIR', por lo que `actualizados` equivale al
  // número de documentos LISTO_PARA_SUBIR; EN_ESPERA nunca se marca.
  const yaConfirmados = coincidentes.filter((d) => d.estadoCarga === 'SUBIDA').length
  const noListos = coincidentes.filter((d) => d.estadoCarga === 'EN_ESPERA').length
  const actualizados = coincidentes.filter((d) => d.estadoCarga === 'LISTO_PARA_SUBIR').length

  return {
    status: 200,
    body: { ok: true, actualizados, yaConfirmados, noListos }
  }
}

test('confirmarSubidaSofia: id no ObjectId -> 400', () => {
  const r = confirmarSubidaDecision({ asistenciaId: 'id-no-valido' }, [])
  assert.equal(r.status, 400)
  assert.deepEqual(r.body, { ok: false, error: 'Identificador de inasistencia no válido' })
})

test('confirmarSubidaSofia: fichaId y estudianteId inválidos -> 400', () => {
  const rFicha = confirmarSubidaDecision({ asistenciaId: ID_A, fichaId: 'ficha-invalida' }, [])
  assert.equal(rFicha.status, 400)
  assert.deepEqual(rFicha.body, { ok: false, error: 'Identificador de ficha no válido' })

  const rEstudiante = confirmarSubidaDecision({ asistenciaId: ID_A, estudianteId: 'est-invalido' }, [])
  assert.equal(rEstudiante.status, 400)
  assert.deepEqual(rEstudiante.body, { ok: false, error: 'Identificador de estudiante no válido' })
})

test('confirmarSubidaSofia: estudiante+fecha sin fichaId -> 400', () => {
  const r = confirmarSubidaDecision({ estudianteId: ID_A, fecha: '2025-10-25' }, [])
  assert.equal(r.status, 400)
  assert.deepEqual(r.body, { ok: false, error: 'Se requiere fichaId junto con estudianteId y fecha' })
})

test('confirmarSubidaSofia: todas SUBIDA -> 200 con actualizados 0 (idempotente)', () => {
  const coincidentes = [
    { _id: 'a', estadoCarga: 'SUBIDA' },
    { _id: 'b', estadoCarga: 'SUBIDA' }
  ]
  const r = confirmarSubidaDecision({ asistenciaId: ID_A }, coincidentes)
  assert.equal(r.status, 200)
  assert.equal(r.body.ok, true)
  assert.equal(r.body.actualizados, 0)
  assert.equal(r.body.yaConfirmados, 2)
  assert.equal(r.body.noListos, 0)
})

test('confirmarSubidaSofia: EN_ESPERA no se marca como SUBIDA', () => {
  const coincidentes = [
    { _id: 'a', estadoCarga: 'EN_ESPERA' },
    { _id: 'b', estadoCarga: 'LISTO_PARA_SUBIR' }
  ]
  const r = confirmarSubidaDecision({ asistenciaIds: [ID_A, ID_B] }, coincidentes)
  assert.equal(r.status, 200)
  assert.equal(r.body.actualizados, 1)
  assert.equal(r.body.noListos, 1)
  assert.equal(r.body.yaConfirmados, 0)
})

test('confirmarSubidaSofia: mezcla LISTO+SUBIDA -> actualizados = nº de LISTO', () => {
  const coincidentes = [
    { _id: 'a', estadoCarga: 'LISTO_PARA_SUBIR' },
    { _id: 'b', estadoCarga: 'LISTO_PARA_SUBIR' },
    { _id: 'c', estadoCarga: 'SUBIDA' }
  ]
  const r = confirmarSubidaDecision({ asistenciaIds: [ID_A, ID_B, ID_C] }, coincidentes)
  assert.equal(r.status, 200)
  assert.equal(r.body.actualizados, 2)
  assert.equal(r.body.yaConfirmados, 1)
  assert.equal(r.body.noListos, 0)
})
