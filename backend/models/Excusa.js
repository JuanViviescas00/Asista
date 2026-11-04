import mongoose from 'mongoose'

const excusaSchema = new mongoose.Schema({
  estudianteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estudiante', required: true },
  fichaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ficha', required: true },
  fechaInasistencia: { type: String, required: true },
  motivo: { type: String, required: true },
  tipoExcusa: { type: String, enum: ['Medica', 'Personal', 'Institucional'], default: 'Medica' },
  adjuntoNombre: { type: String, default: '' },
  adjuntoData: { type: String, default: null },
  horasDescontar: { type: Number, default: 6 },
  estado: { type: String, enum: ['Pendiente', 'Aprobada', 'Rechazada'], default: 'Pendiente' },
  motivoRechazo: { type: String, default: '' },
}, { timestamps: true, collection: 'excusas' })

export default mongoose.model('Excusa', excusaSchema)
