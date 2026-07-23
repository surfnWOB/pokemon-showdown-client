'use strict';
/**
 * Spaceworld '97 beta sprite extractor.
 *
 * The `gen2sw97` mod adds 36 cut Gold/Silver beta designs (dex num >= 5000) that have
 * no sprites on the standard Showdown CDN. This tool converts their original art from
 * the `pret/pokegold-spaceworld` decomp into Showdown-style gen2 sprite PNGs.
 *
 * The demo stores sprites as 2bpp (4-shade) monochrome art plus a per-species GBC
 * palette assignment (data/pokemon/palettes.asm -> data/sgb/super_palettes.asm). We
 * apply that palette to recover the authentic in-game colors — exactly how Gold/Silver
 * (and Showdown's own gen2 sprites) render them — and also emit the shiny palette:
 *
 *     custom-sprites/gen2sw97/gen2/<id>.png             (front)
 *     custom-sprites/gen2sw97/gen2-back/<id>.png        (back)
 *     custom-sprites/gen2sw97/gen2-shiny/<id>.png       (front, shiny)
 *     custom-sprites/gen2sw97/gen2-back-shiny/<id>.png  (back, shiny)
 *
 * The live sprites/ tree is gitignored (served from the sprite mount / official CDN),
 * so these assets are committed under custom-sprites/ instead. The client Dockerfile
 * copies them into play.pokemonshowdown.com/sprites/ at build time, where nginx serves
 * them local-first with an official-CDN fallback (docker/nginx-client.conf). This
 * script is the reproducible source: re-run it to regenerate the committed PNGs.
 *
 * Usage:
 *     node build-tools/sw97-sprites.js /path/to/pokegold-spaceworld
 *     SW97_DECOMP=/path/to/pokegold-spaceworld node build-tools/sw97-sprites.js
 *
 * Self-contained: uses only Node built-ins (fs, path, zlib). No image dependencies.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// The 36 cut Spaceworld '97 designs. The decomp gfx/pokemon/<dir> names match the
// Showdown species ids one-for-one, so id doubles as the source directory name.
const SW97_CUT_MON = [
	'pudie', 'baririna', 'tsubomitto', 'bombseeker', 'kotora', 'raitora', 'madame',
	'norowara', 'kyonpan', 'purakkusu', 'wolfman', 'warwolf', 'nameil', 'honoguma',
	'volbear', 'dynabear', 'kurusu', 'aqua', 'aquaria', 'mikon', 'monja', 'shibirefugu',
	'gyopin', 'manbo1', 'ikari', 'grotess', 'para', 'animon', 'hinazu', 'twinz',
	'kounya', 'rinrin', 'berurun', 'puchicorn', 'turban', 'betbaby',
];

// --- PNG codec (grayscale in, RGBA out), zlib only -------------------------------

function decodeGrayPNG(buf) {
	if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
	let off = 8;
	let ihdr = null;
	const idat = [];
	while (off < buf.length) {
		const len = buf.readUInt32BE(off);
		const type = buf.toString('ascii', off + 4, off + 8);
		const data = buf.subarray(off + 8, off + 8 + len);
		if (type === 'IHDR') {
			ihdr = {
				width: data.readUInt32BE(0), height: data.readUInt32BE(4),
				bitDepth: data[8], colorType: data[9],
			};
		} else if (type === 'IDAT') {
			idat.push(data);
		} else if (type === 'IEND') {
			break;
		}
		off += 12 + len;
	}
	const {width, height, bitDepth, colorType} = ihdr;
	if (colorType !== 0) return null; // not grayscale; caller passes it through verbatim
	const raw = zlib.inflateSync(Buffer.concat(idat));
	const bytesPerRow = Math.ceil((width * bitDepth) / 8);
	const out = Buffer.alloc(height * bytesPerRow);
	const bpp = Math.max(1, Math.ceil(bitDepth / 8));
	let p = 0;
	for (let y = 0; y < height; y++) {
		const filter = raw[p++];
		for (let x = 0; x < bytesPerRow; x++) {
			const rawByte = raw[p++];
			const a = x >= bpp ? out[y * bytesPerRow + x - bpp] : 0;
			const b = y > 0 ? out[(y - 1) * bytesPerRow + x] : 0;
			const c = (x >= bpp && y > 0) ? out[(y - 1) * bytesPerRow + x - bpp] : 0;
			let val;
			switch (filter) {
				case 0: val = rawByte; break;
				case 1: val = rawByte + a; break;
				case 2: val = rawByte + b; break;
				case 3: val = rawByte + ((a + b) >> 1); break;
				case 4: {
					const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
					const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
					val = rawByte + pr;
					break;
				}
				default: throw new Error('unsupported PNG filter ' + filter);
			}
			out[y * bytesPerRow + x] = val & 0xff;
		}
	}
	const maxval = (1 << bitDepth) - 1;
	const pixels = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const bitPos = x * bitDepth;
			const bytePos = y * bytesPerRow + (bitPos >> 3);
			const shift = 8 - bitDepth - (bitPos & 7);
			pixels[y * width + x] = (out[bytePos] >> shift) & maxval;
		}
	}
	return {width, height, maxval, pixels};
}

function crc32(buf) {
	let c = ~0;
	for (let i = 0; i < buf.length; i++) {
		c ^= buf[i];
		for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
	}
	return (~c) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body), 0);
	return Buffer.concat([len, body, crc]);
}

function encodeRGBA(width, height, rgba) {
	const bytesPerRow = width * 4;
	const raw = Buffer.alloc(height * (bytesPerRow + 1));
	const rgbaBuf = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
	for (let y = 0; y < height; y++) {
		raw[y * (bytesPerRow + 1)] = 0; // filter type 0 (none)
		rgbaBuf.copy(raw, y * (bytesPerRow + 1) + 1, y * bytesPerRow, (y + 1) * bytesPerRow);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA
	const idat = zlib.deflateSync(raw, {level: 9});
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', idat),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

// --- Demo palette parsing --------------------------------------------------------

// GBC color is 5-bit per channel; scale to 8-bit. round(c * 255 / 31) matches the
// straightforward expansion used when these sprites are shown elsewhere.
const to8 = c => Math.round((c * 255) / 31);

/**
 * Parse the decomp palette data into:
 *   colors:       { PALNAME: [[r,g,b] x4] }  (index 0 = lightest .. 3 = darkest)
 *   speciesToPal: { speciesid: PALNAME }
 */
