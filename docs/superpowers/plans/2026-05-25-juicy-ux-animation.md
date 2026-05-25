# Juicy UX & Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current minimal-motion UX with a springy, GSAP-driven experience. Hero moment is Go → route reveal; supporting big moments are boot intro and floor switch; everything else gets microinteraction polish; the scene is alive with ambient motion when idle.

**Architecture:** GSAP timelines own all motion. Tokens live in `src/motion.ts`. Two big choreographies (hero, boot) live in their own files (`src/route-reveal.ts`, `src/intro.ts`) so each timeline reads top-to-bottom. Scene-level animation primitives extend `src/viewer.ts`; DOM microinteractions extend `src/ui.ts`. A new loader pass classifies meshes by floor (bbox-Z) so the floor-extrude animation has something to grab.

**Tech Stack:** TypeScript, Three.js (existing), Vite, Vitest, GSAP 3 (new, including the free Flip plugin).

**Reference spec:** `docs/superpowers/specs/2026-05-25-juicy-ux-animation-design.md`

---

## Phase 1 — Foundation

### Task 1: Install GSAP and scaffold motion tokens

**Files:**
- Create: `src/motion.ts`
- Create: `tests/motion.test.ts`
- Modify: `package.json` (add dep)

- [ ] **Step 1: Install GSAP**

Run:
```bash
pnpm add gsap@^3.12.0
```

Expected: `gsap` appears under `dependencies` in `package.json`. No peer-dep warnings.

- [ ] **Step 2: Write the failing test for motion tokens**

Create `tests/motion.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DUR, EASE, SPRING } from "../src/motion";

describe("motion tokens", () => {
  it("exposes duration tokens in seconds (GSAP unit)", () => {
    expect(DUR.snap).toBeCloseTo(0.18);
    expect(DUR.pop).toBeCloseTo(0.28);
    expect(DUR.glide).toBeCloseTo(0.7);
    expect(DUR.bootCamera).toBeCloseTo(1.1);
  });

  it("exposes named eases as GSAP-compatible strings", () => {
    expect(EASE.bounceOut).toBe("bounce.out");
    expect(EASE.backOutStrong).toBe("back.out(2)");
    expect(EASE.backOutSubtle).toBe("back.out(1.7)");
    expect(EASE.elasticOut).toBe("elastic.out(1, 0.5)");
    expect(EASE.power3InOut).toBe("power3.inOut");
    expect(EASE.power3Out).toBe("power3.out");
    expect(EASE.sineInOut).toBe("sine.inOut");
  });

  it("exposes spring configs as { duration, ease }", () => {
    expect(SPRING.tight).toEqual({ duration: 0.22, ease: "back.out(2.5)" });
    expect(SPRING.wobble).toEqual({ duration: 0.38, ease: "back.out(1.8)" });
    expect(SPRING.drop).toEqual({ duration: 0.38, ease: "bounce.out" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- motion`
Expected: FAIL — `Cannot find module '../src/motion'`.

- [ ] **Step 4: Create `src/motion.ts`**

```ts
// Centralized motion tokens. Anything bouncy in the codebase imports from here
// so the personality stays consistent.

export const DUR = {
  snap: 0.18,        // tiny taps: button squish, focus ring
  pop: 0.28,         // text changes, toast in
  glide: 0.7,        // camera fits
  bootCamera: 1.1,   // boot intro camera fly-in
  routeDraw: 0.8,    // route line progressive reveal
  pinDrop: 0.38,     // destination pin drop
  floorSwitch: 0.38, // single-floor transition
} as const;

export const EASE = {
  bounceOut: "bounce.out",
  backOutStrong: "back.out(2)",
  backOutSubtle: "back.out(1.7)",
  backOutSharp: "back.out(2.5)",
  backInOut: "back.inOut(4)",
  elasticOut: "elastic.out(1, 0.5)",
  power3InOut: "power3.inOut",
  power3Out: "power3.out",
  power2In: "power2.in",
  power2Out: "power2.out",
  sineInOut: "sine.inOut",
} as const;

export const SPRING = {
  tight:  { duration: 0.22, ease: "back.out(2.5)" },
  wobble: { duration: 0.38, ease: "back.out(1.8)" },
  drop:   { duration: 0.38, ease: "bounce.out" },
} as const;

export type SpringConfig = (typeof SPRING)[keyof typeof SPRING];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- motion`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/motion.ts tests/motion.test.ts
git commit -m "feat: add gsap and motion token module"
```

---

### Task 2: Register GSAP's Flip plugin once at startup

**Files:**
- Modify: `src/motion.ts`

- [ ] **Step 1: Extend `src/motion.ts` with a `registerMotion()` initializer**

Add to the end of `src/motion.ts`:
```ts
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";

let registered = false;

export function registerMotion(): void {
  if (registered) return;
  gsap.registerPlugin(Flip);
  // GSAP's default 0.5s feels too lazy for our taste. Default everything to snap.
  gsap.defaults({ duration: DUR.snap, ease: EASE.backOutSubtle });
  registered = true;
}

export { gsap, Flip };
```

- [ ] **Step 2: Call `registerMotion()` once at app startup**

Modify `src/main.ts` — add an import and call at the top of the file (after the existing imports, before `boot()`):
```ts
import { registerMotion } from "./motion";

registerMotion();
```

- [ ] **Step 3: Verify the app still boots**

Run: `pnpm dev`
Open the browser to the printed URL. Expected: app loads as before; no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/motion.ts src/main.ts
git commit -m "feat: register gsap Flip plugin and global defaults"
```

---

## Phase 2 — DOM microinteractions

### Task 3: Replace `shake` with `rejectBounce`

**Files:**
- Modify: `src/ui.ts` (replace existing `shake` function and its callers)
- Modify: `src/style.css` (remove `.shake` keyframes; add `.invalid-flash`)

- [ ] **Step 1: Replace the `shake` function in `src/ui.ts`**

Find the existing `shake` function (around line 77-81) and replace it with:
```ts
import { gsap } from "./motion";

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
```

Then rename every call site in `src/ui.ts` from `shake(` to `rejectBounce(`.

- [ ] **Step 2: Replace the `.shake` block in `src/style.css`**

Delete the existing `.shake` rule and `@keyframes shake` block. Add:
```css
.invalid-flash { animation: invalid-flash 0.6s ease-out; }
@keyframes invalid-flash {
  0%   { box-shadow: 0 0 0 2px rgba(231, 76, 60, 0.6); border-color: #e74c3c; }
  100% { box-shadow: 0 0 0 0 rgba(231, 76, 60, 0); border-color: #ccc; }
}
```

