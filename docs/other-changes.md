# Other changes

[← Fork documentation](README.md)

Smaller changes that don't warrant a document of their own.

## Dev proxy for CORS

`vite.config.ts` proxies `/valhalla` to `VALHALLA_PROXY_TARGET` (default `http://localhost:8080`), so the app can talk to a local Valhalla that sends no CORS headers and can't answer the `X-Client-Id` preflight.

Point `VITE_VALHALLA_URL` at `http://localhost:3000/valhalla` to use it. `VALHALLA_PROXY_TARGET` is deliberately **not** `VITE_`-prefixed, so it never reaches the client bundle — the proxy is a dev-server concern only.

`/base-map` is proxied the same way, to our own map-style server, which sends no CORS headers either. That one also rewrites the URLs inside the style JSON on the way through, because a style that points at itself by absolute URL would send the browser straight back out of the proxy and into the same wall. They are rewritten to an absolute URL back at the dev server rather than to a `/base-map` path, because MapLibre rejects a relative **sprite** URL outright — which silently costs you every icon in the style (hydrants, gates, oneway arrows) while labels carry on drawing, since glyphs accept a relative URL happily.

Setting `Access-Control-Allow-Origin` on the style server makes all of this unnecessary — and a **production build needs it set**, since there is no proxy there.

## Choosing a map style

The layers button on the map lists the three upstream styles plus **Krawana Light** and **Krawana Dark**, our own base map. The default is unchanged. The chosen style rides in the `style` search param, so a permalink keeps it.

Under the built-ins, **Load custom styles** points the map at any MapLibre `style.json`:

- **by URL** — stored as the URL, so MapLibre refetches it on every load and edits on the style server show up without touching the app. Reopening the dialog prefills the field with the URL in use, so the URL can be edited by hand; the button then reads _Edit custom style URL_. A same-origin path works as well as an absolute URL.
- **from a local file** — inlined and stored as JSON, since there is nothing to refetch. Only this form gets the JSON editor.

Our base map ships as a PMTiles archive, so the app registers the `pmtiles://` protocol with MapLibre at startup. Any style using `pmtiles://` sources works, custom ones included.

## Alternate routes are legible

The selected route always draws at full strength; alternates fade. Previously the fade was applied by index, so alternate #5 stayed washed out even when it was the one you had selected.

## No camera jump on recompute

Changing a setting or picking another route no longer yanks the map away from wherever you panned or zoomed to.

## Deployment

The upstream production deploy workflow is removed — this fork isn't deployed to valhalla.openstreetmap.de.
