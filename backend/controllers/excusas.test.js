import { test } from 'node:test'
import assert from 'node:assert/strict'
import { topeHorasPorJornada, validarHorasInasistencia } from '../utils/jornadaUtils.js'

// ---------------------------------------------------------------------------
// Pruebas de la lógica pura de cálculo de horas para 'Excusada' y del flujo de
// decisión de aprobarExcusa y createExcusa.
//
// NOTA DE ALCANCE: este entorno no tiene `node_modules` instalado (mongoose,
// jsonwebtoken, etc.) y el alcance del cambio prohíbe `npm install`. Por eso,
// en lugar de importar los controladores (que requieren mongoose), se extrae
// aquí la MISMA lógica pura de cada bloque de código fuente (con la referencia
// de línea) y se valida su comportamiento. `topeHorasPorJornada` y
// `validarHorasInasistencia` sí se importan directamente de la fuente real.
// ---------------------------------------------------------------------------

// asistenciaController.js (createAsistencia), bloque de cálculo de
// horasPropuestas (aprox. líneas 277-284). Réplica exacta de la regla:
//  - Tardanza: horasTardanza || 0
//  - Excusada: si Number(horasTardanza) es entero con 0 < h < tope -> h; si no -> tope
//  - Falta (u otro): tope
function calcularHorasPropuestas(estado, horasTardanza, tope) {
  if (estado === 'Tardanza') {
    return horasTardanza || 0
  }
  if (estado === 'Excusada') {
    const h = Number(horasTardanza)
    return Number.isInteger(h) && h > 0 && h < tope ? h : tope
  }
  return tope
}

// excusaController.js (aprobarExcusa): decisión completa de aprobación como
// función pura. Réplica exacta de la secuencia del controlador:
//   1. Si la Inasistencia existente está 'SUBIDA' -> 409 y NO se aprueba la excusa.
//   2. Horas: si la existente es 'Tardanza' se conservan sus horas; si no, el tope.
//   3. instructorId: el existente; si no, el líder de la ficha; si no, null.
//   4. descripcion: existente.descripcion || excusa.motivo || ''
function aprobarExcusaDecision({ excusa, existente, instructorLiderId, tope }) {
  if (existente?.estadoCarga === 'SUBIDA') {
    return { status: 409, error: 'Esta inasistencia ya fue reportada a Sofía Plus y no se puede modificar.' }
  }
  excusa.estado = 'Aprobada'
  const horas = existente?.tipo === 'Tardanza' ? existente.horas : tope
  const instructorId = existente?.instructorId || instructorLiderId || null
  const descripcion = (existente?.descripcion || '').trim() || (excusa.motivo || '').trim() || ''
  return { status: 200, ok: true, horas, instructorId, descripcion }
}

// excusaController.js (createExcusa): resolución de motivo y estado inicial
function resolverMotivoYEstado({ rolUsuario, estadoBody, motivoBody, tipoExcusaBody }) {
  const estadoFinal = (rolUsuario !== 'Estudiante' && estadoBody) ? String(estadoBody) : 'Pendiente'
  const motivoFinal = (motivoBody && String(motivoBody).trim()) || (tipoExcusaBody ? `Excusa ${tipoExcusaBody}` : '')
  return { estadoFinal, motivoFinal }
}

test('createAsistencia: Excusada con horasTardanza=2 y tope=6 usa 2 horas', () => {
  const tope = topeHorasPorJornada('Mañana')
  assert.equal(tope, 6)

  const propuestas = calcularHorasPropuestas('Excusada', 2, tope)
  const { ok, horas } = validarHorasInasistencia(propuestas, 'Mañana')

  assert.equal(ok, true)
  assert.equal(horas, 2)
})

test('createAsistencia: Excusada con horasTardanza 0, undefined, 6 o 9 usa el tope (6)', () => {
  const tope = topeHorasPorJornada('Mañana')

  for (const ht of [0, undefined, 6, 9]) {
    const propuestas = calcularHorasPropuestas('Excusada', ht, tope)
    const { ok, horas } = validarHorasInasistencia(propuestas, 'Mañana')
    assert.equal(ok, true)
    assert.equal(horas, 6)
  }
})

