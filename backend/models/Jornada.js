import mongoose from 'mongoose'

const jornadaSchema = new mongoose.Schema({
  fichaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ficha', required: true },
  fecha: { type: String, required: true },
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor' },
  origen: { type: String, enum: ['manual', 'huellero'], required: true },
  inhabilitada: { type: Boolean, default: false },
  motivoInhabilitacion: { type: String, default: '' },
  claseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clase', default: null },
}, { timestamps: true, collection: 'jornadas' })

// Índice único: solo puede existir UNA jornada por (ficha, día).
jornadaSchema.index(
  { fichaId: 1, fecha: 1 },
  { unique: true }
)

export default mongoose.model('Jornada', jornadaSchema)
