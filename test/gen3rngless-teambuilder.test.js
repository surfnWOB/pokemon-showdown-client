const assert = require('assert').strict;
const {describe, it} = require('node:test');

window = global;

global.BattleText = require('../play.pokemonshowdown.com/data/text/en.js').BattleText;
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

require('../play.pokemonshowdown.com/js/battle-scene-stub.js');
require('../play.pokemonshowdown.com/js/battle-text-parser.js');
require('../play.pokemonshowdown.com/js/battle.js');
const {BattleTooltips, ModifiableValue} = require('vm').runInNewContext(
	require('fs').readFileSync(require.resolve('../play.pokemonshowdown.com/js/battle-tooltips.js'), 'utf8') +
	'\n({BattleTooltips, ModifiableValue});', global
);

const {Dex: ServerDex} = require('../caches/pokemon-showdown/dist/sim/dex');
const server = ServerDex.mod('gen3rngless');

describe('[Gen 3] RNGless client', () => {
	it('routes format, move picker, and battle viewer to the isolated mod', () => {
		assert.equal(Dex.forFormat('gen3rngless').modid, 'gen3rngless');
		const search = new DexSearch('move', 'gen3rngless', {species: 'Metagross', moves: []});
		assert.equal(search.typedSearch.dex.modid, 'gen3rngless');
		const battle = new Battle({paused: true, debug: true, log: ['|gen|3', '|tier|[Gen 3] RNGless', '|turn|1']});
		assert.equal(battle.dex.modid, 'gen3rngless');
		battle.destroy();
	});

	it('uses server move data while keeping ADV OU and ADV ES unchanged', () => {
		const dex = Dex.forFormat('gen3rngless');
		for (const id of ['crunch', 'firepunch', 'flamethrower', 'meteormash', 'rockslide', 'toxic', 'willowisp']) {
			for (const key of ['name', 'type', 'basePower', 'accuracy', 'pp', 'category']) {
				assert.equal(dex.moves.get(id)[key], server.moves.get(id)[key], `${id}: ${key}`);
			}
		}
		assert.equal(dex.moves.get('willowisp').accuracy, 100);
		assert.equal(Dex.forFormat('gen3ou').moves.get('willowisp').accuracy, 75);
		assert.equal(dex.moves.get('meteormash').basePower, 90);
		assert.equal(Dex.forFormat('gen3ou').moves.get('meteormash').basePower, 100);
		assert.equal(Dex.forFormat('gen3adves').moves.get('meteormash').basePower, 100);
	});

	it('displays the changed move descriptions through the text resolver', () => {
		const dex = Dex.forFormat('gen3rngless');
		for (const id of ['crunch', 'firepunch', 'flamethrower', 'meteormash', 'rockslide']) {
			const text = dex.text.get(dex.moves.get(id), 'en');
			assert.equal(text.shortDesc, 'No additional effect.', id);
			assert.equal(text.desc, 'Deals damage with no additional effect.', id);
		}
		for (const id of ['protect', 'detect', 'endure']) {
			const text = dex.text.get(dex.moves.get(id), 'en');
			assert.match(text.shortDesc, /alternate/, id);
			assert.match(text.desc, /alternate between success and failure/, id);
		}
	});

	it('displays changed ability and item descriptions, not inherited random effects', () => {
		const dex = Dex.forFormat('gen3rngless');
		for (const [table, ids] of [
			['abilities', ['cutecharm', 'effectspore', 'flamebody', 'poisonpoint', 'serenegrace', 'shedskin', 'static']],
			['items', ['brightpowder', 'focusband', 'kingsrock', 'laxincense', 'quickclaw']],
		]) {
			for (const id of ids) {
				const text = dex.text.get(dex[table].get(id), 'en');
				assert.equal(text.shortDesc, 'No effect in this format.', id);
				assert.equal(text.desc, 'No effect in this format.', id);
				assert.notEqual(Dex.forFormat('gen3ou').text.get(Dex.forFormat('gen3ou')[table].get(id), 'en').desc, text.desc, id);
			}
		}
		assert.match(dex.text.get(dex.abilities.get('hustle'), 'en').desc, /no accuracy penalty/);
		assert.match(dex.text.get(dex.abilities.get('sandveil'), 'en').desc, /no evasion boost/);
		for (const id of ['figyberry', 'iapapaberry', 'magoberry']) {
			assert.match(dex.text.get(dex.items.get(id), 'en').desc, /Does not cause confusion/);
		}
	});

	it('calculates Hustle accuracy without a penalty only in RNGless', () => {
		for (const [tier, accuracy] of [['RNGless', 100], ['OU', 80]]) {
			const battle = new Battle({paused: true, debug: true, log: [
				'|gen|3', `|tier|[Gen 3] ${tier}`,
				'|switch|p1a: Togetic|Togetic, L100|100/100',
				'|-ability|p1a: Togetic|Hustle', '|turn|1',
			]});
			try {
				const pokemon = battle.p1.active[0];
				const value = new ModifiableValue(battle, pokemon, {ability: 'Hustle', item: ''});
				const tooltips = new BattleTooltips(battle);
				const result = tooltips.getMoveAccuracy(battle.dex.moves.get('bodyslam'), value);
				assert.equal(result.value, accuracy, tier);
				assert.match(result.toString(), new RegExp(`${accuracy}%`), tier);
				const burnAccuracy = tooltips.getMoveAccuracy(battle.dex.moves.get('willowisp'), value);
				assert.equal(burnAccuracy.value, tier === 'RNGless' ? 100 : 75, tier);
				assert.equal(tooltips.getMoveAccuracy(battle.dex.moves.get('flamethrower'), value).value, 100, tier);
			} finally {
				battle.destroy();
			}
		}
	});

	it('retains ordinary ADV learnsets, without the ADV ES Extreme Speed grant', () => {
		for (const species of ['Magikarp', 'Ditto', 'Snorlax']) {
			const search = new DexSearch('move', 'gen3rngless', {species, moves: []});
			search.find('');
			assert(!search.results.some(row => row[0] === 'move' && row[1] === 'extremespeed'), species);
		}
		const search = new DexSearch('move', 'gen3rngless', {species: 'Arcanine', moves: []});
		search.find('');
		assert(search.results.some(row => row[0] === 'move' && row[1] === 'extremespeed'));
	});

	it('keeps the ordinary ADV roster and available ability choices', () => {
		const dex = Dex.forFormat('gen3rngless');
		for (const species of server.species.all()) {
			if (species.gen > 3 || species.forme || species.isNonstandard) continue;
			assert.deepEqual(dex.species.get(species.id).abilities, species.abilities, species.id);
			assert.deepEqual(dex.species.get(species.id).baseStats, species.baseStats, species.id);
		}
		const search = new DexSearch('pokemon', 'gen3rngless');
		search.find('');
		assert(search.results.some(row => row[0] === 'pokemon' && row[1] === 'metagross'));
	});
});
