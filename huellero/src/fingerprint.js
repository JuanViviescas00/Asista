import koffi from 'koffi'
import { PNG } from 'pngjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dllFolder = path.resolve(__dirname, '../dll')

// Agregar la carpeta ./dll al PATH del proceso de Windows para que se encuentren las dependencias secundarias (dpfpdd.dll)
process.env.PATH = `${dllFolder};${process.env.PATH}`

const DPFJ_SUCCESS = 0
const DPFJ_E_MORE_DATA = 0x05BA000D

const DPFJ_FMD_ANSI_378_2004 = 0x001B0001
const DPFJ_FMD_ISO_19794_2_2005 = 0x01010001

const DPFJ_POSITION_UNKNOWN = 0

let MAX_FMD_SIZE = 26 + 4 + (255 * 6) + 2

// Umbral de coincidencia biométrica (False Accept Rate - FAR)
// En el SDK de DigitalPersona, la puntuación va de 0 (idéntica) a 0x7FFFFFFF (2,147,483,647).
// FAR 1 / 100,000 (0.001% de falso positivo) = 21,474 (Estándar biométrico de alta precisión)
// FAR 1 / 10,000  (0.01% de falso positivo)  = 214,748
let MATCH_THRESHOLD = Number(process.env.BIOMETRIC_MATCH_THRESHOLD) || 21474

// Permite sobrescribir el umbral en runtime (p. ej. desde config.json del huellero).
// El backend no lo llama: sigue usando process.env.BIOMETRIC_MATCH_THRESHOLD.
export function setMatchThreshold(value) {
  const n = Number(value)
  if (Number.isFinite(n) && n > 0) {
    MATCH_THRESHOLD = n
    console.log(`[fingerprint] BIOMETRIC_MATCH_THRESHOLD establecido en ${n}`)
  }
}

let dpfj = null

// Pre-cargar dpfpdd.dll si existe en ./dll para resolver dependencias
try {
  koffi.load(path.join(dllFolder, 'dpfpdd.dll'))
} catch (_) {}

const searchPaths = [
  path.join(dllFolder, 'dpfj.dll'),
  ...(process.resourcesPath ? [path.join(process.resourcesPath, 'dll', 'dpfj.dll')] : []),
  './dll/dpfj.dll',
  'dpfj.dll',
  'C:/Windows/System32/dpfj.dll',
  'C:/Program Files/DigitalPersona/U.are.U SDK/Windows/Lib/x64/dpfj.dll',
  'C:/Program Files (x86)/DigitalPersona/U.are.U SDK/Windows/Lib/x64/dpfj.dll',
]

for (const p of searchPaths) {
  try {
    dpfj = koffi.load(p)
    console.log(`[fingerprint] dpfj.dll cargado exitosamente desde: ${p}`)
    break
  } catch (err) {
    console.log(`[fingerprint] No se pudo cargar desde ${p}: ${err.message}`)
  }
}

if (!dpfj) {
  console.error('[fingerprint] ❌ No se pudo cargar dpfj.dll de ninguna ubicación. Asegúrese de tener instalado el driver/SDK de DigitalPersona y Visual C++ Redistributable x64.')
}

let dpfj_start_enrollment, dpfj_add_to_enrollment, dpfj_create_enrollment_fmd
let dpfj_finish_enrollment, dpfj_create_fmd_from_raw, dpfj_compare

if (dpfj) {
  dpfj_start_enrollment = dpfj.func('dpfj_start_enrollment', 'int', ['int'])
  dpfj_add_to_enrollment = dpfj.func('dpfj_add_to_enrollment', 'int', ['int', 'void*', 'uint32', 'uint32'])
  dpfj_create_enrollment_fmd = dpfj.func('dpfj_create_enrollment_fmd', 'int', ['void*', 'void*'])
  dpfj_finish_enrollment = dpfj.func('dpfj_finish_enrollment', 'int', [])

  dpfj_create_fmd_from_raw = dpfj.func('dpfj_create_fmd_from_raw', 'int', [
    'void*', 'uint32', 'uint32', 'uint32', 'uint32',
    'int', 'uint32', 'int',
    'void*', 'void*',
  ])

  dpfj_compare = dpfj.func('dpfj_compare', 'int', [
    'int', 'void*', 'uint32', 'uint32',
    'int', 'void*', 'uint32', 'uint32',
    'void*',
  ])

  try { dpfj_finish_enrollment() } catch (_) { }
}

const sessions = {}

function bufFromBase64(b64) {
  return Buffer.from(b64, 'base64')
}

function bufToBase64(buf) {
  return buf.toString('base64')
}

function makeSizeBuf(value) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(value, 0)
  return b
}

function readSizeBuf(b) {
  return b.readUInt32LE(0)
}

