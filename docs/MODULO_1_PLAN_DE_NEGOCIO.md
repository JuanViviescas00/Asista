# PLAN DE NEGOCIO BÁSICO — MÓDULO 1: ASPECTOS GENERALES DEL PROYECTO
### Fondo Emprender — SENA / Programa de Emprendimiento e Innovación Tecnológica

---

**NOMBRE DEL PROYECTO:**
ASISTA – Sistema Integral de Control de Asistencia Biométrica y Gestión Académica Institucional

**NOMBRE DE LOS APRENDICES:**
Juan Camilo Viviescas, María Julia Saavedra, César, Óscar, Iván René

**PROGRAMA DE FORMACIÓN:**
Tecnología en Análisis y Desarrollo de Software

**CENTRO DE FORMACIÓN:**
Centro de Servicios y Gestión Empresarial — SENA Regional Antioquia

**FECHA:**
Septiembre de 2026

---

## 1. ASPECTOS GENERALES DEL PROYECTO

### 1.1 DESCRIPCIÓN DEL PROYECTO

El proyecto **ASISTA** consiste en la creación y puesta en marcha de una empresa de base tecnológica
del sector EdTech, dedicada al diseño, desarrollo, comercialización e implantación de un sistema
integral de software para la automatización del control de asistencia, el seguimiento a la deserción
escolar y la gestión académica en instituciones educativas de carácter técnico, tecnológico y superior.
La solución nace como respuesta directa a las fallas operativas evidenciadas en los ambientes de
formación del Servicio Nacional de Aprendizaje (SENA) y en entidades de formación para el trabajo
y el desarrollo humano, donde el registro de asistencia se ejecuta de manera manual mediante
planillas de papel o archivos de cálculo desarticulados, acarreando pérdidas de entre 15 y 20 minutos
de formación lectiva por sesión, suplantación de identidad entre aprendices, deterioro y pérdida
de soportes físicos, y desfasaje de semanas en la notificación de inasistencias para los comités
de evaluación y seguimiento académico.

La propuesta de valor de **ASISTA** se fundamenta en un ecosistema de software híbrido que opera
de forma autónoma sobre la infraestructura tecnológica de cada institución cliente. En el ambiente
presencial de aula, se despliega una aplicación de escritorio desarrollada sobre el framework
**Electron**, compatible con los lectores biométricos ópticos del mercado (**DigitalPersona U.are.U
4500** como dispositivo de referencia, adquirido de manera independiente por cada institución a
través de los canales comerciales disponibles). Mediante la integración a bajo nivel de librerías
nativas y un motor biométrico de identificación automática 1:N en memoria, el sistema reconoce
al aprendiz y valida su presencia en **menos de 1 segundo** con solo posar su huella dactilar sobre
el cristal óptico del sensor, sin necesidad de digitar números de documento ni interactuar
manualmente con pantallas táctiles.

Uno de los pilares diferenciales del producto radica en su arquitectura **Offline-First**: el sistema
almacena las plantillas biométricas y procesa los registros de asistencia en una base de datos local
**SQLite** instalada en el propio equipo del aula. Esto garantiza continuidad operativa absoluta
frente a cortes de energía o caídas del servicio de internet institucional, que representan una
de las causas más frecuentes de fallo en sistemas de control de asistencia basados en la nube.
Una vez restablecida la red interna, el cliente de escritorio sincroniza de forma automática y
transparente todos los registros hacia el **servidor local de la institución**, que alberga la base
de datos central de la sede de forma completamente independiente, garantizando que los datos
académicos y biométricos permanezcan en todo momento dentro de las instalaciones del cliente.

El sistema integra además una plataforma web administrativa desarrollada en **Vue 3 / Quasar**,
con paneles diferenciados por roles para Administradores, Coordinadores Académicos e Instructores.
A través de este entorno, se calcula automáticamente el banco acumulado de horas de inasistencia
en estricto cumplimiento del **Reglamento del Aprendiz (Acuerdo 007 de 2012)**, se gestiona la
radicación y aprobación de excusas médicas con soportes digitales adjuntos, se emiten alertas
preventivas de deserción temprana en tiempo real y se generan reportes consolidados auditables
exportables en formatos Excel y PDF para comités directivos y entes de control.

En materia de protección de datos, **ASISTA** cumple rigurosamente con la **Ley 1581 de 2012
(Habeas Data)** sobre protección de datos personales sensibles en Colombia. El lector biométrico
no almacena ni transmite imágenes fotográficas del dedo del usuario; únicamente genera y cifra
un vector matemático unidireccional e irreversible (estándar **ISO/IEC 19794-2**), imposible de
reconstruir visualmente hacia la huella de origen, garantizando la seguridad de la información
biométrica de cada aprendiz.

