import { randomUUID } from 'crypto'
import { getConfig, iniciarRegistroDispositivo, tieneIdentidad, reiniciarIdentidadYRegistrar } from './config.js'
import * as store from './store.js'
import wsClient from './ws-client.js'
import { capturarHuella, inicializarCaptura, cancelarCapturaActual, getDevActual } from './capture.js'
import { notificarPendienteNuevo, sincronizar } from './scheduler.js'
import { identificarEstudiante } from '../verify.js'
import * as fingerprint from '../fingerprint.js'

let docente = null
let avisoSesion = null
let onEstadoChange = null
let onEnrolarProgreso = null
let enrolamientoCancelado = false
let plantillasRetryTimer = null
let plantillasFichaActual = null
let descargandoPlantillas = false

// Registro en memoria de la última asistencia registrada por (claveClase, estudianteId).
// Sobrevive a la sincronización (a diferencia de la cola de pendientes, que se limpia
// tras el sync), para dar feedback correcto de duplicado dentro de la ventana de 2 min.
// La garantía dura de "un registro por estudiante/ficha/día" está en el backend (sync).
const ultimasAsistencias = new Map()

export function setOnEstadoChange(cb) {
  onEstadoChange = cb
}

export function setOnEnrolarProgreso(cb) {
  onEnrolarProgreso = cb
}

export function cancelarEnrolamiento() {
  enrolamientoCancelado = true
  cancelarCapturaEnCurso()
}

export function cancelarCapturaEnCurso() {
  const dev = getDevActual()
  if (!dev) {
    return { ok: false, error: 'No hay captura en curso' }
  }
  return cancelarCapturaActual(dev)
}

function notificarEstado() {
  if (onEstadoChange) onEstadoChange()
}

function notificarProgresoEnrolamiento(payload) {
  if (onEnrolarProgreso) onEnrolarProgreso(payload)
}

export async function init() {
  await store.init()
  inicializarCaptura()
  fingerprint.setMatchThreshold(getConfig().BIOMETRIC_MATCH_THRESHOLD)
  wsClient.onConnectionChange(notificarEstado)
  wsClient.onConnectionChange((conectado) => {
    if (conectado) {
      const clase = store.getClaseActiva()
      if (clase?.fichaId) {
        descargarPlantillas(clase.fichaId)
      }
    }
  })
  wsClient.onActivate((payload) => {
    store.setClaseActiva({
      fichaId: payload?.fichaId ?? null,
      instructorId: payload?.instructorId ?? null,
      claseId: payload?.claseId ?? null,
      codigoFicha: payload?.codigoFicha ?? null,
      estado: 'Activa',
    })
    notificarEstado()
    if (payload?.fichaId) {
      descargarPlantillas(payload.fichaId)
    }
  })
  wsClient.onDeactivate(() => {
    store.setClaseActiva(null)
    detenerReintentoPlantillas()
    notificarEstado()
  })
  wsClient.onDeviceNotFound(async () => {
    // El backend ya no reconoce este deviceId (BD restaurada/restablecida).
    // Se limpia la identidad local y se re-registra desde cero para que el
    // Admin pueda volver a aprobarlo en el panel.
    const resultado = await reiniciarIdentidadYRegistrar()
    if (resultado?.ok) {
      store.setClaseActiva(null)
      wsClient.connect(getConfig())
      notificarEstado()
    }
  })
  wsClient.connect(getConfig())
  sincronizar()
  iniciarRegistroDispositivo(() => {
    // Registro GENUINAMENTE NUEVO (deviceId+token frescos): el estado local de
    // claseActiva pertenecía a una identidad anterior ya inválida. Se limpia antes
    // de conectar, sin tocar pendientes.json ni plantillas.json (no dependen de deviceId).
    store.setClaseActiva(null)
    wsClient.connect(getConfig())
    notificarEstado()
  })
}

