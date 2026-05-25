# Juicy UX & Animation Design

**Date:** 2026-05-25
**Status:** Approved for planning

## Goal

Transform the Portola Wayfinder from a functional 3D map into an app whose identity is *motion*. Every interaction should feel springy, intentional, and alive. The hero moment — pressing Go and watching the route reveal — is the show-stopper; everything else (boot intro, floor switch, microinteractions, ambient world life) supports it without competing.

## Decisions

- **Motion personality:** Springy & Bouncy — overshoot, squish, playful eases (Pixar-school).
- **Hero moment:** Press Go → route reveal.
- **Camera behavior during hero:** Auto fit-to-route, then hold (no cinematic dolly; user retains control after fit).
- **Supporting moments:** Boot intro big, floor switch big.
- **Reduced motion:** Not honored — same experience for every user.
- **Animation library:** GSAP (~24 kB), including the Flip plugin (free) for the floor-toggle pill.

## Architecture

One new dependency (`gsap`) plus a small module reshuffle. Motion concerns live in dedicated modules so the rest of the codebase stays uncluttered.

### Modules

- **`src/motion.ts`** *(new)* — single source of truth for timing tokens, eases, and reusable spring factories. Anything bouncy imports from here so the personality stays consistent.
  - Exports: `DUR` (snap, glide, hold), `EASE` (bounceOut, backOut, elasticOut, etc.), `spring.tight`, `spring.wobble`.

- **`src/viewer.ts`** *(extended)* — gains scene-level animation methods that own the camera and Three.js objects. Each returns a GSAP timeline so callers can chain.
  - `tweenCameraToFitRoute(points)`
  - `animateRouteDraw(points)`
  - `animatePinDrop(position)`
  - `animateMarkerPulse(id)`
  - `extrudeFloor(floor)`
  - `playBootIntro()`
  - `startAmbient()` / `stopAmbient()` (idle drift, marker breathing, sun drift, destination beacon)

- **`src/ui.ts`** *(extended)* — DOM motion next to the elements it touches.
  - `squish(button)`, `glowFocus(input)`, `staggerEntrance(panel)`, `rejectBounce(input)` (replaces current `shake`), `bouncyToast(msg)`, `flipFloorPill(from, to)`.

- **`src/route-reveal.ts`** *(new)* — hero choreography. ~40–60 lines. Pulls a master GSAP timeline that orchestrates `ui.squish(goBtn)` → `viewer.tweenCameraToFitRoute` → `viewer.animateRouteDraw` → marker pulses → `viewer.animatePinDrop` → `ui.resultPopIn`.

- **`src/intro.ts`** *(new)* — boot-up choreography. Master GSAP timeline coordinating `viewer.playBootIntro` with `ui.staggerEntrance`. Awaits `loadScene` before starting the camera fly-in.

### Why the split

The two big choreographies (hero + boot) live in their own files where the timeline reads top-to-bottom. Microinteractions stay in `ui.ts` next to the elements. Camera/3D primitives stay in `viewer.ts` next to the scene state. `motion.ts` keeps the personality consistent across all of them.

## Hero choreography: Go → route reveal

~1.6s end-to-end. Single GSAP timeline in `route-reveal.ts`.

| t (s) | Event | Detail |
|-------|-------|--------|
| 0.00  | Go button squish      | scale 1 → 0.88 → 1.06 → 1, 220ms, back.out |
| 0.05  | Previous result clears | fade-out |
| 0.10  | Camera tween to fit   | position + target → bbox of route + 25% padding, 700ms, power3.inOut |
| 0.35  | Route line draws      | progressive reveal along path, trailing leader dot, 800ms, sine.inOut |
| 0.55  | Waypoint markers pulse | each node on path, stagger 60ms, scale 1 → 1.4 → 1, elastic.out |
| 1.10  | Destination pin drops | spawns 80px above target, falls + squish-lands, 380ms bounce.out, 3 expanding ripple rings |
| 1.25  | Result text pops in   | slide up 12px + fade, 280ms, back.out(2) |
| 1.60  | Settle                | user can interact |

### Implementation specifics

