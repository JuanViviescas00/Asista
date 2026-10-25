import { Router } from 'express'
import * as claseController from '../controllers/claseController.js'
import { autenticarJWT, verificarRol } from '../middlewares/auth.js'

const router = Router()

const soloDocentes = [autenticarJWT, verificarRol(['Administrador', 'Instructor'])]

router.post('/activar', ...soloDocentes, claseController.activar)
router.post('/finalizar', ...soloDocentes, claseController.finalizar)
router.get('/estado', ...soloDocentes, claseController.estado)

export default router
