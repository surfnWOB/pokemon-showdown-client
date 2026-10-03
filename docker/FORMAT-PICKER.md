# Fork format picker layout

The self-hosted classic client loads `src/oldclient/format-picker.js` and
`style/format-picker.css` through `build-tools/offline/shell.ts`. The upstream
HTML entrypoint and shared `oldclient.css` are unchanged.

The module owns the two-column grouping policy and a namespaced layout wrapper.
Favorites remain in upstream's first column. Gen 3 Megas and surfnWOB Customs
share that column; all other sections use the second. The scoped stylesheet
provides spacing, full-width buttons, and narrow-screen stacking. It overrides
only the legacy renderer's inline column padding; flex layout ignores its floats.

## Upstream sync contract

Preserve just two optional calls in `FormatPopup.renderFormats`:

- After upstream chooses a section's column, `FormatPickerLayout.column(section)`
  may override that choice.
- Before returning the rendered HTML, `FormatPickerLayout.wrap(html)` may wrap it.

Without the module, both paths retain upstream behavior, including server column
metadata and the older-server fallback. There are no prototype overrides, copied
renderers, DOM observers, or mutations of the shared format catalog. Upstream
still owns search, favorites, visibility filtering, selection, and category state.

On sync, check those two call sites and the `.popupmenu`, `.option`, and `summary`
markup used by the stylesheet. Run the format-popup and offline integration tests,
then check the generated self-hosted page at desktop and mobile widths. The tests
also exercise the no-module fallback. Do not move the layout back into the shared
stylesheet or upstream HTML template.
