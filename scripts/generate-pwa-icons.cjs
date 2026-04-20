#!/usr/bin/env node
// ============================================================================
// scripts/generate-pwa-icons.cjs
// Emits four placeholder PNGs for the PWA manifest:
//   public/icons/icon-192.png           — solid teal with white "S" monogram
//   public/icons/icon-512.png           — same, 512×512
//   public/icons/icon-192-maskable.png  — 192×192 with 10% safe-area padding
//   public/icons/icon-512-maskable.png  — 512×512 with 10% safe-area padding
//
// Pure Node — only built-in modules (fs, path, zlib). No npm install needed.
// Stage 13 will replace these with a real designed logo.
// ============================================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
const BG = [0x0d, 0x4f, 0x4f]; // --brand-teal #0D4F4F
const FG = [0xff, 0xff, 0xff]; // #fff

// Draw a rough "S" monogram as a 5x5 binary mask, scaled up for each size.
// Good-enough placeholder until Stage 13 icon design lands.
const S_MASK = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 0],
    [0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
];

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const payload = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(payload) >>> 0, 0);
    return Buffer.concat([len, payload, crc]);
}

// CRC32 table-based implementation (PNG-compliant).
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function encodePNG(size, pixelAt) {
    const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(size, 0);
    ihdrData.writeUInt32BE(size, 4);
    ihdrData[8] = 8;  // bit depth
    ihdrData[9] = 2;  // color type: truecolor RGB
    ihdrData[10] = 0; // compression
    ihdrData[11] = 0; // filter
    ihdrData[12] = 0; // interlace
    const ihdr = chunk('IHDR', ihdrData);

    // Build raw scanlines (one filter byte per row + RGB per pixel)
    const stride = 1 + size * 3;
    const raw = Buffer.alloc(stride * size);
    for (let y = 0; y < size; y++) {
        raw[y * stride] = 0; // filter: None
        for (let x = 0; x < size; x++) {
            const [r, g, b] = pixelAt(x, y);
            const off = y * stride + 1 + x * 3;
            raw[off] = r;
            raw[off + 1] = g;
            raw[off + 2] = b;
        }
    }
    const idat = chunk('IDAT', zlib.deflateSync(raw, { level: 9 }));
    const iend = chunk('IEND', Buffer.alloc(0));

    return Buffer.concat([SIG, ihdr, idat, iend]);
}

function makeIcon(size, maskable) {
    // For maskable icons, the logo artwork must sit inside a safe zone (center
    // 80%). We achieve this by shrinking the S mask and padding with teal.
    const inset = maskable ? Math.floor(size * 0.1) : 0;
    const artSize = size - inset * 2;

    // Expand the 5×5 S into a per-pixel lookup.
    function isForeground(x, y) {
        // Translate coords into art space
        const ax = x - inset;
        const ay = y - inset;
        if (ax < 0 || ay < 0 || ax >= artSize || ay >= artSize) return false;
        // Map art coords to 5×5 cells
        const cx = Math.floor((ax / artSize) * 5);
        const cy = Math.floor((ay / artSize) * 5);
        const row = S_MASK[Math.min(4, Math.max(0, cy))];
        return row[Math.min(4, Math.max(0, cx))] === 1;
    }

    return encodePNG(size, (x, y) => (isForeground(x, y) ? FG : BG));
}

const TARGETS = [
    { file: 'icon-192.png', size: 192, maskable: false },
    { file: 'icon-512.png', size: 512, maskable: false },
    { file: 'icon-192-maskable.png', size: 192, maskable: true },
    { file: 'icon-512-maskable.png', size: 512, maskable: true },
];

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
for (const t of TARGETS) {
    const buf = makeIcon(t.size, t.maskable);
    fs.writeFileSync(path.join(OUT_DIR, t.file), buf);
    console.log(`  wrote ${t.file} (${buf.length} bytes)`);
}
console.log('Placeholder PWA icons written to public/icons/.');
