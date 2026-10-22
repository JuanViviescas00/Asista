import mongoose from 'mongoose'

const inasistenciaSchema = new mongoose.Schema({
  estudianteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estudiante', required: true },
  fichaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ficha', required: true },
  fecha: { type: String, required: true },
  tipo: { type: String, enum: ['Falta', 'Tardanza', 'Excusada'], required: true },
  horas: { type: Number, required: true },
  hora: { type: String, default: '' },
  tiempoTardanza: { type: String, default: '' },
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor' },
  claseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clase', default: null },
  origen: { type: String, enum: ['manual', 'huellero'], required: true },
  uuid: { type: String, index: { unique: true, sparse: true } },
  subidoSofia: { type: Boolean, default: false },
  fechaSubidaSofia: { type: Date, default: null },
}, { timestamps: true, collection: 'inasistencias' })

// Índice único real: solo puede existir UNA inasistencia por (estudiante, ficha, día).
inasistenciaSchema.index(
  { estudianteId: 1, fichaId: 1, fecha: 1 },
  { unique: true }
)

export default mongoose.model('Inasistencia', inasistenciaSchema)
