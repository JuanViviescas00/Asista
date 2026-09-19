// backend/scripts/normalizar-tardanzas.js
//
// Migración/normalización de los registros 'Tardanza' existentes para aplicar la
// nueva escala escalonada (0 / 5min-1h→1 / 1h-2h→2 / +2h→Falta) en lugar de la
// vieja lógica de ceil() por horas continuas.
//
// Uso:
//   node backend/scripts/normalizar-tardanzas.js             -> DRY-RUN (no escribe nada)
//   node backend/scripts/normalizar-tardanzas.js --confirmar -> aplica los cambios
//
// Reglas:
//   - Recalcula el minuto de marcación (campo `hora`) contra HORARIOS_JORNADA.
//   - 1 o 2 horas  -> actualiza horasTardanza/tiempoTardanza, estado='Tardanza'.
//   - +2h          -> estado='Falta', horasTardanza=0 (no aporta al banco de horas).
//   - <=5min (0h)  -> estado='Presente', horasTardanza=0.

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import Asistencia from '../models/Asistencia.js'
import Ficha from '../models/Ficha.js'
import { HORARIOS_JORNADA } from '../services/asistenciaService.js'

// Carga backend/.env independientemente del directorio desde donde se ejecute.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const CONFIRMAR = process.argv.includes('--confirmar')

// Parsea el campo `hora` a minutos desde medianoche. Soporta:
//   - 24h:  "HH:MM:SS"  (huella/sync)
//   - 12h:  "h:mm:ss a. m." / "p. m." (manual/es-CO)
// Devuelve null si no es parseable.
function minutosDeHora(hora) {
  if (!hora) return null
  const s = String(hora).trim()
  if (!s || s === '—' || s === '-') return null

  const esPM = /p\.?\s*m\.?/i.test(s)
  const esAM = /a\.?\s*m\.?/i.test(s)
  const match = s.match(/(\d{1,2}):(\d{2})/)
  if (!match) return null

  let h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  if (esPM && h < 12) h += 12
  if (esAM && h === 12) h = 0
  return h * 60 + m
}

function tiempoTardanza(horas) {
  return `${horas} ${horas === 1 ? 'hora' : 'horas'}`
}

// Clasifica un registro según la nueva escala.
// Devuelve { categoria, estado?, horas? }.
function clasificar(hora, jornada) {
  const minutosMarcacion = minutosDeHora(hora)
  if (minutosMarcacion == null) return { categoria: 'IGNORADO' }

  const inicio = HORARIOS_JORNADA[jornada] ?? HORARIOS_JORNADA['Mañana']
  const minutosTardanza = minutosMarcacion - inicio

  if (minutosTardanza <= 5) {
    return { categoria: 'A_PRESENTE', estado: 'Presente', horas: 0 }
  }
  if (minutosTardanza <= 60) {
    return { categoria: 'TARDANZA', estado: 'Tardanza', horas: 1 }
  }
  if (minutosTardanza <= 120) {
    return { categoria: 'TARDANZA', estado: 'Tardanza', horas: 2 }
  }
  return { categoria: 'A_FALTA', estado: 'Falta', horas: 0 }
}

async function main() {
  console.log(`[normalizar-tardanzas] Modo: ${CONFIRMAR ? 'EJECUCIÓN (--confirmar)' : 'DRY-RUN'}`)

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 30000,
  })
  console.log('[normalizar-tardanzas] Conectado a MongoDB')

  const registros = await Asistencia.find({ estado: 'Tardanza' }).sort({ fecha: 1 })

  // Resolver jornadas de las fichas referenciadas (una sola consulta).
  const fichaIds = [...new Set(registros.map(r => String(r.fichaId)))]
  const fichaIdsValidos = fichaIds
    .filter(id => mongoose.Types.ObjectId.isValid(id))
    .map(id => new mongoose.Types.ObjectId(id))
  const fichas = await Ficha.find({ _id: { $in: fichaIdsValidos } }).select('jornada')
  const jornadaPorFicha = new Map(fichas.map(f => [String(f._id), f.jornada]))

  const contadores = {
    total: registros.length,
    ignorados: 0,
    sinCambio: 0,
    cambioHoras: 0,
    aFalta: 0,
    aPresente: 0,
  }
  const cambios = []

  for (const r of registros) {
    const jornada = jornadaPorFicha.get(String(r.fichaId)) || 'Mañana'
    const res = clasificar(r.hora, jornada)

    if (res.categoria === 'IGNORADO') {
      contadores.ignorados++
      continue
    }

    const horasActuales = Number(r.horasTardanza) || 0

    if (res.categoria === 'A_PRESENTE') {
      contadores.aPresente++
      cambios.push({
        id: r._id,
        set: { estado: 'Presente', horasTardanza: 0, tiempoTardanza: '0 horas' },
      })
    } else if (res.categoria === 'A_FALTA') {
      contadores.aFalta++
      cambios.push({
        id: r._id,
        set: { estado: 'Falta', horasTardanza: 0, tiempoTardanza: '0 horas' },
      })
    } else if (res.categoria === 'TARDANZA') {
      if (res.horas === horasActuales) {
        contadores.sinCambio++
      } else {
        contadores.cambioHoras++
        cambios.push({
          id: r._id,
          set: { horasTardanza: res.horas, tiempoTardanza: tiempoTardanza(res.horas) },
        })
      }
    }
  }

  console.log('\n===== RESUMEN =====')
  console.log(`Registros 'Tardanza' totales: ${contadores.total}`)
  console.log(`Ignorados (hora no parseable): ${contadores.ignorados}`)
  console.log(`Sin cambio (ya en escala nueva): ${contadores.sinCambio}`)
  console.log(`Cambio solo de horas (sigue Tardanza): ${contadores.cambioHoras}`)
  console.log(`Reclasificados a Falta: ${contadores.aFalta}`)
  console.log(`Reclasificados a Presente: ${contadores.aPresente}`)
  console.log(`Cambios a aplicar: ${cambios.length}`)

  if (!CONFIRMAR) {
    console.log('\n[DRY-RUN] No se escribió nada. Ejecuta con --confirmar para aplicar.')
    await mongoose.disconnect()
    return
  }

  if (cambios.length === 0) {
    console.log('\nNo hay cambios que aplicar.')
    await mongoose.disconnect()
    return
  }

  const ops = cambios.map(c => ({
    updateOne: { filter: { _id: c.id }, update: { $set: c.set } },
  }))
  const resultado = await Asistencia.bulkWrite(ops)
  console.log(`\n[EJECUCIÓN] Aplicados: ${resultado.modifiedCount} registros modificados.`)
  await mongoose.disconnect()
}

main().catch(err => {
  console.error('[normalizar-tardanzas] Error:', err)
  process.exit(1)
})
