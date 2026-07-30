import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

// Generated 1200×630 Open Graph image (Next.js file convention). Prerendered to
// a static file at build time (works with `output: "export"`). The title uses a
// bundled display font (no network needed); the 神風 kanji loads a JP font from a
// CDN and is omitted gracefully if unavailable, so the build never breaks.

export const alt = "Kamikaze Ball — the world's first verifiable arcade. Drain-to-win pinball where the machine fights back.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Required for `output: "export"`: prerender this image route at build time
// (the async font fetch would otherwise mark it dynamic).
export const dynamic = "force-static";

function loadLocalFont(file: string): ArrayBuffer | null {
  try {
    const data = readFileSync(join(process.cwd(), "public/assets/fonts", file));
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

async function loadKanjiFont(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.woff",
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image() {
  const displayFont = loadLocalFont("neon_overdrive-webfont.woff");
  const kanjiFont = await loadKanjiFont();

  const fonts: Array<{ name: string; data: ArrayBuffer; style: "normal"; weight: 400 | 700 }> = [];
  if (displayFont) fonts.push({ name: "Neon Overdrive", data: displayFont, style: "normal", weight: 400 });
  if (kanjiFont) fonts.push({ name: "Noto Sans JP", data: kanjiFont, style: "normal", weight: 700 });

  const titleFamily = displayFont ? "Neon Overdrive" : "sans-serif";
  const kanjiFamily = kanjiFont ? "Noto Sans JP" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0d0d1f 0%, #1a1a4e 45%, #2d1b69 80%, #4a1e3a 100%)",
          color: "#ffffff",
          position: "relative",
        }}
      >
        {/* vermillion glow accent */}
        <div
          style={{
            position: "absolute",
            top: -160,
            right: -120,
            width: 520,
            height: 520,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(227,66,52,0.45) 0%, rgba(227,66,52,0) 70%)",
            display: "flex",
          }}
        />

        {/* Eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 26,
            letterSpacing: 6,
            color: "#fbbf24",
            fontWeight: 700,
          }}
        >
          THE WORLD'S FIRST VERIFIABLE ARCADE
        </div>

        {/* Title block */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {kanjiFont && (
            <div
              style={{
                fontFamily: kanjiFamily,
                fontSize: 92,
                lineHeight: 1,
                color: "#e34234",
                textShadow: "0 0 30px rgba(227,66,52,0.7)",
                display: "flex",
              }}
            >
              神風
            </div>
          )}
          <div
            style={{
              fontFamily: titleFamily,
              fontSize: 128,
              lineHeight: 1,
              color: "#ffffff",
              textShadow: "0 0 34px rgba(99,102,241,0.85)",
              display: "flex",
            }}
          >
            KAMIKAZE BALL
          </div>
          <div
            style={{
              fontSize: 38,
              color: "rgba(255,255,255,0.85)",
              fontWeight: 600,
              marginTop: 12,
              display: "flex",
            }}
          >
            Drain to win. The machine fights back.
          </div>
        </div>

        {/* Footer strip */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "2px solid rgba(255,255,255,0.18)",
            paddingTop: 28,
            fontSize: 26,
            letterSpacing: 2,
            color: "rgba(255,255,255,0.75)",
            fontWeight: 600,
          }}
        >
          <div style={{ display: "flex" }}>ON-CHAIN TOURNAMENTS · PROVABLY FAIR SCORES</div>
          <div style={{ display: "flex", color: "#fbbf24" }}>kamikazeball.netlify.app</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
