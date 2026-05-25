import { describe, it, expect } from "vitest";
import { Mesh, BoxGeometry, MeshBasicMaterial, Group } from "three";
import { classifyMeshesByFloor } from "../src/loader";

function makeMeshAt(z: number): Mesh {
  const m = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
  m.position.set(0, 0, z);
  return m;
}

describe("classifyMeshesByFloor", () => {
  it("splits meshes by centroid Z around the floor offset", () => {
    const root = new Group();
    const lo = makeMeshAt(0);
    const hi = makeMeshAt(5);
    root.add(lo, hi);
    const groups = classifyMeshesByFloor(root);
    expect(groups[1]).toContain(lo);
    expect(groups[2]).toContain(hi);
    expect(groups[1]).not.toContain(hi);
    expect(groups[2]).not.toContain(lo);
  });

  it("treats meshes exactly at the split threshold as floor 1", () => {
    const root = new Group();
    const edge = makeMeshAt(2); // FLOOR_Z_OFFSET / 2 = 2
    root.add(edge);
    expect(classifyMeshesByFloor(root)[1]).toContain(edge);
  });
});
