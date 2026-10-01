# MODELO CANVAS DE NEGOCIO (METODOLOGÍA SENA)
## Proyecto: Sistema Integral de Asistencia Biométrica y Gestión Académica (Asista / Huellero SENA)

---

**Entidad Promotora:** Servicio Nacional de Aprendizaje (SENA)  
**Programa / Enfoque:** Fondo Emprender / Innovación y Desarrollo Tecnológico (EdTech)  
**Modelo:** Business Model Canvas (Alexander Osterwalder adaptado a Formato Institucional SENA)  
**Sector Económico:** Tecnologías de la Información y Comunicación (TIC) / EdTech B2B & B2G  

---

## 1. LIENZO DEL MODELO CANVAS (VISIÓN PANORÁMICA)

| **8. SOCIOS CLAVE** | **7. ACTIVIDADES CLAVE** | **2. PROPUESTA DE VALOR** | **4. RELACIONES CON CLIENTES** | **1. SEGMENTOS DE CLIENTES** |
|---|---|---|---|---|
| • **Proveedores de Hardware Biométrico:** Distribuidores autorizados de DigitalPersona / HID Global.<br>• **SENA y Centros de Formación:** Validación piloto, comités pedagógicos y Fondo Emprender.<br>• **Proveedores Cloud e Infraestructura:** Render, MongoDB Atlas, AWS.<br>• **Comunidades de Software Libre:** Ecosistema Node.js, Electron, Vue, SQLite.<br>• **Asesores Jurídicos TIC:** Expertos en Habeas Data (Ley 1581 de 2012). | • Desarrollo continuo y mantenimiento de software (Desktop + Cloud).<br>• Integración de drivers y SDKs biométricos a bajo nivel (C/FFI).<br>• Capacitación a instructores y administradores de sede.<br>• Soporte técnico preventivo y correctivo.<br>• Aseguramiento de seguridad, cifrado de minucias y auditorías. | • **Asistencia en 1 segundo:** Identificación 1:N en memoria sin digitar cédula.<br>• **Cero Fraude:** Eliminación total de suplantación en listas físicas.<br>• **100% Operativo sin Internet (*Offline-First*):** Marcación continua con SQLite local y sincronización diferida.<br>• **Alertas Tempranas de Deserción:** Cumplimiento automático del Reglamento del Aprendiz.<br>• **Ahorro de hasta 20 min por clase:** Mayor tiempo efectivo de docencia.<br>• **Cumplimiento Legal Total:** Minucias matemáticas (ISO/IEC 19794-2) bajo Ley 1581. | • **Asistencia Personalizada:** Soporte presencial durante enrolamiento inicial y despliegue.<br>• **Soporte Técnico Multicanal:** Mesa de ayuda (Help Desk), tickets y WhatsApp para coordinadores.<br>• **Autoservicio y Capacitación:** Manuales interactivos y videos cortos para instructores.<br>• **Comunidad Educativa:** Canales de retroalimentación para mejora continua. | • **Centros de Formación SENA:** Direcciones regionales, subdirectores de centro y coordinaciones académicas.<br>• **Instituciones de Educación Técnica, Tecnológica y Superior:** Universidades, institutos técnicos y tecnológicos privados o públicos.<br>• **Colegios con Modalidad Técnica y Bachillerato:** Instituciones con control estricto de asistencia.<br>• **Usuarios Secundarios (Beneficiarios):** Instructores, coordinadores y aprendices. |
| | **6. RECURSOS CLAVE** | | **3. CANALES** | |
| | • **Talento Humano:** Desarrolladores Fullstack (Electron, Node.js, Vue), ingenieros de soporte y DevOps.<br>• **Propiedad Intelectual:** Código fuente propietario, algoritmos de sincronización y plantillas biométricas.<br>• **Infraestructura Tecnológica:** Servidores API, clústeres MongoDB, bases SQLite locales.<br>• **Hardware Físico:** Dispositivos lectores ópticos DigitalPersona U.are.U 4500 de prueba y despliegue. | | • **Canal Directo Institucional:** Presentaciones B2B/B2G ante directivas y comités del SENA y universidades.<br>• **Plataforma Web y Portal Cloud:** Distribución de actualizaciones y descargas de instaladores desktop.<br>• **Capacitaciones In Situ:** Talleres presenciales de enrolamiento en salas de sistemas.<br>• **Eventos de Emprendimiento y Ruedas de Negocios:** SENA Innova, Fondo Emprender, ferias EdTech. | |
| **9. ESTRUCTURA DE COSTOS** | | | **5. FUENTES DE INGRESOS** | |
| • **Costos de Personal y Desarrollo:** Salarios de programadores, soporte técnico y mantenimiento.<br>• **Costos de Infraestructura Cloud:** Servidores en la nube (Render/AWS), bases de datos MongoDB Atlas y dominios.<br>• **Adquisición de Hardware Biométrico:** Compra e importación de sensores DigitalPersona U.are.U 4500 al por mayor.<br>• **Gastos Operativos y Legales:** Registro de marca, derechos de autor ante la DNDA, certificaciones de Habeas Data.<br>• **Costos de Capacitación y Despliegue:** Viáticos de instalación y soporte presencial en centros educativos. | | | • **Venta de Kits de Hardware Biométrico:** Venta o comodato de lectores DigitalPersona configurados y homologados.<br>• **Suscripción SaaS (Licenciamiento Anual/Mensual):** Cobro por número de fichas activas, sedes o volumen de estudiantes matriculados.<br>• **Servicios de Implementación y Parametrización Inicial:** Configuración de sedes, carga masiva de aprendices y enrolamiento inicial.<br>• **Contratos de Soporte y Mantenimiento Avanzado:** Pólizas de soporte técnico prioritario y actualizaciones evolutivas.<br>• **Financiamiento Semilla:** Convocatorias de Fondo Emprender SENA y capital de fomento TIC. | |

