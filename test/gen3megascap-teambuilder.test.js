const assert = require('assert').strict;
const {describe, it} = require('node:test');

window = global;

global.Pokemon = class Pokemon {};
global.PS = {prefs: {}};
global.BattlePokedex = require('../play.pokemonshowdown.com/data/pokedex.js').BattlePokedex;
global.BattleItems = require('../play.pokemonshowdown.com/data/items.js').BattleItems;
global.BattleTeambuilderTable =
	require('../play.pokemonshowdown.com/data/teambuilder-tables.js').BattleTeambuilderTable;
Object.assign(global, require('../play.pokemonshowdown.com/data/search-index.js'));
require('../play.pokemonshowdown.com/js/battle-dex-data.js');
require('../play.pokemonshowdown.com/js/battle-dex.js');
require('../play.pokemonshowdown.com/js/battle-dex-search.js');

describe('[Gen 3] Megas CAP teambuilder data', () => {
	it('should expose the whole CAP Mega roster and its custom Mega Stones', () => {
		const search = new BattlePokemonSearch('pokemon', 'gen3megascap');
		const ids = search.getBaseResults()
			.filter(row => row[0] === 'pokemon')
			.map(row => row[1]);

		// The format is OU-based, but the builder must still surface its banned
		// Mega/Primal forms so players can see the complete roster and their status.
		const newMegas = [
			'parasectmega', 'hitmonchanmega', 'dittomega', 'noctowlmega', 'mantinemega',
			'mightyenamegax', 'mightyenamegay', 'beautiflymega', 'walreinmega', 'luvdiscmega',
		];
		for (const id of [...newMegas, 'magcargomega', 'gengarmega', 'blazikenmega', 'groudonprimal']) {
			assert(ids.includes(id), `${id} should be visible in the CAP builder`);
		}

		const magcargo = search.dex.species.get('magcargomega');
		assert.equal(magcargo.exists, true);
		assert.equal(magcargo.name, 'Magcargo-Mega');
		assert.equal(magcargo.baseSpecies, 'Magcargo');
		assert.equal(magcargo.forme, 'Mega');
		assert.deepEqual(magcargo.requiredItems, ['Magcargoite']);
		assert.deepEqual(search.dex.species.get('beautiflymega').baseStats,
			{hp: 90, atk: 35, def: 90, spa: 80, spd: 90, spe: 100});

		const stone = search.dex.items.get('magcargoite');
		assert.equal(stone.exists, true);
		assert.equal(stone.name, 'Magcargoite');
		assert.deepEqual(stone.megaStone, {Magcargo: 'Magcargo-Mega'});
		assert(BattleTeambuilderTable.gen3megascap.items.includes('magcargoite'));
		const newStones = [
			'parasectite', 'hitmonchanite', 'dittite', 'noctite', 'mantite',
			'mightyenitex', 'mightyenitey', 'beautiflite', 'walrite', 'luvdite',
		];
		for (const id of newStones) {
			assert(BattleTeambuilderTable.gen3megascap.items.includes(id),
				`${id} should be in the CAP item table`);
		}

		const itemIds = new BattleItemSearch('item', 'gen3megascap').getBaseResults()
			.filter(row => row[0] === 'item')
			.map(row => row[1]);
		for (const id of [...newStones, 'magcargoite', 'gengarite', 'blazikenite']) {
			assert(itemIds.includes(id), `${id} should be visible in the CAP item picker`);
		}

		assert(BattleSearchIndex.some(([id, type]) => id === 'magcargomega' && type === 'pokemon'));
		assert(BattleSearchIndex.some(([id, type]) => id === 'magcargoite' && type === 'item'));
		for (const id of newMegas) {
			assert(BattleSearchIndex.some(([indexId, type]) => indexId === id && type === 'pokemon'));
		}
		for (const id of newStones) {
			assert(BattleSearchIndex.some(([indexId, type]) => indexId === id && type === 'item'));
		}
	});
});

