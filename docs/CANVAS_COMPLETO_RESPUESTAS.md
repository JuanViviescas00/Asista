# MODELO CANVAS — RESPUESTA COMPLETA POR BLOQUE
## AppDeMarcaciónBiométricaDeAsistencia — SENA
### Análisis de Oportunidades para Emprender

---

> Este documento responde cada pregunta guía de la plantilla oficial del Modelo CANVAS del SENA,
> con base en la idea de negocio del proyecto **ASISTA – Sistema Integral de Control de Asistencia
> Biométrica y Gestión Académica Institucional**.

---

## 1. SEGMENTOS DE CLIENTES
**¿Para quién estamos creando valor? / ¿Quiénes son nuestros clientes más importantes?**

Estamos creando valor para las **instituciones educativas del sector técnico, tecnológico y superior
en Colombia** que deben controlar diariamente la asistencia de sus estudiantes y garantizar el
cumplimiento de exigencias normativas y académicas. Los segmentos son:

- **Centros de Formación del SENA** (directores de centro y coordinadores académicos): son el
  mercado primario y el entorno de validación del producto. El SENA cuenta con más de 118 centros
  de formación a nivel nacional, cada uno con múltiples fichas activas y cientos a miles de
  aprendices matriculados que requieren un control de asistencia riguroso y auditable conforme al
  Reglamento del Aprendiz (Acuerdo 007 de 2012).

- **Institutos Técnicos y Tecnológicos** (públicos y privados): instituciones con programas de
  formación presencial que exigen control de asistencia para acreditaciones, auditorías del
  Ministerio de Educación Nacional y seguimiento a la permanencia estudiantil.

- **Universidades** con programas técnicos o de educación continua y cursos presenciales, donde
  la asistencia es criterio de evaluación y los instructores requieren herramientas ágiles que no
  consuman tiempo de clase.

- **Colegios de Formación para el Trabajo (ETDH)** con más de 200 estudiantes activos y modalidad
  de educación media técnica articulada al SENA, que deben certificar asistencia formal ante entes
  de control y en sus procesos de articulación institucional.

**Cliente más importante:** Los **coordinadores académicos y directores de centro del SENA Regional
Antioquia** constituyen el segmento prioritario de entrada al mercado, dado que son los tomadores
de decisión de compra, tienen acceso a presupuesto institucional para herramientas tecnológicas
y son el ecosistema en el que el equipo validó directamente la problemática y el prototipo funcional.

---

## 2. PROPUESTA DE VALOR
**¿Qué valor entregamos al cliente? / ¿Cuál de los problemas de nuestro cliente le vamos a
ayudar a resolver? / ¿Qué paquetes de productos y servicios ofrecemos a cada segmento de
cliente? / ¿Qué necesidades del cliente estamos satisfaciendo?**

### ¿Qué valor entregamos?

**ASISTA** entrega a las instituciones educativas cuatro promesas de valor concretas y medibles:

1. **Marcación biométrica en 1 segundo por aprendiz:** Gracias al motor de identificación
   automática 1:N en memoria (el sistema reconoce la huella y la compara contra toda la base de
   aprendices de la ficha sin que el estudiante deba digitar su número de documento), la toma de
   asistencia de un grupo de 35 personas se reduce de 20 minutos a menos de 2 minutos. Esto
   devuelve entre el 10% y el 15% del tiempo lectivo al instructor y al proceso formativo.

2. **Cero suplantación de identidad (eliminación del "buddy punching"):** La huella dactilar es
   un rasgo biológico único e intransferible. A diferencia de las listas de papel o los sistemas
   con PIN, no puede ser prestada, copiada ni usada por otra persona. Esto elimina completamente
   la práctica de "firmar por el compañero ausente", garantizando que los registros de asistencia
   reflejen fielmente la presencia real del aprendiz.

3. **Modo Offline-First: funcionamiento 100% en el aula sin internet (SQLite):** El sistema
   funciona de forma completamente autónoma en el equipo del aula. Los registros se almacenan en
   una base de datos SQLite local y se sincronizan automáticamente con el servidor de la
   institución cuando la red interna se restablece. No requiere internet externo en ningún momento
   del proceso de marcación, resolviendo el problema más frecuente en los ambientes de formación:
   las caídas del WiFi institucional.

