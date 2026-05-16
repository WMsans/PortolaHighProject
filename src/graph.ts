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
