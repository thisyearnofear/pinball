import { describe, it, expect } from "vitest";
import { parseCssLinearGradient } from "@/utils/share-card-image";

describe("parseCssLinearGradient", () => {
    it("parses angle + offset stops (world config format)", () => {
        const g = parseCssLinearGradient("linear-gradient(135deg, #2d5016 0%, #4a7c23 30%, #8b6914 60%, #3d2b1f 100%)");
        expect(g).not.toBeNull();
        expect(g!.angleDeg).toBe(135);
        expect(g!.stops).toHaveLength(4);
        expect(g!.stops[0]).toEqual({ color: "#2d5016", offset: 0 });
        expect(g!.stops[1]).toEqual({ color: "#4a7c23", offset: 0.3 });
        expect(g!.stops[3]).toEqual({ color: "#3d2b1f", offset: 1 });
    });

    it("parses stops without explicit offsets by distributing evenly", () => {
        const g = parseCssLinearGradient("linear-gradient(#1a0a2e, #16213e, #0f0f23)");
        expect(g).not.toBeNull();
        expect(g!.angleDeg).toBe(180); // CSS default: to bottom
        expect(g!.stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    });

    it("rejects non-gradients and malformed input", () => {
        expect(parseCssLinearGradient("radial-gradient(circle, #fff, #000)")).toBeNull();
        expect(parseCssLinearGradient("#1a0a2e")).toBeNull();
        expect(parseCssLinearGradient("linear-gradient(135deg, red, blue)")).toBeNull(); // named colors unsupported
        expect(parseCssLinearGradient("linear-gradient(135deg, #fff)")).toBeNull(); // single stop
    });
});
