# Instalar el Huellero en una PC nueva (modo desarrollo)

Guía para clonar y correr la app del huellero en una computadora que
nunca la ha tenido instalada. Si lo que necesitas es el instalador
`.exe` empaquetado para un aula real, consulta la sección de
Empaquetado en `CONTEXTO_HUELLERO.md` — esta guía es para desarrollo/
pruebas con `npm run dev`.

## Prerrequisitos

1. **Node.js** (versión LTS reciente) — https://nodejs.org
2. **Git**

## Pasos

### 1. Clonar el repositorio

```powershell
git clone https://github.com/ivanrene86/HuelleroActualizado.git
cd HuelleroActualizado
```

### 2. Instalar el driver del lector y el Visual C++ Redistributable

**Importante**: el instalador `.exe` empaquetado hace esto
automáticamente y en silencio. En modo desarrollo (`npm run dev`) hay
que hacerlo a mano, porque ese paso solo corre dentro del instalador
final.

Ambos archivos ya están dentro del repo:

huellero/build/driver/setup-x64.msi ← driver del lector (HID Global)
huellero/build/vcredist/vc_redist.x64.exe ← Visual C++ Redistributable


Instálalos (doble clic, o desde consola):

```powershell
msiexec /i "huellero\build\driver\setup-x64.msi"
huellero\build\vcredist\vc_redist.x64.exe
```

### 3. Instalar las dependencias del huellero

```powershell
cd huellero
npm install
```

### 4. Configurar a qué backend se conecta (si aplica)

Si el backend corre en **otra PC** (no en esta misma máquina), hay
que decirle al huellero dónde está. La app crea su propio
`config.json` la primera vez que arranca, con los valores por
defecto (`127.0.0.1:3000`, es decir, "el backend está en esta misma
PC"). Si ese no es tu caso, edita los `DEFAULTS` en
`huellero/src/main/config.js` (backendUrl/wsUrl) con la IP real del
servidor **antes** de arrancar la app por primera vez.

### 5. Arrancar la app

```powershell
npm run dev
```

La primera vez, la app se registra sola como dispositivo nuevo y
queda en espera: "Equipo registrado. Esperando aprobación del
administrador."

### 6. Aprobar el dispositivo

Desde el navegador, entra al Dashboard como Administrador →
**Dispositivos** → sección **"⏳ Pendientes de aprobación"** → busca
este equipo → **Aprobar**.

### 7. Confirmar que el lector funciona

Revisa la consola de la terminal — deberías ver:

[fingerprint] dpfj.dll cargado exitosamente desde: ...
[capture] Capacidades del lector: ...


Sin ningún error de "no se pudo cargar" ni "Failed to load shared
library". Coloca un dedo real en el lector para confirmar que la luz
enciende y captura correctamente.

## Solución de problemas comunes

### La luz del lector no enciende / error "No se pudo cargar dpfpdd.dll de ninguna ubicación"

Casi siempre significa que falta el **Visual C++ Redistributable x64**
(paso 2) — instálalo y reinicia la app. El mensaje de error del propio
código ya lo indica directamente.

### "HELLO rechazado: PENDING_APPROVAL" en bucle

Es el comportamiento esperado la primera vez (ver paso 6) — no es un
error, solo falta que un Administrador apruebe el dispositivo nuevo
desde el Dashboard.
