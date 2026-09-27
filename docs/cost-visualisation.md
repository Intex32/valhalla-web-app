# Cost visualisation

[← Fork documentation](README.md)

Upstream shows distance and time. The costing model's actual **cost** was invisible, which made it impossible to see why a route was chosen. Now cost is visible at three levels:

- **Route total cost** on every route card, beside length and duration.
- **Cost per maneuver** in the maneuver list.
- **Segment metrics** — a debugging view that repaints the selected route by a chosen metric, down to the individual graph edge and junction.

> Cost is unitless and only comparable **within one costing model**. The cost on a car card and an emergency card are not like for like.

## Segment metrics

Off by default, behind a switch in the directions panel. It paints **only the selected route**, along a blue→red ramp, by one of four metrics:

| Metric          | What it tells you                                                                |
| --------------- | -------------------------------------------------------------------------------- |
| **Cost / km**   | Which stretches the costing model dislikes, independent of length                |
| **Time / km**   | How slow a stretch is, before penalties                                          |
| **Speed**       | The same, in the unit the road is signed in                                      |
| **Cost / time** | Where cost diverges from time — i.e. where **penalties** bite, not just slowness |

Clicking a segment gives its exact numbers: length, time, cost, road class, edge speed, every metric, plus the Valhalla edge id and the OSM way id.

### Two levels of detail

The `/route` response only carries cost per _maneuver_ — about 10 for a 13 km route — and that draws immediately.

The app then walks the same route's shape back through `/trace_attributes`, which splits it into **graph edges** (~300 for that route), each carrying its own cost, and the view sharpens. That is a second request, so it only fires for the selected route and only while this view is on.

### Junctions are drawn separately

Transition cost — the price of turning through an intersection — is roughly a third of a typical route's total and has nothing to do with the length of the road that follows. Folding it into the following edge made a 9 m slip road read as 3800 cost/km.

So it is subtracted out and drawn as a **dot on the junction**, with its own scale and its own popup: transition cost and time, which streets meet there, node type, traffic signal, both OSM way ids, and a link to the spot on osm.org.

What a dot encodes follows the metric, since only some of them have a junction equivalent:

| Metric             | Dots show                             |
| ------------------ | ------------------------------------- |
| Cost / km          | transition **cost**                   |
| Time / km          | transition **time**                   |
| Speed, Cost / time | nothing — plain dots, still clickable |

> Valhalla drops OSM _node_ ids when it builds the graph, so there is no node id to show. The pair of ways plus the coordinate identifies the junction instead.

### Absolute scales

Each metric has an editable `min`/`max`, persisted, so the same value is the same colour on every route and across sessions — you can build an intuition that holds still, rather than a scale that re-anchors itself whenever the route changes.

Values outside the range clamp. Because a clamped dot is indistinguishable from one merely at the top of the scale, a junction that is off its scale gets a **dark outline** (grey if below it).
