/**
 * Share-card image renderer — draws a 1200×630 PNG card on a canvas so a run
 * result can be shared as an image (native share sheet, download) instead of
 * clipboard text. Images travel; text doesn't.
 */

export type ShareCardImageInput = {
  kamikaze: boolean;
  scoreText: string;
  worldName: string;
  /** CSS linear-gradient string from the world config (parsed best-effort). */
  worldGradient?: string;
  tournamentName?: string;
  aiDifficulty?: string;
  taunt?: string;
  rankKanji?: string;
  rankName?: string;
  /** e.g. window.location.host — shown as the call-to-action footer. */
  footerHost?: string;
};

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

type GradientStop = { color: string; offset: number };

/**
 * Parse a CSS `linear-gradient(<angle>, <color> <pct>%, …)` into canvas stops.
 * Supports the subset used by the world configs (hex colors, deg angles,
 * optional stop offsets). Returns null for anything else.
 */
export function parseCssLinearGradient(input: string): { angleDeg: number; stops: GradientStop[] } | null {
  const match = input.trim().match(/^linear-gradient\((.*)\)$/i);
  if (!match) return null;
  const parts = match[1].split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  let angleDeg = 180;
  let colorParts = parts;
  const angleMatch = parts[0].match(/^(-?\d+(?:\.\d+)?)deg$/);
  if (angleMatch) {
    angleDeg = Number(angleMatch[1]);
    colorParts = parts.slice(1);
  }
  if (colorParts.length < 2) return null;

  const stops: GradientStop[] = [];
  for (const [i, part] of colorParts.entries()) {
    const pm = part.match(/^(#[0-9a-fA-F]{3,8})(?:\s+([\d.]+)%)?$/);
    if (!pm) return null;
    const offset = pm[2] !== undefined ? Number(pm[2]) / 100 : i / (colorParts.length - 1);
    stops.push({ color: pm[1], offset: Math.min(1, Math.max(0, offset)) });
  }
  return { angleDeg, stops };
}

function applyGradient(
  ctx: CanvasRenderingContext2D,
  parsed: { angleDeg: number; stops: GradientStop[] } | null,
  fallbackColors: string[],
): void {
  let stops: GradientStop[];
  if (parsed) {
    // CSS 0deg = to top; canvas angle measured from positive x-axis.
    const rad = ((parsed.angleDeg - 90) * Math.PI) / 180;
    const cx = SHARE_CARD_WIDTH / 2;
    const cy = SHARE_CARD_HEIGHT / 2;
    const r = Math.hypot(SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT) / 2;
    const g = ctx.createLinearGradient(
      cx - Math.cos(rad) * r,
      cy - Math.sin(rad) * r,
      cx + Math.cos(rad) * r,
      cy + Math.sin(rad) * r,
    );
    stops = parsed.stops;
    for (const s of stops) g.addColorStop(s.offset, s.color);
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
    g.addColorStop(0, fallbackColors[0]);
    g.addColorStop(1, fallbackColors[1]);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
}

export function renderShareCardImage(input: ShareCardImageInput): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  applyGradient(ctx, input.worldGradient ? parseCssLinearGradient(input.worldGradient) : null, ["#1a0a2e", "#0f0f23"]);

  // Vignette so text pops on any world gradient.
  const vignette = ctx.createRadialGradient(600, 315, 120, 600, 315, 720);
  vignette.addColorStop(0, "rgba(0,0,0,0.15)");
  vignette.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  ctx.textAlign = "center";

  // Header
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "700 34px system-ui, -apple-system, sans-serif";
  ctx.fillText("KAMIKAZE BALL", 600, 92);
  ctx.fillStyle = "rgba(227,66,52,0.95)";
  ctx.font = "400 40px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
  ctx.fillText("神風", 600, 146);

  // Score
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = input.kamikaze ? "rgba(239,68,68,0.85)" : "rgba(99,102,241,0.85)";
  ctx.shadowBlur = 34;
  ctx.font = "900 118px system-ui, -apple-system, sans-serif";
  ctx.fillText(input.scoreText, 600, 300);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "600 30px system-ui, -apple-system, sans-serif";
  const sub = input.kamikaze
    ? `drain time${input.aiDifficulty ? ` · machine on ${input.aiDifficulty}` : ""}`
    : "score";
  ctx.fillText(sub, 600, 350);

  // Taunt quote
  if (input.kamikaze && input.taunt) {
    ctx.fillStyle = "#ff6666";
    ctx.font = "italic 600 30px system-ui, -apple-system, sans-serif";
    ctx.fillText(`The machine said: "${input.taunt}"`, 600, 412);
  }

  // Meta row
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "600 26px system-ui, -apple-system, sans-serif";
  const metaParts = [input.worldName, input.tournamentName].filter(Boolean);
  ctx.fillText(metaParts.join(" · "), 600, input.kamikaze && input.taunt ? 462 : 430);

  // Rank badge
  if (input.rankName) {
    ctx.fillStyle = "rgba(212,160,23,0.95)";
    ctx.font = "700 26px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${input.rankKanji ?? ""} ${input.rankName} rank`, 600, 512);
  }

  // CTA footer
  ctx.fillStyle = "#ffd34d";
  ctx.font = "800 32px system-ui, -apple-system, sans-serif";
  const cta = input.kamikaze ? "Think you can drain it faster?" : "Think you can beat it?";
  ctx.fillText(input.footerHost ? `${cta} ${input.footerHost}` : cta, 600, 576);

  return canvas;
}

export function shareCardToDataUrl(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

export function shareCardToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null);
    }
  });
}
