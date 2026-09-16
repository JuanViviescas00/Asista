import mongoose from 'mongoose'

const asistenciaSchema = new mongoose.Schema({
  estudianteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estudiante', required: true },
  fichaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ficha', required: true },
  fecha: { type: String, required: true },
  estado: { type: String, enum: ['Presente', 'Tardanza', 'Falta', 'Excusada', 'Inhabilitada'], required: true },
  hora: { type: String, default: '—' },
  horasTardanza: { type: Number, default: 0 },
  tiempoTardanza: { type: String, default: '0 horas' },
  motivoInhabilitacion: { type: String, default: '' },
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor' },
  uuid: { type: String, index: { unique: true, sparse: true } },
  metodo: { type: String, enum: ['HUELLA', 'MANUAL'], default: 'HUELLA' },
}, { timestamps: true, collection: 'asistencias' })

// Índice único real: elimina la ventana de carrera del anti-duplicado en
// procesarAsistencia. Solo puede existir UNA asistencia por (estudiante, ficha, día).
asistenciaSchema.index(
  { estudianteId: 1, fichaId: 1, fecha: 1 },
  { unique: true }
)

export default mongoose.model('Asistencia', asistenciaSchema)