El modelo de negocio se basa en la venta de **licencias anuales de software con soporte técnico
incluido**, liquidadas por número de aprendices activos o sedes habilitadas. Para instituciones
que no cuenten con infraestructura servidora propia, **ASISTA** ofrece de manera opcional el
préstamo de un equipo servidor preconfigurado en comodato durante la vigencia del contrato,
lo que permite ampliar el alcance comercial hacia instituciones de menor capacidad tecnológica
sin incrementar la complejidad del producto central.

---

### 1.2 DEFINICIÓN DE OBJETIVOS

#### OBJETIVO GENERAL

Constituir una empresa de base tecnológica con sede principal en la ciudad de **Medellín
(Antioquia)**, orientada al desarrollo, comercialización e implantación del sistema de software
**ASISTA**, ofreciendo a centros de formación del SENA, universidades e institutos de educación
para el trabajo una solución automatizada de control de asistencia, trazabilidad académica y
mitigación de la deserción escolar bajo un modelo de **licencia anual de software con soporte
técnico incluido**, con disponibilidad opcional de infraestructura servidora en comodato para
instituciones que no cuenten con equipamiento propio.

---

#### OBJETIVOS ESPECÍFICOS

**1. Estudio de Mercado**

Identificar y dimensionar el mercado potencial para el sistema **ASISTA** a nivel regional y
nacional, analizando el universo de instituciones educativas técnicas, tecnológicas y superiores
con necesidades activas de automatización del control de asistencia. Este objetivo contempla:

- La caracterización del perfil de compra de los tomadores de decisión: coordinadores académicos,
  directores de centro, rectores y vicerrectores administrativos.
- La estimación del tamaño del mercado total disponible (TAM), el mercado al que puede accederse
  de forma realista (SAM) y el mercado objetivo concreto de los primeros dos años de operación (SOM).
- La segmentación por tipo de institución (pública, privada o mixta), número de aprendices
  matriculados, número de sedes activas y capacidad presupuestal para la adquisición de licencias
  de software institucional.
- El levantamiento de información primaria a través de encuestas y entrevistas con coordinadores
  académicos de centros SENA de la Regional Antioquia como mercado piloto de validación.

---

**2. Definición del Mercado Objetivo y Estrategia de Comercialización**

Determinar con precisión los segmentos de cliente a los que estará dirigido **ASISTA**, bajo el
entendimiento de que el negocio se centra exclusivamente en la **venta de licencias anuales de
software**, siendo la adquisición del lector biométrico responsabilidad directa de la institución
a través de los canales de distribución comercial disponibles en el mercado colombiano.

Los mercados objetivo prioritarios serán:

- Los **Centros de Formación del SENA** a nivel nacional, priorizando las regionales Antioquia,
  Cundinamarca y Valle del Cauca por mayor concentración de aprendices activos.
- Las **Instituciones de Educación para el Trabajo y el Desarrollo Humano (ETDH)** del sector
  privado con más de 200 estudiantes matriculados.
- Los **Colegios con Modalidad de Educación Media Técnica** articulados al SENA que deban
  certificar asistencia formal ante el Ministerio de Educación Nacional.

El modelo comercial contempla:

- **Licencia anual de software con soporte técnico incluido**, liquidada por número de aprendices
  activos o sede habilitada.
- **Comodato opcional de servidor:** Para instituciones que no cuenten con infraestructura propia,
  ASISTA ofrece el préstamo de un equipo servidor preconfigurado durante la vigencia del contrato
  anual. El equipo permanece en propiedad de ASISTA y es recuperado en caso de no renovación,
  lo que protege el activo tecnológico y refuerza el incentivo de renovación del contrato.
- Los canales de comercialización incluirán demostraciones funcionales en vivo ante comités
  directivos, participación en ruedas de negocios de Fondo Emprender, SENNOVA y ferias de
  innovación educativa (EdTech).

---

**3. Análisis de la Competencia**

Estudiar el panorama competitivo del mercado de software de control de asistencia en el sector
educativo colombiano, identificando actores nacionales e internacionales, sus modelos de precio
y limitaciones tecnológicas, con el fin de posicionar claramente las ventajas diferenciales de
**ASISTA**:

- **Arquitectura On-Premise con servidor local por institución:** Los datos biométricos y registros
  de asistencia residen exclusivamente en los servidores de la institución cliente, garantizando
  soberanía total sobre los datos y cumplimiento pleno de la Ley 1581 de 2012 (Habeas Data) sin
  depender de infraestructura cloud de terceros.
