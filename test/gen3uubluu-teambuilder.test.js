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

describe('[Gen 3] UUBL UU Pokemon legality', () => {
	it('matches server species legality across the entire Gen 3 roster', () => {
		const {Dex: ServerDex} = require('../caches/pokemon-showdown/dist/sim/dex');
		const format = ServerDex.formats.get('gen3uubluu');
		assert(format.exists);
		const dex = ServerDex.mod(format.mod);
		const rules = dex.formats.getRuleTable(format);
		const search = new DexSearch('pokemon', format.id);
		search.find('');
		assert.equal(search.dex.modid, 'gen3');
		assert.equal(Dex.forFormat(format.id).modid, 'gen3');
		for (const species of dex.species.all()) {
			if (species.gen > 3 || species.num < 1 || species.forme) continue;
			const banned = !!species.isNonstandard || rules.isBannedSpecies(species);
			assert.equal(search.typedSearch.illegalReasons[species.id] === 'Illegal', banned, species.name);
		}
	});

	it('browses eligible species and labels banned named searches Illegal', () => {
		const search = new DexSearch('pokemon', 'gen3uubluu');
		search.find('');
		for (const id of ['ludicolo', 'porygon2', 'kadabra', 'eevee', 'dratini']) {
			assert(search.results.some(row => row[0] === 'pokemon' && row[1] === id), id);
		}
		for (const id of ['dragonite', 'regice', 'flareon', 'raikou', 'mewtwo']) {
			search.find(id);
			assert(search.results.some(row => row[0] === 'pokemon' && row[1] === id), id);
			assert.equal(search.typedSearch.illegalReasons[id], 'Illegal', id);
		}
	});

	it('preserves ordinary Gen 3 learnsets and the parent UUBL roster', () => {
		const moves = new DexSearch('move', 'gen3uubluu', {species: 'Porygon2'});
		moves.find('');
		assert(moves.results.some(row => row[0] === 'move' && row[1] === 'recover'));
		const parent = new DexSearch('pokemon', 'gen3uubl');
		parent.find('');
		assert.equal(parent.typedSearch.illegalReasons.dragonite, undefined);
		assert.equal(parent.typedSearch.illegalReasons.regice, undefined);
	});
});