- [ ] **Step 3: Manual QA**

Run: `pnpm dev`. In the browser, type a bogus room number (e.g. `zzz`) into the To input and press Enter. Expected: input wobbles with a springy bounce and a red border flash that decays.

- [ ] **Step 4: Commit**

```bash
git add src/ui.ts src/style.css
git commit -m "feat: replace shake with springy rejectBounce"
```

---

### Task 4: Button squish utility + Go button radial wave

**Files:**
- Modify: `src/ui.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Add `squish` and `goWave` helpers in `src/ui.ts`**

Add near the top of `src/ui.ts` (below imports):
```ts
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
```

- [ ] **Step 2: Wire squish + wave into the Go and Recenter handlers**

Find the existing `goBtn.addEventListener("click", () => runRoute())` and replace with:
```ts
goBtn.addEventListener("click", (e) => {
  squish(goBtn);
  goWave(goBtn, e.clientX, e.clientY);
  runRoute();
});
```

Find the existing `recenter.addEventListener("click", () => viewer.recenter())` and replace with:
```ts
recenter.addEventListener("click", () => {
  squish(recenter);
  viewer.recenter();
});
```

- [ ] **Step 3: Add CSS for the wave element and button transform-origin**

Add to `src/style.css`:
```css
#panel button { position: relative; overflow: hidden; transform-origin: center; }
.go-wave {
  position: absolute; width: 12px; height: 12px; border-radius: 50%;
  background: rgba(255,255,255,0.9); pointer-events: none;
  transform-origin: center; translate: -50% -50%;
}
```

- [ ] **Step 4: Manual QA**

Run: `pnpm dev`. Click Go and Recenter. Expected: buttons squish on press. Go also shows a white radial wave rippling out from the click point.

- [ ] **Step 5: Commit**

```bash
git add src/ui.ts src/style.css
git commit -m "feat: button squish utility and Go radial wave"
```

---

### Task 5: Bouncy toast

**Files:**
- Modify: `src/ui.ts` (rewrite the `toast` function)
- Modify: `src/style.css` (remove old toast transition)

- [ ] **Step 1: Rewrite `toast` in `src/ui.ts`**

Replace the existing `toast` function (and the `toastTimer` variable) with:
```ts
let toastTl: gsap.core.Timeline | null = null;

export function toast(msg: string): void {
  const el = document.getElementById("toast");
  if (!el) return;

  // If a toast is currently showing, swap text with a quick squish instead of re-entering.
  if (toastTl?.isActive()) {
    el.textContent = msg;
    gsap.fromTo(el, { scale: 0.95 }, { scale: 1.02, yoyo: true, repeat: 1, duration: 0.12, ease: "power1.inOut" });
    // Reset the auto-dismiss timer by killing the existing exit segment and re-queueing.
    toastTl.kill();
  }

  el.textContent = msg;
  toastTl = gsap.timeline()
    .set(el, { opacity: 0, y: 20, scale: 0.96 })
    .to(el,  { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "back.out(2)" })
    .to(el,  { opacity: 1, duration: 2.0 }, ">") // hold
    .to(el,  { opacity: 0, y: 20, duration: 0.2, ease: "power2.in" });
}
```

- [ ] **Step 2: Strip the old transition from `#toast` in `src/style.css`**

Replace the `#toast` block with:
```css
#toast {
  position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: #2c3e50; color: white; padding: 12px 20px; border-radius: 6px;
  opacity: 0; pointer-events: none; z-index: 20;
}
```
(Remove the `transition: opacity 0.2s;` and the `.show` rule — we now drive opacity from GSAP.)

In `src/ui.ts`, remove any remaining `el.classList.add("show")` / `el.classList.remove("show")` from the old `toast`.

- [ ] **Step 3: Manual QA**

Run: `pnpm dev`. Trigger a toast (e.g. type a bad room number and submit). Expected: toast slides up + scales in with a back-out bounce; holds 2s; slides down. Trigger another while it's showing: text swaps with a small squish, no full re-entrance.

- [ ] **Step 4: Commit**

```bash
git add src/ui.ts src/style.css
git commit -m "feat: bouncy toast with overlap swap"
```

---

### Task 6: Input focus glow + valid-resolve tick

**Files:**
- Modify: `src/ui.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Add focus glow + resolve-tick helpers in `src/ui.ts`**

Below `squish`/`rejectBounce`:
```ts
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
  tick.textContent = "✓";
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
```

- [ ] **Step 2: Wire glow on both inputs and tick into successful `runRoute`**

After the `fromInput` / `toInput` declarations in `mountUI`:
```ts
attachFocusGlow(fromInput);
attachFocusGlow(toInput);
```

Inside `runRoute()`, at the start of the branches where the route was successfully drawn (both the recommend-parking branch and the explicit-from branch), call `showResolveTick(toInput)` immediately after `viewer.drawRoute(...)`.

- [ ] **Step 3: Add CSS**

Add to `src/style.css`:
```css
#panel { position: relative; /* anchor for focus-glow/tick */ }
.focus-glow {
  position: absolute; border-radius: 6px;
  box-shadow: 0 0 0 3px rgba(192, 57, 43, 0.5);
  pointer-events: none; z-index: 1;
}
.resolve-tick {
  position: absolute; color: #27ae60; font-weight: 700; font-size: 16px;
  pointer-events: none; z-index: 2;
}
```

- [ ] **Step 4: Manual QA**

Run: `pnpm dev`. Click into From / To inputs — soft red glow ring pulses out. Submit a valid route — a green ✓ pops in next to the To input and fades.

- [ ] **Step 5: Commit**

```bash
git add src/ui.ts src/style.css
git commit -m "feat: input focus glow and valid-resolve tick"
```

---

### Task 7: Panel hover lift + result text pop-in

**Files:**
- Modify: `src/ui.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Add CSS hover lift**

Add to `src/style.css`:
```css
#panel { transition: transform 0.18s ease-out, box-shadow 0.18s ease-out; }
#panel:hover { transform: translateY(-1px); box-shadow: 0 6px 22px rgba(0,0,0,0.18); }
#panel .result { transform-origin: left center; }
```

- [ ] **Step 2: Add `setResult` helper that animates text changes**

