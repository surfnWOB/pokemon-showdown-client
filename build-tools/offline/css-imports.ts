import fs from 'node:fs';
import path from 'node:path';

const LOCAL_ORIGIN = 'https://offline.invalid';

interface CSSToken {
	end: number;
	value: string;
}

function isWhitespace(character: string | undefined): boolean {
	return !!character && /\s/.test(character);
}

function isHexadecimal(character: string | undefined): boolean {
	return !!character && /[\da-f]/i.test(character);
}

function decodeCSSEscapes(value: string): string {
	let decoded = '';
	for (let i = 0; i < value.length;) {
		const character = value[i];
		if (character === undefined) break;
		if (character !== '\\') {
			decoded += character;
			i++;
			continue;
		}

		i++;
		const escaped = value[i];
		if (escaped === undefined) {
			decoded += '\uFFFD';
			break;
		}
		if (escaped === '\n' || escaped === '\f') {
			i++;
			continue;
		}
		if (escaped === '\r') {
			i += value[i + 1] === '\n' ? 2 : 1;
			continue;
		}

		if (isHexadecimal(escaped)) {
			let hexadecimal = '';
			while (hexadecimal.length < 6) {
				const hexCharacter = value[i] || '';
				if (!isHexadecimal(hexCharacter)) break;
				hexadecimal += hexCharacter;
				i++;
			}
			const codePoint = Number.parseInt(hexadecimal, 16);
			decoded += !codePoint || codePoint > 0x10FFFF || (codePoint >= 0xD800 && codePoint <= 0xDFFF) ?
				'\uFFFD' : String.fromCodePoint(codePoint);
			if (isWhitespace(value[i])) {
				if (value[i] === '\r' && value[i + 1] === '\n') i++;
				i++;
			}
			continue;
		}

		decoded += escaped;
		i++;
	}
	return decoded;
}

function commentEnd(source: string, index: number): number | null {
	if (source[index] !== '/' || source[index + 1] !== '*') return null;
	const end = source.indexOf('*/', index + 2);
	return end < 0 ? source.length : end + 2;
}

function skipTrivia(source: string, index: number): number {
	while (index < source.length) {
		if (isWhitespace(source[index])) {
			index++;
			continue;
		}
		const end = commentEnd(source, index);
		if (end === null) break;
		index = end;
	}
	return index;
}

function cssEscapeEnd(source: string, index: number): number {
	let end = index + 1;
	if (source[index] !== '\\' || source[end] === undefined) return end;
	if (isHexadecimal(source[end])) {
		let digits = 0;
		while (digits < 6 && isHexadecimal(source[end])) {
			digits++;
			end++;
		}
		if (isWhitespace(source[end])) {
			if (source[end] === '\r' && source[end + 1] === '\n') end++;
			end++;
		}
		return end;
	}
	if (source[end] === '\r' && source[end + 1] === '\n') return end + 2;
	return end + 1;
}

function readString(source: string, index: number): CSSToken | null {
	const quote = source[index];
	if (quote !== '"' && quote !== "'") return null;
	let raw = '';
	for (let i = index + 1; i < source.length; i++) {
		const character = source[i];
		if (character === undefined) break;
		if (character === quote) return { end: i + 1, value: decodeCSSEscapes(raw) };
		if (character === '\\') {
			const end = cssEscapeEnd(source, i);
			raw += source.slice(i, end);
			i = end - 1;
			continue;
		}
		raw += character;
	}
	return null;
}

function readIdentifier(source: string, index: number): CSSToken {
	let raw = '';
	while (index < source.length) {
		const character = source[index];
		if (character === undefined) break;
		if (character === '\\') {
			const end = cssEscapeEnd(source, index);
			raw += source.slice(index, end);
			index = end;
			continue;
		}
		if (!/[-_\da-z]/i.test(character)) break;
		raw += character;
		index++;
	}
	return { end: index, value: decodeCSSEscapes(raw) };
}

function readUnquotedURL(source: string, index: number): CSSToken | null {
	let raw = '';
	for (let i = index; i < source.length; i++) {
		const character = source[i];
		if (character === undefined) break;
		if (character === ')') return { end: i + 1, value: decodeCSSEscapes(raw.trim()) };
		if (character === '\\') {
			const end = cssEscapeEnd(source, i);
			raw += source.slice(i, end);
			i = end - 1;
			continue;
		}
		raw += character;
	}
	return null;
}