---

## 2. DESARROLLO DETALLADO RESPONDIENDO A CADA PREGUNTA DE LA PLANTILLA SENA

### 1. Segmentos de Clientes (Customer Segments)
* **¿Para quién estamos creando valor?**
  * Para **instituciones educativas de formación técnica, tecnológica y universitaria** (iniciando con los más de 118 centros de formación del SENA a nivel nacional).
  * Para los **equipos directivos y coordinadores académicos**, facilitándoles reportes automatizados e incontestables sobre deserción estudiantil y cumplimiento horario.
  * Para los **instructores y docentes**, devolviéndoles entre 10 y 20 minutos de formación por sesión y eliminando el desgaste de lidiar con hojas y planillas manuales.
  * Para los **aprendices/estudiantes**, garantizándoles transparencia en sus registros y un portal web ágil para consultar sus asistencias y justificar excusas médicas.
* **¿Quiénes son nuestros clientes más importantes?**
  * Directores y coordinadores académicos institucionales que toman decisiones de contratación de infraestructura tecnológica (B2B / B2G), y el área de Bienestar al Aprendiz interesada en evitar la deserción.

---

### 2. Propuesta de Valor (Value Proposition)
* **¿Qué valor entregamos al cliente?**
  * Eficiencia operativa máxima: toma de asistencia grupal en menos de 2 minutos para 35 personas (menos de 1 segundo por aprendiz).
  * Garantía de continuidad operativa: funciona **100% Offline** en el aula aunque no haya internet ni WiFi institucional.
  * Confiabilidad institucional y cero fraude: eliminación radical de la suplantación de identidad mediante huella dactilar.
* **¿Cuál de los problemas de nuestro cliente le vamos a ayudar a resolver?**
  * Pérdida de horas docentes en toma de lista manual en papel.
  * Aprendices que firman por compañeros ausentes.
  * Reportes de deserción desfasados semanas o meses, cuando ya no es posible recuperar al estudiante.
  * Pérdida o deterioro de planillas físicas y dispersión de archivos Excel no auditables.
  * Caídas de sistemas web cuando falla el internet del centro educativo.
* **¿Qué paquetes de productos y servicios ofrecemos a cada segmento?**
  * **Paquete Integral Aula (Hardware + Software Desktop):** Lector DigitalPersona U.are.U 4500 listo para usar + Aplicativo Electron con base local SQLite Offline-First.
  * **Plataforma Cloud de Gestión:** Panel administrativo en Vue 3/Quasar para coordinadores, control de fichas, reportes en Excel/PDF y seguimiento de excusas.
  * **Portal del Aprendiz:** Consulta web personal de horas acumuladas, inasistencias y radicación de excusas.
* **¿Qué necesidades del cliente estamos satisfaciendo?**
  * Puntualidad, control pedagógico, seguridad jurídica (cumplimiento Ley 1581 Habeas Data y Acuerdo 007 de 2012 Reglamento del Aprendiz) y digitalización hacia la política de "Cero Papel".

---

### 3. Canales (Channels)
* **¿A través de qué canales quieren ser contactados nuestros segmentos de cliente?**
  * Reuniones y demostraciones directas ante comités directivos y coordinaciones académicas.
  * Portal web institucional y demostraciones interactivas en vivo.
* **¿Cómo les contactamos ahora?**
  * Mediante validaciones piloto dentro del centro de formación SENA y presentación de proyectos de investigación aplicada y desarrollo tecnológico.
* **¿Cómo están integrados nuestros canales?**
  * El contacto inicial institucional conduce a un demo funcional en el aula; el cierre del acuerdo habilita el acceso a la plataforma cloud y la entrega de los lectores preconfigurados.
