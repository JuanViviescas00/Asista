import mongoose from 'mongoose'

const estudianteSchema = new mongoose.Schema({
  nombres: { type: String, required: true },
  apellidos: { type: String, required: true },
  tipoDocumento: { type: String, enum: ['CC', 'CE', 'PEP'], default: 'CC' },
  numeroDocumento: { type: String, required: true },
  correo: { type: String, required: true },
  telefono: { type: String, required: true },
  fichaId: { type: mongoose.Schema.Types.Mixed, ref: 'Ficha', default: null },
  genero: { type: String, default: '' },
  estado: { type: String, enum: ['Activo', 'Inactivo', 'Retirado'], default: 'Activo' },
  motivo: { type: String, default: '' },
  estadoAsistencia: { type: String, default: 'Sin registro' },
  huellaEnrolada: { type: Boolean, default: false },
  huellaTemplate: { type: String, default: '' },
  fechaEnrolamiento: { type: String, default: '' },
  dedoEnrolado: { type: String, default: '' },
  huellaTemplate2: { type: String, default: '' },
  dedoEnrolado2: { type: String, default: '' },
  fechaEnrolamiento2: { type: String, default: '' },
}, { timestamps: true, collection: 'estudiantes' })

export default mongoose.model('Estudiante', estudianteSchema)
