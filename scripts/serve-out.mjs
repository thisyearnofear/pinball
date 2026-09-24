// Minimal static server for the Next export in out/, used by the Playwright
// visual harness. Maps extensionless routes the way a hosting box would
// (/chapter -> out/chapter.html).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.SERVE_OUT_PORT ?? 4310);
const ROOT = join(process.cwd(), "out");

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".riv": "application/octet-stream",
    ".wasm": "application/wasm",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
};

async function resolve(pathname) {
    // Prevent traversal: normalize inside ROOT, reject anything escaping.
    const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
    const base = join(ROOT, rel);
    const candidates = extname(base)
        ? [base]
        : [`${base}.html`, join(base, "index.html")];
    if (pathname === "/") candidates.unshift(join(ROOT, "index.html"));
    for (const file of candidates) {
        if (!file.startsWith(ROOT)) continue;
        try {
            return { body: await readFile(file), file };
        } catch {}
    }
    return null;
}

createServer(async (req, res) => {
    const { pathname } = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const hit = await resolve(pathname);
    if (!hit) {
        res.writeHead(404).end("not found");
        return;
    }
    res.writeHead(200, {
        // Content type follows the file actually served: /chapter resolves to
        // chapter.html and must arrive as text/html, not as a download.
        "content-type": MIME[extname(hit.file).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-store",
    });
    res.end(hit.body);
}).listen(PORT, "127.0.0.1", () => console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}`));
