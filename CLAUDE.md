# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`valhalla-web` (package name) is the ReactJS demo app that runs on https://valhalla.openstreetmap.de. It is a SPA frontend over the [Valhalla](https://github.com/valhalla/valhalla/CLAUDE.md) routing engine — it builds Valhalla `/route`, `/isochrone`, `/locate`, and `/height` requests and renders results on a MapLibre map. There is no backend in this repo.

## Commands

```bash
npm run dev            # Vite dev server on http://localhost:3000 (alias: npm start)
npm run build          # Vite production build → ./build (NOT ./dist)
npm run preview        # Serve the production build

npm test               # Vitest (watch mode); single test: npx vitest run path/to/file.spec.ts
npm run test:coverage  # Vitest with v8 coverage
npm run test:e2e       # Playwright (chromium + firefox); auto-starts dev server if not running
npm run test:e2e -- --project=chromium   # Single browser
npm run test:e2e:ui    # Playwright Test UI
npm run test:e2e:headed -- --project=firefox

npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run prettier       # Format
npm run check          # prettier:check && lint  (run before opening a PR)
npm run check:deps     # taze: list outdated deps interactively
```

Husky `pre-commit` runs `npm run typecheck && npx lint-staged` (eslint --fix on `*.{js,jsx,ts,tsx}`, prettier on `*.{json,md,scss,yaml,yml}`). CI (`.github/workflows/playwright.yml`) runs typecheck → lint → vitest → playwright (chromium only) on every PR.

## Tech stack

- **React 18** + **TypeScript** (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) + **Vite 7**
- **TanStack Router** (code-based, not file-based — see `src/routes.tsx`)
- **TanStack Query** for all Valhalla/Nominatim fetches
- **Zustand** + `immer` + `devtools` middleware for client state (3 stores in `src/stores/`)
- **Tailwind CSS v4** via `@tailwindcss/vite` + **shadcn/ui** (style `new-york`, base `slate`, lucide icons; see `components.json`)
- **maplibre-gl** + **react-map-gl** + `@watergis/maplibre-gl-terradraw` for drawing exclude-polygons
- **react-day-picker** (used by the shadcn `Calendar` primitive that powers the date/time button)
- **date-fns** for formatting
- **zod** for env/search-param/URL validation
- Path alias: `@/*` → `src/*`

## Architecture

### Entry & routing

```
src/index.tsx                      Mounts <RouterProvider> wrapped in TanStackQuery <Provider>
└─ src/routes.tsx                  Defines the router (code-based)
   └─ rootRoute → RootComponent    Renders <Outlet/> + dev-only TanStack devtools
      ├─ '/'                       beforeLoad redirects to '/directions'
      └─ '/$activeTab'             component=<App/>; validateSearch=zodValidator(searchParamsSchema)
                                   activeTab ∈ {'directions','isochrones','tiles'}; invalid → redirect
```

`<App/>` (`src/app.tsx`) wraps everything in `MapProvider` and renders three siblings: `MapComponent`, `RoutePlanner`, `SettingsPanel`, plus a sonner `<Toaster/>`.

URL search params are the source of truth for `profile` (costing models) and `style` (map style); a `retainSearchParams` middleware keeps them across tab switches. Schema is in `src/utils/route-schemas.ts`.

`profile` holds a **comma-separated list of targets** (`?profile=public:car,local:emergency`). A **target** is one costing profile on one Valhalla instance — the routing identity the whole app is keyed by, since the same profile on two servers is two independent results. It stays a raw string in the URL so permalinks remain readable, and a bare entry (`?profile=car`, the pre-multi-instance format) resolves against the first instance. `src/utils/targets.ts` owns `TargetRef`, `targetKey()`, `parseTargets()` / `serializeTargets()`; `src/hooks/use-selected-targets.ts` exposes `useSelectedTargets()` / `usePrimaryTarget()` / `readSelectedTargets()`. The **primary** target is the first in the list: it drives single-route actions (optimized route, elevation profile) and the tileset date in the footer.

Two separators are in play deliberately: the URL uses `:` (readable in a permalink) while keys use `__`, because `targetKey()` output ends up in DOM ids and CSS selectors where a colon needs escaping. Instance ids are slugs (`[a-z0-9-]+`) so neither separator can occur inside one.

The Vite `base` is derived from `package.json` `homepage` (see `vite.config.ts → getBaseUrl()`), and the router uses `import.meta.env.BASE_URL`. The PR-preview workflow rewrites `homepage` before building so the bundle is served from `/{PR_NUMBER}/`.

### State

Three Zustand stores, each with `immer` + `devtools`:

