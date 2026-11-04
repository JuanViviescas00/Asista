import { Server } from 'socket.io'
import mongoose from 'mongoose'
import crypto from 'crypto'
import bcryptjs from 'bcryptjs'
import Dispositivo from '../models/Dispositivo.js'
import Clase from '../models/Clase.js'
import Ficha from '../models/Ficha.js'
import { verificarTokenJWT } from '../middlewares/auth.js'
import { finalizarClase, getHoyString } from './asistenciaService.js'
import { esOrigenPermitido, esMismoOrigen } from '../utils/corsOrigins.js'

let io = null
const sesionesActivas = new Map() // fichaId -> { activa: true, iniciadoPor, fecha, jornada, fichaCodigo, nombrePrograma }
const dispositivosConectados = new Map() // deviceId -> socket.id

// Devuelve los _id (string) de las fichas asociadas a un Dispositivo (por su _id Mongo).
async function idsDeFichasAsociadas(dispositivoMongoId) {
  try {
    const fichas = await Ficha.find({ dispositivoId: dispositivoMongoId }).select('_id')
    return fichas.map((f) => String(f._id))
  } catch {
    return []
  }
}

// Emite DEVICE_CONNECTED/DEVICE_DISCONNECTED a la sala de admins y a cada
// sala ficha_<id> de las fichas asociadas a ese dispositivo.
function emitirEstadoDispositivo(evento, deviceId, fichasIds) {
  if (!io) return
  io.to('admins').emit(evento, { deviceId })
  for (const fichaId of fichasIds) {
    io.to(`ficha_${fichaId}`).emit(evento, { deviceId })
  }
}

// Resuelve el deviceId (UUID) del dispositivo asociado a una ficha, o null.
async function deviceIdDeFicha(fichaId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(fichaId))) return null
    const ficha = await Ficha.findById(fichaId).select('dispositivoId')
    if (!ficha?.dispositivoId) return null
    const disp = await Dispositivo.findById(ficha.dispositivoId).select('deviceId')
    return disp?.deviceId ? String(disp.deviceId) : null
  } catch {
    return null
  }
}

// Informa al huellero la razón del rechazo del HELLO y luego desconecta.
function rechazarHELLO(socket, code, message) {
  socket.emit('HELLO_RECHAZADO', { code, message })
  socket.disconnect(true)
}

