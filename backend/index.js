import 'dotenv/config'
import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import mongoose from 'mongoose'
import nodemailer from 'nodemailer'
import Admin from './models/Admin.js'
import authRoutes from './routes/auth.js'
import instructoresRoutes from './routes/instructores.js'
import fichasRoutes from './routes/fichas.js'
import estudiantesRoutes from './routes/estudiantes.js'
import asistenciasRoutes from './routes/asistencias.js'
import diasFestivosRoutes from './routes/diasFestivos.js'
import excusasRoutes from './routes/excusas.js'
import clasesRoutes from './routes/clases.js'
import enrolamientoRoutes from './routes/enrolamiento.js'
import dispositivosRoutes from './routes/dispositivos.js'
import { initSocket } from './services/socketService.js'
import { hashPassword } from './services/passwordService.js'

const app = express()
const httpServer = http.createServer(app)
const PORT = process.env.PORT || 3000

initSocket(httpServer)

// Middlewares de seguridad perimetral
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false
}))
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
})

transporter.verify()
  .then(() => console.log('SMTP listo'))
  .catch((err) => console.error('Error SMTP:', err.message))

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
  let admin = await Admin.findOne({ correo: 'senahuellero@gmail.com' })
  if (!admin) {
    const passwordHash = await hashPassword('sena2026ADSO')
    admin = await new Admin({
      nombre: 'Administrador',
      rol: 'Administrador',
      telefono: '',
      correo: 'senahuellero@gmail.com',
      password: passwordHash,
    }).save()
    console.log('Admin por defecto creado con contraseña cifrada en bcrypt.')
  } else if (!admin.password.startsWith('$2a$') && !admin.password.startsWith('$2b$')) {
    // Si la contraseña anterior estaba en texto plano, encriptarla automáticamente
    admin.password = await hashPassword(admin.password)
    await admin.save()
    console.log('Contraseña de Admin migrada a bcrypt con éxito.')
  }

  httpServer.listen(PORT, () => {
    console.log(`Backend en http://localhost:${PORT}`)
  })
}

app.post('/api/enviar-codigo', async (req, res) => {
  const { correo, codigo } = req.body
  if (!correo || !codigo) {
    return res.status(400).json({ error: 'Correo y codigo son requeridos' })
  }
  try {
    await transporter.sendMail({
      from: `"Admin Panel SENA" <${process.env.GMAIL_USER}>`,
      to: correo,
      subject: 'Codigo de recuperacion - Admin Panel',
      text: `Tu codigo de verificacion es: ${codigo}\n\nEste codigo expira en 10 minutos.`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px"><h2 style="color:#1e293b">Codigo de Recuperacion</h2><p style="color:#64748b">Usa el siguiente codigo para restablecer tu contrasena:</p><div style="background:#f1f5f9;border-radius:8px;padding:20px;text-align:center;margin:24px 0"><span style="font-family:monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#1e293b">${codigo}</span></div><p style="color:#94a3b8;font-size:13px">Este codigo expira en 10 minutos.</p></div>`,
    })
    res.json({ ok: true, message: 'Codigo enviado correctamente' })
  } catch (error) {
    console.error('Error al enviar correo:', error.message)
    res.status(500).json({ error: 'Error al enviar el correo' })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/instructores', instructoresRoutes)
app.use('/api/fichas', fichasRoutes)
app.use('/api/estudiantes', estudiantesRoutes)
app.use('/api/asistencias', asistenciasRoutes)
app.use('/api/dias-festivos', diasFestivosRoutes)
app.use('/api/excusas', excusasRoutes)
app.use('/api/clases', clasesRoutes)
app.use('/api/enrolamiento', enrolamientoRoutes)
app.use('/api/dispositivos', dispositivosRoutes)