- **Operación Offline-First certificada:** Los equipos de aula registran asistencias de forma
  completamente local (SQLite) y sincronizan al servidor institucional al restaurarse la red interna,
  sin requerir internet externo en ningún momento del proceso de marcación.
- **Reconocimiento biométrico 1:N en memoria:** El aprendiz no requiere digitar número de documento
  ni interactuar con pantallas. La identificación ocurre en menos de 1 segundo al posar el dedo
  sobre el lector.
- **Parametrización nativa del Reglamento del Aprendiz (Acuerdo 007 de 2012):** Cálculo automático
  del banco de horas de inasistencia, alertas tempranas de deserción y reportes auditables en tiempo
  real, funcionalidades ausentes en competidores como ZKTeco, Anviz o FingerTec.
- **Costo de licenciamiento competitivo:** Al ser un producto de desarrollo colombiano, elimina
  costos de importación de software, soporte en idioma extranjero y adaptación normativa internacional.

---

**4. Plan de Implementación e Infraestructura para la Comercialización**

Definir el proceso estandarizado de entrega, despliegue y soporte del sistema **ASISTA** bajo el
modelo On-Premise por institución, estructurado así:

- **Despliegue por Institución Cliente:** Cada institución opera su propio servidor local con su
  base de datos independiente. ASISTA entrega el instalador del sistema backend, el cliente de
  escritorio Electron para los equipos de aula y la plataforma web administrativa, todo desplegado
  sobre la infraestructura de la propia institución. Los datos académicos y biométricos nunca salen
  de las instalaciones del cliente.
- **Comodato de Servidor (Servicio Opcional):** Para instituciones sin servidor propio, ASISTA
  ofrece el préstamo de un equipo servidor preconfigurado y listo para producción durante la vigencia
  del contrato anual. Al no renovarse el contrato, el equipo es retirado por ASISTA, protegiendo el
  activo tecnológico de la empresa y reforzando el incentivo de continuidad del cliente.
- **Protocolo de Puesta en Marcha:** El proceso de instalación, configuración de la base de datos
  local, carga masiva de aprendices desde archivos CSV/Excel y primera jornada de enrolamiento de
  huellas se ejecutará de forma remota o presencial según los requerimientos de la institución,
  con un tiempo de activación máximo de **2 días hábiles** desde la firma del contrato de licencia.
- **Modelo de Soporte y Renovación Anual:** El contrato de licencia incluye soporte técnico
  multicanal (mesa de ayuda, correo institucional y asistencia remota), actualizaciones periódicas
  del software y capacitación al personal docente y administrativo de la sede. La renovación anual
  garantiza a la empresa un flujo de ingresos recurrente y predecible como pilar de la sostenibilidad
  financiera del modelo de negocio.

---

### 1.3 JUSTIFICACIÓN

#### 1.3.1 Justificación desde el Contexto del Mercado Global y Local

El proyecto **ASISTA** no solo nace de una necesidad operativa identificada en los ambientes de
formación del SENA, sino que se enmarca en una tendencia de crecimiento sostenido y verificable
a nivel global de los sistemas biométricos aplicados al control de asistencia en instituciones
educativas.

Según datos de **Virtue Market Research**, el mercado global de sistemas de asistencia biométrica
en el sector educativo se encontraba valorado en aproximadamente **USD 47 mil millones**, con una
proyección de alcanzar los **USD 88.95 mil millones para el año 2030**, lo que representa una
**tasa de crecimiento anual compuesta (CAGR) del 8.3%** sostenida durante los últimos tres años.
Este crecimiento está impulsado principalmente por dos factores que coinciden exactamente con la
propuesta de valor de ASISTA: la necesidad de monitoreo en tiempo real de la asistencia de
estudiantes y personal, y la eliminación del fraude en el registro conocido como *"buddy punching"*
(la práctica de marcar asistencia por otra persona), problemática que la huella dactilar resuelve
de raíz al ser un rasgo biológico único e intransferible.

Ampliando la perspectiva hacia el ecosistema biométrico en general, el segmento global de
tecnología biométrica registró un crecimiento del **28% en 2020**, con proyecciones que alcanzan
los **USD 65.3 mil millones para 2025** y un segmento de autenticación biométrica que crece a un
**CAGR del 16.2%**, de acuerdo con el análisis de **Ventas de Seguridad**. Estas cifras confirman
que la biometría no es una tendencia emergente, sino un mercado en plena fase de expansión y
maduración tecnológica a escala mundial.

