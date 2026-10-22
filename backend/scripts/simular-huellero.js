// backend/scripts/simular-huellero.js
// Simula un huellero local contra POST /api/asistencias/sync (SOLO para pruebas locales).
// Rechaza ejecutarse si MONGODB_URI apunta a Atlas.
//
// Uso:
//   node scripts/simular-huellero.js --setup
//   node scripts/simular-huellero.js --sync --estudiante <id> --ficha <id> [--timestamp ISO] [--uuid <uuid>]
//   node scripts/simular-huellero.js --crear-clase --ficha <id> --instructor <id>
//   node scripts/simular-huellero.js --cerrar-clase <claseId>
//   node scripts/simular-huellero.js --setup --sync --estudiante <id> --ficha <id> [--url http://localhost:3000]
import 'dotenv/config'
import mongoose from 'mongoose'
import bcryptjs from 'bcryptjs'
import { randomUUID } from 'crypto'
import { parseArgs } from 'node:util'
import Dispositivo from '../models/Dispositivo.js'
import Clase from '../models/Clase.js'
import { finalizarClase } from '../services/asistenciaService.js'

const args = parseArgs({
  options: {
    setup: { type: 'boolean', default: false },
    sync: { type: 'boolean', default: false },
    'crear-clase': { type: 'boolean', default: false },
    'cerrar-clase': { type: 'string', default: '' },
    'device-id': { type: 'string', default: 'sim-huellero-local' },
    token: { type: 'string', default: 'sim-token-local' },
    estudiante: { type: 'string', default: '' },
    ficha: { type: 'string', default: '' },
    instructor: { type: 'string', default: '' },
    timestamp: { type: 'string', default: '' },
    uuid: { type: 'string', default: '' },
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
      uuid: o.uuid || randomUUID(),
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

  if (o['crear-clase']) {
    if (!o.ficha || !o.instructor) {
      console.error('[simular-huellero] Para --crear-clase se requieren --ficha y --instructor.')
      process.exit(1)
    }
    const clase = await Clase.findOneAndUpdate(
      { deviceId: o['device-id'], estado: 'Activa' },
      {
        $set: { fichaId: o.ficha, instructorId: o.instructor, iniciadaAt: new Date() },
        $setOnInsert: { deviceId: o['device-id'], estado: 'Activa' },
      },
      { upsert: true, new: true }
    )
    console.log(`[simular-huellero] Clase Activa: ${clase._id} (device ${o['device-id']}, ficha ${o.ficha}, instructor ${o.instructor})`)
  }

  if (o['cerrar-clase']) {
    const resultado = await finalizarClase(o['cerrar-clase'])
    console.log('[simular-huellero] finalizarClase:', JSON.stringify(resultado))
  }

  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('[simular-huellero] Error:', e)
  process.exit(1)
})