4. **Alertas tempranas de deserción según el Reglamento del Aprendiz:** El sistema calcula
   automáticamente el banco acumulado de horas de inasistencia justificada e injustificada por
   aprendiz, y emite alertas en tiempo real al área de Bienestar al Aprendiz y a los comités de
   evaluación cuando un estudiante está en riesgo de pérdida de cupo por inasistencia, conforme
   al Acuerdo 007 de 2012. Convierte la detección de la deserción de un proceso reactivo a uno
   preventivo y oportuno.

### ¿Qué necesidades satisfacemos?

- Recuperar tiempo pedagógico perdido en llamados a lista manual.
- Eliminar el fraude por suplantación de identidad en el registro de asistencia.
- Tener reportes de inasistencia auditables, en tiempo real y exportables en Excel/PDF.
- Operar con continuidad aunque falle el internet institucional.
- Cumplir con la **Ley 1581 de 2012 (Habeas Data)**: los datos biométricos se almacenan como
  vectores matemáticos cifrados (estándar ISO/IEC 19794-2), nunca como imágenes o fotografías
  de las huellas.
- Eliminar el consumo de papel y planillas físicas, alineándose con la política de "Cero Papel".

---

## 3. CANALES
**¿A través de qué canales quieren ser contactados nuestros segmentos de cliente? / ¿Cómo les
contactamos ahora? / ¿Cómo están integrados nuestros canales? / ¿Cuáles funcionan mejor?
/ ¿Cuáles son más eficaces en costos? / ¿Cómo los integramos a las rutinas de los clientes?**

**Canal principal: Mixto (Directo + Digital)**

- **Canal Directo Institucional (B2B / B2G):** El contacto primario se realiza mediante
  presentaciones y demostraciones en vivo ante directivos, coordinadores académicos y comités
  pedagógicos de cada institución. La demostración práctica en el aula (marcando la huella de
  un asistente en menos de 1 segundo y desconectando el cable de red para mostrar el modo
  Offline-First) es el canal de ventas más efectivo y de mayor impacto en la decisión de compra.

- **Portal Web de Gestión:** La plataforma web del sistema funciona también como canal de
  demostración y autoservicio. Los coordinadores académicos acceden a paneles de asistencia en
  tiempo real, descargan reportes y gestionan excusas desde cualquier dispositivo dentro de la
  red institucional, lo que refuerza el valor percibido del producto en el uso diario.

- **Ruedas de Innovación y Emprendimiento (SENNOVA / Fondo Emprender / SENA Innova):** La
  participación en convocatorias, ferias y eventos de emprendimiento del ecosistema SENA es el
  canal de visibilidad y legitimación institucional del proyecto, facilitando la apertura de
  puertas con otras regionales y centros de formación a nivel nacional.

- **¿Cómo están integrados?** El proceso es: (1) contacto inicial en eventos o por referido
  institucional → (2) demostración en vivo presencial o remota → (3) propuesta económica y firma
  del contrato de licencia → (4) despliegue e instalación en la sede (remota o presencial en
  máximo 2 días hábiles) → (5) jornada de enrolamiento de huellas de los aprendices →
  (6) soporte continuo y renovación anual.

- **Canal más eficaz en costo:** La demostración presencial en el propio ambiente de formación
  tiene el mayor índice de conversión y el menor costo por cliente adquirido, ya que la
  "prueba de concepto" es inmediata, tangible y no requiere inversión publicitaria.

---

## 4. RELACIONES CON LOS CLIENTES
**¿Qué tipo de relación espera que establezcamos y mantengamos cada uno de nuestros
segmentos de cliente? / ¿Cuáles hemos establecido? / ¿Cómo están integrados con el resto
de nuestro modelo de negocio? / ¿Cuánto cuestan?**

Los clientes institucionales del sector educativo esperan una relación de **confianza técnica,
continuidad y respuesta ágil**, ya que el control de asistencia es un proceso crítico que opera
todos los días lectivos del calendario académico.

