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

const GEN4_ADDITIONS = {
	staraptormega: 'staraptite',
	lopunnymega: 'lopunnite',
	garchompmega: 'garchompite',
	lucariomega: 'lucarionite',
	abomasnowmega: 'abomasite',
	gallademega: 'galladite',
	froslassmega: 'froslassite',
};

function browsedPokemon(format) {
	const search = new BattlePokemonSearch('pokemon', format);
	const rows = search.getBaseResults();
	return {
		search,
		headers: rows.filter(row => row[0] === 'header').map(row => row[1]),
		pokemon: new Set(rows.filter(row => row[0] === 'pokemon').map(row => row[1])),
	};
}

describe('[Gen 4] Megas teambuilder data', () => {
	it('routes the OU format through the gen4mega client mod', () => {
		assert.equal(Dex.forFormat('gen4megas').modid, 'gen4mega');
		const {search} = browsedPokemon('gen4megas');
		assert.equal(search.dex.modid, 'gen4mega');
		assert.equal(search.isDoubles, false);
	});

	it('reconstructs the selected roster, stones, and no-Fairy adaptations', () => {
		const dex = Dex.mod('gen4mega');
		assert(BattleTeambuilderTable.gen4mega);

		for (const [forme, stone] of Object.entries(GEN4_ADDITIONS)) {
			const species = dex.species.get(forme);
			const item = dex.items.get(stone);
			assert.equal(species.exists, true, `${forme} should exist`);
			assert.equal(species.gen, 4, `${forme} should be a Gen 4 backport`);
			assert.equal(species.isNonstandard, null, `${forme} should be standard`);
			assert.notEqual(species.tier, 'Illegal', `${forme} should be usable`);
			assert.equal(item.gen, 4, `${stone} should be a Gen 4 item`);
			assert.equal(
				BattleTeambuilderTable.gen4mega.overrideItemData[stone].isNonstandard,
				null,
				`${stone} should be standard`
			);
			assert(BattleTeambuilderTable.gen4mega.items.includes(stone), `${stone} should be browseable`);
		}

		assert.deepEqual(dex.species.get('gardevoirmega').types, ['Psychic']);
		assert.deepEqual(dex.species.get('mawilemega').types, ['Steel']);
		assert.deepEqual(dex.species.get('altariamega').types, ['Dragon', 'Flying']);
		assert.equal(dex.species.get('heatranmega').tier, 'Illegal');
		assert.equal(dex.items.get('heatranite').gen > 4, true);
	});

	it('browses only the OU boundary', () => {
		const ou = browsedPokemon('gen4megas');
		assert.equal(ou.headers[0], 'OU');
		assert(ou.pokemon.has('gallademega'));
		assert(!ou.pokemon.has('garchompmega'));
		assert(!ou.pokemon.has('salamencemega'));
	});

	it('offers selected stones and only Gen 4-legal moves', () => {
		const items = new BattleItemSearch('item', 'gen4megas').getDefaultResults()
			.filter(row => row[0] === 'item')
			.map(row => row[1]);
		assert(items.includes('garchompite'));
		assert(items.includes('staraptite'));
		assert(!items.includes('heatranite'));

		const moves = new DexSearch('move', 'gen4megas', {species: 'Lucario', moves: []});
		moves.find('');
		const moveIds = moves.results.filter(row => row[0] === 'move').map(row => row[1]);
		assert(moveIds.includes('closecombat'));
		assert(!moveIds.includes('poweruppunch'));
	});

	it('uses available animated battle art and safe DPP builder fallbacks', () => {
		const staraptor = Dex.getSpriteData('Staraptor-Mega', true, {gen: 4});
		assert.equal(staraptor.url.endsWith('/ani/staraptor-mega.gif'), true);
		assert.deepEqual([staraptor.w, staraptor.h], [90, 87]);

		const froslass = Dex.getSpriteData('Froslass-Mega', false, {gen: 4});
		assert.equal(froslass.url.endsWith('/ani-back/froslass-mega.gif'), true);
		assert.deepEqual([froslass.w, froslass.h], [83, 121]);

		const dex = Dex.mod('gen4mega');
		const builderSprite = Dex.getTeambuilderSpriteData(dex.species.get('garchompmega'), dex);
		assert.equal(builderSprite.spriteDir, 'sprites/gen4');
		assert.equal(builderSprite.spriteid, 'garchomp');
	});
});
