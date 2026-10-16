import mongoose from 'mongoose'

const adminSchema = new mongoose.Schema({
  nombre: { type: String, default: 'Administrador' },
  rol: { type: String, default: 'Administrador' },
  telefono: { type: String, default: '' },
  correo: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  codigoRecuperacion: { type: String, default: null },
  expiraCodigoRecuperacion: { type: Date, default: null },
}, { timestamps: true, collection: 'admin' })

export default mongoose.model('Admin', adminSchema)
