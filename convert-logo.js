const sharp = require('sharp');
const fs = require('fs');

async function convertLogo() {
  const svgBuffer = fs.readFileSync('public/logo.svg');
  try {
    await sharp(svgBuffer, { density: 300 })
      .resize(192, 192, { fit: 'contain', background: { r: 15, g: 23, b: 42 } })
      .png()
      .toFile('public/icon-192.png');
    await sharp(svgBuffer, { density: 300 })
      .resize(512, 512, { fit: 'contain', background: { r: 15, g: 23, b: 42 } })
      .png()
      .toFile('public/icon-512.png');
    console.log('✅ Icons generated');
    process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
}
convertLogo();
