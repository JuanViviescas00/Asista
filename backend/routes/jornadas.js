import { Router } from 'express'
import * as jornadaController from '../controllers/jornadaController.js'
import { validarCamposRequeridos, validarFecha } from '../middlewares/validator.js'
import { autenticarJWT, verificarRol, autenticarOpcional } from '../middlewares/auth.js'

const router = Router()

// Consulta de Jornadas (permitido para Kiosco de Aula y paneles autenticados)
router.get('/', autenticarOpcional, validarFecha('desde'), validarFecha('hasta'), jornadaController.getJornadas)
// Creación/aseguramiento de Jornada (Administrador o Instructor)
router.post('/',
  autenticarJWT,
  verificarRol(['Administrador', 'Instructor']),
  validarCamposRequeridos(['fichaId', 'fecha']),
  validarFecha('fecha'),
  jornadaController.createJornada
)

export default router
