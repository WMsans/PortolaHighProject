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