- **Route line:** replace static line with a mesh driven by a custom `progress` property [0..1]; `gsap.to({progress: 1})` re-slices the points array each tick. Leader dot is a small sphere riding the tip.
- **Pin:** new mesh added at the destination, animated via GSAP on `position.y` + `scale`. Ripple rings are three flat ring meshes scaling out + fading.
- **Camera tween:** compute `Box3` of route points, derive ideal position + lookAt, tween both vectors simultaneously. OrbitControls disabled during tween, re-enabled at the end.
- **Result pop-in:** previous result scales down + fades (140ms), new text springs in (back.out(2), 240ms).

### Interruption

User clicks Go again mid-reveal → `tl.kill()`, clean up pin/rings/leader, start fresh. No queueing. User pans/zooms during the camera-fit tween → tween completes (don't fight the user, but don't bail mid-fit).

## Boot intro choreography

Plays once on first load, ~2.2s total. Single GSAP timeline in `intro.ts`.

| t (s) | Event | Detail |
|-------|-------|--------|
| 0.00 | Wordmark fades in | "Portola Wayfinder", 240ms, scale 0.96 → 1 |
| 0.30 | Wordmark holds | 200ms |
| 0.50 | Wordmark fades out | scale up + fade, 180ms, power2.in; background black → sky gradient, 300ms |
| 0.70 | Camera fly-in | from 3× normal distance and ~70° pitch → default orbit, 1100ms, power3.out, slight roll settle |
| 0.90 | Buildings spring up | scale.y 0 → 1, stagger 40ms, back.out(2.2), 500ms each; floor-2 meshes get +60ms extra delay |
| 1.40 | Waypoint markers pop in | scale 0 → 1, stagger 25ms, back.out(3), 280ms each, subtle pulse ring per marker |
| 1.80 | Panel slides up | y +60px → 0, fade in, 360ms, back.out(1.7); inputs/buttons stagger-fade inside (40ms apart, 220ms each) |
| 2.20 | Settle | user can interact |

### Implementation specifics

- **Curtain:** `<div id="boot-curtain">` overlay holds wordmark + black background. Faded out via GSAP, then `display:none`.
- **Building rise:** walk loaded scene graph, find building/room meshes, store original `scale.y`, set to 0, then `gsap.to` with stagger. Floor-2 meshes delayed +60ms.
- **Load sync:** if GLB takes longer than the wordmark hold to load, wordmark holds until ready, then the rest plays.
- **OrbitControls:** disabled at boot start, restored at t=1.80.

### Skip rule

Any user interaction (click/key) within the first 2.2s skips to the end state immediately. Boot plays once per session.

## Floor switch choreography

~550ms total. Triggered on every Floor 1 / 2 / Both tap.

### Switching to a single floor (e.g. Both → Floor 2)

| t (s) | Event | Detail |
|-------|-------|--------|
| 0.00 | Tapped button squishes | 180ms, back.out |
| 0.05 | Inactive floor lifts away | y += 8, opacity 1 → 0, 280ms, power2.in |
| 0.05 | Active floor settles in (parallel) | start y +4 / opacity 0.6 → y 0 / opacity 1, 380ms, back.out(1.8) |
| 0.35 | Active markers re-pulse | stagger 30ms, scale 0.8 → 1.2 → 1, elastic.out, 240ms |
| 0.55 | Settle | |

### Switching to Both (single floor → Both)

Inverse: hidden floor drops in from y += 8, opacity 0 → 1, parallel with active floor's small re-settle bounce. Same 380ms.

### Switching Floor 1 ↔ Floor 2

Symmetric cross-fade: old floor lifts + fades, new floor drops + fades. 380ms, both eased back.out(1.6).

### Implementation specifics

- `viewer.extrudeFloor(target: FloorView)` returns a GSAP timeline. Reads current state, computes per-mesh start/end transforms.
- Floor grouping reused from existing routing code.
- Materials need `transparent: true` set during the tween and restored after.
- Active route line and pin participate: fade with their floor, reappear when it returns.
- Interruption: re-tap mid-switch → kill running timeline, start new from current state (GSAP `overwrite: 'auto'`).

