import fs from 'node:fs';
import path from 'node:path';

import { OFFLINE_SHELL_PATH, SOURCE_SHELL_PATH, WEB_ROOT_NAME, writeIfChanged } from './policy';

const HEAD_MARKER = '<meta name="robots"';
const APP_MARKER = 'window.app = new App();';
const GENERATED_MARKER = 'Generated fork-local offline integration';
const REMOTE_CONFIG = 'https://play.pokemonshowdown.com/config/config.js';
const TEST_CLIENT_KEY_SCRIPT =
	/^[\t ]*<script\s+src=["'](?:\.\.\/|\.\/|\/)?config\/testclient-key\.js["']><\/script>[\t ]*(?:\r?\n)?/im;
const TEST_CLIENT_KEY_REFERENCE = /config\/testclient-key\.js/i;

const HEAD_INTEGRATION = [
	'\t\t<!-- Generated fork-local offline integration. Source: testclient-old.html. -->',
	'\t\t<meta name="theme-color" content="#344b6c" />',
	'\t\t<link rel="manifest" href="/offline.webmanifest" />',
	'\t\t<link rel="apple-touch-icon" href="/favicon-192.png" />',
	'\t\t<link rel="stylesheet" href="/style/offline.css" />',
	'',
].join('\n');

const RUNTIME_INTEGRATION = [
	'\t\t<!-- Generated fork-local offline integration. Modern browsers only. -->',
	'\t\t<script type="module" src="/data/offline-formats.js"></script>',
	'\t\t<script type="module" src="/js/oldclient/offline.js"></script>',
	'',
].join('\n');

export function renderOfflineShell(source: string): string {
	if (source.includes(GENERATED_MARKER)) {
		throw new Error('The offline shell source is already finalized.');
	}

	source = source.replace(REMOTE_CONFIG, '/config/config.js');
	source = source.replace(/^\s*Config\.testclient\s*=\s*true\s*;\s*$/m, '');
	source = source.replace(TEST_CLIENT_KEY_SCRIPT, '');
	assertDeploymentShellReady(source);

	const headMarkerIndex = source.indexOf(HEAD_MARKER);
	if (headMarkerIndex < 0) throw new Error(`Classic shell marker is missing: ${HEAD_MARKER}`);
	const headLineStart = source.lastIndexOf('\n', headMarkerIndex) + 1;

	const appIndex = source.indexOf(APP_MARKER);
	if (appIndex < 0) throw new Error(`Classic App marker is missing: ${APP_MARKER}`);
	const appScriptStart = source.lastIndexOf('<script', appIndex);
	if (appScriptStart < 0) throw new Error('The classic App bootstrap script could not be located.');
	const appLineStart = source.lastIndexOf('\n', appScriptStart) + 1;

	const withHead = source.slice(0, headLineStart) + HEAD_INTEGRATION + source.slice(headLineStart);
	const adjustedAppLineStart = appLineStart + HEAD_INTEGRATION.length;
	return withHead.slice(0, adjustedAppLineStart) + RUNTIME_INTEGRATION + withHead.slice(adjustedAppLineStart);
}

export function assertDeploymentShellReady(source: string): void {
	if (!/<script\s+src=["']\/?config\/config\.js["']><\/script>/i.test(source)) {
		throw new Error('Offline finalization requires the classic shell to load same-origin config/config.js.');
	}
	if (/\bConfig\.testclient\s*=\s*true\s*;/.test(source)) {
		throw new Error('Offline finalization requires production test-client mode to be removed.');
	}
	if (TEST_CLIENT_KEY_REFERENCE.test(source)) {
		throw new Error('Offline finalization requires the unused test-client key request to be removed.');
	}
}

export function generateOfflineShell(rootDir: string): string {
	const webRoot = path.join(rootDir, WEB_ROOT_NAME);
	const sourcePath = path.join(webRoot, SOURCE_SHELL_PATH);
	const destination = path.join(webRoot, OFFLINE_SHELL_PATH);
	const source = fs.readFileSync(sourcePath, 'utf8');
	const shell = renderOfflineShell(source);
	writeIfChanged(destination, shell);
	return destination;
}
