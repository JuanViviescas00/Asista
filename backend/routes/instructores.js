import { Router } from 'express'
import * as instructorController from '../controllers/instructorController.js'
import { validarCamposRequeridos, validarEmail } from '../middlewares/validator.js'
import { autenticarJWT, verificarRol, verificarRolOLider, autenticarOpcional } from '../middlewares/auth.js'

const router = Router()

// Lectura de instructores (requiere autenticación)
router.get('/', autenticarJWT, instructorController.getInstructores)

// Mutaciones de instructores (restringidas a Administrador)
router.post('/',
  autenticarJWT,
  verificarRol(['Administrador']),
  validarCamposRequeridos(['nombres', 'apellidos', 'numeroDocumento', 'correo']),
  validarEmail('correo'),
  instructorController.createInstructor
)

router.put('/:id',
  autenticarJWT,
  verificarRol(['Administrador', 'Instructor']),
  instructorController.updateInstructor
)

router.delete('/:id',
  autenticarJWT,
  verificarRol(['Administrador']),
  instructorController.deleteInstructor
)

router.post('/importar',
  autenticarJWT,
  verificarRolOLider(['Administrador']),
  instructorController.importarInstructores
)

// Endpoints de automatización RPA
router.get('/:id/credenciales-sofia', autenticarJWT, verificarRol(['Administrador', 'Instructor']), instructorController.getCredencialesSofia)
router.get('/documento/:documento/credenciales-sofia', autenticarJWT, verificarRol(['Administrador', 'Instructor']), instructorController.getCredencialesSofiaPorDocumento)
router.get('/todos-inasistencias-rpa', autenticarOpcional, instructorController.getTodosInasistenciasParaRPA)
router.get('/documento/:documento/inasistencias-rpa', autenticarOpcional, instructorController.getInasistenciasParaRPA)
router.post('/confirmar-subida-sofia', autenticarOpcional, instructorController.confirmarSubidaSofia)
router.post('/ejecutar-rpa', autenticarJWT, verificarRol(['Administrador']), instructorController.ejecutarRobotRPA)
router.get('/estado-rpa', autenticarJWT, verificarRol(['Administrador']), instructorController.getEstadoRobotRPA)

export default router
