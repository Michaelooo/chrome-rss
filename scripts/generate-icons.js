#!/usr/bin/env node

import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const sizes = [128, 48, 32, 16];
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const iconsDir = join(__dirname, '..', 'public', 'icons');

const bg = { r: 12, g: 26, b: 52 };
const accent = { r: 249, g: 115, b: 22 }; // #f97316
const sparkle = { r: 248, g: 250, b: 252 }; // #f8fafc

function getPixelColor(x, y, size) {
  // Normalized coordinates
  const nx = x / (size - 1);
  const ny = y / (size - 1);

  const dx = nx;
  const dy = 1 - ny;
  const r = Math.sqrt(dx * dx + dy * dy);

  const withinQuadrant = dx >= 0 && dy >= 0;

  const accentPixel =
    withinQuadrant &&
    (
      r < 0.12 ||
      Math.abs(r - 0.45) < 0.04 ||
      Math.abs(r - 0.75) < 0.04
    );

  const sparklePixel =
    Math.pow(nx - 0.82, 2) + Math.pow(ny - 0.22, 2) < Math.pow(0.06, 2);

  if (accentPixel) {
    return accent;
  }

  if (sparklePixel) {
    return sparkle;
  }

  return bg;
}

function createPngData(size) {
  const bytesPerPixel = 4;
  const raw = Buffer.alloc((bytesPerPixel * size + 1) * size);

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * bytesPerPixel + 1);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const { r, g, b } = getPixelColor(x, y, size);
      const offset = rowStart + 1 + x * bytesPerPixel;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); // width
  header.writeUInt32BE(size, 4); // height
  header[8] = 8; // bit depth
  header[9] = 6; // color type RGBA
  header[10] = 0; // compression
  header[11] = 0; // filter
  header[12] = 0; // interlace

  const compressed = zlib.deflateSync(raw);

  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const chunks = [
    createChunk('IHDR', header),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0)),
  ];

  return Buffer.concat([pngSignature, ...chunks]);
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuffer, data]);
  const crc = crc32(toCrc);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return ~crc;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

async function main() {
  await mkdir(iconsDir, { recursive: true });
  await Promise.all(
    sizes.map(async (size) => {
      const data = createPngData(size);
      const file = join(iconsDir, `icon-${size}.png`);
      await writeFile(file, data);
      console.log(`Generated ${file}`);
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
