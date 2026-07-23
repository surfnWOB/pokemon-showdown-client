const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const {describe, it} = require('node:test');

window = global;
Config = {routes: {client: 'play.example.test'}};

require('../play.pokemonshowdown.com/js/battle-dex-data.js');
require('../play.pokemonshowdown.com/js/battle-dex.js');
require('../play.pokemonshowdown.com/js/battle-tooltips.js');

describe('Random Battle tooltips', () => {
	it('recognizes the Gen 3 Mega Random Battle format', () => {
		const format = RandomBattleTooltip.resolveFormat({
			tier: '[Gen 3] Mega Random Battle',
			gameType: 'singles',
		});

		assert.equal(format, 'gen3megarandombattle');
		assert.equal(
			RandomBattleTooltip.dataURL(format),
			'https://play.example.test/randbats/data/stats/gen3megarandombattle.json'
		);
	});

	it('keeps standard Random Battle data on the pkmn feed', () => {
		const format = RandomBattleTooltip.resolveFormat({
			tier: '[Gen 3] Random Battle',
			gameType: 'singles',
		});

		assert.equal(format, 'gen3randombattle');
		assert.equal(
			RandomBattleTooltip.dataURL(format),
			'https://pkmn.github.io/randbats/data/stats/gen3randombattle.json'
		);
	});

	it('does not expose possible sets in Hardcore mode', () => {
		assert.equal(
			RandomBattleTooltip.render({hardcoreMode: true}, {}),
			''
		);
	});

	it('filters roles using revealed moves, including typed Hidden Power', () => {
		const roles = {
			'Special Attacker': {
				weight: 0.5,
				moves: {'Hidden Power Grass': 1, Psychic: 1},
			},
			'Physical Attacker': {
				weight: 0.5,
				moves: {'Hidden Power Fighting': 1, 'Shadow Ball': 1},
			},
		};
		const pokemon = {
			terastallized: '',
			moveTrack: [['Psychic', 1], ['Hidden Power', 1]],
		};

		assert.deepEqual(
			RandomBattleTooltip.filterRoles(roles, pokemon).map(([name]) => name),
			['Special Attacker']
		);
	});

	it('indexes a Mega candidate under its public base forme and level', () => {
		const format = 'gen3megarandombattle';
		const originalForFormat = Dex.forFormat;
		const OriginalXMLHttpRequest = global.XMLHttpRequest;

		Dex.forFormat = () => ({
			species: {
				get: name => ({
					exists: name === 'Absol-Mega',
					name,
					baseSpecies: 'Absol',
					battleOnly: 'Absol',
					forme: 'Mega',
				}),
			},
		});
		global.XMLHttpRequest = class {
			addEventListener(event, listener) {
				if (event === 'load') this.loadListener = listener;
			}
			open() {}
			send() {
				this.responseText = JSON.stringify({
					'Absol-Mega': {
						level: 79,
						abilities: {Pressure: 1},
						items: {Absolite: 1},
						roles: {},
					},
				});
				this.loadListener();
			}
		};

		delete RandomBattleTooltip.data[format];
		delete RandomBattleTooltip.requested[format];

		try {
			RandomBattleTooltip.load({
				tier: '[Gen 3] Mega Random Battle',
				gameType: 'singles',
			});

			assert.equal(
				RandomBattleTooltip.data[format][79].absol[0].name,
				'Absol-Mega'
			);
		} finally {
			Dex.forFormat = originalForFormat;
			global.XMLHttpRequest = OriginalXMLHttpRequest;
			delete RandomBattleTooltip.data[format];
			delete RandomBattleTooltip.requested[format];
		}
	});

	it('copies the server-owned options and stats feed into the deployed client', () => {
		const dockerfile = fs.readFileSync(path.resolve(__dirname, '..', 'Dockerfile'), 'utf8');

		assert.match(
			dockerfile,
			/caches\/pokemon-showdown\/data\/random-battles\/gen3mega\/generated\/\./
		);
		assert.match(dockerfile, /play\.pokemonshowdown\.com\/randbats\/data\//);
	});
});