Add inside `mountUI`, after `const result = panel.querySelector...`:
```ts
function setResult(text: string): void {
  if (result.textContent && result.textContent.trim()) {
    gsap.to(result, {
      scale: 0.9, opacity: 0, duration: 0.14, ease: "power2.in",
      onComplete: () => {
        result.textContent = text;
        gsap.fromTo(result, { y: 8, opacity: 0, scale: 0.96 },
                            { y: 0, opacity: 1, scale: 1, duration: 0.28, ease: "back.out(2)" });
      },
    });
  } else {
    result.textContent = text;
    gsap.fromTo(result, { y: 8, opacity: 0, scale: 0.96 },
                        { y: 0, opacity: 1, scale: 1, duration: 0.28, ease: "back.out(2)" });
  }
}
```

Replace both `result.textContent = ...` assignments inside `runRoute` with `setResult(...)`.

- [ ] **Step 3: Manual QA**

Run: `pnpm dev`. Hover the panel — subtle 1px lift, shadow grows. Run two routes back-to-back — second result smoothly swaps in (old scales down/fades, new pops in).

- [ ] **Step 4: Commit**

```bash
git add src/ui.ts src/style.css
git commit -m "feat: panel hover lift and result pop-in"
```

---

### Task 8: FLIP-sliding floor-toggle pill

**Files:**
- Modify: `src/ui.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Restructure the floor toggle to use an absolute pill**

Replace the floor-toggle markup inside the `panel.innerHTML` template with:
```ts
    <div class="floor-toggle" role="tablist">
      <div class="pill"></div>
      <button data-floor="1">1</button>
      <button data-floor="2">2</button>
      <button data-floor="both" class="active">Both</button>
    </div>
```

- [ ] **Step 2: Rewrite the floor button click handler using GSAP Flip**

Replace the `floorBtns.forEach(...)` block with:
```ts
import { Flip } from "./motion";
const pill = panel.querySelector<HTMLDivElement>(".floor-toggle .pill")!;
function positionPill(activeBtn: HTMLButtonElement): void {
  const fr = activeBtn.getBoundingClientRect();
  const pr = activeBtn.parentElement!.getBoundingClientRect();
  pill.style.width  = `${fr.width}px`;
  pill.style.height = `${fr.height}px`;
  pill.style.left   = `${fr.left - pr.left}px`;
  pill.style.top    = `${fr.top  - pr.top}px`;
}
positionPill(floorBtns.find((b) => b.classList.contains("active"))!);

floorBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    squish(btn);
    const state = Flip.getState(pill);
    floorBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    positionPill(btn);
    Flip.from(state, { duration: 0.28, ease: "back.out(1.8)" });

    const raw = btn.dataset.floor!;
    const f: FloorView = raw === "both" ? "both" : (Number(raw) as 1 | 2);
    viewer.setActiveFloor(f);
  });
});
```

- [ ] **Step 3: Update CSS so the pill is the visual highlight**

Replace the `.floor-toggle` block in `src/style.css` with:
```css
#panel .floor-toggle { display: flex; gap: 4px; margin-top: 4px; position: relative; }
#panel .floor-toggle .pill {
  position: absolute; background: #2c3e50; border-radius: 4px;
  z-index: 0; pointer-events: none;
}
#panel .floor-toggle button {
  position: relative; z-index: 1; flex: 1; padding: 6px;
  background: transparent; color: #333; transition: color 0.2s;
}
#panel .floor-toggle button.active { color: white; background: transparent; }
```

- [ ] **Step 4: Manual QA**

Run: `pnpm dev`. Click between Floor 1 / 2 / Both. Expected: the dark pill physically slides between buttons with a back-out spring; text color cross-fades; pressed button squishes.

- [ ] **Step 5: Commit**

```bash
git add src/ui.ts src/style.css
git commit -m "feat: FLIP-sliding floor-toggle pill"
```

---

### Task 9: Error overlay entrance

**Files:**
- Modify: `src/main.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Animate the overlay in `showError`**

In `src/main.ts`, add at the top:
```ts
import { gsap } from "./motion";
```

Replace the body of `showError` so that after `errorOverlay.hidden = false;` the overlay and its inner card animate in. Wrap the inner content in a `.error-card`:
```ts
function showError(message: string, onPick: (file: File) => void) {
  errorOverlay.hidden = false;
  errorOverlay.innerHTML = `
    <div class="error-card">
      <h2>Failed to load campus data</h2>
      <p></p>
      <p style="margin-top:12px">Choose a .glb file from your computer:</p>
      <input type="file" accept=".glb,model/gltf-binary" id="glb-picker" style="margin-top:8px;color:white" />
      <button id="reload-btn">Reload</button>
    </div>
  `;
  errorOverlay.querySelector("p")!.textContent = message;
  errorOverlay.querySelector<HTMLButtonElement>("#reload-btn")!.addEventListener("click", () => location.reload());
  errorOverlay.querySelector<HTMLInputElement>("#glb-picker")!.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) onPick(file);
  });

  gsap.fromTo(errorOverlay, { opacity: 0 }, { opacity: 1, duration: 0.26 });
  gsap.fromTo(
    errorOverlay.querySelector(".error-card")!,
    { scale: 0.85, y: -20, opacity: 0 },
    { scale: 1, y: 0, opacity: 1, duration: 0.36, delay: 0.08, ease: "back.out(1.6)" }
  );
}
```

- [ ] **Step 2: Add `.error-card` styling**

Add to `src/style.css`:
```css
.error-card { display: flex; flex-direction: column; align-items: center; }
```

- [ ] **Step 3: Manual QA**

Run: `pnpm dev?glb=/does-not-exist.glb` (or temporarily break the model path in `boot()`). Expected: black backdrop fades in, card scales/drops in with a back-out bounce.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/style.css
git commit -m "feat: animate error overlay entrance"
```

---

## Phase 3 — Scene primitives (Three.js)

### Task 10: Loader pass — classify GLB meshes by floor

The current GLB has no per-floor mesh tags. We classify each mesh by its bounding-box centroid Z relative to `FLOOR_Z_OFFSET` (= 4 metres). Anything noticeably above floor 1 is floor 2.

**Files:**
- Modify: `src/types.ts` (extend `LoadedScene`)
- Modify: `src/loader.ts` (populate floor mesh groups)
- Create: `tests/loader-floor.test.ts`

- [ ] **Step 1: Extend `LoadedScene` type**

In `src/types.ts`, add to the `LoadedScene` interface:
```ts
floorMeshes: { 1: Object3D[]; 2: Object3D[] };
```
Add `import type { Object3D } from "three";` at the top if not present.

- [ ] **Step 2: Write the failing test**

Create `tests/loader-floor.test.ts`:
```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- loader-floor`
Expected: FAIL — `classifyMeshesByFloor` not exported.

- [ ] **Step 4: Implement `classifyMeshesByFloor` in `src/loader.ts`**

Add at module scope (near `FLOOR_Z_OFFSET` import or below the existing classify helpers):
```ts
import { Box3, Mesh, Object3D, Vector3 } from "three";
import { FLOOR_Z_OFFSET } from "./types";

