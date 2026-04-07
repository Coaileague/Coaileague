const sharp = require('sharp');
const fs = require('fs');

async function convertLogo() {
  const svgBuffer = fs.readFileSync('client/public/coaileague-logo.png');
  const sizes = [512, 384, 192, 152, 144, 128, 96, 72, 32, 16];
  
  try {
    for (const size of sizes) {
      await sharp(svgBuffer)
        .resize(size, size, { fit: 'contain', background: { r: 15, g: 23, b: 42 } })
        .png()
        .toFile(`client/public/icons/icon-${size}x${size}.png`);
      console.log(`✅ Generated icon-${size}x${size}.png`);
    }
    console.log('✅ All icons generated');
    process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
}
convertLogo();
