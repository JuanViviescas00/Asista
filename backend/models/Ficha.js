import mongoose from 'mongoose'

const fichaSchema = new mongoose.Schema({
  codigoFicha: { type: String, required: true, unique: true },
  nombrePrograma: { type: String, required: true },
  jornada: { type: String, enum: ['Mañana', 'Tarde', 'Noche'], default: 'Mañana' },
  aulaAsignada: { type: String, required: true },
  instructorLiderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor', default: null },
  instructores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Instructor' }],
  dispositivoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispositivo', default: null },
  fechaInicio: { type: String, required: true },
  fechaFin: { type: String, required: true },
  estado: { type: String, enum: ['Activo', 'Inactivo'], default: 'Activo' },
  motivo: { type: String, default: '' },
}, { timestamps: true, collection: 'fichas' })

export default mongoose.model('Ficha', fichaSchema)
