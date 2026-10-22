import express from 'express'
import {
  getProgramas,
  createPrograma,
  updatePrograma,
  deletePrograma,
} from '../controllers/programaController.js'
import { autenticarJWT, verificarRol, autenticarOpcional } from '../middlewares/auth.js'

const router = express.Router()

// Lectura de programas: accesible para todos (desplegar en el select de fichas)
router.get('/', autenticarOpcional, getProgramas)

// Creación, modificación y eliminación: RESTRINGIDO ÚNICAMENTE AL ADMINISTRADOR
router.post('/', autenticarJWT, verificarRol(['Administrador']), createPrograma)
router.put('/:id', autenticarJWT, verificarRol(['Administrador']), updatePrograma)
router.delete('/:id', autenticarJWT, verificarRol(['Administrador']), deletePrograma)

export default router
