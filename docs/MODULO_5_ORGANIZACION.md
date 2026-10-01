# PLAN DE NEGOCIO BÁSICO — MÓDULO 5: ORGANIZACIÓN
### Fondo Emprender — SENA / Programa de Emprendimiento e Innovación Tecnológica

---

**PROYECTO:** ASISTA – Sistema Integral de Control de Asistencia Biométrica y Gestión Académica Institucional
**VERSIÓN:** 1.0 — Septiembre de 2026

---

## 5. ORGANIZACIÓN

### 5.1 ESTRATEGIA ORGANIZACIONAL — ANÁLISIS DOFA

El presente análisis evalúa la situación interna y externa del proyecto enfocado en el desarrollo
e implementación del software de control de asistencia biométrico para el SENA.

---

#### DEBILIDADES (Internas)

• Dependencia de recursos de hardware limitados para pruebas iniciales (disponibilidad de lector
  de huella / huellero).

• Producto nuevo en etapa inicial que requiere validación e institucionalización por parte
  de la entidad.

---

#### FORTALEZAS (Internas)

• Solución de software innovadora y tecnológicamente avanzada adaptada a los requerimientos
  normativos del SENA.

• Alto valor funcional: automatiza el registro de inasistencias y retardos, facilitando insumos
  exactos para comités académicos e instructores.

• Costo de desarrollo optimizado utilizando insumos y requerimientos suministrados directamente
  por la entidad.

---

#### OPORTUNIDADES (Externas)

• Escalabilidad del software hacia otras sedes del SENA o entidades educativas y corporativas
  públicas/privadas que requieran control asistencial.

• Necesidad institucional de digitalizar procesos administrativos para el seguimiento y bienestar
  del aprendiz.

• Posibilidad de integrar futuras funcionalidades de reporte y alertas preventivas sobre la
  deserción o fallas reiteradas.

---

#### AMENAZAS (Externas)

• Riesgo de no aprobación o no adopción formal del sistema por parte de los comités e instancias
  directivas del SENA.

• Cambios en los protocolos o normativas internas de la entidad que requieran reestructuraciones
  no contempladas en la arquitectura inicial.

---

### 5.2 ESTRUCTURA ORGANIZACIONAL

El proyecto cuenta con una estructura definida en los niveles directivo, comercial/institucional
y técnico-operativo para garantizar la calidad, desarrollo y correcta adopción del software
dentro del SENA y eventuales entidades externas.

---

**CARGO: GERENTE / LÍDER DE PROYECTO**
**NOMBRE:** Alex Guevara *(Instructor Director / Asesor)*
**FUNCIONES:**
1. Supervisar la planificación, avances y cumplimiento de los objetivos generales del proyecto
   de desarrollo de software.
2. Coordinar la articulación entre el equipo desarrollador y las directivas, comités y
   coordinaciones académicas del SENA.
3. Aprobar las fases del ciclo de vida del software e hitos entregables del proyecto.
4. Tomar decisiones estratégicas sobre el alcance, prioridades y recursos del proyecto.
5. Representar institucionalmente el proyecto ante instancias de evaluación y seguimiento
   del Fondo Emprender y el SENA.
6. Garantizar el cumplimiento de los compromisos contractuales y normativos establecidos
   en el marco del proyecto.
7. Gestionar los riesgos identificados en el análisis DOFA y activar planes de contingencia
   cuando sea necesario.
8. Aprobar los informes de avance y entregables finales del equipo de desarrollo.
9. Supervisar el uso responsable de los recursos tecnológicos y financieros asignados
   al proyecto.
10. Facilitar la resolución de conflictos o bloqueos técnicos e institucionales que afecten
    el cronograma del proyecto.

---

**CARGO: VENTAS / GESTIÓN DE RELACIONES INSTITUCIONALES**
**NOMBRE:** Alex Guevara
**FUNCIONES:**
1. Tramitar la validación, adopción y transferencia del sistema de control de asistencia ante
   las directivas e instancias del SENA.
2. Gestionar alianzas y oportunidades de escalamiento del software hacia otras sedes
   institucionales o entidades externas en caso de su comercialización.
3. Presentar la propuesta de valor y demostraciones funcionales del software a comités
   evaluadores y partes interesadas.
4. Coordinar los procesos de formalización institucional del software (acuerdos de uso,
   cesión de derechos, contratos de licencia).
