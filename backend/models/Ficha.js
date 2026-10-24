import mongoose from 'mongoose'
import { capitalizarTexto, normalizarJornada, normalizarNumeroDocumento, normalizarNombrePrograma } from '../utils/textUtils.js'

const fichaSchema = new mongoose.Schema({
  codigoFicha: { type: String, required: true, unique: true },
  nombrePrograma: { type: String, required: true },
  jornada: { type: String, enum: ['Mañana', 'Tarde', 'Noche', 'Mixta'], default: 'Mañana' },
  aulaAsignada: { type: String, required: true },
  instructorLiderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor', default: null },
  instructores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Instructor' }],
  dispositivoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispositivo', default: null },
  fechaInicio: { type: String, required: true },
  fechaFin: { type: String, required: true },
  estado: { type: String, enum: ['Activo', 'Inactivo'], default: 'Activo' },
  motivo: { type: String, default: '' },
}, { timestamps: true, collection: 'fichas' })

// Normalización automática al crear o validar
fichaSchema.pre('validate', function(next) {
  if (this.codigoFicha) this.codigoFicha = normalizarNumeroDocumento(this.codigoFicha)
  if (this.nombrePrograma) this.nombrePrograma = normalizarNombrePrograma(this.nombrePrograma)
  if (this.jornada) this.jornada = normalizarJornada(this.jornada)
  if (this.aulaAsignada) this.aulaAsignada = capitalizarTexto(this.aulaAsignada)
  next()
})

// Normalización automática al actualizar
fichaSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate()
  if (!update) return next()

  if (update.codigoFicha) update.codigoFicha = normalizarNumeroDocumento(update.codigoFicha)
  if (update.$set?.codigoFicha) update.$set.codigoFicha = normalizarNumeroDocumento(update.$set.codigoFicha)

  if (update.nombrePrograma) update.nombrePrograma = normalizarNombrePrograma(update.nombrePrograma)
  if (update.$set?.nombrePrograma) update.$set.nombrePrograma = normalizarNombrePrograma(update.$set.nombrePrograma)

  if (update.jornada) update.jornada = normalizarJornada(update.jornada)
  if (update.$set?.jornada) update.$set.jornada = normalizarJornada(update.$set.jornada)

  if (update.aulaAsignada) update.aulaAsignada = capitalizarTexto(update.aulaAsignada)
  if (update.$set?.aulaAsignada) update.$set.aulaAsignada = capitalizarTexto(update.$set.aulaAsignada)

  next()
})

export default mongoose.model('Ficha', fichaSchema)
