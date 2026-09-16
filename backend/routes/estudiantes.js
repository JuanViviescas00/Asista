import { Router } from 'express'
import * as estudianteController from '../controllers/estudianteController.js'
import { validarCamposRequeridos, validarEmail } from '../middlewares/validator.js'
import { autenticarJWT, verificarRol, autenticarOpcional } from '../middlewares/auth.js'

const router = Router()

// Operaciones de consulta (accesible con sesión o desde Kiosco de aula)
router.get('/', autenticarOpcional, estudianteController.getEstudiantes)

// Operaciones CRUD de aprendices (restringidas a Administrador)
router.post('/',
  autenticarJWT,
  verificarRol(['Administrador']),
  validarCamposRequeridos(['nombres', 'apellidos', 'numeroDocumento', 'fichaId']),
  validarEmail('correo'),
  estudianteController.createEstudiante
)

router.put('/:id',
  autenticarJWT,
  verificarRol(['Administrador', 'Instructor']),
  estudianteController.updateEstudiante
)

router.delete('/:id',
  autenticarJWT,
  verificarRol(['Administrador']),
  estudianteController.deleteEstudiante
)

router.post('/importar',
  autenticarJWT,
  verificarRol(['Administrador']),
  estudianteController.importarEstudiantes
)

// Enrolamiento biométrico de huellas (requiere Administrador o Instructor autenticado)
router.post('/enroll-start', autenticarJWT, verificarRol(['Administrador', 'Instructor']), estudianteController.enrollStart)
router.post('/enroll-capture', autenticarJWT, verificarRol(['Administrador', 'Instructor']), estudianteController.enrollCapture)
router.post('/enroll-complete', autenticarJWT, verificarRol(['Administrador', 'Instructor']), estudianteController.enrollComplete)
router.post('/enroll-cancel', autenticarJWT, verificarRol(['Administrador', 'Instructor']), estudianteController.enrollCancel)
router.put('/:id/enrolar-huella', autenticarJWT, verificarRol(['Administrador', 'Instructor']), estudianteController.enrolarHuellaLegacy)

// Verificación biométrica masiva de alta velocidad y estado de hardware (Acceso directo para Kiosco de Aula)
router.post('/verify', estudianteController.verifyFingerprint)
router.get('/fingerprint-status', estudianteController.getFingerprintStatus)

export default router
