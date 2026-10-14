# Registro de Troubleshooting y Correcciones (Trazabilidad)

## [2026-10-10 22:55] Mejoras de Plantillas Excel, Validaciones de Jerarquía Académica y Manejo de Conflictos (QA TestSprite)

- **Fecha y Hora:** 2026-10-10 22:55:00 -05:00
- **Descripción del Problema / Bug:**
  1. Las plantillas Excel de importación masiva (`plantilla_fichas.xlsx`, `plantilla_instructores.xlsx`, `plantilla_estudiantes.xlsx`) descargaban filas de ejemplo (dummy data), obligando al usuario a borrarlas manualmente antes de diligenciar sus datos reales.
  2. Inserción de estudiantes huérfanos o con fichas inexistentes generaba inconsistencias en la base de datos y fallos en cascada en reportes y sesiones de asistencia.
  3. Los errores de clave duplicada de MongoDB (código 11000) en Fichas, Instructores, Días Festivos y Estudiantes provocaban respuestas de error genéricas HTTP 500 con stack trace crudo, en vez de mensajes amigables HTTP 400.
  4. En `diaFestivoController.createDiaFestivo`, faltaba el retorno HTTP `res.status(201).json(dia)`, dejando colgadas las peticiones hasta agotamiento de tiempo de espera (timeout).
  5. En `Instructores.vue`, la búsqueda de documentos con puntos (`1.234.567.890`) no coincidía con números planos (`1234567890`).
  6. En `Fichas.vue`, los instructores de apoyo asignados a una ficha no eran visibles al expandir la fila de detalle.
  7. En `PanelDispositivos.vue`, no se mostraba la fecha/hora de registro en las tarjetas de dispositivos activos.
- **Causa Raíz:**
  1. `ImportarUsuarios.vue` incluía filas de muestra en el array pasado a SheetJS.
  2. Falta de validación previa de existencia de `fichaId` en los endpoints de creación e importación masiva de estudiantes.
  3. Bloques `catch (err)` en controladores capturaban el error 11000 de MongoDB pero caían en `res.status(500)`.
  4. Omisión de la sentencia `res.status(201).json(dia)` en la rama exitosa de `createDiaFestivo`.
  5. Falta de normalización de caracteres en la cadena de búsqueda de instructores.
  6. Componente de detalle solo renderizaba el docente líder, no los docentes de apoyo.
- **Solución Aplicada:**
  1. Modificación de `descargarPlantilla` en `frontend/src/views/ImportarUsuarios.vue` para generar únicamente la fila de encabezados (cabeceras puras). Se agregó además etiqueta visible y `aria-label="Descargar Plantilla"`.
  2. Validación estricta en `backend/controllers/estudianteController.js` (`createEstudiante` e `importarEstudiantes`): `fichaId` es obligatorio y debe existir en MongoDB; de lo contrario retorna HTTP 400 (`"La ficha especificada no existe. Debe crear primero la ficha."`).
  3. Manejo de `err.code === 11000` en `estudianteController.js`, `instructorController.js`, `fichaController.js` y `diaFestivoController.js` retornando HTTP 400 con mensaje claro y descriptivo.
  4. Incorporación de `res.status(201).json(dia)` en `diaFestivoController.js`.
  5. Normalización con expresión regular `replace(/[\.\s-]/g, '')` en el filtro de búsqueda de `Instructores.vue`.
  6. Inclusión de helper `formatDocentesComunes()` y visualización de "Docentes de Apoyo" en el acordeón de `Fichas.vue`.
  7. Visualización del campo `createdAt` en las tarjetas de `PanelDispositivos.vue`.
- **Archivos Modificados:**
  - `backend/controllers/diaFestivoController.js`
  - `backend/controllers/estudianteController.js`
  - `backend/controllers/fichaController.js`
  - `backend/controllers/instructorController.js`
  - `frontend/src/views/Fichas.vue`
  - `frontend/src/views/ImportarUsuarios.vue`
  - `frontend/src/views/Instructores.vue`
  - `frontend/src/views/PanelDispositivos.vue`
- **Verificación:**
  - Compilación exitosa de frontend con `npm run build:frontend` (Vite v8, 125 módulos transformados, 0 errores).
  - Validación de sintaxis Node.js con `node -c` en todos los controladores backend modificados (código de salida 0).

---

## [2026-10-12 11:10] Endurecimiento Perimetral Backend, Corrección de Vulnerabilidades Críticas y Remoción de Código Muerto

