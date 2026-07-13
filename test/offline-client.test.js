const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {describe, it} = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const authoringSourcePath = path.join(ROOT, 'build-tools/offline/classic/offline.ts');
const sourcePath = path.join(ROOT, 'play.pokemonshowdown.com/js/oldclient/offline.js');
const authoringSource = fs.readFileSync(authoringSourcePath, 'utf8');
const {renderClassicOfflineClient} = require('../caches/offline-tools/node/classic-render');
const source = renderClassicOfflineClient(authoringSource, ROOT);

function eventTarget(properties) {
	const listeners = Object.create(null);
	return Object.assign(properties || {}, {
		addEventListener(name, listener) {
			(listeners[name] || (listeners[name] = [])).push(listener);
		},
		dispatch(name, event) {
			for (const listener of listeners[name] || []) listener.call(this, event || {type: name});
		},
	});
}

function makeDocument() {
	function makeElement(tagName) {
		const element = eventTarget({
			tagName: tagName.toUpperCase(),
			children: [],
			style: {},
			attributes: Object.create(null),
			appendChild(child) {
				this.children.push(child);
				child.parentNode = this;
				return child;
			},
			removeChild(child) {
				const index = this.children.indexOf(child);
				if (index >= 0) this.children.splice(index, 1);
				return child;
			},
			setAttribute(name, value) {
				this.attributes[name] = '' + value;
			},
			removeAttribute(name) {
				delete this.attributes[name];
			},
		});
		Object.defineProperty(element, 'firstChild', {
			get() {
				return this.children[0] || null;
			},
		});
		return element;
	}

	const document = eventTarget({
		readyState: 'complete',
		createElement: makeElement,
		createTextNode(value) {
			return {nodeType: 3, data: '' + value};
		},
	});
	document.body = makeElement('body');
	document.getElementById = function (id) {
		function find(element) {
			if (element.id === id) return element;
			for (const child of element.children || []) {
				const result = find(child);
				if (result) return result;
			}
			return null;
		}
		return find(document.body);
	};
	return document;
}

function elementText(element) {
	let result = typeof element.textContent === 'string' ? element.textContent : '';
	for (const child of element.children || []) {
		result += child.nodeType === 3 ? child.data : elementText(child);
	}
	return result;
}

function makeJQueryHarness(options) {
	options = options || {};
	let validationPresent = options.validationPresent !== false;
	function control(disabled) {
		return {disabled, classes: new Set(disabled ? ['disabled'] : []), attributes: Object.create(null)};
	}
	const network = control(false);
	const validation = control(false);
	const teamUpload = control(false);
	const roomAction = control(false);
	const availableBattle = control(false);
	const unavailableBattle = control(true);
	const localTeambuilderBig = control(false);
	const scopeSelectors = [];

	function selection(elements, scope) {
		return {
			length: elements.length,
			addClass(classNames) {
				for (const element of elements) for (const name of classNames.split(/\s+/)) element.classes.add(name);
				return this;
			},
			attr(name, value) {
				for (const element of elements) element.attributes[name] = value;
				return this;
			},
			filter(selector) {
				if (selector === ':not(:disabled)') return selection(elements.filter(element => !element.disabled), scope);
				if (selector === '.offline-disabled') {
					return selection(elements.filter(element => element.classes.has('offline-disabled')), scope);
				}
				return selection([], scope);
			},
			find(selector) {
				const found = [];
				if (selector === 'button.big') {
					if (scope.includes('.mainmenu')) found.push(availableBattle, unavailableBattle);
					if (scope.includes('#room-teambuilder')) found.push(localTeambuilderBig);
				} else {
					if (scope.includes('.mainmenu')) found.push(network);
					if (scope.includes('#room-teambuilder') && selector.includes('button[name="validate"]') &&
						validationPresent) {
						found.push(validation);
					}
				}
				return selection(found, scope);
			},
			hasClass(className) {
				return elements.some(element => element.classes.has(className));
			},
			prop(name, value) {
				for (const element of elements) element[name] = value;
				return this;
			},
			removeAttr(name) {
				for (const element of elements) delete element.attributes[name];
				return this;
			},
			removeClass(classNames) {
				for (const element of elements) for (const name of classNames.split(/\s+/)) element.classes.delete(name);
				return this;
			},
		};
	}
	return {
		network,
		validation,
		teamUpload,
		roomAction,
		availableBattle,
		unavailableBattle,
		localTeambuilderBig,
		jquery(selector) {
			scopeSelectors.push(selector);
			const direct = [];
			if (validationPresent && selector.includes('#room-teambuilder button[name="validate"]')) {
				direct.push(validation);
			}
			if (selector.includes('#room-teambuilder button[name="psExport"]')) direct.push(teamUpload);
			if (selector.includes('#room-rooms button[name="toggleMoreRooms"]')) direct.push(roomAction);
			return selection(direct, selector);
		},
		scopeSelectors,
		revealValidation() {
			validationPresent = true;
		},
	};
}

