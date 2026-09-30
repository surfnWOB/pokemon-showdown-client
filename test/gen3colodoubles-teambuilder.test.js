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

describe('[Gen 3] Colo-Only Doubles Pokemon legality', () => {
	it('routes to the Colosseum mod with doubles move suggestions', () => {
		const search = new DexSearch('pokemon', 'gen3coloonlydoubles');
		assert.equal(Dex.forFormat('gen3coloonlydoubles').modid, 'gen3colodoubles');
		assert.equal(search.dex.modid, 'gen3colodoubles');
		assert.equal(search.typedSearch.isDoubles, true);
	});

	it('matches the server species bans across the entire Gen 3 roster', () => {
		const {Dex: ServerDex} = require('../caches/pokemon-showdown/dist/sim/dex');
		const format = ServerDex.formats.get('gen3coloonlydoubles');
		const dex = ServerDex.mod(format.mod);
		const rules = dex.formats.getRuleTable(format);
		const search = new DexSearch('pokemon', format.id);
		search.find('');
		for (const species of dex.species.all()) {
			if (species.gen > 3 || species.num < 1 || species.forme) continue;
			const banned = !!species.isNonstandard || rules.isBannedSpecies(species);
			assert.equal(search.typedSearch.illegalReasons[species.id] === 'Illegal', banned, species.name);
		}
	});

	it('labels unavailable and banned Pokemon Illegal in named searches', () => {
		for (const species of ['swampert', 'raikou', 'hooh', 'eevee']) {
			const search = new DexSearch('pokemon', 'gen3coloonlydoubles');
			search.find('');
			search.find(species);
			assert(search.results.some(row => row[0] === 'pokemon' && row[1] === species));
			assert.equal(search.typedSearch.illegalReasons[species], 'Illegal', species);
		}
	});

	it('keeps legal pre-evolutions available without changing standard ADV', () => {
		const colo = new DexSearch('pokemon', 'gen3coloonlydoubles');
		colo.find('');
		for (const species of ['espeon', 'quagsire', 'bayleef', 'mareep']) {
			assert(colo.results.some(row => row[0] === 'pokemon' && row[1] === species), species);
			assert.equal(colo.typedSearch.illegalReasons[species], undefined);
		}
		const standard = new DexSearch('pokemon', 'gen3ou');
		standard.find('');
		standard.find('swampert');
		assert.equal(standard.typedSearch.illegalReasons.swampert, undefined);
		assert.equal(standard.dex.modid, 'gen3');
	});
});
