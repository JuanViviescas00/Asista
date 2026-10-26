import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverInstructorInasistencia } from '../scripts/reparar-instructor-inasistencias.js'

// ---------------------------------------------------------------------------
// Pruebas de la resolución de instructor para inasistencias huérfanas.
//
// - Los tests de `resolverInstructorInasistencia` son REALES: importan la
//   función pura exportada por el script (que no carga mongoose a nivel de
//   módulo, por eso puede importarse sin node_modules).
// - Los tests de `calcularInstructorFinal` son TESTS DE RÉPLICA: replican la
//   regla de `instructorFinal` de asistenciaController.createAsistencia
//   (backend/controllers/asistenciaController.js, aprox. líneas 246-254) con la
//   referencia de línea, porque el controlador importa mongoose y no se puede
//   importar aquí sin `node_modules`.
// ---------------------------------------------------------------------------

const ID_A = '507f1f77bcf86cd799439011'
const ID_B = '507f1f77bcf86cd799439012'
const ID_C = '507f1f77bcf86cd799439013'

// ---- resolverInstructorInasistencia (función real del script) ----

test('resolverInstructor: usa Clase primero', () => {
  const r = resolverInstructorInasistencia({
    clase: { instructorId: 'clase-inst' },
    jornada: { instructorId: 'jornada-inst' },
    ficha: { instructorLiderId: 'ficha-lider' },
    instructoresSet: new Set(['jornada-inst'])
  })
  assert.equal(r, 'clase-inst')
})

test('resolverInstructor: sin Clase usa Jornada válida', () => {
  const r = resolverInstructorInasistencia({
    clase: null,
    jornada: { instructorId: 'jornada-inst' },
    ficha: { instructorLiderId: 'ficha-lider' },
    instructoresSet: new Set(['jornada-inst'])
  })
  assert.equal(r, 'jornada-inst')
})

test('resolverInstructor: sin Clase ni Jornada usa líder de ficha', () => {
  const r = resolverInstructorInasistencia({
    clase: null,
    jornada: null,
    ficha: { instructorLiderId: 'ficha-lider' },
    instructoresSet: new Set()
  })
  assert.equal(r, 'ficha-lider')
})

test('resolverInstructor: id de Jornada inexistente en Instructor se ignora', () => {
  const r = resolverInstructorInasistencia({
    clase: null,
    jornada: { instructorId: 'jornada-inexistente' },
    ficha: { instructorLiderId: 'ficha-lider' },
    instructoresSet: new Set()
  })
  assert.equal(r, 'ficha-lider')
})

test('resolverInstructor: nada resoluble -> null', () => {
  const r = resolverInstructorInasistencia({
    clase: null,
    jornada: null,
    ficha: null,
    instructoresSet: new Set()
  })
  assert.equal(r, null)
})

// ---- createAsistencia (réplica de instructorFinal, líneas 246-254) ----

function esObjectIdValido(id) {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)
}

// Réplica exacta de la regla:
//   let instructorFinal
//   if (esAdmin) {
//     instructorFinal = existente?.instructorId
//       || (instructorId && mongoose.Types.ObjectId.isValid(String(instructorId)) ? instructorId : null)
//       || fichaDoc?.instructorLiderId
//       || null
//   } else {
//     instructorFinal = usuarioId || existente?.instructorId || null
//   }
function calcularInstructorFinal({ esAdmin, usuarioId, existente, instructorId, instructorLiderId }) {
  if (esAdmin) {
    return existente?.instructorId
      || (instructorId && esObjectIdValido(String(instructorId)) ? instructorId : null)
      || instructorLiderId
      || null
  }
  return usuarioId || existente?.instructorId || null
}

test('createAsistencia: admin conserva el instructor existente (no roba el dueño)', () => {
  const r = calcularInstructorFinal({
    esAdmin: true,
    usuarioId: 'admin-id',
    existente: { instructorId: 'dueno-original' },
    instructorId: ID_B,
    instructorLiderId: ID_C
  })
  assert.equal(r, 'dueno-original')
})

test('createAsistencia: admin sin existente usa instructorId válido del body', () => {
  const r = calcularInstructorFinal({
    esAdmin: true,
    usuarioId: 'admin-id',
    existente: null,
    instructorId: ID_B,
    instructorLiderId: ID_C
  })
  assert.equal(r, ID_B)
})

test('createAsistencia: admin sin existente y body inválido usa líder de ficha', () => {
  const r = calcularInstructorFinal({
    esAdmin: true,
    usuarioId: 'admin-id',
    existente: null,
    instructorId: 'no-es-objectid',
    instructorLiderId: ID_C
  })
  assert.equal(r, ID_C)
})

test('createAsistencia: admin sin nada resoluble -> null', () => {
  const r = calcularInstructorFinal({
    esAdmin: true,
    usuarioId: 'admin-id',
    existente: null,
    instructorId: null,
    instructorLiderId: null
  })
  assert.equal(r, null)
})

test('createAsistencia: no-admin usa su propio id', () => {
  const r = calcularInstructorFinal({
    esAdmin: false,
    usuarioId: 'usuario-docente',
    existente: null,
    instructorId: ID_B,
    instructorLiderId: ID_C
  })
  assert.equal(r, 'usuario-docente')
})
