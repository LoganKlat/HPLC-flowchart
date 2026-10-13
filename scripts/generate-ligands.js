const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// PNG encoder helper
function createPng(width, height, drawFn) {
  const img = Buffer.alloc(width * height * 4);
  drawFn(img, width, height);
  const raw = Buffer.alloc(height * (1 + width * 4));
  let pos = 0;
  for (let y = 0; y < height; y++) {
    raw[pos++] = 0;
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        raw[pos++] = img[(y * width + x) * 4 + c];
      }
    }
  }
  const compressed = zlib.deflateSync(raw);
  function crc32(type, data) {
    let c = 0xffffffff;
    const table = [];
    for (let n = 0; n < 256; n++) {
      let curr = n;
      for (let k = 0; k < 8; k++) curr = (curr & 1) ? (0xedb88320 ^ (curr >>> 1)) : (curr >>> 1);
      table[n] = curr;
    }
    const full = Buffer.concat([Buffer.from(type), data]);
    for (let i = 0; i < full.length; i++) c = table[(c ^ full[i]) & 0xff] ^ (c >>> 8);
    const res = Buffer.alloc(4);
    res.writeUInt32BE((c ^ 0xffffffff) >>> 0);
    return res;
  }
  function chunk(type, data) {
    const res = Buffer.alloc(12 + data.length);
    res.writeUInt32BE(data.length, 0);
    res.write(type, 4);
    data.copy(res, 8);
    crc32(type, data).copy(res, 8 + data.length);
    return res;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function setPixel(img, w, h, x, y, r, g, b, a) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const idx = (y * w + x) * 4;
  const srcA = a / 255;
  const dstA = img[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA > 0) {
    img[idx] = Math.round((r * srcA + img[idx] * dstA * (1 - srcA)) / outA);
    img[idx + 1] = Math.round((g * srcA + img[idx + 1] * dstA * (1 - srcA)) / outA);
    img[idx + 2] = Math.round((b * srcA + img[idx + 2] * dstA * (1 - srcA)) / outA);
    img[idx + 3] = Math.round(outA * 255);
  }
}

function drawLine(img, w, h, x0, y0, x1, y1, r, g, b, a = 255, strokeWidth = 3) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const steps = Math.ceil(len * 2);
  const half = (strokeWidth - 1) / 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x0 + dx * t;
    const cy = y0 + dy * t;
    for (let ox = -half; ox <= half; ox += 0.5) {
      for (let oy = -half; oy <= half; oy += 0.5) {
        if (Math.hypot(ox, oy) <= half + 0.2) {
          const px = Math.round(cx + ox);
          const py = Math.round(cy + oy);
          setPixel(img, w, h, px, py, r, g, b, a);
        }
      }
    }
  }
}

function drawCircle(img, w, h, cx, cy, radius, r, g, b, a = 255, fill = true, strokeWidth = 2) {
  const minX = Math.floor(cx - radius - strokeWidth);
  const maxX = Math.ceil(cx + radius + strokeWidth);
  const minY = Math.floor(cy - radius - strokeWidth);
  const maxY = Math.ceil(cy + radius + strokeWidth);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      if (fill) {
        if (dist <= radius) {
          setPixel(img, w, h, x, y, r, g, b, a);
        } else if (dist <= radius + 1) {
          const alpha = Math.max(0, 1 - (dist - radius)) * a;
          setPixel(img, w, h, x, y, r, g, b, Math.round(alpha));
        }
      } else {
        const d = Math.abs(dist - radius);
        if (d <= strokeWidth / 2) {
          setPixel(img, w, h, x, y, r, g, b, a);
        } else if (d <= strokeWidth / 2 + 1) {
          const alpha = Math.max(0, 1 - (d - strokeWidth / 2)) * a;
          setPixel(img, w, h, x, y, r, g, b, Math.round(alpha));
        }
      }
    }
  }
}

function drawHexagon(img, w, h, cx, cy, r, cr, cg, cb) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 - 90) * Math.PI / 180;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  for (let i = 0; i < 6; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % 6];
    drawLine(img, w, h, p1.x, p1.y, p2.x, p2.y, cr, cg, cb, 255, 3.5);
    drawCircle(img, w, h, p1.x, p1.y, 3, cr + 20, cg + 20, cb + 20, 255);
  }
}

