import mongoose from 'mongoose'

const configuracionSistemaSchema = new mongoose.Schema({
  clave: { type: String, required: true, unique: true, default: 'general' },
  correoCoordinador: { type: String, trim: true, lowercase: true, default: '' },
  correoBienestar: { type: String, trim: true, lowercase: true, default: '' },
  actualizadoPor: {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    rol: { type: String, required: true },
  },
}, { timestamps: true, collection: 'configuracion_sistema' })

export default mongoose.model('ConfiguracionSistema', configuracionSistemaSchema)
