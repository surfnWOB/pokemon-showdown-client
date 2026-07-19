const assert = require('assert').strict;
const fs = require('node:fs');
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

const latestCapMegas = {
	venomothmega: ['venomoth', 'Venomoth', 'venomite', 'poison'],
	quagsiremega: ['quagsire', 'Quagsire', 'quagsite', 'ground'],
	corsolamega: ['corsola', 'Corsola', 'corsolite', 'psychic'],
	masquerainmega: ['masquerain', 'Masquerain', 'masquerite', 'water'],
	shedinjamega: ['shedinja', 'Shedinja', 'shedinjite', 'ghost'],
	volbeatmega: ['volbeat', 'Volbeat', 'volbeatite', 'electric'],
	illumisemega: ['illumise', 'Illumise', 'illumite', 'electric'],
	grumpigmega: ['grumpig', 'Grumpig', 'grumpigite', 'psychic'],
	flygonmega: ['flygon', 'Flygon', 'flygonite', 'dragon'],
	solrockmega: ['solrock', 'Solrock', 'solerock', 'psychic'],
	kecleonmegax: ['kecleon', 'Kecleon', 'kecleitex', 'normal'],
	kecleonmegay: ['kecleon', 'Kecleon', 'kecleitey', 'normal'],
};

const authoritativeUpdatedMegas = {
	corsolamega: [[90, 100, 120, 100, 95, 35], ['Water', 'Psychic'], 'Natural Cure'],
	mightyenamegax: [[61, 110, 60, 119, 60, 110], ['Dark'], 'Serene Grace'],
	mightyenamegay: [[100, 100, 100, 35, 110, 95], ['Dark', 'Poison'], 'Fur Coat'],
	beautiflymega: [[90, 10, 90, 130, 90, 116], ['Grass', 'Flying'], 'Mega Sol'],
	masquerainmega: [[91, 80, 84, 90, 110, 95], ['Bug', 'Water'], 'Water Bubble'],
	volbeatmega: [[85, 65, 75, 90, 90, 125], ['Bug', 'Electric'], 'Teravolt'],
	grumpigmega: [[100, 60, 80, 125, 125, 80], ['Psychic'], 'Opportunist'],
	flygonmega: [[80, 100, 120, 100, 80, 110], ['Ground', 'Dragon'], 'Sandy'],
	solrockmega: [[90, 115, 110, 90, 85, 90], ['Rock', 'Psychic'], 'High Noon'],
	kecleonmegax: [[60, 120, 60, 110, 120, 105], ['Normal'], 'Color Change'],
	kecleonmegay: [[100, 100, 120, 100, 100, 40], ['Normal'], 'Protean'],
	walreinmega: [[125, 80, 100, 100, 115, 80], ['Water', 'Ice'], 'Snow Warning'],
};