En el contexto colombiano, estos indicadores se traducen en una demanda local consolidada y en
expansión: el país muestra una dependencia del **62% de importaciones de equipos biométricos**
para abastecer su mercado interno, lo que evidencia que la adopción de tecnología de identificación
dactilar está arraigada en múltiples sectores productivos e institucionales del país, incluyendo
el educativo *(Ventas de Seguridad)*. Esta realidad representa simultáneamente una oportunidad
y una ventaja competitiva para **ASISTA**: al ser una solución de software de desarrollo colombiano,
no compite en el segmento del hardware de importación, sino que lo complementa, adaptando las
capacidades de los dispositivos disponibles en el mercado local a las necesidades normativas y
operativas específicas del sistema educativo colombiano.

---

#### 1.3.2 Justificación desde la Problemática Institucional

El proyecto **ASISTA** da respuesta directa a una necesidad operativa crítica del sector educativo
técnico y vocacional: la ineficiencia, el fraude y la falta de trazabilidad en el control de la
asistencia diaria. Tradicionalmente, este proceso se efectúa mediante listas impresas que demandan
entre el 10% y el 15% del tiempo total de una clase, facilitan la suplantación de identidad entre
estudiantes mediante la práctica de "firmar por el compañero ausente" (*buddy punching*), y
conllevan a un almacenamiento precario propenso a pérdidas físicas, deterioro y errores de
transcripción que impiden auditorías confiables.

La **innovación y valor agregado** de ASISTA radican en tres pilares técnicos y metodológicos:

**1. Identificación Biométrica 1:N de Alta Velocidad:**
A diferencia de sistemas comerciales que exigen teclear la cédula antes del reconocimiento, el
aprendiz se valida de manera instantánea en **menos de 1 segundo** por reconocimiento dactilar
directo en memoria, sin interacción manual adicional con el sistema. Esta característica elimina
de forma definitiva el *buddy punching* al requerir la presencia física e irrepetible del aprendiz.

**2. Arquitectura Híbrida Offline-First con Servidor Local por Institución:**
Resuelve el cuello de botella más frecuente en los ambientes de formación: la inestabilidad de la
red WiFi institucional. El software continúa registrando asistencias en su base de datos local y
sincroniza silenciosamente con el servidor propio de la institución al restablecer la conexión
interna, **sin requerir internet externo en ningún momento del proceso de marcación.** Al operar
completamente sobre infraestructura propia de cada cliente, se eliminan los riesgos asociados a
la dependencia de servicios en la nube de terceros y se garantiza la propiedad total de los datos
biométricos y académicos por parte de la institución, en pleno cumplimiento de la
**Ley 1581 de 2012 (Habeas Data)**.

**3. Parametrización con el Marco Normativo Institucional:**
Automatiza el cálculo exacto de horas de inasistencia conforme al **Reglamento del Aprendiz
(Acuerdo 007 de 2012)**, notificando de forma inmediata a los comités de evaluación y al área
de Bienestar al Aprendiz para activar planes de mejoramiento antes de que el estudiante abandone
su proceso formativo — convirtiendo la detección de la deserción de un proceso reactivo a uno
**preventivo y oportuno.**

---

#### 1.3.3 Justificación Estratégica y de Sostenibilidad

Esta oportunidad de negocio surge del conocimiento técnico y la experiencia directa del equipo de
desarrollo en los ambientes de formación del SENA, combinando el dominio técnico del producto con
el entendimiento profundo de la necesidad real del usuario final. En un mercado donde el 62% de
la tecnología biométrica que circula en Colombia es importada, **ASISTA** representa una apuesta
por el desarrollo tecnológico nacional: una solución diseñada, construida y parametrizada bajo
el marco normativo colombiano, que no requiere licencias de software extranjero, soporte en idioma
extranjero ni costosas adaptaciones legales.

La solución convierte una tarea administrativa obsoleta en un proceso transparente, digitalizado,
jurídicamente seguro y ambientalmente sostenible, alineándose con la política institucional de
**"Cero Papel"** del Gobierno Nacional y del SENA, y con los Objetivos de Desarrollo Sostenible
(ODS 4 — Educación de Calidad y ODS 9 — Industria, Innovación e Infraestructura) al fortalecer
la trazabilidad académica y la permanencia estudiantil a través de la tecnología.

---

**Referencias Bibliográficas (Sección 1.3):**
- Virtue Market Research. *Biometric Attendance System in Education Market*. Recuperado de: https://virtuemarketresearch.com
- Ventas de Seguridad. *El ascenso de la biometría: crecimiento, perspectivas e importaciones*. Recuperado de: https://ventasdeseguridad.com

---

*Documento elaborado como parte del Plan de Negocio Básico para postulación a Fondo Emprender SENA.*
*Versión 1.1 — Septiembre de 2026.*
