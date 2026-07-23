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

const FORMAT = 'gen2spaceworld97';

// A representative slice of the 36 cut Spaceworld '97 designs, covering standalone
// mon, single-stage evolutions, and evolution chains that thread through multiple
// cut mon (Manbo1 -> Ikari -> Grotess). Values are the beta demo stats/typings.
const cutRoster = {
	kotora: {num: 5005, name: 'Kotora', types: ['Electric'], baseStats: [55, 50, 45, 50, 50, 50],
		prevo: '', evos: ['Raitora'], nfe: true},
	raitora: {num: 5006, name: 'Raitora', types: ['Electric'], baseStats: [65, 60, 55, 60, 50, 60],
		prevo: 'Kotora', evos: [], nfe: false},
	norowara: {num: 5008, name: 'Norowara', types: ['Ghost'], baseStats: [55, 40, 50, 75, 50, 45],
		prevo: '', evos: ['Kyonpan'], nfe: true},
	manbo1: {num: 5024, name: 'Manbo1', types: ['Water'], baseStats: [50, 50, 50, 50, 50, 30],
		prevo: '', evos: ['Ikari'], nfe: true},
	ikari: {num: 5025, name: 'Ikari', types: ['Water', 'Steel'], baseStats: [90, 110, 50, 55, 50, 110],
		prevo: 'Manbo1', evos: ['Grotess'], nfe: true},
	grotess: {num: 5026, name: 'Grotess', types: ['Water', 'Steel'], baseStats: [60, 65, 60, 80, 50, 30],
		prevo: 'Ikari', evos: [], nfe: false},
	tsubomitto: {num: 5003, name: 'Tsubomitto', types: ['Grass', 'Poison'], baseStats: [50, 50, 50, 50, 50, 50],
		prevo: '', evos: [], nfe: false},
	twinz: {num: 5030, name: 'Twinz', types: ['Dark', 'Normal'], baseStats: [50, 50, 50, 50, 50, 50],
		prevo: '', evos: [], nfe: false},
	betbaby: {num: 5036, name: 'Betbaby', types: ['Poison'], baseStats: [50, 50, 50, 50, 50, 50],
		prevo: '', evos: [], nfe: false},
};

// The 14 beta-only moves cut from the final games. Ids are the Showdown ids; each is a
// brand-new move with no global-data parent to clone, so the client must reconstruct
// its full name/type/category from the mod's overrideMoveData.
const betaMoves = {
	bellchime: {name: 'Bell Chime', type: 'Normal', category: 'Status'},
	bonelock: {name: 'Bone Lock', type: 'Ground', category: 'Physical'},
	brightmoss: {name: 'Bright Moss', type: 'Grass', category: 'Status'},
	coinhurl: {name: 'Coin Hurl', type: 'Normal', category: 'Physical'},
	crosscutter: {name: 'Cross Cutter', type: 'Bug', category: 'Physical'},
	megaphone: {name: 'Megaphone', type: 'Normal', category: 'Status'},
	naildown: {name: 'Nail Down', type: 'Ghost', category: 'Status'},
	rockhead: {name: 'Rock Head', type: 'Rock', category: 'Physical'},
	stalker: {name: 'Stalker', type: 'Psychic', category: 'Status'},
	strongarm: {name: 'Strong Arm', type: 'Steel', category: 'Physical'},
	synchronize: {name: 'Synchronize', type: 'Psychic', category: 'Status'},
	tempt: {name: 'Tempt', type: 'Normal', category: 'Status'},
	uproot: {name: 'Uproot', type: 'Normal', category: 'Physical'},
	windride: {name: 'Wind Ride', type: 'Flying', category: 'Physical'},
};

