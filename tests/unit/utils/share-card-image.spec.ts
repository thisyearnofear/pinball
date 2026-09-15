import { describe, it, expect, vi, afterEach } from "vitest";
import { parseCssLinearGradient, renderShareCardImage } from "@/utils/share-card-image";

/** jsdom has no 2D canvas: return a recording stub so we can assert what is drawn. */
function stubCanvas2d() {
    const drawn: string[] = [];
    const gradient = { addColorStop: () => {} };
    const ctx = {
        fillStyle: "", strokeStyle: "", lineWidth: 0, font: "",
        textAlign: "center", textBaseline: "alphabetic", shadowColor: "", shadowBlur: 0,
        fillRect: () => {}, strokeRect: () => {}, clearRect: () => {},
        fillText: (t: string) => { drawn.push(String(t)); },
        measureText: (t: string) => ({ width: String(t).length * 10 }),
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
        beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
        arc: () => {}, arcTo: () => {}, fill: () => {}, stroke: () => {},
        save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {}, scale: () => {},
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
    return drawn;
}

afterEach(() => {
    vi.restoreAllMocks();
});

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

describe("renderShareCardImage — seed provenance badge", () => {
    it("draws the provenance chip for a known source", () => {
        const drawn = stubCanvas2d();
        renderShareCardImage({ kamikaze: true, scoreText: "4.5s", worldName: "Hibiki", seedSource: "qrng" });
        expect(drawn).toContain("KAMIKAZE BALL");
        expect(drawn.some((t) => t.includes("QUANTUM-SEEDED") && t.includes("⚛"))).toBe(true);
    });

    it("draws the server/device variants", () => {
        const serverDrawn = stubCanvas2d();
        renderShareCardImage({ kamikaze: true, scoreText: "4.5s", worldName: "Hibiki", seedSource: "csprng" });
        expect(serverDrawn.some((t) => t.includes("SERVER ENTROPY"))).toBe(true);

        vi.restoreAllMocks();
        const deviceDrawn = stubCanvas2d();
        renderShareCardImage({ kamikaze: true, scoreText: "4.5s", worldName: "Hibiki", seedSource: "local" });
        expect(deviceDrawn.some((t) => t.includes("DEVICE ENTROPY"))).toBe(true);
    });

    it("omits the chip when provenance is unrecorded", () => {
        const drawn = stubCanvas2d();
        renderShareCardImage({ kamikaze: true, scoreText: "4.5s", worldName: "Hibiki" });
        expect(drawn).toContain("KAMIKAZE BALL");
        expect(drawn.some((t) => /SEEDED|ENTROPY/.test(t))).toBe(false);
    });
});
