import { Router } from 'express'
import { reportarRutaDesercion, estadoCorreosRutaDesercion } from '../controllers/reporteDesercionController.js'
import { autenticarJWT, verificarRol } from '../middlewares/auth.js'

const router = Router()

// Estado de los correos globales para el reporte (nunca devuelve los correos)
router.get(
  '/ruta-desercion/estado',
  autenticarJWT,
  verificarRol(['Administrador', 'Instructor']),
  estadoCorreosRutaDesercion
)

// Reportar a un aprendiz en ruta de deserción (notifica por correo al equipo y a coordinación/bienestar)
router.post(
  '/ruta-desercion/reportar',
  autenticarJWT,
  verificarRol(['Administrador', 'Instructor']),
  reportarRutaDesercion
)

export default router
