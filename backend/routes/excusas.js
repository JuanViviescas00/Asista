import { Router } from 'express'
import * as excusaController from '../controllers/excusaController.js'
import { validarCamposRequeridos } from '../middlewares/validator.js'
import { autenticarJWT, verificarRol } from '../middlewares/auth.js'

const router = Router()

// Consulta y radicación de excusas (disponible para aprendices, instructores y admin)
router.get('/', autenticarJWT, excusaController.getExcusas)
router.post('/',
  autenticarJWT,
  validarCamposRequeridos(['estudianteId', 'fichaId', 'fechaInasistencia', 'motivo']),
  excusaController.createExcusa
)

router.put('/:id', autenticarJWT, verificarRol(['Administrador']), excusaController.updateExcusa)

// Aprobación o Rechazo de excusas (restringido a Docente Líder o Administrador)
router.put('/:id/aprobar',
  autenticarJWT,
  verificarRol(['Administrador', 'Instructor']),
  excusaController.aprobarExcusa
)

router.put('/:id/rechazar',
  autenticarJWT,
  verificarRol(['Administrador', 'Instructor']),
  excusaController.rechazarExcusa
)

export default router
