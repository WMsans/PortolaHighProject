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
    floorMeshes: { 1: [], 2: [] },
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