- **Demostraciones directas en centros de formación:** La relación comienza con una visita
  técnica y demostración funcional ante directivos e instructores clave de la institución.
  Establece confianza inmediata en el producto y en el equipo técnico.

- **Soporte técnico multicanal incluido en la licencia:** Mesa de ayuda, correo institucional
  y asistencia remota están incluidos en el contrato anual. Esto reduce la fricción postventa y
  asegura la renovación del contrato, ya que el cliente no percibe el soporte como un costo
  adicional sino como parte del servicio contratado.

- **Portal web de gestión como punto de contacto cotidiano:** Al usar la plataforma web todos
  los días para consultar asistencias, emitir reportes y gestionar excusas, el instructor y el
  coordinador mantienen un vínculo activo y funcional con el producto, lo que refuerza la
  percepción de valor y la fidelización.

- **Capacitación inicial y acompañamiento en el enrolamiento:** En la fase de activación se
  realiza una jornada guiada de captura de huellas de los aprendices y entrenamiento al
  personal docente y administrativo. Esto reduce la curva de aprendizaje y asegura una adopción
  exitosa desde el primer día de uso.

- **Ruedas de innovación como canal de expansión relacional:** La participación activa en el
  ecosistema SENNOVA y Fondo Emprender genera relaciones institucionales de largo plazo que
  abren nuevas oportunidades comerciales con otras regionales y con entidades aliadas del SENA.

- **Costo estimado de las relaciones:** El soporte técnico multicanal tiene un costo operativo
  de COP 2.500.000 – 4.000.000/mes (incluido en la estructura de costos), cubierto por los
  ingresos de las licencias activas.

---

## 5. FUENTES DE INGRESOS
**¿Para cuál valor están realmente dispuestos a pagar nuestros clientes? / ¿Para qué pagan
actualmente? / ¿Cómo están pagando ahora? / ¿Cómo preferirían pagar? / ¿Cuánto contribuye
cada fuente de ingresos a los ingresos totales?**

### ¿Para qué están dispuestos a pagar?
Los clientes pagan principalmente por **recuperar tiempo de clase, eliminar el fraude de
asistencia y contar con reportes automáticos e incontestables** para comités pedagógicos y
entes de control. El valor percibido más alto es la **tranquilidad operativa**: saber que el
sistema funciona todos los días, incluso sin internet.

### ¿Para qué pagan actualmente?
Las instituciones invierten hoy en resmas de papel, impresiones, tóner y archivadores para
planillas físicas. Algunas pagan licencias de software administrativo general (SAP educativo,
plataformas SIE, etc.) que no incluyen biometría ni operación offline. Otras no tienen ningún
sistema y dependen 100% del trabajo manual del instructor.

### Estructura de Ingresos:

**Fuente 1 — Licencia Anual de Software (ingreso principal)**
Tarifa escalada según tamaño de la sede:
- Tarifa por aprendiz activo: **COP 15.000 – 25.000 por aprendiz/año**
  - Sede pequeña (hasta 300 aprendices): **COP 4.000.000 – 6.000.000/año**
  - Sede mediana (300 – 800 aprendices): **COP 7.000.000 – 12.000.000/año**
  - Sede grande (+800 aprendices): **COP 13.000.000 – 18.000.000/año**
- Alternativa: tarifa plana por sede desde **COP 3.000.000 – 8.000.000/año** según tamaño
  (modelo más simple para facturar a entidades como el SENA).

**Fuente 2 — Comodato de Servidor (servicio opcional / addon)**
Para instituciones sin infraestructura servidora propia:
- Addon anual de **COP 1.000.000 – 2.000.000** sobre la licencia base.
- El servidor permanece en propiedad de ASISTA y es recuperado en caso de no renovación,
  lo que refuerza la retención del cliente.

**Fuente 3 — Renovación Anual con Soporte, Actualizaciones y Capacitación (incluida)**
- **Opción A:** Por aprendiz activo: **COP 18.000 – 22.000/año** (renovación).
- **Opción B:** Tarifa plana por sede (modelo preferido para entidades públicas como el SENA
  por simplicidad de proceso de contratación y facturación).

