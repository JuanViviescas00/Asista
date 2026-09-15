import { Router } from 'express'
import * as asistenciaController from '../controllers/asistenciaController.js'
import { validarCamposRequeridos, validarFecha } from '../middlewares/validator.js'
import { autenticarJWT, verificarRol, autenticarOpcional } from '../middlewares/auth.js'

const router = Router()

// Consulta y Registro de Asistencias (permitido para Kiosco de Aula y paneles autenticados)
router.get('/', autenticarOpcional, validarFecha('fecha'), asistenciaController.getAsistencias)
router.post('/', autenticarOpcional, validarCamposRequeridos(['estudianteId', 'fichaId', 'fecha', 'estado']), validarFecha('fecha'), asistenciaController.createAsistencia)

// Control de Jornadas (requiere Administrador o Instructor)
router.post('/inhabilitar-jornada',
  autenticarJWT,
  verificarRol(['Administrador', 'Instructor']),
  validarCamposRequeridos(['fichaId', 'fecha']),
  validarFecha('fecha'),
  asistenciaController.inhabilitarJornada
)

router.post('/reactivar-jornada',
  autenticarJWT,
  verificarRol(['Administrador', 'Instructor']),
  validarCamposRequeridos(['fichaId', 'fecha']),
  validarFecha('fecha'),
  asistenciaController.reactivarJornada
)

// Sincronización idempotente de asistencias pendientes del huellero local.
// Autenticación por deviceId + token (dentro del controller, no con JWT de usuario).
router.post('/sync', asistenciaController.syncAsistencias)

// Gestión de base de datos SQLite offline (restringido a Administrador)
router.get('/sqlite/download', autenticarJWT, verificarRol(['Administrador']), asistenciaController.downloadSqlite)
router.post('/sqlite/sync-all', autenticarJWT, verificarRol(['Administrador']), asistenciaController.syncAllSqlite)

export default router
