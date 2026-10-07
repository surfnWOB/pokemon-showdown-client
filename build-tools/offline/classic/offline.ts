/**
 * Fork-owned offline adapter for the classic client.
 *
 * This is intentionally modern, strict TypeScript. The generated offline shell
 * loads it as a native module for browsers in the declared support policy.
 */

type LegacyListener = (...args: unknown[]) => unknown;

interface LegacySocket {
	onclose?: ((this: LegacySocket, ...args: unknown[]) => unknown) | null;
}

type LegacyPopup = object;
type LegacyPopupConstructor = new (...args: never[]) => LegacyPopup;

interface LegacyFormat {
	searchShow?: boolean;
	challengeShow?: boolean;
	tournamentShow?: boolean;
	rated?: boolean;
}

interface LegacyClient {
	connect?: (...args: unknown[]) => unknown;
	initializeConnection?: (...args: unknown[]) => unknown;
	isDisconnected?: boolean;
	offlineMode?: boolean;
	on?: (eventName: string, listener: LegacyListener) => unknown;
	parseFormats?: (rawList: unknown) => unknown;
	popups?: LegacyPopup[] | null;
	reconnectPending?: unknown;
	closePopup?: () => unknown;
	send?: (...args: unknown[]) => unknown;
	sendQueue?: unknown;
	socket?: LegacySocket | null;
	trigger?: (eventName: string) => unknown;
}

interface JQuerySelection {
	length: number;
	addClass: (className: string) => JQuerySelection;
	attr: (name: string, value: string) => JQuerySelection;
	filter: (selector: string) => JQuerySelection;
	find: (selector: string) => JQuerySelection;
	hasClass: (className: string) => boolean;
	prop: (name: string, value: boolean) => JQuerySelection;
	removeAttr: (name: string) => JQuerySelection;
	removeClass: (className: string) => JQuerySelection;
}

type JQueryFactory = (selector: string) => JQuerySelection;

interface OfflineFormatCatalog {
	formats?: unknown;
	protocol?: unknown;
	raw?: unknown;
}

interface SavedFormats {
	schema: number;
	serverID: string;
	timestamp: number;
	formats: unknown;
}

interface OfflineClient {
	attach: (client: LegacyClient | undefined) => boolean;
	enterOffline: (client?: LegacyClient, reason?: string) => boolean;
	initialize: () => OfflineClient;
	isKnownOffline: () => boolean;
	maxFormatTokens: number;
	networkFeedbackDelay: number;
	notifyNetworkRequired: () => boolean;
	registerServiceWorker: () => Promise<ServiceWorkerRegistration> | null;
	restoreFormats: (client?: LegacyClient) => boolean;
	saveFormats: (rawList: unknown) => boolean;
	setConnected: (client?: LegacyClient) => void;
	storageSchema: number;
	workerURL: string;
}

interface OfflineWindow extends Window {
	$?: JQueryFactory;
	BattleFormats?: Record<string, LegacyFormat | undefined>;
	Config?: { server?: { id?: string } };
	OfflineBattleFormats?: unknown;
	OfflineClient?: OfflineClient;
	OfflineFormats?: unknown;
	ReconnectPopup?: LegacyPopupConstructor;
	app?: LegacyClient;
	jQuery?: JQueryFactory;
	MutationObserver?: new (callback: MutationCallback) => MutationObserver;
}

const root = window as OfflineWindow;
const STORAGE_SCHEMA = 1;
const STORAGE_PREFIX = 'pokemon-showdown-offline-formats:';
const DEFAULT_WORKER_URL = '/service-worker.js';
const DEFAULT_FEEDBACK_DELAY = 3000;
const MAX_FORMAT_TOKENS = 5000;
const MAX_FORMAT_TOKEN_LENGTH = 1024;
const MAX_FORMAT_CHARACTERS = 512 * 1024;