### ¿Cómo contribuye cada fuente?
| Fuente | Participación estimada |
|---|---|
| Licencias anuales de software | ~70% |
| Renovaciones anuales con soporte | ~20% |
| Comodato de servidor (addon) | ~10% |

---

## 6. RECURSOS CLAVE
**¿Qué recursos clave requiere nuestra propuesta de valor? / ¿Nuestros canales de
distribución? / ¿Nuestras relaciones con clientes? / ¿Nuestras fuentes de ingresos?**

- **Equipo técnico de desarrollo:** 2 a 3 desarrolladores Fullstack con experiencia en
  Electron, Node.js, Vue 3/Quasar y bases de datos SQLite/MongoDB. Son el recurso más
  crítico y costoso del modelo.

- **Algoritmos de reconocimiento biométrico 1:N en memoria:** El núcleo diferenciador del
  producto. Integración a bajo nivel mediante bindings nativos (Koffi FFI) con las DLLs del
  SDK de DigitalPersona (`dpfpdd.dll` y `dpfj.dll`), que permiten captura, conversión y
  comparación de plantillas sin necesidad de un servidor biométrico externo.

- **Base de datos local SQLite (motor Offline-First):** Recurso tecnológico que permite el
  funcionamiento autónomo en el aula sin internet. Es la base de la propuesta de continuidad
  operativa y el diferenciador frente a sistemas cloud-only.

- **Lectores ópticos biométricos (DigitalPersona U.are.U 4500):** Hardware de referencia
  sobre el que está validado el sistema. Son adquiridos directamente por cada institución
  cliente en el mercado colombiano; ASISTA provee los drivers y la integración. En el caso
  del programa de comodato de servidores, también se dispone de mini-servidores propios.

- **Computadores y equipos de soporte técnico:** Infraestructura de trabajo del equipo de
  desarrollo y soporte (equipos de cómputo, acceso a herramientas de administración remota,
  repositorios de código y entornos de prueba).

- **Propiedad intelectual / Código fuente registrado:** El código del sistema constituye un
  activo intelectual registrable ante la DNDA (Dirección Nacional de Derecho de Autor),
  protegiendo la ventaja competitiva técnica de la empresa.

---

## 7. ACTIVIDADES CLAVE
**¿Qué actividades clave requiere nuestra propuesta de valor? / ¿Nuestros canales de
distribución? / ¿Nuestras relaciones con clientes? / ¿Nuestras fuentes de ingresos?**

- **Desarrollo del software (Electron + Vue 3/Quasar):** Diseño, programación, prueba y
  lanzamiento del sistema completo en su versión inicial comercial. Incluye el cliente de
  escritorio (Electron + SQLite + integración FFI del SDK biométrico), el servidor local
  (Node.js + Express + Socket.IO) y el panel web administrativo (Vue 3 / Quasar). Equipo
  de 2 a 3 personas durante 4 a 6 meses: **COP 30.000.000 – 45.000.000**.

- **Integración de drivers nativos del lector biométrico:** Desarrollo y mantenimiento del
  puente de bajo nivel entre el hardware DigitalPersona y el motor de la aplicación Electron
  mediante Koffi FFI. Es la actividad técnica más especializada y diferenciadora del producto.

- **Pruebas de campo y aseguramiento de calidad:** Validación del sistema en ambientes reales
  de formación con grupos de aprendices, verificando velocidad de lectura (<1 seg), tolerancia
  a fallos de red, precisión del motor 1:N y correcta aplicación del Reglamento del Aprendiz.

- **Soporte técnico multicanal:** Atención de incidencias, actualizaciones y acompañamiento
  continuo a los clientes activos mediante mesa de ayuda, correo institucional y asistencia
  remota. **COP 2.500.000 – 4.000.000/mes**.

- **Despliegue e instalación en nuevas sedes:** Proceso de activación de cada nuevo cliente,
  incluyendo instalación del servidor y el software, carga masiva de aprendices (CSV/Excel),
  configuración inicial y jornada de enrolamiento de huellas. Se ejecuta en máximo 2 días
  hábiles, con viáticos de **COP 500.000 – 1.500.000 por sede nueva**.

