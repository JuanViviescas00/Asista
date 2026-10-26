import mongoose from 'mongoose'

const reporteDesercionSchema = new mongoose.Schema({
  estudianteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estudiante', required: true },
  fichaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ficha', required: true },
  fechasFallas: { type: [String], default: [] },
  destinatarios: { type: [String], default: [] },
  simulado: { type: Boolean, default: true },
  enviadoPor: {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    rol: { type: String, required: true },
  },
}, { timestamps: true, collection: 'reportes_desercion' })

export default mongoose.model('ReporteDesercion', reporteDesercionSchema)