describe('[Gen 3] Megas CAP teambuilder data', () => {
	it('should use base-species compact icons for mod-only Megas', () => {
		const builderDex = Dex.mod('gen3megascap');
		const unknownIcon = Dex.getPokemonIcon('missingno');

		for (const [mega, [base]] of Object.entries(latestCapMegas)) {
			const megaIcon = Dex.getPokemonIcon(builderDex.species.get(mega));
			assert.equal(megaIcon, Dex.getPokemonIcon(builderDex.species.get(base)),
				`${mega} should borrow ${base}'s compact icon`);
			assert.notEqual(megaIcon, unknownIcon, `${mega} should not use the unknown compact icon`);
		}

		// A globally indexed forme must keep its own icon instead of falling back.
		global.BattlePokemonIconIndexes = {charizardmegax: 1};
		try {
			const megaCharizard = builderDex.species.get('charizardmegax');
			const dedicatedIcon = Dex.getPokemonIcon(megaCharizard);
			assert.equal(dedicatedIcon, Dex.getPokemonIcon('charizardmegax'));
			assert.notEqual(dedicatedIcon, Dex.getPokemonIcon('charizard'));
		} finally {
			delete global.BattlePokemonIconIndexes;
		}
	});

	it('should browse from OU while keeping Ubers text-searchable', () => {
		const search = new DexSearch('pokemon', 'gen3megascap');
		search.find('');
		const defaultResults = search.results;
		const headers = defaultResults.filter(row => row[0] === 'header').map(row => row[1]);
		const pokemon = defaultResults.filter(row => row[0] === 'pokemon').map(row => row[1]);

		assert.equal(headers[0], 'OU');
		assert(!headers.includes('Uber'));
		for (const mega of [
			'parasectmega', ...Object.keys(latestCapMegas), 'magcargomega', 'beautiflymega', 'luvdiscmega',
		]) {
			assert(pokemon.includes(mega), `${mega} should remain in the default OU browse pool`);
		}
		for (const [id, tier] of [['mewtwo', 'Uber'], ['salamencemega', 'AG']]) {
			assert(!pokemon.includes(id), `${id} should be absent from the default OU browse pool`);
			search.find(id);
			assert(search.results.some(row => row[0] === 'pokemon' && row[1] === id),
				`${id} should remain text-searchable as an illegal ${tier}`);
			assert.equal(search.illegalLabel(id), 'Illegal');
		}
	});

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
		for (const [id, [stats, types, ability]] of Object.entries(authoritativeUpdatedMegas)) {
			const species = builderDex.species.get(id);
			assert.deepEqual(
				['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(stat => species.baseStats[stat]),
				stats,
				`${id} should expose the updated stats in the builder`
			);
			assert.deepEqual(species.types, types, `${id} should expose the updated typing in the builder`);
			assert.equal(species.abilities[0], ability, `${id} should expose the updated ability in the builder`);
		}
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

	it('should reconstruct custom CAP abilities before applying cross-effect aliases', () => {
		const builderDex = Dex.mod('gen3megascap');
		const expectedAbilities = {
			shady: ["Shady", 315, "This Pokemon's Ghost-type moves can hit Normal-type Pokemon."],
			highnoon: ["High Noon", 320,
				"On switch-in, this Pokemon summons Sunny Day indefinitely and is immune to Ground-type moves."],
			sandy: ["Sandy", 321, "This Pokemon's Ground-type moves can hit Flying-type Pokemon."],
		};

		for (const [id, [name, num, shortDesc]] of Object.entries(expectedAbilities)) {
			const ability = builderDex.abilities.get(name);
			assert.equal(ability.id, id);
			assert.equal(ability.name, name);
			assert.equal(ability.exists, true);
			assert.equal(ability.num, num);
			assert.equal(ability.gen, 3);
			assert.equal(ability.isNonstandard, false);
			assert.equal(ability.shortDesc, shortDesc);
		}
		assert.equal(builderDex.species.get('sandy').name, 'Sandy Shocks',
			'the Sandy Shocks species alias should remain available outside ability lookups');
	});

	it('should index the mod-only Megas, their Mega aliases, and their stones only in the CAP mod', () => {
		for (const [mega, [, baseName, stone]] of Object.entries(latestCapMegas)) {
			const axisSuffix = mega.endsWith('megax') ? 'x' : mega.endsWith('megay') ? 'y' : '';
			const megaAlias = `mega${baseName.toLowerCase()}${axisSuffix}`;
			assert(BattleSearchIndex.some(row => row.length === 2 && row[0] === mega && row[1] === 'pokemon'),
				`${mega} should have a direct search-index row`);
			assert(BattleSearchIndex.some(row => row[0] === megaAlias &&
				row[1] === 'pokemon' && BattleSearchIndex[row[2]]?.[0] === mega),
			`${mega} should have a Mega-first alias`);
			assert(BattleSearchIndex.some(row => row.length === 2 && row[0] === stone && row[1] === 'item'),
				`${stone} should have a direct search-index row`);

			const pokemonSearch = new DexSearch('pokemon', 'gen3megascap');
			pokemonSearch.find(megaAlias);
			assert(pokemonSearch.results.some(row => row[0] === 'pokemon' && row[1] === mega),
				`${mega} should be searchable by its Mega-first name`);

			const itemSearch = new DexSearch('item', 'gen3megascap');
			itemSearch.find(stone);
			assert(itemSearch.results.some(row => row[0] === 'item' && row[1] === stone),
				`${stone} should be searchable by name`);
		}

		const standardPokemonSearch = new DexSearch('pokemon', 'gen3ou');
		standardPokemonSearch.find('megaflygon');
		assert(!standardPokemonSearch.results.some(row => row[0] === 'pokemon' && row[1] === 'flygonmega'));
		const standardItemSearch = new DexSearch('item', 'gen3ou');
		standardItemSearch.find('flygonite');
		assert(!standardItemSearch.results.some(row => row[0] === 'item' && row[1] === 'flygonite'));

		for (const ability of ['highnoon', 'sandy']) {
			assert(BattleSearchIndex.some(row => row.length === 2 && row[0] === ability && row[1] === 'ability'),
				`${ability} should have a direct search-index row`);
			const abilitySearch = new DexSearch('ability', 'gen3megascap');
			abilitySearch.find(ability);
			assert(abilitySearch.results.some(row => row[0] === 'ability' && row[1] === ability),
				`${ability} should be searchable by name in the CAP mod`);
			const standardAbilitySearch = new DexSearch('ability', 'gen3ou');
			standardAbilitySearch.find(ability);
			assert(!standardAbilitySearch.results.some(row => row[0] === 'ability' && row[1] === ability),
				`${ability} should remain absent from standard Gen 3 ability searches`);
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
		mightyenamegay: ['mightyena', 'poison'],
		beautiflymega: ['beautifly', 'grass'],
		walreinmega: ['walrein', 'ice'],
		luvdiscmega: ['luvdisc', 'water'],
		...Object.fromEntries(Object.entries(latestCapMegas).map(([mega, [base, , , auraType]]) => (
			[mega, [base, auraType]]
		))),
	};

	it('should route the full eligible CAP Mega roster to enlarged base Gen 3 art', () => {
		assert.deepEqual(Object.keys(Dex.gen3MegasCapAuraTypes).sort(), Object.keys(auraRoster).sort());
		assert.equal(Dex.gen3MegasCapAuraTypes.beautiflymega, 'grass');
		const builderDex = Dex.mod('gen3megascap');

		for (const [mega, [base, auraType]] of Object.entries(auraRoster)) {
			const builderSprite = Dex.getTeambuilderSpriteData({species: mega, shiny: true}, builderDex);
			const normalFront = Dex.getSpriteData(base, true, {gen: 3, mod: 'gen3megascap'});
			const normalBack = Dex.getSpriteData(base, false, {gen: 3, mod: 'gen3megascap'});
			const front = Dex.getSpriteData(mega, true, {gen: 3, mod: 'gen3megascap'});
			const back = Dex.getSpriteData(mega, false, {gen: 3, mod: 'gen3megascap'});
			const shinyFront = Dex.getSpriteData(mega, true, {gen: 3, shiny: true, mod: 'gen3megascap'});
			const shinyBack = Dex.getSpriteData(mega, false, {gen: 3, shiny: true, mod: 'gen3megascap'});

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

	it('should keep every new aura on Gen 3 only and honor static-animation preferences', () => {
		for (const mega of Object.keys(latestCapMegas)) {
			assert.equal(Dex.getSpriteData(mega, true, {gen: 4, mod: 'gen3megascap'}).gen3MegasCapAura, undefined);
			assert.equal(Dex.getSpriteData(mega, true, {gen: 3}).gen3MegasCapAura, undefined);
			assert.equal(Dex.getSpriteData(mega, true, {gen: 3, mod: 'gen3mega'}).gen3MegasCapAura, undefined);
		}
		assert.equal(Dex.getSpriteData('raichumegay', true, {gen: 3}).gen3MegasCapAura, undefined);
		assert.equal(Dex.gen3MegasCapAuraTypes.magcargomega, undefined,
			'Magcargo-Mega has dedicated art and must stay outside the procedural roster');

		global.PS.prefs.nopastgens = true;
		for (const [mega, [base]] of Object.entries(latestCapMegas)) {
			const forcedGen3 = Dex.getSpriteData(mega, true, {gen: 3, mod: 'gen3megascap'});
			assert.equal(forcedGen3.url.endsWith(`/sprites/gen3/${base}.png`), true);
		}
		delete global.PS.prefs.nopastgens;

		global.PS.prefs.noanim = true;
		for (const mega of Object.keys(latestCapMegas)) {
			const staticAura = Dex.getSpriteData(mega, true, {gen: 3, mod: 'gen3megascap'}).gen3MegasCapAura;
			assert.equal(staticAura.animated, false);
		}
		delete global.PS.prefs.noanim;
		for (const mega of Object.keys(latestCapMegas)) {
			assert.equal(Dex.getSpriteData(mega, true, {gen: 3, mod: 'gen3megascap'}).gen3MegasCapAura.animated,
				true);
		}
	});

	it('should keep standard cries for non-aura mons under the CAP scene mod', () => {
		// Wiring scene.mod='gen3megascap' routes every battle sprite call through the CAP
		// mod. The mod-cry block must NOT then divert ordinary cries to a per-mod audio dir
		// that only the digimon mod ships — that would 404 cries format-wide. Seed a minimal
		// BattlePokemonSprites so the standard cry path (gated on miscData.num) actually runs.
		global.BattlePokemonSprites = {tyranitar: {num: 248}, skarmory: {num: 227}, magcargomega: {num: 219}};
		try {
			const expected = {
				tyranitar: 'audio/cries/tyranitar.mp3',
				skarmory: 'audio/cries/skarmory.mp3',
				magcargomega: 'audio/cries/magcargo-mega.mp3',
			};
			for (const [id, cryurl] of Object.entries(expected)) {
				const sprite = Dex.getSpriteData(id, true, {gen: 3, mod: 'gen3megascap'});
				assert.equal(sprite.cryurl, cryurl,
					`${id} should keep its standard audio/cries/ path, not a per-mod audio dir`);
				assert.equal(sprite.cryurl.startsWith('sprites/'), false,
					`${id} must not use a per-mod audio dir under gen3megascap`);
			}
		} finally {
			delete global.BattlePokemonSprites;
		}
	});

	it('should define palettes for every aura type newly introduced by this roster', () => {
		const css = fs.readFileSync('play.pokemonshowdown.com/style/battle.css', 'utf8');
		// Every aura type actually assigned to a roster Mega must have a CSS palette,
		// otherwise it silently falls back to the default purple aura (this caught the
		// missing `.gen3megascap-aura-ghost` used by parasect/noctowl/shedinja Megas).
		for (const type of new Set(Object.values(Dex.gen3MegasCapAuraTypes))) {
			assert.match(css, new RegExp(`\\.gen3megascap-aura-${type}\\s*\\{`),
				`missing CSS palette for aura type ${type}`);
		}
		const grassPalette = css.match(/\.gen3megascap-aura-grass\s*\{([^}]*)\}/)?.[1] || '';
		for (const variable of ['inner-color', 'inner-alpha', 'outer-color', 'outer-alpha']) {
			assert.match(grassPalette, new RegExp(`--g3mc-${variable}:`));
		}
	});
});
