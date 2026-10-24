import mongoose from 'mongoose'

const programaSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  codigo: {
    type: String,
    trim: true,
    default: '',
  },
  sigla: {
    type: String,
    trim: true,
    default: '',
  },
  nivel: {
    type: String,
    enum: ['Técnico', 'Tecnólogo', 'Especialización Tecnológica', 'Operario', 'Auxiliar', 'Curso Especial', 'Otro'],
    default: 'Tecnólogo',
  },
  alias: [{
    type: String,
    trim: true,
  }],
  estado: {
    type: String,
    enum: ['Activo', 'Inactivo'],
    default: 'Activo',
  },
  descripcion: {
    type: String,
    default: '',
  },
}, { timestamps: true, collection: 'programas' })

programaSchema.pre('validate', function(next) {
  if (this.nombre) this.nombre = this.nombre.trim()
  if (this.sigla) this.sigla = this.sigla.trim().toUpperCase()
  if (this.codigo) this.codigo = this.codigo.trim().toUpperCase()
  next()
})

export default mongoose.model('Programa', programaSchema)