function importReference(source: string, index: number): string | null {
	index = skipTrivia(source, index);
	const string = readString(source, index);
	if (string) return string.value;

	const functionName = readIdentifier(source, index);
	if (functionName.value.toLowerCase() !== 'url') return null;
	index = skipTrivia(source, functionName.end);
	if (source[index] !== '(') return null;
	index = skipTrivia(source, index + 1);
	const quotedURL = readString(source, index);
	if (quotedURL) return quotedURL.value;
	return readUnquotedURL(source, index)?.value ?? null;
}

function atRuleEnd(source: string, index: number): number {
	let parentheses = 0;
	for (let i = index; i < source.length; i++) {
		const comment = commentEnd(source, i);
		if (comment !== null) {
			i = comment - 1;
			continue;
		}
		const string = readString(source, i);
		if (string) {
			i = string.end - 1;
			continue;
		}
		switch (source[i]) {
		case '(':
			parentheses++;
			break;
		case ')':
			parentheses = Math.max(0, parentheses - 1);
			break;
		case ';':
			if (!parentheses) return i + 1;
			break;
		case '{':
			if (!parentheses) return i;
			break;
		}
	}
	return source.length;
}

function stylesheetFilename(webRoot: string, asset: string): string {
	const pathname = new URL(asset, LOCAL_ORIGIN + '/').pathname;
	const relative = pathname.split('/').filter(Boolean).map(decodeURIComponent).join(path.sep);
	const filename = path.resolve(webRoot, relative);
	if (filename !== webRoot && !filename.startsWith(webRoot + path.sep)) {
		throw new Error(`Stylesheet import escapes web root: ${asset}`);
	}
	return filename;
}

function localStylesheetURL(owner: string, reference: string): string | null {
	reference = reference.trim();
	if (reference.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(reference)) return null;
	let resolved: URL;
	try {
		resolved = new URL(reference, new URL(owner, LOCAL_ORIGIN + '/'));
	} catch {
		return null;
	}
	if (resolved.origin !== LOCAL_ORIGIN) return null;
	return resolved.pathname + resolved.search;
}

function extractImports(source: string): string[] {
	const imports: string[] = [];
	let blockDepth = 0;
	for (let i = 0; i < source.length;) {
		const comment = commentEnd(source, i);
		if (comment !== null) {
			i = comment;
			continue;
		}
		const string = readString(source, i);
		if (string) {
			i = string.end;
			continue;
		}
		if (source[i] === '{') {
			blockDepth++;
			i++;
			continue;
		}
		if (source[i] === '}') {
			blockDepth = Math.max(0, blockDepth - 1);
			i++;
			continue;
		}
		if (!blockDepth && source[i] === '@') {
			const name = readIdentifier(source, i + 1);
			const end = atRuleEnd(source, name.end);
			if (name.value.toLowerCase() === 'import') {
				const reference = importReference(source, name.end);
				if (reference) imports.push(reference);
			}
			i = end;
			continue;
		}
		i++;
	}
	return imports;
}

/**
 * Follow local CSS @imports from the shell's stylesheets. Imported CSS owns
 * global client primitives, so every reachable stylesheet is an atomic shell
 * dependency rather than an opportunistic runtime-cache entry.
 */
export function collectLocalStylesheetImports(webRoot: string, entryAssets: readonly string[]): string[] {
	const imports = new Set<string>();
	const visited = new Set<string>();
	const pending = entryAssets.filter(asset => new URL(asset, LOCAL_ORIGIN + '/').pathname.endsWith('.css'));

	while (pending.length) {
		const asset = pending.pop();
		if (!asset || visited.has(asset)) continue;
		visited.add(asset);

		let source: string;
		try {
			source = fs.readFileSync(stylesheetFilename(webRoot, asset), 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
			throw error;
		}

		for (const reference of extractImports(source)) {
			const imported = localStylesheetURL(asset, reference);
			if (!imported) continue;
			imports.add(imported);
			pending.push(imported);
		}
	}

	return [...imports].sort();
}
