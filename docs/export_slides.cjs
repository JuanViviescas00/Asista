const { chromium } = require('../rpa/node_modules/playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const slidesDir = path.resolve(__dirname, 'slides_img');
  if (!fs.existsSync(slidesDir)) fs.mkdirSync(slidesDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ 
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2 // 2x sharp rendering for pristine presentation quality
  });
  
  const fileUrl = 'file:///' + path.resolve(__dirname, 'presentacion_asista.html').replace(/\\/g, '/');
  console.log('Loading:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  // Hide the floating bottom-nav buttons and top progress bar for clean presentation export
  await page.addStyleTag({
    content: '.bottom-nav, .progress-bar-container { display: none !important; }'
  });

  const totalSlides = await page.evaluate(() => document.querySelectorAll('.slide').length);
  console.log('Total slides detected:', totalSlides);

  for (let i = 0; i < totalSlides; i++) {
    await page.evaluate((idx) => updateDeck(idx), i);
    await page.waitForTimeout(400);
    const num = String(i + 1).padStart(2, '0');
    const outPath = path.join(slidesDir, `slide_${num}.png`);
    await page.screenshot({ path: outPath, type: 'png' });
    console.log(`Rendered slide ${num} / ${totalSlides}`);
  }

  await browser.close();
  console.log('Finished capturing all slide images!');
})();
