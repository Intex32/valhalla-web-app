# Multi-target routing

[← Fork documentation](README.md)

Upstream routes one profile against one server. We route **a set of targets**, where a _target_ is one costing profile on one Valhalla instance.

That distinction is the point: the same profile on two servers is two independent results, which is exactly what you need to compare a candidate Valhalla build against the current one.

## What you get

- **Server list** — add, rename, re-point and remove Valhalla instances in the settings panel. Seeded with **Public** (`valhalla1.openstreetmap.de`) and **Local** (`VITE_VALHALLA_URL`), persisted to `localStorage`.
- **Profile picker per server** — one row of profiles per instance, so you choose profiles server by server.
- **Results grouped by server**, one card per target, plus one per alternate route.
- **Permalinks carry the whole selection**: `?profile=public:car,local:emergency`. A bare `?profile=car` (the old format) still works and resolves against the first instance.

## Independence

Each target is independent all the way down: its own request, its own results, its own [costing settings](costing-settings.md), and its own colour.

Colours keep the profile's hue on every server — car is always blue — and shift shade per instance, so the same profile from two servers is still distinguishable at a glance. The same colour identifies a target everywhere it appears: picker swatch, route line, route card, isochrone polygon and settings section.

## Selection survives a recompute

The route you have selected stays selected when the route is recomputed. Dragging a waypoint keeps you on the target you were looking at instead of snapping back to the first server's main route.

If that target disappears from the selection entirely, the app falls back to the first available route.