- `src/stores/common-store.ts` — settings panel/directions panel open state, costing settings, dateTime, map-ready flag. `Profile` enum and `profileEnum` zod schema live here.
  Costing settings live in `perTarget: Record<string, ScopedSettings>` keyed by `targetKey` — nothing is shared between targets, so the same profile on two servers is configured independently. Each `ScopedSettings` is `values` plus an `enabled` map of param names; **only enabled options are sent** (see "Costing settings"). `getTargetScope(perTarget, target)` seeds an untouched scope on read. Two genuinely global things sit alongside it: `excludePolygons` (one map drawing applies everywhere) and `useGeocoding` (client-only).
- `src/stores/directions-store.ts` — waypoints (with geocode results), route results, highlighted maneuver, optimized-route flag, active route.
- `src/stores/isochrones-store.ts` — input/results, range/interval/denoise/generalize, color palette, opacity.

Both result stores are keyed by **target**. `directions-store` holds `results.byTarget: { target, data }[]` (one `/route` response per target, in selection order), `results.failures: { target, kind, message }[]` for targets that returned nothing, and `results.show`, a per-route visibility map keyed by `routeKey(target, index)` where index 0 is the main route and 1..n are that target's alternates. `activeRoute: RouteRef | null` (a `TargetRef` plus `index`) identifies the highlighted route; `getRouteAt()` resolves it back to a response — it matches on **both** instance and profile, since matching on profile alone would silently pick the first server's line. `isochrones-store` mirrors this with `results.byTarget`, `results.failures` and a `results.show` keyed by `targetKey`.

### Valhalla instances

`src/stores/instances-store.ts` holds the list of servers the app routes against — `{ id, label, url }`, persisted to `localStorage['valhalla_instances']` via zustand's `persist`, seeded with **Public** (`valhalla1.openstreetmap.de`) and **Local** (`VITE_VALHALLA_URL`). A legacy `localStorage['valhalla_base_url']` is migrated into the local entry on first read. The list is edited in the settings panel's Server Settings section (add / rename / change URL / remove; the last instance cannot be removed). **Instance ids are immutable** — settings, results and permalinks are all keyed by them, so renaming changes only the label.

`getInstanceUrl(instanceId)` in `src/utils/valhalla.ts` is the single place a request resolves its server; it reads the store rather than a module constant so an edited URL takes effect on the next request. `src/utils/base-url.ts` is now just per-URL helpers (`validateBaseUrl`, `normalizeBaseUrl`, `testConnection`).

### Costing profiles

Adding a profile touches five places, all of which must agree or TypeScript will complain: `profileEnum` (`src/stores/common-store.ts`), `VALID_PROFILES` (`src/components/utils.ts`), the `iconMap` + `profiles` list in `src/components/profile-picker.tsx`, and the `SettingsProfile` union plus its `profileSettings` / `generalSettings` entries in `src/components/settings-panel/settings-options.ts`. `car` is the one profile renamed on the wire — `src/utils/valhalla.ts` maps it to Valhalla's `auto`; every other profile name is sent as-is.

`emergency` is a **fork-specific** costing model — it only exists on our own Valhalla deployment, not upstream. It is `auto`-derived, so it exposes the same option set as `car`.

`ProfilePicker` renders one multi-select `ToggleGroup` **per instance**, so profiles are chosen server by server; at least one target overall must stay selected. The query hooks fan out one request per target with `Promise.allSettled` and attribute each outcome **positionally** back to its target — keep that index correspondence or errors get blamed on the wrong server.

Failures are split by kind. Valhalla answers an unknown costing model with HTTP 400 and `error_code: 125`; `src/utils/valhalla-errors.ts` classifies that as `unsupported`, which surfaces as an inline info banner inside that instance's results group (`instance-results-group.tsx`) rather than a toast. Everything else is a genuine `error` and still toasts. Beware `error_code: 171` ("No suitable edges near location") — that is a coverage problem, not an unsupported profile.

Colours come from `src/utils/profile-colors.ts`: `getTargetColor(instanceIndex, profile)` keeps the profile's hue on every server (car stays blue) and shifts the shade per instance, alternating darker/lighter so neighbouring instances never collide. Used by the picker swatches, route lines, route cards, isochrone polygons and the settings sections alike.

### Costing settings

Every costing option carries an **include checkbox**. Unticked options are left out of `costing_options` entirely, so Valhalla applies its own default for that costing model; ticked options override it. This matters because our defaults are `auto`-shaped — sending them unconditionally used to overwrite exactly the values that make `emergency` an emergency profile (gate/private-access/destination-only penalties, toll booth cost). Editing a value ticks its box automatically, so the panel doubles as a readout of what is actually being sent.

