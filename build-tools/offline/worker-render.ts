import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_MEDIA_CACHE_LIMIT = 160;
const CONFIG_SENTINEL = '__PS_OFFLINE_CONFIG__';
const VALIDATION_ORIGIN = 'https://offline.invalid';

export interface ServiceWorkerRenderOptions {
	version: string;
	coreAssets: readonly string[];
	mediaAssets?: readonly string[];
	mediaCacheLimit?: number;
}

function isRootRelativeAsset(asset: string): boolean {
	if (!asset.startsWith('/') || asset.startsWith('//') || asset.includes('\\')) return false;
	const url = new URL(asset, VALIDATION_ORIGIN + '/');
	return url.origin === VALIDATION_ORIGIN && !url.hash;
}

export function loadWorkerRuntime(rootDir: string): string {
	return fs.readFileSync(path.join(rootDir, 'caches', 'offline-tools', 'worker-runtime.js'), 'utf8');
}

/** Inject typed data into the separately typechecked service-worker runtime. */
export function renderServiceWorker(runtime: string, options: ServiceWorkerRenderOptions): string {
	const version = options.version;
	const coreAssets = [...new Set(options.coreAssets)].sort();
	const mediaAssets = [...new Set(options.mediaAssets || [])].sort();
	const mediaCacheLimit = options.mediaCacheLimit || DEFAULT_MEDIA_CACHE_LIMIT;

	if (!/^[a-z0-9._-]+$/i.test(version)) {
		throw new TypeError(`Invalid offline worker version: ${version}`);
	}
	if (!coreAssets.length || !coreAssets.every(isRootRelativeAsset)) {
		throw new TypeError('The offline worker requires root-relative core assets.');
	}
	if (!mediaAssets.every(isRootRelativeAsset)) {
		throw new TypeError('The offline worker requires root-relative media assets.');
	}
	if (!Number.isInteger(mediaCacheLimit) || mediaCacheLimit < mediaAssets.length) {
		throw new TypeError('mediaCacheLimit must be an integer large enough for the warm media set.');
	}

	const sentinelPattern = /(['"])__PS_OFFLINE_CONFIG__\1/g;
	const matches = runtime.match(sentinelPattern);
	if (matches?.length !== 1) {
		throw new Error('The compiled worker runtime must contain exactly one configuration sentinel.');
	}
	const config = JSON.stringify({ version, coreAssets, mediaAssets, mediaCacheLimit });
	return runtime.replace(sentinelPattern, JSON.stringify(config));
}

export { CONFIG_SENTINEL };
