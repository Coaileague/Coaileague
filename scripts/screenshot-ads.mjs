import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ads = [
  { file: 'angle1-pain',    title: 'Ad 1 — Pain Point' },
  { file: 'angle2-outcome', title: 'Ad 2 — Outcome'    },
  { file: 'angle3-texas',   title: 'Ad 3 — Texas'      },
];

const BASE_URL = 'http://localhost:5000/ads';
const OUT_DIR  = path.resolve(__dirname, '../client/public/ads');

const browser = await chromium.launch();

for (const ad of ads) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1080 });
  const url = `${BASE_URL}/${ad.file}.html`;
  console.log(`Screenshotting: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle' });
  // Wait an extra moment for any CSS animations to settle
  await page.waitForTimeout(800);
  const outPath = `${OUT_DIR}/${ad.file}.png`;
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  ✓ Saved → ${outPath}`);
  await page.close();
}

await browser.close();
console.log('\nAll 3 ads saved as PNG files in client/public/ads/');
