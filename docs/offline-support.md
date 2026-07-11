# Offline support

The fork finalizes the self-hosted classic client as an installable,
offline-first app shell. After one completed online load, users can reopen the
teambuilder, manage and import or export local teams, and change local
preferences without a network connection. Battles, challenges, chat, ladders,
authentication, uploads, and other server-backed features remain unavailable
offline.

## Architecture

Offline support has one integration seam in the upstream classic client:
`OfflineClient.attach(this)`. All lifecycle, format persistence, send guards,
and offline-only control state live behind that adapter in
`build-tools/offline/classic/offline.ts`. Finalization compiles that modern,
strict TypeScript source to the ignored `js/oldclient/offline.js` artifact. The
generated shell loads both fork-owned artifacts as native modules before the
classic app starts.

The offline adapter supports the last three major versions of Chrome, Edge,
Firefox, Safari, and iOS Safari, declared in the fork-local
`build-tools/offline/.browserslistrc` policy. Generated browser code uses an
explicit ES2022 syntax baseline.
Native module scripts are the delivery boundary; there is no legacy JavaScript
bootstrap or ES3 offline artifact.

## Modern offline policy

- The page adapter and service worker are native modules. Browser event targets,
  DOM types, `fetch`, Cache Storage, and `AbortSignal.timeout()` are used
  directly.
- `navigator.onLine` is only an early hint. One connection probe is still
  allowed, Retry explicitly probes again, and socket success or failure is the
  authoritative connection state. A failed probe enters offline mode directly
  instead of replaying the classic client's insecure alternate-port fallbacks.
- The atomic app shell is content-versioned and installed with bounded parallel
  requests. Controlled navigations and every build-owned core asset, including
  deployment configuration, are cache-first. Optional media is warmed
  separately and kept in a bounded, query-aware runtime cache.
- After first installation, a passive `Online` indicator confirms readiness.
  It does not request persistent origin storage or present an action during
  bootstrap.
- Format snapshots stay in the classic client's small, synchronous local
  storage path. Moving them to IndexedDB would add an asynchronous migration
  without improving the bounded data model.
- Server actions are never queued. Background Sync and Periodic Background Sync
  are therefore intentionally unused. Navigation Preload is also omitted
  because the root navigation is deliberately cache-first and preloading it
  would duplicate a request.

## Offline-first performance

Once the worker controls the origin, the page navigation and complete generated
core are returned from Cache Storage without waiting for network validation.
That removes network latency from the build-owned app shell and avoids
repeatedly transferring the large classic teambuilder data set. The inherited
test-client key request is removed from the production shell because production
mode does not consume it.

Dynamic and private requests, cross-origin resources, range requests, and
non-GET methods remain browser-native. This keeps battles and other server-backed
features live when connected without caching private responses; optional
cross-origin resources can still affect online load timing. The active core is
never updated stale-while-revalidate: new executable assets and configuration
arrive together through a newly hashed, atomically installed worker, preventing
mixed deployment versions. The first visit still pays the installation cost;
the performance benefit applies once that installation controls the client.

The strict TypeScript finalizer lives entirely in `build-tools/offline/`. It:

1. derives an ignored, self-hosted `offline.html` from the unmodified upstream
   `testclient-old.html`;
2. snapshots the exact server format protocol;
3. selects only the explicit classic-client core and its modern WOFF2 icon
   font; battle-only Showdex remains network-only;
4. injects immutable configuration into a separately typechecked service-worker
   runtime; and
5. emits the modern-browser adapter, then writes the ignored `service-worker.js`
   as the final webroot mutation.

The normal upstream build stays unchanged. Deployment runs finalization exactly
once, after runtime configuration and replay routing have their production
contents:

```sh
npm run offline:finalize -- --strict
```

The strict command requires a built server checkout at
`caches/pokemon-showdown`. The Docker build supplies it through the
`showdown-server` build context.

## Verification

```sh
npm run test:offline
npm run offline:finalize -- --strict
```

Generated shells and workers are not committed. Worker updates are content-
versioned and wait for user approval before activation. Every controlled tab is
then notified that it must reload before continuing with the new worker.
