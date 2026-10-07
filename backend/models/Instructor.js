import mongoose from 'mongoose'

const instructorSchema = new mongoose.Schema({
  nombres: { type: String, required: true },
  apellidos: { type: String, required: true },
  tipoDocumento: { type: String, enum: ['CC', 'CE', 'PEP'], default: 'CC' },
  numeroDocumento: { type: String, required: true },
  correo: { type: String, required: true },
  telefono: { type: String, required: true },
  especialidad: { type: String, required: true },
  password: { type: String, default: 'sena2026' },
  rol: { type: String, enum: ['Instructor'], default: 'Instructor' },
  esLider: { type: Boolean, default: false },
  passwordSofiaPlus: { type: String, default: '' },
  estado: { type: String, enum: ['Activo', 'Inactivo'], default: 'Activo' },
  motivo: { type: String, default: '' },
}, { timestamps: true, collection: 'instructores' })

export default mongoose.model('Instructor', instructorSchema)