export function classifyMeshesByFloor(root: Object3D): { 1: Object3D[]; 2: Object3D[] } {
  const groups: { 1: Object3D[]; 2: Object3D[] } = { 1: [], 2: [] };
  const center = new Vector3();
  const threshold = FLOOR_Z_OFFSET / 2;
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    new Box3().setFromObject(obj).getCenter(center);
    if (center.z > threshold) groups[2].push(obj);
    else groups[1].push(obj);
  });
  return groups;
}
```

Then, in the function that builds the final `LoadedScene`, after `modelRoot` is assembled, add:
```ts
const floorMeshes = classifyMeshesByFloor(modelRoot);
```
and include `floorMeshes` in the returned object.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test`
Expected: all tests pass, including the new `loader-floor` ones.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/loader.ts tests/loader-floor.test.ts
git commit -m "feat: classify GLB meshes by floor for animation grouping"
```

---

### Task 11: Viewer — progressive route line draw

Replace the current static `drawRoute` with an animated draw that exposes a `progress` property [0..1] tweenable by GSAP. The route renders the first `progress * totalLength` of the polyline.

**Files:**
- Modify: `src/viewer.ts`

- [ ] **Step 1: Add a `progress` setter that re-uploads geometry**

In `src/viewer.ts`, add fields below the existing `routeMaterial`:
```ts
private routePoints: Vector3[] = [];
private routeTotalLen = 0;
private routeLine: Line2 | null = null;
private routeProgress = 0;
```

Add a private helper:
```ts
private buildPartialPositions(p: number): number[] {
  if (this.routePoints.length < 2) return [];
  const target = this.routeTotalLen * Math.max(0, Math.min(1, p));
  const out: number[] = [];
  out.push(this.routePoints[0].x, this.routePoints[0].y, this.routePoints[0].z);
  let acc = 0;
  for (let i = 1; i < this.routePoints.length; i++) {
    const prev = this.routePoints[i - 1];
    const cur  = this.routePoints[i];
    const seg  = cur.distanceTo(prev);
    if (acc + seg >= target) {
      const t = (target - acc) / seg;
      out.push(prev.x + (cur.x - prev.x) * t,
               prev.y + (cur.y - prev.y) * t,
               prev.z + (cur.z - prev.z) * t);
      return out;
    }
    acc += seg;
    out.push(cur.x, cur.y, cur.z);
  }
  return out;
}

get progress(): number { return this.routeProgress; }
set progress(p: number) {
  this.routeProgress = p;
  if (!this.routeLine) return;
  const pos = this.buildPartialPositions(p);
  if (pos.length < 6) {
    this.routeLine.visible = false;
    return;
  }
  this.routeLine.visible = true;
  this.routeLine.geometry.setPositions(pos);
  this.routeLine.computeLineDistances();
}
```

- [ ] **Step 2: Rewrite `drawRoute` to set up the line at progress 0**

Replace the existing `drawRoute(points)`:
```ts
drawRoute(points: Vector3[]): void {
  this.clearRoute();
  if (points.length < 2) return;
  this.routePoints = points.map((p) => p.clone());
  this.routeTotalLen = 0;
  for (let i = 1; i < points.length; i++) this.routeTotalLen += points[i].distanceTo(points[i - 1]);
  const geo = new LineGeometry();
  geo.setPositions([points[0].x, points[0].y, points[0].z,
                    points[0].x, points[0].y, points[0].z]); // degenerate, will be overwritten on progress set
  const line = new Line2(geo, this.routeMaterial);
  line.computeLineDistances();
  line.renderOrder = ROUTE_RENDER_ORDER;
  this.routeLayer.add(line);
  this.routeLine = line;
  this.progress = 0;
}
```

(Note: this no longer auto-frames the camera; framing now happens in the hero choreography. Remove the `this.frameBounds(...)` call.)

Also clear the cached state in `clearRoute`:
```ts
clearRoute(): void {
  this.routeLayer.children.forEach((child) => {
    if (child instanceof Line2) child.geometry.dispose();
  });
  this.routeLayer.clear();
  this.routePoints = [];
  this.routeLine = null;
  this.routeProgress = 0;
}
```

- [ ] **Step 3: Add `animateRouteDraw` that returns a timeline**

```ts
import { gsap } from "./motion";
import { DUR, EASE } from "./motion";

