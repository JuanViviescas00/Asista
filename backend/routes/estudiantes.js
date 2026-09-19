import { Router } from 'express'
import * as estudianteController from '../controllers/estudianteController.js'
import * as permisoDatosController from '../controllers/permisoDatosController.js'
import { validarCamposRequeridos, validarEmail } from '../middlewares/validator.js'
import { autenticarJWT, verificarRol, autenticarOpcional } from '../middlewares/auth.js'

const router = Router()

// Operaciones de consulta (accesible con sesión o desde Kiosco de aula)
router.get('/', autenticarOpcional, estudianteController.getEstudiantes)
router.get('/:id/asistencia-resumen', autenticarOpcional, estudianteController.getAsistenciaResumen)

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
router.put('/:id/enrolar-huella', autenticarJWT, verificarRol(['Administrador', 'Instructor']), estudianteController.enrolarHuellaLegacy)

// Consentimiento de datos personales previo al enrolamiento (Administrador o Instructor)
router.get('/:id/consentimiento-datos', autenticarJWT, verificarRol(['Administrador', 'Instructor']), permisoDatosController.getConsentimientoDatos)
router.post('/:id/consentimiento-datos', autenticarJWT, verificarRol(['Administrador', 'Instructor']), permisoDatosController.createConsentimientoDatos)

export default router
