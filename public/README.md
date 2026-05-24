# Runtime assets

- `school.glb` — exported from Blender. Must include named `Empty` objects:
  - `room.<number>.<floor>` (e.g. `room.204.2`)
  - `parking.<name>.entrance`
  - `node.<id>` for outdoor walkway waypoints (Portola has no interior hallways — every classroom door opens onto an exterior path, so waypoints must be placed along those outdoor walkways, not inside buildings)
  - `stair.<id>.<floor>` paired across floors
- `graph.json` — `{ "edges": [["node.a","node.b"], ...] }`. Rooms and parking entrances auto-connect to nearest waypoint at load time.

Open the app with `?debug=1` to see waypoints rendered as colored spheres.