`src/utils/build-costing-options.ts` turns one target's scope into its payload, iterating the union of `generalSettings[profile]` and `profileSettings[profile]` so a profile only ever receives options its costing model understands (pedestrian never gets `use_highways`). `alternates` comes from the target's own scope and `exclude_polygons` from the global map drawing — both request-level rather than costing options, and always sent; `use_geocoding` is client-only and never sent.

The advanced panel (`settings-panel.tsx`) renders **one collapsible section per selected target**, titled `Instance · Profile` and edged in that target's colour. Each section carries that profile's general _and_ profile-owned options merged into one list — nothing is shared, which is what lets the same profile be tuned differently on two servers — plus its own `alternates` slider (request-level, always sent, default 0). `settings-group-fields.tsx` renders a section; `setting-row.tsx` pairs each control with its include checkbox and dims the row while it's unticked.

Two things are easy to get wrong here. **Control ids must be target-prefixed** (`idPrefix` on `SettingsGroupFields`, producing ids like `local__car-top_speed` and testids like `include-local__car-top_speed`); without it two targets rendering the same option produce duplicate DOM ids and clicking one section's label toggles the other's control. And the callback split: `onValueChange` writes the value, `onCommit` only re-routes — a commit must never write a value, or a slider drag gets reverted by a stale closure.

Server-state lives in TanStack Query. The global `QueryClient` (`src/lib/tanstack-query/root-provider.tsx`) sets `refetchOnWindowFocus: false`, `retry: 1`, `staleTime: 5min`, `gcTime: 10min`. Query hooks are in `src/hooks/use-*-queries.ts`. They read inputs directly from Zustand stores via `useStore.getState()` and from the router via `router.state.location.search` rather than parameters — keep that pattern when adding new queries.

### Components

