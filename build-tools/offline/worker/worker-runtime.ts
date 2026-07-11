interface OfflineWorkerConfig {
	version: string;
	coreAssets: string[];
	mediaAssets: string[];
	mediaCacheLimit: number;
}

type ContentKind = 'html' | 'javascript' | 'css' | 'json' | 'image' | 'font' | 'audio' | 'video' | 'other';
type ValidatedFetch = readonly [Request, Response];

const serviceWorker = globalThis as unknown as ServiceWorkerGlobalScope;

// The strict Node finalizer replaces this sentinel in the compiled runtime.
const OFFLINE_CONFIG = JSON.parse('__PS_OFFLINE_CONFIG__') as OfflineWorkerConfig;
const CORE_CACHE_PREFIX = 'pokemon-showdown-offline-core-';
const MEDIA_CACHE_PREFIX = 'pokemon-showdown-offline-media-';
const CORE_CACHE = CORE_CACHE_PREFIX + OFFLINE_CONFIG.version;
const MEDIA_CACHE = MEDIA_CACHE_PREFIX + OFFLINE_CONFIG.version;
const CORE_ASSETS = OFFLINE_CONFIG.coreAssets;
const OPTIONAL_MEDIA = OFFLINE_CONFIG.mediaAssets;
const MEDIA_CACHE_LIMIT = OFFLINE_CONFIG.mediaCacheLimit;
const CORE_PATHS = new Set(CORE_ASSETS.map(asset => new URL(asset, serviceWorker.registration.scope).pathname));
let mediaWarmPromise: Promise<void> | null = null;

const STATIC_PREFIXES = [
	'/config/', '/data/', '/fx/', '/js/', '/offline/', '/sprites/', '/style/', '/swf/',
];
const MEDIA_PREFIXES = ['/audio/', '/fx/', '/sprites/'];
const DYNAMIC_QUERY_KEYS = new Set([
	'act', 'action', 'assertion', 'challstr', 'log', 'password', 'search', 'team', 'userid',
]);

function expectedContentKind(url: string): ContentKind {
	const pathname = new URL(url, serviceWorker.registration.scope).pathname.toLowerCase();
	if (pathname === '/' || pathname.endsWith('.html') || pathname.endsWith('.htm')) return 'html';
	if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) return 'javascript';
	if (pathname.endsWith('.css')) return 'css';
	if (pathname.endsWith('.json') || pathname.endsWith('.webmanifest')) return 'json';
	if (/\.(?:png|apng|gif|jpe?g|webp|avif|svg|ico)$/.test(pathname)) return 'image';
	if (/\.(?:woff2?|ttf|otf|eot)$/.test(pathname)) return 'font';
	if (/\.(?:mp3|m4a|aac|flac|oga|ogg|opus|wav)$/.test(pathname)) return 'audio';
	if (/\.(?:mp4|m4v|ogv|webm)$/.test(pathname)) return 'video';
	return 'other';
}

function contentTypeMatches(kind: ContentKind, contentType: string | null): boolean {
	if (!contentType) return false;
	const mime = contentType.split(';', 1)[0]?.trim().toLowerCase() || '';
	switch (kind) {
	case 'html':
		return mime === 'text/html' || mime === 'application/xhtml+xml';
	case 'javascript':
		return mime.includes('javascript') || mime.includes('ecmascript');
	case 'css':
		return mime === 'text/css';
	case 'json':
		return mime === 'application/json' || mime === 'application/manifest+json' || mime === 'text/json';
	case 'image':
		return mime.startsWith('image/');
	case 'font':
		return mime.startsWith('font/') || mime === 'application/font-woff' ||
			mime === 'application/vnd.ms-fontobject' || mime === 'application/x-font-ttf' ||
			mime === 'application/octet-stream';
	case 'audio':
		return mime.startsWith('audio/') || mime === 'application/ogg';
	case 'video':
		return mime.startsWith('video/') || mime === 'application/ogg';
	default:
		return mime !== 'text/html' && mime !== 'application/xhtml+xml';
	}
}

