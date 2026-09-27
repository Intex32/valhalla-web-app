# The `emergency` profile

[← Fork documentation](README.md)

A fork-specific costing model that exists only on our Valhalla deployment, not upstream. It is `auto`-derived, so it accepts the same option set as `car`, plus our own `krawana_*` options.

It appears in the profile picker with an ambulance icon and is red on the map. Because it is fork-specific, a server that doesn't have it answers `error_code: 125`; the app treats that as an **unsupported profile** and shows a quiet inline banner in that server's results group instead of an error toast — you can leave `emergency` selected while also routing against the public server.

> Don't confuse it with `error_code: 171` ("No suitable edges near location"), which means the tileset doesn't cover your waypoints.

## The `krawana_*` options

Fork-specific costing options, understood only by our `emergency` model. Most concern **contraflow driving** — an emergency vehicle going the wrong way down a one-way stretch.

| Option                                | Default | Range  | Meaning                                                              |
| ------------------------------------- | ------- | ------ | -------------------------------------------------------------------- |
| `krawana_speed_factor`                | 1       | 1–2    | Multiplies assumed travel speed, e.g. for exceeding the limit        |
| `krawana_max_wrong_way_length`        | 500 m   | 0–2000 | Longest single contraflow stretch allowed; longer ones are not used  |
| `krawana_wrong_way_factor`            | 5       | 1–20   | Multiplies the cost of driving against the direction of travel       |
| `krawana_wrong_way_risk`              | 1       | 0–1    | How much contraflow risk is acceptable                               |
| `krawana_wrong_way_speed`             | 30 km/h | 1–200  | Assumed speed while driving contraflow                               |
| `krawana_wrong_way_ramp_risk`         | 4       | 0–100  | Risk of contraflow on a ramp — fast merging traffic, poor sightlines |
| `krawana_wrong_way_turn_channel_risk` | 1.5     | 0–100  | Risk of contraflow through a slip road                               |
| `krawana_wrong_way_no_escape_risk`    | 1.5     | 0–100  | Risk of a contraflow stretch with no way to pull aside               |
| `krawana_surface_factor`              | 0.5     | 0–10   | How strongly road surface weighs on the route                        |

## Keeping them in view

In the advanced panel these stay **pinned at the top** of the emergency profile's section, along with `top_speed` and `disable_hierarchy_pruning` (tuned alongside them). The ~36 inherited `auto` options fold away into a collapsed "Standard options" section, so the knobs that matter aren't buried among the ones that don't.

Emergency is also the only profile with settings [import/export](costing-settings.md#import--export), since it carries the tuning worth saving and sharing.
