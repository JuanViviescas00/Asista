import { Router } from 'express'
import * as authController from '../controllers/authController.js'
import { validarCamposRequeridos, validarEmail } from '../middlewares/validator.js'
import { autenticarJWT } from '../middlewares/auth.js'
import { loginLimiter, recoveryLimiter } from '../middlewares/rateLimiter.js'

const router = Router()

// Login con rate limiter (permite consulta de aprendiz por documento sin contraseña)
router.post('/login', loginLimiter, validarCamposRequeridos(['correo']), authController.login)

// Perfil de usuario (requiere autenticación JWT)
router.get('/perfil', autenticarJWT, authController.getPerfil)
router.put('/perfil', autenticarJWT, authController.updatePerfil)

// Recuperación de contraseña (con rate limiter por IP)
router.post('/recovery-code', recoveryLimiter, validarCamposRequeridos(['correo']), validarEmail('correo'), authController.recoveryCode)
router.post('/reset-password', recoveryLimiter, validarCamposRequeridos(['correo', 'codigo', 'nuevaPassword']), validarEmail('correo'), authController.resetPassword)

// Cambio de contraseña protegido por JWT y verificación de clave actual
router.post('/cambiar-password', autenticarJWT, validarCamposRequeridos(['passwordActual', 'nuevaPassword']), authController.cambiarPassword)

// Onboarding obligatorio de primer login para instructores (requiere autenticación JWT)
router.post('/completar-primer-login', autenticarJWT, validarCamposRequeridos(['passwordActual', 'nuevaPassword', 'passwordSofiaPlus']), authController.completarPrimerLoginInstructor)

export default router
