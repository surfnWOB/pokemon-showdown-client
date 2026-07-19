const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {describe, it} = require('node:test');
const vm = require('node:vm');

const {
	OPTIONAL_MEDIA,
	collectClassicCore,
	computeOfflineVersion,
	toURLPath,
} = require('../caches/offline-tools/node/policy');
const {collectLocalStylesheetImports} = require('../caches/offline-tools/node/css-imports');
const {buildFormatTokens, renderOfflineFormats} = require('../caches/offline-tools/node/formats');
const {finalizeOfflineBuild} = require('../caches/offline-tools/node/finalize');
const {assertDeploymentShellReady, renderOfflineShell} = require('../caches/offline-tools/node/shell');
const {loadWorkerRuntime, renderServiceWorker} = require('../caches/offline-tools/node/worker-render');

const ROOT = path.resolve(__dirname, '..');
const WORKER_RUNTIME = loadWorkerRuntime(ROOT);

describe('offline build tooling', () => {
	it('serializes the same sections and display bits as the server protocol', () => {
		const formats = [
			{section: 'Singles', column: 2},
			{
				name: '[Gen 9] OU', searchShow: true, challengeShow: true, tournamentShow: true,
				bestOfDefault: true, teraPreviewDefault: true,
			},
			{name: '[Gen 9] Hidden', searchShow: false, challengeShow: false, tournamentShow: false},
			{section: 'Doubles'},
			{
				name: '[Gen 9] VGC', team: 'random', searchShow: true, challengeShow: false,
				tournamentShow: true, itemClauseDefault: true,
			},
		];
		const ruleTables = new Map([
			[formats[1], {adjustLevel: 50}],
			[formats[3], {maxLevel: 50}],
		]);
		const Dex = {
			formats: {
				all: () => formats,
				getRuleTable: format => ruleTables.get(format) || {},
			},
		};

		assert.deepEqual(buildFormatTokens(Dex), [
			'formats', ',LL', ',2', 'Singles', '[Gen 9] OU,de', ',2', 'Doubles', '[Gen 9] VGC,10b',
		]);
		assert.equal(buildFormatTokens(Dex, '')[1], ',2');
	});

	it('uses browser-equivalent URL paths without confusing path data with queries', () => {
		assert.equal(toURLPath('pokemonshowdownbeta@2x.png'), '/pokemonshowdownbeta@2x.png');
		assert.equal(toURLPath('space #?.png'), '/space%20%23%3F.png');
	});

	it('renders a deterministic browser catalog and compatibility alias', () => {
		const rendered = renderOfflineFormats(['formats', ',1', 'Singles', '[Gen 9] OU,e']);
		assert.match(rendered, /globalThis\.OfflineFormats = \{protocol:/);
		assert.match(rendered, /globalThis\.OfflineBattleFormats = globalThis\.OfflineFormats\.formats/);
		assert.doesNotMatch(rendered, /typeof window|\bglobal\b/);
		assert.doesNotMatch(rendered, /Date\(|timestamp/i);
	});

	it('hashes asset names, contents, and worker policy deterministically', () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-offline-'));
		try {
			fs.writeFileSync(path.join(directory, 'a.js'), 'one');
			const first = computeOfflineVersion(directory, ['/a.js'], 'policy');
			assert.equal(first, computeOfflineVersion(directory, ['/a.js'], 'policy'));
			fs.writeFileSync(path.join(directory, 'a.js'), 'two');
			assert.notEqual(first, computeOfflineVersion(directory, ['/a.js'], 'policy'));
			assert.notEqual(
				computeOfflineVersion(directory, ['/a.js'], 'policy'),
				computeOfflineVersion(directory, ['/a.js'], 'different policy')
			);
			const mediaA = renderServiceWorker(WORKER_RUNTIME, {
				version: '00000000000000000000', coreAssets: ['/a.js'],
				mediaAssets: ['/sprites/a.png'], mediaCacheLimit: 10,
			});
			const changedMedia = renderServiceWorker(WORKER_RUNTIME, {
				version: '00000000000000000000', coreAssets: ['/a.js'],
				mediaAssets: ['/sprites/b.png'], mediaCacheLimit: 10,
			});
			const changedLimit = renderServiceWorker(WORKER_RUNTIME, {
				version: '00000000000000000000', coreAssets: ['/a.js'],
				mediaAssets: ['/sprites/a.png'], mediaCacheLimit: 11,
			});
			assert.notEqual(
				computeOfflineVersion(directory, ['/a.js'], mediaA),
				computeOfflineVersion(directory, ['/a.js'], changedMedia)
			);
			assert.notEqual(
				computeOfflineVersion(directory, ['/a.js'], mediaA),
				computeOfflineVersion(directory, ['/a.js'], changedLimit)
			);
			fs.writeFileSync(path.join(directory, 'media.png'), 'first background');
			const firstMediaContent = computeOfflineVersion(directory, ['/a.js'], mediaA, ['/media.png']);
			fs.writeFileSync(path.join(directory, 'media.png'), 'second background');
			assert.notEqual(
				firstMediaContent,
				computeOfflineVersion(directory, ['/a.js'], mediaA, ['/media.png'])
			);
		} finally {
			fs.rmSync(directory, {recursive: true, force: true});
		}
	});

	it('renders an atomic, user-approved and privacy-bounded worker', () => {
		const worker = renderServiceWorker(WORKER_RUNTIME, {
			version: 'fixture',
			coreAssets: ['/testclient-old.html', '/config/config.js'],
			mediaAssets: ['/sprites/pokemonicons-sheet.png?v22'],
		});

		assert.doesNotMatch(worker, /INSTALL_CACHE/);
		assert.match(worker, /cache is content-versioned/i);
		const installHandler = worker.slice(
			worker.indexOf("serviceWorker.addEventListener('install'"),
			worker.indexOf("serviceWorker.addEventListener('message'")
		);
		assert.doesNotMatch(installHandler, /warmOptionalMedia/);
		assert.match(worker, /WARM_OFFLINE_MEDIA.*event\.waitUntil\(requestMediaWarmup\(\)\)/s);
		assert.match(worker, /let mediaWarmPromise = null/);
		assert.match(worker, /if \(await cache\.match\(assetURL\)\)\s*return/);
		assert.equal((worker.match(/const concurrency = 8/g) || []).length, 2);
		assert.match(worker, /AbortSignal\.timeout\(timeout\)/);
		assert.doesNotMatch(worker, /new AbortController|setTimeout\(\(\) => controller\.abort/);
		assert.match(worker, /await cache\.put\(request, response\)/);
		assert.match(worker, /event\.data\.type === 'SKIP_WAITING'\)[^]*event\.waitUntil\(serviceWorker\.skipWaiting\(\)\)/);
		assert.doesNotMatch(worker, /skipWaiting\(\)[^}]*install/);
		assert.match(worker, /request\.method !== 'GET'/);
		assert.match(worker, /request\.headers\.has\('range'\)/);
		assert.match(worker, /url\.origin !== serviceWorker\.location\.origin/);
		assert.match(worker, /account\|action\|api\|auth\|battle\|chat/);
		assert.match(worker, /contentTypeMatches\('html'/);
		assert.match(worker, /pruneMediaCache/);
		assert.doesNotMatch(worker, /cache\.match\(request, \{ ignoreSearch: true \}\)/);
		const mediaHandler = worker.slice(
			worker.indexOf('async function cacheFirstMedia'),
			worker.indexOf('function shouldRouteRequest')
		);
		assert.equal((mediaHandler.match(/fetch\(request\)/g) || []).length, 1);
		assert.match(worker, /if \(!shouldRouteRequest\(event\.request\)\)[^]*return;/);
		const navigation = worker.indexOf('async function cacheFirstNavigation');
		assert.ok(worker.indexOf('const cached = await matchCore', navigation) <
			worker.indexOf('await fetch(request)', navigation));
		assert.throws(() => renderServiceWorker(WORKER_RUNTIME, {
			version: 'fixture',
			coreAssets: ['/testclient-old.html'],
			mediaAssets: ['https://example.com/sprite.png'],
		}), /root-relative media assets/);
		for (const maliciousPath of ['//example.com/sprite.png', '/\\example.com/sprite.png', '/sprite.png#private']) {
			assert.throws(() => renderServiceWorker(WORKER_RUNTIME, {
				version: 'fixture',
				coreAssets: ['/testclient-old.html'],
				mediaAssets: [maliciousPath],
			}), /root-relative media assets/);
		}
	});

	it('serves build-versioned configuration from the atomic core without network access', async () => {
		const worker = renderServiceWorker(WORKER_RUNTIME, {
			version: 'fixture',
			coreAssets: ['/offline.html', '/config/config.js'],
		});
		const listeners = new Map();
		let fetchCalls = 0;
		const cachedConfig = 'globalThis.Config = {source: "offline-core"};';
		const context = vm.createContext({
			AbortSignal,
			Headers,
			Request,
			Response,
			URL,
			registration: {scope: 'https://offline.invalid/'},
			location: {origin: 'https://offline.invalid'},
			clients: {claim: async () => {}},
			caches: {
				open: async () => ({
					match: async () => new Response(cachedConfig, {
						headers: {'content-type': 'application/javascript'},
					}),
				}),
			},
			fetch: async () => {
				fetchCalls++;
				return new Response('globalThis.Config = {source: "network"};', {
					headers: {'content-type': 'application/javascript'},
				});
			},
			addEventListener: (type, listener) => listeners.set(type, listener),
		});
		vm.runInContext(worker, context);

		let responsePromise;
		listeners.get('fetch')({
			request: new Request('https://offline.invalid/config/config.js'),
			respondWith: response => {
				responsePromise = response;
			},
		});

		assert.ok(responsePromise);
		const response = await responsePromise;
		assert.equal(await response.text(), cachedConfig);
		assert.equal(fetchCalls, 0);
	});

	it('keeps UI media available without making battle FX part of the atomic core', () => {
		assert.ok(OPTIONAL_MEDIA.includes('/sprites/pokemonicons-sheet.png?v22'));
		assert.ok(OPTIONAL_MEDIA.includes('/sprites/itemicons-sheet.png?v1'));
		assert.ok(OPTIONAL_MEDIA.includes('/sprites/types/Fire.png'));
		assert.ok(OPTIONAL_MEDIA.includes('/fx/client-bg-shaymin.jpg'));
		assert.ok(OPTIONAL_MEDIA.every(asset => !asset.startsWith('/audio/')));

		const core = collectClassicCore(ROOT);
		const stylesheetImports = collectLocalStylesheetImports(
			path.join(ROOT, 'play.pokemonshowdown.com'), ['/style/battle.css']
		);
		assert.ok(core.includes('/fx/client-bg-charizards.jpg'));
		assert.ok(core.includes('/fx/client-bgsheet.png'));
		assert.ok(core.includes('/pokemonshowdownbeta@2x.png'));
		assert.ok(stylesheetImports.some(s => s.startsWith('/style/battle-log.css?v')));
		assert.ok(!core.includes('/fx/angry.png'));
		assert.ok(!core.includes('/js/panels.js'));
		assert.ok(!core.some(asset => asset.startsWith('/showdex/')));
		assert.ok(core.includes('/style/fonts/fontawesome-webfont.woff2'));
		assert.ok(!core.some(asset => /^\/style\/fonts?\/.*\.(?:eot|otf|svg|ttf|woff)$/.test(asset)));
		assert.ok(!core.some(asset => asset.startsWith('/replays-js/')));
	});

	it('recursively promotes local stylesheet imports into the atomic core', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-offline-css-'));
		const webRoot = path.join(root, 'play.pokemonshowdown.com');
		try {
			fs.mkdirSync(path.join(webRoot, 'style/nested'), {recursive: true});
			fs.writeFileSync(path.join(webRoot, 'offline.html'),
				'<link rel="stylesheet" href="/style/root.css" />');
			fs.writeFileSync(path.join(webRoot, 'style/root.css'), [
				'@import url("./base.css?v=12.6") screen;',
				'@import url("./theme\\2e css") layer(theme);',
				'@import "https://example.com/external.css";',
				'@import "https://offline.invalid/not-local.css";',
				'@import "//offline.invalid/not-local-either.css";',
				'@import "blob:https://offline.invalid/not-local-blob.css";',
				'@\\69 mport u\\72 l("./escaped-identifiers.css");',
				'@custom @import "./custom-ghost.css";',
				'/* @import "./commented.css"; */',
				'.fixture::before { content: "@import \'./ghost.css\';"; }',
			].join('\n'));
			fs.writeFileSync(path.join(webRoot, 'style/base.css'), [
				'@import "./nested/theme.css#current";',
				'@import url("./root.css");',
			].join('\n'));
			fs.writeFileSync(path.join(webRoot, 'style/nested/theme.css'), '.fixture { color: green; }');
			fs.writeFileSync(path.join(webRoot, 'style/theme.css'), '.fixture { color: purple; }');
			fs.writeFileSync(path.join(webRoot, 'style/escaped-identifiers.css'), '.fixture { color: blue; }');

			const core = collectClassicCore(root);
			assert.ok(core.includes('/style/root.css'));
			assert.ok(core.includes('/style/base.css?v=12.6'));
			assert.ok(core.includes('/style/nested/theme.css'));
			assert.ok(core.includes('/style/theme.css'));
			assert.ok(core.includes('/style/escaped-identifiers.css'));
			assert.ok(!core.some(asset => asset.includes('example.com')));
			assert.ok(!core.some(asset => asset.includes('offline.invalid')));
			assert.ok(!core.includes('/not-local.css'));
			assert.ok(!core.includes('/not-local-either.css'));
			assert.ok(!core.some(asset => /(?:commented|ghost|not-local-blob)\.css/.test(asset)));
		} finally {
			fs.rmSync(root, {recursive: true, force: true});
		}
	});

	it('derives a fork-local shell without modifying the upstream entrypoint', () => {
		const source = fs.readFileSync(path.join(ROOT, 'play.pokemonshowdown.com/testclient-old.html'), 'utf8');
		const shell = renderOfflineShell(source);
		assert.doesNotMatch(source, /Generated fork-local offline integration/);
		assert.match(shell, /href="\/offline\.webmanifest"/);
		assert.match(shell, /href="\/style\/offline\.css"/);
		assert.ok(shell.indexOf('/data/offline-formats.js') < shell.indexOf('window.app = new App();'));
		assert.ok(shell.indexOf('/js/oldclient/offline.js') < shell.indexOf('window.app = new App();'));
		assert.match(shell, /src="\/config\/config\.js"/);
		assert.doesNotMatch(shell, /Config\.testclient\s*=\s*true/);
		assert.doesNotMatch(shell, /config\/testclient-key\.js/);
		assert.throws(() => assertDeploymentShellReady(source), /same-origin config/);
		assert.doesNotThrow(() => assertDeploymentShellReady(shell));
		assert.throws(() => assertDeploymentShellReady(shell.replace(
			'</body>', '<script src="/config/testclient-key.js"></script></body>'
		)), /test-client key/);
	});

	it('ignores unrelated outputs outside the classic asset policy', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-offline-policy-'));
		const webRoot = path.join(root, 'play.pokemonshowdown.com');
		try {
			fs.mkdirSync(path.join(webRoot, 'js'), {recursive: true});
			fs.mkdirSync(path.join(webRoot, 'style'), {recursive: true});
			fs.writeFileSync(path.join(webRoot, 'offline.html'), [
				'<link rel="stylesheet" href="/style/classic.css" />',
				'<script src="/js/classic.js"></script>',
				'<a href="/teambuilder">Teambuilder</a>',
			].join('\n'));
			fs.writeFileSync(path.join(webRoot, 'js/classic.js'), 'classic');
			fs.writeFileSync(path.join(webRoot, 'style/classic.css'), 'classic');
			const before = collectClassicCore(root);
			assert.ok(before.includes('/js/classic.js'));
			assert.ok(before.includes('/style/classic.css'));
			assert.ok(!before.includes('/teambuilder'));
			fs.writeFileSync(path.join(webRoot, 'js/unrelated-preact.js'), 'unrelated');
			assert.deepEqual(collectClassicCore(root), before);
		} finally {
			fs.rmSync(root, {recursive: true, force: true});
		}
	});

	it('removes a stale worker before any strict finalization failure', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-offline-stale-worker-'));
		const webRoot = path.join(root, 'play.pokemonshowdown.com');
		const worker = path.join(webRoot, 'service-worker.js');
		try {
			fs.mkdirSync(webRoot, {recursive: true});
			fs.writeFileSync(worker, 'stale worker');
			assert.throws(() => finalizeOfflineBuild({repoRoot: root, strict: true}), /ENOENT/);
			assert.equal(fs.existsSync(worker), false);
		} finally {
			fs.rmSync(root, {recursive: true, force: true});
		}
	});
});
