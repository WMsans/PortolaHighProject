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
