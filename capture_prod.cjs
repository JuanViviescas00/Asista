const { chromium } = require('./rpa/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'docs', 'capturas_manual');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

(async () => {
  console.log('--- Iniciando captura rigurosa de vistas de producción ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();

  // 1. LOGIN PERSONAL
  console.log('1. Login Personal...');
  await page.goto('https://asista.onrender.com', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, '01_login_personal.png') });

  // 2. LOGIN APRENDIZ
  console.log('2. Login Consulta Aprendiz...');
  const btnCarnetAprendiz = await page.$('.login-carnet:has-text("Aprendiz")');
  if (btnCarnetAprendiz) {
    await btnCarnetAprendiz.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '02_login_aprendiz.png') });
  }

  // 3. RECUPERAR
  console.log('3. Recuperar contraseña...');
  const btnCarnetInstructor = await page.$('.login-carnet:has-text("Instructor")');
  if (btnCarnetInstructor) await btnCarnetInstructor.click();
  await page.waitForTimeout(500);
  const linkRecuperar = await page.$('.login-recovery-link a');
  if (linkRecuperar) {
    await linkRecuperar.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03_recuperar_password.png') });
  }

  // 4. AUTENTICAR COMO ADMIN
  console.log('4. Autenticando Admin...');
  await page.goto('https://asista.onrender.com', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'senahuellero@gmail.com');
  await page.fill('input[type="password"]', 'sena2026ADSO');
  await page.click('button.login-button');
  await page.waitForTimeout(4000);

  // Capturar Perfil
  await page.screenshot({ path: path.join(OUTPUT_DIR, '04_admin_perfil.png') });
  console.log('✓ 04_admin_perfil.png');

  // Vistas a navegar mediante .nav-item
  const vistas = [
    { text: 'Instructores', file: '05_admin_instructores.png' },
    { text: 'Aprendices', file: '06_admin_aprendices.png' },
    { text: 'Fichas', file: '07_admin_fichas.png' },
    { text: 'Dispositivos', file: '08_admin_dispositivos.png' },
    { text: 'Importar', file: '09_admin_importar.png' },
    { text: 'Reportes', file: '10_admin_reportes.png' },
    { text: 'Seguimiento', file: '11_admin_seguimiento.png' },
    { text: 'Días Inhabilitados', file: '12_admin_dias_festivos.png' },
  ];

  for (const v of vistas) {
    console.log(`Navegando a ${v.text}...`);
    try {
      const item = await page.$(`.nav-item:has-text("${v.text}")`);
      if (item) {
        await item.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(OUTPUT_DIR, v.file) });
        console.log(`✓ ${v.file}`);
      } else {
        console.warn(`No se encontró .nav-item:has-text("${v.text}")`);
      }
    } catch (e) {
      console.error(`Error en ${v.text}:`, e.message);
    }
  }

  // 5. APRENDIZ REAL (Maria Elena Pineda - 1100968617)
  console.log('5. Accediendo al Panel de Aprendiz...');
  const pageEst = await context.newPage();
  await pageEst.goto('https://asista.onrender.com', { waitUntil: 'networkidle' });
  const cEst = await pageEst.$('.login-carnet:has-text("Aprendiz")');
  if (cEst) await cEst.click();
  await pageEst.waitForTimeout(500);
  await pageEst.fill('input[type="text"]', '1100968617');
  await pageEst.click('button.login-button');
  await pageEst.waitForTimeout(4000);
  await pageEst.screenshot({ path: path.join(OUTPUT_DIR, '13_panel_aprendiz.png') });
  console.log('✓ 13_panel_aprendiz.png');

  // Si existe modal o botón para radicar excusa en el panel de estudiante
  const btnRadicar = await pageEst.$('button:has-text("Radicar"), button:has-text("Excusa"), .btn-excusa');
  if (btnRadicar) {
    console.log('Abriendo modal de radicación de excusa...');
    await btnRadicar.click();
    await pageEst.waitForTimeout(1500);
    await pageEst.screenshot({ path: path.join(OUTPUT_DIR, '14_modal_radicar_excusa.png') });
    console.log('✓ 14_modal_radicar_excusa.png');
  }

  await browser.close();
  console.log('--- ¡Captura completada con éxito! ---');
})();