- **Mantenimiento y actualizaciones evolutivas del software:** Corrección de errores,
  actualizaciones de seguridad y desarrollo de nuevas funcionalidades conforme al roadmap
  del producto y las necesidades de los clientes. **COP 2.000.000 – 3.000.000/mes**
  (retainer o dev part-time).

---

## 8. SOCIOS CLAVE
**¿Quiénes son nuestros socios clave / suministradores clave? / ¿Qué recursos clave vamos
a adquirir para los socios? / ¿Qué actividades clave realizan los socios?**

- **SENA / Fondo Emprender:** Aliado institucional estratégico. Provee el ecosistema de
  validación del producto (los propios ambientes de formación del SENA), la legitimidad
  institucional para acceder a otros centros y regionales, y el acceso a capital semilla a
  través del Fondo Emprender para financiar el desarrollo inicial y la primera campaña
  comercial. Las convocatorias SENNOVA también representan una fuente de financiamiento para
  proyectos de innovación tecnológica de impacto social.

- **Distribuidores de hardware DigitalPersona (HID Global / distribuidores autorizados en
  Colombia):** Aunque ASISTA no vende hardware, es fundamental mantener relaciones con los
  distribuidores autorizados del lector DigitalPersona U.are.U 4500 para: orientar a los
  clientes hacia proveedores confiables, garantizar compatibilidad con los modelos en venta
  en el mercado colombiano y acceder a documentación técnica oficial del SDK. En el caso del
  programa de comodato, ASISTA adquiere directamente mini-servidores a **~COP 3.000.000 c/u**
  (5 unidades iniciales: COP 15.000.000).

- **Proveedores Cloud (Render, MongoDB Atlas):** Para la infraestructura interna de la empresa:
  repositorios de código, sitio de soporte/documentación, herramientas de gestión y entornos
  de prueba. **COP 150.000 – 300.000/mes**.

- **Desarrolladores de software (externos / freelance):** En fases de alto volumen de trabajo
  o para módulos especializados, se pueden vincular desarrolladores externos como socios de
  capacidad, manteniendo el núcleo tecnológico bajo control del equipo fundador.

---

## 9. ESTRUCTURA DE COSTOS
**¿Cuáles son los costos más importantes inherentes a nuestro modelo de negocio?
/ ¿Qué recursos clave son los más caros? / ¿Qué actividades clave son las más caras?**

| Concepto | Costo Estimado |
|---|---|
| Desarrollo del software (equipo 2-3 personas, ~4-6 meses) | COP 30.000.000 – 45.000.000 |
| Compra de equipos servidor para programa de comodato (5 mini-servidores ~COP 3.000.000 c/u) | COP 15.000.000 |
| Soporte técnico multicanal (mesa de ayuda, correo, remoto) | COP 2.500.000 – 4.000.000 / mes |
| Mantenimiento y actualizaciones del software (retainer o dev part-time) | COP 2.000.000 – 3.000.000 / mes |
| Viáticos de despliegue, instalación y capacitación por sede nueva (+2 días hábiles) | COP 500.000 – 1.500.000 / sede |
| Infraestructura interna de la empresa (correo corp., repositorio, sitio de soporte) | COP 150.000 – 300.000 / mes |
| Mantenimiento y reposición de servidores en comodato | Amortizado a 3 años |

**Costos más importantes:**
1. **El talento humano de desarrollo** es el costo más alto y más crítico. La calidad del equipo
   de desarrollo determina directamente la calidad y confiabilidad del producto.
2. **La inversión inicial en servidores de comodato** es el segundo costo en magnitud, pero se
   recupera a través del addon de comodato y se protege mediante la cláusula de recuperación del
   equipo ante no renovación del contrato.
3. **El soporte técnico mensual** es el costo recurrente más importante para mantener la
   satisfacción del cliente y asegurar la renovación anual de las licencias.

---

**Documento elaborado con base en la plantilla oficial de Análisis de Oportunidades para Emprender
del SENA y la información del proyecto ASISTA / Huellero Biométrico.**
*Versión 1.0 — Septiembre de 2026.*
