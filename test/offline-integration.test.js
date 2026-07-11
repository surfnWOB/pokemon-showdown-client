const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {describe, it} = require('node:test');

const {renderOfflineShell} = require('../caches/offline-tools/node/shell');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
	return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('offline production integration', () => {
	it('derives one offline entrypoint from the unmodified classic shell', () => {
		const source = read('play.pokemonshowdown.com/testclient-old.html');
		const shell = renderOfflineShell(source);
		const formats = shell.indexOf('/data/offline-formats.js');
		const controller = shell.indexOf('/js/oldclient/offline.js');
		const appStart = shell.indexOf('new App()');

		assert.doesNotMatch(source, /offline-formats|oldclient\/offline|offline\.webmanifest/);
		assert.ok(formats >= 0);
		assert.ok(controller > formats);
		assert.ok(appStart > controller);
		assert.match(shell, /rel="manifest" href="\/offline\.webmanifest"/);
		assert.match(shell, /rel="apple-touch-icon" href="\/favicon-192\.png"/);
		assert.match(shell, /style\/offline\.css/);
	});

	it('loads offline-only scripts as native modules without a legacy bootstrap', () => {
		const source = read('play.pokemonshowdown.com/testclient-old.html');
		const shell = renderOfflineShell(source);

		assert.match(shell, /<script type="module" src="\/data\/offline-formats\.js"><\/script>/);
		assert.match(shell, /<script type="module" src="\/js\/oldclient\/offline\.js"><\/script>/);
		assert.doesNotMatch(shell, /new Function|document\.write|ES3-safe/);
	});

	it('keeps install metadata in a fork-local manifest', () => {
		const upstreamManifest = read('play.pokemonshowdown.com/manifest.json');
		const manifest = JSON.parse(read('play.pokemonshowdown.com/offline.webmanifest'));
		const sizes = manifest.icons.map(icon => icon.sizes);

		assert.equal(manifest.id, '/');
		assert.equal(manifest.scope, '/');
		assert.equal(manifest.start_url, '/');
		assert.equal(manifest.display, 'standalone');
		assert.match(manifest.description, /offline teambuilder support/);
		assert.equal(manifest.lang, 'en');
		assert.ok(sizes.includes('192x192'));
		assert.ok(sizes.includes('512x512'));
		assert.doesNotMatch(upstreamManifest, /favicon-512/);
	});

	it('finalizes exactly once after deployment-specific mutations', () => {
		const dockerfile = read('Dockerfile');
		const baseBuild = read('build');
		const finalizerSource = read('build-tools/offline/finalize.ts');
		const finalConfig = dockerfile.lastIndexOf('Config.routes.replays');
		const finalizer = dockerfile.lastIndexOf('offline:finalize -- --strict');

		assert.ok(finalizer > finalConfig);
		assert.doesNotMatch(dockerfile, /testclient-key stub/);
		assert.equal((dockerfile.match(/offline:finalize/g) || []).length, 1);
		assert.doesNotMatch(dockerfile, /sed -i.*testclient-old/);
		assert.doesNotMatch(baseBuild, /offline/);
		assert.ok(finalizerSource.indexOf('generateClassicOfflineClient') <
			finalizerSource.indexOf('generateOfflineShell'));
	});

	it('isolates offline delivery headers in one Nginx include', () => {
		const nginx = read('docker/nginx-client.conf');
		const offline = read('docker/nginx-offline.inc');

		assert.match(nginx, /include \/etc\/nginx\/conf\.d\/offline\.inc/);
		assert.match(nginx, /index offline\.html/);
		assert.match(nginx, /\/offline\.html/);
		assert.match(offline, /location = \/service-worker\.js/);
		assert.match(offline, /no-store, no-cache, must-revalidate/);
		assert.match(offline, /location = \/offline\.webmanifest/);
		assert.match(offline, /default_type application\/manifest\+json/);
	});

	it('keeps same-origin sprite policy in offline.css', () => {
		const offline = read('play.pokemonshowdown.com/style/offline.css');
		assert.match(offline, /url\(\/sprites\/gen5\/meloetta\.png\)/);
		assert.match(offline, /url\(\/sprites\/trainers-sheet\.png\)/);
		assert.match(offline, /url\(\/sprites\/typeicons\/Fire\.png\)/);
	});

	it('exposes one classic-client attachment seam', () => {
		const client = read('play.pokemonshowdown.com/src/oldclient/client.js');
		const menu = read('play.pokemonshowdown.com/src/oldclient/client-mainmenu.js');
		const references = client.match(/OfflineClient/g) || [];

		assert.equal(references.length, 2);
		assert.match(client, /OfflineClient\.attach\(this\)/);
		assert.doesNotMatch(menu, /OfflineClient|aria-disabled/);
	});

	it('typechecks Node finalization, the classic adapter, and worker runtime as separate strict projects', () => {
		const nodeConfig = JSON.parse(read('build-tools/offline/tsconfig.json'));
		const classicConfig = JSON.parse(read('build-tools/offline/classic/tsconfig.json'));
		const workerConfig = JSON.parse(read('build-tools/offline/worker/tsconfig.json'));

		assert.equal(nodeConfig.compilerOptions.strict, true);
		assert.equal(classicConfig.compilerOptions.strict, true);
		assert.equal(classicConfig.compilerOptions.noEmit, true);
		assert.ok(classicConfig.compilerOptions.lib.includes('DOM'));
		assert.equal(workerConfig.compilerOptions.strict, true);
		assert.ok(workerConfig.compilerOptions.lib.includes('WebWorker'));
		assert.ok(fs.existsSync(path.join(ROOT, 'caches/offline-tools/node/classic-render.js')));
		assert.ok(fs.existsSync(path.join(ROOT, 'caches/offline-tools/worker-runtime.js')));
	});
});
