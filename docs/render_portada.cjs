const { chromium } = require('../rpa/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1240, height: 1754 },
    deviceScaleFactor: 2
  });

  const fileUrl = 'file:///' + path.resolve(__dirname, 'generar_portada.html').replace(/\\/g, '/');
  console.log('Cargando HTML de portada:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const pngPath = path.resolve(__dirname, 'portada_manual_usuario.png');
  const jpgPath = path.resolve(__dirname, 'portada_manual_usuario.jpg');

  await page.screenshot({ path: pngPath, fullPage: true });
  await page.screenshot({ path: jpgPath, fullPage: true, quality: 95, type: 'jpeg' });

  console.log('✓ Portada guardada exitosamente en:');
  console.log('  -', pngPath);
  console.log('  -', jpgPath);

  await browser.close();
})();
