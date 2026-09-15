import { Router } from 'express'
import * as enrolamientoController from '../controllers/enrolamientoController.js'

const router = Router()

router.post('/guardar', enrolamientoController.guardarTemplate)

export default router
