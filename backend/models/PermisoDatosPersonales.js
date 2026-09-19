import mongoose from 'mongoose'

const permisoDatosPersonalesSchema = new mongoose.Schema({
  estudianteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estudiante', required: true, unique: true },
  fechaAceptacion: { type: Date, default: Date.now },
  aceptadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor', required: true },
  versionTerminos: { type: String, required: true },
}, { timestamps: true, collection: 'permisos_datos_personales' })

export default mongoose.model('PermisoDatosPersonales', permisoDatosPersonalesSchema)