- **Fecha y Hora:** 2026-10-12 11:10:00 -05:00
- **Descripción del Problema / Bug:**
  1. *Fuga de Huellas Biométricas:* El endpoint `GET /api/estudiantes` retornaba las plantillas biométricas completas (`huellaTemplate`, `huellaTemplate2`) en texto base64 a cualquier consulta del cliente web.
  2. *ReDoS en Búsquedas:* Parámetros de consulta `documento` y `nombres` se inyectaban sin escapar en expresiones regulares de MongoDB (`$regex`).
  3. *Open Mail Relay:* La ruta `POST /api/enviar-codigo` en `backend/index.js` aceptaba cualquier destinatario y código desde la red pública sin autenticación ni verificación de base de datos.
  4. *Exposición de Credenciales Externas (Sofia Plus):* `GET /api/instructores`, `POST /api/instructores` y `PUT /api/instructores/:id` descifraban y retornaban contraseñas externas de Sofia Plus en texto plano a los clientes.
  5. *IDOR en Edición de Instructores y Perfil:* Cualquier instructor autenticado podía invocar `PUT /api/instructores/:id` sobre otro docente y alterar sus datos o privilegios. Igualmente, `updatePerfil` mutaba el primer administrador de la base de datos sin comprobar la sesión activa.
  6. *Forja de Asistencias no Autenticada:* La ruta `POST /api/asistencias` tenía middleware `autenticarOpcional`, permitiendo que actores sin sesión inyectaran registros de asistencia manual.
  7. *Backdoor en Rate Limiter:* `backend/middlewares/rateLimiter.js` saltaba la limitación de peticiones si la cabecera `User-Agent` o `Referer` contenía `testsprite`.
  8. *Tampering de Enrolamiento:* `POST /api/enrolamiento/guardar` no validaba token de sesión ni identidad de hardware biométrico.
  9. *Código Muerto:* ~450 líneas de código zombi en `PanelInstructor.vue` y `frontend/src/services/index.js` llamaban a endpoints inexistentes (`/estudiantes/enroll-*`, `/estudiantes/fingerprint-status`) bajo un flag estático `ENROLAMIENTO_EN_PANEL = false`.
- **Causa Raíz:**
  1. Ausencia de `.select('-huellaTemplate -huellaTemplate2')` en la consulta `Estudiante.find(filter)`.
  2. Ausencia de sanitización de caracteres especiales de regex en `estudianteController.getEstudiantes`.
  3. Endpoint legado de envío de correos sin control de acceso en la raíz del servidor.
  4. Llamadas a `decrypt(obj.passwordSofiaPlus)` en serializadores JSON de instructores.
  5. Falta de validación estricta de pertenencia (`req.usuario.id === req.params.id`) y falta de descarte de campos privilegiados.
  6. Uso de `autenticarOpcional` en vez de `autenticarJWT, verificarRol(['Administrador', 'Instructor'])`.
  7. Excepción condicional `skip: /testsprite/i.test(...)` en el limitador de fuerza bruta.
  8. Ausencia de validación de JWT o cabeceras `x-device-id` / `x-device-token`.
  9. Desacople del SDK web local en favor de la arquitectura de escritorio Electron Asista.
- **Solución Aplicada:**
  1. Se excluyeron los campos biométricos en `getEstudiantes` con `.select('-huellaTemplate -huellaTemplate2')`.
  2. Se implementó helper `escapeRegex()` para neutralizar caracteres de regex en `getEstudiantes`.
  3. Se eliminó la ruta abierta `POST /api/enviar-codigo` y la configuración huérfana de `nodemailer` en `backend/index.js`, canalizando la recuperación exclusivamente a través de `POST /api/auth/recovery-code` con hashing bcrypt, expiración de 10 minutos y despacho seguro en `backend/services/emailService.js`.
  4. Se censuró la exposición de contraseñas de Sofia Plus en `getInstructores`, `createInstructor` y `updateInstructor`, devolviendo únicamente la bandera booleana `tienePasswordSofia`.
  5. Se reforzó `updateInstructor` para verificar que instructores solo editen su propio registro, bloqueando además la manipulación de campos de administración (`esLider`, `rol`, `fichas`, `activo`). En `updatePerfil`, la consulta se ancló a `req.usuario.id`.
  6. Se protegió `POST /api/asistencias` con `autenticarJWT, verificarRol(['Administrador', 'Instructor'])`.
  7. Se eliminó el bypass de `testsprite` en `rateLimiter.js` y se fijó un límite estricto de 20 intentos por 15 minutos.
  8. Se protegió `POST /api/enrolamiento/guardar` exigiendo JWT de sesión o credenciales válidas de dispositivo enrolador (`x-device-id` + `x-device-token`). Se actualizó `huellero/src/main/engine.js` para enviar cabeceras autorizadas.
  9. Se eliminó el bloque completo de código muerto de WebSDK en `PanelInstructor.vue`, la variable `ENROLAMIENTO_EN_PANEL`, el elemento no renderizado del template y el objeto `fingerprint` en `frontend/src/services/index.js`.
