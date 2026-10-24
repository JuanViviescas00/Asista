/**
 * =============================================================================
 * ROBOT RPA (NODE.JS): INICIO DE SESIÓN DE DOCENTES EN SOFIA PLUS
 * =============================================================================
 * Este robot automatiza el acceso oficial a la plataforma SENA Sofia Plus
 * (senasofiaplus.edu.co/sofia-public/) utilizando Playwright en Node.js.
 * 
 * Capacidades Principales:
 * 1. Conexión directa a la API de Asista/Huellero para obtener las credenciales
 *    cifradas del docente descifradas de forma segura por el backend.
 * 2. Soporte para parámetros por consola (--doc, --tipo, --pass) o variables .env.
 * 3. Evasión de bloqueos básicos de WAF (user-agent y flags de automatización).
 * 4. Interacción con iframe (#registradoBox1) y control de autenticación JOSSO.
 * =============================================================================
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline/promises');
const { chromium } = require('playwright');

// Cargar variables de entorno desde .env
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const URL_SOFIA_PUBLIC = 'http://senasofiaplus.edu.co/sofia-public/';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Consulta las credenciales del docente desde el backend del Huellero
 */
async function consultarCredencialesDesdeAPI(numeroDocumento, tokenJwt = '') {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (tokenJwt) {
      headers['Authorization'] = `Bearer ${tokenJwt}`;
    }
    const url = `${API_BASE_URL}/api/instructores/documento/${encodeURIComponent(numeroDocumento)}/credenciales-sofia`;
    const resp = await fetch(url, { headers });
    
    if (resp.ok) {
      const data = await resp.json();
      if (data.ok && data.passwordSofiaPlus) {
        return {
          tipoDocumento: data.tipoDocumento || 'CC',
          numeroDocumento: data.numeroDocumento,
          password: data.passwordSofiaPlus,
          nombreCompleto: data.nombreCompleto || ''
        };
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Procesa argumentos de línea de comandos
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--doc' || args[i] === '-d') params.doc = args[++i];
    if (args[i] === '--tipo' || args[i] === '-t') params.tipo = args[++i];
    if (args[i] === '--pass' || args[i] === '-p') params.pass = args[++i];
    if (args[i] === '--token') params.token = args[++i];
  }
  return params;
}

/**
 * Obtiene credenciales priorizando:
 * 1. Parámetros CLI
 * 2. API de Asista/Huellero
 * 3. Archivo .env
 * 4. Pregunta interactiva
 */
async function obtenerCredenciales() {
  const cli = parseArgs();

  let tipoDoc = cli.tipo || process.env.TIPO_DOCUMENTO || 'CC';
  let numDoc = cli.doc || process.env.NUMERO_DOCUMENTO || '';
  let password = cli.pass || process.env.PASSWORD_SOFIA || '';
  let nombreDocente = '';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  if (!numDoc) {
    console.log('\n============================================================');
    console.log('   ROBOT RPA (NODE.JS) - INGRESO DOCENTE A SOFIA PLUS');
    console.log('============================================================');
    tipoDoc = (await rl.question(`Tipo de documento (CC, TI, CE, PEP) [Enter para ${tipoDoc}]: `)).trim().toUpperCase() || tipoDoc;
    numDoc = (await rl.question('Número de documento del instructor: ')).trim();
  }

  // Intentar consultar credenciales desde la API del backend si no se pasó clave
  if (numDoc && !password) {
    console.log(`\n[i] Consultando credenciales en la API del backend para el documento ${numDoc}...`);
    const desdeApi = await consultarCredencialesDesdeAPI(numDoc, cli.token);
    if (desdeApi) {
      tipoDoc = desdeApi.tipoDocumento;
      password = desdeApi.password;
      nombreDocente = desdeApi.nombreCompleto;
      console.log(`[✓] Credenciales recuperadas y descifradas con éxito para: ${nombreDocente || numDoc}`);
    } else {
      console.log('[-] No se pudieron obtener automáticamente de la API (servidor apagado o clave no configurada en el perfil).');
    }
  }

  // Si aún no hay clave, solicitarla
  if (!password) {
    password = (await rl.question('Contraseña de Sofia Plus: ')).trim();
  }

  rl.close();

  return { tipoDoc, numDoc, password, nombreDocente };
}

/**
 * Flujo de automatización con Playwright en Node.js
 */
async function iniciarSesionSofia(tipoDoc, numDoc, password, nombreDocente = '') {
  console.log('\n[1/5] Iniciando motor Chromium con Playwright (Node.js)...');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
  });

  const page = await context.newPage();

  try {
    console.log(`[2/5] Navegando a portal público: ${URL_SOFIA_PUBLIC}`);
    await page.goto(URL_SOFIA_PUBLIC, { timeout: 45000, waitUntil: 'domcontentloaded' });

    console.log('[3/5] Localizando iframe de autenticación (#registradoBox1)...');
    await page.waitForSelector('#registradoBox1', { timeout: 20000 });
    const loginFrame = page.frameLocator('#registradoBox1');

    await loginFrame.locator('#tipoId').waitFor({ state: 'visible', timeout: 15000 });
    console.log('[✓] Formulario de autenticación localizado.');

    console.log(`[4/5] Diligenciando credenciales (${tipoDoc} - ${numDoc}${nombreDocente ? ` | ${nombreDocente}` : ''})...`);
    await loginFrame.locator('#tipoId').selectOption(tipoDoc);
    await loginFrame.locator('#username').fill(numDoc);
    await loginFrame.locator('input[name="josso_password"]').fill(password);

    await sleep(800);

    console.log('[5/5] Enviando formulario (clic en "INGRESAR")...');
    await loginFrame.locator('input[value="Ingresar"]').click();

    console.log('[i] Esperando respuesta del servidor de autenticación...');
    await sleep(4000);

    const contenido = await page.content();
    const contenidoLower = contenido.toLowerCase();

    if (contenidoLower.includes('bloqueado') || contenidoLower.includes('incorrecta') || contenidoLower.includes('no coinciden')) {
      console.warn('\n[!] ADVERTENCIA: Sofia Plus reportó error en las credenciales ingresadas o cuenta bloqueada.');
    } else {
      console.log('\n[✓] ¡Petición de inicio de sesión procesada exitosamente en Sofia Plus!');
      console.log('    La sesión del docente está activa en la ventana del navegador.');
    }

    console.log('\n>>> Presiona ENTER en esta consola cuando desees cerrar el navegador y finalizar el RPA...');
    const rlFin = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rlFin.question('');
    rlFin.close();

  } catch (err) {
    console.error(`\n[X] Error durante la ejecución del robot: ${err.message}`);
  } finally {
    console.log('[i] Cerrando navegador...');
    await browser.close();
  }
}

// Punto de entrada principal
(async () => {
  try {
    const { tipoDoc, numDoc, password, nombreDocente } = await obtenerCredenciales();
    if (!numDoc || !password) {
      console.error('[X] Error: Número de documento y contraseña son obligatorios para ingresar.');
      process.exit(1);
    }
    await iniciarSesionSofia(tipoDoc, numDoc, password, nombreDocente);
  } catch (e) {
    console.error('[X] Error fatal:', e.message);
    process.exit(1);
  }
})();