test('createAsistencia: Tardanza y Falta mantienen el comportamiento previo', () => {
  const tope = topeHorasPorJornada('Mañana')

  assert.equal(calcularHorasPropuestas('Tardanza', 4, tope), 4)
  assert.equal(calcularHorasPropuestas('Tardanza', 0, tope), 0)
  assert.equal(calcularHorasPropuestas('Falta', undefined, tope), tope)
})

test('aprobarExcusa: devuelve 409 si la Inasistencia está SUBIDA y la excusa NO queda Aprobada', () => {
  const excusa = { estado: 'Pendiente' }

  const r = aprobarExcusaDecision({
    excusa,
    existente: { estadoCarga: 'SUBIDA' },
    instructorLiderId: 'lider-1',
    tope: 6,
  })

  assert.equal(r.status, 409)
  assert.equal(r.error, 'Esta inasistencia ya fue reportada a Sofía Plus y no se puede modificar.')
  assert.equal(excusa.estado, 'Pendiente')
})

test('aprobarExcusa: conserva las horas de una Tardanza existente', () => {
  const r = aprobarExcusaDecision({
    excusa: { estado: 'Pendiente' },
    existente: { tipo: 'Tardanza', horas: 3 },
    instructorLiderId: 'lider-1',
    tope: 6,
  })

  assert.equal(r.status, 200)
  assert.equal(r.horas, 3)
})

test('aprobarExcusa: conserva instructorId existente', () => {
  const r = aprobarExcusaDecision({
    excusa: { estado: 'Pendiente' },
    existente: { tipo: 'Falta', horas: 6, instructorId: 'inst-existente' },
    instructorLiderId: 'lider-nuevo',
    tope: 6,
  })

  assert.equal(r.status, 200)
  assert.equal(r.instructorId, 'inst-existente')
})

test('aprobarExcusa: usa el líder de la ficha cuando no hay instructorId existente', () => {
  const r = aprobarExcusaDecision({
    excusa: { estado: 'Pendiente' },
    existente: { tipo: 'Falta', horas: 6, instructorId: null },
    instructorLiderId: 'lider-nuevo',
    tope: 6,
  })

  assert.equal(r.status, 200)
  assert.equal(r.instructorId, 'lider-nuevo')
})

test('aprobarExcusa: preserva excusa.motivo si la Inasistencia existente no tenía descripcion', () => {
  const r = aprobarExcusaDecision({
    excusa: { estado: 'Pendiente', motivo: 'Cita médica EPS Sanitas' },
    existente: { tipo: 'Falta', horas: 6, instructorId: 'inst-1', descripcion: '' },
    instructorLiderId: 'lider-1',
    tope: 6,
  })

  assert.equal(r.status, 200)
  assert.equal(r.descripcion, 'Cita médica EPS Sanitas')
})

test('createExcusa: fallback de motivo desde tipoExcusa si viene vacío', () => {
  const r = resolverMotivoYEstado({
    rolUsuario: 'Administrador',
    estadoBody: 'Pendiente',
    motivoBody: '',
    tipoExcusaBody: 'Personal'
  })

  assert.equal(r.motivoFinal, 'Excusa Personal')
  assert.equal(r.estadoFinal, 'Pendiente')
})

test('createExcusa: instructor puede radicar directamente en estado Aprobada', () => {
  const r = resolverMotivoYEstado({
    rolUsuario: 'Instructor',
    estadoBody: 'Aprobada',
    motivoBody: 'Permiso avalado en clase',
    tipoExcusaBody: 'Institucional'
  })

  assert.equal(r.estadoFinal, 'Aprobada')
  assert.equal(r.motivoFinal, 'Permiso avalado en clase')
})

test('createExcusa: aprendiz siempre inicia en estado Pendiente aunque envíe Aprobada', () => {
  const r = resolverMotivoYEstado({
    rolUsuario: 'Estudiante',
    estadoBody: 'Aprobada',
    motivoBody: 'Incapacidad médica',
    tipoExcusaBody: 'Medica'
  })

  assert.equal(r.estadoFinal, 'Pendiente')
  assert.equal(r.motivoFinal, 'Incapacidad médica')
})
