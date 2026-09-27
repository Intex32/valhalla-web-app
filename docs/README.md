# Fork documentation

This is a fork of [gis-ops/valhalla-app](https://github.com/gis-ops/valhalla-app), the demo app behind <https://valhalla.openstreetmap.de>. It diverges at upstream commit `cd95462`.

Everything documented here is ours. It exists to support one job: **tuning and debugging the `emergency` costing model** on our own Valhalla fork, where the interesting questions are "why did it pick that road", "what did that turn cost", and "how does this build compare to the last one".

Three themes run through all of it:

1. **Compare, don't guess.** Several profiles, on several servers, side by side in one map.
2. **Show the model's own numbers.** Cost — not just distance and time — down to the individual graph edge and junction.
3. **Only send what you meant to send.** Costing options are opt-in, so our `auto`-shaped defaults never silently overwrite what makes `emergency` an emergency profile.

## Contents

| Document                                        | What it covers                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [The `emergency` profile](emergency-profile.md) | The fork-specific costing model, the nine `krawana_*` contraflow options, and how the panel keeps them in view |
| [Multi-target routing](multi-target-routing.md) | Routing several profiles against several Valhalla servers at once, and what a _target_ is                      |
| [Costing settings](costing-settings.md)         | Why options are opt-in, per-target tuning, and settings import/export                                          |
| [Cost visualisation](cost-visualisation.md)     | Route, maneuver, per-edge and per-junction cost, and the segment-metrics debugging view                        |
| [Other changes](other-changes.md)               | Dev CORS proxy, alternate-route legibility, camera behaviour                                                   |

> These documents are the **what and the why**. Implementation detail lives in [`CLAUDE.md`](../CLAUDE.md).

## Requirements on the Valhalla side

This app assumes a Valhalla built from our fork:

- the **`emergency`** costing model and its `krawana_*` options;
- a patched `trace_serializer.cc` that emits **`transition_cost`** alongside `transition_time`. Upstream serialises only the seconds, and the seconds bear almost no relation to the cost. Without the patch the app still works — the transition silently stays inside the edge's cost, and the junction dots lose their meaning.

Against a stock Valhalla you still get multi-instance comparison, the settings panel, cost totals and per-maneuver cost; `emergency` shows as unsupported.
