import mongoose from 'mongoose'

const inasistenciaSchema = new mongoose.Schema({
  estudianteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estudiante', required: true },
  fichaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ficha', required: true },
  fecha: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD.'],
  },
  tipo: { type: String, enum: ['Falta', 'Tardanza', 'Excusada'], required: true },
  horas: {
    type: Number,
    required: true,
    min: [0, 'Las horas de inasistencia no pueden ser negativas.'],
    validate: {
      validator: Number.isInteger,
      message: 'Las horas de inasistencia deben ser un número entero.',
    },
  },
  hora: { type: String, default: '' },
  tiempoTardanza: { type: String, default: '' },
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor' },
  claseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clase', default: null },
  origen: { type: String, enum: ['manual', 'huellero'], required: true },
  uuid: { type: String, index: { unique: true, sparse: true } },
  estadoCarga: {
    type: String,
    enum: ['EN_ESPERA', 'LISTO_PARA_SUBIR', 'SUBIDA'],
    default: 'EN_ESPERA',
    required: true,
  },
  fechaSubidaSofia: { type: Date, default: null },
}, { timestamps: true, collection: 'inasistencias' })

// Índice único real: solo puede existir UNA inasistencia por (estudiante, ficha, día).
inasistenciaSchema.index(
  { estudianteId: 1, fichaId: 1, fecha: 1 },
  { unique: true }
)

// Índice para el proceso de subida y el cron de actualización de estados.
inasistenciaSchema.index({ estadoCarga: 1 })

export default mongoose.model('Inasistencia', inasistenciaSchema)
