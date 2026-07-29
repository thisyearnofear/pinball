import { describe, it, expect } from "vitest";
import { buildShareText } from "@/utils/share-text";

describe("buildShareText", () => {
    it("kamikaze text leads with drain time, difficulty and taunt", () => {
        const text = buildShareText({
            kamikaze: true,
            scoreText: "4.5s",
            aiDifficulty: "hard",
            taunt: "PATHETIC",
            tournamentName: "Sakura Cup",
        });
        expect(text).toContain("Kamikaze Ball");
        expect(text).toContain("Tournament: Sakura Cup");
        expect(text).toContain("Drained the ball in 4.5s on hard");
        expect(text).toContain('The machine said: "PATHETIC"');
        expect(text).toContain("Think you can drain it faster?");
    });

    it("classic text includes score and world", () => {
        const text = buildShareText({ kamikaze: false, scoreText: "125,000", worldName: "Hobbiton" });
        expect(text).toContain("Score: 125,000");
        expect(text).toContain("World: Hobbiton");
        expect(text).not.toContain("Drained");
    });

    it("omits optional lines when absent", () => {
        const text = buildShareText({ kamikaze: true, scoreText: "9.9s" });
        expect(text).not.toContain("Tournament:");
        expect(text).not.toContain("machine said");
        expect(text).toContain("Drained the ball in 9.9s.");
    });
});
