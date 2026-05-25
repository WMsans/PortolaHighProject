import type { LoadedScene } from "./types";
import type { FloorView, Viewer } from "./viewer";
import { buildGraph, findPath, recommendParking, type Graph } from "./graph";
import { gsap } from "./motion";

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

  function rejectBounce(el: HTMLElement): void {
    gsap.fromTo(
      el,
      { x: -8 },
      { x: 0, duration: 0.55, ease: "back.inOut(4)", overwrite: "auto" }
    );
    el.classList.remove("invalid-flash");
    void el.offsetWidth;
    el.classList.add("invalid-flash");
  }

  function runRoute(): void {
    const toRaw = toInput.value;
    const toId = resolveId(toRaw);
    if (!toId || !scene.rooms.has(toId)) {
      rejectBounce(toInput);
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
    if (!fromId) { rejectBounce(fromInput); toast(`"${fromRaw}" not found`); return; }
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
