const assert = require('assert').strict;
const {describe, it} = require('node:test');

window = global;

global.Pokemon = class Pokemon {};
global.PS = {prefs: {}};
global.BattlePokedex = require('../play.pokemonshowdown.com/data/pokedex.js').BattlePokedex;
global.BattleItems = require('../play.pokemonshowdown.com/data/items.js').BattleItems;
global.BattleAbilities = require('../play.pokemonshowdown.com/data/abilities.js').BattleAbilities;
global.BattleAliases = require('../play.pokemonshowdown.com/data/aliases.js').BattleAliases;
global.BattleTeambuilderTable =
	require('../play.pokemonshowdown.com/data/teambuilder-tables.js').BattleTeambuilderTable;
Object.assign(global, require('../play.pokemonshowdown.com/data/search-index.js'));
require('../play.pokemonshowdown.com/js/battle-dex-data.js');
require('../play.pokemonshowdown.com/js/battle-dex.js');
require('../play.pokemonshowdown.com/js/battle-dex-search.js');

describe('[Gen 3] ADV 200 Box teambuilder data', () => {
	it('routes the format through its isolated client mod', () => {
		assert.equal(Dex.forFormat('gen3adv200box').modid, 'gen3adv200box');
		const search = new DexSearch('pokemon', 'gen3adv200box');
		assert.equal(search.typedSearch.formatType, 'gen3adv200box');
		assert.equal(search.dex.modid, 'gen3adv200box');
	});

	it('exposes the four Pokemon Box moves without leaking them into ADV 200', () => {
		const gifts = {
			zigzagoon: 'extremespeed',
			pichu: 'surf',
			swablu: 'falseswipe',
			skitty: 'payday',
		};
		for (const [species, move] of Object.entries(gifts)) {
			assert.equal(BattleTeambuilderTable.gen3adv200box.learnsets[species][move], '3');
			assert.equal(BattleTeambuilderTable.gen3rs.learnsets[species][move], undefined);

			const search = new DexSearch('move', 'gen3adv200box', {species, moves: []});
			search.find('');
			assert(search.results.some(row => row[0] === 'move' && row[1] === move),
				`${move} should be selectable for ${species}`);
		}
	});

	it('exposes Enigma Berry only in the Box item table', () => {
		const boxItems = new BattleItemSearch('item', 'gen3adv200box').getDefaultResults()
			.filter(row => row[0] === 'item').map(row => row[1]);
		const baseItems = new BattleItemSearch('item', 'gen3adv200').getDefaultResults()
			.filter(row => row[0] === 'item').map(row => row[1]);
		assert(boxItems.includes('enigmaberry'));
		assert(!baseItems.includes('enigmaberry'));
	});
});
