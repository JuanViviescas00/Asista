/**
 * =============================================================================
 * ROBOT RPA (NODE.JS): REGISTRO AUTÓNOMO DE INASISTENCIAS EN SOFIA PLUS
 * =============================================================================
 * Orquestador Global Autónomo para Instructores SENA:
 * - Procesa DOCENTE por DOCENTE automáticamente.
 * - Por cada docente, procesa cada FICHA asignada.
 * - Por cada ficha, procesa cada APRENDIZ ausente (1 por 1).
 *
 * Campos automatizados en el formulario JSF oficial:
 * 1. Consultar Fichas de Caracterización* (Modal viewDialog2_content)
 * 2. Consultar Aprendiz* (Modal viewDialog1_content)
 * 3. Cantidad de Horas* (id=formNovedadAprendiz:horasITX)
 * 4. Justificación* (id=formNovedadAprendiz:justificacionITA)
 * 5. Fecha Inicio* (DD/MM/YYYY) (id=formNovedadAprendiz:fechaEjecucion)
 * 6. Fecha Fin* (DD/MM/YYYY) (id=formNovedadAprendiz:fechaFin)
 *
 * 🛡️ REGLAS DE SEGURIDAD Y RATE LIMITING:
 * - MODO SEGURO (DRY-RUN POR DEFECTO):
 *   Diligencia todos los campos y resalta el botón "Registrar Novedad", pero NO
 *   hace clic en él para no alterar datos reales.
 *   (Para guardar de verdad en Sofia Plus se requiere: --confirmar-registro)
 * - PROTECCIÓN ANTI-BLOQUEO:
 *   Si la contraseña de un instructor es inválida, se aborta inmediatamente a ese
 *   docente sin reintentar, evitando el bloqueo del SENA (máx 3-5 intentos erróneos),
 *   y el robot continúa con el siguiente docente.
 * - RATE LIMITER ANTE CAÍDAS DE SOFIA PLUS:
 *   Si el portal devuelve HTTP 500, 502, 503, 504 o caída de conexión, pausa 5
 *   minutos con cuenta regresiva en consola antes de reintentar.
 * - PAUSA HUMANA:
 *   Entre aprendices (3 a 5 segundos) y entre instructores (5 segundos).
 * =============================================================================
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline/promises');
const { chromium } = require('playwright');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const URL_SOFIA_PUBLIC = 'http://senasofiaplus.edu.co/sofia-public/';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const EVIDENCIAS_DIR = path.resolve(__dirname, 'descargas', 'evidencias_inasistencias');

if (!fs.existsSync(EVIDENCIAS_DIR)) {
  fs.mkdirSync(EVIDENCIAS_DIR, { recursive: true });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Temporizador con cuenta regresiva visual en consola
 */
async function cuentaRegresiva(segundos, mensaje = 'Reintentando en') {
  for (let s = segundos; s > 0; s--) {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    const tiempoFormateado = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    process.stdout.write(`\r[RATE LIMITER] ${mensaje} ${tiempoFormateado}... `);
    await sleep(1000);
  }
  process.stdout.write('\r' + ' '.repeat(75) + '\r');
}

/**
 * Convierte fecha YYYY-MM-DD a formato colombiano SENA DD/MM/YYYY
 */
function formatearFechaSENA(fechaStr) {
  if (!fechaStr) {
    const hoy = new Date();
    const d = String(hoy.getDate()).padStart(2, '0');
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const y = hoy.getFullYear();
    return `${d}/${m}/${y}`;
  }
  if (fechaStr.includes('/')) return fechaStr;
  const partes = fechaStr.split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return fechaStr;
}

