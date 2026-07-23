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

// Every demo species is extracted — not just the cut designs — so that real species
// which were redesigned after 1997 (Umbreon = "Blacky", Espeon = "Eifie", …) render
// their authentic beta sprite in the gen2sw97 mod instead of their modern GSC art.
// Each entry pairs a decomp gfx/pokemon/<folder> with its Showdown species id: `folder`
// is the beta name (and also keys the beta palette in data/pokemon/palettes.asm), while
// `id` names the output PNG. Regenerate the map from a decomp checkout with the server
// repo's tools/sw97-sprite-map.js (it reuses sw97-gen.js's id resolution).
const SW97_SPRITE_MAP = require('./sw97-sprite-map.json');

// The cut Spaceworld '97 designs (dex num >= 5000), kept for reference and back-compat.
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
 * Apply a 4-colour GBC palette to a 4-shade grayscale sprite, returning native-size
 * RGBA. The demo's lightest shade (grayscale sample 3) is the paper/background colour;
 * we make it transparent ONLY where it is connected to the image border (a flood fill
 * from the edges). Interior light regions — bellies, eyes, highlights — stay opaque as
 * palette colour 0, so they no longer punch see-through holes in the sprite. This is how
 * Gold/Silver (and Showdown's own gen2 sprites) render: colour 0 is white, not clear.
 */
function colorizeNative(gray, quad) {
	const {width, height, pixels} = gray;
	const isLight = i => pixels[i] === 3; // grayscale sample 3 = lightest shade
	// Flood-fill the background: light pixels reachable from any image border pixel.
	const bg = new Uint8Array(width * height);
	const stack = [];
	for (let x = 0; x < width; x++) {
		for (const y of [0, height - 1]) { const i = y * width + x; if (isLight(i)) stack.push(i); }
	}
	for (let y = 0; y < height; y++) {
		for (const x of [0, width - 1]) { const i = y * width + x; if (isLight(i)) stack.push(i); }
	}
	while (stack.length) {
		const i = stack.pop();
		if (bg[i]) continue;
		bg[i] = 1;
		const x = i % width, y = (i / width) | 0;
		if (x > 0 && isLight(i - 1)) stack.push(i - 1);
		if (x < width - 1 && isLight(i + 1)) stack.push(i + 1);
		if (y > 0 && isLight(i - width)) stack.push(i - width);
		if (y < height - 1 && isLight(i + width)) stack.push(i + width);
	}
	const rgba = new Uint8Array(width * height * 4);
	for (let i = 0; i < pixels.length; i++) {
		if (bg[i]) { rgba[i * 4 + 3] = 0; continue; } // exterior background -> transparent
		const [r, g, b] = quad[3 - pixels[i]]; // 3(light)->quad[0] .. 0(dark)->quad[3]
		rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
	}
	return {width, height, rgba};
}

// Showdown's stock gen2 sprites sit centred in a fixed 96x96 frame (e.g. gen2/marill.png
// has ~28px margins on every side), and the battle scene positions every sprite by its
// centre. The raw demo art is a tight, off-centre native box (40/48/56px), so composite
// its opaque content centred into a 96x96 canvas to match — this is the centring fix.
const FRAME = 96;
function frameTo96(native) {
	const {width, height, rgba} = native;
	let minX = width, minY = height, maxX = -1, maxY = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (rgba[(y * width + x) * 4 + 3]) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	const out = new Uint8Array(FRAME * FRAME * 4);
	if (maxX < 0) return encodeRGBA(FRAME, FRAME, out); // fully transparent (shouldn't happen)
	const dx = Math.floor((FRAME - (maxX - minX + 1)) / 2) - minX;
	const dy = Math.floor((FRAME - (maxY - minY + 1)) / 2) - minY;
	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			const si = (y * width + x) * 4;
			if (!rgba[si + 3]) continue;
			const di = ((y + dy) * FRAME + (x + dx)) * 4;
			out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = 255;
		}
	}
	return encodeRGBA(FRAME, FRAME, out);
}

function colorize(gray, quad) {
	return frameTo96(colorizeNative(gray, quad));
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
	for (const {folder, id} of SW97_SPRITE_MAP) {
		const frontSrc = path.join(gfxRoot, folder, 'front.png');
		const backSrc = path.join(gfxRoot, folder, 'back.png');
		// Palette is keyed by the beta name (folder), not the modern Showdown id.
		const palName = speciesToPal[folder] || speciesToPal[id];
		if (!fs.existsSync(frontSrc) || !fs.existsSync(backSrc)) { problems.push(`${id} (${folder}): missing art`); continue; }
		if (!palName || !colors[palName]) { problems.push(`${id} (${folder}): no palette (${palName})`); continue; }
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
	console.log(`Wrote ${done}/${SW97_SPRITE_MAP.length} Spaceworld '97 sprite sets (front/back + shiny) to ${spritesRoot}`);
	if (problems.length) console.log('Problems:\n  ' + problems.join('\n  '));
}

if (require.main === module) main();
module.exports = {decodeGrayPNG, encodeRGBA, colorize, parsePalettes, SW97_CUT_MON};
