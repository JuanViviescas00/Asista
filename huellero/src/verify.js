import { verifyFingerprint } from './fingerprint.js'

function toEngineRecord(record) {
  return {
    _id: record.estudianteId,
    nombres: record.nombres,
    apellidos: record.apellidos,
    huellaTemplate: record.template,
  }
}

export function identificarEstudiante(imageBase64, estudiantesLocales, dpi = 500) {
  const registrosMotor = (estudiantesLocales || []).map(toEngineRecord)
  return verifyFingerprint(imageBase64, registrosMotor, dpi)
}
