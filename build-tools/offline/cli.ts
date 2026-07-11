#!/usr/bin/env node

import { finalizeOfflineBuild } from './finalize';

const result = finalizeOfflineBuild({ strict: process.argv.includes('--strict') });
if (result.skipped) {
	console.log(`Offline finalization skipped: ${result.reason}`);
} else {
	console.log(
		`Finalized offline shell ${result.version} ` +
		`(${result.coreAssets.length} core, ${result.mediaAssets.length} warm media assets).`
	);
}
