import mongoose from 'mongoose'

const dispositivoSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  tokenHash: { type: String, required: true },
  hardwareFingerprintHash: { type: String, default: null },
  hostname: { type: String, default: null },
  nombre: { type: String, default: '' },
  activo: { type: Boolean, default: false },
  aprobadoEn: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  // fichas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ficha' }]  // asociación dispositivo↔ficha pendiente (dashboard Admin)
}, { collection: 'dispositivos' })

export default mongoose.model('Dispositivo', dispositivoSchema)