- `src/components/map/` — MapLibre map. `index.tsx` is the orchestrator; `parts/` holds map sublayers (route lines, isochrone polygons, hover popups, draw controls, marker icons). `valhalla-layers.ts` defines internal Valhalla edge/node/shortcut/access-restriction MVT layer IDs.
- `src/components/directions/`, `src/components/isochrones/`, `src/components/tiles/` — the three tab panels. Both routing panels group their results **by instance** via `instance-results-group.tsx`, which also renders the info banner naming any selected profile that server has no costing model for. Inside a group there is one card per target (plus one per alternate for directions), each tagged with the target's colour. `directions/export-waypoints-button.tsx` copies `unixtimestamp,start_lat,start_lon,end_lat,end_lon` — note the deliberate index flip, since every coordinate the app stores is `[lng, lat]` while that format is lat-first. `isochrone-visualization.tsx` holds the palette/opacity controls that apply to the whole isochrone layer, so they sit above the per-profile cards rather than inside one of them.
- `src/components/quick-settings.tsx` — left-sidebar "General settings" collapsible panel. Holds only the non-costing controls: a `DateTimeButton`, an alternates slider, and the directions language picker. **No costing option lives here** — they are all in the advanced panel, where each has an include checkbox. QuickSettings does still own the URL round-trip (hydrate on mount, mirror on change) for `use_ferry` / `use_highways` / `use_tolls` / `alternates` / `lang`, because it is the one component mounted on every routing tab. Used by both the directions and isochrones tabs (the latter passes `showAlternates={false} showLanguage={false}`). Renders the `SettingsButton` ("Advanced settings") at the bottom — that's the entry point to `SettingsPanel`.
- `src/components/settings-panel/` — full ("advanced") costing options panel, and the only place costing options are edited. `settings-options.ts` holds `settingsInit`, `settingsInitTruckOverride`, the per-profile `profileSettings` / `generalSettings` lists, the `getSharedSettingsGroup()` / `getProfileSettingsGroup()` selectors, and the `languageOptions` / language storage helpers. `settings-panel.tsx` renders one shared section plus a section per selected profile — see "Costing settings" above. Only `alternates` and `exclude_polygons` are withheld, since they are request-level rather than costing options.
- `src/components/ui/` — shadcn/ui primitives (do not rename — they're tracked by `components.json`). `date-time-button.tsx` and `calendar.tsx` are the QuickSettings building blocks.
- `src/components/types.ts` — shared `PossibleSettings`, `ActiveWaypoint`, Valhalla response types.

### Backend integration

- **Valhalla base URL**: `getBaseUrl()` in `src/utils/base-url.ts` reads `localStorage['valhalla_base_url']` first, then falls back to `VITE_VALHALLA_URL`. The settings panel lets users override and `testConnection()` validates by hitting `/status` and checking `available_actions` includes `route` and `isochrone`.
- **Client ID header**: every Valhalla request sends `X-Client-Id: ${VITE_CLIENT_ID}`. `src/index.tsx` warns at startup if it's unset or `unknown-web-app`. Production CI sets it to `public-web-app`.
- **Nominatim**: `src/utils/nominatim.ts`, base URL from `VITE_NOMINATIM_URL`.

### Conventions

- **File and folder names are KEBAB_CASE**, enforced by `eslint-plugin-check-file`. Spec/test/`.d.ts`/config files are exempt. Test files are `*.spec.ts(x)` colocated next to source.
- Vitest uses `jsdom` + `pool: 'vmForks'`. Setup in `src/test-setup.ts` polyfills `ResizeObserver` and imports `@testing-library/jest-dom/vitest`.
- Don't edit `src/components/ui/*` to add app-specific behavior — wrap them. `lib/utils.ts` exports `cn()` (clsx + tailwind-merge).

## Environment variables

All build-time, prefixed `VITE_`. Defined in `.env`, typed in `src/vite-env.d.ts`:

| Var                          | Purpose                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `VITE_VALHALLA_URL`          | Valhalla server base URL (overridable via UI/localStorage)                                 |
| `VITE_NOMINATIM_URL`         | Nominatim server for geocoding                                                             |
| `VITE_TILE_SERVER_URL`       | Raster tile URL template `{z}/{x}/{y}.png`                                                 |
| `VITE_CENTER_COORDS`         | Initial map center `"lat,lng"`                                                             |
| `VITE_DEFAULT_COSTING_MODEL` | Default profile (auto/bicycle/pedestrian/car/truck/bus/motor_scooter/motorcycle/emergency) |
| `VITE_CLIENT_ID`             | Sent as `X-Client-Id` on Valhalla requests                                                 |

## Deployment

- **Production** (`.github/workflows/deploy.yml`): on push to `master`, builds with `VITE_CLIENT_ID=public-web-app` (written to `.env.production.local`) and rsyncs `./build/` to the host server over SSH.
- **PR previews**: `preview-build.yml` rewrites the `homepage` field in `package.json` to `https://valhalla-app-tests.gis-ops.com/<PR#>` before building; `preview-deploy.yml` consumes that artifact, generates an `.htaccess` for SPA rewrites, rsyncs to `<host>/<PR#>/`, posts a status check, and comments the URL. `preview-cleanup.yml` removes the directory when the PR closes.
- **Docker** (`Dockerfile` + `docker-compose.yml`): node:24-alpine builder → nginx:1.29-alpine serving `./build` on port 80. Build-args do not pass through to Vite, so `.env` values are baked at image build time.
- The `npm run deploy` script (`gh-pages`) is defined but **not** used by any workflow — production goes via rsync.

## Working with this team

- **Maintainability beats performance.** Don't micro-optimize at the cost of readable code; only reach for performance work when there's a (relevant) measurable problem.
- **Value code elegance.** Prefer clear, concise solutions over clever ones; small, well-named units over sprawling abstractions.
- **Variable names shouldn't be too generic.** Avoid `data`, `result`, `item`, `tmp` — pick names that say what the value actually is (`routeResponse`, `selectedWaypoint`, `decodedShape`).
- **Test new features the way a user would.** After adding or changing a feature, exercise the 90th-percentile happy path in the running app (dev server + browser) — not exhaustively, but enough to confirm the feature actually works end-to-end. Typecheck and unit tests prove the code compiles, not that the feature behaves. If you can't run it (no browser available, etc.), say so explicitly instead of claiming success.
- **Don't run the test suite unprompted.** Only run `vitest`, `playwright`, or `npm run check` when the user asks for it (or when it's the natural finish of a task that explicitly involves tests). After non-trivial changes, you're encouraged to _remind_ the user that tests are worth running — but leave the actual running to them. Typecheck (`tsc --noEmit`) is fine to run on your own as a sanity check.
- **Keep this file (and other docs) current.** After non-trivial changes — new architectural pieces, store/route restructures, build/deploy changes, env-var additions — update `CLAUDE.md` and any other affected docs as part of the same change.
- **Draft the commit message, but ask before committing.** Produce a descriptive but terse message yourself (concise over chatty, but the "why" should still be readable) — don't ask the user what to write. Do still ask before actually running `git commit`; as maintainers we prefer to approve the commit boundary ourselves. Commit messages are the one place we want AI-written prose in normal English; everything else AI writes (issue/PR bodies) goes in pirate english.
- **Issue and PR descriptions: write in pirate english.** When asked to draft an issue or PR description, do not ask for confirmation — output it directly in pirate english (see https://www.polytranslator.com/pirate-english/ for the target style). This applies only to issue/PR body text; commit messages and code stay in normal English.
