import mongoose from 'mongoose'

const sofiaPlusSyncSchema = new mongoose.Schema({
  asistenciaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asistencia', required: true, unique: true },
  estudianteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estudiante', required: true },
  fichaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ficha', required: true },
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor', default: null },
  fecha: { type: String, required: true },
  resultado: { type: String, enum: ['Falta', 'Excusada'], required: true },
  estadoSync: { type: String, enum: ['pendiente', 'subido', 'error'], default: 'pendiente' },
  intentos: { type: Number, default: 0 },
  ultimoError: { type: String, default: null },
  alertaEnviada: { type: Boolean, default: false },
  fechaSubida: { type: Date, default: null },
}, { timestamps: true, collection: 'sofiaplus_sync' })

export default mongoose.model('SofiaPlusSync', sofiaPlusSyncSchema)
