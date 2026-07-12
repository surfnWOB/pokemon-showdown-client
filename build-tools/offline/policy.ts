import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { collectLocalStylesheetImports } from './css-imports';

export const WEB_ROOT_NAME = 'play.pokemonshowdown.com';
export const SOURCE_SHELL_PATH = 'testclient-old.html';
export const OFFLINE_SHELL_PATH = 'offline.html';
export const OFFLINE_FORMATS_PATH = 'data/offline-formats.js';
export const OFFLINE_MANIFEST_PATH = 'offline.webmanifest';
export const SERVICE_WORKER_PATH = 'service-worker.js';
export const WORKER_VERSION_PLACEHOLDER = '00000000000000000000';

const SHELL_MEDIA = [
	'/fx/client-bg-charizards.jpg',
	'/fx/client-bgsheet.png',
	'/fx/client-topbar-bg.png',
	// The classic topbar adds this srcset candidate at runtime on Retina displays.
	'/pokemonshowdownbeta@2x.png',
] as const;

// Upstream intentionally lets these development-only data files fall back to
// the CDN when a local full build does not produce them.
const OPTIONAL_SHELL_ASSETS = new Set([
	'/data/pokedex-mini.js',
	'/data/pokedex-mini-bw.js',
]);

/**
 * Files whose absence means the classic offline shell cannot provide its
 * promised teambuilder functionality. This is also the base core-cache list.
 */
export const CLASSIC_OFFLINE_CORE = [
	'/offline.html',
	'/favicon-192.png',
	'/favicon-256.png',
	'/favicon-512.png',
	...SHELL_MEDIA,
] as const;

const POKEMON_TYPES = [
	'Normal', 'Fire', 'Fighting', 'Water', 'Flying', 'Grass', 'Poison', 'Electric', 'Ground',
	'Psychic', 'Rock', 'Ice', 'Bug', 'Dragon', 'Ghost', 'Dark', 'Steel', 'Fairy', 'Stellar',
] as const;

export const OPTIONAL_MEDIA = [
	'/fx/client-bg-horizon.jpg',
	'/fx/client-bg-ocean.jpg',
	'/fx/client-bg-psday.jpg',
	'/fx/client-bg-shaymin.jpg',
	'/sprites/pokemonicons-sheet.png?v22',
	'/sprites/pokemonicons-pokeball-sheet.png',
	'/sprites/itemicons-sheet.png?v1',
	'/sprites/trainers-sheet.png',
	'/sprites/gen5/0.png',
	'/sprites/misc/shiny.png',
	...POKEMON_TYPES.flatMap(type => [
		`/sprites/types/${type}.png`,
		`/sprites/typeicons/${type}.png`,
	]),
	'/sprites/categories/Physical.png',
	'/sprites/categories/Special.png',
	'/sprites/categories/Status.png',
] as const;

function encodePathSegment(segment: string): string {
	return encodeURIComponent(segment).replace(/%(?:24|26|2B|2C|3A|3B|3D|40)/gi, encoded => {
		return decodeURIComponent(encoded);
	});
}

export function toURLPath(relativePath: string): string {
	return '/' + relativePath.split(path.sep).map(encodePathSegment).join('/');
}

export function fromURLPath(webRoot: string, urlPath: string): string {
	const pathname = new URL(urlPath, 'https://offline.invalid/').pathname;
	const relative = pathname.split('/').filter(Boolean).map(decodeURIComponent).join(path.sep);
	const absolute = path.resolve(webRoot, relative);
	if (absolute !== webRoot && !absolute.startsWith(webRoot + path.sep)) {
		throw new Error(`Offline asset escapes web root: ${urlPath}`);
	}
	return absolute;
}

function walkFiles(directory: string, include: (filename: string) => boolean): string[] {
	if (!fs.existsSync(directory)) return [];
	const files: string[] = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...walkFiles(filename, include));
		} else if ((entry.isFile() || entry.isSymbolicLink()) && include(filename)) {
			files.push(filename);
		}
	}
	return files;
}

