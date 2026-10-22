// backend/scripts/simular-huellero.js
// Simula un huellero local contra POST /api/asistencias/sync (SOLO para pruebas locales).
// Rechaza ejecutarse si MONGODB_URI apunta a Atlas.
//
// Uso:
//   node scripts/simular-huellero.js --setup
//   node scripts/simular-huellero.js --sync --estudiante <id> --ficha <id> [--timestamp ISO]
//   node scripts/simular-huellero.js --setup --sync --estudiante <id> --ficha <id> [--url http://localhost:3000]
import 'dotenv/config'
import mongoose from 'mongoose'
import bcryptjs from 'bcryptjs'
import { randomUUID } from 'crypto'
import { parseArgs } from 'node:util'
import Dispositivo from '../models/Dispositivo.js'

const args = parseArgs({
  options: {
    setup: { type: 'boolean', default: false },
    sync: { type: 'boolean', default: false },
    'device-id': { type: 'string', default: 'sim-huellero-local' },
    token: { type: 'string', default: 'sim-token-local' },
    estudiante: { type: 'string', default: '' },
    ficha: { type: 'string', default: '' },
    timestamp: { type: 'string', default: '' },
    url: { type: 'string', default: 'http://localhost:3000' },
  },
})
const o = args.values

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/huellero'

if (/mongodb\+srv/i.test(MONGODB_URI) || /mongodb\.net/i.test(MONGODB_URI)) {
  console.error('[simular-huellero] ABORTADO: MONGODB_URI apunta a Atlas (mongodb+srv / mongodb.net). Este script es solo para local.')
  process.exit(1)
}

async function main() {
  await mongoose.connect(MONGODB_URI)

  if (o.setup) {
    const tokenHash = await bcryptjs.hash(o.token, 10)
    await Dispositivo.updateOne(
      { deviceId: o['device-id'] },
      { $set: { tokenHash, activo: true, aprobadoEn: new Date(), nombre: 'Simulador local' } },
      { upsert: true }
    )
    console.log(`[simular-huellero] Dispositivo listo: ${o['device-id']} (token ${o.token})`)
  }

  if (o.sync) {
    if (!o.estudiante || !o.ficha) {
      console.error('[simular-huellero] Para --sync se requieren --estudiante y --ficha.')
      process.exit(1)
    }
    const items = [{
      uuid: randomUUID(),
      estudianteId: o.estudiante,
      fichaId: o.ficha,
      timestamp: o.timestamp || new Date().toISOString(),
      metodo: 'HUELLA',
    }]
    const res = await fetch(`${o.url}/api/asistencias/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: o['device-id'], token: o.token, asistencias: items }),
    })
    const data = await res.json().catch(() => ({}))
    console.log(`[simular-huellero] HTTP ${res.status}`, JSON.stringify(data))
  }

  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('[simular-huellero] Error:', e)
  process.exit(1)
})