function makeStorage() {
	const values = Object.create(null);
	return {
		values,
		getItem(key) {
			return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
		},
		setItem(key, value) {
			values[key] = '' + value;
		},
	};
}

function loadController(options) {
	options = options || {};
	let reloads = 0;
	const root = eventTarget({
		JSON,
		Config: options.Config || {server: {id: 'showdown'}},
		navigator: options.navigator || {onLine: true},
		location: {
			reload() {
				reloads++;
			},
		},
	});
	if (options.document !== false) root.document = options.document || makeDocument();
	if (options.storage !== false) root.localStorage = options.storage || makeStorage();
	if (options.app) root.app = options.app;
	if (options.BattleFormats) root.BattleFormats = options.BattleFormats;
	if (options.$) root.$ = options.$;
	if (options.OfflineFormats) root.OfflineFormats = options.OfflineFormats;
	if (options.OfflineBattleFormats) root.OfflineBattleFormats = options.OfflineBattleFormats;
	if (options.ReconnectPopup) root.ReconnectPopup = options.ReconnectPopup;
	if (options.MutationObserver) root.MutationObserver = options.MutationObserver;

	const context = vm.createContext({
		window: root,
		console,
		setTimeout,
		clearTimeout,
	});
	new vm.Script(source, {filename: sourcePath}).runInContext(context);
	return {
		api: root.OfflineClient,
		root,
		get reloads() {
			return reloads;
		},
	};
}