animateRouteDraw(points: Vector3[]): gsap.core.Timeline {
  this.drawRoute(points);
  const tl = gsap.timeline();
  tl.to(this, { progress: 1, duration: DUR.routeDraw, ease: EASE.sineInOut });
  return tl;
}
```

- [ ] **Step 4: Temporarily wire `animateRouteDraw` into `runRoute`**

In `src/ui.ts`, replace both `viewer.drawRoute(...)` calls inside `runRoute` with `viewer.animateRouteDraw(...)`.

- [ ] **Step 5: Manual QA**

Run: `pnpm dev`. Run a route. Expected: the red line animates outward from the start over ~0.8s instead of appearing all-at-once.

- [ ] **Step 6: Commit**

```bash
git add src/viewer.ts src/ui.ts
git commit -m "feat: progressive route line draw via gsap"
```

---

### Task 12: Viewer — camera tween to fit route

**Files:**
- Modify: `src/viewer.ts`

- [ ] **Step 1: Implement `tweenCameraToFitRoute`**

Add to `Viewer`:
```ts
tweenCameraToFitRoute(points: Vector3[]): gsap.core.Timeline {
  const box = new Box3().setFromPoints(points);
  const center = new Vector3(); box.getCenter(center);
  const size = new Vector3(); box.getSize(size);
  const radius = Math.max(size.x, size.y, size.z, 10) * 1.25; // 25% padding
  const dir = new Vector3(0, 0.6, 1).normalize();
  const targetPos = center.clone().addScaledVector(dir, radius * 2.2);

  // Disable controls during the tween so they don't fight the camera.
  this.controls.enabled = false;
  const tl = gsap.timeline({
    onComplete: () => { this.controls.enabled = true; this.controls.update(); },
  });
  tl.to(this.camera.position, {
    x: targetPos.x, y: targetPos.y, z: targetPos.z,
    duration: DUR.glide, ease: EASE.power3InOut,
  }, 0);
  tl.to(this.controls.target, {
    x: center.x, y: center.y, z: center.z,
    duration: DUR.glide, ease: EASE.power3InOut,
    onUpdate: () => this.controls.update(),
  }, 0);
  return tl;
}
```

- [ ] **Step 2: Manual QA**

Run: `pnpm dev`. From the browser console: `window.viewer = ...` (easiest: set `(window as any).viewer = viewer;` in `main.ts` temporarily). Then call `viewer.tweenCameraToFitRoute([new THREE.Vector3(0,0,0), new THREE.Vector3(20,0,20)])`. Expected: camera smoothly tweens to frame those points over 700ms, then OrbitControls re-engage.

Remove the temporary `window.viewer` debug line before committing.

- [ ] **Step 3: Commit**

```bash
git add src/viewer.ts
git commit -m "feat: camera tween-to-fit-route"
```

---

### Task 13: Viewer — destination pin drop with ripple rings

**Files:**
- Modify: `src/viewer.ts`

- [ ] **Step 1: Add `animatePinDrop`**

Add imports:
```ts
import { CylinderGeometry, RingGeometry, DoubleSide } from "three";
```

Add to `Viewer`:
```ts
private pinMesh: Mesh | null = null;
private ringMeshes: Mesh[] = [];

private clearPin(): void {
  if (this.pinMesh) {
    this.routeLayer.remove(this.pinMesh);
    this.pinMesh.geometry.dispose();
    (this.pinMesh.material as Material).dispose();
    this.pinMesh = null;
  }
  for (const r of this.ringMeshes) {
    this.routeLayer.remove(r);
    r.geometry.dispose();
    (r.material as Material).dispose();
  }
  this.ringMeshes = [];
}

animatePinDrop(position: Vector3): gsap.core.Timeline {
  this.clearPin();
  const pinGeo = new CylinderGeometry(0, 1.5, 4, 16);
  const pinMat = new MeshBasicMaterial({ color: 0xff2222, depthTest: false });
  const pin = new Mesh(pinGeo, pinMat);
  pin.rotation.x = Math.PI; // point down
  pin.position.copy(position).add(new Vector3(0, 0, 12)); // 12 units above target (Z is up in this scene)
  pin.scale.set(0.6, 0.6, 0.6);
  pin.renderOrder = ROUTE_RENDER_ORDER + 1;
  this.routeLayer.add(pin);
  this.pinMesh = pin;

  const tl = gsap.timeline();
  tl.to(pin.position, { z: position.z + 1, duration: DUR.pinDrop, ease: EASE.bounceOut }, 0);
  tl.to(pin.scale,    { x: 1, y: 1, z: 1, duration: DUR.pinDrop, ease: EASE.backOutStrong }, 0);

  for (let i = 0; i < 3; i++) {
    const ringGeo = new RingGeometry(0.5, 0.8, 24);
    const ringMat = new MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.6, side: DoubleSide, depthTest: false });
    const ring = new Mesh(ringGeo, ringMat);
    ring.position.copy(position);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = ROUTE_RENDER_ORDER + 2;
    this.routeLayer.add(ring);
    this.ringMeshes.push(ring);
    tl.fromTo(ring.scale,
      { x: 0.5, y: 0.5, z: 0.5 },
      { x: 4, y: 4, z: 1, duration: 0.7, ease: "power2.out" }, 0.1 + i * 0.12);
    tl.fromTo(ringMat,
      { opacity: 0.6 },
      { opacity: 0, duration: 0.7, ease: "power2.out" }, 0.1 + i * 0.12);
  }
  return tl;
}
```

Call `this.clearPin();` inside `clearRoute()` so pins clear when routes clear.

- [ ] **Step 2: Manual QA**

Run: `pnpm dev`. Temporarily call `viewer.animatePinDrop(new THREE.Vector3(0, 0, 0))` from the console after exposing the viewer. Expected: a red pin falls + squish-lands with three rings rippling outward.

- [ ] **Step 3: Commit**

```bash
git add src/viewer.ts
git commit -m "feat: destination pin drop with ripple rings"
```

---

### Task 14: Viewer — marker pulse along the path

**Files:**
- Modify: `src/viewer.ts`

- [ ] **Step 1: Add `animateMarkerPulse` (operates on debug-layer spheres)**

In `Viewer`:
```ts
animateMarkerPulse(positions: Vector3[]): gsap.core.Timeline {
  // We synthesize pulse "halos" at each waypoint — independent of debug spheres so
  // the hero looks the same with debug off.
  const tl = gsap.timeline();
  positions.forEach((pos, i) => {
    const geo = new RingGeometry(0.8, 1.1, 18);
    const mat = new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, side: DoubleSide, depthTest: false });
    const halo = new Mesh(geo, mat);
    halo.position.copy(pos);
    halo.rotation.x = -Math.PI / 2;
    halo.renderOrder = ROUTE_RENDER_ORDER + 3;
    this.routeLayer.add(halo);
    tl.fromTo(halo.scale,
      { x: 0.5, y: 0.5, z: 0.5 },
      { x: 1.4, y: 1.4, z: 1.4, duration: 0.36, ease: EASE.elasticOut }, i * 0.06);
    tl.fromTo(mat,
      { opacity: 0.85 },
      { opacity: 0, duration: 0.36, ease: "power2.out",
        onComplete: () => { this.routeLayer.remove(halo); geo.dispose(); mat.dispose(); } }, i * 0.06);
  });
  return tl;
}
```

- [ ] **Step 2: Manual QA**

Run: `pnpm dev`. Temporarily call `viewer.animateMarkerPulse([new THREE.Vector3(0,0,0), new THREE.Vector3(8,0,0), new THREE.Vector3(16,0,0)])`. Expected: yellow rings ping outward in stagger from each point.

- [ ] **Step 3: Commit**

```bash
git add src/viewer.ts
git commit -m "feat: waypoint marker pulse animation"
```

---

## Phase 4 — Hero choreography

### Task 15: `route-reveal.ts` master timeline

**Files:**
- Create: `src/route-reveal.ts`
- Modify: `src/ui.ts` (replace `viewer.drawRoute` / `viewer.animateRouteDraw` calls inside `runRoute` with `playRouteReveal`)

- [ ] **Step 1: Create `src/route-reveal.ts`**

```ts
import { Vector3 } from "three";
import { gsap, DUR, EASE } from "./motion";
import type { Viewer } from "./viewer";

