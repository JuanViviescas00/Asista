import { Router } from 'express'
import * as fichaController from '../controllers/fichaController.js'
import { validarCamposRequeridos } from '../middlewares/validator.js'
import { autenticarJWT, verificarRol, verificarRolOLider, autenticarOpcional } from '../middlewares/auth.js'
import { dispositivoLimiter } from '../middlewares/rateLimiter.js'

const router = Router()

// Lectura de fichas (accesible para usuarios y Kiosco)
router.get('/', autenticarJWT, fichaController.getFichas)
router.get('/mis-fichas/:instructorId', autenticarJWT, verificarRol(['Administrador', 'Instructor']), fichaController.getMisFichas)
router.get('/:id/plantillas', dispositivoLimiter, autenticarOpcional, fichaController.getPlantillasFicha)
router.get('/:id/plantillas-biometricas', autenticarOpcional, fichaController.getPlantillasFicha)
router.get('/:id/tardanzas-resumen', autenticarJWT, verificarRol(['Administrador', 'Instructor']), fichaController.getTardanzasResumen)

// Gestión de fichas (restringido a Administrador)
router.post('/',
  autenticarJWT,
  verificarRol(['Administrador']),
  validarCamposRequeridos(['codigoFicha', 'nombrePrograma', 'jornada']),
  fichaController.createFicha
)

router.put('/:id',
  autenticarJWT,
  verificarRol(['Administrador']),
  fichaController.updateFicha
)

router.delete('/:id',
  autenticarJWT,
  verificarRol(['Administrador']),
  fichaController.deleteFicha
)

router.post('/importar',
  autenticarJWT,
  verificarRol(['Administrador']),
  fichaController.importarFichas
)


// Gestión de equipo docente de la ficha (Docente Líder o Administrador)
router.post('/:id/instructores',
  autenticarJWT,
  verificarRolOLider(['Administrador']),
  fichaController.addInstructorAFicha
)

router.delete('/:id/instructores/:instructorId',
  autenticarJWT,
  verificarRolOLider(['Administrador']),
  fichaController.removeInstructorDeFicha
)

export default router
