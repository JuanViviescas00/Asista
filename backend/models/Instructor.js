import mongoose from 'mongoose'
import { capitalizarTexto, normalizarTipoDocumento, normalizarNumeroDocumento } from '../utils/textUtils.js'

const instructorSchema = new mongoose.Schema({
  nombres: { type: String, required: true },
  apellidos: { type: String, required: true },
  tipoDocumento: {
    type: String,
    enum: ['CC', 'TI', 'CE', 'PA', 'PEP', 'PPT', 'CD', 'RC', 'SC'],
    default: 'CC'
  },
  numeroDocumento: { type: String, required: true, unique: true },
  correo: { type: String, required: true, unique: true },
  telefono: { type: String, required: true },
  especialidad: { type: String, required: true },
  password: { type: String },
  rol: { type: String, enum: ['Instructor'], default: 'Instructor' },
  esLider: { type: Boolean, default: false },
  passwordSofiaPlus: { type: String, default: '' },
  primerLogin: { type: Boolean, default: true },
  debeCambiarPassword: { type: Boolean, default: true },
  estado: { type: String, enum: ['Activo', 'Inactivo'], default: 'Activo' },
  motivo: { type: String, default: '' },
  codigoRecuperacion: { type: String, default: null },
  expiraCodigoRecuperacion: { type: Date, default: null },
}, { timestamps: true, collection: 'instructores' })

// Normalización automática al crear o guardar
instructorSchema.pre('validate', function(next) {
  if (this.nombres) this.nombres = capitalizarTexto(this.nombres)
  if (this.apellidos) this.apellidos = capitalizarTexto(this.apellidos)
  if (this.tipoDocumento) this.tipoDocumento = normalizarTipoDocumento(this.tipoDocumento)
  if (this.numeroDocumento) this.numeroDocumento = normalizarNumeroDocumento(this.numeroDocumento)
  if (this.correo) this.correo = String(this.correo).trim().toLowerCase()
  if (this.telefono) this.telefono = String(this.telefono).trim()
  if (this.especialidad) this.especialidad = capitalizarTexto(this.especialidad)
  next()
})

// Normalización automática al actualizar
instructorSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate()
  if (!update) return next()

  const camposTexto = ['nombres', 'apellidos', 'especialidad']
  for (const c of camposTexto) {
    if (update[c]) update[c] = capitalizarTexto(update[c])
    if (update.$set && update.$set[c]) update.$set[c] = capitalizarTexto(update.$set[c])
  }

  if (update.tipoDocumento) update.tipoDocumento = normalizarTipoDocumento(update.tipoDocumento)
  if (update.$set?.tipoDocumento) update.$set.tipoDocumento = normalizarTipoDocumento(update.$set.tipoDocumento)

  if (update.numeroDocumento) update.numeroDocumento = normalizarNumeroDocumento(update.numeroDocumento)
  if (update.$set?.numeroDocumento) update.$set.numeroDocumento = normalizarNumeroDocumento(update.$set.numeroDocumento)

  if (update.correo) update.correo = String(update.correo).trim().toLowerCase()
  if (update.$set?.correo) update.$set.correo = String(update.$set.correo).trim().toLowerCase()

  if (update.telefono) update.telefono = String(update.telefono).trim()
  if (update.$set?.telefono) update.$set.telefono = String(update.$set.telefono).trim()

  next()
})

export default mongoose.model('Instructor', instructorSchema)
