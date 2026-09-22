# Home-screen bot challenges

The classic main menu delegates initialization and its `playBot` action to
`src/oldclient/bot-challenges.js`. The module owns the controls, preference,
supported-format filtering, and preparation of the existing challenge form.
The standard client still owns team validation, submission, replies, and cancellation.
While a challenge is being sent or awaiting the bot, the home-screen button shows
a spinner and is disabled. It follows the existing challenge form with a temporary
DOM observer, restoring the button on acceptance, rejection, cancellation, validation
errors, or disconnection.

`build-tools/offline/shell.ts` loads the module and its stylesheet in the
self-hosted page. The upstream test-client page is unchanged. The Dockerfile
adds `docker/bot-challenges.json` to runtime config, scoped to the configured
simulator hostname. Without that config, the module displays nothing.

The directory lists bot account names and accepted format IDs, in default
selection order. Keep it aligned with the deployed bot services when their
supported formats change. An explicit choice is saved as `challengebot` in
client preferences. Default selects the first compatible account other than
the signed-in user. Availability probing and automatic failover are not implemented;
offline errors and busy/queue replies use the existing challenge/PM interface.

For upstream resyncs, preserve the two small main-menu hooks and the deployment
shell asset references. No prototype overrides or changes to the upstream
challenge lifecycle are needed. Run `npm test`; the bot module regression tests
are in `test/bot-challenges.test.js`.
