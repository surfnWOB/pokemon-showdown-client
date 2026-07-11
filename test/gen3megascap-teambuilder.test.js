const assert = require('assert').strict;
const {describe, it} = require('node:test');

window = global;

global.BattlePokedex = require('../play.pokemonshowdown.com/data/pokedex.js').BattlePokedex;
global.BattleItems = require('../play.pokemonshowdown.com/data/items.js').BattleItems;
global.BattleTeambuilderTable =
	require('../play.pokemonshowdown.com/data/teambuilder-tables.js').BattleTeambuilderTable;
Object.assign(global, require('../play.pokemonshowdown.com/data/search-index.js'));
require('../play.pokemonshowdown.com/js/battle-dex-data.js');
require('../play.pokemonshowdown.com/js/battle-dex.js');
require('../play.pokemonshowdown.com/js/battle-dex-search.js');

describe('[Gen 3] Megas CAP teambuilder data', () => {
	it('should expose the whole CAP Mega roster and its custom Mega Stone', () => {
		const search = new BattlePokemonSearch('pokemon', 'gen3megascap');
		const ids = search.getBaseResults()
			.filter(row => row[0] === 'pokemon')
			.map(row => row[1]);

		// The format is OU-based, but the builder must still surface its banned
		// Mega/Primal forms so players can see the complete roster and their status.
		for (const id of ['magcargomega', 'gengarmega', 'blazikenmega', 'groudonprimal']) {
			assert(ids.includes(id), `${id} should be visible in the CAP builder`);
		}

		const magcargo = search.dex.species.get('magcargomega');
		assert.equal(magcargo.exists, true);
		assert.equal(magcargo.name, 'Magcargo-Mega');
		assert.equal(magcargo.baseSpecies, 'Magcargo');
		assert.equal(magcargo.forme, 'Mega');
		assert.deepEqual(magcargo.requiredItems, ['Magcargoite']);

		const stone = search.dex.items.get('magcargoite');
		assert.equal(stone.exists, true);
		assert.equal(stone.name, 'Magcargoite');
		assert.deepEqual(stone.megaStone, {Magcargo: 'Magcargo-Mega'});
		assert(BattleTeambuilderTable.gen3megascap.items.includes('magcargoite'));

		const itemIds = new BattleItemSearch('item', 'gen3megascap').getBaseResults()
			.filter(row => row[0] === 'item')
			.map(row => row[1]);
		for (const id of ['magcargoite', 'gengarite', 'blazikenite']) {
			assert(itemIds.includes(id), `${id} should be visible in the CAP item picker`);
		}

		assert(BattleSearchIndex.some(([id, type]) => id === 'magcargomega' && type === 'pokemon'));
		assert(BattleSearchIndex.some(([id, type]) => id === 'magcargoite' && type === 'item'));
	});
});