describe('OfflineClient', () => {
	it('authors the controller in modern TypeScript and renders current-browser JavaScript', () => {
		const acorn = require('acorn');
		const browserslist = require('browserslist');
		const browserConfig = browserslist.loadConfig({path: path.join(ROOT, 'build-tools/offline')});
		assert.match(authoringSource, /interface\s+OfflineClient/);
		assert.match(authoringSource, /\bconst\b/);
		assert.doesNotThrow(() => acorn.parse(source, {ecmaVersion: 2022, sourceType: 'module'}));
		assert.match(source, /\?\./);
		assert.match(source, /\bconst\b/);
		assert.doesNotMatch(source, /\b(?:interface|type)\s+[A-Za-z_$]/);
		assert.match(source, /Date\.now/);
		assert.doesNotMatch(source, /attachEvent|module\.exports|typeof module/);
		assert.deepEqual(browserConfig, [
			'last 3 Chrome major versions',
			'last 3 Edge major versions',
			'last 3 Firefox major versions',
			'last 3 Safari major versions',
			'last 3 iOS major versions',
		]);
	});

	it('publishes the controller through the browser global without legacy module shims', () => {
		const loaded = loadController({document: false, storage: false});
		assert.equal(loaded.api, loaded.root.OfflineClient);
		assert.equal(loaded.root.OfflineClient.workerURL, '/service-worker.js');
		assert.equal(loaded.root.OfflineClient.storageSchema, 1);
		assert.equal(loaded.root.OfflineClient.isKnownOffline(), false);
	});

	it('persists raw formats per server and restores them in offline-only mode', () => {
		const storage = makeStorage();
		const loaded = loadController({
			storage,
			Config: {server: {id: 'alpha:8000'}},
			OfflineFormats: {formats: ['formats', 'Generated Format,4']},
		});
		assert.equal(loaded.api.saveFormats(['formats', 'Cached Format,e']), true);

		const keys = Object.keys(storage.values);
		assert.equal(keys.length, 1);
		assert.match(keys[0], /alpha%3A8000$/);
		const saved = JSON.parse(storage.values[keys[0]]);
		assert.equal(saved.schema, 1);
		assert.equal(saved.serverID, 'alpha:8000');
		assert(saved.timestamp > 0);
		assert.deepEqual(saved.formats, ['formats', 'Cached Format,e']);

		let parsed;
		let menuUpdates = 0;
		const app = {
			sendQueue: ['queued network command'],
			trigger(name) {
				if (name === 'init:formats') menuUpdates++;
			},
			parseFormats(raw) {
				parsed = Array.from(raw);
				loaded.root.BattleFormats = {
					cachedformat: {
						searchShow: true,
						challengeShow: true,
						tournamentShow: true,
						rated: true,
					},
				};
			},
		};

		assert.equal(loaded.api.enterOffline(app, 'offline'), true);
		assert.deepEqual(parsed, ['formats', 'Cached Format,e']);
		assert.equal('sendQueue' in app, false);
		assert.equal(app.offlineMode, true);
		assert.equal(app.isDisconnected, true);
		assert(menuUpdates > 0);
		assert.deepEqual(loaded.root.BattleFormats.cachedformat, {
			searchShow: false,
			challengeShow: false,
			tournamentShow: false,
			rated: false,
		});
	});

	it('preserves classic team storage across offline actions and reconnects', () => {
		const storage = makeStorage();
		const teams = 'gen9]Offline Team|Pikachu||lightball|static|thunderbolt|Timid||||||';
		storage.setItem('showdown_teams', teams);
		let sends = 0;
		const app = {
			initializeConnection() {},
			connect() {},
			send() {
				sends++;
			},
			parseFormats() {},
		};
		const loaded = loadController({
			app,
			storage,
			BattleFormats: {},
			OfflineFormats: {formats: ['formats', 'Offline Format,4']},
		});
		const assertTeamsUnchanged = () => assert.equal(storage.getItem('showdown_teams'), teams);

		assertTeamsUnchanged();
		loaded.root.dispatch('offline');
		assertTeamsUnchanged();
		assert.equal(app.send('/vtm gen9ou'), false);
		assert.equal(sends, 0);
		assertTeamsUnchanged();
		assert.equal(loaded.api.saveFormats(['formats', 'Updated Format,e']), true);
		assertTeamsUnchanged();
		loaded.api.setConnected(app);
		assertTeamsUnchanged();
	});

	it('attaches all classic-client behavior through one idempotent adapter seam', () => {
		const storage = makeStorage();
		const handlers = Object.create(null);
		let initializationCalls = 0;
		let connectionCalls = 0;
		let sendCalls = 0;
		let parsed;
		const app = {
			on(name, listener) {
				(handlers[name] || (handlers[name] = [])).push(listener);
			},
			trigger(name) {
				for (const listener of handlers[name] || []) listener();
			},
			initializeConnection() {
				initializationCalls++;
			},
			connect() {
				connectionCalls++;
			},
			send() {
				sendCalls++;
				return 'sent';
			},
			parseFormats(raw) {
				parsed = Array.from(raw);
			},
		};
		const loaded = loadController({
			app,
			storage,
			OfflineFormats: {formats: ['formats', ',LL', 'Offline Format,4']},
		});

		assert.equal(loaded.api.attach(app), true);
		assert.equal(loaded.api.attach(app), true);
		app.parseFormats(['formats', 'Online Format,e']);
		assert.deepEqual(parsed, ['formats', 'Online Format,e']);
		assert.equal(Object.keys(storage.values).length, 1);

		loaded.root.navigator.onLine = false;
		loaded.root.dispatch('offline');
		assert.equal(app.initializeConnection(), false);
		assert.equal(app.connect(), false);
		assert.equal(initializationCalls, 0);
		assert.equal(connectionCalls, 0);
		assert.equal(app.send('/search'), false);
		assert.equal(sendCalls, 0);
		assert.deepEqual(parsed, ['formats', 'Online Format,e']);
		loaded.root.document.getElementById('offline-client-status-action').dispatch('click');
		assert.equal(initializationCalls, 1);
		assert.equal(loaded.api.isKnownOffline(), true);
		// A reconnect probe is in flight (reconnecting=true): sends now delegate
		// to the native queue-and-replay path instead of being dropped, so the
		// first post-reconnect message is not lost.
		assert.equal(app.send('/still-connecting'), 'sent');
		assert.equal(sendCalls, 1);

		loaded.root.navigator.onLine = true;
		app.trigger('init:socketopened');
		assert.equal(app.send('/cmd'), 'sent');
		assert.equal(sendCalls, 2);
		app.trigger('init:connectionerror');
		assert.equal(app.offlineMode, true);
		assert.equal(app.isDisconnected, true);
	});

	it('treats a navigator offline event as a hint while the socket is still open', () => {
		const handlers = Object.create(null);
		let sendCalls = 0;
		const app = {
			socket: {readyState: 1},
			on(name, listener) {
				(handlers[name] || (handlers[name] = [])).push(listener);
			},
			trigger(name) {
				for (const listener of handlers[name] || []) listener();
			},
			initializeConnection() {},
			connect() {},
			send() {
				sendCalls++;
				return 'sent';
			},
			parseFormats() {},
		};
		const loaded = loadController({app, storage: makeStorage()});
		assert.equal(loaded.api.attach(app), true);

		// A transient onLine flap must not tear down a healthy live session.
		loaded.root.navigator.onLine = false;
		loaded.root.dispatch('offline');
		assert.equal(loaded.api.isKnownOffline(), false);
		assert.notEqual(app.isDisconnected, true);
		assert.equal(app.send('/pm someone, still here'), 'sent');
		assert.equal(sendCalls, 1);

		// A real socket close remains authoritative and does enter offline.
		app.trigger('init:socketclosed');
		assert.equal(loaded.api.isKnownOffline(), true);
		assert.equal(app.isDisconnected, true);
	});

	it('re-issues open chat room joins on reconnect but not on first connect', () => {
		const handlers = Object.create(null);
		const sent = [];
		const app = {
			socket: {readyState: 1},
			rooms: {
				'': {type: 'mainmenu'},
				lobby: {type: 'chat'},
				help: {type: 'chat'},
				'battle-gen9ou-1': {type: 'battle'},
			},
			on(name, listener) {
				(handlers[name] || (handlers[name] = [])).push(listener);
			},
			trigger(name) {
				for (const listener of handlers[name] || []) listener();
			},
			initializeConnection() {},
			connect() {},
			send(data) {
				sent.push(data);
				return 'sent';
			},
			parseFormats() {},
		};
		const loaded = loadController({app, storage: makeStorage()});
		assert.equal(loaded.api.attach(app), true);

		// First-ever open is a normal boot; App.initialize already autojoins, so
		// the adapter must not re-issue joins here.
		app.trigger('init:socketopened');
		assert.deepEqual(sent, []);

		// A genuine disconnect, then a soft reconnect (second socket open).
		app.trigger('init:socketclosed');
		assert.equal(loaded.api.isKnownOffline(), true);
		app.trigger('init:socketopened');

		// Only non-empty chat rooms are re-joined, using the native '/join <id>';
		// the main menu, battle rooms, and empty id are skipped.
		assert.deepEqual(sent, ['/join lobby', '/join help']);
		assert.equal(loaded.api.isKnownOffline(), false);
	});

	it('attaches when the deferred module runs after the synchronous classic bootstrap', () => {
		const handlers = Object.create(null);
		let sends = 0;
		const app = {
			on(name, listener) {
				(handlers[name] || (handlers[name] = [])).push(listener);
			},
			trigger(name) {
				for (const listener of handlers[name] || []) listener();
			},
			initializeConnection() {},
			connect() {},
			send() {
				sends++;
				return 'sent';
			},
			parseFormats() {},
		};
		const loaded = loadController({
			app,
			OfflineFormats: {formats: ['formats', 'Offline Format,4']},
		});

		app.trigger('init:connectionerror');
		assert.equal(loaded.api.isKnownOffline(), true);
		assert.equal(app.send('/search'), false);
		assert.equal(sends, 0);
	});

	it('re-enables only controls disabled by the offline adapter', () => {
		const controls = makeJQueryHarness();
		const app = {
			initializeConnection() {},
			connect() {},
			send() {},
			parseFormats() {},
		};
		const loaded = loadController({
			$: controls.jquery,
			app,
			BattleFormats: {},
			OfflineFormats: {formats: ['formats', 'Offline Format,4']},
		});

		loaded.api.attach(app);
		assert.equal(controls.availableBattle.disabled, false);
		assert.equal(controls.unavailableBattle.disabled, true);
		loaded.root.dispatch('offline');
		assert.equal(controls.network.disabled, true);
		assert.equal(controls.validation.disabled, true);
		assert.equal(controls.teamUpload.disabled, true);
		assert.equal(controls.roomAction.disabled, true);
		assert.equal(controls.availableBattle.disabled, true);
		assert.equal(controls.localTeambuilderBig.disabled, false);
		loaded.api.setConnected(app);
		assert.equal(controls.network.disabled, false);
		assert.equal(controls.validation.disabled, false);
		assert.equal(controls.teamUpload.disabled, false);
		assert.equal(controls.roomAction.disabled, false);
		assert.equal(controls.availableBattle.disabled, false);
		assert.equal(controls.localTeambuilderBig.disabled, false);
		assert.equal(controls.unavailableBattle.disabled, true);
	});

	it('disables network controls rendered after offline mode begins', () => {
		let mutationListener;
		class MutationObserver {
			constructor(listener) {
				mutationListener = listener;
			}
			observe() {}
		}
		const controls = makeJQueryHarness({validationPresent: false});
		const app = {
			initializeConnection() {},
			connect() {},
			send() {},
			parseFormats() {},
		};
		const loaded = loadController({
			$: controls.jquery,
			app,
			BattleFormats: {},
			OfflineFormats: {formats: ['formats', 'Offline Format,4']},
			MutationObserver,
		});

		loaded.root.dispatch('offline');
		assert.equal(controls.validation.disabled, false);
		controls.revealValidation();
		assert.equal(typeof mutationListener, 'function');
		mutationListener();
		assert.equal(controls.validation.disabled, true);
		assert.ok(controls.scopeSelectors.some(selector =>
			selector.includes('#room-teambuilder button[name="validate"]') &&
			selector.includes('#room-teambuilder button[name="psExport"]') &&
			selector.includes('#room-rooms button[name="toggleMoreRooms"]')
		));
	});

	it('treats navigator offline state as a hint and still permits one connection probe', () => {
		let initializationCalls = 0;
		const app = {
			initializeConnection() {
				initializationCalls++;
				return 'attempted';
			},
			connect() {},
			send() {},
			parseFormats() {},
		};
		const loaded = loadController({
			app,
			navigator: {onLine: false},
			OfflineFormats: {formats: ['formats', 'Offline Format,4']},
		});

		loaded.api.attach(app);
		assert.equal(app.initializeConnection(), 'attempted');
		assert.equal(initializationCalls, 1);
		assert.equal(loaded.api.isKnownOffline(), true);
		assert.equal(app.offlineMode, true);
	});

	it('ends a failed offline probe without invoking legacy socket fallbacks', () => {
		let legacyFallbacks = 0;
		const socket = {};
		const app = {
			initializeConnection() {
				return this.connect();
			},
			connect() {
				this.socket = socket;
				socket.onclose = function () {
					legacyFallbacks++;
					throw new Error('legacy fallback should not run');
				};
				return 'probing';
			},
			send() {},
			parseFormats() {},
		};
		const loaded = loadController({
			app,
			navigator: {onLine: true},
			OfflineFormats: {formats: ['formats', 'Offline Format,4']},
		});

		assert.equal(app.initializeConnection(), 'probing');
		loaded.root.dispatch('offline');
		assert.doesNotThrow(() => socket.onclose());
		assert.equal(legacyFallbacks, 0);
		assert.equal(loaded.api.isKnownOffline(), true);
		assert.equal(app.offlineMode, true);
	});

	it('removes only the legacy reconnect modal when a socket failure enters offline mode', () => {
		class ReconnectPopup {}
		class OtherPopup {}
		const handlers = Object.create(null);
		const reconnectPopup = new ReconnectPopup();
		const otherPopup = new OtherPopup();
		const app = {
			popups: [otherPopup],
			reconnectPending: true,
			on(name, listener) {
				(handlers[name] || (handlers[name] = [])).push(listener);
			},
			trigger(name) {
				for (const listener of handlers[name] || []) listener();
			},
			closePopup() {
				this.popups.pop();
			},
			initializeConnection() {},
			connect() {},
			send() {},
			parseFormats() {},
		};
		const loaded = loadController({app, ReconnectPopup});

		app.trigger('init:connectionerror');
		assert.deepEqual(app.popups, [otherPopup]);
		assert.equal(app.reconnectPending, false);
		app.popups.push(reconnectPopup);
		app.trigger('init:connectionerror');
		assert.deepEqual(app.popups, [otherPopup]);
		assert.equal(loaded.api.isKnownOffline(), true);
	});

	it('uses generated formats for a server without a cache and accepts the alias fallback', () => {
		const storage = makeStorage();
		const loaded = loadController({
			storage,
			Config: {server: {id: 'alpha'}},
			OfflineFormats: {protocol: '|formats|Generated One,4', formats: ['formats', 'Generated One,4']},
		});
		loaded.api.saveFormats(['formats', 'Alpha Cached,4']);
		loaded.root.Config.server.id = 'beta';

		let parsed;
		assert.equal(loaded.api.enterOffline({
			parseFormats(raw) {
				parsed = Array.from(raw);
			},
		}, 'connectionerror'), true);
		assert.deepEqual(parsed, ['formats', 'Generated One,4']);

		delete loaded.root.OfflineFormats;
		loaded.root.OfflineBattleFormats = ['formats', 'Alias Format,4'];
		loaded.root.Config.server.id = 'gamma';
		loaded.api.restoreFormats({
			parseFormats(raw) {
				parsed = Array.from(raw);
			},
		});
		assert.deepEqual(parsed, ['formats', 'Alias Format,4']);
	});

	it('falls back safely when storage is corrupt, unavailable, or over quota', () => {
		const storage = {
			getItem() {
				return '{not valid JSON';
			},
			setItem() {
				throw new Error('QuotaExceededError');
			},
		};
		const loaded = loadController({
			storage,
			OfflineFormats: {protocol: '|formats|Offline Generated,4'},
		});
		assert.equal(loaded.api.saveFormats(['formats', 'Unsaved,4']), false);
		let parsed;
		assert.doesNotThrow(() => loaded.api.enterOffline({
			parseFormats(raw) {
				parsed = Array.from(raw);
			},
		}));
		assert.deepEqual(parsed, ['formats', 'Offline Generated,4']);

		Object.defineProperty(loaded.root, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('SecurityError');
			},
		});
		assert.equal(loaded.api.saveFormats(['formats', 'No Storage,4']), false);
	});

	it('rejects pathological format catalogs before persisting or restoring them', () => {
		const storage = makeStorage();
		const loaded = loadController({storage});
		const tooMany = new Array(loaded.api.maxFormatTokens + 1).fill('Format,4');

		assert.equal(loaded.api.saveFormats(tooMany), false);
		assert.equal(loaded.api.saveFormats(['formats', 'x'.repeat(1025)]), false);
		assert.equal(loaded.api.saveFormats([
			'formats', ',1', 'x" open ontoggle="alert(1)', 'Unsafe Format,4',
		]), false);
		assert.deepEqual(storage.values, Object.create(null));
	});

	it('handles browser connectivity events and exposes an accessible reload action', () => {
		let parsed = 0;
		const app = {
			sendQueue: ['do not replay this'],
			parseFormats() {
				parsed++;
			},
		};
		const loaded = loadController({
			app,
			OfflineFormats: {formats: ['formats', 'Offline Format,4']},
		});

		loaded.root.navigator.onLine = false;
		loaded.root.dispatch('offline');
		assert.equal(parsed, 1);
		assert.equal(app.offlineMode, true);
		assert.equal(app.isDisconnected, true);
		assert.equal(loaded.api.isKnownOffline(), true);

		const status = loaded.root.document.getElementById('offline-client-status');
		assert.equal(status.attributes.role, 'status');
		assert.equal(status.attributes['aria-live'], 'polite');
		assert.equal(status.hidden, false);
		assert.match(elementText(status), /You are offline/);

		loaded.root.navigator.onLine = true;
		loaded.root.dispatch('online');
		assert.match(elementText(status), /connection is available again/);
		const action = loaded.root.document.getElementById('offline-client-status-action');
		action.dispatch('click');
		assert.equal(loaded.reloads, 1);

		loaded.api.setConnected(app);
		assert.equal(app.offlineMode, false);
		assert.equal(app.isDisconnected, false);
		assert.equal(loaded.api.isKnownOffline(), false);
		assert.equal(status.hidden, true);
	});

	it('attaches offline state after a load handler creates the app', async () => {
		const loaded = loadController({
			navigator: {onLine: false},
			OfflineFormats: {formats: ['formats', ',LL', 'Offline Format,4']},
		});
		let parsed;
		loaded.root.app = {
			parseFormats(raw) {
				parsed = Array.from(raw);
			},
		};
		loaded.root.dispatch('load');
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepEqual(parsed, ['formats', ',LL', 'Offline Format,4']);
		assert.equal(loaded.root.app.offlineMode, true);
	});

	it('keeps network-required actions non-modal without replacing the full offline warning', () => {
		const messages = [];
		const sends = [];
		const app = {
			initializeConnection() {},
			connect() {},
			send(message) {
				sends.push(message);
			},
			parseFormats() {},
			addPopupMessage(message) {
				messages.push(message);
			},
		};
		const loaded = loadController({
			app,
			BattleFormats: {},
			OfflineFormats: {formats: ['formats', 'Offline Format,4']},
		});
		loaded.root.dispatch('offline');
		const status = loaded.root.document.getElementById('offline-client-status');
		const offlineWarning = 'You are offline. Local teams and teambuilding are still available, ' +
			'but battles and other network features are unavailable.';
		assert.equal(elementText(status), offlineWarning + 'Retry connection');
		assert.equal(app.send('/vtm gen9ou'), false);
		assert.equal(app.send('/search gen9ou'), false);
		assert.deepEqual(sends, []);
		assert.deepEqual(messages, []);
		assert.equal(elementText(status), offlineWarning + 'Retry connection');
	});

	it('waits for update approval, sends SKIP_WAITING, and reloads once after takeover', async () => {
		const messages = [];
		const worker = eventTarget({
			state: 'installed',
			postMessage(message) {
				messages.push(message);
			},
		});
		const registration = eventTarget({waiting: worker, installing: null});
		let registeredURL = '';
		let registeredOptions;
		const serviceWorker = eventTarget({
			controller: {},
			register(url, options) {
				registeredURL = url;
				registeredOptions = options;
				return Promise.resolve(registration);
			},
		});
		const loaded = loadController({navigator: {onLine: true, serviceWorker}});
		await Promise.resolve();
		await Promise.resolve();

		assert.equal(registeredURL, '/service-worker.js');
		assert.equal(registeredOptions.scope, '/');
		assert.equal(registeredOptions.type, 'module');
		assert.equal(registeredOptions.updateViaCache, 'none');
		assert.equal(messages.length, 0);
		const prompt = loaded.root.document.getElementById('offline-client-update');
		assert(prompt);
		assert.match(elementText(prompt), /new version/);
		prompt.children[1].dispatch('click');
		assert.equal(messages.length, 1);
		assert.equal(messages[0].type, 'SKIP_WAITING');
		assert.equal(loaded.reloads, 0);

		serviceWorker.dispatch('controllerchange');
		serviceWorker.dispatch('controllerchange');
		assert.equal(loaded.reloads, 1);
	});

	it('requires other controlled tabs to reload after an approved worker takeover', () => {
		const serviceWorker = eventTarget({
			controller: {},
			register() {
				return Promise.resolve(eventTarget({waiting: null, installing: null}));
			},
		});
		const loaded = loadController({navigator: {onLine: true, serviceWorker}});

		serviceWorker.dispatch('controllerchange');
		assert.equal(loaded.reloads, 0);
		const status = loaded.root.document.getElementById('offline-client-status');
		assert.match(elementText(status), /new version.*active/i);
		const action = loaded.root.document.getElementById('offline-client-status-action');
		action.dispatch('click');
		assert.equal(loaded.reloads, 1);
	});

	it('warms optional media in the background without delaying worker activation', async () => {
		const messages = [];
		const active = {
			postMessage(message) {
				messages.push(message);
			},
		};
		const registration = eventTarget({waiting: null, installing: null, active});
		const serviceWorker = eventTarget({
			controller: active,
			ready: Promise.resolve(registration),
			register() {
				return Promise.resolve(registration);
			},
		});
		loadController({navigator: {onLine: true, serviceWorker}});
		await Promise.resolve();
		await Promise.resolve();
		assert.equal(messages.length, 1);
		assert.equal(messages[0].type, 'WARM_OFFLINE_MEDIA');
	});

	it('surfaces service-worker installation failure without affecting online play', async () => {
		const serviceWorker = eventTarget({
			controller: null,
			register() {
				return Promise.reject(new Error('installation failed'));
			},
		});
		const loaded = loadController({navigator: {onLine: true, serviceWorker}});
		await Promise.resolve();
		await Promise.resolve();

		const status = loaded.root.document.getElementById('offline-client-status');
		assert.match(elementText(status), /Offline support could not be installed/);
		status.children[1].dispatch('click');
		assert.equal(loaded.reloads, 1);
		assert.equal(loaded.api.isKnownOffline(), false);
	});

	it('shows a minimal online indicator after first install and preserves the full offline warning', async () => {
		let persistenceRequests = 0;
		const active = {postMessage() {}};
		const registration = eventTarget({waiting: null, installing: null, active});
		const serviceWorker = eventTarget({
			controller: null,
			ready: Promise.resolve(registration),
			register() {
				return Promise.resolve(registration);
			},
		});
		const storage = {
			persisted() {
				return Promise.resolve(false);
			},
			persist() {
				persistenceRequests++;
				return Promise.resolve(true);
			},
		};
		const loaded = loadController({navigator: {onLine: true, serviceWorker, storage}});
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		const status = loaded.root.document.getElementById('offline-client-status');
		const action = loaded.root.document.getElementById('offline-client-status-action');
		assert.equal(elementText(status), 'Online');
		assert.equal(action.hidden, true);
		assert.equal(persistenceRequests, 0);

		loaded.root.navigator.onLine = false;
		loaded.root.dispatch('offline');
		const message = loaded.root.document.getElementById('offline-client-status-message');
		assert.equal(elementText(message),
			'You are offline. Local teams and teambuilding are still available, ' +
			'but battles and other network features are unavailable.');
		assert.equal(action.hidden, false);
		assert.equal(elementText(action), 'Retry connection');
		assert.equal(action.attributes['aria-label'], 'Reconnect to the server');
	});

	it('surfaces a redundant first-install worker as an offline installation failure', async () => {
		const worker = eventTarget({state: 'installing', postMessage() {}});
		const registration = eventTarget({waiting: null, installing: worker});
		const serviceWorker = eventTarget({
			controller: null,
			register() {
				return Promise.resolve(registration);
			},
		});
		const loaded = loadController({navigator: {onLine: true, serviceWorker}});
		await Promise.resolve();
		await Promise.resolve();
		worker.state = 'redundant';
		worker.dispatch('statechange');

		assert.match(elementText(loaded.root.document.getElementById('offline-client-status')), /could not be installed/);
	});

	it('discovers an installing update but does not prompt for the first worker install', async () => {
		const worker = eventTarget({state: 'installing', postMessage() {}});
		const registration = eventTarget({waiting: null, installing: null});
		const serviceWorker = eventTarget({
			controller: null,
			register() {
				return Promise.resolve(registration);
			},
		});
		const loaded = loadController({navigator: {onLine: true, serviceWorker}});
		await Promise.resolve();
		await Promise.resolve();

		registration.installing = worker;
		registration.dispatch('updatefound');
		worker.state = 'installed';
		worker.dispatch('statechange');
		assert.equal(loaded.root.document.getElementById('offline-client-update'), null);

		serviceWorker.controller = {};
		registration.waiting = worker;
		worker.state = 'installing';
		registration.dispatch('updatefound');
		worker.state = 'installed';
		worker.dispatch('statechange');
		assert(loaded.root.document.getElementById('offline-client-update'));
	});
});
