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
