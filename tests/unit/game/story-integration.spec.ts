import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** GameScreen is the integration seam: Story mode must run on the same mounted
 *  engine/presentation as Arcade, so these tests mock the heavy leaf (GameMount)
 *  and assert the shell's wiring — entry, pause persistence, and the ranked
 *  guard — rather than physics. */
const mountProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null, renders: 0 }));
vi.mock("@/game/GameMount", () => ({
    __esModule: true,
    default: (props: Record<string, unknown>) => {
        mountProps.current = props;
        mountProps.renders++;
        return React.createElement("div", { "data-testid": "game-mount" });
    },
}));

const lobbyProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock("@/game/ui", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/game/ui")>();
    return {
        ...actual,
        ArcadeLobby: (props: Record<string, unknown>) => {
            lobbyProps.current = props;
            return React.createElement("div", { "data-testid": "arcade-lobby" });
        },
        AppHeader: () => null,
        AmbientBackground: () => null,
        SakuraPetals: () => null,
        KanjiWatermark: () => null,
        CRTOverlay: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
        CelebrationParticles: () => null,
        ActivityFeedPanel: () => null,
        useToast: () => ({ addToast: vi.fn() }),
        useActivityFeed: () => ({ push: vi.fn(), entries: [] }),
    };
});

vi.mock("@/game/ui/PauseMenu", () => ({
    PauseMenu: (props: { summary?: string; onResume: () => void }) =>
        React.createElement("div", { "data-testid": "pause-menu", "data-summary": props.summary ?? "" },
            React.createElement("button", { onClick: props.onResume }, "Resume")),
}));

const stub = { default: () => null };
vi.mock("@/game/ui/SettingsModal", () => ({ SettingsModal: () => null }));
vi.mock("@/game/ui/HowToPlayModal", () => ({ HowToPlayModal: () => null }));
vi.mock("@/game/ui/AboutModal", () => ({ AboutModal: () => null }));
vi.mock("@/game/ui/LeaderboardModal", () => ({ LeaderboardModal: () => null }));
vi.mock("@/game/ui/ScoreSubmissionOverlay", () => ({ ScoreSubmissionOverlay: () => null }));
vi.mock("@/game/ui/CelebrationOverlay", () => ({ CelebrationOverlay: () => null }));
vi.mock("@/game/ui/ReplayViewer", () => ({ ReplayViewer: () => null }));
vi.mock("@/game/ui/InstallPrompt", () => ({ InstallPrompt: () => null }));
vi.mock("@/game/ui/KamiTrialModal", () => ({ KamiTrialModal: () => null }));
vi.mock("@/game/ui/ControlsPanel", () => ({ ControlsPanel: () => null }));
vi.mock("@/game/ui/PaymentMethodSelector", () => ({ PaymentMethodSelector: () => null }));
vi.mock("@/game/ui/ActivityFeed", () => ({
    ActivityFeedPanel: () => null,
    ActivityFeedProvider: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useActivityFeed: () => ({ log: vi.fn(), entries: [] }),
}));

