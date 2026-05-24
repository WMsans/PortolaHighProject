# Portola High Wayfinder — Design Spec

**Date:** 2026-05-16
**Status:** Approved for planning

## Purpose

A pure-frontend web app that helps visitors and students at Portola High School navigate to a classroom. The user types a room number; the app recommends the best parking lot and draws a red route line from that lot's entrance to the room on a 3D model of the campus. The user can also enter a start room and a destination room to draw a route between them.

## Scope

**In scope (v1):**
- Load a pre-exported 3D model of the campus (glTF/GLB).
- Look up rooms and parking lots by name.
- Recommend the parking lot with the shortest walking route to a given room.
- Draw a red route line over the 3D model.
- Support routes between two arbitrary rooms.
- Handle two floors via a Z-offset and stair connector nodes.
- Mouse + touch camera controls (rotate, pan, zoom).

**Out of scope (v1):**
- Mobile AR or live GPS positioning.
- Turn-by-turn textual directions.
- In-browser editing of waypoints or rooms (authoring happens in Blender).
- Backend, accounts, persistence.

## Stack

- **Vite + vanilla TypeScript** — no UI framework needed.
- **three.js** — model rendering, route drawing, camera controls.
  - `GLTFLoader` (+ Draco decoder) for the model.
  - `OrbitControls` for camera input.
  - `Line2` / `LineMaterial` for thick red route lines.
- **Vitest** — unit tests for the pathfinding module.
- Static deployment (GitHub Pages, Netlify, or any static host).

## Asset Pipeline

The two runtime assets live in `/public/` and are produced once in Blender:

### `school.glb`
- The Blosm-imported Google 3D Tiles object, joined into a single mesh.
- Draco-compressed on export.
- Includes named `Empty` objects as annotations (see naming convention below).

### `graph.json`
- Hand-authored list of waypoint adjacencies.
- Shape: `{ "edges": [["node.12", "node.13"], ["node.13", "stair.a.1"], ...] }`
- Rooms and parking-entrance empties are NOT listed here; they are auto-connected at load time to their nearest waypoint node.

### Blender naming convention for Empties

| Pattern                          | Meaning                                                         |
|----------------------------------|-----------------------------------------------------------------|
| `room.<number>.<floor>`          | A classroom, e.g. `room.204.2`.                                 |
| `parking.<name>.entrance`        | Pedestrian entrance to a parking lot, e.g. `parking.north.entrance`. |
| `node.<id>`                      | An outdoor-walkway waypoint, e.g. `node.12`. Portola has no interior hallways — rooms open onto exterior paths, so place waypoints along those outdoor walkways. |
| `stair.<id>.<floor>`             | One end of a stairwell. Two empties sharing `<id>` form a stair edge across floors. |

Floor numbers are integers (`1` or `2`).

## Application Architecture

Four modules, each with a single responsibility.

### `loader.ts`
- Loads `school.glb` and `graph.json` in parallel.
- Walks the glTF scene graph; pulls out all `Empty` objects (zero-geometry `Object3D`s) and classifies them by name prefix.
- Applies the **floor-2 Z-offset** (default +4m, configurable) to every node whose name encodes floor 2.
- Returns:
  ```ts
  {
    modelRoot: THREE.Object3D,
    rooms: Map<string, Node>,         // "204" -> Node
    parking: Map<string, Node>,       // "north" -> Node
    waypoints: Map<string, Node>,     // "node.12" -> Node
    stairs: Stair[],                  // paired by shared id
    edges: [string, string][],        // from graph.json
  }
  ```
- A `Node` is `{ id: string, position: THREE.Vector3, floor: 1 | 2 }`.

### `graph.ts`
- Pure (no three.js imports beyond `Vector3` math) so it is unit-testable in isolation.
- Builds an adjacency map from the loader output:
  - Adds every edge from `graph.json`.
  - Adds stair edges (pairs sharing an id).
  - For each room and each parking entrance, finds the nearest waypoint on the same floor and adds an auto-edge.
