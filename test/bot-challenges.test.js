const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {describe, it} = require('node:test');

const source = fs.readFileSync(path.join(__dirname,
	'../play.pokemonshowdown.com/src/oldclient/bot-challenges.js'), 'utf8');

function setup(options = {}) {
	const messages = [];
	const submissions = [];
	const preferences = {};
	const events = {};
	let observer;
	let challengeState = options.pending ? 'waiting' : '';
	const button = {
		disabled: false,
		markup: '<strong>Play a bot</strong><br /><small>Practice in your selected format</small>',
		closest: () => form,
		prop(key, value) {
			if (value === undefined) return this[key];
			this[key] = value;
			return this;
		},
		attr(key, value) { this[key] = value; return this; },
		html(value) {
			if (value === undefined) return this.markup;
			this.markup = value;
			return this;
		},
	};
	const fields = {
		'button[name=format]': options.format || 'gen9ou',
		'button[name=team]': options.team === undefined ? '1' : options.team,
		'select[name=challengebot]': options.bot || '',
	};
	let html = '';
	let challenge;
	let selectedTeam;
	let privacy;
	const form = {
		append(value) { html += value; },
		on() {},
		find(selector) {
			return {
				val(value) {
					if (value !== undefined) fields[selector] = value;
					return fields[selector];
				},
				is() { return true; },
				removeClass() {},
			};
		},
	};
	const room = {
		$(selector) {
			if (selector === '.mainmenu form.battleform') return form;
			if (selector === '.pmbox') return [{}];
			return {find: field => {
				if (field === 'button[name=makeChallenge]') return challengeState ? [] : [{}];
				if (field === 'button[name=cancelChallenge]') return challengeState ? [{}] : [];
				if (field === 'form.pending') return challengeState === 'sending' ? [{}] : [];
				if (field === 'button[name=team]') return {val(value) { selectedTeam = value; }};
				return {prop(key, value) { privacy = value; }};
			}};
		},
		challenge(name, format) { challenge = {name, format}; },
		makeChallenge() {
			challengeState = 'sending';
			submissions.push({...challenge, team: selectedTeam, privacy});
		},
	};
	const context = vm.createContext({
		window: {},
		jQuery: () => button,
		MutationObserver: class {
			constructor(callback) { this.callback = callback; observer = this; }
			observe() { this.active = true; }
			disconnect() { this.active = false; }
		},
		Config: {
			server: {host: options.host || 'sim.example.com'},
			botChallenges: {host: 'sim.example.com', bots: [
				{name: 'First Bot', formats: ['gen9ou', 'gen9randombattle']},
				{name: 'Second Bot', formats: ['gen9ou']},
			]},
		},
		toID: name => name.toLowerCase().replace(/[^a-z0-9]/g, ''),
		BattleLog: {escapeHTML: text => text},
		BattleFormats: {gen9ou: {challengeShow: true}, gen9randombattle: {challengeShow: true, team: 'random'}},
		Storage: {
			teams: [{name: 'First team'}, {name: 'Selected team'}],
			prefs(key, value) {
				if (value !== undefined) preferences[key] = value;
				return preferences[key];
			},
			whenPrefsLoaded(callback) { callback(); },
		},
		LoginPopup: 'login',
		app: {
			on(event, callback) { events[event] = callback; },
			off(event) { delete events[event]; },
			isDisconnected: options.disconnected,
			user: {get: key => key === 'named' ? options.named !== false : 'player'},
			addPopupMessage: message => messages.push(message),
			addPopup: popup => messages.push(popup),
		},
	});
	context.window.BattleFormats = context.BattleFormats;
	vm.runInContext(source, context);
	return {
		context, messages, submissions, preferences, button,
		initialize() { context.window.BotChallenges.initialize(room); return html; },
		play() { context.window.BotChallenges.challenge(room, button); },
		reply(state) { challengeState = state; if (observer.active) observer.callback(); },
		disconnect() { context.app.isDisconnected = true; events['init:socketclosed'](); },
		isObserving() { return observer.active; },
	};
}

describe('main-menu bot challenges', () => {
	it('disables the loading button immediately and prevents duplicate submissions', () => {
		const test = setup();
		test.play();
		assert.equal(test.button.disabled, true);
		assert.equal(test.button['aria-busy'], 'true');
		assert.match(test.button.markup, /Challenging/);
		test.play();
		assert.equal(test.submissions.length, 1);
		test.reply('waiting');
		assert.equal(test.button.disabled, true);
		assert.match(test.button.markup, /Waiting for bot/);
	});

	it('restores the button when the challenge ends and allows another challenge', () => {
		const test = setup();
		const original = test.button.markup;
		test.play();
		test.reply('waiting');
		test.reply('');
		assert.equal(test.button.disabled, false);
		assert.equal(test.button['aria-busy'], 'false');
		assert.equal(test.button.markup, original);
		assert.equal(test.isObserving(), false);
		test.play();
		assert.equal(test.submissions.length, 2);
	});

	it('restores the button if submission fails before the server accepts it', () => {
		const test = setup();
		test.play();
		test.reply('');
		assert.equal(test.button.disabled, false);
		assert.match(test.button.markup, /Play a bot/);
		assert.equal(test.isObserving(), false);
	});

	it('clears the loading state on disconnection', () => {
		const test = setup();
		test.play();
		test.disconnect();
		assert.equal(test.button.disabled, false);
		assert.equal(test.isObserving(), false);
		assert.match(test.button.markup, /Play a bot/);
	});

	it('submits the selected team, format, and privacy through the normal challenge flow', () => {
		const test = setup();
		test.play();
		assert.deepEqual(test.submissions, [{name: 'First Bot', format: 'gen9ou', team: '1', privacy: true}]);
	});

	it('honors an explicitly chosen bot', () => {
		const test = setup({bot: 'secondbot'});
		test.play();
		assert.equal(test.submissions[0].name, 'Second Bot');
	});

	it('allows formats that supply a team', () => {
		const test = setup({format: 'gen9randombattle', team: 'random'});
		test.play();
		assert.equal(test.submissions.length, 1);
	});

	for (const [label, options, message] of [
		['missing team', {team: ''}, /select a team/],
		['unsupported format', {format: 'gen9doublesou'}, /No bot supports/],
		['unsupported chosen bot', {bot: 'secondbot', format: 'gen9randombattle'}, /This bot cannot play/],
		['disconnected client', {disconnected: true}, /Connect to the server/],
		['unnamed player', {named: false}, /login/],
	]) {
		it(`does not send a challenge for a ${label}`, () => {
			const test = setup(options);
			test.play();
			assert.equal(test.submissions.length, 0);
			assert.equal(test.button.disabled, false);
			assert.match(test.messages[0], message);
		});
	}

	it('does not submit over an existing pending challenge', () => {
		const test = setup({pending: true});
		test.play();
		assert.equal(test.submissions.length, 0);
		assert.equal(test.button.disabled, true);
		assert.match(test.button.markup, /Waiting for bot/);
	});

	it('shows controls only on the configured server', () => {
		assert.match(setup().initialize(), /Play a bot/);
		const elsewhere = setup({host: 'sim3.psim.us'});
		assert.equal(elsewhere.initialize(), '');
		elsewhere.play();
		assert.equal(elsewhere.submissions.length, 0);
	});
});
