# Portola High Wayfinder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure-frontend web app that loads a 3D Blender-exported model of Portola High, lets the user enter a destination room (and optional start room), recommends a parking lot, and draws a red route line over a 3D campus model with full camera controls.

**Architecture:** Vite + TypeScript single-page app. Four focused modules: `loader.ts` parses a glTF and `graph.json` into typed data, `graph.ts` exposes pure A* pathfinding and parking recommendation, `viewer.ts` owns the three.js scene with OrbitControls and a route layer, and `ui.ts` wires DOM inputs to the routing pipeline. Floors are modeled by lifting floor-2 nodes by a Z-offset and connecting floors via paired stair empties.

**Tech Stack:** Vite, TypeScript, three.js (GLTFLoader, OrbitControls, Line2/LineMaterial), Vitest.

---

## File Structure

```
/
├── public/
│   ├── school.glb               # Authored in Blender, placed by user
│   └── graph.json               # Authored by user
├── src/
│   ├── main.ts                  # bootstrap
│   ├── loader.ts                # GLB + graph.json -> typed scene data
│   ├── graph.ts                 # adjacency, A*, parking recommendation
│   ├── viewer.ts                # three.js scene, route layer, camera
│   ├── ui.ts                    # DOM panel, autocomplete, event wiring
│   ├── types.ts                 # Node, Stair, Edge, LoadedScene
│   └── style.css
├── tests/
│   └── graph.test.ts
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/style.css`, `.gitignore`

- [ ] **Step 1: Initialize git and create `.gitignore`**

```bash
cd /home/jeremy/Development/PortolaHighProject
git init
```

Create `.gitignore`:
```
node_modules
dist
.DS_Store
*.log
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "portola-wayfinder",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "three": "^0.160.0"
  },
  "devDependencies": {
    "@types/three": "^0.160.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { target: "es2022" },
});
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Portola High Wayfinder</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="app">
      <canvas id="canvas"></canvas>
      <div id="panel"></div>
      <div id="toast"></div>
      <div id="error-overlay" hidden></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/style.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { height: 100%; width: 100%; overflow: hidden; font-family: system-ui, sans-serif; }
#canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#panel {
  position: absolute; top: 16px; left: 16px; z-index: 10;
  background: rgba(255,255,255,0.95); padding: 16px; border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15); min-width: 280px;
}
#panel label { display: block; font-size: 12px; font-weight: 600; margin-top: 8px; }
#panel input, #panel button { width: 100%; padding: 8px; margin-top: 4px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; }
#panel button { background: #c0392b; color: white; border: none; cursor: pointer; margin-top: 12px; }
#panel button.secondary { background: #ecf0f1; color: #333; }
#panel .floor-toggle { display: flex; gap: 4px; margin-top: 4px; }
#panel .floor-toggle button { flex: 1; padding: 6px; background: #ecf0f1; color: #333; }
#panel .floor-toggle button.active { background: #2c3e50; color: white; }
#panel .result { margin-top: 12px; font-size: 13px; color: #2c3e50; min-height: 1em; }
.shake { animation: shake 0.3s; }
@keyframes shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
#toast {
  position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: #2c3e50; color: white; padding: 12px 20px; border-radius: 6px;
  opacity: 0; transition: opacity 0.2s; pointer-events: none; z-index: 20;
}
#toast.show { opacity: 1; }
#error-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,0.85); color: white;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  z-index: 100; padding: 32px; text-align: center;
}
#error-overlay button { margin-top: 16px; padding: 10px 24px; cursor: pointer; }
```

- [ ] **Step 7: Create placeholder `src/main.ts`**

```ts
console.log("Portola Wayfinder boot");
```

- [ ] **Step 8: Install dependencies and verify build**

```bash
npm install
npm run build
```

Expected: build succeeds, produces `dist/`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + TS + three.js project"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
import type { Vector3 } from "three";

