import mongoose from 'mongoose'
import { capitalizarTexto, normalizarTipoDocumento, normalizarNumeroDocumento } from '../utils/textUtils.js'

const estudianteSchema = new mongoose.Schema({
  nombres: { type: String, required: true },
  apellidos: { type: String, required: true },
  tipoDocumento: {
    type: String,
    enum: ['CC', 'TI', 'CE', 'PA', 'PEP', 'PPT', 'CD', 'RC', 'SC'],
    default: 'CC'
  },
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

// Normalización automática de datos al validar/crear
estudianteSchema.pre('validate', function(next) {
  if (this.nombres) this.nombres = capitalizarTexto(this.nombres)
  if (this.apellidos) this.apellidos = capitalizarTexto(this.apellidos)
  if (this.tipoDocumento) this.tipoDocumento = normalizarTipoDocumento(this.tipoDocumento)
  if (this.numeroDocumento) this.numeroDocumento = normalizarNumeroDocumento(this.numeroDocumento)
  if (this.correo) this.correo = String(this.correo).trim().toLowerCase()
  if (this.telefono) this.telefono = String(this.telefono).trim()
  if (this.genero) this.genero = capitalizarTexto(this.genero)
  next()
})

// Normalización automática al actualizar
estudianteSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate()
  if (!update) return next()

  const camposTexto = ['nombres', 'apellidos']
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

  if (update.genero) update.genero = capitalizarTexto(update.genero)
  if (update.$set?.genero) update.$set.genero = capitalizarTexto(update.$set.genero)

  next()
})

export default mongoose.model('Estudiante', estudianteSchema)