function drawBaseSubstrate(img, w, h) {
  for (let y = 285; y < 330; y++) {
    for (let x = 20; x < w - 20; x++) {
      setPixel(img, w, h, x, y, 22, 60, 48, 220);
    }
  }
  drawLine(img, w, h, 20, 285, w - 20, 285, 45, 140, 115, 255, 3);
  drawCircle(img, w, h, 140, 260, 12, 190, 140, 50, 255);
  drawCircle(img, w, h, 140, 260, 7, 250, 220, 130, 255);
  drawLine(img, w, h, 65, 260, 128, 260, 180, 50, 50, 240, 3);
  drawCircle(img, w, h, 65, 260, 8, 220, 60, 60, 255);
  drawLine(img, w, h, 152, 260, 215, 260, 180, 50, 50, 240, 3);
  drawCircle(img, w, h, 215, 260, 8, 220, 60, 60, 255);
  drawLine(img, w, h, 140, 272, 140, 285, 180, 50, 50, 240, 3);
  drawLine(img, w, h, 140, 248, 140, 230, 60, 180, 145, 255, 3.5);
}

const ligandDefs = {
  c18: {
    name: 'C18',
    draw: (img, w, h) => {
      drawBaseSubstrate(img, w, h);
      let curX = 140, curY = 230;
      const stepY = (230 - 35) / 17;
      for (let i = 0; i < 17; i++) {
        const nextX = (i % 2 === 0) ? 165 : 115;
        const nextY = 230 - (i + 1) * stepY;
        drawLine(img, w, h, curX, curY, nextX, nextY, 40, 160, 125, 255, 3.5);
        drawCircle(img, w, h, curX, curY, 2.5, 75, 215, 175, 255);
        curX = nextX;
        curY = nextY;
      }
      drawCircle(img, w, h, curX, curY, 5, 250, 210, 100, 255);
    }
  },
  c8: {
    name: 'C8',
    draw: (img, w, h) => {
      drawBaseSubstrate(img, w, h);
      let curX = 140, curY = 230;
      const stepY = (230 - 120) / 7;
      for (let i = 0; i < 7; i++) {
        const nextX = (i % 2 === 0) ? 165 : 115;
        const nextY = 230 - (i + 1) * stepY;
        drawLine(img, w, h, curX, curY, nextX, nextY, 40, 160, 125, 255, 3.5);
        drawCircle(img, w, h, curX, curY, 2.5, 75, 215, 175, 255);
        curX = nextX;
        curY = nextY;
      }
      drawCircle(img, w, h, curX, curY, 5, 250, 210, 100, 255);
    }
  },
  c4: {
    name: 'C4',
    draw: (img, w, h) => {
      drawBaseSubstrate(img, w, h);
      let curX = 140, curY = 230;
      const stepY = (230 - 165) / 3;
      for (let i = 0; i < 3; i++) {
        const nextX = (i % 2 === 0) ? 165 : 115;
        const nextY = 230 - (i + 1) * stepY;
        drawLine(img, w, h, curX, curY, nextX, nextY, 40, 160, 125, 255, 3.5);
        drawCircle(img, w, h, curX, curY, 2.5, 75, 215, 175, 255);
        curX = nextX;
        curY = nextY;
      }
      drawCircle(img, w, h, curX, curY, 5, 250, 210, 100, 255);
    }
  },
  c30: {
    name: 'C30',
    draw: (img, w, h) => {
      drawBaseSubstrate(img, w, h);
      let curX = 140, curY = 230;
      const stepY = (230 - 25) / 29;
      for (let i = 0; i < 29; i++) {
        const nextX = (i % 2 === 0) ? 162 : 118;
        const nextY = 230 - (i + 1) * stepY;
        drawLine(img, w, h, curX, curY, nextX, nextY, 40, 160, 125, 255, 2.8);
        curX = nextX;
        curY = nextY;
      }
      drawCircle(img, w, h, curX, curY, 5, 250, 210, 100, 255);
    }
  },
  c18aq: {
    name: 'C18aq',
    draw: (img, w, h) => {
      drawBaseSubstrate(img, w, h);
      drawLine(img, w, h, 140, 230, 140, 210, 60, 180, 145, 255, 3.5);
      drawCircle(img, w, h, 140, 205, 10, 45, 180, 230, 255);
      drawCircle(img, w, h, 140, 205, 5, 255, 255, 255, 255);
      let curX = 140, curY = 195;
      const stepY = (195 - 40) / 15;
      for (let i = 0; i < 15; i++) {
        const nextX = (i % 2 === 0) ? 165 : 115;
        const nextY = 195 - (i + 1) * stepY;
        drawLine(img, w, h, curX, curY, nextX, nextY, 40, 160, 125, 255, 3.5);
        drawCircle(img, w, h, curX, curY, 2.5, 75, 215, 175, 255);
        curX = nextX;
        curY = nextY;
      }
      drawCircle(img, w, h, curX, curY, 5, 250, 210, 100, 255);
    }
  },
  biphenyl: {
    name: 'biphenyl',
    draw: (img, w, h) => {
      drawBaseSubstrate(img, w, h);
      drawLine(img, w, h, 140, 230, 155, 215, 40, 160, 125, 255, 3.5);
      drawLine(img, w, h, 155, 215, 140, 200, 40, 160, 125, 255, 3.5);
      drawLine(img, w, h, 140, 200, 140, 185, 40, 160, 125, 255, 3.5);
      drawHexagon(img, w, h, 140, 155, 26, 230, 140, 40);
      drawCircle(img, w, h, 140, 155, 15, 230, 140, 40, 255, false, 2.5);
      drawLine(img, w, h, 140, 129, 140, 105, 40, 160, 125, 255, 3.5);
      drawHexagon(img, w, h, 140, 79, 26, 230, 140, 40);
      drawCircle(img, w, h, 140, 79, 15, 230, 140, 40, 255, false, 2.5);
    }
  },
  pfpp: {
    name: 'PFPP',
    draw: (img, w, h) => {
      drawBaseSubstrate(img, w, h);
      drawLine(img, w, h, 140, 230, 155, 215, 40, 160, 125, 255, 3.5);
      drawLine(img, w, h, 155, 215, 140, 200, 40, 160, 125, 255, 3.5);
      drawLine(img, w, h, 140, 200, 140, 185, 40, 160, 125, 255, 3.5);
      const cx = 140, cy = 140, r = 38;
      drawHexagon(img, w, h, cx, cy, r, 50, 180, 150);
      drawCircle(img, w, h, cx, cy, 22, 50, 180, 150, 255, false, 2.5);
      for (let i = 0; i < 6; i++) {
        if (i === 3) continue;
        const angle = (i * 60 - 90) * Math.PI / 180;
        const vx = cx + r * Math.cos(angle);
        const vy = cy + r * Math.sin(angle);
        const fx = cx + (r + 18) * Math.cos(angle);
        const fy = cy + (r + 18) * Math.sin(angle);
        drawLine(img, w, h, vx, vy, fx, fy, 40, 190, 230, 255, 3);
        drawCircle(img, w, h, fx, fy, 8, 40, 210, 240, 255);
        drawCircle(img, w, h, fx, fy, 4, 255, 255, 255, 255);
      }
    }
  },
  ibd: {
    name: 'IBD',
    draw: (img, w, h) => {
      drawBaseSubstrate(img, w, h);
      drawLine(img, w, h, 140, 230, 140, 210, 40, 160, 125, 255, 3.5);
      drawCircle(img, w, h, 140, 200, 11, 45, 120, 240, 255);
      drawCircle(img, w, h, 140, 200, 5, 255, 255, 255, 255);
      drawLine(img, w, h, 130, 200, 95, 215, 210, 140, 50, 255, 3.5);
      drawCircle(img, w, h, 95, 215, 8, 210, 140, 50, 255);
      drawLine(img, w, h, 150, 200, 185, 215, 210, 140, 50, 255, 3.5);
      drawCircle(img, w, h, 185, 215, 8, 210, 140, 50, 255);
      let curX = 140, curY = 188;
      const stepY = (188 - 70) / 9;
      for (let i = 0; i < 9; i++) {
        const nextX = (i % 2 === 0) ? 160 : 120;
        const nextY = 188 - (i + 1) * stepY;
        drawLine(img, w, h, curX, curY, nextX, nextY, 40, 160, 125, 255, 3.5);
        drawCircle(img, w, h, curX, curY, 2.5, 75, 215, 175, 255);
        curX = nextX;
        curY = nextY;
      }
      drawCircle(img, w, h, curX, curY, 5, 250, 210, 100, 255);
    }
  },
  'phenyl-hexyl': {
    name: 'Phenyl-Hexyl',
    draw: (img, w, h) => {
      drawBaseSubstrate(img, w, h);
      let curX = 140, curY = 230;
      const stepY = (230 - 145) / 5;
      for (let i = 0; i < 5; i++) {
        const nextX = (i % 2 === 0) ? 160 : 120;
        const nextY = 230 - (i + 1) * stepY;
        drawLine(img, w, h, curX, curY, nextX, nextY, 40, 160, 125, 255, 3.5);
        curX = nextX;
        curY = nextY;
      }
      drawLine(img, w, h, curX, curY, 140, 130, 40, 160, 125, 255, 3.5);
      drawHexagon(img, w, h, 140, 95, 30, 230, 140, 40);
      drawCircle(img, w, h, 140, 95, 17, 230, 140, 40, 255, false, 2.5);
    }
  },
  cyano: {
    name: 'Cyano',
    draw: (img, w, h) => {
      drawBaseSubstrate(img, w, h);
      drawLine(img, w, h, 140, 230, 155, 205, 40, 160, 125, 255, 3.5);
      drawLine(img, w, h, 155, 205, 140, 180, 40, 160, 125, 255, 3.5);
      drawLine(img, w, h, 140, 180, 140, 150, 40, 160, 125, 255, 3.5);
      // C atom
      drawCircle(img, w, h, 140, 150, 6, 75, 215, 175, 255);
      // Triple bond C≡N
      drawLine(img, w, h, 136, 144, 136, 110, 160, 70, 220, 255, 2.5);
      drawLine(img, w, h, 140, 144, 140, 110, 160, 70, 220, 255, 2.5);
      drawLine(img, w, h, 144, 144, 144, 110, 160, 70, 220, 255, 2.5);
      // Nitrogen atom
      drawCircle(img, w, h, 140, 102, 10, 160, 70, 240, 255);
      drawCircle(img, w, h, 140, 102, 5, 255, 255, 255, 255);
    }
  },
  amino: {
    name: 'Amino',
    draw: (img, w, h) => {
      drawBaseSubstrate(img, w, h);
      drawLine(img, w, h, 140, 230, 155, 205, 40, 160, 125, 255, 3.5);
      drawLine(img, w, h, 155, 205, 140, 180, 40, 160, 125, 255, 3.5);
      drawLine(img, w, h, 140, 180, 140, 150, 40, 160, 125, 255, 3.5);
      // Primary amine NH2 group
      drawCircle(img, w, h, 140, 140, 12, 50, 130, 240, 255);
      drawCircle(img, w, h, 140, 140, 6, 255, 255, 255, 255);
      // Hydrogens
      drawCircle(img, w, h, 125, 125, 6, 200, 220, 255, 255);
      drawCircle(img, w, h, 155, 125, 6, 200, 220, 255, 255);
    }
  },
  hilic: {
    name: 'HILIC',
    draw: (img, w, h) => {
      drawBaseSubstrate(img, w, h);
      drawLine(img, w, h, 140, 230, 155, 205, 40, 160, 125, 255, 3.5);
      drawLine(img, w, h, 155, 205, 140, 180, 40, 160, 125, 255, 3.5);
      drawLine(img, w, h, 140, 180, 140, 150, 40, 160, 125, 255, 3.5);
      // Diol branches -OH and -OH
      drawLine(img, w, h, 140, 150, 115, 125, 40, 160, 125, 255, 3.5);
      drawCircle(img, w, h, 115, 125, 9, 220, 60, 60, 255); // OH red
      drawLine(img, w, h, 140, 150, 165, 125, 40, 160, 125, 255, 3.5);
      drawCircle(img, w, h, 165, 125, 9, 220, 60, 60, 255); // OH red
    }
  }
};

const outDir = path.join(__dirname, '../public/equipment');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const [key, def] of Object.entries(ligandDefs)) {
  const pngBuf = createPng(280, 330, def.draw);
  const outPath = path.join(outDir, `ligand-${key}.png`);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`Generated high-res PNG for ${def.name} -> ${outPath}`);
}
