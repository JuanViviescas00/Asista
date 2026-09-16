import { Router } from 'express'
import * as dispositivoController from '../controllers/dispositivoController.js'
import { autenticarJWT, verificarRol } from '../middlewares/auth.js'

const router = Router()

router.post('/registrar', dispositivoController.registrar)
router.get('/', autenticarJWT, verificarRol(['Administrador']), dispositivoController.getDispositivos)
router.put('/:id/fichas', autenticarJWT, verificarRol(['Administrador']), dispositivoController.asociarFichas)
router.put('/:id/reset-fingerprint', autenticarJWT, verificarRol(['Administrador']), dispositivoController.resetFingerprint)
router.put('/:id/aprobar', autenticarJWT, verificarRol(['Administrador']), dispositivoController.aprobar)
router.put('/:id/deshabilitar', autenticarJWT, verificarRol(['Administrador']), dispositivoController.deshabilitar)
router.delete('/:id', autenticarJWT, verificarRol(['Administrador']), dispositivoController.eliminar)

export default router
