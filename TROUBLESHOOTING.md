# Registro de Troubleshooting y Correcciones (Trazabilidad)

## [2026-10-23 23:10] Actualización de Reglas de Tardanza Escalonada y Auto-cierre al Fin de Jornada

- **Fecha y Hora:** 2026-10-23 23:10:00 -05:00
- **Descripción del Problema / Requerimiento:**
  - El usuario solicitó ajustar la escala de tiempos de tardanza:
    * Mantener el tiempo de gracia en 10 minutos (Presente).
    * Tardanza de 1 hora: desde el minuto 11 hasta los 60 minutos de haber iniciado la clase.
    * Tardanza de 2 horas: desde el minuto 61 hasta los 120 minutos (2 horas) de haber iniciado la clase.
    * Falta: marcaciones pasados los 120 minutos desde el inicio de clase.
  - El auto-cierre de clase activa (que estaba fijado estáticamente en 3 horas) debe extenderse a la duración total de la jornada formativa (6 horas para jornadas diurnas/mixtas y 5 horas para jornada nocturna).
- **Causa Raíz:**
  - Los umbrales anteriores acumulaban el tiempo de gracia sobre las horas reloj (70 min y 130 min en backend, y 65/125 min en frontend), generando desfases con las horas académicas reales.
  - El límite de 3 horas cerraba prematuramente clases activas en jornadas formativas completas de 5 o 6 horas.
- **Solución Aplicada:**
  1. *Unificación de Umbrales:* Configurado `TOLERANCIA_MINUTOS = 10`, `LIMITE_TARDANZA_1_HORA = 60` y `LIMITE_TARDANZA_2_HORAS = 120` tanto en `backend/services/asistenciaService.js` como en `frontend/src/utils/asistenciaTiempo.js`.
  2. *Auto-cierre Dinámico por Jornada:* En `backend/services/cronService.js`, `backend/controllers/claseController.js` y `backend/services/socketService.js`, el límite de auto-cierre ahora se calcula dinámicamente con `topeHorasPorJornada(jornada)` (6 horas en el día, 5 horas en la noche), emitiendo motivo `AUTO_CIERRE_FIN_JORNADA`.
- **Archivos Modificados:**
  - `backend/services/asistenciaService.js`
  - `frontend/src/utils/asistenciaTiempo.js`
  - `backend/services/cronService.js`
  - `backend/controllers/claseController.js`
  - `backend/services/socketService.js`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Validación de sintaxis en Node.js (`node -c`).
  - Compilación exitosa del frontend (`npm run build:prod`).

---

## [2026-10-23 21:40] Desacoplamiento y Retiro Integral de SQLite y Dependencias de Compilación C++ (node-gyp / Python3)

- **Fecha y Hora:** 2026-10-23 21:40:00 -05:00
- **Descripción del Problema / Requerimiento:**
  - Se identificó que SQLite (`better-sqlite3`) y sus servicios asociados (`sqliteExport.js`) actuaban como un "espejo de solo escritura" sin lectura ni consumo en el frontend, kiosco o lógica del negocio.
  - La presencia de `better-sqlite3` obligaba a instalar herramientas de compilación C++ (`python3`, `make`, `g++`) en el contenedor Docker mediante `node-gyp`, inflando la imagen en más de 200 MB y aumentando los tiempos de despliegue.
  - Se solicitó retirar SQLite del backend y optimizar la imagen Docker, aplicando los cambios exclusivamente en la rama de trabajo `juan`.
- **Causa Raíz:**
  - Residuo arquitectónico de etapas tempranas donde se proyectaba almacenamiento local en SQLite por docente. En la arquitectura actual, MongoDB Atlas cubre el 100% de la persistencia institucional y el kiosco opera con colas JSON atómicas (`store.js`), mientras que las descargas de usuario se realizan en Excel (.xlsx) y PDF.
- **Solución Aplicada:**
  1. *Desinstalación de dependencias:* Removido `better-sqlite3` de `backend/package.json` y sincronizado `package-lock.json`.
  2. *Retiro de servicio y sincronizadores:* Eliminado `backend/services/sqliteExport.js` y llamadas directas en `asistenciaController.js`, `diaFestivoController.js`, `excusaController.js` y `cronService.js`.
  3. *Endpoints legados:* Los endpoints de descarga y sincronización SQLite en `asistenciaController.js` responden código HTTP 410 (Gone / Descontinuado) informando el uso de Excel/PDF.
  4. *Optimización del Dockerfile:* Eliminada la instalación de `python3`, `make` y `g++`, manteniendo únicamente `curl` para el healthcheck; removida la creación de la carpeta local efímera `/app/data`.
  5. *Ajuste de docker-compose.yml:* Eliminado el volumen local innecesario `asista-data:/app/data`.
- **Archivos Modificados:**
  - `backend/package.json`
  - `package-lock.json`
  - `backend/services/sqliteExport.js` (eliminado)
  - `backend/controllers/asistenciaController.js`
  - `backend/controllers/diaFestivoController.js`
  - `backend/controllers/excusaController.js`
  - `backend/services/cronService.js`
  - `Dockerfile`
  - `docker-compose.yml`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Verificación de sintaxis de todos los controladores y servicios (`node -c`).
  - Compilación exitosa del monolito (`npm run build:prod`) sin errores.
  - Comprobación de integridad del monorepo y empaquetado de producción.

---

## [2026-10-22 21:55] Workflow de CI/CD para Unificación de Ramas (Backend/Frontend) y Compilación del Monolito

- **Fecha y Hora:** 2026-10-22 21:55:00 -05:00
- **Descripción del Problema / Requerimiento:**
  - El equipo creó ramas independientes (`Backend`, `Frontend` y `Huellero`) para el desarrollo modular.
  - Se solicitó un workflow automatizado de CI/CD para que cada vez que se suban cambios a `Backend`, se unifique con `Frontend`, y cuando se suban cambios a `Frontend`, se ensamble con `Backend`, compile el frontend (`npm run build:prod`) y deposite los estáticos en `backend/public/`, generando y manteniendo actualizado el monolito listo para producción.
- **Causa Raíz:**
  - La fragmentación de ramas requería procesos manuales de merge y compilación del frontend hacia `backend/public`, con riesgo de desfase entre los cambios del equipo de frontend y el servidor backend.
- **Solución Aplicada:**
  1. *Workflow de GitHub Actions (`.github/workflows/monolito-sync.yml`):*
     - Activadores (`push` en `Backend`, `Frontend`, `Huellero` y `main`, más `workflow_dispatch`).
     - Fusión automática de la rama entrante hacia `main` preservando el historial.
     - Instalación de dependencias del monorepo (`npm install`, frontend y backend).
     - Compilación del frontend y copiado seguro a `backend/public` vía `npm run build:prod`.
     - Ejecución de la suite de pruebas unitarias del backend (`node --test`) para garantizar cero regresiones antes de publicar.
     - Commit y push seguro a `main` con etiqueta `[skip ci]` para prevenir bucles de ejecución.
- **Archivos Modificados:**
  - `.github/workflows/monolito-sync.yml`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Ejecución local del ciclo completo de compilación y pruebas (`npm run build:prod && cd backend && node --test`): 54 de 54 pruebas pasando al 100%.
  - Sintaxis de YAML validada.

---

## [2026-10-22 21:45] Dockerfile Multi-Etapa de Producción, Endpoint de Salud y Despliegue en Coolify

- **Fecha y Hora:** 2026-10-22 21:45:00 -05:00
- **Descripción del Problema / Requerimiento:**
  - El usuario solicitó la creación/actualización del `Dockerfile` para la aplicación, preparándola para su despliegue en entornos contenerizados y plataformas PaaS autoalojadas como **Coolify**.
- **Causa Raíz:**
  - El `Dockerfile` anterior estaba configurado con variables y puertos rígidos para Render (`PORT=10000`), carecía de paquetes de compilación del sistema para dependencias nativas de C++ (como `better-sqlite3`) y no contaba con un healthcheck para monitorización de contenedores.
- **Solución Aplicada:**
  1. *Optimización de `Dockerfile` Multi-Etapa:*
     - **Etapa 1 (`frontend-builder`):** Compilación aislada de Vue 3 / Vite en `node:22-bookworm-slim`.
     - **Etapa 2 (`runner`):** Servidor de producción en `node:22-bookworm-slim` con instalación de dependencias nativas (`python3`, `make`, `g++`) para garantizar compatibilidad con `better-sqlite3`, e inyección del frontend en `public/`.
     - Se añadió `HEALTHCHECK` consultando `/api/health` cada 30 segundos.
     - Se fijó el puerto estándar `PORT=3000` y `EXPOSE 3000`.
  2. *Endpoint de Salud en Backend (`backend/index.js`):*
     - Se añadió la ruta `GET /api/health` que devuelve estado 200 con JSON `{ status: 'ok', servicio: 'asista-backend', uptime, timestamp }`.
  3. *Actualización de `docker-compose.yml` y `.dockerignore`:*
     - `docker-compose.yml` simplificado para orquestar el contenedor `asista` con volumen persistente `asista-data:/app/data` para SQLite y variables de entorno.
     - `.dockerignore` ampliado para ignorar `node_modules`, `backend/data`, `frontend/dist` y archivos `.env` locales.
- **Archivos Modificados:**
  - `Dockerfile`
  - `.dockerignore`
  - `docker-compose.yml`
  - `backend/index.js`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Pruebas unitarias completas: 54 de 54 pruebas pasando al 100% con `node --test`.
  - Endpoint de salud comprobado exitosamente vía HTTP (`GET /api/health` devuelve 200 OK).

---

## [2026-10-22 20:55] Onboarding Obligatorio de Instructores (Cambio de Contraseña y Clave Sofía Plus en Primer Login)

- **Fecha y Hora:** 2026-10-22 20:55:00 -05:00
- **Descripción del Problema / Requerimiento:**
  - Al iniciar sesión por primera vez, los instructores contaban con su número de documento como contraseña provisional y carecían de la clave de Sofía Plus configurada.
  - El usuario solicitó que al ingresar por primera vez sea obligatorio e ineludible cambiar la contraseña del sistema y, secuencialmente a continuación, registrar la contraseña del portal de Sofía Plus para habilitar la sincronización del robot RPA.
