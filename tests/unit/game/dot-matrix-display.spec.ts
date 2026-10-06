import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DotMatrixDisplay, DMD_COLS, fitFontPx, marqueeOffset, rasterizeDots } from "@/game/ui/DotMatrixDisplay";

describe("DotMatrixDisplay", () => {
    it("lights a dot only where the glyph alpha crosses the threshold", () => {
        // 3x1 RGBA: transparent, half, opaque
        const alpha = [0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 255];
        expect(Array.from(rasterizeDots(alpha, 3, 1))).toEqual([0, 0, 1]);
        expect(Array.from(rasterizeDots(alpha, 3, 1, 90))).toEqual([0, 1, 1]);
    });

    it("only scrolls text wider than the panel, wrapping with a gap", () => {
        expect(marqueeOffset(DMD_COLS - 1, DMD_COLS, 5000)).toBe(0);
        expect(marqueeOffset(200, DMD_COLS, 0)).toBe(0);
        expect(marqueeOffset(200, DMD_COLS, 1000, 28)).toBe(28);
        // span = 200 + 24 gap → wraps back to the start
        expect(marqueeOffset(200, DMD_COLS, 8000, 28)).toBe(0);
    });

    it("shrinks the font to fit before resorting to a marquee", () => {
        const measure = (px: number) => px * 10; // 10 glyphs wide
        expect(fitFontPx(14, 11, 200, measure)).toBe(14);
        expect(fitFontPx(14, 11, 120, measure)).toBe(12);
        expect(fitFontPx(14, 11, 50, measure)).toBe(11);
    });

    it("keeps the words readable for assistive tech", () => {
        const markup = renderToStaticMarkup(React.createElement(DotMatrixDisplay, { text: '守: "Too slow."', color: "#ff4d4d" }));
        expect(markup).toContain('role="status"');
        expect(markup).toContain("守: &quot;Too slow.&quot;");
    });
});
