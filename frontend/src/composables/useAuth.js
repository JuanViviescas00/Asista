// ============================================================
// useAuth — maneja la sesión del usuario (login/logout), la
// persistencia en sessionStorage y el timer de inactividad que
// cierra la sesión automáticamente.
//
// IMPORTANTE: el estado (autenticado/usuario) vive a NIVEL DE
// MÓDULO (singleton). Así App.vue y DefaultLayout.vue comparten
// la misma referencia; de lo contrario cada llamada a useAuth()
// crearía un estado independiente y el logout no refrescaría la
// vista.
// ============================================================
import { ref, computed } from 'vue'
import { reconectarConAuth } from '../services/index.js'
import { mostrarAviso } from './useAviso.js'

const INACTIVIDAD_MS = 10 * 60 * 1000
const EVENTOS_ACTIVIDAD = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'mousedown']

// --- Estado compartido (singleton) ---
const autenticado = ref(sessionStorage.getItem('admin_auth') === 'true')
const usuario = ref((() => {
  try {
    return JSON.parse(sessionStorage.getItem('user_data') || 'null')
  } catch {
    return null
  }
})())

let inactividadTimer = null

function actualizarUsuario(nuevosDatos) {
  if (!nuevosDatos) return
  usuario.value = { ...(usuario.value || {}), ...nuevosDatos }
  sessionStorage.setItem('user_data', JSON.stringify(usuario.value))
}

function onLoginSuccess(userData) {
  autenticado.value = true
  sessionStorage.setItem('admin_auth', 'true')
  if (userData) {
    usuario.value = userData
    sessionStorage.setItem('user_data', JSON.stringify(userData))
  } else {
    const raw = sessionStorage.getItem('user_data')
    if (raw) usuario.value = JSON.parse(raw)
  }
  iniciarTimerInactividad()
  reconectarConAuth()
}

function cerrarSesion() {
  autenticado.value = false
  usuario.value = null
  sessionStorage.removeItem('admin_auth')
  sessionStorage.removeItem('user_data')
  sessionStorage.removeItem('auth_token')
  limpiarListeners()
  reconectarConAuth()
}

function reiniciarTimerInactividad() {
  if (inactividadTimer) clearTimeout(inactividadTimer)
  inactividadTimer = setTimeout(() => {
    cerrarSesion()
  }, INACTIVIDAD_MS)
}

function detenerTimerInactividad() {
  if (inactividadTimer) {
    clearTimeout(inactividadTimer)
    inactividadTimer = null
  }
}

function iniciarTimerInactividad() {
  detenerTimerInactividad()
  EVENTOS_ACTIVIDAD.forEach((e) => document.addEventListener(e, reiniciarTimerInactividad))
  reiniciarTimerInactividad()
}

function limpiarListeners() {
  EVENTOS_ACTIVIDAD.forEach((e) => document.removeEventListener(e, reiniciarTimerInactividad))
  detenerTimerInactividad()
}

// Token expirado/inválido detectado por el cliente HTTP.
function manejarExpiracionAuth(e) {
  cerrarSesion()
  if (e?.detail) {
    mostrarAviso(e.detail, 'warning')
  }
}

let initialized = false

// Debe llamarse UNA sola vez (desde App.vue) para registrar el
// listener global de expiración y arrancar el timer si ya hay sesión.
export function initAuth() {
  if (initialized) return
  initialized = true
  window.addEventListener('auth-expired', manejarExpiracionAuth)
  if (autenticado.value) iniciarTimerInactividad()
}

// El backend entrega el nombre del aprendiz ya unido ("nombres apellidos").
// Se toma el primer nombre y el primer apellido: con 4 o más palabras el primer
// apellido es la 3.ª; con 3 se asume 1 nombre + 2 apellidos; con 2 se usan ambas.
function primerNombreApellido(nombreCompleto) {
  let texto = (nombreCompleto || '').trim().replace(/\s+/g, ' ')
  if (!texto) return ''
  if (texto === texto.toUpperCase()) {
    texto = texto.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())
  }
  const partes = texto.split(' ')
  if (partes.length <= 2) return partes.join(' ')
  const particulas = ['de', 'del', 'la', 'las', 'los', 'y', 'san', 'santa', 'da', 'di']
  let idx = partes.length === 3 ? 1 : 2
  let apellido = partes[idx]
  while (particulas.includes(partes[idx].toLowerCase()) && idx + 1 < partes.length) {
    idx++
    apellido += ' ' + partes[idx]
  }
  return `${partes[0]} ${apellido}`
}

const headerTitulo = computed(() => {
  if (usuario.value?.rol === 'Instructor') {
    const nombre = (usuario.value?.nombre || '').trim()
    return nombre ? `Bienvenido ${nombre}` : 'Bienvenido Instructor'
  }
  if (usuario.value?.rol === 'Estudiante') {
    return primerNombreApellido(usuario.value?.nombre) || 'Panel Aprendiz'
  }
  return 'Panel Admin'
})

const headerSubtitulo = computed(() => {
  if (usuario.value?.rol === 'Instructor') return 'Instructor SENA'
  if (usuario.value?.rol === 'Estudiante') return 'Aprendiz SENA'
  return 'Administración SENA'
})

export function useAuth() {
  return {
    autenticado,
    usuario,
    headerTitulo,
    headerSubtitulo,
    onLoginSuccess,
    actualizarUsuario,
    cerrarSesion,
  }
}