let initialized = false;
let domReadyListenerAdded = false;
let connectivityListenersAdded = false;
let controllerListenerAdded = false;
let registrationStarted = false;
let registrationResult: Promise<ServiceWorkerRegistration> | null = null;
let controlledAtInitialization = false;
let offlineMode = false;
let reconnecting = false;
let networkAvailable = true;
let lastNetworkFeedback = 0;
let reloadOnControllerChange = false;
let reloading = false;
let pendingWorker: ServiceWorker | null = null;
let promptedWorker: ServiceWorker | null = null;
let statusElement: HTMLElement | null = null;
let statusMessage: HTMLElement | null = null;
let statusAction: HTMLButtonElement | null = null;
let statusActionMode: 'dismiss' | 'reconnect' | 'reload' = 'reload';
let updateElement: HTMLElement | null = null;
let attachedClient: LegacyClient | null = null;
let restoringFormats = false;
let networkControlObserver: MutationObserver | null = null;

function listen(target: EventTarget | null | undefined, eventName: string, listener: EventListener): void {
	target?.addEventListener(eventName, listener);
}

function getDocument(): Document | null {
	try {
		return root.document ?? null;
	} catch {}
	return null;
}

function getNavigator(): Navigator | null {
	try {
		return root.navigator ?? null;
	} catch {}
	return null;
}

function getStorage(): Storage | null {
	try {
		return root.localStorage ?? null;
	} catch {}
	return null;
}

function getServerID(): string {
	try {
		const serverID = root.Config?.server?.id;
		if (serverID) return String(serverID);
	} catch {}
	return 'showdown';
}

function getStorageKey(serverID: string): string {
	return STORAGE_PREFIX + encodeURIComponent(serverID);
}

function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

function parseProtocol(protocol: unknown): string[] | null {
	if (typeof protocol !== 'string') return null;
	const normalized = protocol.startsWith('|') ? protocol.slice(1) : protocol;
	return normalized.split('|');
}

function isSectionMarker(token: string): boolean {
	return token === '' || (token.startsWith(',') && token !== ',LL' && !isNaN(Number(token.slice(1))));
}

