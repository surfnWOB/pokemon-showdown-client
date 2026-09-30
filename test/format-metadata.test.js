const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {describe, it} = require('node:test');

window = global;
global.preact = require('preact');
global.PSModel = function () {};
global.Pokemon = class Pokemon {};
global.PS = {prefs: {}};
global.BattlePokedex = require('../play.pokemonshowdown.com/data/pokedex.js').BattlePokedex;
global.BattleTeambuilderTable =
	require('../play.pokemonshowdown.com/data/teambuilder-tables.js').BattleTeambuilderTable;
require('../play.pokemonshowdown.com/js/battle-dex-data.js');
require('../play.pokemonshowdown.com/js/battle-dex.js');
require('../play.pokemonshowdown.com/js/battle-dex-search.js');

const editorPath = path.resolve(__dirname, '../play.pokemonshowdown.com/js/battle-team-editor.js');
const TeamEditorState = vm.runInThisContext(
	`${fs.readFileSync(editorPath, 'utf8')}\nTeamEditorState;`, {filename: editorPath}
);

describe('Shared format metadata', () => {
	it('keeps the editor and Dex.forFormat on the same upstream and fork mods', () => {
		const editor = new TeamEditorState({format: 'gen9ou', packedTeam: ''});
		const routes = {
			gen9ou: 'gen9',
			gen7letsgoou: 'gen7letsgo',
			gen8bdspou: 'gen8bdsp',
			gen9championsvgc2026regma: 'champions',
			gen1rbyplus: 'gen1rbyplus',
			gen2spaceworld97: 'gen2sw97',
			gen3pss: 'gen3pss',
			gen3megas: 'gen3mega',
			gen3megascaprandombattle: 'gen3megascap',
			gen3adv200: 'gen3rs',
			gen3adv200box: 'gen3adv200box',
			gen3frlg: 'gen3frlg',
			gen3frlgindigo: 'gen3frlgindigo',
			gen3zangouse: 'gen3zangouse',
			gen3advplus: 'gen3advplus',
			gen3tradebacks: 'gen3tradebacks',
			gen3puretradebacks: 'gen3puretradebacks',
			gen3hoennification: 'gen3hoennification',
			gen3shadowcolosseum: 'gen3shadowcolosseum',
			gen4megas: 'gen4mega',
			gen4nopss: 'gen4nopss',
			gen5bw1ou: 'gen5bw1',
			gen5dreamworldou: 'gen5bw1',
		};
		for (const [format, mod] of Object.entries(routes)) {
			editor.setFormat(format);
			assert.equal(editor.team.format, format);
			assert.equal(editor.dex.modid, mod, format);
			assert.equal(Dex.forFormat(format), editor.dex, format);
		}
	});

	it('preserves custom routing when a live format list refreshes cached metadata', () => {
		const editor = new TeamEditorState({format: 'gen3megascaprandombattle', packedTeam: ''});
		const retained = editor.format;
		const formats = Dex.formats.load({
			gen3megascaprandombattle: {name: '[Gen 3] Megas CAP Random Battle', team: 'preset'},
		});
		assert.equal(formats.gen3megascaprandombattle, retained);
		assert.equal(retained.team, 'preset');
		assert.equal(retained.mod, 'gen3megascap');
		editor.setFormat(retained.name);
		assert.equal(editor.dex.species.get('Kecleon-Mega-X').exists, true);
	});

	it('applies and clears Bad n Boosted stats when changing the editor format', () => {
		const editor = new TeamEditorState({format: 'gen3badnboosted', packedTeam: ''});
		const species = {baseStats: {hp: 70, atk: 71}};
		assert.equal(editor.getBaseStat(species, 'hp'), 140);
		assert.equal(editor.getBaseStat(species, 'atk'), 71);
		Dex.formats.load({gen3badnboosted: {name: "[Gen 3] Bad 'n Boosted"}});
		assert.equal(editor.getBaseStat(species, 'hp'), 140);
		editor.setFormat('gen3ou');
		assert.equal(editor.getBaseStat(species, 'hp'), 70);
	});
});