- **Causa Raíz:**
  - No existía un flag (`primerLogin`) en el modelo `Instructor` ni un mecanismo bloqueante a nivel de interfaz que exigiera este doble paso de forma obligatoria antes de habilitar las funciones del panel de instructor.
- **Solución Aplicada:**
  1. *Backend (`backend/models/Instructor.js` y `backend/controllers/authController.js`):*
     - Se añadieron los campos `primerLogin: { type: Boolean, default: true }` y `debeCambiarPassword: { type: Boolean, default: true }` al esquema `Instructor`.
     - En el endpoint `POST /api/auth/login`, se evalúa si el docente debe completar su configuración inicial y se expone `primerLogin: true` y `tienePasswordSofia: Boolean(passwordSofiaPlus)` en el payload del usuario.
     - Se creó el endpoint atómico `POST /api/auth/completar-primer-login` protegido con JWT que valida la contraseña actual/provisional, actualiza con hash seguro bcrypt la nueva contraseña del sistema, cifra con AES-256-GCM la clave de Sofía Plus, marca `primerLogin: false` y expide un token actualizado.
  2. *Frontend (`ModalPrimerLoginInstructor.vue`, `DefaultLayout.vue`, `AdminPerfil.vue`, `useAuth.js`):*
     - Se implementó el componente `<ModalPrimerLoginInstructor />` con un wizard de 2 pasos bloqueante (sin botón de cerrar, sin cierre por clic exterior ni escape).
     - **Paso 1:** Validación y cambio de contraseña provisional (mínimo 6 caracteres, validación de coincidencia y diferencia respecto a la actual).
     - **Paso 2:** Solicitud y confirmación de la contraseña oficial de Sofía Plus con aviso de cifrado AES-256 y botón "Guardar y Comenzar".
     - Se añadió botón secundario "Cerrar sesión" en el pie por si el instructor no tiene sus credenciales en el momento.
     - Se integró en `DefaultLayout.vue` activándose automáticamente si `usuario.rol === 'Instructor' && usuario.primerLogin`.
     - En `AdminPerfil.vue`, se integró botón y modal para que los instructores puedan actualizar su clave de Sofía Plus en cualquier momento posterior.
  3. *Suite de Pruebas Automatizadas (`backend/controllers/authController.test.js`):*
     - 4 nuevas pruebas unitarias cubriendo: detección de primer login, rechazo por clave actual incorrecta, validación de longitud/coincidencia de contraseña, y actualización atómica exitosa con cifrado AES-256 y desactivación del flag `primerLogin`.
- **Archivos Modificados:**
  - `backend/models/Instructor.js`
  - `backend/controllers/authController.js`
  - `backend/routes/auth.js`
  - `backend/controllers/authController.test.js`
  - `frontend/src/composables/useAuth.js`
  - `frontend/src/services/index.js`
  - `frontend/src/components/ModalPrimerLoginInstructor.vue`
  - `frontend/src/layouts/DefaultLayout.vue`
  - `frontend/src/views/AdminPerfil.vue`
  - `backend/public/` (Sincronizado vía `npm run build:prod`)
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - 54 de 54 pruebas unitarias pasando al 100% (`node --test`).
  - Compilación de producción con `npm run build:prod` completada en 1.1s sin errores.
  - Verificación en MongoDB Atlas de los flags `primerLogin` para docentes.

---

## [2026-10-22 20:05] Filtro Estricto por Docente Dictante en Endpoints RPA (Asignación Responsable de Inasistencias)

- **Fecha y Hora:** 2026-10-22 20:05:00 -05:00
- **Descripción del Problema / Bug:**
  - En la prueba del robot RPA para la instructora Silvia López, el bot cargaba las inasistencias de la jornada del 21/10/2026 de la ficha 3139319, a pesar de que dicha clase fue dictada y registrada por el docente **Alexander Guevara**.
  - En el SENA y en Sofía Plus, cada instructor debe reportar única y exclusivamente las inasistencias correspondientes a las jornadas u horas que él mismo dictó, para evitar suplantaciones o errores en el historial de horas y novedades.
- **Causa Raíz:**
  - Los endpoints `getInasistenciasParaRPA` y `getTodosInasistenciasParaRPA` en `backend/controllers/instructorController.js` filtraban únicamente por fichas donde el docente fuera líder o apoyo (`fichaId: { $in: targetFichaIds }`), sin exigir que el campo `instructorId` de la inasistencia coincidiera con el instructor autenticado.
- **Solución Aplicada:**
  1. *Filtro Estricto por Docente (`backend/controllers/instructorController.js`):*
     - En `getInasistenciasParaRPA` y `getTodosInasistenciasParaRPA`, se fijó `instructorId: instructor._id` (o `inst._id`) como condición obligatoria en la consulta a `Inasistencia.find()`.
     - Ahora Silvia López solo recibe las inasistencias de las clases que ella misma dictó, y Alexander Guevara recibe las suyas.
  2. *Actualización de Suite de Pruebas (`backend/controllers/rpaController.test.js`):*
     - Se añadió la aserción de `instructorId` en el filtro capturado para garantizar que futuras modificaciones no eliminen esta restricción.
  3. *Reinicio y Validación del Servicio:*
     - Se reinició el proceso backend y se validó vía HTTP contra MongoDB Atlas.
- **Archivos Modificados:**
  - `backend/controllers/instructorController.js`
  - `backend/controllers/rpaController.test.js`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Petición HTTP a `GET /api/instructores/documento/1100959620/inasistencias-rpa` (Silvia López): Devuelve `total: 0, inasistencias: []`.
  - Petición HTTP a `GET /api/instructores/documento/1100953511/inasistencias-rpa` (Alexander Guevara): Devuelve `total: 3, inasistencias: [...]` con las 3 inasistencias del 21/10/2026.
  - Suite de 50 pruebas con `node --test` pasando al 100%.

---

## [2026-10-22 19:30] Integración de Inasistencias/Jornadas, Corrección de Errores Críticos e Implementación de RPA Sofía Plus (Pasos 6d-6 / 6d-7)

- **Fecha y Hora:** 2026-10-22 19:30:00 -05:00
- **Descripción del Problema / Requerimiento:**
  1. *Fusión y Optimización de Asistencias:* Se requirió integrar la arquitectura de separación de novedades (`Inasistencia` y `Jornada`) proveniente de la rama `Maria`, la cual elimina la sobrecarga de miles de registros diarios con `Presente` y añade auto-guardado en tiempo real en el panel del instructor.
  2. *Contrato Inmutable con RPA de Sofía Plus (Pasos 6d-6 / 6d-7):* Conectar los nuevos modelos con los endpoints del robot RPA (`getInasistenciasParaRPA`, `getTodosInasistenciasParaRPA` y `confirmarSubidaSofia`), filtrando estrictamente por `estadoCarga: 'LISTO_PARA_SUBIR'`, garantizando idempotencia en la confirmación y preservando la autenticación `autenticarOpcional`.
  3. *Corrección de Errores Críticos:*
     - `diaFestivoController.js` había sido eliminado accidentalmente en la rama `Maria`, provocando la caída inmediata del backend (`Cannot find module`).
     - Ausencia de import de `Instructor` en `asistenciaController.js`, disparando error de `Schema hasn't been registered for model "Instructor"`.
     - `excusaController.js`, `downloadSqlite`, `syncAllSqlite` y `sincronizarSqlitePorDocente` seguían atados al modelo obsoleto `Asistencia`.
     - Existían 26 registros históricos en MongoDB Atlas que hubieran desaparecido sin un script de migración seguro.
     - En `PanelInstructor.vue` se mostraba "Prof. Instructor" por usar `usuario.nombre` en lugar del nombre real del instructor.
- **Causa Raíz:**
  - Migración arquitectónica parcial en la rama `Maria` que dejó endpoints externos, modelos relacionados (`SofiaPlusSync`), crons y controladores satélite sin actualizar a `Inasistencia`.
  - Eliminación no intencional de archivos durante el commit `4cafc75`.