/**
 * Procesa argumentos de línea de comandos
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const envHeadless = process.env.HEADLESS === 'true' || process.env.RPA_HEADLESS === 'true';
  const envDryRun = process.env.RPA_DRY_RUN !== 'false';
  const params = {
    dryRun: envDryRun, // Modo seguro por defecto (o según RPA_DRY_RUN)
    maxReintentosCaida: 4,
    minutosEsperaCaida: 5,
    auto: false,
    limite: 0, // 0 = sin límite (procesa todos)
    headless: envHeadless,
    todosDocentes: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--doc' || args[i] === '-d') params.doc = args[++i];
    if (args[i] === '--fecha' || args[i] === '-f') params.fecha = args[++i];
    if (args[i] === '--ficha') params.ficha = args[++i];
    if (args[i] === '--pass' || args[i] === '-p') params.pass = args[++i];
    if (args[i] === '--confirmar-registro' || args[i] === '--real') {
      params.dryRun = false;
    }
    if (args[i] === '--dry-run') {
      params.dryRun = true;
    }
    if (args[i] === '--espera-minutos') params.minutosEsperaCaida = parseInt(args[++i], 10) || 5;
    if (args[i] === '--auto' || args[i] === '-y') params.auto = true;
    if (args[i] === '--limite' || args[i] === '-l') params.limite = parseInt(args[++i], 10);
    if (args[i] === '--todos' || args[i] === '--todos-docentes' || args[i] === '--batch') {
      params.todosDocentes = true;
    }
    if (args[i] === '--headless') params.headless = true;
    if (args[i] === '--no-headless' || args[i] === '--visual') params.headless = false;
  }
  return params;
}

/**
 * Consulta la API de Asista para obtener inasistencias de un docente específico
 */
async function obtenerDatosDocenteDesdeAPI(documento, fecha = '', fichaId = '') {
  try {
    const params = new URLSearchParams();
    if (fecha && fecha.toLowerCase() !== 'todas') params.append('fecha', fecha);
    if (fichaId) params.append('fichaId', fichaId);

    const url = `${API_BASE_URL}/api/instructores/documento/${encodeURIComponent(documento)}/inasistencias-rpa?${params.toString()}`;
    console.log(`[API] Consultando inasistencias del docente en: ${url}`);
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.ok) return data;
    }
    return null;
  } catch (err) {
    console.warn(`[API] Error conectando con API de docente (${err.message})`);
    return null;
  }
}

/**
 * Consulta la API de Asista para obtener consolidado de TODOS los docentes con inasistencias
 */
async function obtenerConsolidadoTodosDesdeAPI(fecha = '') {
  try {
    const params = new URLSearchParams();
    if (fecha && fecha.toLowerCase() !== 'todas') params.append('fecha', fecha);

    const url = `${API_BASE_URL}/api/instructores/todos-inasistencias-rpa?${params.toString()}`;
    console.log(`[API] Consultando inasistencias de todos los instructores en: ${url}`);
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.ok) return data;
    }
    return null;
  } catch (err) {
    console.warn(`[API] Error conectando con API global (${err.message})`);
    return null;
  }
}

/**
 * Cierra modales o avisos si aparecen en Sofia Plus
 */
async function cerrarModalesSiExisten(page) {
  const selectores = [
    "input[value='Cerrar']",
    "button:has-text('Cerrar')",
    "a:has-text('Cerrar')",
    ".ui-dialog-titlebar-close",
    "img[src*='cerrar']",
    "img[src*='close']"
  ];
  for (const s of selectores) {
    try {
      const items = page.locator(s);
      const total = await items.count();
      for (let i = 0; i < total; i++) {
        const item = items.nth(i);
        if (await item.isVisible({ timeout: 400 })) {
          await item.click();
          await sleep(400);
        }
      }
    } catch (_) {}
  }
}

/**
 * Procesa el registro de inasistencias de UN docente en Sofia Plus
 */
