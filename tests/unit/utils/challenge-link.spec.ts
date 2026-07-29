import { describe, it, expect } from "vitest";
import { buildChallengeUrl, parseChallengeUrl, didBeatChallenge, type ChallengeInvite } from "@/utils/challenge-link";

const INVITE: ChallengeInvite = {
    mode: "kamikaze",
    worldId: "sakura-shrine",
    aiDifficulty: "hard",
    score: 4520,
    name: "Ada",
};

describe("buildChallengeUrl / parseChallengeUrl", () => {
    it("round-trips a full invite", () => {
        const url = buildChallengeUrl(INVITE, "https://example.com/play");
        expect(url.startsWith("https://example.com/play?")).toBe(true);
        const search = url.slice(url.indexOf("?"));
        expect(parseChallengeUrl(search)).toEqual(INVITE);
    });

    it("round-trips without a name", () => {
        const { name: _omit, ...noName } = INVITE;
        const url = buildChallengeUrl(noName, "https://example.com");
        expect(parseChallengeUrl(url.slice(url.indexOf("?")))).toEqual(noName);
    });

    it("returns null when the challenge flag is absent", () => {
        expect(parseChallengeUrl("?cm=kamikaze&cw=hobbiton&ca=easy&cs=1000")).toBeNull();
        expect(parseChallengeUrl("")).toBeNull();
        expect(parseChallengeUrl("?demo=1")).toBeNull();
    });

    it("rejects invalid mode, world, difficulty and score", () => {
        const base = { challenge: "1", cm: "kamikaze", cw: "hobbiton", ca: "medium", cs: "1200" };
        const mk = (over: Record<string, string>) => `?${new URLSearchParams({ ...base, ...over }).toString()}`;
        expect(parseChallengeUrl(mk({ cm: "battle" }))).toBeNull();
        expect(parseChallengeUrl(mk({ cw: "Bad World!" }))).toBeNull();
        expect(parseChallengeUrl(mk({ ca: "nightmare" }))).toBeNull();
        expect(parseChallengeUrl(mk({ cs: "0" }))).toBeNull();
        expect(parseChallengeUrl(mk({ cs: "-50" }))).toBeNull();
        expect(parseChallengeUrl(mk({ cs: "abc" }))).toBeNull();
        expect(parseChallengeUrl(mk({ cs: "99999999" }))).toBeNull();
    });

    it("sanitizes and truncates the challenger name", () => {
        const url = buildChallengeUrl({ ...INVITE, name: 'Ada<script>alert(1)</script> Lovelace-Byron King of Pinball' }, "https://example.com");
        const parsed = parseChallengeUrl(url.slice(url.indexOf("?")));
        expect(parsed).not.toBeNull();
        expect(parsed!.name).toBeDefined();
        expect(parsed!.name!.length).toBeLessThanOrEqual(24);
        expect(parsed!.name).not.toContain("<");
    });
});

describe("didBeatChallenge", () => {
    it("kamikaze: lower drain time wins", () => {
        expect(didBeatChallenge(INVITE, 4000)).toBe(true);
        expect(didBeatChallenge(INVITE, 4520)).toBe(false);
        expect(didBeatChallenge(INVITE, 5000)).toBe(false);
    });

    it("classic: higher score wins", () => {
        const classic: ChallengeInvite = { ...INVITE, mode: "classic", score: 10000 };
        expect(didBeatChallenge(classic, 10001)).toBe(true);
        expect(didBeatChallenge(classic, 10000)).toBe(false);
        expect(didBeatChallenge(classic, 9999)).toBe(false);
    });

    it("a zero/invalid score never wins", () => {
        expect(didBeatChallenge(INVITE, 0)).toBe(false);
    });
});
