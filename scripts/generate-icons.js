const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = crc32(crcInput);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function generatePng(size) {
  const width = size;
  const height = size;

  const rawScanlines = [];

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // Filter type 0: None

    for (let x = 0; x < width; x++) {
      const idx = 1 + x * 4;

      // Distance from center for rounded badge
      const cx = width / 2;
      const cy = height / 2;
      const r = width * 0.46;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);

      // Rounded rect shape
      const cornerR = width * 0.22;
      let inShape = false;

      if (dx <= r - cornerR && dy <= r) {
        inShape = true;
      } else if (dy <= r - cornerR && dx <= r) {
        inShape = true;
      } else {
        const cdx = dx - (r - cornerR);
        const cdy = dy - (r - cornerR);
        if (cdx > 0 && cdy > 0 && (cdx * cdx + cdy * cdy <= cornerR * cornerR)) {
          inShape = true;
        }
      }

      if (!inShape) {
        // Transparent
        row[idx] = 0;
        row[idx + 1] = 0;
        row[idx + 2] = 0;
        row[idx + 3] = 0;
        continue;
      }

      // Inside badge: gradient from indigo (99, 102, 241) to cyan (6, 182, 212)
      const t = (x + y) / (width + height);
      let red = Math.round(79 * (1 - t) + 6 * t);
      let green = Math.round(70 * (1 - t) + 182 * t);
      let blue = Math.round(229 * (1 - t) + 212 * t);
      let alpha = 255;

      // Inner link icon glyph
      // Check if pixel is within two diagonal link ovals
      const nx = (x - cx) / (width * 0.4);
      const ny = (y - cy) / (height * 0.4);

      // Diagonal rotation: u = nx + ny, v = ny - nx
      const u = (nx + ny) * 0.7071;
      const v = (ny - nx) * 0.7071;

      // Draw two interlocking ring links in white
      const ring1 = (Math.pow(u + 0.35, 2) / 0.35 + Math.pow(v, 2) / 0.12);
      const ring2 = (Math.pow(u - 0.35, 2) / 0.35 + Math.pow(v, 2) / 0.12);

      const isRing1 = ring1 >= 0.4 && ring1 <= 1.1;
      const isRing2 = ring2 >= 0.4 && ring2 <= 1.1;

      if (isRing1 || isRing2) {
        red = 255;
        green = 255;
        blue = 255;
      }

      row[idx] = red;
      row[idx + 1] = green;
      row[idx + 2] = blue;
      row[idx + 3] = alpha;
    }

    rawScanlines.push(row);
  }

  const uncompressed = Buffer.concat(rawScanlines);
  const idatData = zlib.deflateSync(uncompressed);

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // non-interlaced

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', idatData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const targetDir = path.join(__dirname, '..', 'src', 'ui', 'icons');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

[16, 32, 48, 128].forEach((size) => {
  const filePath = path.join(targetDir, `icon-${size}.png`);
  const pngBuf = generatePng(size);
  fs.writeFileSync(filePath, pngBuf);
  console.log(`Generated ${filePath} (${pngBuf.length} bytes)`);
});
