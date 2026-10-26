process.env.TZ = process.env.TZ || 'America/Bogota'
import 'dotenv/config'
import http from 'http'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import mongoose from 'mongoose'
import Admin from './models/Admin.js'
import authRoutes from './routes/auth.js'
import instructoresRoutes from './routes/instructores.js'
import fichasRoutes from './routes/fichas.js'
import estudiantesRoutes from './routes/estudiantes.js'
import asistenciasRoutes from './routes/asistencias.js'
import jornadasRoutes from './routes/jornadas.js'
import diasFestivosRoutes from './routes/diasFestivos.js'
import excusasRoutes from './routes/excusas.js'
import clasesRoutes from './routes/clases.js'
import enrolamientoRoutes from './routes/enrolamiento.js'
import dispositivosRoutes from './routes/dispositivos.js'
import programasRoutes from './routes/programas.js'
import reportesRoutes from './routes/reportes.js'
import configuracionRoutes from './routes/configuracion.js'
import { sanitizarEntrada } from './middlewares/sanitize.js'
import { apiLimiter } from './middlewares/rateLimiter.js'
import { esOrigenPermitido } from './utils/corsOrigins.js'
import { initSocket } from './services/socketService.js'
import { hashPassword } from './services/passwordService.js'
import { iniciarCronJobs } from './services/cronService.js'

const app = express()
const httpServer = http.createServer(app)
const PORT = process.env.PORT || 3000

// Render / Heroku / etc. usan un proxy inverso → necesario para express-rate-limit y req.ip
app.set('trust proxy', 1)

initSocket(httpServer)

app.disable('x-powered-by')

// Middlewares de seguridad perimetral
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'blob:'],
      // Socket.IO + SDK web del lector (habla con el servicio local de DigitalPersona)
      'connect-src': ["'self'", 'ws:', 'wss:', 'https://127.0.0.1:*', 'https://localhost:*'],
      'frame-ancestors': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': null,
    },
  },
  frameguard: { action: 'sameorigin' },
  crossOriginEmbedderPolicy: false,
}))

app.use(cors({
  origin(origin, callback) {
    callback(null, esOrigenPermitido(origin))
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'x-device-token'],
  maxAge: 600,
}))
app.use(express.json({ limit: '10mb' }))
app.use(sanitizarEntrada)
app.use('/api', apiLimiter)

const MONGO_OPTS = {
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 30000,
}

mongoose.connect(process.env.MONGODB_URI, MONGO_OPTS)
  .then(async () => {
    console.log('MongoDB Atlas conectado')
    await iniciarServidor()
  })
  .catch(async (err) => {
    console.error('Error MongoDB Atlas:', err.message)
    console.error('Revisa:')
    console.error('  1. Cluster encendido en https://cloud.mongodb.com')
    console.error('  2. Usuario y password correctos en Database Access')
    console.error('  3. Network Access con 0.0.0.0/0 (ya configurado)')
    console.error('  4. Si usas VPN o proxy, desactivalo y prueba de nuevo')
    console.log('\nIntentando MongoDB local...')
    try {
      await mongoose.connect('mongodb://localhost:27017/huellero', MONGO_OPTS)
      console.log('MongoDB local conectado')
      await iniciarServidor()
    } catch (err2) {
      console.error('Error MongoDB local:', err2.message)
      console.error('\nInstala MongoDB local: https://www.mongodb.com/try/download/community')
      process.exit(1)
    }
  })

async function iniciarServidor() {
  const correoAdmin = (process.env.ADMIN_EMAIL || 'senahuellero@gmail.com').trim().toLowerCase()
  let admin = await Admin.findOne({ correo: correoAdmin })
  if (!admin && (await Admin.countDocuments()) === 0) {
    // Nunca usar una contraseña fija publicada en el repositorio:
    // se toma de ADMIN_PASSWORD o se genera una aleatoria que se muestra una sola vez.
    const passwordInicial = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url')
    admin = await new Admin({
      nombre: 'Administrador',
      rol: 'Administrador',
      telefono: '',
      correo: correoAdmin,
      password: await hashPassword(passwordInicial),
    }).save()
    console.log(`Admin inicial creado: ${correoAdmin}`)
    if (!process.env.ADMIN_PASSWORD) {
      console.log(`Contraseña temporal generada (cámbiala al ingresar): ${passwordInicial}`)
    }
  } else if (admin && !admin.password.startsWith('$2a$') && !admin.password.startsWith('$2b$')) {
    // Si la contraseña anterior estaba en texto plano, encriptarla automáticamente
    admin.password = await hashPassword(admin.password)
    await admin.save()
    console.log('Contraseña de Admin migrada a bcrypt con éxito.')
  }

  httpServer.listen(PORT, () => {
    console.log(`Backend en http://localhost:${PORT}`)
    iniciarCronJobs()
  })
}

// Health check endpoint para monitorización, Docker y Coolify
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    servicio: 'asista-backend',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/instructores', instructoresRoutes)
app.use('/api/fichas', fichasRoutes)
app.use('/api/estudiantes', estudiantesRoutes)
app.use('/api/asistencias', asistenciasRoutes)
app.use('/api/jornadas', jornadasRoutes)
app.use('/api/dias-festivos', diasFestivosRoutes)
app.use('/api/excusas', excusasRoutes)
app.use('/api/clases', clasesRoutes)
app.use('/api/enrolamiento', enrolamientoRoutes)
app.use('/api/dispositivos', dispositivosRoutes)
app.use('/api/programas', programasRoutes)
app.use('/api/reportes', reportesRoutes)
app.use('/api/configuracion', configuracionRoutes)

// Servir estáticos del frontend compilado (Single Service para Render)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicPath = path.join(__dirname, 'public')
app.use(express.static(publicPath, { dotfiles: 'ignore' }))

// Redirección SPA: si no es una petición /api, servir index.html de Vue
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Ruta de API no encontrada' })
  }
  const indexPath = path.join(publicPath, 'index.html')
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath)
  }
  return res.status(200).json({
    ok: true,
    message: 'Backend API Asista en ejecución. El frontend no está compilado en este servicio.',
    timestamp: new Date().toISOString()
  })
})

// Manejador de errores final (JSON mal formado, payload excesivo, etc.):
// no expone trazas internas al cliente.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500
  if (status >= 500) console.error('[Error]', err)
  const mensaje = status === 400 ? 'Solicitud mal formada'
    : status === 413 ? 'El contenido enviado es demasiado grande'
      : 'Error interno del servidor'
  res.status(status).json({ error: mensaje })
})
