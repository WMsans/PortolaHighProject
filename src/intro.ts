import { gsap, EASE } from "./motion";
import type { Viewer } from "./viewer";
import type { LoadedScene } from "./types";

export function playIntro(viewer: Viewer, scene: LoadedScene, panel: HTMLElement): gsap.core.Timeline {
  const curtain  = document.getElementById("boot-curtain")!;
  const wordmark = document.getElementById("boot-wordmark")!;

  const tl = gsap.timeline();

  tl.fromTo(wordmark, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.24 }, 0);

  tl.to(wordmark, { opacity: 0, scale: 1.08, duration: 0.18, ease: EASE.power2In }, 0.5);

  tl.to(curtain, { opacity: 0, duration: 0.3, onComplete: () => { curtain.style.display = "none"; } }, 0.5);

  tl.add(viewer.playBootIntro(scene), 0.7);

  panel.style.opacity = "0";
  panel.style.transform = "translateY(60px)";
  tl.to(panel, { opacity: 1, y: 0, duration: 0.36, ease: EASE.backOutSubtle }, 1.8);

  const innerEls = panel.querySelectorAll<HTMLElement>("label, input, button, .floor-toggle, .result");
  tl.fromTo(innerEls, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.22, stagger: 0.04, ease: EASE.backOutSubtle }, 1.85);

  const skip = () => {
    if (!tl.isActive()) return;
    tl.progress(1, false);
  };
  window.addEventListener("pointerdown", skip, { once: true });
  window.addEventListener("keydown",     skip, { once: true });
  tl.eventCallback("onComplete", () => {
    window.removeEventListener("pointerdown", skip);
    window.removeEventListener("keydown", skip);
  });

  return tl;
}