export function getStatus() {
  return {
    online: wsClient.isConnected(),
    claseActiva: store.getClaseActiva() || null,
    dispositivoRegistrado: tieneIdentidad(),
    ultimoRechazo: wsClient.getUltimoRechazo(),
    docente: docente
      ? {
          id: docente.id,
          correo: docente.correo,
          nombre: docente.nombre,
          esLider: docente.esLider,
          rolDetallado: docente.rolDetallado,
        }
      : null,
    avisoSesion,
  }
}

// Descarga y cachea las plantillas de la ficha (identificación en el kiosko).
// Si falla, NO desactiva la clase: solo reintenta con backoff (60s) hasta tener
// éxito o hasta que la clase se desactive. Mismo espíritu que el reintento de
// registro de dispositivo de la Fase 3.
async function descargarPlantillas(fichaId) {
  if (!fichaId) return
  // Guarda anti-concurrencia: evita lanzar varias descargas simultáneas si
  // varias capturas/reconexiones ocurren seguidas mientras la caché sigue vacía.
  if (descargandoPlantillas) return

  const { backendUrl, deviceId, token } = getConfig()
  if (!deviceId || !token) {
    programarReintentoPlantillas(fichaId)
    return
  }

  descargandoPlantillas = true
  try {
    const res = await fetch(`${backendUrl}/api/fichas/${encodeURIComponent(fichaId)}/plantillas`, {
      headers: {
        'x-device-id': String(deviceId),
        'x-device-token': String(token),
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const plantillas = await res.json().catch(() => null)
    if (!Array.isArray(plantillas)) {
      throw new Error('Respuesta inválida del backend')
    }

    store.guardarPlantillasFicha(fichaId, plantillas)
    limpiarReintentoPlantillas()
    console.log(`[engine] Plantillas de la ficha ${fichaId} cacheadas: ${plantillas.length}`)
  } catch (err) {
    console.warn(`[engine] No se pudo descargar las plantillas de la ficha ${fichaId}: ${err.message}`)
    programarReintentoPlantillas(fichaId)
  } finally {
    descargandoPlantillas = false
  }
}

function programarReintentoPlantillas(fichaId) {
  plantillasFichaActual = String(fichaId)
  limpiarReintentoPlantillas()
  plantillasRetryTimer = setTimeout(() => {
    const clase = store.getClaseActiva()
    if (clase && String(clase.fichaId) === plantillasFichaActual) {
      descargarPlantillas(plantillasFichaActual)
    } else {
      plantillasFichaActual = null
    }
  }, 60000)
}

function limpiarReintentoPlantillas() {
  if (plantillasRetryTimer) {
    clearTimeout(plantillasRetryTimer)
    plantillasRetryTimer = null
  }
}

function detenerReintentoPlantillas() {
  plantillasFichaActual = null
  limpiarReintentoPlantillas()
}

export async function capturarYVerificar() {
  const clase = store.getClaseActiva()
  if (!clase) {
    return { ok: false, error: 'No hay clase activa en este dispositivo' }
  }

  let imagen
  let dpi
  let capturaTimestamp
  try {
    const captura = await capturarHuella()
    imagen = captura.imagen
    dpi = captura.dpi
    // Momento real de la captura (no del guardado posterior).
    capturaTimestamp = Date.now()
  } catch (err) {
    return { ok: false, error: err.message }
  }

  const plantillas = await store.getPlantillasFicha(clase.fichaId)
  if (plantillas.length === 0) {
    // Sin plantillas cacheadas: dispara una descarga inmediata (auto-curación),
    // sin bloquear esta verificación (que devolverá "sin match" esta ronda).
    descargarPlantillas(clase.fichaId)
  }
  const resultado = identificarEstudiante(imagen, plantillas, dpi)

  // Si identificó a un estudiante, persistir la asistencia localmente (offline-ready).
  if (resultado.match && resultado.studentId) {
    let duplicado = false
    try {
      duplicado = registrarAsistenciaLocal(clase, resultado, capturaTimestamp)
    } catch (err) {
      // Un fallo de guardado no debe ocultar el resultado de identificación.
      console.error('[engine] No se pudo guardar la asistencia pendiente:', err.message)
    }
    resultado.duplicado = duplicado
  }

  return resultado
}

// Ventana anti-duplicado: evita registrar dos veces al mismo estudiante en la
// misma clase en un lapso corto (p. ej. el estudiante coloca el dedo dos veces).
const VENTANA_DEDUP_MS = 2 * 60 * 1000

function registrarAsistenciaLocal(clase, resultado, timestamp) {
  const estudianteId = String(resultado.studentId)
  // La clase se identifica por claseId; si aún no llega (backend no lo envía), por fichaId.
  const claveClase = clase.claseId != null ? String(clase.claseId) : String(clase.fichaId)

  const claveEstudiante = `${claveClase}:${estudianteId}`

  // 1. Cola local no sincronizada (sobrevive a reinicio, pero se limpia al sincronizar).
  const pendientes = store.getPendientes()
  const yaMarcadoPendiente = pendientes.some((p) => {
    const pClaveClase = p.claseId != null ? String(p.claseId) : String(p.fichaId)
    return (
      String(p.estudianteId) === estudianteId &&
      pClaveClase === claveClase &&
      p.timestamp != null &&
      timestamp - p.timestamp <= VENTANA_DEDUP_MS
    )
  })

  // 2. Registro en memoria (sobrevive a la sincronización, no al reinicio).
  const ultimo = ultimasAsistencias.get(claveEstudiante)
  const yaMarcadoReciente = ultimo != null && (timestamp - ultimo <= VENTANA_DEDUP_MS)

  if (yaMarcadoPendiente || yaMarcadoReciente) {
    console.log(`[engine] Asistencia ya registrada para ${estudianteId} en esta clase; se omite duplicado.`)
    return true
  }

  const asistencia = {
    uuid: randomUUID(),
    estudianteId: resultado.studentId,
    fichaId: clase.fichaId ?? null,
    claseId: clase.claseId ?? null,
    instructorId: clase.instructorId ?? null,
    timestamp,
    metodo: 'HUELLA',
  }

  store.guardarPendiente(asistencia)
  ultimasAsistencias.set(claveEstudiante, timestamp)
  console.log(`[engine] Asistencia guardada localmente: ${asistencia.uuid} (estudiante ${estudianteId})`)

  // Avisa al scheduler para intentar sincronizar pronto (sin esperar al polling).
  notificarPendienteNuevo()
  return false
}

const LOGIN_TIMEOUT_MS = 7000
const LOGIN_RETRY_DELAY_MS = 2500

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function peticionLogin(backendUrl, correo, password) {
  return fetch(`${backendUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo, password }),
    signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
  })
}

export async function loginDocente(correo, password) {
  if (!correo || !password) {
    return { ok: false, error: 'Ingresa correo y contraseña' }
  }

  const { backendUrl } = getConfig()

  let res
  try {
    res = await peticionLogin(backendUrl, correo, password)
  } catch {
    // Primer fallo de RED (sin respuesta del servidor): un único reintento tras
    // una espera corta, para cubrir el arranque del backend (Atlas conectando).
    // NO reintenta 401/403 (el backend sí respondió; reintentar no cambia nada).
    await esperar(LOGIN_RETRY_DELAY_MS)
    try {
      res = await peticionLogin(backendUrl, correo, password)
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.' }
    }
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (res.status === 401) {
    return { ok: false, error: 'Correo o contraseña incorrectos' }
  }

  if (res.status === 403) {
    return { ok: false, error: data?.error || 'Tu cuenta no puede acceder al modo docente' }
  }

  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || 'No se pudo iniciar sesión' }
  }

  const usuario = data.usuario
  if (!usuario || usuario.rol !== 'Instructor') {
    return { ok: false, error: 'Solo los instructores pueden acceder al modo docente' }
  }

  docente = {
    id: usuario.id,
    correo: usuario.correo,
    nombre: usuario.nombre,
    rol: usuario.rol,
    esLider: !!usuario.esLider,
    rolDetallado: usuario.rolDetallado || 'Instructor',
    token: data.token || null,
  }

  return { ok: true, docente: { correo: docente.correo, nombre: docente.nombre } }
}

export async function getFichasLider() {
  if (!docente) {
    return { ok: false, error: 'No hay sesión docente activa' }
  }

  const { backendUrl } = getConfig()

  let res
  try {
    res = await fetch(`${backendUrl}/api/fichas/mis-fichas/${docente.id}`, {
      headers: docente.token ? { Authorization: `Bearer ${docente.token}` } : {},
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return { ok: false, error: 'Sin conexión: no se pueden obtener las fichas' }
  }

  if (res.status === 401) {
    docente = null
    avisoSesion = 'Tu sesión expiró. Vuelve a iniciar sesión.'
    notificarEstado()
    setTimeout(() => {
      avisoSesion = null
      notificarEstado()
    }, 6000)
    return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  if (!res.ok) {
    return { ok: false, error: 'No se pudieron obtener las fichas del líder' }
  }

  const fichas = await res.json().catch(() => null)
  const lista = Array.isArray(fichas) ? fichas : []
  const fichasLider = lista.filter((f) => f.esLider)

  if (fichasLider.length === 0) {
    return { ok: false, error: 'No tienes ninguna ficha asignada como líder' }
  }

  return { ok: true, fichas: fichasLider }
}

export async function getEstudiantesFicha(fichaId) {
  if (!fichaId) {
    return { ok: false, error: 'Ficha no especificada' }
  }

  const { backendUrl } = getConfig()

  let res
  try {
    res = await fetch(`${backendUrl}/api/estudiantes?fichaId=${encodeURIComponent(fichaId)}`, { signal: AbortSignal.timeout(10000) })
  } catch {
    return { ok: false, error: 'Sin conexión: no se pueden obtener los estudiantes' }
  }

  if (!res.ok) {
    return { ok: false, error: 'No se pudieron obtener los estudiantes' }
  }

  const estudiantes = await res.json().catch(() => null)
  return { ok: true, estudiantes: Array.isArray(estudiantes) ? estudiantes : [] }
}

function headersDocente() {
  return docente?.token ? { Authorization: `Bearer ${docente.token}` } : {}
}

function marcarSesionExpirada() {
  docente = null
  avisoSesion = 'Tu sesión expiró. Vuelve a iniciar sesión.'
  notificarEstado()
  setTimeout(() => {
    avisoSesion = null
    notificarEstado()
  }, 6000)
}

export async function consultarConsentimientoDatos(estudianteId) {
  if (!estudianteId) {
    return { ok: false, error: 'Estudiante no especificado' }
  }
  if (!docente?.token) {
    return { ok: false, error: 'No hay sesión docente activa' }
  }

  const { backendUrl } = getConfig()

  let res
  try {
    res = await fetch(
      `${backendUrl}/api/estudiantes/${encodeURIComponent(estudianteId)}/consentimiento-datos`,
      { headers: headersDocente(), signal: AbortSignal.timeout(10000) }
    )
  } catch {
    return { ok: false, error: 'Sin conexión: no se pudo consultar el consentimiento de datos' }
  }

  if (res.status === 401) {
    marcarSesionExpirada()
    return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    return { ok: false, error: data?.error || 'No se pudo consultar el consentimiento de datos' }
  }

  return { ok: true, existe: !!data?.existe, ...(data || {}) }
}

export async function registrarConsentimientoDatos({ estudianteId, instructorId, versionTerminos }) {
  if (!estudianteId || !instructorId || !versionTerminos) {
    return { ok: false, error: 'Faltan datos para registrar el consentimiento' }
  }
  if (!docente?.token) {
    return { ok: false, error: 'No hay sesión docente activa' }
  }

  const { backendUrl } = getConfig()

  let res
  try {
    res = await fetch(
      `${backendUrl}/api/estudiantes/${encodeURIComponent(estudianteId)}/consentimiento-datos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headersDocente() },
        body: JSON.stringify({ instructorId, versionTerminos }),
        signal: AbortSignal.timeout(10000),
      }
    )
  } catch {
    return { ok: false, error: 'Sin conexión: no se pudo registrar el consentimiento de datos' }
  }

  if (res.status === 401) {
    marcarSesionExpirada()
    return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    return { ok: false, error: data?.error || 'No se pudo registrar el consentimiento de datos' }
  }

  return { ok: true, ...(data || {}) }
}

