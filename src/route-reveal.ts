import { Vector3 } from "three";
import { gsap } from "./motion";
import type { Viewer } from "./viewer";

let currentTl: gsap.core.Timeline | null = null;

export function playRouteReveal(viewer: Viewer, points: Vector3[]): gsap.core.Timeline {
  currentTl?.kill();
  viewer.clearRoute();

  const master = gsap.timeline();

  master.add(viewer.tweenCameraToFitRoute(points), 0.10);

  master.add(viewer.animateRouteDraw(points), 0.35);

  master.add(viewer.animateMarkerPulse(points), 0.55);

  master.add(viewer.animatePinDrop(points[points.length - 1]), 1.10);

  currentTl = master;
  return master;
}
