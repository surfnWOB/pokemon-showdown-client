const assert = require('assert').strict;
const {describe, it} = require('node:test');

window = global;

global.BattleText = require('../play.pokemonshowdown.com/data/text/en.js').BattleText;
global.Pokemon = class Pokemon {};
global.PS = {prefs: {}};
global.BattlePokedex = require('../play.pokemonshowdown.com/data/pokedex.js').BattlePokedex;
global.BattleItems = require('../play.pokemonshowdown.com/data/items.js').BattleItems;
global.BattleAbilities = require('../play.pokemonshowdown.com/data/abilities.js').BattleAbilities;
global.BattleAliases = require('../play.pokemonshowdown.com/data/aliases.js').BattleAliases;
global.BattleMovedex = require('../play.pokemonshowdown.com/data/moves.js').BattleMovedex;
global.BattleTeambuilderTable =
	require('../play.pokemonshowdown.com/data/teambuilder-tables.js').BattleTeambuilderTable;
Object.assign(global, require('../play.pokemonshowdown.com/data/search-index.js'));
require('../play.pokemonshowdown.com/js/battle-dex-data.js');
require('../play.pokemonshowdown.com/js/battle-dex.js');
require('../play.pokemonshowdown.com/js/battle-dex-search.js');

function pokemonMatchingMove(format, move) {
	const search = new DexSearch('pokemon', format);
	search.addFilter(['move', move]);
	search.find('');
	return search.results.filter(row => row[0] === 'pokemon').map(row => row[1]);
}

describe('[Gen 3] ADV ES teambuilder', () => {
	it('uses server-provided ADV ES accuracy without changing ADV OU', () => {
		const {Dex: ServerDex} = require('../caches/pokemon-showdown/dist/sim/dex');
		const es = Dex.forFormat('gen3adves');
		assert.equal(es.modid, 'gen3es');
		const search = new DexSearch('move', 'gen3adves', {species: 'Metagross', moves: []});
		assert.equal(search.typedSearch.dex.modid, 'gen3es');
		for (const id of ['meteormash', 'rockslide', 'toxic']) {
			const expected = ServerDex.mod('gen3es').moves.get(id);
			assert.equal(es.moves.get(id).accuracy, expected.accuracy);
			assert.equal(Dex.forFormat('gen3ou').moves.get(id).accuracy,
				ServerDex.mod('gen3').moves.get(id).accuracy);
		}
	});

	it('resolves displayed short and full ADV ES descriptions without leaking into ADV OU', () => {
		const {CLIENT_MODS} = require('../build-tools/build-translations');
		assert(CLIENT_MODS.includes('gen3es'));
		const {Dex: ServerDex} = require('../caches/pokemon-showdown/dist/sim/dex');
		const es = Dex.forFormat('gen3adves');
		const ou = Dex.forFormat('gen3ou');
		for (const id of ['rockslide', 'meteormash', 'protect', 'detect', 'endure']) {
			const data = ServerDex.mod('gen3es').data.Moves[id];
			const ordinaryText = ou.text.get(ou.moves.get(id), 'en');
			const text = es.text.get(es.moves.get(id), 'en');
			// Test the renderer's resolver, not unused descriptions on Move objects.
			// Derive expectations from the checked-out server so CI also supports
			// the pre-V4 server until the companion server PR is merged.
			assert.equal(text.shortDesc, data.shortDesc || data.desc || ordinaryText.shortDesc, id);
			assert.equal(text.desc, data.desc || data.shortDesc || ordinaryText.desc, id);
			assert.doesNotMatch(ordinaryText.desc, /alternate between success and failure/i, id);
			if (id === 'rockslide') assert.match(ordinaryText.shortDesc, /flinch/i);
			if (id === 'meteormash') assert.match(ordinaryText.shortDesc, /Attack/i);
		}
	});

	it('offers Extreme Speed exactly once as a legal move for every Gen 3 species', () => {
		const {Dex: ServerDex} = require('../caches/pokemon-showdown/dist/sim/dex');
		const dex = ServerDex.mod('gen3es');
		let checked = 0;
		for (const species of dex.species.all()) {
			if (species.gen > 3 || species.num < 1 || species.isNonstandard || species.forme) continue;
			assert(dex.species.getLearnsetData(species.id).learnset.extremespeed, species.name);
			const search = new DexSearch('move', 'gen3adves', {species: species.name, moves: []});
			search.find('');
			assert.equal(search.results.filter(row => row[0] === 'move' && row[1] === 'extremespeed').length,
				1, species.name);
			search.find('extremespeed');
			assert.equal(search.typedSearch.illegalReasons.extremespeed, undefined, species.name);
			checked++;
		}
		assert.equal(checked, 386);
	});

	it('includes ordinary non-learners in the Extreme Speed Pokemon filter only in ADV ES', () => {
		const es = pokemonMatchingMove('gen3adves', 'extremespeed');
		const ou = pokemonMatchingMove('gen3ou', 'extremespeed');
		for (const id of ['snorlax', 'magikarp', 'ditto', 'unown']) {
			assert(es.includes(id), id);
			assert(!ou.includes(id), id);
		}
		assert(ou.includes('arcanine'));
	});

	it('does not grant other moves or change ordinary ADV move suggestions', () => {
		for (const format of ['gen3adves', 'gen3ou']) {
			const search = new DexSearch('move', format, {species: 'Magikarp', moves: []});
			search.find('');
			assert(search.results.some(row => row[0] === 'move' && row[1] === 'splash'));
			assert(!search.results.some(row => row[0] === 'move' && row[1] === 'earthquake'));
			assert.equal(search.results.some(row => row[0] === 'move' && row[1] === 'extremespeed'),
				format === 'gen3adves');
		}
	});
});
