import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { Vector3 } from "three";
import type { Floor, GraphFile, LoadedScene, Node, Stair } from "./types";
import { FLOOR_Z_OFFSET } from "./types";

function parseFloor(token: string): Floor | null {
  if (token === "1") return 1;
  if (token === "2") return 2;
  return null;
}

function classify(name: string): { kind: Node["kind"]; key: string; floor: Floor; stairGroup?: string } | null {
  const parts = name.toLowerCase().split(/[._]/);
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

async function fetchGlbBuffer(glb: string | File | Blob): Promise<ArrayBuffer> {
  if (typeof glb !== "string") return glb.arrayBuffer();
  const r = await fetch(glb);
  if (!r.ok) throw new Error(`Could not load GLB from ${glb} (HTTP ${r.status}). Use the file picker to choose a .glb file.`);
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("text/html")) {
    throw new Error(`No GLB file found at ${glb} — the dev server returned an HTML page. Use the file picker to choose a .glb file.`);
  }
  const buf = await r.arrayBuffer();
  // GLB files start with the magic bytes "glTF" (0x46546C67 little-endian).
  const magic = new DataView(buf).getUint32(0, true);
  if (magic !== 0x46546c67) {
    throw new Error(`File at ${glb} is not a valid .glb (missing glTF magic). Use the file picker to choose a .glb file.`);
  }
  return buf;
}

export async function loadScene(glb: string | File | Blob, graphUrl: string): Promise<LoadedScene> {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
  loader.setDRACOLoader(draco);

  const [gltf, graphResp] = await Promise.all([
    fetchGlbBuffer(glb).then((buf) => loader.parseAsync(buf, "")),
    fetch(graphUrl).then((r) => {
      if (!r.ok) throw new Error(`graph.json HTTP ${r.status}`);
      return r.json() as Promise<GraphFile>;
    }),
  ]);

  const modelRoot = gltf.scene;

  // three.js GLTFLoader runs every node name through PropertyBinding.sanitizeNodeName,
  // which strips `.` `[` `]` `:` `/` — so "Room.301.1" becomes "Room3011" on the Object3D.
  // Recover the original names from the raw glTF JSON, keyed by sanitized form.
  const sanitize = (s: string): string => s.replace(/\s/g, "_").replace(/[\[\].:\/]/g, "");
  const originalByName = new Map<string, string>();
  const nodeDefs = (gltf.parser.json.nodes ?? []) as Array<{ name?: string }>;
  for (const def of nodeDefs) {
    if (def.name) originalByName.set(sanitize(def.name), def.name);
  }

  const rooms = new Map<string, Node>();
  const parking = new Map<string, Node>();
  const waypoints = new Map<string, Node>();
  const stairsByGroup = new Map<string, Node[]>();

  modelRoot.traverse((obj) => {
    if (!obj.name) return;
    const originalName = originalByName.get(obj.name) ?? obj.name;
    const c = classify(originalName);
    if (!c) return;

    const world = new Vector3();
    obj.getWorldPosition(world);
    if (c.floor === 2) world.z += FLOOR_Z_OFFSET;

    const node: Node = { id: c.kind === "room" ? c.key : c.kind === "parking" ? `parking.${c.key}` : originalName, position: world, floor: c.floor, kind: c.kind };

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