function localShellReferences(shell: string): string[] {
	const references: string[] = [];
	const tag = /<([a-z][a-z\d:-]*)\b[^>]*>/gi;
	let tagMatch: RegExpExecArray | null;
	while ((tagMatch = tag.exec(shell))) {
		const tagName = tagMatch[1];
		if (!tagName) continue;
		const attributeName = tagName.toLowerCase() === 'link' ? 'href' : 'src';
		const attribute = new RegExp(`\\b${attributeName}=(['"])(.*?)\\1`, 'i');
		const match = attribute.exec(tagMatch[0]);
		if (!match) continue;
		const reference = match[2];
		if (!reference || reference.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(reference)) continue;
		const url = new URL(reference, 'https://offline.invalid/offline.html');
		if (url.origin !== 'https://offline.invalid') continue;
		if (url.pathname === '/config/testclient-key.js') continue;
		references.push(url.pathname);
	}
	return references;
}

/**
 * Resolve the exact classic-client core. Direct shell dependencies are
 * required unless explicitly optional. The one modern Font Awesome asset is a
 * policy extension. Battle-only Showdex and unrelated Preact/replay outputs
 * stay out of the atomic app shell.
 */
export function collectClassicCore(rootDir: string): string[] {
	const webRoot = path.join(rootDir, WEB_ROOT_NAME);
	const assets = new Set<string>(CLASSIC_OFFLINE_CORE);
	const shellPath = path.join(webRoot, OFFLINE_SHELL_PATH);
	if (fs.existsSync(shellPath)) {
		for (const asset of localShellReferences(fs.readFileSync(shellPath, 'utf8'))) {
			if (OPTIONAL_SHELL_ASSETS.has(asset) && !fs.existsSync(fromURLPath(webRoot, asset))) continue;
			assets.add(asset);
		}
	}

	const localTrees: readonly (readonly [string, (filename: string) => boolean])[] = [
		['style/fonts', filename => filename.endsWith('fontawesome-webfont.woff2')],
	];
	for (const [subdir, include] of localTrees) {
		for (const filename of walkFiles(path.join(webRoot, subdir), include)) {
			assets.add(toURLPath(path.relative(webRoot, filename)));
		}
	}
	for (const stylesheet of collectLocalStylesheetImports(webRoot, [...assets])) {
		assets.add(stylesheet);
	}
	return [...assets].sort();
}

export function findMissingAssets(webRoot: string, assets: readonly string[]): string[] {
	return assets.filter(asset => {
		try {
			return !fs.statSync(fromURLPath(webRoot, asset)).isFile();
		} catch {
			return true;
		}
	});
}

export function computeOfflineVersion(
	webRoot: string,
	coreAssets: readonly string[],
	workerPolicy: string,
	mediaAssets: readonly string[] = []
): string {
	const hash = crypto.createHash('sha256');
	hash.update('pokemon-showdown-offline-v2\0');
	hash.update(workerPolicy);
	hash.update('\0');
	for (const asset of coreAssets) {
		hash.update(asset);
		hash.update('\0');
		hash.update(fs.readFileSync(fromURLPath(webRoot, asset)));
		hash.update('\0');
	}
	for (const asset of mediaAssets) {
		const filename = fromURLPath(webRoot, asset);
		if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) continue;
		hash.update(`local-media:${asset}\0`);
		hash.update(fs.readFileSync(filename));
		hash.update('\0');
	}
	return hash.digest('hex').slice(0, 20);
}

export function writeIfChanged(filename: string, contents: string): boolean {
	let current: string | null = null;
	try {
		current = fs.readFileSync(filename, 'utf8');
	} catch {}
	if (current === contents) return false;
	fs.mkdirSync(path.dirname(filename), { recursive: true });
	fs.writeFileSync(filename, contents);
	return true;
}
