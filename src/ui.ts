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

  function squish(el: HTMLElement): void {
    gsap.fromTo(
      el,
      { scale: 1 },
      {
        keyframes: [
          { scale: 0.92, duration: 0.06 },
          { scale: 1.04, duration: 0.08 },
          { scale: 1.0,  duration: 0.06 },
        ],
        ease: "back.out(2.5)",
        overwrite: "auto",
      }
    );
  }

  function goWave(button: HTMLElement, originX: number, originY: number): void {
    const rect = button.getBoundingClientRect();
    const wave = document.createElement("span");
    wave.className = "go-wave";
    wave.style.left = `${originX - rect.left}px`;
    wave.style.top  = `${originY - rect.top}px`;
    button.appendChild(wave);
    gsap.fromTo(
      wave,
      { scale: 0, opacity: 0.4 },
      { scale: 2.5, opacity: 0, duration: 0.42, ease: "power2.out", onComplete: () => wave.remove() }
    );
  }

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

  attachFocusGlow(fromInput);
  attachFocusGlow(toInput);

  floorBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      floorBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const raw = btn.dataset.floor!;
      const f: FloorView = raw === "both" ? "both" : (Number(raw) as 1 | 2);
      viewer.setActiveFloor(f);
    });
  });

  recenter.addEventListener("click", () => {
    squish(recenter);
    viewer.recenter();
  });

  goBtn.addEventListener("click", (e) => {
    squish(goBtn);
    goWave(goBtn, e.clientX, e.clientY);
    runRoute();
  });
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

  function attachFocusGlow(input: HTMLInputElement): void {
    input.addEventListener("focus", () => {
      const glow = document.createElement("span");
      glow.className = "focus-glow";
      input.parentElement!.appendChild(glow);
      const r = input.getBoundingClientRect();
      const pr = input.parentElement!.getBoundingClientRect();
      glow.style.left = `${r.left - pr.left}px`;
      glow.style.top  = `${r.top  - pr.top}px`;
      glow.style.width  = `${r.width}px`;
      glow.style.height = `${r.height}px`;
      gsap.fromTo(
        glow,
        { scale: 0.6, opacity: 0 },
        { scale: 1, opacity: 0.5, duration: 0.22, ease: "power2.out",
          onComplete: () => gsap.to(glow, { opacity: 0, duration: 0.26, onComplete: () => glow.remove() }) }
      );
    });
  }

  function showResolveTick(input: HTMLInputElement): void {
    const tick = document.createElement("span");
    tick.className = "resolve-tick";
    tick.textContent = "\u2713";
    input.parentElement!.appendChild(tick);
    const r = input.getBoundingClientRect();
    const pr = input.parentElement!.getBoundingClientRect();
    tick.style.left = `${r.right - pr.left - 22}px`;
    tick.style.top  = `${r.top   - pr.top + 8}px`;
    gsap.fromTo(
      tick,
      { scale: 0, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.18, ease: "back.out(2.5)",
        onComplete: () => gsap.to(tick, { opacity: 0, duration: 0.2, delay: 0.4, onComplete: () => tick.remove() }) }
    );
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
      showResolveTick(toInput);
      result.textContent = `Park at ${formatLot(rec.lot)} — ${Math.round(rec.distance)} m walk`;
      return;
    }

    const fromId = resolveId(fromRaw);
    if (!fromId) { rejectBounce(fromInput); toast(`"${fromRaw}" not found`); return; }
    const path = findPath(graph, fromId, toId);
    if (!path) { toast("No route available — check graph.json"); return; }
    viewer.drawRoute(path.map((n) => n.position));
    showResolveTick(toInput);
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

let toastTl: gsap.core.Timeline | null = null;

export function toast(msg: string): void {
  const el = document.getElementById("toast");
  if (!el) return;

  if (toastTl?.isActive()) {
    el.textContent = msg;
    gsap.fromTo(el, { scale: 0.95 }, { scale: 1.02, yoyo: true, repeat: 1, duration: 0.12, ease: "power1.inOut" });
    toastTl.kill();
  }

  el.textContent = msg;
  toastTl = gsap.timeline()
    .set(el, { opacity: 0, y: 20, scale: 0.96 })
    .to(el,  { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "back.out(2)" })
    .to(el,  { opacity: 1, duration: 2.0 }, ">")
    .to(el,  { opacity: 0, y: 20, duration: 0.2, ease: "power2.in" });
}

export function mountUIDeps(panel: HTMLElement, scene: LoadedScene, viewer: Viewer): void {
  const graph = buildGraph(scene);
  mountUI(panel, { scene, graph, viewer });
}