export type Floor = 1 | 2;

export interface Node {
  id: string;
  position: Vector3;
  floor: Floor;
  kind: "room" | "parking" | "waypoint" | "stair";
}

export interface Stair {
  id: string;            // shared stair group id, e.g. "a"
  endpoints: [Node, Node]; // floor-1 and floor-2 nodes
}

export type Edge = [string, string];

export interface LoadedScene {
  modelRoot: import("three").Object3D;
  rooms: Map<string, Node>;     // "204" -> Node
  parking: Map<string, Node>;   // "north" -> Node
  waypoints: Map<string, Node>; // "node.12" -> Node
  stairs: Stair[];
  edges: Edge[];
}

export interface GraphFile {
  edges: Edge[];
}

export const FLOOR_Z_OFFSET = 4; // metres; lifts floor-2 nodes
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: shared types for nodes, stairs, edges"
```

---

## Task 3: Graph Module — A* Pathfinding (TDD)

**Files:**
- Create: `src/graph.ts`
- Test: `tests/graph.test.ts`

- [ ] **Step 1: Write failing test for basic pathfinding**

Create `tests/graph.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { buildGraph, findPath, recommendParking } from "../src/graph";
import type { Node, LoadedScene } from "../src/types";

function n(id: string, x: number, y: number, z: number, floor: 1 | 2, kind: Node["kind"] = "waypoint"): Node {
  return { id, position: new Vector3(x, y, z), floor, kind };
}

function scene(partial: Partial<LoadedScene>): LoadedScene {
  return {
    modelRoot: {} as any,
    rooms: new Map(),
    parking: new Map(),
    waypoints: new Map(),
    stairs: [],
    edges: [],
    ...partial,
  };
}