export function initSocket(httpServer) {
  // Heartbeat: se depende del heartbeat nativo de socket.io (pingInterval 25s / pingTimeout 20s por defecto),
  // que detecta desconexiones y reconexiones automáticamente. No se implementa un PING/PONG manual encima.
  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        callback(null, esOrigenPermitido(origin))
      },
      methods: ['GET', 'POST'],
    },
    // Rechaza el handshake de navegadores desde orígenes no permitidos
    // (el huellero Electron no envía Origin y sigue funcionando).
    allowRequest(req, callback) {
      const origin = req.headers.origin
      callback(null, esOrigenPermitido(origin) || esMismoOrigen(origin, req))
    },
    maxHttpBufferSize: 1e6,
  })

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Cliente conectado: ${socket.id}`)

    // 1. Unirse a la sala de una ficha (solo Instructor asignado o Administrador)
    socket.on('unirse_sala', async ({ fichaId, rol } = {}) => {
      if (!fichaId || typeof fichaId !== 'string') return
      const room = `ficha_${fichaId}`

      // Autenticación del dashboard: el JWT llega en el handshake (socket.handshake.auth.token).
      // No se usa middleware global io.use() para no interferir con el HELLO del huellero
      // (que se autentica por deviceId+token, un mecanismo totalmente separado).
      const usuario = verificarTokenJWT(socket.handshake?.auth?.token)
      if (!usuario) {
        socket.emit('error_autenticacion', { error: 'Se requiere una sesión válida para unirse a la sala de la ficha.' })
        return
      }

      // Autorización: solo Administrador (cualquier ficha) o Instructor asignado a esa ficha
      // (en el array instructores o como instructorLiderId de la ficha).
      if (usuario.rol !== 'Administrador') {
        try {
          if (!mongoose.Types.ObjectId.isValid(String(fichaId))) {
            socket.emit('error_autenticacion', { error: 'Ficha inválida.' })
            return
          }
          const ficha = await Ficha.findById(fichaId).select('instructores instructorLiderId')
          if (!ficha) {
            socket.emit('error_autenticacion', { error: 'Ficha no encontrada.' })
            return
          }
          const userId = String(usuario.id)
          const esInstructor = Array.isArray(ficha.instructores) && ficha.instructores.some((id) => String(id) === userId)
          const esLider = ficha.instructorLiderId && String(ficha.instructorLiderId) === userId
          if (!esInstructor && !esLider) {
            socket.emit('error_autenticacion', { error: 'No estás asignado a esta ficha.' })
            return
          }
        } catch (err) {
          socket.emit('error_autenticacion', { error: 'Error validando el acceso a la ficha.' })
          return
        }
      }

      socket.join(room)
      console.log(`[Socket.IO] Socket ${socket.id} (usuario ${usuario.id}) se unió a ${room}`)

      // Envía el estado actual de la sesión al usuario que entra
      const sesion = sesionesActivas.get(String(fichaId)) || null
      socket.emit('estado_sesion', { activa: !!sesion, sesion })

      // Informa si el huellero asociado a esta ficha está online en este momento
      const deviceId = await deviceIdDeFicha(fichaId)
      socket.emit('DEVICE_STATUS', { online: Boolean(deviceId && dispositivosConectados.has(deviceId)) })
    })

    // 2. Unirse a la sala general de administradores
    socket.on('unirse_admins', () => {
      const usuario = verificarTokenJWT(socket.handshake?.auth?.token)
      if (!usuario || usuario.rol !== 'Administrador') {
        socket.emit('error_autenticacion', { error: 'Solo los administradores pueden unirse a esta sala.' })
        return
      }
      socket.join('admins')
      console.log(`[Socket.IO] Admin ${socket.id} se unió a la sala 'admins'`)
    })

    // 3. Salir de la sala
    socket.on('salir_sala', ({ fichaId } = {}) => {
      if (!fichaId) return
      const room = `ficha_${fichaId}`
      socket.leave(room)
    })

    // 4. El docente inicia la sesión de toma de asistencia de forma remota
    socket.on('docente:iniciar_asistencia', (data = {}) => {
      const { fichaId, fichaCodigo, nombrePrograma, jornada, fecha, instructorNombre } = data
      if (!fichaId) return
      // Solo quien ya fue autorizado en unirse_sala (Admin o instructor de la ficha)
      if (!socket.rooms.has(`ficha_${fichaId}`)) {
        socket.emit('error_autenticacion', { error: 'No autorizado para controlar esta ficha.' })
        return
      }

      const sesion = {
        activa: true,
        iniciadoPor: instructorNombre || 'Docente',
        fecha: fecha || getHoyString(),
        jornada,
        fichaCodigo,
        nombrePrograma,
      }
      sesionesActivas.set(String(fichaId), sesion)

      console.log(`[Socket.IO] ▶ Docente inició asistencia para ficha ${fichaId} (${fichaCodigo})`)

      // Notificar a todos en la sala de la ficha (incluye quioscos/pantallas del aula)
      io.to(`ficha_${fichaId}`).emit('sesion_iniciada', sesion)
      io.to(`ficha_${fichaId}`).emit('estado_sesion', { activa: true, sesion })
    })

    // 5. El docente finaliza/pausa la toma de asistencia
    socket.on('docente:cerrar_asistencia', ({ fichaId } = {}) => {
      if (!fichaId) return
      const room = `ficha_${fichaId}`
      if (!socket.rooms.has(room)) {
        socket.emit('error_autenticacion', { error: 'No autorizado para controlar esta ficha.' })
        return
      }
      sesionesActivas.delete(String(fichaId))

      console.log(`[Socket.IO] ⏹ Docente detuvo la asistencia para ficha ${fichaId}`)

      io.to(room).emit('sesion_cerrada', { fichaId })
      io.to(room).emit('estado_sesion', { activa: false, sesion: null })
    })

    // 6. El quiosco registra una marcación biométrica en tiempo real
    socket.on('kiosco:asistencia_marcada', (datos) => {
      const { fichaId, estudianteNombre, estado, hora, documento } = datos
      if (!fichaId) return

      console.log(`[Socket.IO] 👤 Asistencia marcada: ${estudianteNombre} (${estado}) a las ${hora}`)

      // Retransmitir al docente en vivo
      io.to(`ficha_${fichaId}`).emit('docente:nueva_marcacion', {
        estudianteNombre,
        estado,
        hora,
        documento,
        timestamp: new Date().toISOString(),
      })
    })

    // 7. HELLO del huellero local (app Electron)
    // El huellero se autentica con su deviceId + token contra la BD.
    // Si no está registrado o no está activo, el servidor rechaza y desconecta.
    socket.on('HELLO', async (data) => {
      const deviceId = data?.deviceId
      const token = data?.token
      if (!deviceId || !token || typeof deviceId !== 'string' || typeof token !== 'string') {
        console.log(`[Socket.IO] HELLO rechazado: faltan deviceId o token (socket ${socket.id})`)
        rechazarHELLO(socket, 'MISSING_FIELDS', 'Faltan credenciales del dispositivo.')
        return
      }

      try {
        const dispositivo = await Dispositivo.findOne({ deviceId: String(deviceId) })
        if (!dispositivo) {
          console.log(`[Socket.IO] HELLO rechazado: dispositivo no registrado ${deviceId}`)
          rechazarHELLO(socket, 'NOT_REGISTERED', 'Este equipo no está registrado en el sistema.')
          return
        }

        if (dispositivo.activo !== true) {
          console.log(`[Socket.IO] HELLO rechazado: dispositivo inactivo/pendiente ${deviceId}`)
          const code = dispositivo.aprobado === false ? 'PENDING_APPROVAL' : 'DEVICE_DISABLED'
          const msg = dispositivo.aprobado === false
            ? 'Equipo pendiente de aprobación por el administrador.'
            : 'Este equipo fue deshabilitado por el administrador.'
          rechazarHELLO(socket, code, msg)
          return
        }

        const tokenValido = await bcryptjs.compare(String(token), dispositivo.tokenHash)
        if (!tokenValido) {
          console.log(`[Socket.IO] HELLO rechazado: token inválido para ${deviceId}`)
          rechazarHELLO(socket, 'INVALID_TOKEN', 'Credenciales del dispositivo inválidas.')
          return
        }

        // Autenticación superada: registrar y asociar al socket
        socket.data.deviceId = String(deviceId)
        dispositivosConectados.set(String(deviceId), socket.id)

        // Actualizar último ping y metadatos si vienen
        dispositivo.ultimoPing = new Date()
        if (data.hostname) dispositivo.hostname = String(data.hostname).slice(0, 100)
        if (data.ipLocal) dispositivo.ipLocal = String(data.ipLocal).slice(0, 50)
        if (data.versionApp) dispositivo.versionApp = String(data.versionApp).slice(0, 30)
        await dispositivo.save()

        const fichasIds = await idsDeFichasAsociadas(dispositivo._id)

        console.log(`[Socket.IO] HELLO aceptado: ${dispositivo.nombre} (${deviceId}) socket ${socket.id} [${fichasIds.length} ficha(s)]`)
        socket.emit('HELLO_OK', {
          deviceId,
          nombre: dispositivo.nombre,
          fichasIds,
        })

        // Notificar que este equipo está online
        emitirEstadoDispositivo('DEVICE_CONNECTED', deviceId, fichasIds)

        // Reconciliación tras reconexión: sincroniza el estado del lector con la BD
        // Si hay una clase activa asignada a este equipo, reenvía ACTIVATE
        // Si no hay clase activa (o expiró), envía DEACTIVATE para limpiar el lector
        try {
          const claseActiva = await Clase.findOne({
            activa: true,
            fichaId: { $in: fichasIds },
          })

          if (claseActiva) {
            const horasTranscurridas = (Date.now() - new Date(claseActiva.iniciadaAt).getTime()) / (1000 * 60 * 60)
            if (horasTranscurridas >= 3) {
              await finalizarClase(claseActiva.fichaId, claseActiva.instructorId)
              emitirDesactivacion(deviceId, {
                type: 'DEACTIVATE',
                fichaId: String(claseActiva.fichaId),
                instructorId: String(claseActiva.instructorId),
              })
              if (io) {
                const sFichaId = String(claseActiva.fichaId)
                io.to(`ficha_${sFichaId}`).emit('CLASS_DEACTIVATED', { fichaId: sFichaId, razon: 'timeout_reconexion' })
                io.to(`ficha_${sFichaId}`).emit('estado_sesion', { activa: false, sesion: null })
                console.log(`[Socket.IO] Clase de ficha ${claseActiva.fichaId} expiró (>3h) durante desconexión. Cerrada automáticamente.`)
              }
            } else {
              let codigoFicha = ''
              try {
                const ficha = await Ficha.findById(claseActiva.fichaId).select('codigoFicha')
                codigoFicha = ficha?.codigoFicha || ''
              } catch (_) {
                // fichaId inválido o ficha borrada: se omite el código (no es crítico).
              }
              socket.emit('ACTIVATE', {
                type: 'ACTIVATE',
                fichaId: String(claseActiva.fichaId),
                instructorId: String(claseActiva.instructorId),
                codigoFicha,
              })
              console.log(`[Socket.IO] Reenviando ACTIVATE pendiente a ${deviceId} tras reconexión (ficha ${codigoFicha || claseActiva.fichaId})`)
            }
          } else {
            emitirDesactivacion(deviceId, {
              type: 'DEACTIVATE',
              fichaId: null,
              instructorId: null,
            })
            console.log(`[Socket.IO] Sin clase activa en BD para ${deviceId}: enviando DEACTIVATE para limpiar estado local`)
          }
        } catch (err) {
          console.log(`[Socket.IO] Error reconciliando estado para ${deviceId}: ${err.message}`)
        }
      } catch (err) {
        console.log(`[Socket.IO] HELLO rechazado por error: ${deviceId} (socket ${socket.id}) - ${err.message}`)
        rechazarHELLO(socket, 'INTERNAL_ERROR', 'Error interno al verificar el dispositivo.')
      }
    })

    socket.on('disconnect', async () => {
      const deviceId = socket.data.deviceId ? String(socket.data.deviceId) : null
      if (!deviceId) {
        console.log(`[Socket.IO] Cliente desconectado: ${socket.id}`)
        return
      }

      // Guard anti-fantasma: solo emitir DEVICE_DISCONNECTED si este socket sigue
      // siendo el registrado para ese deviceId. Si ya fue reemplazado por una
      // reconexión más nueva (el Map apunta a otro socket.id), NO se emite nada.
      if (dispositivosConectados.get(deviceId) === socket.id) {
        dispositivosConectados.delete(deviceId)

        try {
          const dispositivo = await Dispositivo.findOne({ deviceId }).select('_id')
          const fichasIds = dispositivo ? await idsDeFichasAsociadas(dispositivo._id) : []
          emitirEstadoDispositivo('DEVICE_DISCONNECTED', deviceId, fichasIds)
        } catch (err) {
          console.log(`[Socket.IO] Error emitiendo DEVICE_DISCONNECTED para ${deviceId}: ${err.message}`)
        }
      }
      console.log(`[Socket.IO] Cliente desconectado: ${socket.id}`)
    })
  })

  console.log('[Socket.IO] Servidor de WebSockets en tiempo real inicializado')
  return io
}

export function getIO() {
  return io
}

// Desconecta un dispositivo conectado informándole la razón DEVICE_DISABLED antes
// de cerrar (mismo patrón que rechazarHELLO, pero disparado por una acción del
// Admin sobre una conexión ya establecida, no por un HELLO entrante).
export function desconectarDispositivo(deviceId) {
  if (!io || !deviceId) return false
  const socketId = dispositivosConectados.get(String(deviceId))
  if (!socketId) return false
  const socket = io.sockets.sockets.get(socketId)
  if (!socket) return false
  rechazarHELLO(socket, 'DEVICE_DISABLED', 'Este equipo fue deshabilitado por el administrador.')
  return true
}

export function emitirNuevaAsistencia(fichaId, data) {
  if (io && fichaId) {
    io.to(`ficha_${fichaId}`).emit('docente:nueva_marcacion', data)
  }
}

export function emitirAsistenciaRegistrada(fichaId, data) {
  if (io && fichaId) {
    io.to(`ficha_${String(fichaId)}`).emit('ATTENDANCE_REGISTERED', data)
  }
}

export function emitirClaseActivada(fichaId, data) {
  if (io && fichaId) {
    io.to(`ficha_${String(fichaId)}`).emit('CLASS_ACTIVATED', data)
  }
}

export function emitirClaseDesactivada(fichaId, data = {}) {
  if (io && fichaId) {
    const sFichaId = String(fichaId)
    sesionesActivas.delete(sFichaId)
    io.to(`ficha_${sFichaId}`).emit('CLASS_DEACTIVATED', data)
    io.to(`ficha_${sFichaId}`).emit('estado_sesion', { activa: false, sesion: null })
  }
}

export function emitirActivacion(deviceId, payload) {
  if (!io || !deviceId) return false
  const socketId = dispositivosConectados.get(String(deviceId))
  if (!socketId) return false
  io.to(socketId).emit('ACTIVATE', payload)
  return true
}

export function emitirDesactivacion(deviceId, payload) {
  if (!io || !deviceId) return false
  const socketId = dispositivosConectados.get(String(deviceId))
  if (!socketId) return false
  io.to(socketId).emit('DEACTIVATE', payload)
  return true
}

export function emitirNuevoDispositivo(payload) {
  if (!io) return false
  io.to('admins').emit('NUEVO_DISPOSITIVO', payload)
  return true
}

export function emitirAlertaSofiaPlus(payload) {
  if (!io) return false
  io.to('admins').emit('ALERTA_SOFIA_PLUS', payload)
  return true
}