function parsePalettes(decompRoot) {
	const superPal = fs.readFileSync(
		path.join(decompRoot, 'data', 'sgb', 'super_palettes.asm'), 'utf8');
	const colors = {};
	for (const line of superPal.split('\n')) {
		const m = line.match(/RGB\s+([\d,\s]+?)\s*;\s*(\w+)/);
		if (!m) continue;
		const nums = m[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
		if (nums.length < 12) continue;
		const quad = [];
		for (let i = 0; i < 4; i++) quad.push([to8(nums[i * 3]), to8(nums[i * 3 + 1]), to8(nums[i * 3 + 2])]);
		colors[m[2]] = quad;
	}
	const palAssign = fs.readFileSync(
		path.join(decompRoot, 'data', 'pokemon', 'palettes.asm'), 'utf8');
	const speciesToPal = {};
	for (const line of palAssign.split('\n')) {
		const m = line.match(/db\s+PAL_(\w+)\s*;\s*(\w+)/);
		if (!m) continue;
		speciesToPal[m[2].toLowerCase()] = m[1];
	}
	return {colors, speciesToPal};
}

// --- Colorization ----------------------------------------------------------------

/**
 * Apply a 4-colour GBC palette to a 4-shade grayscale sprite. The demo's lightest
 * shade (grayscale sample 3) is the sprite/background colour and becomes transparent,
 * matching Showdown's transparent-background convention. Remaining shades map onto the
 * palette darkest-to-lightest.
 */
function colorize(gray, quad) {
	const {width, height, pixels} = gray;
	const rgba = new Uint8Array(width * height * 4);
	for (let i = 0; i < pixels.length; i++) {
		const idx = 3 - pixels[i]; // grayscale 3(light)->0(white), 0(dark)->3(black)
		if (idx === 0) {
			rgba[i * 4 + 3] = 0; // lightest colour -> transparent
			continue;
		}
		const [r, g, b] = quad[idx];
		rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
	}
	return encodeRGBA(width, height, rgba);
}

function main() {
	const decompRoot = process.argv[2] || process.env.SW97_DECOMP;
	if (!decompRoot) {
		console.error('Usage: node build-tools/sw97-sprites.js /path/to/pokegold-spaceworld');
		process.exit(1);
	}
	const gfxRoot = path.join(decompRoot, 'gfx', 'pokemon');
	const {colors, speciesToPal} = parsePalettes(decompRoot);
	const spritesRoot = path.join(__dirname, '..', 'custom-sprites', 'gen2sw97');
	const dirs = {
		front: path.join(spritesRoot, 'gen2'),
		back: path.join(spritesRoot, 'gen2-back'),
		frontShiny: path.join(spritesRoot, 'gen2-shiny'),
		backShiny: path.join(spritesRoot, 'gen2-back-shiny'),
	};
	for (const d of Object.values(dirs)) fs.mkdirSync(d, {recursive: true});

	let done = 0;
	const problems = [];
	for (const id of SW97_CUT_MON) {
		const frontSrc = path.join(gfxRoot, id, 'front.png');
		const backSrc = path.join(gfxRoot, id, 'back.png');
		const palName = speciesToPal[id];
		if (!fs.existsSync(frontSrc) || !fs.existsSync(backSrc)) { problems.push(`${id}: missing art`); continue; }
		if (!palName || !colors[palName]) { problems.push(`${id}: no palette (${palName})`); continue; }
		const shinyName = 'SHINY_' + palName;
		const normalQuad = colors[palName];
		const shinyQuad = colors[shinyName] || normalQuad;

		const front = decodeGrayPNG(fs.readFileSync(frontSrc));
		const back = decodeGrayPNG(fs.readFileSync(backSrc));
		fs.writeFileSync(path.join(dirs.front, id + '.png'), colorize(front, normalQuad));
		fs.writeFileSync(path.join(dirs.back, id + '.png'), colorize(back, normalQuad));
		fs.writeFileSync(path.join(dirs.frontShiny, id + '.png'), colorize(front, shinyQuad));
		fs.writeFileSync(path.join(dirs.backShiny, id + '.png'), colorize(back, shinyQuad));
		done++;
	}
	console.log(`Wrote ${done}/${SW97_CUT_MON.length} Spaceworld '97 sprite sets (front/back + shiny) to ${spritesRoot}`);
	if (problems.length) console.log('Problems:\n  ' + problems.join('\n  '));
}

if (require.main === module) main();
module.exports = {decodeGrayPNG, encodeRGBA, colorize, parsePalettes, SW97_CUT_MON};
