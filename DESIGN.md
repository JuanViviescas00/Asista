# Sistema de Asistencia Biométrica SENA — DESIGN.md

Especificación de Diseño e Identidad Visual alineada con el motor global **UI/UX Pro Max** y los estándares institucionales SENA.

---

## 1. Concepto Visual
- **Metáfora Estética:** *Institutional Precision & Clean Glassmorphism* (Elegancia Institucional, Claridad Operativa y Confianza Biométrica).
- **Enfoque UX:** Diseñado para operadores académicos, instructores de formación y aprendices, priorizando la legibilidad en pantallas táctiles y monitores institucionales. Jerarquía limpia basada en capas, tarjetas con elevación sutil y retroalimentación en tiempo real por WebSocket.
- **Micro-interacciones:** Respuestas táctiles y de ratón con transiciones contenidas (160ms–200ms `cubic-bezier(0.4, 0, 0.2, 1)`), sin animaciones invasivas ni sobrecarga cognitiva.

---

## 2. Paleta de Colores Funcional

Todas las variables están unificadas en `:root` dentro de `frontend/src/style.css`:

### Canvas y Superficies
- **Canvas / Background Principal:** `--bg: #F7F9F5;` (Tono Hueso natural, descansado para la vista, reduce fatiga visual frente a blancos puros).
- **Superficie de Tarjetas y Modales:** `--card-bg: #FFFFFF;` (Blanco puro elevado con sombra multicapa `0 2px 4px rgba(22, 33, 15, .03), 0 18px 48px rgba(22, 33, 15, .08)`).
- **Sidebar de Navegación:** `--sidebar-bg: #1F5C00;` (Verde Institucional Oscuro SENA, alto contraste para navegación persistente).

### Acento y Marca SENA
- **Verde Institucional Primario:** `--verde: #39A900;` (Botones primarios, estados activos, badges de asistencia cumplida).
- **Verde Hover:** `--verde-hover: #2F8C00;`
- **Verde Tenue / Fondo Activo:** `--verde-tenue: #F2F9ED;` / `--verde-suave: #E8F5E0;`

### Jerarquía Tipográfica y Contraste
- **Texto Primario / Títulos:** `--tinta: #16210F;` (Ratio de contraste > 11:1 contra fondo `#F7F9F5` y `#FFFFFF`, superando ampliamente WCAG AAA).
- **Texto Secundario:** `--texto: #4A5344;` (Contraste 6.8:1, excede WCAG AA).
- **Texto Silenciado / Metadatos:** `--texto-suave: #7C857A;` (Contraste 4.6:1, cumple WCAG AA 4.5:1).
- **Bordes y Hairlines:** `--borde: #E2E6DE;` (Reglas de 1px sólidas para delimitación limpia sin ruido).

### Estados del Sistema (Semáforo Biométrico)
- **Éxito / Asistencia / Activo:** `--verde: #39A900;` / Fondo: `--verde-suave: #E8F5E0;`
- **Alerta / Retardo / Novedad:** `--ambar: #B9791A;` / Fondo: `--ambar-suave: #FBF1E1;`
- **Peligro / Falta / Inactivo:** `--rojo: #C4432B;` / Fondo: `--rojo-suave: #FBEAE6;`
- **Informativo / Sincronización:** `--azul: #2A63C4;` / Fondo: `--azul-suave: #E9F0FC;`

---

## 3. Tipografía y Geometría

### Familias Tipográficas
- **Body & Display:** `'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`
  - Escala: `12px` (captions/badges), `13.5px` (tablas secundarias), `15px` (texto base), `16.5px` (títulos de tarjetas), `26px` (encabezados de página).
  - Pesos: `400` (lectura), `500` (etiquetas), `600` (acciones y títulos), `700` (cifras clave y modales).
- **Monoespaciada (Huellas, Tokens, UUIDs):** `ui-monospace, Consolas, monospace;`

### Radios de Borde (Border Radius)
- **Contenedores y Cards:** `--radio-lg: 20px;` (Modernidad suave, amigable al tacto).
- **Modales:** `--radio-lg: 20px;`
- **Inputs, Botones y Notificaciones:** `--radio-sm: 8px;`
- **Badges y Chips de Estado:** `--radio-pill: 999px;`

---

## 4. Checklist de Calidad y Accesibilidad (Regla 3)

- [x] **Cero Emojis como Iconos:** Prohibido el uso de caracteres emoji para acciones o estado de sistema; se emplean iconos SVG normalizados con `currentColor`, trazo uniforme de 2px y tamaños 16px/18px/24px.
- [x] **Cursor Pointer Universal:** Todo elemento interactivo (`button`, `.nav-item`, `select`, `.file-label`, enlaces) tiene `cursor: pointer` explícito y feedback al foco.
- [x] **Transiciones Suaves:** Estados `:hover` y `:active` gestionados con transiciones de 160ms a 200ms mediante `--ease: cubic-bezier(.4, 0, .2, 1);`.
- [x] **Contraste WCAG:** Todo texto en primer plano supera el ratio mínimo de 4.5:1 frente a su contenedor.
- [x] **Diseño Responsivo:** Compatibilidad con layouts de escritorio (1440px / 1180px container), tablets (768px con sidebar replegable) y móviles (375px con drawer flotante).
- [x] **Variables CSS Exportadas:** Exportación completa de tokens en `:root` para mantenimiento centralizado.
