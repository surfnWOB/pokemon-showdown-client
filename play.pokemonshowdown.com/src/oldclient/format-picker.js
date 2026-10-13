/** Fork-only presentation policy. The classic picker still owns formats and interactions. */
(function () {
	'use strict';

	window.FormatPickerLayout = {
		column: function (section) {
			return (section === 'Gen 3 Megas' || section === 'surfnWOB Customs') ? 1 : 2;
		},
		wrap: function (html) {
			return '<div class="fork-format-columns">' + html + '</div>';
		}
	};
})();
