// Generates the PWA/app icon PNGs used by the web app manifest.
// Pure Node (zlib + hand-rolled PNG encoder) — no dependencies.
// Usage: node scripts/generate-icons.cjs [outDir]

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

// ---- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- Icon rendering ----------------------------------------------------------

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Signed distance to a rounded rectangle (outside positive).
function sdRoundedRect(px, py, half, r) {
  const qx = Math.abs(px) - (half - r);
  const qy = Math.abs(py) - (half - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

// Coverage from a signed distance (1px anti-aliasing band).
function cov(sd, px) {
  return clamp01(0.5 - (sd / px));
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const half = size * 0.5;
  const radius = half * 0.235; // corner radius
  const ringR = size * 0.26;
  const ringThickness = size * 0.105;
  const innerR = ringR - ringThickness;
  const outerR = ringR + ringThickness;
  const orbR = size * 0.075;
  const orbAngle = (5 * Math.PI) / 4; // bottom-left
  const orbX = cx + Math.cos(orbAngle) * ringR;
  const orbY = cy + Math.sin(orbAngle) * ringR;

  const stars = [
    { x: size * 0.26, y: size * 0.27, r: size * 0.02 },
    { x: size * 0.74, y: size * 0.2, r: size * 0.016 },
    { x: size * 0.78, y: size * 0.72, r: size * 0.013 },
    { x: size * 0.3, y: size * 0.76, r: size * 0.018 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      // Background: rounded square, vertical gradient.
      const sd = sdRoundedRect(px - cx, py - cy, half, radius);
      const bgCoverage = cov(sd, 1);
      const t = clamp01((py - size * 0.1) / (size * 0.8));
      const bg = [
        79 + (124 - 79) * t, // R 4f46e5 -> 7c3aed
        70 + (58 - 70) * t, // G
        229 + (237 - 229) * t, // B
      ];

      // Ring ("O").
      const ringDist = Math.hypot(px - cx, py - cy);
      let ringAlpha = 0;
      if (ringDist <= outerR && ringDist >= innerR) {
        ringAlpha = 1;
      } else if (ringDist > innerR && ringDist < outerR) {
        const band = Math.min(ringDist - innerR, outerR - ringDist);
        ringAlpha = band < 1 ? 1 - (1 - band) : 1;
        ringAlpha = clamp01(ringAlpha);
      }
      if (ringDist > innerR - 1 && ringDist < innerR) ringAlpha = clamp01(ringAlpha + (innerR - ringDist));
      if (ringDist > outerR && ringDist < outerR + 1) ringAlpha = clamp01(ringAlpha + (outerR + 1 - ringDist));

      // Orbiting dot.
      const orbDist = Math.hypot(px - orbX, py - orbY);
      const orbAlpha = cov(orbDist - orbR, 1);

      // Stars.
      let starAlpha = 0;
      for (const s of stars) {
        const d = Math.hypot(px - s.x, py - s.y);
        starAlpha = Math.max(starAlpha, cov(d - s.r, 1));
      }

      const glyphAlpha = clamp01(Math.max(ringAlpha, orbAlpha, starAlpha));

      let r = bg[0];
      let g = bg[1];
      let b = bg[2];
      let a = bgCoverage * 255;

      const glyphR = 245;
      const glyphG = 250;
      const glyphB = 255;
      r = r + (glyphR - r) * glyphAlpha;
      g = g + (glyphG - g) * glyphAlpha;
      b = b + (glyphB - b) * glyphAlpha;

      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(r);
      rgba[idx + 1] = Math.round(g);
      rgba[idx + 2] = Math.round(b);
      rgba[idx + 3] = Math.round(a);
    }
  }
  return rgba;
}

// ---- Main ---------------------------------------------------------------------

const outDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "public"));
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { file: "icon-192x192.png", size: 192 },
  { file: "icon-512x512.png", size: 512 },
];

for (const target of targets) {
  const png = encodePng(drawIcon(target.size), target.size, target.size);
  const out = path.join(outDir, target.file);
  fs.writeFileSync(out, png);
  console.log(`Wrote ${out} (${png.length} bytes)`);
}