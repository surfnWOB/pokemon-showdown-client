/** Bot challenge controls for the classic main menu. */
(function ($) {
	'use strict';

	function getBots() {
		var config = Config.botChallenges;
		if (!config || !Config.server || Config.server.host !== config.host) return [];
		return config.bots;
	}

	function renderControls() {
		var bots = getBots();
		if (!bots.length) return '';
		var buf = '<p><button type="button" class="button mainmenu2 bot-battle onlineonly disabled" name="playBot"><strong>Play a bot</strong><br /><small>Practice in your selected format</small></button></p>';
		buf += '<details class="bot-choice"><summary>Choose bot</summary><select class="select" name="challengebot" aria-label="Bot opponent">';
		buf += '<option value="">Default bot</option>';
		for (var i = 0; i < bots.length; i++) {
			buf += '<option value="' + toID(bots[i].name) + '">' + BattleLog.escapeHTML(bots[i].name) + '</option>';
		}
		return buf + '</select></details>';
	}

	function initialize(room) {
		var controls = renderControls();
		if (!controls) return;
		var $form = room.$('.mainmenu form.battleform');
		$form.append(controls);
		$form.on('change', 'select[name=challengebot]', function () {
			Storage.prefs('challengebot', this.value);
		});
		Storage.whenPrefsLoaded(function () {
			var $select = $form.find('select[name=challengebot]');
			$select.val(Storage.prefs('challengebot') || '');
			if ($select.val() === null) $select.val('');
		});
		if (window.BattleFormats && !app.isDisconnected) {
			$form.find('button[name=playBot]').removeClass('disabled');
		}
	}

	function challenge(room, button) {
		if ($(button).prop('disabled')) return;
		if (app.isDisconnected || !window.BattleFormats) {
			app.addPopupMessage("Connect to the server before challenging a bot.");
			return;
		}
		if (!app.user.get('named')) {
			app.addPopup(LoginPopup);
			return;
		}
		var $form = $(button).closest('form');
		var format = $form.find('button[name=format]').val();
		var teamIndex = $form.find('button[name=team]').val();
		var preferred = $form.find('select[name=challengebot]').val();
		var bots = getBots();
		var bot = null;
		for (var j = 0; j < bots.length; j++) {
			if (preferred && toID(bots[j].name) !== preferred) continue;
			if (toID(bots[j].name) === app.user.get('userid')) continue;
			if (bots[j].formats.indexOf(format) < 0) continue;
			bot = bots[j];
			break;
		}
		if (!bot || !BattleFormats[format] || !BattleFormats[format].challengeShow) {
			app.addPopupMessage(preferred ? "This bot cannot play the selected format. Choose Default bot or another format." : "No bot supports the selected format. Please choose another format.");
			return;
		}
		if (!BattleFormats[format].team && (!Storage.teams || teamIndex === '' || !Storage.teams[teamIndex])) {
			app.addPopupMessage("Please select a team.");
			return;
		}
		// Reuse the normal challenge submission, including validation and cancellation.
		room.challenge(bot.name, format);
		var $challenge = room.$('.pm-window-' + toID(bot.name) + ' .challenge');
		var $submit = $challenge.find('button[name=makeChallenge]');
		if ($submit.length) {
			$challenge.find('button[name=team]').val(teamIndex);
			$challenge.find('input[name=private]').prop('checked', $form.find('input[name=private]').is(':checked'));
			room.makeChallenge(null, $submit[0]);
		}
		showPending(room, bot.name, button);
	}

	function showPending(room, name, button) {
		var selector = '.pm-window-' + toID(name) + ' .challenge';
		if (!room.$(selector).find('button[name=cancelChallenge]').length) return;
		var $button = $(button);
		var originalHTML = $button.html();
		$button.prop('disabled', true).attr('aria-busy', 'true');
		// Follow the existing challenge UI through replies, errors, and cancellation.
		var observer = new MutationObserver(update);
		observer.observe(room.$('.pmbox')[0], { childList: true, subtree: true });
		app.on('init:socketclosed', reset);
		update();

		function update() {
			var $challenge = room.$(selector);
			if (!$challenge.find('button[name=cancelChallenge]').length) {
				reset();
				return;
			}
			var label = $challenge.find('form.pending').length ? 'Challenging...' : 'Waiting for bot...';
			$button.html('<strong><i class="fa fa-spinner fa-spin" aria-hidden="true"></i> ' + label + '</strong><br /><small>' + BattleLog.escapeHTML(name) + '</small>');
		}

		function reset() {
			observer.disconnect();
			app.off('init:socketclosed', reset);
			$button.prop('disabled', false).attr('aria-busy', 'false').html(originalHTML);
		}
	}

	window.BotChallenges = { initialize: initialize, challenge: challenge };

})(jQuery);