let currentTl: gsap.core.Timeline | null = null;

export function playRouteReveal(viewer: Viewer, points: Vector3[]): gsap.core.Timeline {
  // Interruption: kill any in-flight reveal cleanly.
  currentTl?.kill();
  viewer.clearRoute();

  const master = gsap.timeline();

  // t=0.10  Camera tween to fit route (panel squish already fired in the click handler)
  master.add(viewer.tweenCameraToFitRoute(points), 0.10);

  // t=0.35  Route draws (overlaps the tail of the camera tween for snappier feel)
  master.add(viewer.animateRouteDraw(points), 0.35);

  // t=0.55  Waypoint pulses
  master.add(viewer.animateMarkerPulse(points), 0.55);

  // t=1.10  Pin drop at destination
  master.add(viewer.animatePinDrop(points[points.length - 1]), 1.10);

  currentTl = master;
  return master;
}
```

- [ ] **Step 2: Use `playRouteReveal` from `src/ui.ts`**

Remove the previous `viewer.animateRouteDraw(...)` calls inside `runRoute` and replace with `playRouteReveal(viewer, ...)`.

```ts
import { playRouteReveal } from "./route-reveal";
```

In each successful branch:
```ts
playRouteReveal(viewer, rec.path.map((n) => n.position));
setResult(`Park at ${formatLot(rec.lot)} — ${Math.round(rec.distance)} m walk`);
showResolveTick(toInput);
```
(and similarly in the explicit-from branch with `path.map((n) => n.position)`)

The result text pop-in is already deferred by `setResult`; for it to land at t≈1.25 inside the choreography, wrap the `setResult(...)` and `showResolveTick(toInput)` calls in `gsap.delayedCall(1.25, () => { setResult(...); showResolveTick(toInput); })`.

- [ ] **Step 3: Manual QA — the hero moment**

Run: `pnpm dev`. Type a valid room number (e.g. `204`). Press Go. Expected sequence:
1. Go button squishes + white wave ripples.
2. Camera glides to fit the route (~0.7s).
3. Red route line draws from start to end (~0.8s).
4. Yellow halos ping at each waypoint in stagger.
5. Red pin drops at the destination with bouncy squish; 3 ripple rings.
6. Result text pops in.
7. User can interact (OrbitControls re-enabled).

Press Go again mid-reveal: previous reveal cancels cleanly, new one starts fresh. No leftover pins/rings.

- [ ] **Step 4: Commit**

```bash
git add src/route-reveal.ts src/ui.ts
git commit -m "feat: hero route-reveal master timeline"
```

---

## Phase 5 — Floor switch

### Task 16: Viewer — `extrudeFloor`

**Files:**
- Modify: `src/viewer.ts`

- [ ] **Step 1: Track loaded floor groups on the viewer**

In `Viewer`, add a field:
```ts
private floorGroups: { 1: Object3D[]; 2: Object3D[] } | null = null;
private currentFloor: FloorView = "both";
```

Modify `attachModel(loaded)` to store the groups:
```ts
attachModel(loaded: LoadedScene): void {
  this.scene.add(loaded.modelRoot);
  this.floorGroups = loaded.floorMeshes;
  // ... existing bounds + recenter logic ...
}
```

Add `import type { Object3D } from "three";` if missing.

- [ ] **Step 2: Implement `extrudeFloor`**

```ts
private floorTl: gsap.core.Timeline | null = null;

setActiveFloor(floor: FloorView): void {
  this.extrudeFloor(floor);
}

extrudeFloor(target: FloorView): gsap.core.Timeline {
  this.floorTl?.kill();
  const groups = this.floorGroups;
  const tl = gsap.timeline();
  if (!groups) { this.floorTl = tl; return tl; }

  const showFloor = (meshes: Object3D[], show: boolean) => {
    meshes.forEach((m) => {
      // Find first child Mesh material if needed
      const material = (m as Mesh).material as Material | undefined;
      if (material) {
        material.transparent = true;
        tl.to(material, { opacity: show ? 1 : 0, duration: DUR.floorSwitch, ease: EASE.power3InOut,
          onComplete: () => { if (show) material.transparent = false; } }, 0.05);
      }
      tl.to(m.position, {
        z: show ? (m.userData.origZ ?? m.position.z) : (m.userData.origZ ?? m.position.z) + 8,
        duration: DUR.floorSwitch, ease: show ? EASE.backOutSubtle : EASE.power2In,
      }, 0.05);
    });
  };

  // Capture original z once
  for (const list of [groups[1], groups[2]]) for (const m of list) {
    if (m.userData.origZ === undefined) m.userData.origZ = m.position.z;
  }

  const want1 = target === 1 || target === "both";
  const want2 = target === 2 || target === "both";
  showFloor(groups[1], want1);
  showFloor(groups[2], want2);
  this.currentFloor = target;
  this.floorTl = tl;
  return tl;
}
```

- [ ] **Step 3: Manual QA**

Run: `pnpm dev`. Click Floor 1: floor 2 lifts and fades out, floor 1 stays. Click Both: floor 2 drops back into place. Click Floor 2: floor 1 lifts out. Re-click rapidly: animations interrupt cleanly, no state drift.

- [ ] **Step 4: Commit**

```bash
git add src/viewer.ts
git commit -m "feat: animated floor extrude/collapse"
```

---

## Phase 6 — Boot intro

### Task 17: Viewer — `playBootIntro`

**Files:**
- Modify: `src/viewer.ts`

- [ ] **Step 1: Implement `playBootIntro`**

In `Viewer`:
```ts
playBootIntro(loaded: LoadedScene): gsap.core.Timeline {
  this.controls.enabled = false;

  // Camera starts far + high
  const startPos = this.defaultCameraPos.clone().multiplyScalar(3);
  startPos.y *= 1.4;
  this.camera.position.copy(startPos);
  this.controls.target.copy(this.defaultTarget);
  this.controls.update();

  // Buildings: stash original scale.y, set to 0
  const allMeshes = [...loaded.floorMeshes[1], ...loaded.floorMeshes[2]];
  allMeshes.forEach((m) => {
    m.userData.origScaleY = m.scale.y;
    m.scale.y = 0;
  });

  const tl = gsap.timeline({
    onComplete: () => { this.controls.enabled = true; this.controls.update(); },
  });

  // Camera fly-in
  tl.to(this.camera.position, {
    x: this.defaultCameraPos.x, y: this.defaultCameraPos.y, z: this.defaultCameraPos.z,
    duration: DUR.bootCamera, ease: EASE.power3Out, onUpdate: () => this.controls.update(),
  }, 0);

  // Buildings rise — floor 1 first, then floor 2 with extra offset
  loaded.floorMeshes[1].forEach((m, i) => {
    tl.to(m.scale, { y: m.userData.origScaleY, duration: 0.5, ease: "back.out(2.2)" }, 0.2 + i * 0.04);
  });
  loaded.floorMeshes[2].forEach((m, i) => {
    tl.to(m.scale, { y: m.userData.origScaleY, duration: 0.5, ease: "back.out(2.2)" }, 0.26 + i * 0.04);
  });

  return tl;
}
```

(Floor-2 stagger starts +60ms after floor-1 — `0.26` vs `0.20`.)

- [ ] **Step 2: Manual QA (called from main shortly)**

(Visual verification happens in Task 18 after wiring into `intro.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/viewer.ts
git commit -m "feat: viewer playBootIntro (camera fly-in + building rise)"
```

---

### Task 18: `intro.ts` master timeline + curtain DOM

**Files:**
- Create: `src/intro.ts`
- Modify: `index.html` (add `#boot-curtain` element)
- Modify: `src/style.css` (curtain styling)
- Modify: `src/main.ts` (use `playIntro` instead of mounting UI directly)