function isValidResponse(response: Response, url: string): boolean {
	if (response.status < 200 || response.status >= 300) return false;
	if (response.type === 'opaque' || response.type === 'opaqueredirect') return false;
	return contentTypeMatches(expectedContentKind(url), response.headers.get('content-type'));
}

function isDynamicRequest(url: URL): boolean {
	const pathname = url.pathname.toLowerCase();
	if (url.search.startsWith('?~~')) return true;
	if (/\.(?:php|cgi|asp|aspx)$/.test(pathname)) return true;
	if (/^\/(?:~~|showdown|sockjs|socket|websocket)(?:\/|$)/.test(pathname)) return true;
	const privatePath = /^\/(?:account|action|api|auth|battle|chat|friends|ladder|login|logout|rooms?|users?)(?:[-/]|$)/;
	if (privatePath.test(pathname)) return true;
	if (/^\/(?:replay|savereplay|teams?|upload)(?:[-/]|$)/.test(pathname)) return true;
	for (const key of url.searchParams.keys()) {
		if (DYNAMIC_QUERY_KEYS.has(key.toLowerCase())) return true;
	}
	return pathname === '/service-worker.js';
}

function isNavigation(request: Request): boolean {
	return request.mode === 'navigate' ||
		(request.headers.get('accept') || '').toLowerCase().includes('text/html');
}

function isAllowlistedStatic(url: URL): boolean {
	if (url.pathname.endsWith('.map') || url.pathname.includes('/audio/')) return false;
	if (CORE_PATHS.has(url.pathname)) return true;
	return STATIC_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
}

function isRuntimeMedia(url: URL): boolean {
	if (!MEDIA_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) return false;
	return ['image', 'audio', 'video'].includes(expectedContentKind(url.href));
}

async function fetchAndValidate(asset: string, timeout?: number): Promise<ValidatedFetch> {
	const url = new URL(asset, serviceWorker.registration.scope).href;
	const requestInit: RequestInit = { cache: 'reload', credentials: 'same-origin' };
	if (timeout) requestInit.signal = AbortSignal.timeout(timeout);
	const request = new Request(url, requestInit);
	const response = await fetch(request);
	if (!isValidResponse(response, url)) throw new Error('Invalid offline asset response: ' + asset);
	return [request, response];
}

async function installCore(): Promise<void> {
	// This cache is content-versioned. A failed install deletes only the new
	// version, leaving the active worker's cache intact.
	await caches.delete(CORE_CACHE);
	const cache = await caches.open(CORE_CACHE);
	try {
		const concurrency = 8;
		for (let i = 0; i < CORE_ASSETS.length; i += concurrency) {
			await Promise.all(CORE_ASSETS.slice(i, i + concurrency).map(async asset => {
				const [request, response] = await fetchAndValidate(asset);
				await cache.put(request, response);
			}));
		}
		if ((await cache.keys()).length !== CORE_ASSETS.length) {
			throw new Error('Offline core cache is incomplete.');
		}
	} catch (error) {
		await caches.delete(CORE_CACHE);
		throw error;
	}
}

async function pruneMediaCache(cache: Cache): Promise<void> {
	const keys = await cache.keys();
	const excess = keys.length - MEDIA_CACHE_LIMIT;
	for (let i = 0; i < excess; i++) {
		const key = keys[i];
		if (key) await cache.delete(key);
	}
}

async function cacheOptionalMedia(asset: string, cache: Cache): Promise<void> {
	try {
		const assetURL = new URL(asset, serviceWorker.registration.scope).href;
		if (await cache.match(assetURL)) return;
		const [request, response] = await fetchAndValidate(asset, 8000);
		const url = new URL(request.url);
		if (url.origin !== serviceWorker.location.origin || !isRuntimeMedia(url)) return;
		await cache.put(request, response);
	} catch {}
}

