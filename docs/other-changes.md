# Other changes

[← Fork documentation](README.md)

Smaller changes that don't warrant a document of their own.

## Dev proxy for CORS

`vite.config.ts` proxies `/valhalla` to `VALHALLA_PROXY_TARGET` (default `http://localhost:8080`), so the app can talk to a local Valhalla that sends no CORS headers and can't answer the `X-Client-Id` preflight.

Point `VITE_VALHALLA_URL` at `http://localhost:3000/valhalla` to use it. `VALHALLA_PROXY_TARGET` is deliberately **not** `VITE_`-prefixed, so it never reaches the client bundle — the proxy is a dev-server concern only.

## Alternate routes are legible

The selected route always draws at full strength; alternates fade. Previously the fade was applied by index, so alternate #5 stayed washed out even when it was the one you had selected.

## No camera jump on recompute

Changing a setting or picking another route no longer yanks the map away from wherever you panned or zoomed to.

## Deployment

The upstream production deploy workflow is removed — this fork isn't deployed to valhalla.openstreetmap.de.
