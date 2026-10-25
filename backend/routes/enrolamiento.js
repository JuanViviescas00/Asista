import { Router } from 'express'
import * as enrolamientoController from '../controllers/enrolamientoController.js'
import { dispositivoLimiter } from '../middlewares/rateLimiter.js'

const router = Router()

router.post('/guardar', dispositivoLimiter, enrolamientoController.guardarTemplate)

export default router
