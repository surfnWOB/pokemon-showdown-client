const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {describe, it} = require('node:test');

const source = fs.readFileSync(path.join(__dirname,
	'../play.pokemonshowdown.com/src/oldclient/client-mainmenu.js'), 'utf8');
const start = source.indexOf('\tvar FormatPopup =');
const popupSource = source.slice(start, source.indexOf('\n\t});', start) + 5);

function render(options = {}) {
	const sections = ['Gen 3 Megas', 'surfnWOB Customs', 'Yak Attack', 'Archie Madness', 'Other',
		'S/V Singles', 'National Dex', 'Past Generations'];
	const formats = Object.fromEntries(sections.map((section, index) => [`format${index}`, {
		id: `format${index}`, section, column: Math.floor(index / 2) + 1,
		effectType: 'Format', challengeShow: true, searchShow: index !== 2, isTeambuilderFormat: index !== 3,
	}]));
	const context = vm.createContext({
		window: {},
		app: {supports: {formatColumns: !options.legacyColumns}},
		Popup: {extend: definition => definition},
		BattleFormats: formats,
		BattleLog: {escapeHTML: text => text, escapeFormat: text => text},
		toID: text => text.toLowerCase().replace(/[^a-z0-9]/g, ''),
	});
	if (!options.upstream) {
		vm.runInContext(fs.readFileSync(path.join(__dirname,
			'../play.pokemonshowdown.com/src/oldclient/format-picker.js'), 'utf8'), context);
	}
	vm.runInContext(popupSource, context);
	const popup = Object.assign({}, context.FormatPopup, {
		data: {format: 'format0'}, selectType: 'challenge', starred: {}, open: {}, search: '',
	}, options);
	return popup.renderFormats();
}

function columns(html) {
	return [...html.matchAll(/<ul class="popupmenu"[^>]*>([\s\S]*?)<\/ul>/g)].map(match => match[1]);
}

describe('Classic format popup', () => {
	it('keeps only the two primary categories in the first column without losing other formats', () => {
		const html = render();
		const [primary, other] = columns(html);
		assert.equal(columns(html).length, 2);
		assert.deepEqual([...primary.matchAll(/section="([^"]+)"/g)].map(match => match[1]),
			['Gen 3 Megas', 'surfnWOB Customs']);
		assert.match(other, /section="Yak Attack"/);
		assert.match(other, /section="Past Generations"/);
		for (let i = 0; i < 8; i++) assert.equal(html.split(`value="format${i}"`).length - 1, 1);
		assert.match(html, /^<div class="fork-format-columns">/);
	});

	it('keeps favorites first without duplicating them in category lists', () => {
		const html = render({starred: {format6: true}});
		const [primary, other] = columns(html);
		assert.ok(primary.indexOf('value="format6"') < primary.indexOf('section="Gen 3 Megas"'));
		assert.doesNotMatch(other, /value="format6"/);
	});

	it('searches the consolidated categories and opens matching sections', () => {
		const html = render({search: 'format6'});
		assert.equal(columns(html).length, 1);
		assert.match(html, /<details open section="National Dex"/);
		assert.doesNotMatch(html, /value="format0"/);
		assert.match(render({search: 'missing'}), /No formats found/);
	});

	it('preserves picker-specific filtering and the watch all-formats option', () => {
		assert.doesNotMatch(render({selectType: 'search'}), /value="format2"/);
		assert.doesNotMatch(render({selectType: 'teambuilder'}), /value="format3"/);
		assert.match(columns(render({selectType: 'watch'}))[0], /\(All formats\)/);
	});

	it('retains server columns and legacy fallback when the fork module is absent', () => {
		const html = render({upstream: true});
		assert.equal(columns(html).length, 4);
		assert.doesNotMatch(html, /fork-format-columns/);
		assert.equal(columns(render({upstream: true, legacyColumns: true})).length, 2);
		assert.equal(columns(render({legacyColumns: true})).length, 2);
	});
});
