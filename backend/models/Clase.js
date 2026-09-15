import mongoose from 'mongoose'

const claseSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  fichaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ficha', required: true },
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor', required: true },
  estado: { type: String, enum: ['Activa', 'Finalizada'], default: 'Activa' },
  iniciadaAt: { type: Date, default: Date.now },
  finalizadaAt: { type: Date, default: null },
}, { timestamps: true, collection: 'clases' })

// Índice parcial único: solo UNA clase Activa por deviceId, garantizado por
// MongoDB. Permite histórico de clases Finalizadas (múltiples docs por device),
// pero impide dos Activas simultáneas (respalda el upsert atómico de activar()).
claseSchema.index(
  { deviceId: 1 },
  { unique: true, partialFilterExpression: { estado: 'Activa' } }
)

export default mongoose.model('Clase', claseSchema)
