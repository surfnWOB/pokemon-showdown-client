import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_FORMATS_LIST_PREFIX, generateOfflineFormats } from './formats';
import {
	OFFLINE_SHELL_PATH,
	OPTIONAL_MEDIA,
	SERVICE_WORKER_PATH,
	WEB_ROOT_NAME,
	WORKER_VERSION_PLACEHOLDER,
	collectClassicCore,
	computeOfflineVersion,
	findMissingAssets,
	writeIfChanged,
} from './policy';
import { generateClassicOfflineClient } from './classic-render';
import { generateOfflineShell } from './shell';
import { DEFAULT_MEDIA_CACHE_LIMIT, loadWorkerRuntime, renderServiceWorker } from './worker-render';

export interface OfflineFinalizeOptions {
	repoRoot?: string;
	strict?: boolean;
	formatsListPrefix?: string;
}

export type OfflineFinalizeReport = {
	skipped: true,
	reason: string,
	shell: string,
} | {
	skipped: false,
	version: string,
	coreAssets: string[],
	mediaAssets: readonly string[],
	shell: string,
};

export const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function removeGeneratedWorker(webRoot: string): void {
	try {
		fs.unlinkSync(path.join(webRoot, SERVICE_WORKER_PATH));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
}

/**
 * Finalize the already-built, deployment-mutated webroot for offline use.
 * This is the only external interface to the offline build implementation.
 */
export function finalizeOfflineBuild(options: OfflineFinalizeOptions = {}): OfflineFinalizeReport {
	const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
	const strict = !!options.strict;
	const formatsListPrefix = options.formatsListPrefix ??
		process.env.PS_OFFLINE_FORMATS_LIST_PREFIX ?? DEFAULT_FORMATS_LIST_PREFIX;
	const webRoot = path.join(repoRoot, WEB_ROOT_NAME);
	// A failed finalization must never leave an older worker publishable beside
	// a newly-mutated shell. The replacement worker is the final write below.
	removeGeneratedWorker(webRoot);
	generateClassicOfflineClient(repoRoot);
	const shell = generateOfflineShell(repoRoot);
	const formatResult = generateOfflineFormats(repoRoot, strict, formatsListPrefix);
	if (formatResult.skipped) {
		removeGeneratedWorker(webRoot);
		return { skipped: true, reason: formatResult.reason, shell };
	}

	const coreAssets = collectClassicCore(repoRoot);
	const missing = findMissingAssets(webRoot, coreAssets);
	if (missing.length) {
		removeGeneratedWorker(webRoot);
		const reason = `required classic offline assets are missing: ${missing.slice(0, 4).join(', ')}`;
		if (strict) throw new Error(reason + (missing.length > 4 ? ` (+${missing.length - 4} more)` : ''));
		return { skipped: true, reason, shell };
	}

	const runtime = loadWorkerRuntime(repoRoot);
	const workerPolicy = renderServiceWorker(runtime, {
		version: WORKER_VERSION_PLACEHOLDER,
		coreAssets,
		mediaAssets: OPTIONAL_MEDIA,
		mediaCacheLimit: DEFAULT_MEDIA_CACHE_LIMIT,
	});
	const version = computeOfflineVersion(webRoot, coreAssets, workerPolicy, OPTIONAL_MEDIA);
	const worker = renderServiceWorker(runtime, {
		version,
		coreAssets,
		mediaAssets: OPTIONAL_MEDIA,
		mediaCacheLimit: DEFAULT_MEDIA_CACHE_LIMIT,
	});
	writeIfChanged(path.join(webRoot, SERVICE_WORKER_PATH), worker);

	return { skipped: false, version, coreAssets, mediaAssets: OPTIONAL_MEDIA, shell };
}

export { OFFLINE_SHELL_PATH };
