import { io } from 'socket.io-client'

function getSocketUrl() {
  if (typeof window === 'undefined') return 'http://localhost:3000'
  
  const host = window.location.hostname
  const protocol = window.location.protocol
  const fullHost = window.location.host
  
  // Soporte para túneles de VS Code / Dev Tunnels
  if (fullHost.includes('-5173.')) {
    return `${protocol}//${fullHost.replace('-5173.', '-3000.')}`
  }
  
  return `${protocol}//${host}:3000`
}

const SOCKET_URL = getSocketUrl()

function getToken() {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem('auth_token') || null
}

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  auth: { token: getToken() },
})

// Recalcula el token del handshake y fuerza una reconexión para que el servidor
// lo vea. Se llama tras login/logout (el token vive en sessionStorage, que ya
// está disponible al importar el módulo en un reload, pero NO al loguearse).
export function reconectarConAuth() {
  socket.auth = { token: getToken() }
  if (socket.connected) {
    socket.disconnect()
  }
  socket.connect()
}

export function unirseASalaFicha(fichaId, rol = 'docente') {
  if (!fichaId) return
  socket.emit('unirse_sala', { fichaId: String(fichaId), rol })
}

export function salirDeSalaFicha(fichaId) {
  if (!fichaId) return
  socket.emit('salir_sala', { fichaId: String(fichaId) })
}

export function iniciarAsistenciaRemota(datos) {
  socket.emit('docente:iniciar_asistencia', datos)
}

export function cerrarAsistenciaRemota(fichaId) {
  socket.emit('docente:cerrar_asistencia', { fichaId: String(fichaId) })
}

export function notificarMarcacionKiosco(datos) {
  socket.emit('kiosco:asistencia_marcada', datos)
}

export default socket
