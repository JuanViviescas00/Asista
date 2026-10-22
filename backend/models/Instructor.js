import mongoose from 'mongoose'
import { capitalizarTexto } from '../utils/textUtils.js'

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

// Estandarización automática a Capitalize / Title Case al crear o guardar
instructorSchema.pre('validate', function(next) {
  if (this.nombres) this.nombres = capitalizarTexto(this.nombres)
  if (this.apellidos) this.apellidos = capitalizarTexto(this.apellidos)
  if (this.correo) this.correo = String(this.correo).trim().toLowerCase()
  next()
})

// Estandarización automática a Capitalize / Title Case al actualizar
instructorSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate()
  if (!update) return next()
  if (update.nombres) update.nombres = capitalizarTexto(update.nombres)
  if (update.apellidos) update.apellidos = capitalizarTexto(update.apellidos)
  if (update.correo) update.correo = String(update.correo).trim().toLowerCase()
  if (update.$set) {
    if (update.$set.nombres) update.$set.nombres = capitalizarTexto(update.$set.nombres)
    if (update.$set.apellidos) update.$set.apellidos = capitalizarTexto(update.$set.apellidos)
    if (update.$set.correo) update.$set.correo = String(update.$set.correo).trim().toLowerCase()
  }
  next()
})

export default mongoose.model('Instructor', instructorSchema)
