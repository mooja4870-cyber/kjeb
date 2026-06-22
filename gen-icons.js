// gen-icons.js — 의존성 없이 PWA 아이콘 PNG 생성 (녹색 배경 + 흰색 의료 십자가)
const fs = require("fs");
const zlib = require("zlib");

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function makePNG(size) {
  const bg = [3, 199, 90];      // #03C75A
  const fg = [255, 255, 255];   // white
  const t = Math.round(size * 0.18);  // 십자가 두께
  const L = Math.round(size * 0.52);  // 십자가 길이
  const cx = size / 2, cy = size / 2;
  const x0 = Math.round(cx - t / 2), x1 = Math.round(cx + t / 2);
  const y0 = Math.round(cy - t / 2), y1 = Math.round(cy + t / 2);
  const vx0 = Math.round(cx - t / 2), vx1 = Math.round(cx + t / 2);
  const vy0 = Math.round(cy - L / 2), vy1 = Math.round(cy + L / 2);
  const hx0 = Math.round(cx - L / 2), hx1 = Math.round(cx + L / 2);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const inV = x >= vx0 && x < vx1 && y >= vy0 && y < vy1;
      const inH = x >= hx0 && x < hx1 && y >= y0 && y < y1;
      const c = (inV || inH) ? fg : bg;
      raw[p++] = c[0]; raw[p++] = c[1]; raw[p++] = c[2]; raw[p++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
fs.writeFileSync("icon-192.png", makePNG(192));
fs.writeFileSync("icon-512.png", makePNG(512));
console.log("icon-192.png, icon-512.png 생성 완료");
