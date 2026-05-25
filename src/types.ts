import type { Object3D, Vector3 } from "three";

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
  modelRoot: Object3D;
  rooms: Map<string, Node>;     // "204" -> Node
  parking: Map<string, Node>;   // "north" -> Node
  waypoints: Map<string, Node>; // "node.12" -> Node
  stairs: Stair[];
  edges: Edge[];
  floorMeshes: { 1: Object3D[]; 2: Object3D[] };
}

export interface GraphFile {
  edges: Edge[];
}

export const FLOOR_Z_OFFSET = 4; // metres; lifts floor-2 nodes
