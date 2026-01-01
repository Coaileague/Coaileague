import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ICON_SIZES = [16, 32, 72, 96, 128, 144, 152, 192, 384, 512];
const OUTPUT_DIR = 'client/public/icons';
const OG_IMAGE_PATH = 'client/public/og-image.png';

async function generateIcons() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="80" fill="url(#grad)"/>
      <text x="256" y="340" font-family="Arial, sans-serif" font-size="280" font-weight="bold" fill="white" text-anchor="middle">C</text>
    </svg>
  `;

  for (const size of ICON_SIZES) {
    const outputPath = join(OUTPUT_DIR, `icon-${size}x${size}.png`);
    await sharp(Buffer.from(svgIcon))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated ${outputPath}`);
  }

  const ogSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#1e293b;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <rect x="60" y="180" width="120" height="120" rx="24" fill="url(#accent)"/>
      <text x="120" y="268" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="white" text-anchor="middle">C</text>
      <text x="220" y="260" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="white">CoAIleague</text>
      <text x="60" y="360" font-family="Arial, sans-serif" font-size="36" fill="#94a3b8">AI-Powered Workforce Management</text>
      <text x="60" y="420" font-family="Arial, sans-serif" font-size="24" fill="#64748b">Autonomous scheduling • GPS tracking • Payroll automation</text>
      <rect x="60" y="500" width="200" height="50" rx="8" fill="url(#accent)"/>
      <text x="160" y="535" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="white" text-anchor="middle">Start Free Trial</text>
    </svg>
  `;

  await sharp(Buffer.from(ogSvg))
    .resize(1200, 630)
    .png()
    .toFile(OG_IMAGE_PATH);
  console.log(`Generated ${OG_IMAGE_PATH}`);

  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