function hasUnsafeSection(formats: readonly string[]): boolean {
	let expectsSection = false;
	for (let i = 1; i < formats.length; i++) {
		const token = formats[i];
		if (token === undefined) continue;
		if (expectsSection) {
			if (/["'&<>]/.test(token)) return true;
			for (let j = 0; j < token.length; j++) {
				const code = token.charCodeAt(j);
				if (code < 32 || code === 127) return true;
			}
			expectsSection = false;
		} else if (isSectionMarker(token)) {
			expectsSection = true;
		}
	}
	return false;
}

function normalizeFormats(value: unknown): string[] | null {
	if (typeof value === 'string') value = parseProtocol(value);
	if (value && !isArray(value)) {
		const catalog = value as OfflineFormatCatalog;
		if (isArray(catalog.formats)) {
			value = catalog.formats;
		} else if (isArray(catalog.raw)) {
			value = catalog.raw;
		} else {
			value = parseProtocol(catalog.protocol);
		}
	}
	if (!isArray(value) || value.length > MAX_FORMAT_TOKENS) return null;

	const formats: string[] = [];
	let totalCharacters = 0;
	for (const token of value) {
		if (typeof token !== 'string' || token.length > MAX_FORMAT_TOKEN_LENGTH) return null;
		totalCharacters += token.length;
		if (totalCharacters > MAX_FORMAT_CHARACTERS) return null;
		formats.push(token);
	}
	if (formats[0] === '') formats.shift();
	if (formats[0] !== 'formats') {
		if (formats.length >= MAX_FORMAT_TOKENS) return null;
		formats.unshift('formats');
	}
	return hasUnsafeSection(formats) ? null : formats;
}

function loadSavedFormats(): string[] | null {
	const storage = getStorage();
	if (!storage) return null;
	const serverID = getServerID();
	try {
		const serialized = storage.getItem(getStorageKey(serverID));
		if (!serialized) return null;
		const entry = JSON.parse(serialized) as Partial<SavedFormats> | null;
		if (entry?.schema !== STORAGE_SCHEMA || entry.serverID !== serverID) return null;
		if (typeof entry.timestamp !== 'number' || !isFinite(entry.timestamp) || entry.timestamp <= 0) return null;
		return normalizeFormats(entry.formats);
	} catch {}
	return null;
}

function getGeneratedFormats(): string[] | null {
	try {
		return normalizeFormats(root.OfflineFormats ?? root.OfflineBattleFormats);
	} catch {}
	return null;
}

function disableBattleFormats(): void {
	const formats = root.BattleFormats;
	if (!formats) return;
	for (const id in formats) {
		const format = formats[id];
		if (!Object.hasOwn(formats, id) || !format) continue;
		format.searchShow = false;
		format.challengeShow = false;
		format.tournamentShow = false;
		format.rated = false;
	}
}

function setText(element: HTMLElement | null, value: string): void {
	if (!element) return;
	element.textContent = value;
}

function hideElement(element: HTMLElement | null): void {
	if (!element) return;
	element.hidden = true;
}

function showElement(element: HTMLElement | null): void {
	if (!element) return;
	element.hidden = false;
}

function reloadPage(): boolean {
	try {
		if (root.location?.reload) {
			root.location.reload();
			return true;
		}
	} catch {}
	return false;
}

function attemptReconnect(): boolean {
	const client = attachedClient ?? root.app;
	reconnecting = true;
	networkAvailable = true;
	hideConnectivityStatus();
	try {
		if (client?.initializeConnection) {
			client.initializeConnection();
			return true;
		}
	} catch {}
	reconnecting = false;
	return reloadPage();
}

function handleStatusAction(): boolean {
	switch (statusActionMode) {
	case 'dismiss':
		hideConnectivityStatus();
		return true;
	case 'reconnect':
		return attemptReconnect();
	default:
		return reloadPage();
	}
}

function setStatusAction(
	mode: 'dismiss' | 'reconnect' | 'reload', label: string, ariaLabel: string
): void {
	if (!statusAction) return;
	statusActionMode = mode;
	setText(statusAction, label);
	statusAction.setAttribute('aria-label', ariaLabel);
	showElement(statusAction);
}

function showOfflineReady(): void {
	if (offlineMode) return;
	const element = ensureStatusElement();
	if (!element || !statusAction) return;
	element.className = 'offline-client-status offline-client-status-online';
	setText(statusMessage, 'Online');
	hideElement(statusAction);
	showElement(element);
}

function scheduleDOMReady(): void {
	if (domReadyListenerAdded) return;
	const document = getDocument();
	if (!document) return;
	domReadyListenerAdded = true;
	listen(document, 'DOMContentLoaded', () => {
		ensureStatusElement();
		if (pendingWorker) ensureUpdatePrompt();
	});
}

function ensureStatusElement(): HTMLElement | null {
	if (statusElement) return statusElement;
	const document = getDocument();
	if (!document?.body) {
		scheduleDOMReady();
		return null;
	}

	statusElement = document.getElementById('offline-client-status');
	if (statusElement) {
		statusMessage = document.getElementById('offline-client-status-message');
		statusAction = document.getElementById('offline-client-status-action') as HTMLButtonElement | null;
		watchNetworkControls();
		return statusElement;
	}

	statusElement = document.createElement('div');
	statusElement.id = 'offline-client-status';
	statusElement.className = 'offline-client-status';
	statusElement.setAttribute('role', 'status');
	statusElement.setAttribute('aria-live', 'polite');
	statusElement.setAttribute('aria-atomic', 'true');

	statusMessage = document.createElement('span');
	statusMessage.id = 'offline-client-status-message';
	statusMessage.className = 'offline-client-status-message';
	statusElement.appendChild(statusMessage);

	statusAction = document.createElement('button');
	statusAction.id = 'offline-client-status-action';
	statusAction.className = 'button offline-client-status-action';
	statusAction.type = 'button';
	statusAction.setAttribute('aria-label', 'Reload and reconnect');
	listen(statusAction, 'click', handleStatusAction);
	statusElement.appendChild(statusAction);

	hideElement(statusElement);
	document.body.appendChild(statusElement);
	watchNetworkControls();
	return statusElement;
}

function showConnectivityStatus(isOnline: boolean, message?: string | null): void {
	const element = ensureStatusElement();
	if (!element || !statusAction) return;
	if (isOnline) {
		element.className = 'offline-client-status offline-client-status-online';
		setText(statusMessage, message || 'Your connection is available again. Reconnect when you are ready.');
	} else {
		element.className = 'offline-client-status offline-client-status-offline';
		setText(statusMessage, message ||
		'You are offline. Local teams and teambuilding are still available, ' +
		'but battles and other network features are unavailable.');
	}
	if (offlineMode) {
		setStatusAction('reconnect', isOnline ? 'Reconnect' : 'Retry connection', 'Reconnect to the server');
	} else {
		setStatusAction('reload', 'Reload', 'Reload the page');
	}
	showElement(element);
}

function hideConnectivityStatus(): void {
	hideElement(statusElement);
}

function showReloadRequired(): void {
	const element = ensureStatusElement();
	if (!element || !statusAction) return;
	element.className = `offline-client-status${networkAvailable ? ' offline-client-status-online' : ' offline-client-status-offline'}`;
	setText(statusMessage, 'A new version of Pokémon Showdown is active. Reload this tab to finish updating.');
	setStatusAction('reload', 'Reload', 'Reload to finish updating');
	showElement(element);
}

function hideUpdatePrompt(): void {
	hideElement(updateElement);
}

function activatePendingWorker(): boolean {
	const worker = pendingWorker;
	if (!worker?.postMessage) return false;
	hideUpdatePrompt();
	reloadOnControllerChange = true;
	try {
		worker.postMessage({ type: 'SKIP_WAITING' });
		return true;
	} catch {
		reloadOnControllerChange = false;
		showConnectivityStatus(networkAvailable, 'The update could not be applied. Reload to try again.');
		setStatusAction('reload', 'Reload', 'Reload to try the update again');
	}
	return false;
}

function dismissUpdatePrompt(): void {
	pendingWorker = null;
	hideUpdatePrompt();
}

function ensureUpdatePrompt(): HTMLElement | null {
	if (!pendingWorker) return null;
	const document = getDocument();
	if (!document?.body) {
		scheduleDOMReady();
		return null;
	}
	if (updateElement) {
		showElement(updateElement);
		return updateElement;
	}

	updateElement = document.createElement('div');
	updateElement.id = 'offline-client-update';
	updateElement.className = 'offline-client-update';
	updateElement.setAttribute('role', 'status');
	updateElement.setAttribute('aria-live', 'polite');
	updateElement.setAttribute('aria-atomic', 'true');

	const message = document.createElement('span');
	message.className = 'offline-client-update-message';
	setText(message, 'A new version of Pokémon Showdown is ready.');
	updateElement.appendChild(message);

	const updateButton = document.createElement('button');
	updateButton.className = 'button offline-client-update-action';
	updateButton.type = 'button';
	setText(updateButton, 'Update and reload');
	listen(updateButton, 'click', activatePendingWorker);
	updateElement.appendChild(updateButton);

	const laterButton = document.createElement('button');
	laterButton.className = 'button offline-client-update-dismiss';
	laterButton.type = 'button';
	setText(laterButton, 'Later');
	listen(laterButton, 'click', dismissUpdatePrompt);
	updateElement.appendChild(laterButton);

	document.body.appendChild(updateElement);
	return updateElement;
}

function promptForUpdate(worker: ServiceWorker | null | undefined): void {
	if (!worker || worker === promptedWorker) return;
	promptedWorker = worker;
	pendingWorker = worker;
	ensureUpdatePrompt();
}

function showWorkerFailure(hasController: boolean): void {
	showConnectivityStatus(true, hasController ?
		'The offline update could not be installed. Your current offline version remains available.' :
		'Offline support could not be installed. Online play is unaffected; reload to try again.');
	setStatusAction('reload', 'Reload', 'Reload to retry offline installation');
}

function watchInstallingWorker(registration: ServiceWorkerRegistration | null | undefined): void {
	const worker = registration?.installing;
	if (!worker) return;
	const checkState = () => {
		const navigator = getNavigator();
		if (worker.state === 'installed' && navigator?.serviceWorker?.controller) {
			promptForUpdate(registration.waiting ?? worker);
		} else if (worker.state === 'redundant') {
			showWorkerFailure(!!navigator?.serviceWorker?.controller);
		}
	};
	listen(worker, 'statechange', checkState);
	checkState();
}

function watchRegistration(registration: ServiceWorkerRegistration | null | undefined): void {
	if (!registration) return;
	if (registration.waiting) promptForUpdate(registration.waiting);
	listen(registration, 'updatefound', () => watchInstallingWorker(registration));
	watchInstallingWorker(registration);
}

function handleControllerChange(): void {
	if (reloading) return;
	if (reloadOnControllerChange) {
		reloading = true;
		reloadPage();
		return;
	}
	if (controlledAtInitialization) showReloadRequired();
	controlledAtInitialization = true;
}

function requestMediaWarmup(announceReady = false): void {
	const navigator = getNavigator();
	if (!navigator?.serviceWorker) return;
	try {
		navigator.serviceWorker.ready.then(registration => {
			const worker = navigator.serviceWorker?.controller ?? registration.active;
			worker?.postMessage({ type: 'WARM_OFFLINE_MEDIA' });
			if (announceReady) showOfflineReady();
		}, () => {});
	} catch {}
}

function registerServiceWorker(): Promise<ServiceWorkerRegistration> | null {
	if (registrationStarted) return registrationResult;
	const navigator = getNavigator();
	if (!navigator || !('serviceWorker' in navigator)) return null;
	const serviceWorker = navigator.serviceWorker;
	const announceReady = !serviceWorker.controller;
	registrationStarted = true;
	controlledAtInitialization = !!serviceWorker.controller;

	if (!controllerListenerAdded) {
		controllerListenerAdded = true;
		listen(serviceWorker, 'controllerchange', handleControllerChange);
	}

	try {
		registrationResult = serviceWorker.register(OfflineClient.workerURL, {
			scope: '/',
			type: 'module',
			updateViaCache: 'none',
		});
	} catch {
		registrationResult = null;
		return null;
	}
	void registrationResult.then(registration => {
		watchRegistration(registration);
		requestMediaWarmup(announceReady);
	}, () => {
		registrationStarted = false;
		registrationResult = null;
		showWorkerFailure(false);
	});
	return registrationResult;
}

function setControlsDisabled(controls: JQuerySelection | null | undefined, disabled: boolean): void {
	if (!controls?.length) return;
	if (disabled) {
		controls.filter(':not(:disabled)')
			.addClass('disabled offline-disabled')
			.prop('disabled', true)
			.attr('aria-disabled', 'true');
	} else {
		controls.filter('.offline-disabled')
			.prop('disabled', false)
			.removeClass('disabled offline-disabled')
			.removeAttr('aria-disabled');
	}
}

function syncNetworkControls(client?: LegacyClient): void {
	const jquery = root.jQuery ?? root.$;
	if (!jquery) return;
	const unavailable = offlineMode || !networkAvailable || !root.BattleFormats || !!client?.isDisconnected;
	const menuScope = jquery('.mainmenu, .rightmenu');
	const networkControls = menuScope.find([
		'button.onlineonly',
		'button[name="joinRoom"][value="ladder"]',
		'button[name="send"][value="/smogtours"]',
	].join(','));
	networkControls.addClass('onlineonly');
	setControlsDisabled(networkControls, unavailable);

	const battleButton = menuScope.find('button.big');
	setControlsDisabled(battleButton, unavailable);

	const deferredNetworkControls = jquery([
		'#room-teambuilder button[name="validate"]',
		'#room-teambuilder button[name="psExport"]',
		'#room-teambuilder button[name="pokepasteExport"]',
		'#room-teambuilder button[name="send"][value="/teams"]',
		'#room-rooms button[name="toggleMoreRooms"]',
		'#room-rooms button[name="joinRoomPopup"]',
	].join(','));
	deferredNetworkControls.addClass('onlineonly');
	setControlsDisabled(deferredNetworkControls, unavailable);
}

function watchNetworkControls(): void {
	if (networkControlObserver) return;
	const document = getDocument();
	const Observer = root.MutationObserver;
	if (!document?.body || !Observer) return;
	const observer = new Observer(() => {
		if (!offlineMode && networkAvailable && !attachedClient?.isDisconnected) return;
		syncNetworkControls(attachedClient ?? root.app);
	});
	observer.observe(document.body, { childList: true, subtree: true });
	networkControlObserver = observer;
}

function updateClientViews(client?: LegacyClient): void {
	try {
		client?.trigger?.('init:formats');
	} catch {}
	syncNetworkControls(client);
}

function closeLegacyReconnectPopup(client: LegacyClient): void {
	const popup = client.popups?.at(-1);
	const ReconnectPopup = root.ReconnectPopup;
	if (!popup || !ReconnectPopup || !(popup instanceof ReconnectPopup)) return;
	try {
		client.closePopup?.();
	} catch {}
}

function restoreWith(client: LegacyClient | undefined, rawFormats: string[] | null): boolean {
	if (!client?.parseFormats || !rawFormats) return false;
	const previous = restoringFormats;
	restoringFormats = true;
	try {
		client.parseFormats(rawFormats);
	} catch {
		return false;
	} finally {
		restoringFormats = previous;
	}
	disableBattleFormats();
	return true;
}

function restoreFormats(client?: LegacyClient): boolean {
	const saved = loadSavedFormats();
	if (saved && restoreWith(client, saved)) return true;
	return restoreWith(client, getGeneratedFormats());
}

function navigatorIsOffline(): boolean {
	try {
		return getNavigator()?.onLine === false;
	} catch {}
	return false;
}

function handleOfflineEvent(): void {
	const shouldProbeConnection = !attachedClient;
	networkAvailable = false;
	OfflineClient.enterOffline(root.app, 'network');
	if (shouldProbeConnection) reconnecting = true;
}

function handleOnlineEvent(): void {
	networkAvailable = true;
	if (offlineMode) showConnectivityStatus(true);
}

function getOfflineMessage(reason?: string): string | null {
	switch (reason) {
	case 'disconnected':
		return 'You were disconnected. Local teams and teambuilding remain available, but battles and other network features are unavailable.';
	case 'connectionerror':
		return 'The server could not be reached. You can continue using local teams and the teambuilder offline.';
	default:
		return null;
	}
}

function bindConnectivityEvents(): void {
	if (connectivityListenersAdded) return;
	connectivityListenersAdded = true;
	listen(root, 'offline', handleOfflineEvent);
	listen(root, 'online', handleOnlineEvent);
	listen(root, 'load', () => {
		setTimeout(() => {
			if (!OfflineClient.isKnownOffline()) return;
			const preserveConnectionProbe = reconnecting;
			OfflineClient.enterOffline(root.app, 'offline');
			reconnecting = preserveConnectionProbe;
		}, 0);
	});
}

function attachClient(client: LegacyClient | undefined): boolean {
	if (!client || attachedClient === client) return !!client;
	if (attachedClient) return false;
	const { initializeConnection, connect, send, parseFormats } = client;
	if (!initializeConnection || !connect || !send || !parseFormats) return false;
	attachedClient = client;

	client.initializeConnection = function (this: LegacyClient, ...args: unknown[]): unknown {
		if (offlineMode && !reconnecting) {
			OfflineClient.enterOffline(this, 'offline');
			return false;
		}
		reconnecting = true;
		return initializeConnection.apply(this, args);
	};

	client.connect = function (this: LegacyClient, ...args: unknown[]): unknown {
		if (offlineMode && !reconnecting) {
			OfflineClient.enterOffline(this, 'offline');
			return false;
		}
		const result = connect.apply(this, args);
		const socket = this.socket;
		const legacyClose = socket?.onclose;
		if (reconnecting && socket && typeof legacyClose === 'function') {
			socket.onclose = (...closeArgs: unknown[]): unknown => {
				if (offlineMode || reconnecting) return OfflineClient.enterOffline(this, 'connectionerror');
				return legacyClose.apply(socket, closeArgs);
			};
		}
		return result;
	};

	client.send = function (this: LegacyClient, ...args: unknown[]): unknown {
		if (offlineMode || this.offlineMode || this.isDisconnected) {
			OfflineClient.notifyNetworkRequired();
			return false;
		}
		return send.apply(this, args);
	};

	client.parseFormats = function (this: LegacyClient, rawList: unknown): unknown {
		const result = parseFormats.call(this, rawList);
		if (!restoringFormats) OfflineClient.saveFormats(rawList);
		return result;
	};

	client.on?.('init:socketclosed', () => {
		OfflineClient.enterOffline(client, 'disconnected');
		closeLegacyReconnectPopup(client);
	});
	client.on?.('init:connectionerror', () => {
		OfflineClient.enterOffline(client, 'connectionerror');
		closeLegacyReconnectPopup(client);
	});
	client.on?.('init:socketopened', () => OfflineClient.setConnected(client));
	client.on?.('init:formats', () => syncNetworkControls(client));
	syncNetworkControls(client);
	return true;
}

const OfflineClient: OfflineClient = {
	workerURL: DEFAULT_WORKER_URL,
	storageSchema: STORAGE_SCHEMA,
	networkFeedbackDelay: DEFAULT_FEEDBACK_DELAY,
	maxFormatTokens: MAX_FORMAT_TOKENS,

	initialize() {
		if (initialized) return this;
		initialized = true;
		bindConnectivityEvents();
		ensureStatusElement();
		void registerServiceWorker();
		this.attach(root.app);
		networkAvailable = !navigatorIsOffline();
		if (!networkAvailable) {
			this.enterOffline(root.app, 'network');
			reconnecting = true;
		}
		return this;
	},

	registerServiceWorker,
	attach: attachClient,

	isKnownOffline() {
		return offlineMode;
	},

	enterOffline(client, reason) {
		reconnecting = false;
		offlineMode = true;
		if (navigatorIsOffline()) networkAvailable = false;
		client = client ?? root.app;
		if (client) {
			client.offlineMode = true;
			client.isDisconnected = true;
			client.reconnectPending = false;
			try {
				delete client.sendQueue;
			} catch {
				client.sendQueue = undefined;
			}
		}
		const restored = restoreFormats(client);
		disableBattleFormats();
		updateClientViews(client);
		showConnectivityStatus(false, getOfflineMessage(reason));
		return restored;
	},

	setConnected(client) {
		reconnecting = false;
		offlineMode = false;
		networkAvailable = true;
		client = client ?? root.app;
		if (client) {
			client.offlineMode = false;
			client.isDisconnected = false;
		}
		hideConnectivityStatus();
		updateClientViews(client);
	},

	saveFormats(rawList) {
		const formats = normalizeFormats(rawList);
		const storage = getStorage();
		if (!formats || !storage) return false;
		const entry: SavedFormats = {
			schema: STORAGE_SCHEMA,
			serverID: getServerID(),
			timestamp: Date.now(),
			formats,
		};
		try {
			storage.setItem(getStorageKey(entry.serverID), JSON.stringify(entry));
			return true;
		} catch {}
		return false;
	},

	restoreFormats,

	notifyNetworkRequired() {
		const now = Date.now();
		if (lastNetworkFeedback && now - lastNetworkFeedback < this.networkFeedbackDelay) return false;
		lastNetworkFeedback = now;
		showConnectivityStatus(false);
		return true;
	},
};

root.OfflineClient = OfflineClient;

try {
	OfflineClient.initialize();
} catch {}
