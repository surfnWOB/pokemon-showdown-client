const assert = require('assert').strict;
const {readFileSync} = require('node:fs');
const {describe, it} = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({$: {easing: {}}, window: {}});
new vm.Script(readFileSync(
	new URL('../play.pokemonshowdown.com/js/battle-animations.js', `file://${__filename}`),
	'utf8'
)).runInContext(context);

const getPokemonSummonMotion = context.getPokemonSummonMotion;
const native = value => JSON.parse(JSON.stringify(value));

describe('getPokemonSummonMotion', () => {
	it('describes the relative legacy summon queue', () => {
		assert.deepEqual(native(getPokemonSummonMotion(3, 2, {x: 1, y: 2, z: 3})), {
			delay: 150,
			animations: [{end: {x: 1, y: 2, z: 3, time: 200}}],
		});
	});

	it('includes the second accelerated modern summon leg', () => {
		assert.deepEqual(native(getPokemonSummonMotion(9, 1, {x: 1, y: 2, z: 3})), {
			delay: 300,
			animations: [
				{end: {x: 1, y: 32, z: 3, time: 400}},
				{end: {x: 1, y: 2, z: 3, time: 300}, transition: 'accel'},
			],
		});
	});
});