describe("findPath", () => {
  it("finds a direct path between two connected waypoints", () => {
    const a = n("node.a", 0, 0, 0, 1);
    const b = n("node.b", 10, 0, 0, 1);
    const s = scene({
      waypoints: new Map([["node.a", a], ["node.b", b]]),
      edges: [["node.a", "node.b"]],
    });
    const g = buildGraph(s);
    const path = findPath(g, "node.a", "node.b");
    expect(path?.map((p) => p.id)).toEqual(["node.a", "node.b"]);
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test
```

Expected: FAIL — `buildGraph` not defined.

- [ ] **Step 3: Implement `src/graph.ts` minimum to pass**

```ts
import type { LoadedScene, Node } from "./types";

export interface Graph {
  nodes: Map<string, Node>;
  adj: Map<string, { to: string; w: number }[]>;
}

function dist(a: Node, b: Node): number {
  return a.position.distanceTo(b.position);
}

function addEdge(adj: Map<string, { to: string; w: number }[]>, nodes: Map<string, Node>, a: string, b: string): void {
  const na = nodes.get(a);
  const nb = nodes.get(b);
  if (!na || !nb) return;
  const w = dist(na, nb);
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a)!.push({ to: b, w });
  adj.get(b)!.push({ to: a, w });
}

function nearestWaypoint(target: Node, waypoints: Map<string, Node>): Node | null {
  let best: Node | null = null;
  let bestD = Infinity;
  for (const wp of waypoints.values()) {
    if (wp.floor !== target.floor) continue;
    const d = dist(target, wp);
    if (d < bestD) { bestD = d; best = wp; }
  }
  return best;
}

export function buildGraph(scene: LoadedScene): Graph {
  const nodes = new Map<string, Node>();
  for (const w of scene.waypoints.values()) nodes.set(w.id, w);
  for (const r of scene.rooms.values()) nodes.set(r.id, r);
  for (const p of scene.parking.values()) nodes.set(p.id, p);
  for (const s of scene.stairs) {
    nodes.set(s.endpoints[0].id, s.endpoints[0]);
    nodes.set(s.endpoints[1].id, s.endpoints[1]);
  }

  const adj = new Map<string, { to: string; w: number }[]>();
  for (const [a, b] of scene.edges) addEdge(adj, nodes, a, b);
  for (const s of scene.stairs) addEdge(adj, nodes, s.endpoints[0].id, s.endpoints[1].id);

  for (const r of scene.rooms.values()) {
    const wp = nearestWaypoint(r, scene.waypoints);
    if (wp) addEdge(adj, nodes, r.id, wp.id);
  }
  for (const p of scene.parking.values()) {
    const wp = nearestWaypoint(p, scene.waypoints);
    if (wp) addEdge(adj, nodes, p.id, wp.id);
  }

  return { nodes, adj };
}

export function findPath(graph: Graph, fromId: string, toId: string): Node[] | null {
  const { nodes, adj } = graph;
  const from = nodes.get(fromId);
  const to = nodes.get(toId);
  if (!from || !to) return null;

  const open = new Set<string>([fromId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[fromId, 0]]);
  const fScore = new Map<string, number>([[fromId, dist(from, to)]]);

  while (open.size > 0) {
    let current: string | null = null;
    let currentF = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < currentF) { currentF = f; current = id; }
    }
    if (current === null) break;
    if (current === toId) {
      const path: Node[] = [];
      let cur: string | undefined = current;
      while (cur !== undefined) {
        path.unshift(nodes.get(cur)!);
        cur = cameFrom.get(cur);
      }
      return path;
    }
    open.delete(current);
    const neighbors = adj.get(current) ?? [];
    for (const { to: nbr, w } of neighbors) {
      const tentative = (gScore.get(current) ?? Infinity) + w;
      if (tentative < (gScore.get(nbr) ?? Infinity)) {
        cameFrom.set(nbr, current);
        gScore.set(nbr, tentative);
        fScore.set(nbr, tentative + dist(nodes.get(nbr)!, to));
        open.add(nbr);
      }
    }
  }
  return null;
}

export interface ParkingRecommendation {
  lot: string;
  path: Node[];
  distance: number;
}

export function recommendParking(graph: Graph, scene: LoadedScene, roomId: string): ParkingRecommendation | null {
  let best: ParkingRecommendation | null = null;
  for (const [lotName, lotNode] of scene.parking) {
    const path = findPath(graph, lotNode.id, roomId);
    if (!path) continue;
    let total = 0;
    for (let i = 1; i < path.length; i++) total += path[i].position.distanceTo(path[i - 1].position);
    if (!best || total < best.distance) {
      best = { lot: lotName, path, distance: total };
    }
  }
  return best;
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Add test for room auto-connect to nearest waypoint**

Append to `tests/graph.test.ts`:
```ts
describe("buildGraph auto-connect", () => {
  it("connects a room to its nearest same-floor waypoint", () => {
    const room = n("204", 1, 0, 0, 1, "room");
    const wp1 = n("node.a", 0, 0, 0, 1);
    const wp2 = n("node.b", 100, 0, 0, 1);
    const s = scene({
      rooms: new Map([["204", room]]),
      waypoints: new Map([["node.a", wp1], ["node.b", wp2]]),
      edges: [["node.a", "node.b"]],
    });
    const g = buildGraph(s);
    const path = findPath(g, "204", "node.b");
    expect(path?.map((p) => p.id)).toEqual(["204", "node.a", "node.b"]);
  });

  it("only auto-connects to waypoints on the same floor", () => {
    const room = n("301", 0, 0, 0, 2, "room");
    const wpSameFloor = n("node.up", 5, 0, 0, 2);
    const wpOtherFloor = n("node.dn", 0.1, 0, 0, 1);
    const s = scene({
      rooms: new Map([["301", room]]),
      waypoints: new Map([["node.up", wpSameFloor], ["node.dn", wpOtherFloor]]),
    });
    const g = buildGraph(s);
    const path = findPath(g, "301", "node.up");
    expect(path?.map((p) => p.id)).toEqual(["301", "node.up"]);
  });
});
```

- [ ] **Step 6: Run tests, confirm all pass**

```bash
npm test
```

Expected: PASS (3 tests).

- [ ] **Step 7: Add test for stair-edge routing across floors**

Append:
```ts
describe("stair edges", () => {
  it("routes across floors via paired stair empties", () => {
    const s1 = n("stair.a.1", 0, 0, 0, 1, "stair");
    const s2 = n("stair.a.2", 0, 0, 4, 2, "stair");
    const wp1 = n("node.f1", 1, 0, 0, 1);
    const wp2 = n("node.f2", 1, 0, 4, 2);
    const s = scene({
      waypoints: new Map([["node.f1", wp1], ["node.f2", wp2]]),
      edges: [["node.f1", "stair.a.1"], ["node.f2", "stair.a.2"]],
      stairs: [{ id: "a", endpoints: [s1, s2] }],
    });
    const g = buildGraph(s);
    const path = findPath(g, "node.f1", "node.f2");
    expect(path?.map((p) => p.id)).toEqual(["node.f1", "stair.a.1", "stair.a.2", "node.f2"]);
  });
});
```

- [ ] **Step 8: Run tests**

```bash
npm test
```

Expected: PASS (4 tests).

- [ ] **Step 9: Add test for `recommendParking` choosing shortest lot**

Append:
```ts
describe("recommendParking", () => {
  it("picks the parking lot with shortest walking path", () => {
    const room = n("204", 10, 0, 0, 1, "room");
    const close = n("parking.close", 8, 0, 0, 1, "parking");
    const far   = n("parking.far",  -50, 0, 0, 1, "parking");
    const wp    = n("node.h", 9, 0, 0, 1);
    const wpFar = n("node.h2", -49, 0, 0, 1);
    const s = scene({
      rooms: new Map([["204", room]]),
      parking: new Map([["close", close], ["far", far]]),
      waypoints: new Map([["node.h", wp], ["node.h2", wpFar]]),
      edges: [["node.h", "node.h2"]],
    });
    const g = buildGraph(s);
    const rec = recommendParking(g, s, "204");
    expect(rec?.lot).toBe("close");
  });

  it("returns null when graph is disconnected", () => {
    const room = n("204", 0, 0, 0, 1, "room");
    const lot  = n("parking.x", 5, 0, 0, 1, "parking");
    const wp1  = n("node.r", 0.1, 0, 0, 1);
    const wp2  = n("node.l", 5.1, 0, 0, 1);
    const s = scene({
      rooms: new Map([["204", room]]),
      parking: new Map([["x", lot]]),
      waypoints: new Map([["node.r", wp1], ["node.l", wp2]]),
      edges: [], // no edge between wp1 and wp2
    });
    const g = buildGraph(s);
    expect(recommendParking(g, s, "204")).toBeNull();
  });
});
```

- [ ] **Step 10: Run tests**

```bash
npm test
```

Expected: PASS (6 tests).

- [ ] **Step 11: Commit**

```bash
git add src/graph.ts tests/graph.test.ts
git commit -m "feat: graph module with A* pathfinding and parking recommendation"
```

---

## Task 4: Loader Module

**Files:**
- Create: `src/loader.ts`

- [ ] **Step 1: Implement `src/loader.ts`**

```ts
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { Object3D, Vector3 } from "three";
import type { Floor, GraphFile, LoadedScene, Node, Stair } from "./types";
import { FLOOR_Z_OFFSET } from "./types";

function parseFloor(token: string): Floor | null {
  if (token === "1") return 1;
  if (token === "2") return 2;
  return null;
}

function classify(name: string): { kind: Node["kind"]; key: string; floor: Floor; stairGroup?: string } | null {
  const parts = name.split(".");
  if (parts[0] === "room" && parts.length === 3) {
    const floor = parseFloor(parts[2]);
    if (!floor) return null;
    return { kind: "room", key: parts[1], floor };
  }
  if (parts[0] === "parking" && parts.length === 3 && parts[2] === "entrance") {
    return { kind: "parking", key: parts[1], floor: 1 };
  }
  if (parts[0] === "node" && parts.length === 2) {
    return { kind: "waypoint", key: name, floor: 1 };
  }
  if (parts[0] === "stair" && parts.length === 3) {
    const floor = parseFloor(parts[2]);
    if (!floor) return null;
    return { kind: "stair", key: name, floor, stairGroup: parts[1] };
  }
  return null;
}

function isEmpty(obj: Object3D): boolean {
  // Blender Empties export as Object3D with type "Object3D" and no geometry.
  return obj.type === "Object3D" && obj.children.length === 0;
}

export async function loadScene(glbUrl: string, graphUrl: string): Promise<LoadedScene> {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
  loader.setDRACOLoader(draco);

  const [gltf, graphResp] = await Promise.all([
    loader.loadAsync(glbUrl),
    fetch(graphUrl).then((r) => {
      if (!r.ok) throw new Error(`graph.json HTTP ${r.status}`);
      return r.json() as Promise<GraphFile>;
    }),
  ]);

  const modelRoot = gltf.scene;

  const rooms = new Map<string, Node>();
  const parking = new Map<string, Node>();
  const waypoints = new Map<string, Node>();
  const stairsByGroup = new Map<string, Node[]>();

  modelRoot.traverse((obj) => {
    if (!obj.name || !isEmpty(obj)) return;
    const c = classify(obj.name);
    if (!c) return;

    const world = new Vector3();
    obj.getWorldPosition(world);
    if (c.floor === 2) world.z += FLOOR_Z_OFFSET;

    const node: Node = { id: c.kind === "room" ? c.key : c.kind === "parking" ? `parking.${c.key}` : obj.name, position: world, floor: c.floor, kind: c.kind };

    if (c.kind === "room") rooms.set(c.key, node);
    else if (c.kind === "parking") parking.set(c.key, node);
    else if (c.kind === "waypoint") waypoints.set(c.key, node);
    else if (c.kind === "stair" && c.stairGroup) {
      const list = stairsByGroup.get(c.stairGroup) ?? [];
      list.push(node);
      stairsByGroup.set(c.stairGroup, list);
    }
  });

  const stairs: Stair[] = [];
  for (const [groupId, ends] of stairsByGroup) {
    if (ends.length !== 2) {
      console.warn(`stair group "${groupId}" has ${ends.length} endpoints; expected 2 — skipping`);
      continue;
    }
    const sorted = ends.sort((a, b) => a.floor - b.floor) as [Node, Node];
    stairs.push({ id: groupId, endpoints: sorted });
  }

  return { modelRoot, rooms, parking, waypoints, stairs, edges: graphResp.edges ?? [] };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/loader.ts
git commit -m "feat: glTF + graph.json loader with empty classification"
```

---

## Task 5: Viewer Module

**Files:**
- Create: `src/viewer.ts`

- [ ] **Step 1: Implement `src/viewer.ts`**

```ts
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { LoadedScene } from "./types";

export type FloorView = 1 | 2 | "both";

export class Viewer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly controls: OrbitControls;
  private readonly routeLayer = new Group();
  private readonly debugLayer = new Group();
  private routeMaterial: LineMaterial;
  private defaultCameraPos = new Vector3(0, -200, 200);
  private defaultTarget = new Vector3(0, 0, 0);
  private modelBounds: Box3 | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.copy(this.defaultCameraPos);
    this.camera.lookAt(this.defaultTarget);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 2000;
    this.controls.target.copy(this.defaultTarget);

    this.scene.add(new AmbientLight(0xffffff, 0.6));
    const sun = new DirectionalLight(0xffffff, 0.8);
    sun.position.set(100, -100, 200);
    this.scene.add(sun);

    this.scene.add(this.routeLayer);
    this.scene.add(this.debugLayer);

    this.routeMaterial = new LineMaterial({
      color: 0xff2222,
      linewidth: 4, // in screen pixels
      worldUnits: false,
      depthTest: false,
      transparent: true,
    });
    this.routeMaterial.resolution.set(window.innerWidth, window.innerHeight);

    window.addEventListener("resize", () => this.onResize());
    this.animate();
  }

  attachModel(loaded: LoadedScene): void {
    this.scene.add(loaded.modelRoot);
    this.modelBounds = new Box3().setFromObject(loaded.modelRoot);
    const center = new Vector3();
    this.modelBounds.getCenter(center);
    const size = new Vector3();
    this.modelBounds.getSize(size);
    const radius = Math.max(size.x, size.y, size.z);
    this.defaultTarget.copy(center);
    this.defaultCameraPos.set(center.x, center.y - radius * 1.2, center.z + radius * 0.8);
    this.recenter();
  }

  enableDebug(loaded: LoadedScene): void {
    this.debugLayer.clear();
    const sphereGeo = new SphereGeometry(0.6, 8, 8);
    const matWp = new MeshBasicMaterial({ color: 0x2ecc71 });
    const matRoom = new MeshBasicMaterial({ color: 0x3498db });
    const matPark = new MeshBasicMaterial({ color: 0xe67e22 });
    const matStair = new MeshBasicMaterial({ color: 0x9b59b6 });

    const place = (pos: Vector3, mat: MeshBasicMaterial) => {
      const m = new Mesh(sphereGeo, mat);
      m.position.copy(pos);
      this.debugLayer.add(m);
    };
    for (const wp of loaded.waypoints.values()) place(wp.position, matWp);
    for (const r of loaded.rooms.values()) place(r.position, matRoom);
    for (const p of loaded.parking.values()) place(p.position, matPark);
    for (const s of loaded.stairs) {
      place(s.endpoints[0].position, matStair);
      place(s.endpoints[1].position, matStair);
    }
  }

  drawRoute(points: Vector3[]): void {
    this.clearRoute();
    if (points.length < 2) return;
    const flat: number[] = [];
    for (const p of points) flat.push(p.x, p.y, p.z);
    const geo = new LineGeometry();
    geo.setPositions(flat);
    const line = new Line2(geo, this.routeMaterial);
    line.computeLineDistances();
    line.renderOrder = 999;
    this.routeLayer.add(line);
    this.frameBounds(new Box3().setFromPoints(points));
  }

  clearRoute(): void {
    this.routeLayer.clear();
  }

  setActiveFloor(_floor: FloorView): void {
    // v1: model has no separable floor geometry, so this only affects debug spheres.
    // Reserved for future per-floor visual treatments.
  }

  recenter(): void {
    this.camera.position.copy(this.defaultCameraPos);
    this.controls.target.copy(this.defaultTarget);
    this.controls.update();
  }

  private frameBounds(box: Box3): void {
    const center = new Vector3();
    box.getCenter(center);
    const size = new Vector3();
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z, 10);
    const dir = new Vector3(0, -1, 0.6).normalize();
    this.camera.position.copy(center).addScaledVector(dir, radius * 2.2);
    this.controls.target.copy(center);
    this.controls.update();
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.routeMaterial.resolution.set(w, h);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/viewer.ts
git commit -m "feat: three.js viewer with OrbitControls, route layer, debug overlay"
```

---

## Task 6: UI Module

**Files:**
- Create: `src/ui.ts`

- [ ] **Step 1: Implement `src/ui.ts`**

```ts
import type { LoadedScene } from "./types";
import type { FloorView, Viewer } from "./viewer";
import { buildGraph, findPath, recommendParking, type Graph } from "./graph";

export interface UIDeps {
  scene: LoadedScene;
  graph: Graph;
  viewer: Viewer;
}

export function mountUI(panel: HTMLElement, deps: UIDeps): void {
  const { scene, graph, viewer } = deps;
  const roomList = Array.from(scene.rooms.keys()).sort();
  const parkingList = Array.from(scene.parking.keys()).sort();

  panel.innerHTML = `
    <label for="from-input">From (optional)</label>
    <input id="from-input" list="from-options" placeholder="Recommended parking" autocomplete="off" />
    <datalist id="from-options">
      ${roomList.map((r) => `<option value="${r}"></option>`).join("")}
      ${parkingList.map((p) => `<option value="parking.${p}"></option>`).join("")}
    </datalist>

    <label for="to-input">To (room number)</label>
    <input id="to-input" list="to-options" placeholder="e.g. 204" autocomplete="off" />
    <datalist id="to-options">
      ${roomList.map((r) => `<option value="${r}"></option>`).join("")}
    </datalist>

    <label>Floor</label>
    <div class="floor-toggle" role="tablist">
      <button data-floor="1">1</button>
      <button data-floor="2">2</button>
      <button data-floor="both" class="active">Both</button>
    </div>

    <button id="go-btn">Go</button>
    <button id="recenter-btn" class="secondary">Recenter</button>

    <div class="result" id="result"></div>
  `;

  const fromInput = panel.querySelector<HTMLInputElement>("#from-input")!;
  const toInput   = panel.querySelector<HTMLInputElement>("#to-input")!;
  const goBtn     = panel.querySelector<HTMLButtonElement>("#go-btn")!;
  const recenter  = panel.querySelector<HTMLButtonElement>("#recenter-btn")!;
  const result    = panel.querySelector<HTMLDivElement>("#result")!;
  const floorBtns = Array.from(panel.querySelectorAll<HTMLButtonElement>(".floor-toggle button"));

  floorBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      floorBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const raw = btn.dataset.floor!;
      const f: FloorView = raw === "both" ? "both" : (Number(raw) as 1 | 2);
      viewer.setActiveFloor(f);
    });
  });

  recenter.addEventListener("click", () => viewer.recenter());

  goBtn.addEventListener("click", () => runRoute());
  toInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runRoute(); });
  fromInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runRoute(); });

  function resolveId(raw: string): string | null {
    const v = raw.trim();
    if (!v) return null;
    if (scene.rooms.has(v)) return v;
    if (v.startsWith("parking.") && scene.parking.has(v.slice("parking.".length))) {
      return v; // node id for parking is "parking.<name>"
    }
    if (scene.parking.has(v)) return `parking.${v}`;
    return null;
  }

  function shake(el: HTMLElement): void {
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }

  function runRoute(): void {
    const toRaw = toInput.value;
    const toId = resolveId(toRaw);
    if (!toId || !scene.rooms.has(toId)) {
      shake(toInput);
      toast(`Room ${toRaw || "?"} not found`);
      return;
    }

    const fromRaw = fromInput.value.trim();
    if (!fromRaw) {
      const rec = recommendParking(graph, scene, toId);
      if (!rec) { toast("No route available — check graph.json"); return; }
      viewer.drawRoute(rec.path.map((n) => n.position));
      result.textContent = `Park at ${formatLot(rec.lot)} — ${Math.round(rec.distance)} m walk`;
      return;
    }

    const fromId = resolveId(fromRaw);
    if (!fromId) { shake(fromInput); toast(`"${fromRaw}" not found`); return; }
    const path = findPath(graph, fromId, toId);
    if (!path) { toast("No route available — check graph.json"); return; }
    viewer.drawRoute(path.map((n) => n.position));
    let total = 0;
    for (let i = 1; i < path.length; i++) total += path[i].position.distanceTo(path[i - 1].position);
    result.textContent = `Route: ${prettyId(fromId)} → ${prettyId(toId)}, ${Math.round(total)} m`;
  }
}

function formatLot(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1) + " Lot";
}

function prettyId(id: string): string {
  return id.startsWith("parking.") ? formatLot(id.slice("parking.".length)) : id;
}

let toastTimer: number | undefined;
export function toast(msg: string): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2500);
}

export function mountUIDeps(panel: HTMLElement, scene: LoadedScene, viewer: Viewer): void {
  const graph = buildGraph(scene);
  mountUI(panel, { scene, graph, viewer });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui.ts
git commit -m "feat: UI panel with autocomplete, floor toggle, route trigger"
```

---

## Task 7: Bootstrap (`main.ts`)

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace `src/main.ts`**

```ts
import { loadScene } from "./loader";
import { Viewer } from "./viewer";
import { mountUIDeps, toast } from "./ui";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const panel = document.getElementById("panel") as HTMLElement;
const errorOverlay = document.getElementById("error-overlay") as HTMLElement;

const debug = new URLSearchParams(location.search).has("debug");

async function boot() {
  const viewer = new Viewer(canvas);
  try {
    const scene = await loadScene("./school.glb", "./graph.json");
    viewer.attachModel(scene);
    if (debug) viewer.enableDebug(scene);
    mountUIDeps(panel, scene, viewer);
    if (scene.edges.length === 0) toast("graph.json has no edges — routing disabled");
  } catch (err) {
    errorOverlay.hidden = false;
    errorOverlay.innerHTML = `
      <h2>Failed to load campus data</h2>
      <p>${(err as Error).message}</p>
      <button onclick="location.reload()">Reload</button>
    `;
  }
}

boot();
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: bootstrap loader, viewer, UI with error overlay"
```

---

## Task 8: Placeholder Assets and Manual Smoke Test

**Files:**
- Create: `public/graph.json`
- (User-supplied later: `public/school.glb`)

- [ ] **Step 1: Create a placeholder `public/graph.json`**

```json
{ "edges": [] }
```

- [ ] **Step 2: Document expected assets**

Append to a new file `public/README.md`:
```markdown
# Runtime assets

- `school.glb` — exported from Blender. Must include named `Empty` objects:
  - `room.<number>.<floor>` (e.g. `room.204.2`)
  - `parking.<name>.entrance`
  - `node.<id>` for hallway waypoints
  - `stair.<id>.<floor>` paired across floors
- `graph.json` — `{ "edges": [["node.a","node.b"], ...] }`. Rooms and parking entrances auto-connect to nearest waypoint at load time.

Open the app with `?debug=1` to see waypoints rendered as colored spheres.
```

- [ ] **Step 3: Run dev server for manual smoke**

```bash
npm run dev
```

Expected: server boots on localhost; if no `school.glb` is present yet, the error overlay shows a load failure (this is expected until the user supplies the asset).

Stop the server (Ctrl-C).

- [ ] **Step 4: Run final test suite and typecheck**

```bash
npm test
npx tsc --noEmit
```

Expected: all tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add public/graph.json public/README.md
git commit -m "docs: asset placeholders and authoring README"
```

---

## Acceptance Criteria

- `npm test` passes all six Vitest cases (basic path, two auto-connect tests, stair routing, parking recommendation, disconnected graph).
- `npm run build` succeeds with no TypeScript errors.
- `npm run dev` serves the app. With a valid `school.glb` and populated `graph.json`:
  - Typing a room number into "To" + Go highlights the recommended parking lot and draws a red line from its entrance to the room.
  - Typing rooms into both "From" and "To" draws a red line between them.
  - Cross-floor routes pass through paired stair empties.
  - Camera supports mouse drag (rotate), right-drag/shift-drag (pan), wheel (zoom), and equivalent touch gestures.
  - `?debug=1` overlays colored spheres on all annotated empties.
  - Unknown rooms shake the input and show a toast.
