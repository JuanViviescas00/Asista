import { Server } from 'socket.io'
import mongoose from 'mongoose'
import crypto from 'crypto'
import bcryptjs from 'bcryptjs'
import Dispositivo from '../models/Dispositivo.js'
import Clase from '../models/Clase.js'
import Ficha from '../models/Ficha.js'
import { verificarTokenJWT } from '../middlewares/auth.js'

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
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  })

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Cliente conectado: ${socket.id}`)

    // 1. Unirse a la sala de una ficha (solo Instructor asignado o Administrador)
    socket.on('unirse_sala', async ({ fichaId, rol }) => {
      if (!fichaId) return
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
      console.log(`[Socket.IO] Socket ${socket.id} (${rol || 'cliente'}) se unió a sala ${room}`)

      // Informar si ya hay una sesión activa para esta ficha
      const sesion = sesionesActivas.get(String(fichaId))
      socket.emit('estado_sesion', {
        activa: !!sesion?.activa,
        sesion: sesion || null,
      })

      // Snapshot inicial del estado online del dispositivo asociado a esta ficha
      // (para que el instructor vea el indicador correcto al entrar, sin esperar
      // al próximo DEVICE_CONNECTED/DISCONNECTED).
      try {
        const deviceId = await deviceIdDeFicha(fichaId)
        if (deviceId) {
          socket.emit('DEVICE_STATUS', { deviceId, online: dispositivosConectados.has(deviceId) })
        }
      } catch (_) {}
    })

    // 2. Unirse a la sala global de administradores (DEVICE_CONNECTED/DISCONNECTED)
    socket.on('unirse_admin', () => {
      const usuario = verificarTokenJWT(socket.handshake?.auth?.token)
      if (!usuario || usuario.rol !== 'Administrador') {
        socket.emit('error_autenticacion', { error: 'Se requiere una sesión de Administrador válida.' })
        return
      }
      socket.join('admins')
      console.log(`[Socket.IO] Socket ${socket.id} (Administrador) se unió a sala admins`)

      // Snapshot inicial: dispositivos conectados en este momento.
      socket.emit('DEVICES_STATUS', { deviceIds: Array.from(dispositivosConectados.keys()) })
    })

    // 3. Salir de la sala
    socket.on('salir_sala', ({ fichaId }) => {
      if (!fichaId) return
      const room = `ficha_${fichaId}`
      socket.leave(room)
    })

    // 4. El docente inicia la sesión de toma de asistencia de forma remota
    socket.on('docente:iniciar_asistencia', (data) => {
      const { fichaId, fichaCodigo, nombrePrograma, jornada, fecha, instructorNombre } = data
      if (!fichaId) return

      const sesion = {
        activa: true,
        fichaId: String(fichaId),
        fichaCodigo: fichaCodigo || '',
        nombrePrograma: nombrePrograma || '',
        jornada: jornada || '',
        fecha: fecha || new Date().toISOString().slice(0, 10),
        instructorNombre: instructorNombre || 'Instructor',
        horaInicio: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }

      sesionesActivas.set(String(fichaId), sesion)
      const room = `ficha_${fichaId}`

      console.log(`[Socket.IO] ▶ Docente activó asistencia remota para ficha ${fichaCodigo} (${room})`)

      // Notificar a la sala de la ficha y a todos los Kioscos en modo Standby global
      io.to(room).emit('kiosco:activar_lectura', sesion)
      io.to('global_kioscos').emit('kiosco:activar_lectura', sesion)
      io.emit('kiosco:activar_lectura_global', sesion)
      io.to(room).emit('estado_sesion', { activa: true, sesion })
    })

    // 5. El docente finaliza/pausa la toma de asistencia
    socket.on('docente:cerrar_asistencia', ({ fichaId }) => {
      if (!fichaId) return
      const room = `ficha_${fichaId}`
      sesionesActivas.delete(String(fichaId))

      console.log(`[Socket.IO] ⏹ Docente detuvo la asistencia para ficha ${fichaId}`)

      io.to(room).emit('kiosco:desactivar_lectura', { fichaId })
      io.to('global_kioscos').emit('kiosco:desactivar_lectura', { fichaId })
      io.emit('kiosco:desactivar_lectura_global', { fichaId })
      io.to(room).emit('estado_sesion', { activa: false, sesion: null })
    })

    // 6. Registro de identidad del huellero local (deviceId + token) al conectar
    socket.on('HELLO', async (data) => {
      const deviceId = data?.deviceId
      const token = data?.token
      if (!deviceId || !token) {
        console.log(`[Socket.IO] HELLO rechazado: faltan deviceId o token (socket ${socket.id})`)
        rechazarHELLO(socket, 'MISSING_FIELDS', 'Faltan credenciales del dispositivo.')
        return
      }

      try {
        const dispositivo = await Dispositivo.findOne({ deviceId: String(deviceId) })

        if (!dispositivo) {
          console.log(`[Socket.IO] HELLO rechazado: dispositivo no encontrado (${deviceId}, socket ${socket.id})`)
          rechazarHELLO(socket, 'DEVICE_NOT_FOUND', 'Dispositivo no reconocido por el sistema.')
          return
        }

        if (dispositivo.activo !== true) {
          if (!dispositivo.aprobadoEn) {
            console.log(`[Socket.IO] HELLO rechazado: dispositivo pendiente de aprobación (${deviceId}, socket ${socket.id})`)
            rechazarHELLO(socket, 'PENDING_APPROVAL', 'Equipo registrado. Esperando aprobación del administrador.')
          } else {
            console.log(`[Socket.IO] HELLO rechazado: dispositivo deshabilitado (${deviceId}, socket ${socket.id})`)
            rechazarHELLO(socket, 'DEVICE_DISABLED', 'Este equipo fue deshabilitado por el administrador.')
          }
          return
        }

        const tokenValido = await bcryptjs.compare(token, dispositivo.tokenHash)
        if (!tokenValido) {
          console.log(`[Socket.IO] HELLO rechazado: token inválido para ${deviceId} (socket ${socket.id})`)
          rechazarHELLO(socket, 'INVALID_TOKEN', 'Credenciales del dispositivo inválidas.')
          return
        }

        // Validación del fingerprint de hardware (defensa en profundidad contra la
        // copia de config.json a otra instalación de Windows). Solo se valida si el
        // huellero ENVÍA el fingerprint; si no lo envía (lectura del registro falló),
        // se trata como "no se pudo verificar" y NO se rechaza la conexión.
        const hardwareFingerprint = data?.hardwareFingerprint
        if (hardwareFingerprint) {
          const fpHash = crypto.createHash('sha256').update(String(hardwareFingerprint)).digest('hex')
          if (!dispositivo.hardwareFingerprintHash) {
            // Primer contacto: adoptar el fingerprint de esta instalación.
            dispositivo.hardwareFingerprintHash = fpHash
            await dispositivo.save()
            console.log(`[Socket.IO] Fingerprint de hardware adoptado para ${deviceId}`)
          } else if (dispositivo.hardwareFingerprintHash !== fpHash) {
            console.log(`[Socket.IO] HELLO rechazado: fingerprint de hardware no coincide para ${deviceId} (posible copia de identidad)`)
            rechazarHELLO(socket, 'HARDWARE_MISMATCH', 'La identidad de hardware no coincide. Posible copia no autorizada. Contacta al administrador.')
            return
          }
        }

        socket.data.deviceId = String(deviceId)
        dispositivosConectados.set(String(deviceId), socket.id)
        console.log(`[Socket.IO] Huellero registrado: ${deviceId} (socket ${socket.id})`)

        // Notificar conexión del dispositivo a admins y a las fichas asociadas.
        try {
          const fichasIds = await idsDeFichasAsociadas(dispositivo._id)
          emitirEstadoDispositivo('DEVICE_CONNECTED', String(deviceId), fichasIds)
        } catch (err) {
          console.log(`[Socket.IO] Error emitiendo DEVICE_CONNECTED para ${deviceId}: ${err.message}`)
        }

        // Reconciliación del estado real tras autenticar (Fase 6):
        // se reenvía al dispositivo el estado que tiene en BD, haya o no clase activa.
        // - Clase Activa → ACTIVATE pendiente.
        // - Sin clase Activa → DEACTIVATE (para limpiar una "clase fantasma" local
        //   si el dispositivo estuvo offline al finalizar la clase).
        try {
          const claseActiva = await Clase.findOne({ deviceId: String(deviceId), estado: 'Activa' })
          if (claseActiva) {
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

    // 7. El Kiosco registra una huella y notifica en vivo a todos (móvil del docente)
    socket.on('kiosco:asistencia_marcada', (data) => {
      const { fichaId } = data
      if (!fichaId) return
      const room = `ficha_${fichaId}`

      console.log(`[Socket.IO] 🖐 Asistencia marcada en Kiosco: ${data.nombres} ${data.apellidos} (${data.estado})`)

      // Re-transmitir a todos en la sala (especialmente al celular del docente)
      socket.to(room).emit('docente:nueva_marcacion', data)
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

export function emitirClaseDesactivada(fichaId, data) {
  if (io && fichaId) {
    io.to(`ficha_${String(fichaId)}`).emit('CLASS_DEACTIVATED', data)
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
