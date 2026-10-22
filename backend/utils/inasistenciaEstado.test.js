import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularEstadoCarga } from './inasistenciaEstado.js'

const hoyStr = '2026-03-02'

test('fecha pasada lejana -> LISTO_PARA_SUBIR', () => {
  assert.equal(
    calcularEstadoCarga({ fecha: '2026-01-05', tipo: 'Falta', jornada: 'Mañana', hoyStr }),
    'LISTO_PARA_SUBIR'
  )
})

test('fecha de hoy (dentro de la ventana) -> EN_ESPERA', () => {
  assert.equal(
    calcularEstadoCarga({ fecha: hoyStr, tipo: 'Falta', jornada: 'Mañana', hoyStr }),
    'EN_ESPERA'
  )
})

test('dentro de la ventana -> EN_ESPERA', () => {
  // 2026-02-27 -> 2026-03-02 = 1 día hábil (menos de 6).
  assert.equal(
    calcularEstadoCarga({ fecha: '2026-02-27', tipo: 'Falta', jornada: 'Mañana', hoyStr }),
    'EN_ESPERA'
  )
})

test('ventana vencida -> LISTO_PARA_SUBIR', () => {
  // 2026-02-16 -> 2026-03-02 = 10+ días hábiles.
  assert.equal(
    calcularEstadoCarga({ fecha: '2026-02-16', tipo: 'Falta', jornada: 'Mañana', hoyStr }),
    'LISTO_PARA_SUBIR'
  )
})

test('nocturna con sábado cuenta como día hábil', () => {
  const sabado = '2026-01-10'
  const hoySabado = '2026-01-17'
  // Noche: 6 días hábiles (sábados incluidos) -> vencida.
  assert.equal(
    calcularEstadoCarga({ fecha: sabado, tipo: 'Falta', jornada: 'Noche', hoyStr: hoySabado }),
    'LISTO_PARA_SUBIR'
  )
  // Mañana: 5 días hábiles (sábado no cuenta) -> dentro de la ventana.
  assert.equal(
    calcularEstadoCarga({ fecha: sabado, tipo: 'Falta', jornada: 'Mañana', hoyStr: hoySabado }),
    'EN_ESPERA'
  )
})

test('festivo reduce los días hábiles (dentro de ventana -> EN_ESPERA)', () => {
  const festivosSet = new Set(['2026-01-07'])
  // 2026-01-05 -> 2026-01-13: sin festivo = 6 días hábiles; con festivo = 5.
  assert.equal(
    calcularEstadoCarga({ fecha: '2026-01-05', tipo: 'Falta', jornada: 'Mañana', festivosSet, hoyStr: '2026-01-13' }),
    'EN_ESPERA'
  )
  assert.equal(
    calcularEstadoCarga({ fecha: '2026-01-05', tipo: 'Falta', jornada: 'Mañana', festivosSet: new Set(), hoyStr: '2026-01-13' }),
    'LISTO_PARA_SUBIR'
  )
})

test('Excusada siempre LISTO_PARA_SUBIR (incluso hoy)', () => {
  assert.equal(
    calcularEstadoCarga({ fecha: hoyStr, tipo: 'Excusada', jornada: 'Mañana', hoyStr }),
    'LISTO_PARA_SUBIR'
  )
})