- **Solución Aplicada:**
  1. *Restauración y Reparación del Backend:*
     - Se restauró `backend/controllers/diaFestivoController.js` desde `main`.
     - Se importó `Instructor` en `backend/controllers/asistenciaController.js` para habilitar el populate sin fallas de esquema.
     - Se implementó la función consolidada `obtenerTodasAsistenciasConsolidadas()` para poblar los archivos `.sqlite` tanto globalmente como por cada docente.
  2. *Contrato del RPA Sofía Plus (Pasos 6d-6 y 6d-7):*
     - `getInasistenciasParaRPA` y `getTodosInasistenciasParaRPA`: Consultan `Inasistencia.find({ tipo: { $in: ['Falta', 'Tardanza', 'Excusada'] }, estadoCarga: 'LISTO_PARA_SUBIR' })` y mapean exactamente la estructura requerida: `asistenciaId = String(ina._id)`, `estado = ina.tipo`, `horas = ina.horas`, `justificacion`.
     - `confirmarSubidaSofia`: Realiza `Inasistencia.findOneAndUpdate(query, { $set: { estadoCarga: 'SUBIDA', fechaSubidaSofia: new Date() } }, { new: true })` y actualiza `SofiaPlusSync`. Completamente idempotente ante dobles envíos.
     - [SofiaPlusSync.js](file:///c:/Users/JuanC/OneDrive/Desktop/SENA/PROYECTO_FINAL_LECTOR/HuelleroActualizado/backend/models/SofiaPlusSync.js): Migrado el campo principal a `inasistenciaId` (ref `'Inasistencia'`, unique) manteniendo compatibilidad con `asistenciaId`.
     - `revisarYEncolarSofiaPlus`: Actualizado para encolar inasistencias en `LISTO_PARA_SUBIR` por `inasistenciaId` sin duplicar.
  3. *Módulo de Excusas y Consistencia:*
     - En `aprobarExcusa` ([excusaController.js](file:///c:/Users/JuanC/OneDrive/Desktop/SENA/PROYECTO_FINAL_LECTOR/HuelleroActualizado/backend/controllers/excusaController.js)), se crea/actualiza `Inasistencia` con `tipo = 'Excusada'`, `horas = tope` y `estadoCarga = 'LISTO_PARA_SUBIR'`, reflejándose de inmediato en la asistencia del aprendiz y en el robot RPA.
  4. *Migración de Datos Históricos en MongoDB Atlas:*
     - Creación y ejecución de [migrar-asistencias-a-inasistencias.js](file:///c:/Users/JuanC/OneDrive/Desktop/SENA/PROYECTO_FINAL_LECTOR/HuelleroActualizado/backend/scripts/migrar-asistencias-a-inasistencias.js): Migró exitosamente los 26 registros existentes en Atlas (21 aprendices presentes a la colección `jornadas` y 5 novedades a `inasistencias`).
  5. *Ajuste en Frontend:*
     - Se corrigió la interpolación del docente en [PanelInstructor.vue](file:///c:/Users/JuanC/OneDrive/Desktop/SENA/PROYECTO_FINAL_LECTOR/HuelleroActualizado/frontend/src/views/PanelInstructor.vue) soportando `usuario.nombre` y `usuario.nombres` + `usuario.apellidos`.
- **Archivos Modificados:**
  - `backend/controllers/asistenciaController.js`
  - `backend/controllers/diaFestivoController.js` (Restaurado)
  - `backend/controllers/excusaController.js`
  - `backend/controllers/instructorController.js`
  - `backend/controllers/rpaController.test.js` (Nuevo)
  - `backend/models/SofiaPlusSync.js`
  - `backend/scripts/migrar-asistencias-a-inasistencias.js` (Nuevo)
  - `backend/services/cronService.js`
  - `frontend/src/views/PanelInstructor.vue`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Suite de 50 pruebas unitarias con `node --test` pasando al 100% (incluyendo 5 pruebas específicas de mocks para RPA).
  - Verificación de consulta real a MongoDB Atlas: `getAsistencias` devuelve exactamente los 26 registros migrados sin errores.
  - Verificación de sintaxis `node --check` en todos los archivos del backend.
  - Compilación de producción con Vite `npm run build:prod` completada en 2.05 s y sincronizada a `backend/public/`.

---

## [2026-10-22 09:42] Despliegue de Programas Mediante Select y Restricción Estricta de Gestión de Catálogo al Administrador

- **Fecha y Hora:** 2026-10-22 09:42:00 -05:00
- **Descripción del Problema / Requerimiento:**
  1. *Despliegue Controlado con `<select>`:* El usuario requirió que la selección del programa en las fichas no fuera un campo de texto libre ni un datalist permisivo, sino un selector desplegable (`<select>`) cerrado que despliegue la lista de programas oficiales activos.
  2. *Control de Acceso Basado en Roles (RBAC):* Restringir de forma exclusiva al Administrador la capacidad de adjuntar nuevos programas o modificarlos a futuro. Los demás usuarios (como instructores) solo pueden elegir de la lista desplegada y no pueden alterar el catálogo.
- **Causa Raíz:**
  - El formulario de fichas contaba con un `<input type="text" list="programas-datalist">` que aún permitía al usuario escribir nombres arbitrarios fuera de la lista.
  - Las rutas `POST`, `PUT` y `DELETE` de `/api/programas` carecían del middleware de autorización `verificarRol(['Administrador'])`, y la interfaz no ocultaba las acciones de gestión a usuarios sin privilegios administrativos.
- **Solución Aplicada:**
  1. *Protección en Backend (`backend/routes/programas.js`):*
     - `GET /api/programas` mantiene acceso de lectura (`autenticarOpcional`) para poblar el `<select>` en cualquier contexto autenticado o de quiosco.
     - `POST /api/programas`, `PUT /api/programas/:id` y `DELETE /api/programas/:id` fueron blindados con `autenticarJWT` y `verificarRol(['Administrador'])`.
  2. *Desplegable `<select>` en Fichas (`frontend/src/views/Fichas.vue` y `fichas.css`):*
     - Reemplazo completo del input/datalist por `<select v-model="fichaForm.nombrePrograma" class="fichas-select-programa" required>`.
     - Despliega todos los programas activos (`programasActivos`) formateados como: `[Nombre] ([Sigla]) — [Nivel]` (ej. *Análisis y Desarrollo de Software (ADSO) — Tecnólogo*).
     - Incorpora automáticamente una opción de fallback para nombres históricos en caso de editar fichas antiguas asociadas a programas inactivos.
     - Estilos CSS dedicados en `.fichas-select-programa` con bordes suaves, accesibilidad y foco en verde SENA (#39a900).
  3. *Restricción de Interfaz y Guardas de Seguridad:*
     - Cálculo reactivo `esAdmin` vinculado a `useAuth` y almacenamiento de sesión/local.
     - Botón "Gestionar Programas" de la cabecera protegido con `v-if="esAdmin"`.
     - Botón "+ Adjuntar Programa" dentro del formulario protegido con `v-if="esAdmin"`.
     - Guardas lógicas en todas las funciones del catálogo (`abrirGestionProgramas`, `abrirCrearPrograma`, `abrirCrearProgramaRapido`, `abrirEditarPrograma`, `guardarPrograma`, `cambiarEstadoPrograma`, `eliminarPrograma`) para rechazar llamadas si el usuario no tiene rol Administrador.
     - Textos de ayuda contextuales que informan al usuario no administrador que solo el Administrador puede adjuntar o editar programas.
- **Archivos Modificados:**
  - `backend/routes/programas.js`
  - `frontend/src/views/Fichas.vue`
  - `frontend/src/styles/fichas.css`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Verificación de tipos y lógica de autorización de roles.
  - Compilación de producción con `npm run build:prod` completada sin errores y sincronizada a `backend/public/`.

---

## [2026-10-22 09:35] Estandarización y Catálogo Dinámico de Programas de Formación (Eliminación de Disparidades en Fichas)

- **Fecha y Hora:** 2026-10-22 09:35:00 -05:00
- **Descripción del Problema / Requerimiento:**
  1. *Disparidades en Nombres de Fichas:* Existían disparidades ortográficas y de conectores en los programas de las fichas (ej. la ficha 3139319 tenía `"Analisis Y Desarrollo Del Software"` sin tilde y con "Del", mientras que la 3598464 tenía `"Análisis Y Desarrollo De Software"` con tilde y con "De", y la 3589565 tenía `"Iitic"`).
  2. *Falta de Catálogo Centralizado:* El campo `nombrePrograma` era texto libre en los formularios y en la importación de Excel, sin una lista oficial donde el administrador pudiera adjuntar o modificar programas a futuro (Cocina, Construcción, ADSO, IITIC, etc.).
  3. *Requerimiento:* Estandarizar todos los nombres de programas para que no existan discrepancias con/sin tildes, permitir adjuntar nuevos programas o modificarlos en cualquier momento, y sincronizar automáticamente las fichas existentes.
- **Causa Raíz:**
  - Ausencia de un modelo/colección de `Programa` en backend.
  - La función anterior `capitalizarTexto` únicamente ponía mayúsculas iniciales a las palabras pero no podía agregar tildes omitidas ni corregir conectores ("del" vs "de") ni expandir siglas ("iitic").
- **Solución Aplicada:**
  1. *Modelo y API de Programas:*
     - Creación de `backend/models/Programa.js` (`nombre`, `codigo`, `sigla`, `nivel`, `alias`, `estado`, `descripcion`).
     - Creación de controlador `backend/controllers/programaController.js` y rutas `backend/routes/programas.js` montadas en `/api/programas`.
     - *Sincronización en cascada:* Al editar o corregir el nombre de un programa en el catálogo, el backend actualiza automáticamente todas las fichas vinculadas en MongoDB (`Ficha.updateMany`).
     - Protección de integridad: no se permite eliminar un programa si tiene fichas asociadas (debe inactivarse).
  2. *Algoritmo de Normalización Canónica (`normalizarNombrePrograma`):*
     - Implementado en `backend/utils/textUtils.js` y `frontend/src/utils/textos.js`.
     - Reconoce variantes mediante `quitarAcentos`: `"ANALISIS Y DESARROLLO DE SOFTWARE"`, `"adso"`, `"analisis y desarrollo del software"` -> `"Análisis y Desarrollo de Software"`.
     - `"cocina"`, `"gastronomia"` -> `"Cocina"`.
     - `"construccion"`, `"construccion de edificaciones"` -> `"Construcción"`.
     - `"iitic"`, `"infraestructura de ti"` -> `"Infraestructura de TI y Comunicaciones (IITIC)"`.
  3. *Gestión Frontend en `Fichas.vue` y `ImportarUsuarios.vue`:*
     - Botón `Gestionar Programas` en el listado de fichas con modal completo para administrar el catálogo (con buscador, edición, alta y cambio de estado).
     - Campo de programa en formulario de fichas con autocompletado oficial (`<datalist>`) y enlace directo `+ Nuevo Programa` para registrar un programa nuevo sin salir de la ficha.
     - Normalización automática en blur, creación manual e importación masiva por Excel.
  4. *Migración y Sembrado en Base de Datos (`seed-programas.js`):*
     - Creación de los 4 programas canónicos en Atlas.
     - Migración exitosa de las 3 fichas existentes (3139319, 3598464 y 3589565) a sus denominaciones uniformes.
- **Archivos Modificados:**
  - `backend/controllers/fichaController.js`
  - `backend/controllers/programaController.js` (Nuevo)
  - `backend/index.js`
  - `backend/models/Ficha.js`
  - `backend/models/Programa.js` (Nuevo)
  - `backend/routes/programas.js` (Nuevo)
  - `backend/scripts/seed-programas.js` (Nuevo)
  - `backend/utils/textUtils.js`
  - `frontend/src/services/index.js`
  - `frontend/src/styles/fichas.css`
  - `frontend/src/utils/textos.js`
  - `frontend/src/views/Fichas.vue`
  - `frontend/src/views/ImportarUsuarios.vue`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Ejecución de `seed-programas.js` y comprobación en MongoDB Atlas: 3 fichas normalizadas, 4 programas creados.
  - Ejecución de suite de pruebas de normalización con 10 variantes de texto (todas resueltas exitosamente).
  - Compilación de producción `npm run build:prod` completada en 935 ms (0 errores) y desplegada a `backend/public/`.

---

## [2026-10-22 09:20] Reubicación Superior de Docente Responsable en Toma de Asistencia y Reportes (Eliminación de Redundancia por Jornada)

- **Fecha y Hora:** 2026-10-22 09:20:00 -05:00
- **Descripción del Problema / Requerimiento:**
  1. *Repetición Redundante de Docente en Filas:* En la toma de lista diaria de `PanelInstructor.vue`, cada aprendiz renderizaba un badge individual con el nombre del docente que creó la lista cuando estaba en modo solo lectura, repitiendo el mismo nombre entre 30 y 40 veces en pantalla.
  2. *Saturación de Celdas en Reportes:* En `Reportes.vue`, la columna "Inasistencias por Fecha y Docente" imprimía `👨‍🏫 Prof. [Nombre]:` en cada fecha de inasistencia de cada aprendiz, sobrecargando la tabla con información redundante cuando en el SENA habitualmente un solo docente lidera toda la jornada formativa de un día.
  3. *Requerimiento del Usuario:* Concentrar la lectura del docente responsable en la parte superior (banner / cabecera) para informar de manera clara quién dictó la jornada y si está en solo lectura, dejando las tablas y celdas limpias y legibles.
- **Causa Raíz:**
  - Falta de un banner resumen a nivel de sesión/jornada en la cabecera de la tabla de toma de lista.
  - Sobrecarga de texto en las celdas de inasistencias de reportes al no separar el contexto global del docente del detalle puntual de fechas y horas de cada aprendiz.
- **Solución Aplicada:**
  1. *Panel del Instructor (`PanelInstructor.vue` y `panelInstructor.css`):*
     - Se crearon las propiedades computadas `docenteResponsableDia` y `jornadaEsDeOtroDocente` para determinar con precisión qué instructor dictó la clase de la fecha seleccionada.
     - Se diseñó el componente superior `.docente-jornada-banner` que informa con jerarquía visual:
       - Si es de otro docente: `Docente a cargo de la jornada: Prof. [Nombre] — 🔒 Modo solo lectura (No modificable)`.
       - Si es del docente actual: `Docente a cargo de la jornada: Prof. [Nombre] — (Tú registraste esta jornada)`.
       - Si es nueva: `Docente en turno para registrar: Prof. [Nombre] — (Pendiente por registrar)`.
     - Se eliminó el badge repetitivo de cada fila `<tr>` y de las tarjetas móviles, manteniendo el bloqueo seguro de checkboxes y campos numéricos con cursor disabled.
  2. *Módulo de Reportes (`Reportes.vue`):*
     - Se agregó el bloque `.reporte-docentes-superior` antes de la tabla de aprendices, listando los instructores que tuvieron a cargo sesiones durante el periodo y la cantidad de jornadas dictadas.
     - Se actualizó el encabezado de la tabla a `Inasistencias por Fecha` y se optimizaron los chips a `Fecha (Horas) — Tipo / Motivo` con tooltip explicativo `:title="Sesión a cargo de: Prof. [Nombre]"`.
- **Archivos Modificados:**
  - `frontend/src/views/PanelInstructor.vue`
  - `frontend/src/views/Reportes.vue`
  - `frontend/src/styles/panelInstructor.css`
  - `backend/public/` (Sincronizado vía `npm run build:prod`)
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Compilación exitosa en Vite (`npm run build:prod`, 0 errores).
  - Trazabilidad y validación visual de no regresión en exportaciones CSV y PDF.

---

## [2026-10-22 09:08] Normalización Integral de Datos (Jornada, Documentos, Textos) y Expansión de Tipos de Documento (TI, PA, CD, etc.)

- **Fecha y Hora:** 2026-10-22 09:08:00 -05:00
- **Descripción del Problema / Bug:**
  1. *Tipos de Documento Limitados:* El sistema únicamente admitía `CC`, `CE` y `PEP` en los esquemas Mongoose y selectores de formularios, rechazando tarjetas de identidad (`TI`), pasaportes (`PA`), carnés diplomáticos (`CD`), permisos de protección temporal (`PPT`), registros civiles (`RC`) y salvoconductos (`SC`), los cuales son esenciales para aprendices menores de edad y extranjeros en el SENA.
  2. *Inconsistencias en Jornadas:* El ingreso manual o por Excel de valores como `diurna`, `nocturna`, `vespertina`, `mañana` (en minúsculas) generaba fallas de validación (`Jornada inválida`) o desajustes entre la jornada de la ficha y la del aprendiz.
  3. *Datos Sin Limpiar:* Números de documento con puntos (`1.023.456.789`) o espacios causaban fallos en búsquedas y duplicados aparentes; correos electrónicos ingresados con mayúsculas generaban rechazos en login.
- **Causa Raíz:**
  1. Enums rígidos en `Estudiante.js` e `Instructor.js` restringidos a `['CC', 'CE', 'PEP']`, y filtros de validación en `ImportarUsuarios.vue` y `Estudiantes.vue` sin soporte para `TI`, `PA`, `CD`, `PPT`, `RC`, `SC`.
  2. Ausencia de funciones de normalización de jornadas (`normalizarJornada`) que convirtieran sinónimos y variaciones al estándar institucional (`Mañana`, `Tarde`, `Noche`, `Mixta`).
  3. Falta de sanitización automática de números de documento (`normalizarNumeroDocumento`), títulos de programa, aulas y especialidades.
- **Solución Aplicada:**
  1. *Expansión y Normalización de Tipos de Documento:*
     - Definición de catálogo oficial `TIPOS_DOCUMENTO_CODIGOS` (`CC`, `TI`, `CE`, `PA`, `PEP`, `PPT`, `CD`, `RC`, `SC`) y función `normalizarTipoDocumento` con resolución de alias comunes (ej. `PASAPORTE` -> `PA`, `TARJETA DE IDENTIDAD` -> `TI`, `DIPLOMATICO` -> `CD`).
     - Actualización de los esquemas Mongoose en `Estudiante.js` e `Instructor.js` para admitir todos los tipos de documento.
     - Actualización de los desplegables de selección manual en `Estudiantes.vue` e `Instructores.vue` con nombres legibles y códigos oficiales.
     - Habilitación de todos los tipos de documento en la validación y mapeo de `ImportarUsuarios.vue`.
  2. *Normalización Universal de Jornadas y Variables:*
     - Función `normalizarJornada` que mapea variantes (`diurna`, `matutina`, `mañana`, `vespertina`, `tarde`, `nocturna`, `noche`, `mixta`) a los valores estándar de ficha.
     - Función `normalizarNumeroDocumento` que remueve puntos, guiones y espacios en blanco.
     - Hooks automáticos en Mongoose (`pre('validate')` y `pre('findOneAndUpdate')`) en `Estudiante.js`, `Instructor.js` y `Ficha.js` para limpiar y formatear `nombres`, `apellidos`, `tipoDocumento`, `numeroDocumento`, `correo`, `telefono`, `genero`, `especialidad`, `nombrePrograma`, `jornada` y `aulaAsignada`.
     - Ejecución de script de base de datos (`normalizar-nombres.js`) actualizando aprendices, docentes y fichas existentes en MongoDB Atlas.
- **Archivos Modificados:**
  - `backend/controllers/estudianteController.js`
  - `backend/controllers/fichaController.js`
  - `backend/controllers/instructorController.js`
  - `backend/models/Estudiante.js`
  - `backend/models/Ficha.js`
  - `backend/models/Instructor.js`
  - `backend/scripts/normalizar-nombres.js`
  - `backend/utils/textUtils.js`
  - `frontend/src/utils/textos.js`
  - `frontend/src/views/Estudiantes.vue`
  - `frontend/src/views/Fichas.vue`
  - `frontend/src/views/ImportarUsuarios.vue`
  - `frontend/src/views/Instructores.vue`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Ejecución de `normalizar-nombres.js` contra MongoDB Atlas normalizando las colecciones con éxito (0 fallos).
  - Compilación de producción con `npm run build:prod` completada en 800 ms sin errores y sincronizada a `backend/public/`.

---
## [2026-10-22 08:55] Estandarización Capitalize, Excel Multijornada, Solo Lectura entre Docentes y Reportes Críticos Multi-Docente

- **Fecha y Hora:** 2026-10-22 08:55:00 -05:00
- **Descripción del Problema / Bug:**
  1. *Excel Instructores:* La plantilla y validación de importación masiva exigían obligatoriamente la columna `Jornada` para docentes, cuando en el SENA los instructores imparten formación indistintamente en cualquier jornada (Mañana, Tarde o Noche) según las fichas asignadas.
  2. *Inconsistencia de Nombres:* Los nombres y apellidos de aprendices e instructores presentaban desorden tipográfico (mayúsculas sostenidas, minúsculas o mezclas) tanto al registrarse manualmente en formularios como al cargarse vía archivos Excel.
  3. *Historial de Ficha y Permisos entre Docentes:* Al navegar por la barra de fechas o el historial de una ficha, podían visualizarse registros huérfanos o de otras fichas, y un docente podía modificar o sobreescribir las inasistencias marcadas por otro instructor que comparte la misma ficha.
  4. *Reportes Restringidos:* La pantalla de Reportes (`Reportes.vue`) limitaba el selector únicamente a fichas donde el docente fuera líder, impidiendo a los docentes de apoyo consultar reportes, y carecía de las alertas de seguimiento crítico (3+ faltas consecutivas y 5+ acumuladas).
- **Causa Raíz:**
  1. `HEADERS_INSTRUCTORES` en `ImportarUsuarios.vue` obligaba la presencia de `Jornada`, a pesar de que el modelo `Instructor` no almacena jornada fija (la jornada reside en la Ficha).
  2. Ausencia de sanitización y hooks de estandarización en Title Case (`capitalizarTexto`) en los modelos Mongoose y en los formularios frontend de carga y edición.
  3. `PanelInstructor.vue` no filtraba con igualdad estricta por `fichaId` en `asistenciasFicha` ni validaba la autoría de `instructorId`, permitiendo edición cruzada sin restricciones. El backend no rechazaba la modificación por parte de un docente par.
  4. `Reportes.vue` utilizaba la propiedad computada `fichasLideradas`, excluía a los docentes de apoyo, realizaba comparaciones estrictas por referencia de objetos de ficha en lugar de identificadores normalizados, y no calculaba los indicadores de inasistencias graves de `inasistencias.js`.
- **Solución Aplicada:**
  1. *Importación Multijornada:* Se eliminó `Jornada` de las cabeceras requeridas en `HEADERS_INSTRUCTORES` en `ImportarUsuarios.vue` y en `descargarPlantilla()`, permitiendo que el docente sea asignado libremente a fichas de cualquier jornada.
  2. *Estandarización Title Case (Capitalize):*
     - Creación de utilidad `capitalizarTexto` en backend (`backend/utils/textUtils.js`) y frontend (`frontend/src/utils/textos.js`) con soporte de caracteres en español y acentos.
     - Adición de hooks Mongoose `pre('validate')` y `pre('findOneAndUpdate')` en `Estudiante.js` e `Instructor.js` para capitalizar nombres/apellidos y pasar correos a minúsculas limpias.
     - Aplicación de `capitalizarTexto` en `Estudiantes.vue` y en `ImportarUsuarios.vue`.
     - Ejecución de script de migración en la base de datos MongoDB Atlas (`backend/scripts/normalizar-nombres.js`), actualizando 43 aprendices y 3 docentes a formato oficial Title Case.
  3. *Aislamiento Estricto y Solo Lectura entre Docentes:*
     - En `PanelInstructor.vue`, filtrado estricto en `cargarDatosFicha` por `fichaId` y validación de coincidencia de ficha en eventos de socket `ATTENDANCE_REGISTERED`.
     - Lógica de propiedad `esMio` en `inicializarAsistenciaDia`: si la asistencia de esa jornada fue tomada por otro instructor y el usuario no es Administrador, los checkboxes, botones de falla/excusa y campo de horas se deshabilitan (`disabled`), mostrando el indicador `🔒 Prof. [Nombre Docente]`.
     - Inclusión de la columna "Docente" en la tabla de historial y en el reporte exportable.
     - En `backend/controllers/asistenciaController.js` (`createAsistencia`), protección contra sobreescritura con respuesta HTTP 403 Forbidden cuando un docente intenta modificar registros de otro docente.
  4. *Reportes para Todos los Docentes y Seguimiento Crítico:*
     - Sustitución de `fichasLideradas` por `fichasDisponibles` en `Reportes.vue`, otorgando acceso a instructores líderes y de apoyo.
     - Normalización de comparaciones de `fichaId` mediante `String(id?._id || id)`.
     - Integración de `analizarInasistenciasGraves`: cálculo de racha máxima consecutiva y faltas acumuladas, StatCards de alerta en el resumen, filtros de "Crítico (3+ consecutivos)" y "Alerta (5+ acumuladas)" en la interfaz, distintivos de riesgo de deserción en la tabla de aprendices, y métricas de criticidad en las exportaciones a PDF y CSV/Excel.
- **Archivos Modificados:**
  - `backend/controllers/asistenciaController.js`
  - `backend/controllers/estudianteController.js`
  - `backend/models/Estudiante.js`
  - `backend/models/Instructor.js`
  - `backend/scripts/normalizar-nombres.js`
  - `backend/utils/textUtils.js`
  - `frontend/src/utils/textos.js`
  - `frontend/src/views/Estudiantes.vue`
  - `frontend/src/views/ImportarUsuarios.vue`
  - `frontend/src/views/PanelInstructor.vue`
  - `frontend/src/views/Reportes.vue`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Ejecución de script de migración `normalizar-nombres.js` contra MongoDB Atlas completada exitosamente.
  - Compilación de producción con `npm run build:prod` completada en 1.89s sin errores.

---
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

---

## [2026-10-13 19:58] Retrocompatibilidad de Enrolamiento para Aplicación de Escritorio Instalada

- **Fecha y Hora:** 2026-10-13 19:58:00 -05:00
- **Descripción del Problema / Bug:**
  - La aplicación de escritorio instalada en el sistema operativo (`C:\Program Files\Asista\Asista.exe`, compilada previamente) continuaba arrojando el error `Acceso no autorizado. Se requiere token JWT de sesión o credenciales de dispositivo biométrico registrado.` al enrolar huellas.
- **Causa Raíz:**
  - La aplicación instalada fue empaquetada con anterioridad y su código ejecutable en `app.asar` invoca `guardarTemplate` sin cabeceras de autorización (`Authorization` ni `x-device-token`).
  - Al recibir la petición en Render, la validación estricta bloqueaba el guardado de la plantilla.
- **Solución Aplicada:**
  - En `backend/controllers/enrolamientoController.js`, se añadió una comprobación de compatibilidad que autoriza las solicitudes generadas directamente desde clientes de escritorio (proceso principal de Electron/Node sin cabecera `origin` externa de navegador), manteniendo la validación estricta de existencia y consistencia de `estudianteId` y `fichaId`.
- **Archivos Modificados:**
  - `backend/controllers/enrolamientoController.js`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Validación de sintaxis con `node -c backend/controllers/enrolamientoController.js` (salida exitosa código 0).

---

## [2026-10-13 22:00] Optimización de Rendimiento y Prevención de Congelamientos en Equipos Secundarios

- **Fecha y Hora:** 2026-10-13 22:00:00 -05:00
- **Descripción del Problema / Bug:**
  - Al ejecutar la aplicación de escritorio (`Asista` / `huellero`) en otro computador, se observan congelamientos de la interfaz gráfica, falta de respuesta ante interacción del usuario y alto consumo de CPU.
- **Causa Raíz:**
  1. **Aceleración por Hardware en Electron:** En computadores secundarios con gráficos integrados (Intel HD Graphics) o controladores gráficos genéricos, el proceso GPU de Chromium entra en bloqueo o pérdida de contexto D3D11, provocando que la ventana entre en estado "(No responde)".
  2. **Bucle de Espera Activa (CPU Spin-Lock) en `store.js`:** La función interna `esperarSync` ejecutaba un bucle `while (Date.now() < fin) {}` bloqueante al 100% de CPU cada vez que ocurría un fallo transitorio de archivo ocupado (`EBUSY`/`EPERM`) en Windows.
  3. **Llamadas síncronas sin timeout a `reg.exe` en `hardware-fingerprint.js`:** `execFileSync` consultaba repetidamente el registro de Windows sin timeout, bloqueando el hilo principal si las políticas o el antivirus del nuevo equipo demoraban la respuesta.
  4. **Reintentos inmediatos en bucle cerrado de enrolamiento:** Ante un fallo de lectura del sensor USB, el bucle reintentaba inmediatamente sin descanso al controlador USB.
- **Solución Aplicada:**
  - Se añadió `app.disableHardwareAcceleration()` en `huellero/src/main/index.js` antes de iniciar la ventana.
  - Se eliminó el spin-lock `esperarSync` en `huellero/src/main/store.js`, simplificando la escritura segura sin bloqueo de CPU.
  - Se cacheó el `MachineGuid` en memoria y se configuró un `timeout: 2000` en `huellero/src/main/hardware-fingerprint.js`.
  - Se integró una pausa no bloqueante de 300ms (`await esperar(300)`) entre reintentos fallidos de captura en `huellero/src/main/engine.js`.
  - Se recompiló el bundle de producción de `huellero` con `npm run build` (`electron-vite build`).
- **Archivos Modificados:**
  - `huellero/src/main/index.js`
  - `huellero/src/main/store.js`
  - `huellero/src/main/hardware-fingerprint.js`
  - `huellero/src/main/engine.js`
  - `huellero/out/main/index.js`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Compilación exitosa de `huellero` con `electron-vite build` (0 errores).
  - Verificación de sintaxis de los archivos modificados con `node -c`.

---

## [2026-10-13 22:25] Resiliencia ante Cold Start de Render y Empaquetado de Instalador Asista.exe

- **Fecha y Hora:** 2026-10-13 22:25:00 -05:00
- **Descripción del Problema / Bug:**
  - Al enrolar huellas en la aplicación de escritorio instalada en otro computador, las huellas no se guardaban en el backend arrojando errores de conexión ("Sin conexión: no se pudo guardar la huella").
  - Además, tras enrolar exitosamente a un aprendiz, el quiosco de asistencia no lo reconocía localmente.
- **Causa Raíz:**
  1. **Timeout prematuro durante arranque en frío de Render:** En el plan gratuito, Render apaga el servicio tras inactividad. Al guardar la huella, el timeout de 15 segundos expiraba antes de que Render terminara de despertar (tarda de 25 a 50 segundos), arrojando falso error de conexión sin reintento.
  2. **Caché desactualizada de plantillas biométricas locales:** Tras guardar en MongoDB, `engine.js` no refrescaba `descargarPlantillas()`, dejando la memoria local con las plantillas anteriores al enrolamiento.
  3. **Instalador desactualizado en el equipo secundario:** El instalador `.exe` que se había copiado al otro computador fue generado el 2 de octubre, previo a la retrocompatibilidad de tokens y cabeceras de autorización de escritorio.
- **Solución Aplicada:**
  - En `huellero/src/main/engine.js`: Se implementó reintento automático con backoff de 3 segundos y timeouts ampliados (25s y 35s) en `guardarTemplate()`.
  - Se añadió la recarga inmediata de plantillas locales (`descargarPlantillas(fichaId)`) tras un enrolamiento exitoso.
  - En `backend/controllers/enrolamientoController.js`: Se amplió la detección de clientes de escritorio (`origin.startsWith('file:') || /localhost|127\.0\.0\.1/i.test(origin) || /electron|node|undici|asista|huellero/i.test(userAgent)`).
  - Se recompiló y empaquetó el nuevo instalador de producción en `huellero/release-app/Asista-Setup-1.0.0.exe` con `electron-builder`.
- **Archivos Modificados:**
  - `backend/controllers/enrolamientoController.js`
  - `huellero/src/main/engine.js`
  - `huellero/release-app/Asista-Setup-1.0.0.exe`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Empaquetado exitoso del instalador NSIS `Asista-Setup-1.0.0.exe` (144.9 MB) con `electron-builder` (código de salida 0).
  - Prueba de conectividad HTTP al endpoint `/api/enrolamiento/guardar` simulando cliente de escritorio (código 404 esperado para estudiante de prueba, validación de autorización superada).

---

## [2026-10-14 21:45] Persistencia de Borradores con Pinia y Bloqueo de Inasistencias Subidas a Sofia Plus

- **Fecha y Hora:** 2026-10-14 21:45:00 -05:00
- **Descripción del Problema / Requerimiento:**
  1. Si un docente estaba registrando asistencias/fallas en el panel web y se caía el internet o recargaba accidentalmente la página (`F5`), se perdían todos los cambios no guardados.
  2. Al sincronizar inasistencias los sábados con Sofia Plus vía RPA, se requería garantizar que los aprendices ya reportados con éxito queden bloqueados en el panel para evitar ediciones extemporáneas y duplicaciones de fallas en el SENA, dejando en cola únicamente a los pendientes o fallidos para el siguiente sábado.
- **Causa Raíz:**
  1. El estado `asistenciaDia` vivía exclusivamente en la memoria RAM del componente Vue (`ref({})`) sin persistencia reactiva en almacenamiento local ni cola offline.
  2. El modelo `Asistencia` carecía de los atributos `subidoSofia` y `fechaSubidaSofia`, y los endpoints de inasistencias para RPA no discriminaban registros ya reportados.
- **Solución Aplicada:**
  1. **Persistencia Frontend (Pinia + LocalStorage):** Se instaló e integró `pinia` en `frontend/src/main.js`. Se creó el store `frontend/src/stores/asistenciaDraft.js` para auto-guardar cada cambio en tiempo real (`draft_asistencia_${fichaId}_${fecha}`) y auto-restaurarlo ante recargas de página.
  2. **Tolerancia a Caídas de Red (Cola Offline):** Si el servidor no responde al guardar, las asistencias se encolan localmente y se sincronizan automáticamente al recuperar la conexión mediante el listener `window.addEventListener('online')`.
  3. **Modelo de Asistencia y Candado Sofia Plus:** Se añadieron los campos `subidoSofia: Boolean` y `fechaSubidaSofia: Date` a `backend/models/Asistencia.js`.
  4. **Filtrado en RPA y Cron:** Se actualizaron `getInasistenciasParaRPA`, `getTodosInasistenciasParaRPA` y `revisarYEncolarSofiaPlus` en el cron semanal para excluir `{ subidoSofia: { $ne: true } }`.
  5. **Endpoint de Confirmación y Bot:** Se implementó `POST /api/instructores/confirmar-subida-sofia` y se conectó en `Practica_RPA/bot_inasistencias_sofia.js` para que el robot bloquee de inmediato cada registro subido.
  6. **UI/UX en Panel del Docente:** En `PanelInstructor.vue`, las filas y tarjetas táctiles de aprendices con `subidoSofia: true` muestran un badge verde con candado 🔒 *"Reportado Sofia Plus"* y deshabilitan los controles de edición.
- **Archivos Modificados:**
  - `frontend/package.json`
  - `frontend/src/main.js`
  - `frontend/src/stores/asistenciaDraft.js`
  - `frontend/src/views/PanelInstructor.vue`
  - `backend/models/Asistencia.js`
  - `backend/controllers/instructorController.js`
  - `backend/routes/instructores.js`
  - `backend/services/cronService.js`
  - `Practica_RPA/bot_inasistencias_sofia.js`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Compilación de producción de `frontend` exitosa con `vite build` en 828ms sin advertencias de compilación.
  - Validación sintáctica completa con `node -c` en todos los controladores, rutas y modelos backend y en el robot de Playwright (código de salida 0).

---

## [2026-10-14 22:08] Habilitación de Seguimiento de Inasistencias para Todos los Docentes de Aula

- **Fecha y Hora:** 2026-10-14 22:08:00 -05:00
- **Descripción del Problema / Requerimiento:**
  - En la vista de *Seguimiento de Inasistencias* (`SeguimientoInasistencias.vue`), los instructores que dictaban clases en una ficha pero no figuraban como el "Instructor Líder" no podían ver las estadísticas ni los aprendices en riesgo, mostrando la alerta: *"No tienes fichas asignadas como Líder, por lo tanto no puedes consultar el seguimiento de inasistencias"*.
  - Se requería que todos los instructores pudieran acceder al seguimiento de inasistencias de todas las fichas en las que imparten formación (tanto como líder como parte del equipo docente).
- **Causa Raíz:**
  - La propiedad computada `fichasDisponibles` filtraba estrictamente por `f.instructorLiderId === usuario.id`, excluyendo las fichas del array `f.instructores`.
  - La llamada en `onMounted` cargaba `api.fichas.getAll()` sin pasar por `api.fichas.getMisFichas(usuario.id)`.
- **Solución Aplicada:**
  - En `frontend/src/views/SeguimientoInasistencias.vue`:
    1. Se actualizó `fichasDisponibles` para incluir tanto al docente líder como a los instructores del array `f.instructores` y las fichas asociadas.
    2. Se actualizó `estudiantesFiltrados` para soportar resolución bidireccional por `ObjectId` y `codigoFicha`.
    3. En `onMounted`, se invoca `api.fichas.getMisFichas(usuario.id)` para instructores, garantizando la carga de todos sus grupos asignados.
    4. Se actualizó el mensaje de alerta y el selector de fichas para mostrar la distinción `(Líder)` y permitir consultar *"Todas mis fichas asignadas"*.
- **Archivos Modificados:**
  - `frontend/src/views/SeguimientoInasistencias.vue`
  - `TROUBLESHOOTING.md`
---

## [2026-10-15 21:12] Integración de Nuevos Logos/Iconos y Resolución de Regresión Accidental de Pinia y Sofia Lock

- **Fecha y Hora:** 2026-10-15 21:12:00 -05:00
- **Descripción del Problema / Regresión:**
  - Tras el commit `111264e` subido al repositorio remoto con el mensaje *"modificacion de logos y botones"*, se produjo una regresión accidental en el frontend que eliminó la dependencia de `pinia`, la configuración de persistencia de borrador local ante recargas/caídas de red (`asistenciaDraft`), el candado de protección para registros ya reportados a Sofia Plus (🔒) y el acceso ampliado al módulo de *Seguimiento de Inasistencias* para docentes no líderes.
- **Causa Raíz:**
  - El commit remoto se generó a partir de una versión local desactualizada de `package.json`, `main.js`, `PanelInstructor.vue` y `SeguimientoInasistencias.vue` previa al commit `7e5e6d7`, sobreescribiendo dichas funcionalidades al hacer push a `main`.
- **Solución Aplicada:**
  - Se realizó una integración selectiva para conservar todas las mejoras gráficas y de usabilidad del colaborador sin perder la resiliencia técnica:
    1. **Conservación de nuevos activos:** Se mantuvieron los 5 nuevos iconos en `frontend/src/assets/` (`equipo-docente-icon.png`, `estudiantes-menu-icon.png`, `gestionar-estudiantes-icon.png`, `historial-icon.png`, `instructores-menu-icon.png`).
    2. **Conservación de máscaras y estilos:** Se conservaron las máscaras dinámicas de menú en `DefaultLayout.vue`, las reglas CSS en `main.css` y las clases añadidas en `panelInstructor.css`.
    3. **Conservación de tipos de documento:** Se mantuvo la opción `TI` (Tarjeta de Identidad) en `Estudiantes.vue`.
    4. **Integración en Panel del Docente:** Se actualizaron los botones de sub-pestañas en `PanelInstructor.vue` para utilizar las nuevas imágenes oficiales (`iconoHistorial`, `iconoGestionarEstudiantes`, `iconoEquipoDocente`).
    5. **Restauración de Pinia:** Se reinstaló e inicializó `pinia` en `frontend/package.json` y `frontend/src/main.js`.
    6. **Restauración de Persistencia y Sofia Lock:** Se restauró la integración completa del store reactivo `asistenciaDraft`, el guardado manual/automático, la cola de reintentos offline y el bloqueo visual con candado 🔒 para aprendices ya reportados en Sofia Plus en `PanelInstructor.vue`.
    7. **Restauración de Seguimiento Docente:** Se restauró la consulta de fichas asignadas para todos los docentes de aula en `SeguimientoInasistencias.vue`.
- **Archivos Modificados:**
  - `frontend/package.json`
  - `frontend/src/main.js`
  - `frontend/src/views/PanelInstructor.vue`
  - `frontend/src/views/SeguimientoInasistencias.vue`
  - `TROUBLESHOOTING.md`
---

## [2026-10-15 21:50] Ajuste Normativo (Acuerdo 0009 de 2024), Auto-Cierre de Fallas y Corrección de Login de Aprendices

- **Fecha y Hora:** 2026-10-15 21:50:00 -05:00
- **Descripción del Problema / Requerimiento:**
  1. **Omisión de Fallas en Sofia Plus:** Si un docente no guardaba manualmente la asistencia del día en el panel web, los aprendices que no marcaron huella quedaban sin registro en MongoDB, provocando que el robot RPA del sábado no encontrara fallas para reportar.
  2. **Exclusión de Excusas en RPA:** Las consultas `getInasistenciasParaRPA` y `getTodosInasistenciasParaRPA` solo buscaban `['Falta', 'Tardanza']`, omitiendo por completo las fallas con soporte (`'Excusada'`).
  3. **Alineación con el Acuerdo No. 0009 de 2024 (Reglamento del Aprendiz):** El nuevo reglamento amplió de 3 a **5 días hábiles** el plazo legal para que el aprendiz radique soportes de inasistencias no programadas (Art. 28 Parágrafo 3 y Art. 29 Numeral 1). El cron debía respetar esta ventana antes de encolar fallas como injustificadas definitivas.
  4. **Falso error "no encontrado o inactivo" en Login de Aprendiz:** Aprendices con documento duplicado en instructores de prueba (ej. `1101261073` / María Juliana Saavedra vs Lia Saa) eran rechazados con error de contraseña de instructor en el backend y enmascarados como "inactivos" por el frontend.
- **Causa Raíz:**
  1. Inexistencia de un mecanismo de auto-cierre de asistencia para aprendices ausentes al finalizar la jornada o clase.
  2. Filtro estricto excluyente en `instructorController.js` que no incluía el estado `Excusada`.
  3. Valores heredados de 3 días hábiles en `cronService.js`.
  4. La ruta `/auth/login` validaba `Instructor` antes de `Estudiante` y requería contraseña de inmediato si el documento coincidía con un instructor, ignorando que la consulta de aprendiz no requiere contraseña.
- **Solución Aplicada:**
  1. **Auto-cierre de Inasistencias:** Se implementó `cerrarInasistenciasFicha` en `backend/services/asistenciaService.js` e integró en `claseController.js` (`finalizar`) y `cronService.js` (`cerrarClasesExpiradas`). A todo aprendiz activo que no haya registrado huella en esa fecha se le genera automáticamente su registro de `Falta`.
  2. **Inclusión de Excusas en RPA:** Se actualizó el filtro de estados en `getInasistenciasParaRPA` y `getTodosInasistenciasParaRPA` a `['Falta', 'Tardanza', 'Excusada']`.
  3. **Ajuste a 5 Días Hábiles:** Se actualizaron `sincronizarSqlitePorDocente` (umbral >= 5 días) y `revisarYEncolarSofiaPlus` (umbral >= 6 días hábiles para garantizar los 5 días hábiles completos de radicación).
  4. **Resolución de Conflicto de Login:** En `backend/controllers/authController.js`, si no se proporciona contraseña (consulta de aprendiz), el backend verifica primero si el documento corresponde a un `Estudiante` activo antes de exigir contraseña de instructor.
  5. **Mensajes Transparentes en Frontend:** En `frontend/src/views/Login.vue`, se muestra `err.message` real devuelto por el servidor.
- **Archivos Modificados:**
  - `backend/services/asistenciaService.js`
  - `backend/services/cronService.js`
  - `backend/controllers/claseController.js`
  - `backend/controllers/instructorController.js`
  - `backend/controllers/authController.js`
  - `frontend/src/views/Login.vue`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Sintaxis validada con `node -c` en todos los archivos backend modificados (código 0).
  - Prueba de login directo para `1101261073` simulada en Node: resuelve exitosamente a `MARIA JULIANA SAAVEDRA CARVAJAL` (Activo).
  - Compilación de producción con `vite build` completada en 1.42s con 0 errores.










---

## [2026-10-21 19:24] Asistencia Manual: Aprendices no marcados en Presente y Sincronización Inmediata a la Nube

- **Fecha y Hora:** 2026-10-21 19:24:00 -05:00
- **Descripción del Problema / Requerimiento:**
  1. En el modo manual del panel docente, todos los aprendices arrancaban visualmente con el badge rojo de "Falta (Automática)", forzando al docente a marcar uno a uno a los presentes en lugar de marcar únicamente a los ausentes.
  2. Los aprendices que no tenían falta debían figurar como "Presentes", y al realizar cualquier acción de marcación o al guardar la jornada, los cambios debían sincronizarse y persistir inmediatamente en la base de datos en la nube (MongoDB Atlas).
- **Causa Raíz:**
  1. La refactorización previa había inicializado el estado diario de asistencia en `'Ninguno'` asignándole badge de Falta por omisión.
  2. La función de marcación solo guardaba localmente en el almacén reactivo Pinia/localStorage (`draftStore`) y no despachaba peticiones de mutación a la API de MongoDB Atlas hasta presionar "Finalizar Jornada".
- **Solución Aplicada:**
  1. **Estado Inicial en Presente:** En `inicializarAsistenciaDia`, los aprendices sin registro previo ahora arrancan en estado `'Presente'`, con hora actual y 0 horas fallidas.
  2. **Columna "Marcar Falla":** Se restauró el checkbox de falta (`checkbox-falta`) y la función `marcarFalta(estId)`. Si la casilla está sin marcar, el aprendiz permanece como `Presente (A tiempo)`. Si se marca la casilla, pasa a `Falta` (con las horas de la jornada como horas fallidas).
  3. **Sincronización Inmediata en la Nube:** Se creó la función `sincronizarCambioNube(estId)` que despacha de inmediato un `POST /api/asistencias` a MongoDB Atlas cada vez que el docente marca/desmarca una falla, asigna una excusa o edita las horas fallidas.
  4. **Persistencia Garantizada en Guardado Masivo:** En `guardarAsistenciaDia`, todo aprendiz sin marcar en faltas queda confirmado y almacenado en la nube con estado `Presente`.
- **Archivos Modificados:**
  - `frontend/src/views/PanelInstructor.vue`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Compilación de producción con `npm run build:frontend` (Vite v8, 139 módulos transformados) completada con éxito en 1.32s sin errores.

---

## [2026-10-21 19:44] Depuración Quirúrgica de MongoDB Atlas: Preservación Estricta de Fichas 3139319, 3598464 y Administrador

- **Fecha y Hora:** 2026-10-21 19:44:00 -05:00
- **Descripción del Problema / Requerimiento:**
  Limpieza de datos residuales y de prueba en la base de datos en la nube (MongoDB Atlas) preservando estrictamente las dos fichas de producción: `3139319` y `3598464`, todos sus aprendices inscritos, sus docentes/instructores asignados, su historial operativo, y protegiendo las credenciales de administración y configuración del sistema (`admin`, `dispositivos`, `dias_festivos`).
- **Causa Raíz:**
  Existencia de 11 fichas de prueba/QA, 10 instructores no relacionados, 5 aprendices huérfanos y 64 clases de test acumuladas en el clúster.
- **Solución Aplicada:**
  1. **Generación de Backup Preventivo:** Se creó `backend/scripts/backup-colecciones.js` y se exportó un respaldo completo en JSON de todas las colecciones en `backend/data/backup_2026-10-22T00-43-13-350Z/`.
  2. **Simulación de Solo Lectura:** Se ejecutó `backend/scripts/simular-depuracion.js` confirmando con exactitud los conteos antes de cualquier mutación destructiva.
  3. **Depuración Quirúrgica Aprobada:** Se ejecutó `backend/scripts/ejecutar-depuracion.js` eliminando únicamente los registros ajenos:
     - 11 fichas ajenas eliminadas.
     - 10 instructores ajenos eliminados.
     - 5 aprendices ajenos/huérfanos eliminados.
     - 64 clases de prueba eliminadas.
     - 2 excusas ajenas eliminadas.
     - 13 permisos de datos huérfanos eliminados.
  4. **Preservación Confirmada:**
     - 2 Fichas: `3139319` (25 aprendices) y `3598464` (19 aprendices).
     - 44 Aprendices intactos.
     - 5 Instructores asignados intactos (Lia Saa, Ivan Figueroa, Silvia Alejandra Lopez, Alexander Guevara, Miguel Ángel Dulcey Díaz).
     - Cuenta de Administrador (`senahuellero@gmail.com`) 100% protegida e intacta.
     - Dispositivos biométricos (6) y días festivos (23) 100% protegidos e intactos.
- **Archivos Modificados:**
  - `backend/scripts/simular-depuracion.js`
  - `backend/scripts/backup-colecciones.js`
  - `backend/scripts/ejecutar-depuracion.js`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Conteo final de MongoDB Atlas tras ejecución verificado: 2 fichas, 44 aprendices, 5 instructores, 1 admin, 1 asistencia, 10 clases, 37 permisos, 6 dispositivos, 23 festivos. Cero pérdida de datos de las fichas objetivo.

---

## [2026-10-21 21:12] Sincronización Multi-Equipo: Difusión WebSockets en Guardado Manual y Corrección de Borradores/Populate

- **Fecha y Hora:** 2026-10-21 21:12:00 -05:00
- **Descripción del Problema / Requerimiento:**
  Al ingresar con un perfil docente desde otro computador tras tomar o editar la lista, los cambios de asistencia no se visualizaban o parecían no haberse actualizado.
- **Causa Raíz:**
  1. **Falta de Evento WebSocket en `createAsistencia`:** El endpoint `POST /api/asistencias` (usado por la sincronización manual individual y por lotes) persistía en MongoDB pero no emitía el evento de socket `emitirAsistenciaRegistrada`, impidiendo que otros navegadores abiertos en la misma ficha recibieran las mutaciones en vivo sin recargar.
  2. **Colisión de Borrador Local Obsoleto en `PanelInstructor`:** Si el segundo computador había abierto previamente la ficha, existía un borrador en `localStorage` con estados anteriores. Al recargar la página, `inicializarAsistenciaDia` restauraba ciegamente el borrador local sobreescribiendo los datos frescos descargados de MongoDB Atlas.
  3. **Incompatibilidad de Comparación por Objeto Populado:** En `Dashboard.vue` y `Reportes.vue`, los registros de asistencia venían con `estudianteId` poblado como objeto (`{ _id, nombres... }`). Las consultas evaluaban `a.estudianteId === est._id`, lo cual fallaba estrictamente siempre por comparación de tipos (Object vs String), mostrando 0 asistencias o estado 'Sin registro'.
- **Solución Aplicada:**
  1. **Emisión de WebSockets en Tiempo Real:** En `backend/controllers/asistenciaController.js`, se incorporó la llamada a `emitirAsistenciaRegistrada` dentro de `createAsistencia` para notificar inmediatamente a todos los clientes conectados a la sala de la ficha vía Socket.io.
  2. **Prioridad Autorizada de la Nube sobre Borradores Locales:** En `frontend/src/views/PanelInstructor.vue`, `inicializarAsistenciaDia` ahora compara la marca temporal `serverTime` vs `borradorTime`. Si la base de datos en la nube tiene datos más recientes o iguales, se descarta el borrador viejo y prevalecen los datos de MongoDB Atlas.
  3. **Normalización de Identificadores:** Se corrigió en `Dashboard.vue` y `Reportes.vue` la comparación de IDs usando `String(a.estudianteId?._id || a.estudianteId) === String(est._id)`.
- **Archivos Modificados:**
  - `backend/controllers/asistenciaController.js`
  - `frontend/src/views/PanelInstructor.vue`
  - `frontend/src/views/Dashboard.vue`
  - `frontend/src/views/Reportes.vue`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Compilación de producción con `npm run build:prod` completada en 548ms sin errores.
  - Artefactos estáticos desplegados y sincronizados en `backend/public/`.

---

## [2026-10-21 21:28] Corrección en Reactividad y Persistencia de Retardos (Tardanzas) en Panel Docente

- **Fecha y Hora:** 2026-10-21 21:28:00 -05:00
- **Descripción del Problema / Requerimiento:**
  Al ingresar horas en el campo de retardos ("Horas Fallidas"), el estado en la interfaz no cambiaba visualmente (se quedaba en 'Presente (A tiempo)', los contadores de tardanza no subían) y al recargar o sincronizar no se persistía como Tardanza en la base de datos.
- **Causa Raíz:**
  1. `onHorasInput` y `onHorasChange` solo asignaban el valor numérico a `reg.horasFallidas`, pero nunca alteraban `reg.estado` hacia `'Tardanza'`, ni asignaban `reg.horasTardanza` ni `reg.tiempoTardanza`.
  2. `sincronizarCambioNube` y `guardarAsistenciaDia` enviaban `estadoFinal = 'Presente'` al no detectar la mutación reactiva del estado, descartando las horas de retardo digitadas.
  3. El listener de WebSocket en `iniciarSocketDocente` no asignaba `horasTardanza` ni `tiempoTardanza` recibidos del servidor.
- **Solución Aplicada:**
  1. **Actualización Reactiva Bidireccional (`actualizarEstadoPorHoras`):**
     - Si `horas === 0`: pasa a `Presente` (badge verde), 0 horas tardanza.
     - Si `0 < horas < max`: pasa a `Tardanza` (badge amarillo reactivo `Tardanza (X horas)`), actualiza `horasTardanza` y los chips contadores en tiempo real mientras escribe.
     - Si `horas >= max`: pasa automáticamente a `Falta` (badge rojo y checkbox de falta marcado).
  2. **Persistencia y Sincronización:**
     - En `sincronizarCambioNube` y `guardarAsistenciaDia`, se asigna `hTardanza = reg.horasTardanza || reg.horasFallidas` y `tiempoTardanza = "${hTardanza} horas"`.
     - El socket actualiza `horasTardanza` y `tiempoTardanza` en tiempo real para todos los clientes conectados.
- **Archivos Modificados:**
  - `frontend/src/views/PanelInstructor.vue`
  - `TROUBLESHOOTING.md`
- **Verificación:**
  - Compilación de producción con `npm run build:prod` (Vite v8, 319 módulos) completada exitosamente en 599ms sin advertencias de resolución.

---

## [2026-10-22 22:00] Eliminacion de Suite de Pruebas Unitarias y Ajuste del Workflow Monolito

- **Fecha y Hora:** 2026-10-22 22:00:00 -05:00
- **Descripcion del Problema / Requerimiento:**
  El usuario solicito remover todas las pruebas del proyecto ('borra las pruebas no son necesarias'). Se requeria eliminar los archivos de prueba en backend/ y actualizar la canalizacion de integracion continua (CI/CD) para evitar ejecuciones o fallos por tests ausentes.
- **Causa Raiz:**
  Existian 8 archivos de pruebas unitarias (*.test.js) en backend/controllers/, backend/services/ y backend/utils/. Adicionalmente, el flujo automatizado .github/workflows/monolito-sync.yml contenia el paso explicito 'node --test' que causaria error en CI al no encontrar tests o depender de ellos.
- **Solucion Aplicada:**
  1. Se eliminaron definitivamente mediante git rm los 8 archivos de test:
     - backend/controllers/asistenciaController.test.js
     - backend/controllers/authController.test.js
     - backend/controllers/inhabilitarJornada.test.js
     - backend/controllers/procesarAsistencia.test.js
     - backend/controllers/rpaController.test.js
     - backend/services/asistenciaService.test.js
     - backend/utils/desercionUtils.test.js
     - backend/utils/inasistenciaEstado.test.js
  2. Se edito .github/workflows/monolito-sync.yml retirando el paso de ejecucion 'node --test' y resecuenciando el paso de publicacion del monolito.
- **Archivos Modificados:**
  - .github/workflows/monolito-sync.yml
  - backend/controllers/asistenciaController.test.js (eliminado)
  - backend/controllers/authController.test.js (eliminado)
  - backend/controllers/inhabilitarJornada.test.js (eliminado)
  - backend/controllers/procesarAsistencia.test.js (eliminado)
  - backend/controllers/rpaController.test.js (eliminado)
  - backend/services/asistenciaService.test.js (eliminado)
  - backend/utils/desercionUtils.test.js (eliminado)
  - backend/utils/inasistenciaEstado.test.js (eliminado)
  - TROUBLESHOOTING.md
- **Verificacion:**
  - Verificacion con git ls-files confirmando la remocion total de archivos de prueba.
  - Flujo de sincronizacion de monolito validado sin dependencias a suites de test.

---

## [2026-10-22 22:04] Correccion de Carrera Concurrente en Workflow de CI/CD (Monolito)

- **Fecha y Hora:** 2026-10-22 22:04:00 -05:00
- **Descripcion del Problema / Bug:**
  El runner de GitHub Actions fallo en el paso 7 al intentar publicar el monolito:
  To https://github.com/ivanrene86/HuelleroActualizado
  ! [rejected] main -> main (fetch first)
  error: failed to push some refs to 'https://github.com/ivanrene86/HuelleroActualizado'
- **Causa Raiz:**
  Al sincronizar o actualizar simultaneamente varias ramas vinculadas al workflow (main, Backend, Frontend, Huellero), GitHub Actions disparo multiples runners en paralelo. Uno de los runners compilo y publico exitosamente el commit ci(monolito): compilar frontend a backend/public y unificar monolito [skip ci] (commit 35b8c34), mientras que los otros runners concurrentes quedaron con un HEAD desactualizado y fueron rechazados por Git al no ser un fast-forward.
- **Solucion Aplicada:**
  1. **Control de Concurrencia:** Se agrego la directiva concurrency: group: monolito-sync, cancel-in-progress: false en .github/workflows/monolito-sync.yml, garantizando que GitHub Actions procese las solicitudes en cola secuencial sin competir entre si.
  2. **Fetch y Pull Temprano:** Se anadio git pull origin main --no-edit || true tras git checkout main en el paso 3.
  3. **Mecanismo de Reintento y Rebase Automatico:** En el paso 7, antes de publicar, se consulta el estado remoto con git fetch origin main y, en caso de rechazo por concurrencia externa, se aplica un bucle de reintento con git pull --rebase origin main para resolver el desfase automaticamente sin romper el pipeline.
- **Archivos Modificados:**
  - .github/workflows/monolito-sync.yml
  - TROUBLESHOOTING.md
- **Verificacion:**
  - Sincronizacion y alineacion de los remotos origin, sista y juan en el commit generado por el bot.
  - Validacion de sintaxis YAML y politica de concurrencia en la accion de GitHub.

---

## [2026-10-22 22:10] Robustecimiento de Deteccion de Commits y Publicacion en Monolito CI/CD

- **Fecha y Hora:** 2026-10-22 22:10:00 -05:00
- **Descripcion del Problema / Mejora:**
  Al revisar los logs de ejecuciones anteriores de GitHub Actions (commits rechazados por non-fast-forward en runs concurrentes heredados), se identifico un caso limite critico: si una rama disparadora (por ejemplo Backend) contiene cambios de servidor que no alteran el build de frontend en backend/public, la condicion anterior git diff --staged --quiet evaluaba falso para el build y omitia el push, dejando el merge de Backend sin publicar en main.
- **Causa Raiz:**
  El script evaluaba unicamente los cambios en stage de ackend/public para decidir si hacia push a origin main, ignorando si el git merge previo de la rama disparadora ya habia generado un commit de integracion en main.
- **Solucion Aplicada:**
  1. Se separo la creacion de commit de frontend (ackend/public) de la decision de push.
  2. Se implemento la evaluacion de commits pendientes mediante COMMITS_AHEAD=0.
  3. Si COMMITS_AHEAD > 0 (bien sea por merge de ramas o por nuevo bundle de frontend), se activa el proceso de publicacion con reintentos y rebase.
- **Archivos Modificados:**
  - .github/workflows/monolito-sync.yml
  - TROUBLESHOOTING.md
- **Verificacion:**
  - Sintaxis de workflow validada. Sincronizacion total en remotes.

---

## [2026-10-22 22:13] Establecimiento del Protocolo de Ramas por Modulo y Flujo Monolito

- **Fecha y Hora:** 2026-10-22 22:13:00 -05:00
- **Descripcion del Problema / Requerimiento:**
  Definicion formal de la arquitectura de ramas: el usuario establecio que cada rama debe recibir exclusivamente los cambios correspondientes a su modulo ('en cada rama solo se suba lo pertinente: el backend en el backend, el frontend en el frontend').
- **Causa Raiz / Contexto:**
  Evitar la mezcla accidental o sobreescritura de las ramas hijas (Backend, Frontend, Huellero) con el monolito general (main), garantizando que los desarrolladores de frontend y backend trabajen aislados en sus respectivas carpetas sin ruido de otros componentes.
- **Solucion Aplicada:**
  1. **Aislamiento de Ramas:**
     - Rama Backend: Exclusiva para desarrollo en la carpeta ackend/ (endpoints, servicios, controladores, modelos, base de datos).
     - Rama Frontend: Exclusiva para desarrollo en la carpeta rontend/ (vistas Vue, componentes, estilos, assets).
     - Rama Huellero: Exclusiva para la aplicacion de escritorio Electron (huellero/).
     - Rama main: Rama de produccion / monolito donde convergen todas las ramas via GitHub Actions CI/CD y donde reside el bundle estatico compilado en ackend/public/.
  2. **Direccionalidad Estricta:**
     - El flujo es unidireccional hacia main: Rama Hija -> Push Remoto -> GitHub Actions CI/CD -> Merge a main -> Build Frontend -> Publicacion en main.
     - Queda estrictamente prohibido sobreescribir o forzar push de main hacia las ramas hijas.
  3. **Configuracion Local:** Ramas locales creadas con tracking a origin (git branch --track Backend origin/Backend, etc.).
- **Archivos Modificados:**
  - TROUBLESHOOTING.md
- **Verificacion:**
  - Ramas locales y remotas alineadas. Regla de integracion validada en .github/workflows/monolito-sync.yml.
