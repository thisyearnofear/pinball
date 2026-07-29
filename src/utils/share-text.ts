/**
 * Plain-text share payload builder (fallback when native share / image share
 * is unavailable). Extracted from ShareCard so the copy is testable.
 */

export type ShareTextInput = {
  kamikaze: boolean;
  scoreText: string;
  tournamentName?: string;
  aiDifficulty?: string;
  taunt?: string;
  worldName?: string;
};

export function buildShareText(input: ShareTextInput): string {
  if (input.kamikaze) {
    return (
      `Kamikaze Ball\n` +
      `${input.tournamentName ? `Tournament: ${input.tournamentName}\n` : ""}` +
      `Drained the ball in ${input.scoreText}${input.aiDifficulty ? ` on ${input.aiDifficulty}` : ""}.\n` +
      `${input.taunt ? `The machine said: "${input.taunt}"\n` : ""}` +
      `\nThink you can drain it faster? Play now!`
    );
  }
  return (
    `Kamikaze Ball\n` +
    `${input.tournamentName ? `Tournament: ${input.tournamentName}\n` : ""}` +
    `Score: ${input.scoreText}\n` +
    `World: ${input.worldName ?? "Unknown"}\n` +
    `\nPlay now!`
  );
}