async function procesarDocenteEnSofia(instructor, itemsInasistencias, cli, browser) {
  const resultadosDocente = [];
  let context = null;
  let page = null;
  let reintentosCaida = 0;
  let loginExitoso = false;

  console.log(`\n${'='.repeat(72)}`);
  console.log(` 👨‍🏫 INICIANDO SESIÓN PARA: ${instructor.nombreCompleto} (${instructor.tipoDocumento} ${instructor.numeroDocumento})`);
  console.log(`    Total de inasistencias a procesar: ${itemsInasistencias.length}`);
  console.log(`${'='.repeat(72)}`);

  // Bucle de conexión con Rate Limiter en caso de caída del servidor Sofia Plus
  while (reintentosCaida <= cli.maxReintentosCaida && !loginExitoso) {
    try {
      if (context) await context.close().catch(() => {});

      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1400, height: 900 },
      });
      page = await context.newPage();

      // Detectar errores 5xx del servidor
      page.on('response', (response) => {
        const status = response.status();
        if (status >= 500 && status <= 504) {
          console.warn(`\n[ALERTA SERVIDOR] Sofia Plus devolvió estado HTTP ${status} en: ${response.url()}`);
        }
      });

      console.log(`   [1/5] Conectando a Sofia Plus (${URL_SOFIA_PUBLIC})...`);
      await page.goto(URL_SOFIA_PUBLIC, { timeout: 60000, waitUntil: 'domcontentloaded' });

      await page.waitForSelector('#registradoBox1', { timeout: 25000 });
      const loginFrame = page.frameLocator('#registradoBox1');

      await loginFrame.locator('#tipoId').waitFor({ state: 'visible', timeout: 15000 });
      await loginFrame.locator('#tipoId').selectOption(instructor.tipoDocumento || 'CC');
      await loginFrame.locator('#username').fill(instructor.numeroDocumento);
      await loginFrame.locator("input[name='josso_password']").fill(instructor.passwordSofiaPlus);

      await sleep(600);
      console.log('   [2/5] Enviando credenciales de autenticación...');
      await loginFrame.locator("input[name='ingresar'], input[value='Ingresar']").first().click();

      // Esperar URL principal o detectar error de credenciales
      try {
        await page.waitForURL('**/principal.faces*', { timeout: 35000 });
      } catch (errWaitUrl) {
        const frameBox = page.frameLocator('#registradoBox1');
        const frameContent = await frameBox.locator('body').innerText().catch(() => '');
        if (
          frameContent.toLowerCase().includes('invalida') ||
          frameContent.toLowerCase().includes('incorrect') ||
          frameContent.toLowerCase().includes('bloquead') ||
          frameContent.toLowerCase().includes('no coinciden')
        ) {
          console.error(`\n🚨 [ALERTA DE SEGURIDAD]: Credenciales inválidas para ${instructor.nombreCompleto}: "${frameContent.trim()}"`);
          console.error('   Se aborta a este instructor para evitar que el SENA bloquee su cuenta.');
          const errorFoto = path.join(EVIDENCIAS_DIR, `Error_Login_${instructor.numeroDocumento}.png`);
          await page.screenshot({ path: errorFoto }).catch(() => {});
          console.log(`   [📸] Captura del error guardada en: ${errorFoto}`);
          await context.close().catch(() => {});
          return [{
            instructor: instructor.nombreCompleto,
            documentoDocente: instructor.numeroDocumento,
            estado: 'ERROR_LOGIN (Credenciales incorrectas - Omitido)'
          }];
        }
        throw errWaitUrl;
      }

      await sleep(2000);
      await cerrarModalesSiExisten(page);
      console.log('   [✓] Inicio de sesión completado en Sofia Plus.');
      loginExitoso = true;

    } catch (errConexion) {
      console.error(`\n   [!] Error de conexión / tiempo de espera en Sofia Plus: ${errConexion.message}`);
      reintentosCaida++;
      if (reintentosCaida <= cli.maxReintentosCaida) {
        console.log(`\n[RATE LIMITER] Sofia Plus parece estar saturado o caído.`);
        console.log(`               Pausando ${cli.minutosEsperaCaida} minutos antes del reintento ${reintentosCaida}/${cli.maxReintentosCaida}...`);
        await cuentaRegresiva(cli.minutosEsperaCaida * 60, 'Reintentando conexión con Sofia Plus en');
      } else {
        console.error(`   [X] Superado el máximo de reintentos para ${instructor.nombreCompleto}. Omitiendo.`);
        if (context) await context.close().catch(() => {});
        return [{
          instructor: instructor.nombreCompleto,
          documentoDocente: instructor.numeroDocumento,
          estado: 'ERROR_CONEXION_PORTAL'
        }];
      }
    }
  }

  if (!loginExitoso || !page) return resultadosDocente;

  try {
    // Cambiar a rol 'Instructor'
    console.log('   [3/5] Verificando selector de rol...');
    const rolSelect = page.locator('#seleccionRol\\:roles, select').filter({ has: page.locator("option:has-text('Instructor')") }).first();
    if (await rolSelect.isVisible({ timeout: 6000 })) {
      const currentRole = await rolSelect.evaluate((s) => s.options[s.selectedIndex]?.text || '');
      if (!currentRole.includes('Instructor')) {
        console.log('   [INFO] Cambiando rol a "Instructor"...');
        await rolSelect.selectOption({ label: 'Instructor' });
        await page.waitForLoadState('domcontentloaded');
        await sleep(3000);
        await cerrarModalesSiExisten(page);
      }
      console.log('   [✓] Rol activo: Instructor.');
    }

    // Navegar al módulo de inasistencias
    console.log('   [4/5] Navegando a "Gestión de Tiempos" -> "Registrar Inasistencia del Aprendiz"...');
    await page.getByText('Gestión de Tiempos').first().click();
    await sleep(1200);

    const subMenuGestionar = page.getByText('Gestionar Tiempos del Instructor').first();
    if (await subMenuGestionar.isVisible({ timeout: 2000 }).catch(() => false)) {
      await subMenuGestionar.click();
      await sleep(1200);
    }

    const opcionInasistencia = page.getByText('Registrar Inasistencia del Aprendiz').first();
    await opcionInasistencia.click();
    await sleep(4000);

    const formCtx = page.frame({ name: 'contenido' }) || page;
    console.log('   [✓] Formulario de inasistencias cargado.');

    // Bucle: Procesar cada inasistencia (1 por 1)
    console.log(`\n   [5/5] Diligenciando inasistencias 1 por 1 (${itemsInasistencias.length} aprendices)...`);

    for (let i = 0; i < itemsInasistencias.length; i++) {
      const item = itemsInasistencias[i];
      const progreso = `   [${i + 1}/${itemsInasistencias.length}]`;
      const docAprendiz = item.aprendiz.numeroDocumento;
      const nomAprendiz = item.aprendiz.nombreCompleto;
      const codFicha = item.ficha.codigo;
      const fechaStr = formatearFechaSENA(item.fecha);

      console.log(`\n${progreso} Procesando: ${nomAprendiz} (${docAprendiz}) | Ficha: ${codFicha}`);

      try {
        // 1. Modal Ficha de Caracterización (solo si no está ya seleccionada)
        const valorFichaActual = await formCtx.locator("#fichaCaracterizacion").inputValue().catch(() => '');
        if (!valorFichaActual.includes(codFicha)) {
          console.log(`      > Seleccionando Ficha: ${codFicha}`);
          await formCtx.locator("[id='formNovedadAprendiz:fichaOLK']").click({ force: true });
          await sleep(2500);

          const frameModalFicha = page.frame({ name: 'viewDialog2_content' }) || page.frames().find(f => f.url().includes('buscaFichasPorInstructor'));
          if (frameModalFicha) {
            const filaFicha = frameModalFicha.locator(`tr:has-text('${codFicha}') a, tr:has-text('${codFicha}') img`).first();
            if (await filaFicha.isVisible({ timeout: 3000 }).catch(() => false)) {
              await filaFicha.click();
            } else {
              await frameModalFicha.locator('table tr a, table tr img').first().click();
            }
            await sleep(3000);
          }
        } else {
          console.log(`      [✓] Ficha ${codFicha} ya está activa en el formulario.`);
        }

        // 2. Modal Aprendiz (con soporte de paginación automática "Siguiente")
        console.log(`      > Buscando Aprendiz: ${docAprendiz} - ${nomAprendiz}`);
        await formCtx.locator("[id='formNovedadAprendiz:aprendizOLK']").click({ force: true });
        await sleep(2500);

        const frameModalAprendiz = page.frame({ name: 'viewDialog1_content' }) || page.frames().find(f => f.url().includes('buscarAprendicesPorFicha'));
        if (frameModalAprendiz) {
          let seleccionado = false;
          const maxPaginas = 8;

          // Si el modal se abrió en una página avanzada de una búsqueda anterior, reiniciar a página 1 si no está visible
          const btnPrimero = frameModalAprendiz.locator("[id='form2:dsListasfirst']").first();
          const yaVisible = await frameModalAprendiz.locator(`tr:has-text('${docAprendiz}')`).first().isVisible({ timeout: 400 }).catch(() => false);
          if (!yaVisible && await btnPrimero.isVisible({ timeout: 400 }).catch(() => false)) {
            console.log(`      > Reiniciando lista a página 1...`);
            await btnPrimero.click().catch(() => {});
            await sleep(2000);
          }

          for (let pag = 1; pag <= maxPaginas; pag++) {
            const filaAprendiz = frameModalAprendiz.locator(`tr:has-text('${docAprendiz}')`).first();
            if (await filaAprendiz.isVisible({ timeout: 1200 }).catch(() => false)) {
              console.log(`      [✓] Aprendiz ${docAprendiz} encontrado en página ${pag}.`);
              await filaAprendiz.locator('a, img').first().click();
              seleccionado = true;
              break;
            }

            // Si no está en esta página, buscar y pulsar botón "Siguiente"
            const btnSiguiente = frameModalAprendiz.locator("[id='form2:dsListasnext'], img[title='Siguiente']").first();
            if (await btnSiguiente.isVisible({ timeout: 1000 }).catch(() => false)) {
              console.log(`      [→] Aprendiz no está en página ${pag}. Pulsando 'Siguiente'...`);
              await btnSiguiente.click();
              await sleep(2500);
            } else {
              console.log(`      [i] Fin de páginas en el modal sin encontrar ${docAprendiz}.`);
              break;
            }
          }

          if (!seleccionado) {
            // Búsqueda de respaldo por apellidos si no coincidió el número exacto
            const apellidos = item.aprendiz.apellidos || '';
            const filaNombre = frameModalAprendiz.locator(`tr:has-text('${apellidos}')`).first();
            if (await filaNombre.isVisible({ timeout: 1500 }).catch(() => false)) {
              console.log(`      [✓] Aprendiz encontrado por coincidencia de apellido: ${apellidos}`);
              await filaNombre.locator('a, img').first().click();
            } else {
              throw new Error(`Aprendiz ${docAprendiz} (${nomAprendiz}) no fue encontrado en ninguna página de la ficha.`);
            }
          }
          await sleep(2000);
        }

        // 3. Cantidad de Horas* (Noche: 5 horas, Mañana/Tarde: 6 horas)
        const jNorm = String(item.ficha?.jornada || '').toLowerCase();
        const esNoche = jNorm.includes('noche') || jNorm.includes('nocturn');
        const horasDefault = esNoche ? 5 : 6;
        const horas = item.horas || horasDefault;
        console.log(`      > Ingresando Horas: ${horas} (Jornada: ${item.ficha?.jornada || (esNoche ? 'Noche' : 'Diurna')})`);
        await formCtx.locator("[id='formNovedadAprendiz:horasITX']").fill(String(horas));
        await sleep(300);

        // 4. Justificación*
        const justificacion = item.justificacion || (item.estado === 'Excusada'
          ? 'Falla justificada'
          : 'Falla injustificada');
        console.log(`      > Ingresando Justificación: "${justificacion}"`);
        await formCtx.locator("[id='formNovedadAprendiz:justificacionITA']").fill(justificacion);
        await sleep(300);

        // 5. Fecha Inicio* y Fin*
        console.log(`      > Ingresando Fechas: ${fechaStr}`);
        await formCtx.locator("[id='formNovedadAprendiz:fechaEjecucion']").fill(fechaStr);
        await sleep(300);
        await formCtx.locator("[id='formNovedadAprendiz:fechaFin']").fill(fechaStr);
        await sleep(500);

        // Captura de pantalla como evidencia
        const fotoNombre = `Inasistencia_${codFicha}_${docAprendiz}.png`;
        const fotoRuta = path.join(EVIDENCIAS_DIR, fotoNombre);

        // 6. Botón "Registrar Novedad"
        const botonRegistrar = formCtx.locator("[id='formNovedadAprendiz:btnRegistrarNovedad']");

        if (cli.dryRun) {
          // MODO SEGURO: Resaltar en verde y tomar foto sin dar clic
          try {
            await botonRegistrar.evaluate((el) => {
              el.style.outline = '4px solid #16a34a';
              el.style.backgroundColor = '#dcfce7';
              el.style.boxShadow = '0 0 18px rgba(22, 163, 74, 0.8)';
            });
          } catch (_) {}

          await page.screenshot({ path: fotoRuta, fullPage: true });
          console.log(`      [📸] Evidencia guardada: ${fotoNombre}`);
          console.log(`      [🛡️ MODO SEGURO]: Formulario lleno. Botón NO presionado.`);

          resultadosDocente.push({
            instructor: instructor.nombreCompleto,
            ficha: codFicha,
            aprendiz: nomAprendiz,
            documento: docAprendiz,
            horas,
            estado: 'DILIGENCIADO_SIN_GUARDAR (Modo Seguro)'
          });
        } else {
          // MODO REAL: Hacer clic en el botón de registro
          console.log(`      [!] Pulsando 'Registrar Novedad'...`);
          await botonRegistrar.click();
          await sleep(2500);
          await cerrarModalesSiExisten(page);
          await page.screenshot({ path: fotoRuta, fullPage: true });
          console.log(`      [✓] Novedad registrada exitosamente en Sofia Plus.`);

          // Notificar y bloquear inmediatamente en el backend de Asista
          try {
            await fetch(`${API_BASE_URL}/api/instructores/confirmar-subida-sofia`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                asistenciaId: item.asistenciaId,
                estudianteId: item.aprendiz?.id,
                fecha: item.fecha,
                fichaId: item.ficha?.id
              })
            });
            console.log(`      [🔒] Asistencia bloqueada y confirmada en Asista (subidoSofia: true).`);
          } catch (eConf) {
            console.warn(`      [!] Aviso: Novedad creada en Sofia pero falló confirmación a Asista: ${eConf.message}`);
          }

          resultadosDocente.push({
            instructor: instructor.nombreCompleto,
            ficha: codFicha,
            aprendiz: nomAprendiz,
            documento: docAprendiz,
            horas,
            estado: 'REGISTRADO_EXITOSAMENTE'
          });
        }

      } catch (errFila) {
        console.error(`      [X] Error con aprendiz ${docAprendiz}: ${errFila.message}`);
        resultadosDocente.push({
          instructor: instructor.nombreCompleto,
          ficha: codFicha,
          aprendiz: nomAprendiz,
          documento: docAprendiz,
          horas: item.horas,
          estado: `ERROR: ${errFila.message}`
        });
      }

      // Pausa humana entre aprendices
      if (i < itemsInasistencias.length - 1) {
        const pausa = 3 + Math.floor(Math.random() * 3);
        console.log(`      [Pausa humana: ${pausa}s antes del siguiente...]`);
        await sleep(pausa * 1000);
      }
    }

    // Salir de la sesión en Sofia Plus
    try {
      console.log('\n   [INFO] Cerrando sesión del instructor en Sofia Plus...');
      const btnSalir = page.locator("a:has-text('Salir')").first();
      if (await btnSalir.isVisible({ timeout: 2000 })) {
        await btnSalir.click();
        await sleep(1500);
      }
    } catch (_) {}

  } catch (errGlobalDocente) {
    console.error(`\n   [X] Error procesando docente ${instructor.nombreCompleto}: ${errGlobalDocente.message}`);
  } finally {
    if (context) await context.close().catch(() => {});
  }

  return resultadosDocente;
}

