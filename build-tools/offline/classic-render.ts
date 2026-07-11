import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { WEB_ROOT_NAME, writeIfChanged } from './policy';

export const CLASSIC_OFFLINE_SOURCE_PATH = 'build-tools/offline/classic/offline.ts';
export const CLASSIC_OFFLINE_OUTPUT_PATH = 'js/oldclient/offline.js';

function sourceFilename(rootDir: string): string {
	return path.join(rootDir, CLASSIC_OFFLINE_SOURCE_PATH);
}

/**
 * Render the fork-owned offline adapter for the current browser policy. The
 * generated shell keeps this modern output out of browsers that cannot run it.
 */
export function renderClassicOfflineClient(source: string, rootDir: string): string {
	const result = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.ES2022,
			newLine: ts.NewLineKind.LineFeed,
			target: ts.ScriptTarget.ES2022,
		},
		fileName: sourceFilename(rootDir),
		reportDiagnostics: true,
	});
	const diagnostics = result.diagnostics ?? [];
	const errors = diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
	if (errors.length) {
		const details = errors.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n');
		throw new Error(`Offline adapter compilation failed:\n${details}`);
	}
	if (!result.outputText) throw new Error('Offline adapter compilation produced no JavaScript.');
	return '// Generated from build-tools/offline/classic/offline.ts. Do not edit.\n' + result.outputText;
}

export function generateClassicOfflineClient(rootDir: string): string {
	const source = fs.readFileSync(sourceFilename(rootDir), 'utf8');
	const destination = path.join(rootDir, WEB_ROOT_NAME, CLASSIC_OFFLINE_OUTPUT_PATH);
	writeIfChanged(destination, renderClassicOfflineClient(source, rootDir));
	return destination;
}