- [ ] **Step 1: Add the curtain to `index.html`**

Inside `<div id="app">`, before `<div id="panel"></div>`:
```html
<div id="boot-curtain">
  <span id="boot-wordmark">Portola Wayfinder</span>
</div>
```

- [ ] **Step 2: Add curtain CSS**

Append to `src/style.css`:
```css
#boot-curtain {
  position: absolute; inset: 0; z-index: 50;
  background: #000;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
#boot-wordmark {
  color: white; font-size: 36px; font-weight: 700; letter-spacing: 0.04em;
  opacity: 0;
}
```

- [ ] **Step 3: Create `src/intro.ts`**

```ts
import { gsap, DUR, EASE } from "./motion";
import type { Viewer } from "./viewer";
import type { LoadedScene } from "./types";

export function playIntro(viewer: Viewer, scene: LoadedScene, panel: HTMLElement): gsap.core.Timeline {
  const curtain  = document.getElementById("boot-curtain")!;
  const wordmark = document.getElementById("boot-wordmark")!;

  const tl = gsap.timeline();

  // Wordmark in
  tl.fromTo(wordmark, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.24 }, 0);

  // Wordmark holds, then out
  tl.to(wordmark, { opacity: 0, scale: 1.08, duration: 0.18, ease: EASE.power2In }, 0.5);

  // Curtain fades to reveal scene
  tl.to(curtain, { opacity: 0, duration: 0.3, onComplete: () => { curtain.style.display = "none"; } }, 0.5);

  // Camera + buildings
  tl.add(viewer.playBootIntro(scene), 0.7);

  // Panel slide-up
  panel.style.opacity = "0";
  panel.style.transform = "translateY(60px)";
  tl.to(panel, { opacity: 1, y: 0, duration: 0.36, ease: EASE.backOutSubtle }, 1.8);

  // Stagger inner panel elements
  const innerEls = panel.querySelectorAll<HTMLElement>("label, input, button, .floor-toggle, .result");
  tl.fromTo(innerEls, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.22, stagger: 0.04, ease: EASE.backOutSubtle }, 1.85);

  return tl;
}
```

- [ ] **Step 4: Call `playIntro` from `src/main.ts`**

After `mountUIDeps(panel, scene, viewer);` inside `boot()`, add:
```ts
import { playIntro } from "./intro";
// ...
playIntro(viewer, scene, panel);
```

- [ ] **Step 5: Manual QA**

Run: `pnpm dev`. Hard reload. Expected sequence:
1. Black screen with "Portola Wayfinder" wordmark fading in.
2. Wordmark holds, fades out as curtain dissolves.
3. Camera flies in from high/far to default orbit position.
4. Building meshes rise from y=0 with springy stagger.
5. Panel slides up from bottom-left; inner controls stagger-fade in.
6. User can interact at ~2.2s.

- [ ] **Step 6: Commit**

```bash
git add index.html src/style.css src/intro.ts src/main.ts
git commit -m "feat: cinematic boot intro choreography"
```

---

### Task 19: Boot skip — any input within 2.2s ends boot

**Files:**
- Modify: `src/intro.ts`

- [ ] **Step 1: Skip handler**

At the bottom of `playIntro`, before `return tl`:
```ts
const skip = () => {
  if (!tl.isActive()) return;
  tl.progress(1, false); // snap to end
};
window.addEventListener("pointerdown", skip, { once: true });
window.addEventListener("keydown",     skip, { once: true });
tl.eventCallback("onComplete", () => {
  window.removeEventListener("pointerdown", skip);
  window.removeEventListener("keydown", skip);
});
```

- [ ] **Step 2: Manual QA**

Run: `pnpm dev`. Hard reload, then immediately click anywhere or press a key. Expected: intro snaps to end state instantly; panel and scene are interactive.

- [ ] **Step 3: Commit**

```bash
git add src/intro.ts
git commit -m "feat: skip boot intro on first user input"
```

---

## Phase 7 — Ambient life

### Task 20: Idle camera drift, marker breathing, destination beacon

**Files:**
- Modify: `src/viewer.ts`

- [ ] **Step 1: Idle drift via OrbitControls.autoRotate**

In `Viewer` constructor (right after the existing OrbitControls setup):
```ts
this.controls.autoRotate = false;
this.controls.autoRotateSpeed = 0.15; // rad/s
let idleTimer = 0;
const armIdle = () => {
  this.controls.autoRotate = false;
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => { this.controls.autoRotate = true; }, 8000);
};
armIdle();
this.controls.addEventListener("start", armIdle);
window.addEventListener("pointerdown", armIdle);
window.addEventListener("keydown",     armIdle);
```

