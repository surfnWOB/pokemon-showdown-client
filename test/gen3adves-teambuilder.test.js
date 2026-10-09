const assert = require('assert').strict;
const {describe, it} = require('node:test');

window = global;

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
