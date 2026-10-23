import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(root, 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

const INK = [0x23, 0x20, 0x19];
const CREAM = [0xfa, 0xf8, 0xf4];
const GOLD = [0xc9, 0xa1, 0x5f];

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows[y * (width * 4 + 1)] = 0;
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a, b, amount) {
  return a.map((value, index) => Math.round(value * (1 - amount) + b[index] * amount));
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return Math.hypot(x - cx, y - cy) <= radius;
}

const chart = [
  [150, 352],
  [240, 268],
  [300, 300],
  [368, 196],
];

const frame = [
  [150, 168],
  [150, 362],
  [378, 362],
];

const FRAME_COLOR = mix(INK, CREAM, 0.3);

function sample(x, y, maskable) {
  const inBackground = maskable
    ? true
    : insideRoundedRect(x, y, 8, 8, 504, 504, 104);
  if (!inBackground) return null;
  let color = INK;

  for (let i = 0; i < frame.length - 1; i += 1) {
    const [ax, ay] = frame[i];
    const [bx, by] = frame[i + 1];
    if (distanceToSegment(x, y, ax, ay, bx, by) <= 5) color = FRAME_COLOR;
  }

  for (let i = 0; i < chart.length - 1; i += 1) {
    const [ax, ay] = chart[i];
    const [bx, by] = chart[i + 1];
    if (distanceToSegment(x, y, ax, ay, bx, by) <= 15) color = CREAM;
  }

  if (Math.hypot(x - 368, y - 196) <= 26) color = GOLD;
  return color;
}

function renderIcon(size, maskable) {
  const samples = 4;
  const rgba = Buffer.alloc(size * size * 4);
  const scale = 512 / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const designX = (x + (sx + 0.5) / samples) * scale;
          const designY = (y + (sy + 0.5) / samples) * scale;
          const color = sample(designX, designY, maskable);
          if (!color) continue;
          hits += 1;
          r += color[0];
          g += color[1];
          b += color[2];
        }
      }
      const offset = (y * size + x) * 4;
      const total = samples * samples;
      rgba[offset] = hits ? Math.round(r / hits) : 0;
      rgba[offset + 1] = hits ? Math.round(g / hits) : 0;
      rgba[offset + 2] = hits ? Math.round(b / hits) : 0;
      rgba[offset + 3] = Math.round((hits / total) * 255);
    }
  }
  return encodePng(size, size, rgba);
}

const outputs = [
  ['icon-192.png', renderIcon(192, false)],
  ['icon-512.png', renderIcon(512, false)],
  ['icon-maskable-512.png', renderIcon(512, true)],
  ['icon-180.png', renderIcon(180, false)],
];

for (const [name, data] of outputs) {
  writeFileSync(path.join(iconsDir, name), data);
  console.log(`${name}: ${data.length} bytes`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#232019"/>
  <path d="M18.75 21v24.25H47.25" fill="none" stroke="#8f8a7f" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M18.75 44 30 32.5l7.5 4L46 24.5" fill="none" stroke="#faf8f4" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="46" cy="24.5" r="3.4" fill="#c9a15f"/>
</svg>
`;
writeFileSync(path.join(iconsDir, 'favicon.svg'), svg);
console.log('favicon.svg written');

// Tauri bundle icons (PNG, ICO, ICNS). Sources are committed; generated
// binaries live under src-tauri/icons and are small enough for source control.
const tauriDir = path.join(root, 'src-tauri', 'icons');
mkdirSync(tauriDir, { recursive: true });

const sizes = [
  ['32x32.png', 32],
  ['128x128.png', 128],
  ['128x128@2x.png', 256],
  ['icon.png', 512],
];

const tauriPngs = new Map();
for (const [name, size] of sizes) {
  const png = renderIcon(size, false);
  tauriPngs.set(size, png);
  writeFileSync(path.join(tauriDir, name), png);
  console.log(`${name}: ${png.length} bytes`);
}

const png256 = tauriPngs.get(256);
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
const icoEntry = Buffer.alloc(16);
icoEntry[0] = 0;
icoEntry[1] = 0;
icoEntry.writeUInt16LE(1, 4);
icoEntry.writeUInt16LE(32, 6);
icoEntry.writeUInt32LE(png256.length, 8);
icoEntry.writeUInt32LE(22, 12);
writeFileSync(path.join(tauriDir, 'icon.ico'), Buffer.concat([icoHeader, icoEntry, png256]));

const icnsEntries = [
  ['ic07', tauriPngs.get(128)],
  ['ic08', tauriPngs.get(256)],
  ['ic09', renderIcon(512, false)],
].map(([type, png]) => {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'ascii');
  header.writeUInt32BE(png.length + 8, 4);
  return Buffer.concat([header, png]);
});
const icnsBody = Buffer.concat(icnsEntries);
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns', 0, 4, 'ascii');
icnsHeader.writeUInt32BE(icnsBody.length + 8, 4);
writeFileSync(path.join(tauriDir, 'icon.icns'), Buffer.concat([icnsHeader, icnsBody]));
console.log('icon.ico and icon.icns written');
