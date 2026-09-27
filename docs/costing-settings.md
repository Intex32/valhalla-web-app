# Costing settings

[← Fork documentation](README.md)

## Only what you ticked gets sent

Upstream sends its whole settings object on every request. That was actively harmful here: our defaults are `auto`-shaped, so sending them unconditionally overwrote exactly the values that make `emergency` an emergency profile — gate and private-access penalties, destination-only penalties, toll booth cost.

So every costing option now carries an **include checkbox**:

- **Unticked** — the option is left out of `costing_options` entirely and the server applies its own default for that costing model.
- **Ticked** — the value is sent and overrides the server's default.

Editing a value ticks its box automatically, which makes the panel double as a readout of what is actually on the wire.

## One section per target

The advanced panel renders **one collapsible section per selected target**, titled `Instance · Profile` and edged in that target's colour.

Nothing is shared between sections. That is what lets you tune the same profile differently on two servers and watch both routes change side by side — see [multi-target routing](multi-target-routing.md).

## Import / export

Available on the `emergency` profile, which carries the tuning worth saving and sharing.

**Export** writes a JSON file using Valhalla's own parameter names, nested exactly where a `/route` request carries them, plus an `enabled` list recording which options are ticked (the include state has no API equivalent):

```json
{
  "costing": "emergency",
  "costing_options": { "emergency": { "krawana_wrong_way_factor": 6.5 } },
  "enabled": ["krawana_wrong_way_factor"]
}
```

**Import** accepts that file _or_ a hand-written Valhalla payload — a bare `costing_options` block, a single costing model's object, or a flat map of parameters. So you can paste a config straight from a request body or from a colleague. With no `enabled` list, every option present is ticked, which is the natural reading of a payload someone wrote to be sent. Unknown or wrong-typed keys are skipped and named.

## Options upstream never exposed

Beyond the `krawana_*` set, we surfaced several stock `auto` options the upstream panel omitted:

`use_distance`, `ignore_oneways`, `ignore_non_vehicular_restrictions`, `ignore_construction`