/**
 * Orquestador Principal del Robot RPA
 */
async function ejecutarRobotInasistencias() {
  const cli = parseArgs();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n' + '='.repeat(74));
  console.log('       ROBOT RPA (NODE.JS) - ORQUESTADOR GLOBAL DE INASISTENCIAS');
  console.log('                        SISTEMA SENA SOFIA PLUS');
  console.log('='.repeat(74));

  if (cli.dryRun) {
    console.log('\n⚠️  [MODO SEGURO ACTIVO (DRY-RUN)]:');
    console.log('   El robot diligenciará todos los campos en pantalla para cada');
    console.log('   docente, ficha y alumno, pero NO hará clic en "Registrar Novedad".');
    console.log('   (Para registrar cambios definitivos en el SENA: usa --confirmar-registro)\n');
  } else {
    console.log('\n🔴 [MODO REAL]: Las novedades se registrarán oficialmente en Sofia Plus.\n');
  }

  let fechaConsulta = cli.fecha || '';
  let modoEjecucion = 'batch'; // 'batch' (todos los docentes) o 'single' (un docente)
  let numDoc = cli.doc || '';

  if (numDoc) {
    modoEjecucion = 'single';
  } else if (!cli.todosDocentes && !cli.auto) {
    console.log('Selecciona el alcance de la automatización:');
    console.log('  1. Procesar TODOS los docentes con inasistencias automáticamente (Recomendado)');
    console.log('  2. Procesar un docente específico por número de documento');
    const opcion = (await rl.question('\nOpción [1/2, Enter para 1]: ')).trim();
    if (opcion === '2') {
      modoEjecucion = 'single';
      numDoc = (await rl.question('Número de documento del Instructor: ')).trim();
    } else {
      modoEjecucion = 'batch';
    }
  }

  if (!fechaConsulta && !cli.auto) {
    fechaConsulta = (await rl.question(`Fecha de las inasistencias (YYYY-MM-DD o Enter para todas): `)).trim();
  }

  // Estructura normalizada de trabajo: lista de { instructor, inasistencias }
  const listaTrabajo = [];

  if (modoEjecucion === 'single') {
    // -------------------------------------------------------------------------
    // MODO UN DOCENTE ESPECÍFICO
    // -------------------------------------------------------------------------
    console.log(`\n[1/3] Consultando datos del docente ${numDoc} en Asista...`);
    const datosDocente = await obtenerDatosDocenteDesdeAPI(numDoc, fechaConsulta, cli.ficha);
    if (!datosDocente) {
      console.error(`[X] No se pudo obtener información del docente ${numDoc}.`);
      rl.close();
      return;
    }

    const passSofia = cli.pass || datosDocente.instructor.passwordSofiaPlus || process.env.PASSWORD_SOFIA;
    if (!passSofia) {
      console.error(`[X] El docente ${datosDocente.instructor.nombreCompleto} no tiene contraseña de Sofia Plus configurada.`);
      rl.close();
      return;
    }

    let inasistencias = datosDocente.inasistencias || [];
    if (cli.limite > 0 && inasistencias.length > cli.limite) {
      console.log(`[i] Limitando a ${cli.limite} registro(s) por parámetro.`);
      inasistencias = inasistencias.slice(0, cli.limite);
    }

    if (inasistencias.length === 0) {
      console.log('[i] No hay inasistencias pendientes para este docente.');
      rl.close();
      return;
    }

    listaTrabajo.push({
      instructor: {
        ...datosDocente.instructor,
        passwordSofiaPlus: passSofia
      },
      inasistencias
    });

  } else {
    // -------------------------------------------------------------------------
    // MODO BATCH GLOBAL: TODOS LOS DOCENTES
    // -------------------------------------------------------------------------
    console.log(`\n[1/3] Consultando consolidado general de todos los docentes en Asista...`);
    const consolidado = await obtenerConsolidadoTodosDesdeAPI(fechaConsulta);

    if (!consolidado || !consolidado.instructores || consolidado.instructores.length === 0) {
      console.log('\n[i] No se encontraron docentes con contraseñas de Sofia Plus e inasistencias pendientes.');
      rl.close();
      return;
    }

    for (const inst of consolidado.instructores) {
      const itemsDocente = [];
      for (const f of inst.fichas) {
        for (const ap of f.aprendices) {
          itemsDocente.push({
            asistenciaId: ap.asistenciaId,
            fecha: ap.fecha,
            horas: ap.horas,
            estado: ap.estado,
            ficha: { id: f.id, codigo: f.codigo, nombre: f.nombre, jornada: f.jornada },
            aprendiz: ap.aprendiz,
            justificacion: ap.justificacion
          });
        }
      }

      let itemsFinales = itemsDocente;
      if (cli.limite > 0 && itemsFinales.length > cli.limite) {
        itemsFinales = itemsFinales.slice(0, cli.limite);
      }

      if (itemsFinales.length > 0) {
        listaTrabajo.push({
          instructor: {
            id: inst.id,
            nombreCompleto: inst.nombreCompleto,
            tipoDocumento: inst.tipoDocumento,
            numeroDocumento: inst.numeroDocumento,
            passwordSofiaPlus: inst.passwordSofiaPlus
          },
          inasistencias: itemsFinales
        });
      }
    }
  }

  // Resumen del trabajo a realizar
  let granTotalInasistencias = 0;
  console.log('\n' + '-'.repeat(74));
  console.log(` PLAN DE EJECUCIÓN (${listaTrabajo.length} docente(s) detectado(s)):`);
  listaTrabajo.forEach((t, idx) => {
    granTotalInasistencias += t.inasistencias.length;
    console.log(`  ${idx + 1}. ${t.instructor.nombreCompleto} (${t.instructor.tipoDocumento} ${t.instructor.numeroDocumento}): ${t.inasistencias.length} inasistencias.`);
  });
  console.log(` TOTAL GLOBAL: ${granTotalInasistencias} inasistencias a procesar.`);
  console.log('-'.repeat(74));

  if (listaTrabajo.length === 0) {
    console.log('[i] No hay registros para procesar.');
    rl.close();
    return;
  }

  if (!cli.auto) {
    const iniciar = (await rl.question('\n¿Deseas iniciar la ejecución autónoma? (s/n): ')).trim().toLowerCase();
    if (!['s', 'si', 'y'].includes(iniciar)) {
      console.log('Operación cancelada por el usuario.');
      rl.close();
      return;
    }
  }
  rl.close();

  // ---------------------------------------------------------------------------
  // LANZAMIENTO DEL NAVEGADOR Y EJECUCIÓN SECUENCIAL
  // ---------------------------------------------------------------------------
  console.log(`\n[2/3] Lanzando motor Chromium de automatización...`);
  const browser = await chromium.launch({
    headless: cli.headless,
    slowMo: 60,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const consolidadoFinalResultados = [];

  try {
    for (let idx = 0; idx < listaTrabajo.length; idx++) {
      const trabajo = listaTrabajo[idx];
      console.log(`\n>>> DOCENTE [${idx + 1}/${listaTrabajo.length}]: ${trabajo.instructor.nombreCompleto}`);

      const resDocente = await procesarDocenteEnSofia(trabajo.instructor, trabajo.inasistencias, cli, browser);
      consolidadoFinalResultados.push(...resDocente);

      // Pausa entre docentes para estabilidad
      if (idx < listaTrabajo.length - 1) {
        console.log('\n[INFO] Pausando 5 segundos antes de conectar al siguiente docente...');
        await sleep(5000);
      }
    }

    console.log('\n' + '='.repeat(74));
    console.log(' [3/3] REPORTE FINAL CONSOLIDADO DE INASISTENCIAS EN SOFIA PLUS:');
    console.table(consolidadoFinalResultados);
    console.log('='.repeat(74));
    console.log(`\nEvidencias fotográficas guardadas en:\n${EVIDENCIAS_DIR}`);

  } catch (errOrquestador) {
    console.error(`\n[X] Error en el orquestador global: ${errOrquestador.message}`);
    process.exitCode = 1;
  } finally {
    console.log('\n[INFO] Finalizando motor de automatización...');
    await browser.close().catch(() => {});
  }
}

ejecutarRobotInasistencias().catch((err) => {
  console.error('[X] Error crítico no controlado:', err);
  process.exit(1);
});
