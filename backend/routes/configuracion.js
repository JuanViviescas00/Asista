import { Router } from 'express'
import { getCorreosReporte, updateCorreosReporte } from '../controllers/configuracionController.js'
import { autenticarJWT, verificarRol } from '../middlewares/auth.js'

const router = Router()

router.get('/correos-reporte', autenticarJWT, verificarRol(['Administrador']), getCorreosReporte)
router.put('/correos-reporte', autenticarJWT, verificarRol(['Administrador']), updateCorreosReporte)

export default router
