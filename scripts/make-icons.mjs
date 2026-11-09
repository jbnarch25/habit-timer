// Generates simple PNG app icons with no dependencies: dark rounded field, ring, clock hand.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function icon(size, { padding = 0 } = {}) {
  const bg = [17, 17, 20], fg = [255, 159, 67];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = size / 2, scale = (size / 2) * (1 - padding);
  const ringR = scale * 0.62, ringW = scale * 0.09;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      let col = bg;
      if (Math.abs(d - ringR) < ringW / 2) col = fg;
      // hand pointing up from center
      if (Math.abs(dx) < ringW / 2 && dy < 0 && -dy < ringR * 0.72) col = fg;
      // hand pointing right (shorter)
      if (Math.abs(dy) < ringW / 2 && dx > 0 && dx < ringR * 0.5) col = fg;
      if (d < ringW * 0.8) col = fg;
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = col[0]; raw[i + 1] = col[1]; raw[i + 2] = col[2]; raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/apple-touch-icon.png', icon(180));
writeFileSync('public/icons/icon-192.png', icon(192));
writeFileSync('public/icons/icon-512.png', icon(512));
writeFileSync('public/icons/icon-512-maskable.png', icon(512, { padding: 0.2 }));
console.log('icons written');
