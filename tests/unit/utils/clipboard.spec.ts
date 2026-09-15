import { describe, it, expect, vi, afterEach } from "vitest";
import { copyToClipboard } from "@/utils/clipboard";

function setClipboard(value: unknown): void {
    Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

afterEach(() => {
    vi.restoreAllMocks();
    setClipboard(undefined);
    delete (document as unknown as { execCommand?: unknown }).execCommand;
});

describe("copyToClipboard", () => {
    it("uses the async Clipboard API when available", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        setClipboard({ writeText });

        await expect(copyToClipboard("0xabc")).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith("0xabc");
    });

    it("falls back to the legacy textarea path when the API rejects", async () => {
        setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
        const exec = vi.fn().mockReturnValue(true);
        (document as unknown as { execCommand: unknown }).execCommand = exec;

        await expect(copyToClipboard("seed: 1")).resolves.toBe(true);
        expect(exec).toHaveBeenCalledWith("copy");
        // The scratch element must not be left in the DOM.
        expect(document.querySelectorAll("textarea")).toHaveLength(0);
    });

    it("falls back to the legacy path when the API is absent", async () => {
        setClipboard(undefined);
        const exec = vi.fn().mockReturnValue(true);
        (document as unknown as { execCommand: unknown }).execCommand = exec;

        await expect(copyToClipboard("0xdef")).resolves.toBe(true);
        expect(exec).toHaveBeenCalledWith("copy");
    });

    it("returns false when neither path can copy", async () => {
        setClipboard(undefined);
        delete (document as unknown as { execCommand?: unknown }).execCommand;

        await expect(copyToClipboard("x")).resolves.toBe(false);
    });

    it("no-ops on empty text", async () => {
        const writeText = vi.fn();
        setClipboard({ writeText });

        await expect(copyToClipboard("")).resolves.toBe(false);
        expect(writeText).not.toHaveBeenCalled();
    });
});