function dpfjError(code) {
  const errors = {
    0: 'Éxito',
    0x05BA000B: 'Error: Fallo general',
    0x05BA000D: 'Error: Se requiere más memoria',
    0x05BA0014: 'Error: Parámetro inválido',
    0x05BA00C9: 'Error: FMD inválido - la captura no fue buena, intenta de nuevo',
    0x05BA0065: 'Error: FID inválido',
    0x05BA0066: 'Error: Área de huella muy pequeña',
    0x05BA012D: 'Error: Hay un enrollment en progreso',
    0x05BA012E: 'Error: Enrollment no iniciado',
    0x05BA012F: 'Error: Se necesitan más capturas',
    0x05BA0130: 'Error: Las capturas no son consistentes, intenta de nuevo',
  }
  return errors[code] || `Error desconocido (0x${(code >>> 0).toString(16)})`
}

function pngToFmd(pngBase64, dpi = 500) {
  if (!dpfj_create_fmd_from_raw) return null

  const pngBuf = bufFromBase64(pngBase64)
  let png
  try {
    png = PNG.sync.read(pngBuf)
  } catch (e) {
    console.error('[fingerprint] Error decodificando PNG:', e.message)
    return null
  }

  const { width, height } = png
  const grayPixels = Buffer.alloc(width * height)

  for (let i = 0; i < width * height; i++) {
    const r = png.data[i * 4]
    const g = png.data[i * 4 + 1]
    const b = png.data[i * 4 + 2]
    grayPixels[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }

  console.log(`[fingerprint] PNG: ${width}x${height} dpi=${dpi} bytes=${grayPixels.length}`)

  const fmdBuf = Buffer.alloc(MAX_FMD_SIZE)
  const sizeBuf = makeSizeBuf(MAX_FMD_SIZE)

  const result = dpfj_create_fmd_from_raw(
    grayPixels, grayPixels.length, width, height, dpi,
    DPFJ_POSITION_UNKNOWN, 0, DPFJ_FMD_ANSI_378_2004,
    fmdBuf, sizeBuf
  )

  console.log(`[fingerprint] create_fmd_from_raw -> ${dpfjError(result)} fmd_size=${readSizeBuf(sizeBuf)}`)

  if (result === DPFJ_SUCCESS) {
    return fmdBuf.subarray(0, readSizeBuf(sizeBuf))
  }
  return null
}

function compareFmds(fmd1Bytes, fmd2Bytes) {
  if (!dpfj_compare) return { ok: false, score: null }

  const fmd1 = fmd1Bytes.length ? fmd1Bytes : Buffer.alloc(0)
  const fmd2 = fmd2Bytes.length ? fmd2Bytes : Buffer.alloc(0)
  const scoreBuf = makeSizeBuf(0)

  const result = dpfj_compare(
    DPFJ_FMD_ANSI_378_2004, fmd1, fmd1.length, 0,
    DPFJ_FMD_ANSI_378_2004, fmd2, fmd2.length, 0,
    scoreBuf
  )

  const score = readSizeBuf(scoreBuf)
  console.log(`[fingerprint] compare: ${dpfjError(result)} score=${score}`)

  if (result === DPFJ_SUCCESS) {
    return { ok: true, score }
  }
  return { ok: false, score: null }
}

export function isAvailable() {
  return !!(dpfj && dpfj_create_fmd_from_raw && dpfj_compare)
}

export function startSession(studentId, name, documento, dedo) {
  Object.keys(sessions).forEach(k => { sessions[k].active = false })

  const sessionId = 'fp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  sessions[sessionId] = {
    studentId: String(studentId),
    name: name.trim(),
    documento: documento || '',
    dedo: dedo || '',
    captures: 0,
    active: true,
    enrollmentStarted: false,
    ready: false,
  }

  return { sessionId, capturesNeeded: 4 }
}

export function addCapture(sessionId, imageBase64, dpi = 500) {
  const session = sessions[sessionId]
  if (!session || !session.active) {
    return { error: 'Sesión de enrollment no encontrada o ya finalizada' }
  }

  const fmdBuf = pngToFmd(imageBase64, dpi)
  if (!fmdBuf) {
    return { error: 'No se pudo extraer características de la huella. Intenta de nuevo.' }
  }

  console.log(`[fingerprint] Captura convertida a FMD: ${fmdBuf.length} bytes`)

  let result

  if (!session.enrollmentStarted) {
    let startResult = dpfj_start_enrollment(DPFJ_FMD_ANSI_378_2004)
    if (startResult === 0x05BA012D) {
      dpfj_finish_enrollment()
      startResult = dpfj_start_enrollment(DPFJ_FMD_ANSI_378_2004)
    }
    if (startResult !== DPFJ_SUCCESS) {
      session.active = false
      return { error: dpfjError(startResult) }
    }
    session.enrollmentStarted = true
  }

  result = dpfj_add_to_enrollment(DPFJ_FMD_ANSI_378_2004, fmdBuf, fmdBuf.length, 0)

  if (result === DPFJ_E_MORE_DATA) {
    session.captures++
    return {
      ok: true,
      ready: false,
      captures: session.captures,
      message: `Captura ${session.captures} aceptada. Sigue colocando el dedo...`,
    }
  }

  if (result === DPFJ_SUCCESS) {
    session.captures++
    session.ready = true
    return {
      ok: true,
      ready: true,
      captures: session.captures,
      message: 'Suficientes capturas. Completa el registro.',
    }
  }

  return { error: dpfjError(result) }
}