5. Identificar nuevos mercados y segmentos de clientes potenciales para la expansión del
   sistema más allá del piloto SENA.
6. Gestionar la relación continua con las instituciones que adopten el sistema, garantizando
   su satisfacción y renovación.
7. Elaborar y actualizar los materiales de presentación comercial e institucional del proyecto
   (brochure, presentaciones, demos en vivo).
8. Hacer seguimiento a los procesos de aprobación institucional y mantener informado al equipo
   sobre el estado de adopción del sistema.
9. Representar al proyecto en eventos de innovación, ferias EdTech y ruedas de negocios del
   ecosistema SENA (SENNOVA, Fondo Emprender).
10. Evaluar y documentar el impacto institucional del software para generar casos de éxito
    replicables en otras sedes o entidades.

---

**CARGO: OPERATIVO / EQUIPO DE DESARROLLO DE SOFTWARE**
**NOMBRES:** Iván Figueroa, Oscar Arciniegas, Juan Viviescas, María, César Salamanca
**FUNCIONES:**
1. Diseñar la arquitectura del sistema, la base de datos local (SQLite) y la interfaz de usuario
   del software de control de asistencia.
2. Programar la lógica del sistema e integrar la lectura biométrica a través del hardware
   (huellero DigitalPersona U.are.U 4500) para el registro automatizado de llegadas tardías
   e inasistencias.
3. Realizar las pruebas unitarias, de integración y de usuario, garantizando el correcto
   funcionamiento del sistema y la exactitud de los informes para comités e instructores.
4. Brindar soporte técnico, mantenimiento correctivo y preventivo, y documentación técnica
   completa de la aplicación.
5. Ejecutar el proceso de instalación y puesta en marcha del sistema en cada sede o ambiente
   de formación donde se despliegue.
6. Acompañar las jornadas de enrolamiento biométrico de los aprendices, garantizando la correcta
   captura y almacenamiento cifrado de las plantillas dactilares.
7. Aplicar estándares de seguridad en el tratamiento de datos biométricos conforme a la
   Ley 1581 de 2012 (Habeas Data) y el estándar ISO/IEC 19794-2.
8. Mantener actualizado el repositorio de código, el registro de versiones (CHANGELOG) y la
   documentación técnica del sistema.
9. Investigar e implementar mejoras tecnológicas al motor de reconocimiento biométrico 1:N
   en memoria para optimizar la velocidad y precisión de identificación.
10. Capacitar a los instructores y personal administrativo de cada sede en el uso correcto del
    sistema y en la interpretación de los reportes generados.

---

**CARGO: FINANCIERO / ADMINISTRATIVO**
**NOMBRE:** Alex Guevara *(representante administrativo del equipo)*
**FUNCIONES:**
1. Administrar los recursos tecnológicos y materiales presupuestados o donados para la ejecución
   del proyecto.
2. Llevar el control de costos de desarrollo, costos operativos de pruebas y proyección
   financiera en caso de despliegue a mayor escala.
3. Elaborar informes de gestión de recursos y soporte presupuestal del desarrollo del software
   para el Fondo Emprender y la dirección del proyecto.
4. Gestionar los trámites de formalización legal del proyecto: registro de software ante la DNDA,
   constitución de empresa, RUT y Cámara de Comercio.
5. Controlar el flujo de caja del proyecto y garantizar la disponibilidad de recursos para cada
   fase del cronograma de desarrollo.
6. Elaborar el presupuesto de operación para el primer año comercial, incluyendo proyecciones de
   ingresos por licencias, costos de soporte y gastos de expansión.
7. Gestionar la facturación y cobro de contratos de licencia en las instituciones que adopten el
   sistema de forma comercial.
8. Cumplir con las obligaciones tributarias y de seguridad social del equipo vinculado al proyecto
   conforme a la normativa colombiana vigente.
9. Evaluar la viabilidad financiera de nuevas funcionalidades o expansiones del sistema antes de
   su aprobación e incorporación al roadmap del producto.
10. Consolidar y presentar los estados financieros del proyecto en los informes periódicos
    exigidos por el Fondo Emprender.

---

*Documento elaborado como parte del Plan de Negocio Básico para postulación a Fondo Emprender SENA.*
*Versión 1.0 — Septiembre de 2026.*
