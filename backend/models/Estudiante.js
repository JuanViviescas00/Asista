import mongoose from 'mongoose'
import { capitalizarTexto } from '../utils/textUtils.js'

const estudianteSchema = new mongoose.Schema({
  nombres: { type: String, required: true },
  apellidos: { type: String, required: true },
  tipoDocumento: { type: String, enum: ['CC', 'CE', 'PEP'], default: 'CC' },
  numeroDocumento: { type: String, required: true, unique: true },
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

// Estandarización automática a Capitalize / Title Case al crear o guardar
estudianteSchema.pre('validate', function(next) {
  if (this.nombres) this.nombres = capitalizarTexto(this.nombres)
  if (this.apellidos) this.apellidos = capitalizarTexto(this.apellidos)
  next()
})

// Estandarización automática a Capitalize / Title Case al actualizar
estudianteSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate()
  if (!update) return next()
  if (update.nombres) update.nombres = capitalizarTexto(update.nombres)
  if (update.apellidos) update.apellidos = capitalizarTexto(update.apellidos)
  if (update.$set) {
    if (update.$set.nombres) update.$set.nombres = capitalizarTexto(update.$set.nombres)
    if (update.$set.apellidos) update.$set.apellidos = capitalizarTexto(update.$set.apellidos)
  }
  next()
})

export default mongoose.model('Estudiante', estudianteSchema)