const recordRun = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-wallet-state", () => ({ useWalletState: () => ({ address: null, isConnected: false }) }));
vi.mock("@/hooks/use-wallet-port", () => ({ useWalletPort: () => null }));
vi.mock("@/hooks/use-player-stats", () => ({ usePlayerStats: () => ({ stats: undefined, recordRun }) }));
vi.mock("@/hooks/use-tournament", () => ({
    useTournament: () => ({
        tournament: { tournamentId: null, entered: false, worldId: null },
        setTournament: vi.fn(), isLoading: false, loadError: null,
        refresh: vi.fn(), enterTournament: vi.fn(),
    }),
}));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => false }));
vi.mock("@/hooks/use-world-theme", () => ({ useWorldTheme: vi.fn(), getWorldAccent: () => "#fff" }));
vi.mock("@/services/high-scores-service", () => ({ stopGame: vi.fn(), setSubmissionStateCallback: vi.fn() }));
vi.mock("@/services/backend-scores-client", () => ({ fetchBestReplay: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@/services/audio-service", () => ({ playFurinChime: vi.fn() }));
vi.mock("@/services/nimiq/nimiq-payment", () => ({ enterTournamentWithNim: vi.fn(), isNimPaymentAvailable: () => false }));
vi.mock("@/services/nimiq/nimiq-provider", () => ({ isInsideNimiqPay: () => false }));
vi.mock("@/utils/machine-memory", () => ({ loadMemory: () => ({}), recordRunResult: vi.fn((m) => m), saveMemory: vi.fn() }));
vi.mock("@/utils/challenge-link", () => ({ parseChallengeUrl: () => null, didBeatChallenge: vi.fn() }));
vi.mock("@/utils/first-run", () => ({ hasSeenFirstRun: () => true, markFirstRunSeen: vi.fn() }));
vi.mock("@/utils/burst-fx", () => ({ burstAt: vi.fn() }));
vi.mock("@/config/progression", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/config/progression")>();
    return { ...actual, getProgress: () => ({}), recordRunProgress: vi.fn(), grantEarlyWin: vi.fn() };
});
vi.mock("@/config/daily-challenge", () => ({ getDailyChallenge: () => null, recordDailyRun: vi.fn() }));
vi.mock("@/model/game", () => ({ getRunHabits: () => ({}) }));

import GameScreen from "@/game/GameScreen";

describe("GameScreen story integration", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        window.localStorage.clear();
        vi.clearAllMocks();
        mountProps.current = null;
        mountProps.renders = 0;
        lobbyProps.current = null;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    });

    it("direct /chapter entry auto-starts a classic Story run on the shrine world", () => {
        act(() => { root.render(React.createElement(GameScreen, { initialStory: true })); });
        const props = mountProps.current!;
        expect(props).toBeTruthy();
        expect(props.story).toBe(true);
        expect(props.mode).toBe("practice");
        expect(props.gameMode).toBe("classic");
        expect(props.worldId).toBe("sakura-shrine");
        expect(container.querySelector("[data-testid='arcade-lobby']")).toBeFalsy();
    });

    it("keeps GameMount mounted while paused and resumes without remounting", () => {
        act(() => { root.render(React.createElement(GameScreen, { initialStory: true })); });
        const before = mountProps.renders;
        act(() => { (mountProps.current!.onTogglePause as () => void)(); });
        // The pause menu is up AND the engine mount is still in the tree.
        expect(container.querySelector("[data-testid='pause-menu']")).toBeTruthy();
        expect(container.querySelector("[data-testid='game-mount']")).toBeTruthy();
        expect(container.querySelector("[data-testid='pause-menu']")!.getAttribute("data-summary")).toBe("Story · The Water Shrine");
        act(() => { (mountProps.current!.onTogglePause as () => void)(); });
        expect(container.querySelector("[data-testid='pause-menu']")).toBeFalsy();
        expect(container.querySelector("[data-testid='game-mount']")).toBeTruthy();
    });

    it("lobby Story entry starts Story mode; quit returns to the lobby", () => {
        act(() => { root.render(React.createElement(GameScreen)); });
        expect(lobbyProps.current).toBeTruthy();
        const onStory = lobbyProps.current!.onStory as () => void;
        expect(onStory).toBeTypeOf("function");
        act(() => onStory());
        expect(mountProps.current!.story).toBe(true);
        act(() => { (mountProps.current!.onQuit as () => void)(); });
        expect(container.querySelector("[data-testid='arcade-lobby']")).toBeTruthy();
        expect(container.querySelector("[data-testid='game-mount']")).toBeFalsy();
    });

    it("a Story run end never reaches the ranked recording path", () => {
        act(() => { root.render(React.createElement(GameScreen, { initialStory: true })); });
        act(() => { (mountProps.current!.onRunEnd as (score: number) => void)(9999); });
        expect(recordRun).not.toHaveBeenCalled();
    });

    it("an Arcade practice run is not Story mode", () => {
        act(() => { root.render(React.createElement(GameScreen)); });
        act(() => { (lobbyProps.current!.onPractice as () => void)(); });
        expect(mountProps.current!.story).toBe(false);
    });
});
