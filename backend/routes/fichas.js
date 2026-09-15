import { Router } from 'express'
import * as fichaController from '../controllers/fichaController.js'
import { validarCamposRequeridos } from '../middlewares/validator.js'
import { autenticarJWT, verificarRol, autenticarOpcional } from '../middlewares/auth.js'

const router = Router()

// Lectura de fichas (accesible para usuarios y Kiosco)
router.get('/', autenticarOpcional, fichaController.getFichas)
router.get('/mis-fichas/:instructorId', autenticarJWT, fichaController.getMisFichas)
router.get('/:id/plantillas', fichaController.getPlantillasFicha)

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

export default router
