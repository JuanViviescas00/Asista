import mongoose from 'mongoose'

const instructorSchema = new mongoose.Schema({
  nombres: { type: String, required: true },
  apellidos: { type: String, required: true },
  tipoDocumento: { type: String, enum: ['CC', 'CE', 'PEP'], default: 'CC' },
  numeroDocumento: { type: String, required: true, unique: true },
  correo: { type: String, required: true, unique: true },
  telefono: { type: String, required: true },
  especialidad: { type: String, required: true },
  password: { type: String },
  rol: { type: String, enum: ['Instructor'], default: 'Instructor' },
  esLider: { type: Boolean, default: false },
  passwordSofiaPlus: { type: String, default: '' },
  estado: { type: String, enum: ['Activo', 'Inactivo'], default: 'Activo' },
  motivo: { type: String, default: '' },
  codigoRecuperacion: { type: String, default: null },
  expiraCodigoRecuperacion: { type: Date, default: null },
}, { timestamps: true, collection: 'instructores' })

export default mongoose.model('Instructor', instructorSchema)
