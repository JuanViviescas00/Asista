import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluarRiesgoDesercion } from './desercionUtils.js'

const hoyStr = '2026-03-02'

const D1 = '2026-01-05'
const D2 = '2026-01-06'
const D3 = '2026-01-07'
const D4 = '2026-01-08'
const D5 = '2026-01-09'
const D6 = '2026-01-12'
const D7 = '2026-01-13'
const D8 = '2026-01-14'
const D9 = '2026-01-15'

const falta = (fecha) => ({ fecha, tipo: 'Falta', horas: 6 })
const tardanza = (fecha, horas) => ({ fecha, tipo: 'Tardanza', horas })
const excusada = (fecha) => ({ fecha, tipo: 'Excusada', horas: 6 })

test('3 faltas continuas → deserción', () => {
  const res = evaluarRiesgoDesercion({
    jornadas: [D1, D2, D3].map((f) => ({ fecha: f })),
    inasistencias: [falta(D1), falta(D2), falta(D3)],
    festivosSet: new Set(),
    jornadaFicha: 'Mañana',
    hoyStr,
  })
  assert.equal(res.nivel, 'desercion')
  assert.equal(res.continuas, 3)
  assert.equal(res.acumuladas, 3)
})

test('5 faltas salteadas (no continuas) → deserción por acumuladas', () => {
  const res = evaluarRiesgoDesercion({
    jornadas: [D1, D2, D3, D4, D5, D6, D7, D8, D9].map((f) => ({ fecha: f })),
    inasistencias: [falta(D1), falta(D3), falta(D5), falta(D7), falta(D9)],
    festivosSet: new Set(),
    jornadaFicha: 'Mañana',
    hoyStr,
  })
  assert.equal(res.nivel, 'desercion')
  assert.equal(res.continuas, 1)
  assert.equal(res.acumuladas, 5)
})

test('excusa en medio corta la cadena', () => {
  const res = evaluarRiesgoDesercion({
    jornadas: [D1, D2, D3].map((f) => ({ fecha: f })),
    inasistencias: [falta(D1), excusada(D2), falta(D3)],
    festivosSet: new Set(),
    jornadaFicha: 'Mañana',
    hoyStr,
  })
  assert.equal(res.continuas, 1)
  assert.equal(res.acumuladas, 2)
  assert.equal(res.nivel, 'ninguno')
})

test('falta dentro de la ventana (pendiente) no cuenta', () => {
  const res = evaluarRiesgoDesercion({
    jornadas: [{ fecha: hoyStr }],
    inasistencias: [falta(hoyStr)],
    festivosSet: new Set(),
    jornadaFicha: 'Mañana',
    hoyStr,
  })
  assert.equal(res.continuas, 0)
  assert.equal(res.acumuladas, 0)
  assert.equal(res.nivel, 'ninguno')
})

test('horas de tardanza suman un día equivalente', () => {
  // 3 tardanzas de 2 horas = 6 horas = 1 día (tope Mañana = 6)
  const res = evaluarRiesgoDesercion({
    jornadas: [D1, D2, D3].map((f) => ({ fecha: f })),
    inasistencias: [tardanza(D1, 2), tardanza(D2, 2), tardanza(D3, 2)],
    festivosSet: new Set(),
    jornadaFicha: 'Mañana',
    hoyStr,
  })
  assert.equal(res.continuas, 0)
  assert.equal(res.acumuladas, 1)
})

test('festivo en medio no corta la cadena', () => {
  const res = evaluarRiesgoDesercion({
    jornadas: [D1, D3].map((f) => ({ fecha: f })),
    inasistencias: [falta(D1), falta(D3)],
    festivosSet: new Set([D2]),
    jornadaFicha: 'Mañana',
    hoyStr,
  })
  assert.equal(res.continuas, 2)
})

test('jornada nocturna: tope 5 horas (una tardanza de 5h = 1 día)', () => {
  const res = evaluarRiesgoDesercion({
    jornadas: [D1].map((f) => ({ fecha: f })),
    inasistencias: [tardanza(D1, 5)],
    festivosSet: new Set(),
    jornadaFicha: 'Noche',
    hoyStr,
  })
  assert.equal(res.acumuladas, 1)
})

test('jornada nocturna: un sábado cuenta como día hábil (la falta vence)', () => {
  const sabado = '2026-01-10'
  const hoySabado = '2026-01-17'
  const nocturno = evaluarRiesgoDesercion({
    jornadas: [{ fecha: sabado }],
    inasistencias: [falta(sabado)],
    festivosSet: new Set(),
    jornadaFicha: 'Noche',
    hoyStr: hoySabado,
  })
  const diurno = evaluarRiesgoDesercion({
    jornadas: [{ fecha: sabado }],
    inasistencias: [falta(sabado)],
    festivosSet: new Set(),
    jornadaFicha: 'Mañana',
    hoyStr: hoySabado,
  })
  assert.equal(nocturno.acumuladas, 1) // nocturna cuenta el sábado → vencida
  assert.equal(diurno.acumuladas, 0)   // diurna no cuenta el sábado → pendiente
})

test('riesgo antiguo ya resuelto no muestra riesgo', () => {
  // 2 faltas continuas en el pasado, luego un día asistido corta la cadena.
  const res = evaluarRiesgoDesercion({
    jornadas: [D1, D2, D3].map((f) => ({ fecha: f })),
    inasistencias: [falta(D1), falta(D2)], // D3 asistido
    festivosSet: new Set(),
    jornadaFicha: 'Mañana',
    hoyStr,
  })
  assert.equal(res.continuas, 2)        // máximo histórico
  assert.equal(res.continuasActuales, 0) // cadena actual (resuelta)
  assert.equal(res.acumuladas, 2)
  assert.equal(res.nivel, 'ninguno')     // riesgo NO se dispara por el máximo histórico
})

test('jornada inhabilitada no cuenta ni corta', () => {
  const res = evaluarRiesgoDesercion({
    jornadas: [
      { fecha: D1 },
      { fecha: D2, inhabilitada: true },
      { fecha: D3 },
    ],
    inasistencias: [falta(D1), falta(D2), falta(D3)],
    festivosSet: new Set(),
    jornadaFicha: 'Mañana',
    hoyStr,
  })
  // La falta del día inhabilitado se ignora: solo cuentan D1 y D3.
  assert.equal(res.acumuladas, 2)
  assert.equal(res.continuas, 2)
})

test('falta sin jornada cuenta en acumuladas pero no en continuas', () => {
  const sinJornada = '2026-01-19'
  const res = evaluarRiesgoDesercion({
    jornadas: [{ fecha: D1 }],
    inasistencias: [falta(D1), falta(sinJornada)],
    festivosSet: new Set(),
    jornadaFicha: 'Mañana',
    hoyStr,
  })
  assert.equal(res.acumuladas, 2) // ambas faltas cuentan (la sin jornada también)
  assert.equal(res.continuas, 1)  // solo D1 tiene jornada
})
