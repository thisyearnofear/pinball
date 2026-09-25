import { describe, it, expect, beforeAll } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArcadeLobby } from "@/game/ui/ArcadeLobby";
import { CHAPTERS, type StoryView } from "@/model/chapters";

const storyView = ( over: Partial<StoryView> = {} ): StoryView => ({
    chapter: CHAPTERS["water-shrine"],
    run: null,
    completed: [],
    ...over,
});

/**
 * The lobby has exactly one job: start a run. Mode, machine difficulty and
 * control scheme are three decisions a newcomer has no basis to make, so the
 * contract worth guarding is that opening the lobby asks for none of them —
 * while still naming the setup the PLAY NOW button will use.
 *
 * (jsdom ships no matchMedia; some of the lobby's children query it during
 * their first render, so the stub is part of the fixture rather than the test.)
 */
beforeAll(() => {
    if ( typeof window.matchMedia !== "function" ) {
        window.matchMedia = (( query: string ) => ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
        })) as typeof window.matchMedia;
    }
});

const noop = () => {};

function lobbyProps( over: Partial<React.ComponentProps<typeof ArcadeLobby>> = {} ) {
    return {
        tournaments: [],
        activeTournamentId: null,
        entered: false,
        isConnected: false,
        gameMode: "kamikaze" as const,
        aiDifficulty: "medium" as const,
        controlScheme: "steer" as const,
        onSelectControlScheme: noop,
        onSelectGameMode: noop,
        onSelectDifficulty: noop,
        onSelectTournament: noop,
        onEnterTournament: noop,
        onStartTournament: noop,
        onPractice: noop,
        onPlayDaily: noop,
        ...over,
    };
}

const html = ( over: Partial<React.ComponentProps<typeof ArcadeLobby>> = {} ) =>
    renderToStaticMarkup( React.createElement( ArcadeLobby, lobbyProps( over )));

describe("ArcadeLobby", () => {
    it("offers the run before asking anything, and names what it will be", () => {
        const markup = html();
        expect(markup).toContain("PLAY NOW");
        // The setup is stated rather than asked for.
        expect(markup).toContain("Kamikaze 神風 · machine: medium · control: Steer");
    });

    it("keeps the run setup closed until it is asked for", () => {
        const markup = html();
        expect(markup).toContain("Change setup");
        // Markers that exist only inside the disclosure — notably not "CLASSIC",
        // which a tournament card also renders.
        for ( const inPanel of ['id="run-setup"', "FLAGSHIP", "Machine difficulty", "守 Feint duel"] ) {
            expect(markup).not.toContain(inPanel);
        }
    });

    it("does not send a newcomer to configure a wallet before they can play", () => {
        const markup = html({ isConnected: false });
        const playIndex = markup.indexOf("PLAY NOW");
        // The connect prompt exists, but it comes after the run, not before it.
        expect(markup).toContain("Connect a wallet");
        expect(playIndex).toBeLessThan(markup.indexOf("Connect a wallet"));
    });

    it("offers the free story chapter without a wallet gate, even while loading", () => {
        const markup = html();
        expect(markup).toContain('href="/chapter"');
        expect(markup).toContain("The Water Shrine");
        expect(markup.indexOf("PLAY NOW")).toBeLessThan(markup.indexOf("/chapter"));
        const loading = html({ loading: true });
        expect(loading).toContain('href="/chapter"');
        expect(loading).toContain("The Water Shrine");
    });

    it("summarises a non-default setup without opening it", () => {
        const markup = html({ aiDifficulty: "hard", controlScheme: "precision", gameMode: "classic" });
        expect(markup).toContain("Change setup · Classic");
        expect(markup).not.toContain("machine: hard");
    });

    it("offers to continue the story when durable progress exists, naming its state", () => {
        const markup = html({ onStory: noop, storyProgress: storyView({ run: { learned: true, seals: ["west"] } }) });
        expect(markup).toContain("Continue the Story");
        expect(markup).toContain("1 of 2 seals quenched");
        // A resumable card is a button, not the cold /chapter link.
        expect(markup).not.toContain('href="/chapter"');
    });

    it("names the active chapter and its number once chapter 1 is complete", () => {
        const markup = html({ onStory: noop, storyProgress: storyView({
            chapter: CHAPTERS["wind-ridge"], completed: ["water-shrine"],
        })});
        expect(markup).toContain("The Wind Ridge");
        expect(markup).toContain("CHAPTER 2");
        expect(markup).toContain("storm chimes");
        expect(markup).not.toContain("Continue the Story");
    });

    it("pitches a fresh story when there is no progress to continue", () => {
        const markup = html({ onStory: noop, storyProgress: null });
        expect(markup).toContain("Play Story");
        expect(markup).not.toContain("Continue the Story");
    });

    it("keeps the story card reachable even while the lobby loads", () => {
        const loading = html({ loading: true, storyProgress: storyView({ run: { learned: true, seals: [] } }) });
        expect(loading).toContain("The Water Shrine");
        // Loading has no progress read yet — it must not promise a continue
        // it cannot back, so it renders the neutral pitch.
        expect(loading).toContain("Play Story");
    });
});