### Edge case — multi-floor routes

Routes going up stairs span both floors. When user picks Floor 1 alone, the upper portion of the route fades with floor 2 and the lower portion stays. Route stays valid in `Both`.

## UI microinteraction inventory

All implemented as small functions in `ui.ts`, most 2–5 lines, using shared tokens from `motion.ts`.

### Panel container

- Hover: lift `translateY: -1px`, shadow grows, 180ms power2.out.
- Result text change: prev scales down + fades (140ms), new springs in (back.out(2), 240ms).

### Inputs (From / To)

- Focus: border color tween + soft glow ring scales out from 0.6 → 1, opacity 0 → 0.5 → 0 (loops once, 480ms).
- Invalid: `rejectBounce` replaces current linear `shake` — horizontal wobble using back.inOut(4), red border flash decaying over 600ms.
- Valid resolve: green tick fades in to the right of the input (180ms in, holds 400ms, fades out).

### Buttons

- All: press squish (scale 1 → 0.92 → 1.04 → 1, 180ms, back.out(2.5)); hover lifts -1px with shadow grow.
- Primary Go: squish + radial wave (CSS pseudo-element, scale 0 → 2.5, opacity 0.4 → 0, 420ms) rippling from click point.
- Secondary Recenter: squish + small rotation; camera tween in viewer runs in parallel.
- Floor toggle: tapped button squishes; the active-state pill slides between buttons via GSAP Flip plugin — width and x tween 280ms, back.out(1.8). Feels like the selection physically moves.

### Toast

- Entrance: slide up from y +20px + fade + scale 0.96 → 1, 280ms back.out(2). Replaces current opacity-only fade.
- Exit: slide down + fade, 200ms power2.in.
- New toast while one is showing: existing squishes (scale 0.95 → 1.02), text swaps, no exit/re-enter.

### Error overlay

- Entrance: backdrop fades in (260ms), card scales 0.85 → 1 + drops from y -20px with back.out(1.6), 360ms, 80ms after backdrop.
- Reload button: same squish as other buttons.

## Ambient 3D scene life

- **Idle camera drift:** OrbitControls `autoRotate` at 0.15 rad/s after 8s of no input. Any user gesture cancels instantly.
- **Waypoint marker breathing:** continuous low-amplitude pulse on outer ring (scale 1 → 1.08 → 1, opacity 0.6 → 0.9 → 0.6, 2.4s loop, sine.inOut). Phase-offset per marker by a hash of its id so they don't pulse in lockstep.
- **Active destination beacon:** once a route is drawn, the destination pin pulses harder than ambient (scale 1 → 1.15 → 1, 1.0s loop, elastic.out).
- **Sun/shadow drift:** directional light slowly orbits ±15° over 60s. Cut if perf cost > ~1 ms/frame on target device.

## Non-functional requirements

### Performance

- Target 60 fps on a 2020 Chromebook.
- All animations driven by GSAP's single ticker — one consolidated rAF loop.
- Measure sun/shadow drift on target hardware; cut if it costs > ~1 ms/frame in shadow-map updates.
- Ambient marker breathing: ~50 markers × 1 tween each is well within GSAP's headroom.

### Global interruption rules

- **Hero timeline:** user clicks Go again → kill, clean up, restart. User pans/zooms during camera-fit tween → tween completes.
- **Boot intro:** any user interaction within 2.2s skips to end state immediately.
- **Floor switch:** re-tap different floor → kill current, start new from current state.

### Testing

- Unit-test timing tokens & easing factories in `motion.ts` (value checks).
- Unit-test the choreography modules with GSAP's fake-time mode (`gsap.ticker` fakes), asserting key callbacks fire in expected order at expected times. Not testing visual output — testing that timelines are wired correctly.
- Manual QA checklist for visual feel (actual juice is judged by watching).

## Out of scope

- `prefers-reduced-motion` support.
- Cinematic dolly camera during route reveal (camera only does fit-to-route).
- "Fly the route" follow-up button.
- Any new UI features beyond the existing From/To/Floor/Go/Recenter flow.

## Open questions

None — all major decisions resolved during brainstorming.