describe('[Gen 3] Megas CAP procedural battle sprites', () => {
	const auraRoster = {
		parasectmega: ['parasect', 'ghost'],
		hitmonchanmega: ['hitmonchan', 'fighting'],
		dittomega: ['ditto', 'normal'],
		noctowlmega: ['noctowl', 'ghost'],
		mantinemega: ['mantine', 'dragon'],
		mightyenamegax: ['mightyena', 'dark'],
		mightyenamegay: ['mightyena', 'dark'],
		beautiflymega: ['beautifly', 'psychic'],
		walreinmega: ['walrein', 'ice'],
		luvdiscmega: ['luvdisc', 'water'],
	};

	it('should route exactly Archie\'s ten new Megas to enlarged base Gen 3 art', () => {
		assert.deepEqual(Object.keys(Dex.gen3MegasCapAuraTypes).sort(), Object.keys(auraRoster).sort());
		const builderDex = Dex.mod('gen3megascap');

		for (const [mega, [base, auraType]] of Object.entries(auraRoster)) {
			const builderSprite = Dex.getTeambuilderSpriteData({species: mega, shiny: true}, builderDex);
			const normalFront = Dex.getSpriteData(base, true, {gen: 3});
			const normalBack = Dex.getSpriteData(base, false, {gen: 3});
			const front = Dex.getSpriteData(mega, true, {gen: 3});
			const back = Dex.getSpriteData(mega, false, {gen: 3});
			const shinyFront = Dex.getSpriteData(mega, true, {gen: 3, shiny: true});
			const shinyBack = Dex.getSpriteData(mega, false, {gen: 3, shiny: true});

			assert.deepEqual(builderSprite, {
				spriteid: base, spriteDir: 'sprites/gen3', shiny: true, x: 10, y: 5, pixelated: true,
			});
			assert.equal(front.url.endsWith(`/sprites/gen3/${base}.png`), true);
			assert.equal(back.url.endsWith(`/sprites/gen3-back/${base}.png`), true);
			assert.equal(shinyFront.url.endsWith(`/sprites/gen3-shiny/${base}.png`), true);
			assert.equal(shinyBack.url.endsWith(`/sprites/gen3-back-shiny/${base}.png`), true);
			assert.equal(front.w, normalFront.w * 1.16);
			assert.equal(front.h, normalFront.h * 1.16);
			assert.equal(back.w, normalBack.w * 1.16);
			assert.equal(back.h, normalBack.h * 1.16);
			assert.equal(front.pixelated, true);
			assert.equal(front.cryurl, `audio/cries/${base}.mp3`);
			assert.equal(front.gen3MegasCapAura.type, auraType);
			assert.equal(front.gen3MegasCapAura.species, mega);
			assert.equal(front.gen3MegasCapAura.innerDuration >= 2800, true);
			assert.equal(front.gen3MegasCapAura.innerDuration <= 3600, true);
			assert.equal(front.gen3MegasCapAura.innerDuration % 100, 0);
			assert.equal(
				Math.abs(front.gen3MegasCapAura.outerDuration / front.gen3MegasCapAura.innerDuration - 1.618) < 0.001,
				true
			);
			assert.equal(front.gen3MegasCapAura.innerDelay < 0, true);
			assert.equal(front.gen3MegasCapAura.outerDelay < 0, true);
			assert.deepEqual(back.gen3MegasCapAura, front.gen3MegasCapAura);
		}
	});

	it('should keep the aura on Gen 3 only and honor static-animation preferences', () => {
		assert.equal(Dex.getSpriteData('parasectmega', true, {gen: 4}).gen3MegasCapAura, undefined);
		assert.equal(Dex.getSpriteData('raichumegay', true, {gen: 3}).gen3MegasCapAura, undefined);

		global.PS.prefs.nopastgens = true;
		const forcedGen3 = Dex.getSpriteData('parasectmega', true, {gen: 3});
		delete global.PS.prefs.nopastgens;
		assert.equal(forcedGen3.url.endsWith('/sprites/gen3/parasect.png'), true);

		global.PS.prefs.noanim = true;
		const staticAura = Dex.getSpriteData('parasectmega', true, {gen: 3}).gen3MegasCapAura;
		delete global.PS.prefs.noanim;
		assert.equal(staticAura.animated, false);
		assert.equal(Dex.getSpriteData('parasectmega', true, {gen: 3}).gen3MegasCapAura.animated, true);
	});
});