(Cleanup is handled by `dispose()` removing the controls; that's good enough — `setTimeout` is harmless on unload.)

- [ ] **Step 2: Marker breathing — start when route is drawn**

In `Viewer`, add fields:
```ts
private breathingHalos: { mesh: Mesh; tween: gsap.core.Tween }[] = [];
```

After `drawRoute(points)` sets up the line, add halos:
```ts
points.forEach((p, i) => {
  const geo = new RingGeometry(0.7, 0.95, 18);
  const mat = new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.5, side: DoubleSide, depthTest: false });
  const halo = new Mesh(geo, mat);
  halo.position.copy(p);
  halo.rotation.x = -Math.PI / 2;
  halo.renderOrder = ROUTE_RENDER_ORDER;
  this.routeLayer.add(halo);
  // Phase-offset breathing so they don't sync.
  const phase = (i * 0.37) % 1;
  const tween = gsap.to([halo.scale, mat], {
    keyframes: [{ x: 1.08, y: 1.08, opacity: 0.9, duration: 1.2 },
                { x: 1.0,  y: 1.0,  opacity: 0.5, duration: 1.2 }],
    repeat: -1, ease: "sine.inOut", delay: -phase * 2.4,
  });
  this.breathingHalos.push({ mesh: halo, tween });
});
```

In `clearRoute`, also clean up halos:
```ts
for (const h of this.breathingHalos) {
  h.tween.kill();
  this.routeLayer.remove(h.mesh);
  h.mesh.geometry.dispose();
  (h.mesh.material as Material).dispose();
}
this.breathingHalos = [];
```

- [ ] **Step 3: Destination beacon — extend `animatePinDrop`**

At the end of `animatePinDrop`, after the master timeline is built, add a sustained pulse on `this.pinMesh` once it has landed:
```ts
tl.eventCallback("onComplete", () => {
  if (!this.pinMesh) return;
  gsap.to(this.pinMesh.scale, {
    x: 1.15, y: 1.15, z: 1.15,
    yoyo: true, repeat: -1, duration: 0.5, ease: EASE.elasticOut,
  });
});
```

The infinite tween will be killed when `clearPin` disposes the mesh — but `gsap.to` keeps references to the target. Switch to using `gsap.killTweensOf(this.pinMesh.scale)` inside `clearPin` before disposing:
```ts
if (this.pinMesh) {
  gsap.killTweensOf(this.pinMesh.scale);
  // ... rest of clearPin
}
```

- [ ] **Step 4: Sun drift — slowly orbit the directional light**

Locate where the directional light is created in `Viewer` constructor (currently `const sun = new DirectionalLight(0xffffff, 2.5); sun.position.set(100, -100, 200);`). Promote `sun` to a private field `private sun: DirectionalLight;` and assign it there. Then add at the end of the constructor:
```ts
gsap.to(this.sun.position, {
  keyframes: [
    { x: 100, z: 200, duration: 30 },
    { x: -60, z: 220, duration: 30 },
    { x: 100, z: 200, duration: 0 }, // wrap
  ],
  repeat: -1, ease: "sine.inOut",
});
```

(No shadow maps are enabled in this app, so the per-frame cost is just a position update — well under the 1 ms/frame budget. If `castShadow` ever turns on, revisit per the spec's perf note.)

- [ ] **Step 5: Manual QA**

Run: `pnpm dev`. Run a route. Expected: waypoint halos breathe softly out of phase; destination pin pulses noticeably stronger; if you walk away from input for 8 seconds, the camera begins slowly orbiting; touching anything stops it instantly. Watch shadowed building faces over ~30s — lighting shifts subtly.

- [ ] **Step 6: Commit**

```bash
git add src/viewer.ts
git commit -m "feat: ambient marker breathing, destination beacon, idle drift, sun drift"
```

---

## Phase 8 — Polish & verification

### Task 21: End-to-end manual QA pass

- [ ] **Step 1: Run the full app and walk every motion**

Run: `pnpm dev`. With a fresh page reload, verify the following checklist by watching:

- [ ] Boot intro plays cleanly: wordmark → curtain dissolve → camera fly-in → buildings spring up (floor 1 then floor 2) → panel + controls stagger.
- [ ] First user click during boot skips to end state instantly.
- [ ] Floor button toggle: pill physically slides; floors lift/drop with bounce; markers don't ghost.
- [ ] Type bogus room number → input wobbles + red flash + bouncy toast.
- [ ] Type valid room number, press Go → squish + wave; camera fits; line draws; halos pulse in stagger; pin drops with rings; result text pops; resolve tick.
- [ ] After route drawn: ambient breathing on waypoint halos, stronger beacon on pin.
- [ ] Press Go on a new route mid-reveal: previous reveal cleans up; no orphan pins/rings.
- [ ] Hover panel: subtle lift. Recenter: squish + camera homes.
- [ ] Leave app idle 8s: camera autoRotates. Touch input: stops.
- [ ] Resize window: nothing breaks; no animation jank.

- [ ] **Step 2: Run the test suite**

Run: `pnpm test`
Expected: all tests pass (motion tokens, loader floor classification, existing graph tests).

- [ ] **Step 3: Type-check**

Run: `pnpm build`
Expected: TypeScript compiles cleanly; Vite builds with no errors.

- [ ] **Step 4: Commit checklist results**

If the checklist surfaces a regression, fix it in a small follow-up commit before declaring done. Otherwise:
```bash
git commit --allow-empty -m "chore: full QA pass for juicy animation pass"
```

---

## Out of scope (for reference)

Per spec — these are explicitly NOT in this plan:
- `prefers-reduced-motion` honoring.
- Cinematic dolly camera during route reveal.
- "Fly the route" follow-up button.
- Any new UI features beyond the existing From/To/Floor/Go/Recenter flow.

## Notes on testing philosophy

WebGL animation is not testable in jsdom — no canvas, no GPU. Visual feel is verified manually. We unit-test:
- `motion.ts` token values (Task 1)
- `loader.classifyMeshesByFloor` (Task 10)

We deliberately do **not** test GSAP timeline orchestration. Mocking GSAP defeats the purpose; the timelines are short and read top-to-bottom. Visual review is the right verification surface for choreography.