- Edge weights = Euclidean distance between node positions (stair edges included; the Z-offset gives them a realistic cost).
- Exposes:
  - `findPath(fromId: string, toId: string): Node[] | null` — A* with Euclidean heuristic.
  - `recommendParking(roomId: string): { lot: string, path: Node[], distance: number } | null` — runs `findPath` from each parking entrance to the room and returns the shortest.

### `viewer.ts`
- Owns the three.js `Scene`, `PerspectiveCamera`, `WebGLRenderer`, and `OrbitControls`.
- Adds the loaded `modelRoot` to the scene.
- Holds a `routeLayer: THREE.Group` for the current red line.
- API:
  - `drawRoute(points: THREE.Vector3[])` — clears `routeLayer`, builds a `Line2` from the points with a bright red `LineMaterial` (configurable thickness in screen pixels), adds it to the layer, and tweens the camera to frame the route's bounding box.
  - `clearRoute()`
  - `setActiveFloor(floor: 1 | 2 | 'both')` — visually dims waypoints/route segments on the non-active floor (the model itself stays fully visible since it doesn't have separable floor geometry).
  - `recenter()` — tweens the camera back to a default overhead-ish framing of the whole campus.
- Debug overlay (`?debug=1` in URL): renders every waypoint as a small colored sphere and every edge as a thin line, so graph annotation errors are eyeballable.

### `ui.ts`
- Top-left HTML panel (plain DOM, styled with CSS):
  - **From** input — optional; placeholder reads "Recommended parking". Accepts a room number or a parking lot name.
  - **To** input — required; room number.
  - **Go** button.
  - **Floor toggle** — segmented control: `1 | 2 | Both`.
  - **Recenter** button.
  - **Result label** — e.g. *"Park at North Lot — 240 m walk"* or *"Route: 204 → 318, 120 m"*.
- Autocomplete on both inputs, sourced from the room and parking sets.
- Submitting the form calls `app.route(from?, to)` which:
  1. If `from` omitted → `graph.recommendParking(to)`.
  2. Else → `graph.findPath(from, to)`.
  3. Passes the resulting node positions (post Z-offset) to `viewer.drawRoute`.
  4. Updates the result label.

## Camera Controls

All gestures bound through `OrbitControls`:

| Input                                | Action          |
|--------------------------------------|-----------------|
| Left-drag                            | Orbit / rotate  |
| Right-drag (or Shift + left-drag)    | Pan             |
| Scroll wheel / pinch                 | Zoom (dolly)    |
| 1-finger touch drag                  | Rotate          |
| 2-finger touch drag                  | Pan             |
| 2-finger pinch                       | Zoom            |

- Damping enabled for smooth inertia.
- Min/max zoom distance clamped so the user can't fly inside the terrain or escape the campus.
- After `drawRoute`, the camera auto-frames the route's bounding box; any user input immediately cancels the tween.
- The **Recenter** button tweens back to the default view.

## Error Handling

- **Unknown room** → input flashes red; toast: *"Room 204 not found."*
- **No path between nodes** → toast: *"No route available — check graph.json."*
- **Failed asset load** → full-screen overlay with the error and a reload button.
- **Empty `graph.json`** → app still loads; routing returns "no path" until graph is populated. Debug overlay still works for authoring.

## Testing

- **Unit (Vitest):** `graph.ts` against a fixture graph: shortest path correctness, parking recommendation, disconnected graph returns `null`, stair edges weighted correctly.
- **Manual:** `?debug=1` to visually verify the graph; spot-check a handful of known routes.
- No end-to-end / browser automation in v1.

## Project Layout

```
/
├── public/
│   ├── school.glb
│   └── graph.json
├── src/
│   ├── main.ts          # bootstrap: wire loader → graph → viewer → ui
│   ├── loader.ts
│   ├── graph.ts
│   ├── viewer.ts
│   ├── ui.ts
│   ├── types.ts         # Node, Stair, Edge
│   └── style.css
├── tests/
│   └── graph.test.ts
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Open Questions (deferred, not blocking v1)

- Exact floor-2 Z-offset — pick a value that visually separates floors without distorting the campus too much. Tunable constant in `loader.ts`.
- Whether to add a small Blender helper script to export `graph.json` from selected pairs of empties (nice-to-have; can be added later).