* **¿Cuáles funcionan mejor y son más eficaces en costos?**
  * Las demostraciones presenciales "en vivo" en las aulas demostrando la velocidad de lectura (<1 seg) y la capacidad de desconectar el cable de red y seguir registrando huellas.

---

### 4. Relaciones con los Clientes (Customer Relationships)
* **¿Qué tipo de relación espera cada segmento?**
  * Relación de **confianza técnica, estabilidad continua y respuesta inmediata** ante cualquier inconsistencia en la toma de asistencia.
* **¿Cuáles hemos establecido?**
  * Acompañamiento estrecho y personalizado durante el enrolamiento de huellas de los aprendices.
  * Canal directo de soporte vía chat institucional y tickets para instructores.
* **¿Cómo están integrados con el resto del modelo?**
  * La capacitación y el soporte aseguran que el hardware y el software se utilicen diariamente, garantizando la retención y renovación de las licencias anuales.
* **¿Cuánto cuestan?**
  * Costo moderado basado en personal técnico de soporte y manuales interactivos de autogestión.

---

### 5. Fuentes de Ingresos (Revenue Streams)
* **¿Para cuál valor están realmente dispuestos a pagar nuestros clientes?**
  * Por recuperar tiempo lectivo, erradicar fraudes de asistencia y disponer de reportes inmediatos para la toma de decisiones y auditorías de calidad educativa.
* **¿Para qué pagan actualmente?**
  * Compran planillas físicas, gastan resmas de papel, o pagan licencias de software administrativo general que no tiene biometría rápida ni opera sin internet.
* **¿Cómo preferirían pagar?**
  * Mediante un modelo flexible: **pago anual por suscripción institucional (SaaS)** o pago por kit de aula implementado.
* **¿Cuánto contribuye cada fuente de ingresos a los ingresos totales?**
  * **60%:** Suscripción anual SaaS por ficha o sede formativa.
  * **25%:** Venta / arriendo de kits de lectores biométricos homologados.
  * **15%:** Servicios de implementación, enrolamiento inicial y soporte técnico VIP.

---

### 6. Recursos Clave (Key Resources)
* **¿Qué recursos clave requiere nuestra propuesta de valor?**
  * **Recursos Físicos / Hardware:** Lectores ópticos biométricos de alta durabilidad (DigitalPersona U.are.U 4500).
  * **Recursos Intelectuales:** Algoritmos de matching 1:N en memoria, bindings nativos Koffi FFI, arquitectura Offline-First y código fuente registrado.
  * **Recursos Humanos:** Equipo de desarrollo de software (Fullstack Node.js/Vue/Electron), especialistas en base de datos y técnicos de soporte en campo.
  * **Recursos Tecnológicos:** Servicios cloud (MongoDB Atlas, Render/Docker) y entornos de integración continua.

---

### 7. Actividades Clave (Key Activities)
* **¿Qué actividades clave requiere nuestra propuesta de valor?**
  * **Desarrollo y Mejora Continua:** Actualización de la suite de software, optimización del motor biométrico y parches de seguridad.
  * **Control de Calidad y Pruebas de Estrés:** Verificación de concurrencia y pruebas de compatibilidad con sistemas operativos Windows.
  * **Capacitación y Enrolamiento:** Asesorar a los instructores líderes en la captura correcta de huellas dactilares.
  * **Gestión de la Infraestructura:** Monitoreo del uptime de los servicios backend y sincronización WebSockets.

---

### 8. Socios Clave (Key Partners)
* **¿Quiénes son nuestros socios clave?**
  * **Distribuidores oficiales de hardware biométrico (DigitalPersona / HID Global):** Para garantizar suministro de sensores con soporte y garantía.
  * **SENA (Ecosistema SENNOVA / Fondo Emprender):** Como aliado institucional, laboratorio de pruebas y fuente de capital semilla.
  * **Proveedores de Servicios en la Nube:** Plataformas de hospedaje y bases de datos que aseguran disponibilidad 24/7.
  * **Gremios y Redes de Instituciones Educativas:** Aliados para la escalabilidad comercial del software hacia universidades y colegios técnicos.

---

### 9. Estructura de Costos (Cost Structure)
* **¿Cuáles son los costos más importantes inherentes al modelo de negocio?**
  * **Desarrollo y Mantenimiento de Software:** Nómina del equipo técnico de desarrollo.
  * **Inventario de Hardware:** Costo de adquisición de los lectores biométricos DigitalPersona.
  * **Infraestructura Cloud:** Facturación mensual de servidores backend, base de datos MongoDB Atlas y certificados SSL.
  * **Legal y Operativo:** Registro de software ante la Dirección Nacional de Derecho de Autor (DNDA), patentes y asesoría legal en Habeas Data.
* **¿Qué recursos y actividades clave son los más caros?**
  * El talento humano especializado en desarrollo e integración de hardware con drivers nativos de bajo nivel, y la compra inicial de stock de lectores biométricos.