- **Archivos Modificados:**
  - `backend/index.js`
  - `backend/controllers/authController.js`
  - `backend/controllers/estudianteController.js`
  - `backend/controllers/instructorController.js`
  - `backend/controllers/enrolamientoController.js`
  - `backend/routes/asistencias.js`
  - `backend/routes/auth.js`
  - `backend/services/emailService.js`
  - `backend/middlewares/rateLimiter.js`
  - `huellero/src/main/engine.js`
  - `frontend/src/services/index.js`
  - `frontend/src/views/PanelInstructor.vue`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Sintaxis de todos los archivos Node.js verificada con `node -c` (salida exitosa código 0).
  - Build de producción frontend verificado con `npm run build:frontend` (Vite v8, 125 módulos transformados, 0 errores).

---

## [2026-10-12 11:23] Notificación y Confirmación por Correo Electrónico tras Cambio de Contraseña

- **Fecha y Hora:** 2026-10-12 11:23:00 -05:00
- **Descripción del Problema / Bug:**
  - Los usuarios que actualizaban o restablecían su contraseña (vía recuperación de código PIN, actualización de perfil o cambio de clave) no recibían ninguna notificación ni confirmación por correo electrónico confirmando la operación.
  - Esto impedía que el usuario tuviera certeza inmediata del éxito del cambio y representaba una brecha de seguridad (si una cuenta fuera vulnerada, el titular legítimo no era notificado del cambio de credenciales).
- **Causa Raíz:**
  - Ausencia de plantilla y disparador de correo de confirmación de cambio de contraseña en `backend/services/emailService.js` y en los controladores de autenticación y perfil.
- **Solución Aplicada:**
  - Se creó la función `enviarCorreoConfirmacionCambioPassword(correo, nombre)` en `backend/services/emailService.js` con diseño institucional SENA, indicando fecha y hora colombiana de la modificación, confirmación de seguridad y advertencia clara en caso de actividad no reconocida.
  - Se integró el envío asíncrono no bloqueante en todos los flujos de cambio de contraseña:
    1. Restablecimiento por código de recuperación (`resetPassword` en `authController.js`).
    2. Cambio directo de contraseña autenticado (`cambiarPassword` en `authController.js`).
    3. Actualización de contraseña desde el perfil de usuario (`updatePerfil` en `authController.js`).
    4. Actualización de contraseña de docente (`updateInstructor` en `instructorController.js`).
- **Archivos Modificados:**
  - `backend/services/emailService.js`
  - `backend/controllers/authController.js`
  - `backend/controllers/instructorController.js`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Validación de sintaxis Node.js con `node -c` en `emailService.js`, `authController.js` e `instructorController.js` (salida exitosa código 0).

---

## [2026-10-13 19:48] Habilitación de Cabeceras de Dispositivo en CORS y Sincronización de Enrolamiento

- **Fecha y Hora:** 2026-10-13 19:48:00 -05:00
- **Descripción del Problema / Bug:**
  - Al intentar enrolar la huella de un aprendiz desde la app de escritorio `huellero`, la operación fallaba con el mensaje: `Acceso no autorizado. Se requiere token JWT de sesión o credenciales de dispositivo biométrico registrado.`
- **Causa Raíz:**
  - Las cabeceras `x-device-id` y `x-device-token` no estaban listadas explícitamente en el array `allowedHeaders` del middleware `cors` en `backend/index.js`.
  - La aplicación de escritorio requería además la recompilación de su bundle en `huellero/out/main/index.js` para asegurar que el despacho de `guardarTemplate` adjunte el token JWT del docente (`Authorization: Bearer <docente.token>`) y las cabeceras de hardware.
- **Solución Aplicada:**
  - Se agregaron `'x-device-id'` y `'x-device-token'` a `allowedHeaders` en la configuración de CORS de `backend/index.js`.
  - Se recompiló el bundle de `huellero` con `electron-vite build`.
- **Archivos Modificados:**
  - `backend/index.js`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Validación de sintaxis con `node -c backend/index.js` (salida exitosa código 0).
  - Compilación exitosa de `huellero` con `electron-vite build` (0 errores).