export async function guardarTemplate({ estudianteId, fichaId, dedo, template, slot }) {
  if (!estudianteId || !fichaId || !template) {
    return { ok: false, error: 'Faltan datos para guardar la huella' }
  }

  const { backendUrl } = getConfig()

  const body = { estudianteId, fichaId, dedo, template }
  if (slot != null) body.slot = slot

  let res
  try {
    res = await fetch(`${backendUrl}/api/enrolamiento/guardar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    return { ok: false, error: 'Sin conexión: no se pudo guardar la huella' }
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    return { ok: false, error: data?.error || 'No se pudo guardar la huella' }
  }

  return { ok: true, ...data }
}

export async function enrolarEstudiante({ estudianteId, fichaId, dedo, nombre, slot }) {
  if (!estudianteId || !fichaId) {
    return { ok: false, error: 'Selecciona un estudiante' }
  }

  const clase = store.getClaseActiva()
  if (clase) {
    return { ok: false, error: 'Finaliza la clase activa en este dispositivo antes de enrolar' }
  }

  if (!fingerprint.isAvailable()) {
    return { ok: false, error: 'Motor biométrico no disponible (dpfj.dll)' }
  }

  const session = fingerprint.startSession(estudianteId, nombre || '', '', dedo || '')
  const sessionId = session.sessionId
  const total = session.capturesNeeded || 4
  const MAX_FALLOS_CONSECUTIVOS = 3

  enrolamientoCancelado = false

  try {
    let actual = 0
    let fallosConsecutivos = 0

    while (true) {
      if (enrolamientoCancelado) {
        fingerprint.cancelSession(sessionId)
        notificarProgresoEnrolamiento({ fase: 'cancelado', actual, total, mensaje: 'Enrolamiento cancelado' })
        return { ok: false, error: 'Enrolamiento cancelado' }
      }

      notificarProgresoEnrolamiento({
        fase: 'esperando_captura',
        actual,
        total,
        mensaje: `Coloque el dedo en el lector (${actual + 1}/${total})`,
      })

      let captura
      try {
        captura = await capturarHuella()
      } catch (err) {
        console.error(`[engine] Fallo en capturarHuella() (intento fallido #${fallosConsecutivos + 1}/${MAX_FALLOS_CONSECUTIVOS}):`, err.message || err)
        if (enrolamientoCancelado) {
          console.warn('[engine] Enrolamiento cancelado por el usuario tras fallo de captura.')
          fingerprint.cancelSession(sessionId)
          notificarProgresoEnrolamiento({ fase: 'cancelado', actual, total, mensaje: 'Enrolamiento cancelado' })
          return { ok: false, error: 'Enrolamiento cancelado' }
        }

        fallosConsecutivos++
        const motivo = err.message || 'No se pudo capturar la huella'
        notificarProgresoEnrolamiento({ fase: 'captura_fallida', actual, total, mensaje: `${motivo} — reintentando` })

        if (fallosConsecutivos >= MAX_FALLOS_CONSECUTIVOS) {
          console.error(`[engine] Se alcanzaron los ${MAX_FALLOS_CONSECUTIVOS} fallos consecutivos en enrolamiento. Cancelando sesión. Último error: ${motivo}`)
          fingerprint.cancelSession(sessionId)
          notificarProgresoEnrolamiento({ fase: 'cancelado', actual, total, mensaje: 'Enrolamiento cancelado por fallos consecutivos' })
          return { ok: false, error: `No se pudo capturar una huella válida: ${motivo}` }
        }
        continue // reintenta la MISMA captura (no avanza el contador)
      }

      const res = fingerprint.addCapture(sessionId, captura.imagen, captura.dpi)
      if (res.error) {
        fingerprint.cancelSession(sessionId)
        notificarProgresoEnrolamiento({ fase: 'cancelado', actual, total, mensaje: res.error })
        return { ok: false, error: res.error }
      }

      fallosConsecutivos = 0
      actual = res.captures

      if (res.ready) {
        notificarProgresoEnrolamiento({ fase: 'captura_aceptada', actual, total, mensaje: 'Generando template…' })
        break
      }

      notificarProgresoEnrolamiento({
        fase: 'captura_aceptada',
        actual,
        total,
        mensaje: `Captura ${actual} aceptada. Retire el dedo y vuelva a colocarlo.`,
      })
    }

    const completo = fingerprint.completeEnrollment(sessionId)
    if (completo.error) {
      notificarProgresoEnrolamiento({ fase: 'cancelado', actual, total, mensaje: completo.error })
      return { ok: false, error: completo.error }
    }

    // Chequeo de huella duplicada ANTES de guardar: la biometria vive en el huellero.
    // Se compara contra las plantillas ya enroladas de la ficha (ambos dedos).
    try {
      await descargarPlantillas(fichaId)
    } catch (err) {
      console.error(`[engine] No se pudo refrescar plantillas de ficha (uso cache existente): ${err.message}`)
    }
    const plantillasFicha = await store.getPlantillasFicha(fichaId)
    const plantillasMapeadas = (plantillasFicha || []).map((p) => ({
      _id: p.estudianteId,
      nombres: p.nombres,
      apellidos: p.apellidos,
      tipoDocumento: p.tipoDocumento,
      numeroDocumento: p.numeroDocumento,
      huellaTemplate: p.template || '',
      huellaTemplate2: p.template2 || '',
    }))

    const duplicado = fingerprint.checkDuplicateFingerprint(completo.template, plantillasMapeadas, estudianteId)
    if (duplicado.isDuplicate) {
      const dupStudent = duplicado.student
      const doc = dupStudent.tipoDocumento && dupStudent.numeroDocumento
        ? ` (${dupStudent.tipoDocumento} ${dupStudent.numeroDocumento})`
        : ''
      const mensaje = `Esta huella ya está registrada a nombre de "${dupStudent.nombres} ${dupStudent.apellidos}"${doc}`
      console.error(`[engine] Enrolamiento abortado: huella duplicada de ${dupStudent.nombres} ${dupStudent.apellidos} (score=${duplicado.score})`)
      notificarProgresoEnrolamiento({ fase: 'cancelado', actual, total, mensaje })
      return { ok: false, error: mensaje }
    }

    // Chequeo ADICIONAL contra el OTRO slot del MISMO estudiante: el propósito de las
    // 2 huellas es tener 2 dedos distintos de respaldo, no el mismo dedo repetido.
    const propio = plantillasMapeadas.find((p) => String(p._id) === String(estudianteId))
    const duplicadoPropio = fingerprint.checkDuplicateOwnTemplate(
      completo.template,
      propio?.huellaTemplate || '',
      propio?.huellaTemplate2 || '',
      slot
    )
    if (duplicadoPropio.isDuplicate) {
      const mensaje = `Este dedo ya está registrado como Huella ${duplicadoPropio.otherSlot} de este mismo estudiante. Usa un dedo diferente para la Huella ${slot}.`
      console.error(`[engine] Enrolamiento abortado: mismo dedo en Huella ${slot} y Huella ${duplicadoPropio.otherSlot} del mismo estudiante (score=${duplicadoPropio.score})`)
      notificarProgresoEnrolamiento({ fase: 'cancelado', actual, total, mensaje })
      return { ok: false, error: mensaje }
    }

    notificarProgresoEnrolamiento({ fase: 'guardando', actual, total, mensaje: 'Guardando huella…' })
    const guardado = await guardarTemplate({ estudianteId, fichaId, dedo, template: completo.template, slot })

    if (guardado.ok) {
      notificarProgresoEnrolamiento({ fase: 'completado', actual, total, mensaje: 'Huella registrada correctamente' })
    }
    return guardado
  } catch (err) {
    fingerprint.cancelSession(sessionId)
    return { ok: false, error: err.message }
  }
}

export function logoutDocente() {
  docente = null
  return { ok: true }
}
