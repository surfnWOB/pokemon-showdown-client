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

describe('[Gen 3] STABmons teambuilder filters', () => {
	it('should include Pokemon that gain a filtered move through STABmons typing', () => {
		const stabmonsResults = pokemonMatchingMove('gen3stabmons', 'spikes');
		assert(stabmonsResults.includes('tyranitar'),
			'Tyranitar should match Spikes through the Ground typing of Larvitar and Pupitar');

		const moveSearch = new DexSearch('move', 'gen3stabmons', {species: 'Tyranitar', moves: []});
		moveSearch.find('');
		assert(moveSearch.results.some(row => row[0] === 'move' && row[1] === 'spikes'),
			'Tyranitar should still see Spikes in its move picker');

		const ouResults = pokemonMatchingMove('gen3ou', 'spikes');
		assert(!ouResults.includes('tyranitar'),
			'Tyranitar should not match Spikes outside STABmons');
	});

	it('should not grant restricted moves through STABmons typing', () => {
		const results = pokemonMatchingMove('gen3stabmons', 'spore');
		assert(!results.includes('venusaur'), 'Venusaur should not gain restricted Spore through its Grass typing');
		assert(results.includes('breloom'), 'Breloom should still match Spore because it learns the move normally');
	});
});
