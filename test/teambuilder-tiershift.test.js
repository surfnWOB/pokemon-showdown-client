const assert = require('assert').strict;
const {describe, it} = require('node:test');

window = global;

// The teambuilder search's getStatBoost consults the gen3subzu mod's tier table
// to give SU mons the +40 Tier Shift boost. It regressed once (commit f1a2185a)
// by reading `Dex.mod('gen3subzu').species.get(id)`, which reconstructs the
// species and threw "Cannot use 'in' operator ... in undefined" because the
// gen3subzu client table has an overrideTier but no overrideSpeciesData — that
// exception crashed the ENTIRE Tier Shift teambuilder (every gen3 species, even
// non-SU ones like Aerodactyl). These tests pin: (1) getStatBoost never throws
// for any gen3 species, and (2) the per-tier boosts match the server ladder in
// data/mods/gen3/rulesets.ts `tiershiftmod`.
try {
	global.BattlePokedex = require('../play.pokemonshowdown.com/data/pokedex.js').BattlePokedex;
	global.BattleTeambuilderTable =
		require('../play.pokemonshowdown.com/data/teambuilder-tables.js').BattleTeambuilderTable;
} catch (err) {}
require('../play.pokemonshowdown.com/js/battle-dex-data.js');
require('../play.pokemonshowdown.com/js/battle-dex.js');
require('../play.pokemonshowdown.com/js/battle-dex-search.js');

const ready = global.BattlePokedex && global.BattleTeambuilderTable &&
	typeof global.BattlePokemonSearch === 'function';

describe('[Gen 3] Tier Shift teambuilder boosts', () => {
	// One species per boost rung. SU (Sunflora) and ZU (Ivysaur) both rank ZU in
	// standard gen3 — SU lives only in the gen3subzu mod — so they exercise the
	// gen3subzu overrideTier lookup that previously crashed.
	const CASES = [
		['Mewtwo', 0],     // Uber — unboosted
		['Milotic', 0],    // OU — unboosted
		['Regice', 5],     // "(OU)" by technicality -> UUBL +5
		['Venusaur', 5],   // UUBL +5
		['Glalie', 10],    // NUBL in gen3 but tierOverride -> UU +10
		['Charmeleon', 30], // PU +30
		['Ivysaur', 35],   // ZU +35 (held out of SU)
		['Grovyle', 35],   // ZU +35 (held out of SU)
		['Sunflora', 40],  // SU +40 (gen3subzu-only tier)
		['Parasect', 40],  // SU +40
		['Bulbasaur', 40], // LC +40
	];

	(ready ? it : it.skip)('should not throw for any gen3 species (regression: gen3subzu lookup crash)', () => {
		const search = new BattlePokemonSearch('pokemon', 'gen3tiershift');
		const dex = Dex.forGen(3);
		// Sweep the whole gen3 pokedex — the original crash fired on the first
		// non-SU species the builder rendered (e.g. Aerodactyl), not just SU mons.
		for (const id in BattlePokedex) {
			const species = dex.species.get(id);
			assert.doesNotThrow(() => search.getStatBoost(species), `getStatBoost threw for ${id}`);
		}
	});

	(ready ? it : it.skip)('should match the server Tier Shift ladder per tier', () => {
		const search = new BattlePokemonSearch('pokemon', 'gen3tiershift');
		const dex = Dex.forGen(3);
		for (const [name, expected] of CASES) {
			const species = dex.species.get(name);
			assert.equal(search.getStatBoost(species), expected,
				`${name} (gen3 tier ${species.tier}) should get +${expected}`);
		}
	});

	(ready ? it : it.skip)('should add the boost to every non-HP stat via getStat', () => {
		const search = new BattlePokemonSearch('pokemon', 'gen3tiershift');
		const dex = Dex.forGen(3);
		const sunflora = dex.species.get('Sunflora'); // SU +40
		assert.equal(search.getStat(sunflora, 'hp'), sunflora.baseStats.hp, 'HP must never be boosted');
		for (const stat of ['atk', 'def', 'spa', 'spd', 'spe']) {
			assert.equal(search.getStat(sunflora, stat), Math.min(255, sunflora.baseStats[stat] + 40),
				`Sunflora ${stat} should be base +40 (SU)`);
		}
	});
});