async function warmOptionalMedia(): Promise<void> {
	try {
		const cache = await caches.open(MEDIA_CACHE);
		const concurrency = 8;
		for (let i = 0; i < OPTIONAL_MEDIA.length; i += concurrency) {
			await Promise.all(OPTIONAL_MEDIA.slice(i, i + concurrency).map(asset => cacheOptionalMedia(asset, cache)));
		}
		await pruneMediaCache(cache);
	} catch {}
}

function requestMediaWarmup(): Promise<void> {
	if (!mediaWarmPromise) {
		mediaWarmPromise = warmOptionalMedia().finally(() => {
			mediaWarmPromise = null;
		});
	}
	return mediaWarmPromise;
}

serviceWorker.addEventListener('install', event => {
	event.waitUntil(installCore());
});

serviceWorker.addEventListener('message', event => {
	if (!event.data) return;
	if (event.data.type === 'SKIP_WAITING') event.waitUntil(serviceWorker.skipWaiting());
	if (event.data.type === 'WARM_OFFLINE_MEDIA') event.waitUntil(requestMediaWarmup());
});

serviceWorker.addEventListener('activate', event => {
	event.waitUntil((async () => {
		const keep = new Set([CORE_CACHE, MEDIA_CACHE]);
		for (const cacheName of await caches.keys()) {
			if ((cacheName.startsWith(CORE_CACHE_PREFIX) || cacheName.startsWith(MEDIA_CACHE_PREFIX)) &&
				!keep.has(cacheName)) {
				await caches.delete(cacheName);
			}
		}
		await serviceWorker.clients.claim();
	})());
});

async function matchCore(requestOrUrl: RequestInfo): Promise<Response | undefined> {
	try {
		const cache = await caches.open(CORE_CACHE);
		return await cache.match(requestOrUrl, { ignoreSearch: true });
	} catch {
		return undefined;
	}
}

async function cacheFirstNavigation(request: Request): Promise<Response> {
	const cached = await matchCore(request) || await matchCore('/offline.html');
	if (cached) return cached;
	try {
		const response = await fetch(request);
		if (response.status >= 200 && response.status < 300 &&
			contentTypeMatches('html', response.headers.get('content-type'))) {
			return response;
		}
	} catch {}
	return new Response('Pokemon Showdown is unavailable offline.', {
		status: 503,
		headers: { 'content-type': 'text/plain; charset=utf-8' },
	});
}

async function cacheFirstStatic(request: Request): Promise<Response> {
	const cached = await matchCore(request);
	if (cached) return cached;
	return fetch(request);
}

async function cacheFirstMedia(request: Request, event: FetchEvent): Promise<Response> {
	let cache: Cache | null = null;
	try {
		cache = await caches.open(MEDIA_CACHE);
		const cached = await cache.match(request);
		if (cached) return cached;
	} catch {}
	const response = await fetch(request);
	if (cache && isValidResponse(response, request.url)) {
		const mediaCache = cache;
		event.waitUntil((async () => {
			try {
				await mediaCache.put(request, response.clone());
				await pruneMediaCache(mediaCache);
			} catch {}
		})());
	}
	return response;
}

function shouldRouteRequest(request: Request): boolean {
	if (request.method !== 'GET' || request.headers.has('range')) return false;
	const url = new URL(request.url);
	if (url.origin !== serviceWorker.location.origin || isDynamicRequest(url)) return false;
	return isNavigation(request) || CORE_PATHS.has(url.pathname) ||
		isRuntimeMedia(url) || isAllowlistedStatic(url);
}

async function routeRequest(request: Request, event: FetchEvent): Promise<Response> {
	const url = new URL(request.url);
	if (isNavigation(request)) return cacheFirstNavigation(request);
	if (CORE_PATHS.has(url.pathname)) return cacheFirstStatic(request);
	if (isRuntimeMedia(url)) return cacheFirstMedia(request, event);
	if (isAllowlistedStatic(url)) return cacheFirstStatic(request);
	return fetch(request);
}

serviceWorker.addEventListener('fetch', event => {
	if (!shouldRouteRequest(event.request)) return;
	event.respondWith(routeRequest(event.request, event));
});
