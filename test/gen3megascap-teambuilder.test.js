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
		const builderDex = Dex.mod('gen3megascap');
		const ids = search.getBaseResults()
			.filter(row => row[0] === 'pokemon')
			.map(row => row[1]);

		const roster = {
			parasectmega: ['Parasect', 'parasectite'],
			venomothmega: ['Venomoth', 'venomite'],
			quagsiremega: ['Quagsire', 'quagsite'],
			magcargomega: ['Magcargo', 'magcargoite'],
			corsolamega: ['Corsola', 'corsolite'],
			beautiflymega: ['Beautifly', 'beautiflite'],
			masquerainmega: ['Masquerain', 'masquerite'],
			shedinjamega: ['Shedinja', 'shedinjite'],
			volbeatmega: ['Volbeat', 'volbeatite'],
			illumisemega: ['Illumise', 'illumite'],
			grumpigmega: ['Grumpig', 'grumpigite'],
			flygonmega: ['Flygon', 'flygonite'],
			solrockmega: ['Solrock', 'solerock'],
			kecleonmegax: ['Kecleon', 'kecleitex'],
			kecleonmegay: ['Kecleon', 'kecleitey'],
			luvdiscmega: ['Luvdisc', 'luvdite'],
		};
		for (const [id, [baseName, stoneId]] of Object.entries(roster)) {
			const species = builderDex.species.get(id);
			const base = builderDex.species.get(baseName);
			const stone = builderDex.items.get(stoneId);
			assert(ids.includes(id), `${id} should be visible in the CAP builder`);
			assert.equal(species.exists, true, `${id} should exist`);
			assert.equal(species.baseSpecies, baseName);
			assert.equal(species.gen, 3);
			assert.equal(species.isNonstandard, null);
			assert.equal(species.tier, 'OU', `${id} should be OU, not illegal`);
			assert.equal(species.isMega, true, `${id} should retain its Mega identity`);
			assert(base.otherFormes?.includes(species.name), `${baseName} should link to ${species.name}`);
			assert.deepEqual(species.requiredItems, [stone.name]);
			assert.equal(stone.exists, true, `${stoneId} should exist`);
			assert.equal(stone.gen, 3);
			assert.equal(BattleTeambuilderTable.gen3megascap.overrideItemData[stoneId].isNonstandard, null);
			assert.equal(stone.megaStone[baseName], species.name);
			assert(BattleTeambuilderTable.gen3megascap.items.includes(stoneId),
				`${stoneId} should be in the CAP item table`);
		}
		assert(builderDex.species.get('corsola').otherFormes.includes('Corsola-Galar'));
		assert.deepEqual(builderDex.species.get('beautiflymega').baseStats,
			{hp: 90, atk: 10, def: 90, spa: 110, spd: 90, spe: 110});
		const flygon = builderDex.species.get('flygonmega');
		assert.equal(flygon.name, 'Flygon-Mega');
		assert.equal(flygon.forme, 'Mega');
		assert.equal(flygon.isMega, true);
		assert.deepEqual(flygon.requiredItems, ['Flygonite']);
		assert.deepEqual(builderDex.items.get('flygonite').megaStone, {Flygon: 'Flygon-Mega'});

		const itemIds = new BattleItemSearch('item', 'gen3megascap').getBaseResults()
			.filter(row => row[0] === 'item')
			.map(row => row[1]);
		for (const [, stoneId] of Object.values(roster)) {
			assert(itemIds.includes(stoneId), `${stoneId} should be visible in the CAP item picker`);
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