describe("[Gen 2] Spaceworld '97 teambuilder data", () => {
	it('should reconstruct the 36 cut Spaceworld mon with their beta stats, typings, and evo chains', () => {
		const builderDex = Dex.mod('gen2sw97');
		const overrideSpeciesData = BattleTeambuilderTable.gen2sw97.overrideSpeciesData;
		const cutIds = Object.keys(overrideSpeciesData).filter(id => overrideSpeciesData[id].num >= 5000);
		assert.equal(cutIds.length, 36, 'all 36 cut designs should be present as mod-only species');

		for (const [id, want] of Object.entries(cutRoster)) {
			const species = builderDex.species.get(id);
			assert.equal(species.exists, true, `${id} should exist`);
			assert.equal(species.name, want.name);
			assert.equal(species.num, want.num);
			assert.equal(species.gen, 2, `${id} should be a Gen 2 species`);
			assert.equal(species.isNonstandard, null, `${id} should be legal inside the mod`);
			assert.equal(species.tier, 'OU', `${id} should browse as OU, not illegal`);
			assert.deepEqual(species.types, want.types, `${id} typing`);
			assert.deepEqual(
				['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(stat => species.baseStats[stat]),
				want.baseStats,
				`${id} base stats`
			);
			assert.equal(species.prevo, want.prevo, `${id} prevo`);
			assert.deepEqual(species.evos || [], want.evos, `${id} evos`);
			assert.equal(species.nfe, want.nfe, `${id} nfe flag`);
		}

		// Cross-cut-mon evolution chain must link both directions.
		assert.equal(builderDex.species.get('ikari').prevo, 'Manbo1');
		assert.deepEqual(builderDex.species.get('manbo1').evos, ['Ikari']);
		assert.deepEqual(builderDex.species.get('ikari').evos, ['Grotess']);
		assert.equal(builderDex.species.get('grotess').prevo, 'Ikari');
	});

	it('should reconstruct the 14 beta-only moves with full name/type/category', () => {
		const builderDex = Dex.mod('gen2sw97');
		const overrideMoveData = BattleTeambuilderTable.gen2sw97.overrideMoveData;
		const modOnly = Object.keys(overrideMoveData)
			.filter(id => overrideMoveData[id].name && overrideMoveData[id].num !== undefined);
		assert.equal(modOnly.length, 14, 'all 14 beta moves should carry a full mod-only override');

		for (const [id, want] of Object.entries(betaMoves)) {
			const move = builderDex.moves.get(id);
			assert.equal(move.exists, true, `${id} should exist`);
			assert.equal(move.name, want.name, `${id} name`);
			assert.equal(move.type, want.type, `${id} type`);
			assert.equal(move.category, want.category, `${id} category`);
			assert.equal(move.isNonstandard, null, `${id} should be legal inside the mod`);
		}
	});

	it('should browse from OU with the cut mon in the pool alongside standard Gen 2 mon', () => {
		const search = new DexSearch('pokemon', FORMAT);
		search.find('');
		const headers = search.results.filter(row => row[0] === 'header').map(row => row[1]);
		const pokemon = search.results.filter(row => row[0] === 'pokemon').map(row => row[1]);

		assert.equal(headers[0], 'OU', 'the browse pool should open on OU');
		for (const id of Object.keys(cutRoster)) {
			assert(pokemon.includes(id), `${id} should be in the default browse pool`);
		}
		// Standard Gen 2 species must still be reachable in the mod.
		for (const id of ['snorlax', 'zapdos', 'tyranitar', 'rhydon']) {
			assert(pokemon.includes(id), `standard Gen 2 ${id} should remain in the pool`);
		}
	});

	it('should expose the beta moves in movepools and by text search', () => {
		// Every beta move carries a search-index row so the move picker can find it by name.
		for (const id of Object.keys(betaMoves)) {
			assert(BattleSearchIndex.some(row => row.length === 2 && row[0] === id && row[1] === 'move'),
				`${id} should have a direct search-index row`);
		}

		const textSearch = new DexSearch('move', FORMAT);
		textSearch.find('bellchime');
		assert(textSearch.results.some(row => row[0] === 'move' && row[1] === 'bellchime'),
			'Bell Chime should be text-searchable');

		// Rhydon learns the physical beta moves in the demo; the mod learnset must surface them.
		const movepool = new DexSearch('move', FORMAT, 'rhydon');
		movepool.find('');
		const moves = movepool.results.filter(row => row[0] === 'move').map(row => row[1]);
		for (const id of ['crosscutter', 'strongarm', 'megaphone', 'bonelock']) {
			assert(moves.includes(id), `rhydon's movepool should include ${id}`);
		}

		// A cut mon's movepool should also draw from the mod learnsets.
		const cutMovepool = new DexSearch('move', FORMAT, 'kotora');
		cutMovepool.find('');
		assert(cutMovepool.results.some(row => row[0] === 'move' && row[1] === 'bellchime'),
			"Kotora's movepool should include Bell Chime");
	});

	it('should keep the beta content out of standard Gen 2 searches', () => {
		const pokemonSearch = new DexSearch('pokemon', 'gen2ou');
		pokemonSearch.find('kotora');
		assert(!pokemonSearch.results.some(row => row[0] === 'pokemon' && row[1] === 'kotora'),
			'cut mon should not leak into standard Gen 2');

		const moveSearch = new DexSearch('move', 'gen2ou');
		moveSearch.find('bellchime');
		assert(!moveSearch.results.some(row => row[0] === 'move' && row[1] === 'bellchime'),
			'beta moves should not leak into standard Gen 2');
	});

	it('should render a teambuilder icon for every cut mon without throwing', () => {
		// Dedicated icon-sheet slots for the cut mon ship with the sprite pipeline; until
		// then they gracefully resolve to the placeholder icon rather than crashing the
		// team builder. This guards the reconstruction path, not the (future) art.
		const builderDex = Dex.mod('gen2sw97');
		for (const id of Object.keys(cutRoster)) {
			const icon = Dex.getPokemonIcon(builderDex.species.get(id));
			assert.equal(typeof icon, 'string');
			assert(icon.includes('background'), `${id} should produce a sprite-sheet icon style`);
		}
	});
});