export function completeEnrollment(sessionId) {
  const session = sessions[sessionId]
  if (!session || !session.active) {
    return { error: 'Sesión no encontrada' }
  }

  let fmdBuf = Buffer.alloc(MAX_FMD_SIZE)
  let sizeBuf = makeSizeBuf(MAX_FMD_SIZE)
  let result = dpfj_create_enrollment_fmd(fmdBuf, sizeBuf)

  if (result === DPFJ_E_MORE_DATA) {
    const needed = readSizeBuf(sizeBuf)
    MAX_FMD_SIZE = needed
    fmdBuf = Buffer.alloc(MAX_FMD_SIZE)
    sizeBuf = makeSizeBuf(MAX_FMD_SIZE)
    result = dpfj_create_enrollment_fmd(fmdBuf, sizeBuf)
  }

  if (result !== DPFJ_SUCCESS) {
    dpfj_finish_enrollment()
    session.active = false
    return { error: dpfjError(result) }
  }

  const actualSize = readSizeBuf(sizeBuf)
  const finalFmd = fmdBuf.subarray(0, actualSize)
  const template = bufToBase64(finalFmd)

  dpfj_finish_enrollment()
  session.active = false

  return {
    ok: true,
    template,
    studentId: session.studentId,
    name: session.name,
    dedo: session.dedo,
  }
}

export function cancelSession(sessionId) {
  const session = sessions[sessionId]
  if (session) {
    session.active = false
  }
  if (dpfj) {
    try { dpfj_finish_enrollment() } catch (_) { }
  }
  return { ok: true, message: 'Enrollment cancelado.' }
}

export function verifyFingerprint(imageBase64, enrolledStudents, dpi = 500) {
  const probeFmd = pngToFmd(imageBase64, dpi)
  if (!probeFmd) {
    return { match: false, error: 'No se pudo extraer características de la huella' }
  }

  if (!enrolledStudents || enrolledStudents.length === 0) {
    return { match: false, error: 'No hay estudiantes enrolados para comparar' }
  }

  console.log(`[fingerprint] probe FMD: ${probeFmd.length} bytes, comparando con ${enrolledStudents.length} estudiantes`)

  let bestStudent = null
  let bestScore = 0xFFFFFFFF

  for (const student of enrolledStudents) {
    if (!student.huellaTemplate) continue
    let enrolledBytes
    try {
      enrolledBytes = bufFromBase64(student.huellaTemplate)
    } catch (e) {
      continue
    }

    console.log(`[fingerprint]   comparando con ${student._doc ? JSON.stringify({ nombres: student.nombres, apellidos: student.apellidos }) : 'estudiante'} (template ${enrolledBytes.length} bytes)`)

    const { ok, score } = compareFmds(probeFmd, enrolledBytes)

    if (ok && score < bestScore) {
      bestScore = score
      bestStudent = student
      console.log(`[fingerprint]   NUEVO MEJOR: ${bestStudent.nombres} score=${score}`)
    }
  }

  console.log(`[fingerprint] VERIFY RESULT: best=${bestStudent ? bestStudent.nombres + ' ' + bestStudent.apellidos : 'NONE'} score=${bestScore} threshold=${MATCH_THRESHOLD}`)

  if (bestStudent && bestScore <= MATCH_THRESHOLD) {
    return {
      match: true,
      studentId: bestStudent._id,
      nombres: bestStudent.nombres,
      apellidos: bestStudent.apellidos,
      score: bestScore,
    }
  }

  return { match: false, bestScore: bestScore !== 0xFFFFFFFF ? bestScore : null }
}

export function checkDuplicateFingerprint(newTemplateBase64, enrolledStudents, currentStudentId) {
  if (!newTemplateBase64 || !enrolledStudents || enrolledStudents.length === 0) {
    return { isDuplicate: false }
  }

  let newTemplateBytes
  try {
    newTemplateBytes = bufFromBase64(newTemplateBase64)
  } catch (e) {
    return { isDuplicate: false }
  }

  for (const student of enrolledStudents) {
    if (String(student._id) === String(currentStudentId)) continue
    if (!student.huellaTemplate) continue

    let existingBytes
    try {
      existingBytes = bufFromBase64(student.huellaTemplate)
    } catch (e) {
      continue
    }

    const { ok, score } = compareFmds(newTemplateBytes, existingBytes)
    if (ok && score <= MATCH_THRESHOLD) {
      console.log(`[fingerprint] ⚠️ DUPLICADO: Huella coincide con ${student.nombres} ${student.apellidos} (score=${score})`)
      return {
        isDuplicate: true,
        student: {
          id: student._id,
          nombres: student.nombres,
          apellidos: student.apellidos,
          tipoDocumento: student.tipoDocumento,
          numeroDocumento: student.numeroDocumento,
        },
        score
      }
    }
  }

  return { isDuplicate: false }
}

