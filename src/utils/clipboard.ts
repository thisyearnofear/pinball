/**
 * Clipboard helper shared by the share card and the seed-audit readout.
 *
 * Prefers the async Clipboard API; falls back to a hidden-textarea + execCommand
 * copy so older WebViews (the Nimiq Pay mini-app shell) can still copy. Never
 * throws — callers get a boolean and show their own "Copied!" state.
 */

export async function copyToClipboard(text: string): Promise<boolean> {
    if (!text) return false;
    try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Permission denied / insecure context — try the legacy path instead.
    }
    return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
    if (typeof document === "undefined") return false;
    try {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.top = "-1000px";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        const ok = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
        document.body.removeChild(el);
        return ok;
    } catch {
        return false;
    }
}
