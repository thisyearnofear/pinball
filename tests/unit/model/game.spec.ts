import { describe, it, expect, vi, afterEach } from "vitest";
import "vitest-canvas-mock";
import {
    FRAME_RATE, BALL_WIDTH, BALL_HEIGHT, GRAVITY, FLIPPER_FORCE, LAUNCH_SPEED, MAX_SPEED,
    MAX_BUMPS, BUMP_IMPULSE, BUMP_TIMEOUT, BALLS_PER_GAME, RETRY_TIMEOUT,
    TRIGGER_EXPIRY, SEQUENCE_REPEAT_WINDOW,
    AwardablePoints, GameMessages, GameSounds, ActorTypes, ActorLabels,
    TriggerTarget, TriggerTypes,
} from "@/definitions/game";
import { getBallPosition, getBallCount, setPaused, getMachineMood, consumeKillCam, setKillCamEnabled } from "@/model/game";

afterEach(() => {
    vi.restoreAllMocks();
});

describe( "Game definitions", () => {

    describe( "physics constants", () => {
        it( "should define a frame rate of 60", () => {
            expect( FRAME_RATE ).toEqual( 60 );
        });

        it( "should define ball dimensions as a square", () => {
            expect( BALL_WIDTH ).toEqual( BALL_HEIGHT );
            expect( BALL_WIDTH ).toBeGreaterThan( 0 );
        });

        it( "should define gravity as a positive value", () => {
            expect( GRAVITY ).toBeGreaterThan( 0 );
        });

        it( "should define derived physics values as positive numbers", () => {
            expect( FLIPPER_FORCE ).toBeGreaterThan( 0 );
            expect( LAUNCH_SPEED ).toBeGreaterThan( 0 );
            expect( MAX_SPEED ).toBeGreaterThan( 0 );
        });

        it( "should have MAX_SPEED greater than LAUNCH_SPEED", () => {
            expect( MAX_SPEED ).toBeGreaterThan( LAUNCH_SPEED );
        });

        it( "should derive FLIPPER_FORCE, LAUNCH_SPEED, and MAX_SPEED from GRAVITY", () => {
            expect( FLIPPER_FORCE ).toBeCloseTo( 0.002666666 * GRAVITY, 10 );
            expect( LAUNCH_SPEED ).toBeCloseTo( 25 * GRAVITY, 10 );
            expect( MAX_SPEED ).toBeCloseTo( 55 * GRAVITY, 10 );
        });
    });

    describe( "game configuration constants", () => {
        it( "should allow 3 balls per game", () => {
            expect( BALLS_PER_GAME ).toEqual( 3 );
        });

        it( "should allow a maximum of 3 bumps before tilt", () => {
            expect( MAX_BUMPS ).toEqual( 3 );
        });

        it( "should define a bump timeout of 2000 ms", () => {
            expect( BUMP_TIMEOUT ).toEqual( 2000 );
        });

        it( "should define a bump impulse of 4", () => {
            expect( BUMP_IMPULSE ).toEqual( 4 );
        });

        it( "should define a retry timeout of 3000 ms", () => {
            expect( RETRY_TIMEOUT ).toEqual( 3000 );
        });
    });

    describe( "trigger constants", () => {
        it( "should define TRIGGER_EXPIRY as 5000 ms", () => {
            expect( TRIGGER_EXPIRY ).toEqual( 5000 );
        });

        it( "should define SEQUENCE_REPEAT_WINDOW as 3000 ms", () => {
            expect( SEQUENCE_REPEAT_WINDOW ).toEqual( 3000 );
        });
    });

    describe( "AwardablePoints", () => {
        it( "should award 500 points for a bumper hit", () => {
            expect( AwardablePoints.BUMPER ).toEqual( 500 );
        });

        it( "should award 100 points for a trigger hit", () => {
            expect( AwardablePoints.TRIGGER ).toEqual( 100 );
        });

        it( "should award 2500 points for a trigger group completion", () => {
            expect( AwardablePoints.TRIGGER_GROUP_COMPLETE ).toEqual( 2500 );
        });

        it( "should award 25000 points for a sequence completion", () => {
            expect( AwardablePoints.TRIGGER_GROUP_SEQUENCE_COMPLETE ).toEqual( 25000 );
        });

        it( "should award 10000 points for unlocking the underworld", () => {
            expect( AwardablePoints.UNDERWORLD_UNLOCKED ).toEqual( 10000 );
        });

        it( "should award 25000 points for an escape bonus", () => {
            expect( AwardablePoints.ESCAPE_BONUS ).toEqual( 25000 );
        });

        it( "should have all point values as positive integers", () => {
            for ( const value of Object.values( AwardablePoints )) {
                expect( Number.isInteger( value )).toBe( true );
                expect( value ).toBeGreaterThan( 0 );
            }
        });

        it( "should have higher rewards for harder achievements", () => {
            expect( AwardablePoints.TRIGGER_GROUP_SEQUENCE_COMPLETE ).toBeGreaterThanOrEqual( AwardablePoints.TRIGGER_GROUP_COMPLETE );
            expect( AwardablePoints.UNDERWORLD_UNLOCKED ).toBeGreaterThan( AwardablePoints.TRIGGER_GROUP_COMPLETE );
            expect( AwardablePoints.BUMPER ).toBeGreaterThan( AwardablePoints.TRIGGER );
        });
    });

    describe( "GameMessages enum", () => {
        it( "should define all expected message types", () => {
            expect( GameMessages.MULTIPLIER ).toBeDefined();
            expect( GameMessages.MULTIBALL ).toBeDefined();
            expect( GameMessages.LOOP ).toBeDefined();
            expect( GameMessages.GROUP_COMPLETE ).toBeDefined();
            expect( GameMessages.TRICK_SHOT ).toBeDefined();
            expect( GameMessages.UNDERWORLD_UNLOCKED ).toBeDefined();
            expect( GameMessages.ESCAPE_BONUS ).toBeDefined();
            expect( GameMessages.GOT_LUCKY ).toBeDefined();
            expect( GameMessages.TRY_AGAIN ).toBeDefined();
            expect( GameMessages.TILT ).toBeDefined();
        });
    });

    describe( "GameSounds enum", () => {
        it( "should define all expected sound types", () => {
            expect( GameSounds.BALL_OUT ).toBeDefined();
            expect( GameSounds.BUMP ).toBeDefined();
            expect( GameSounds.BUMPER ).toBeDefined();
            expect( GameSounds.EVENT ).toBeDefined();
            expect( GameSounds.FLIPPER ).toBeDefined();
            expect( GameSounds.POPPER ).toBeDefined();
            expect( GameSounds.TRIGGER ).toBeDefined();
        });
    });

    describe( "ActorTypes enum", () => {
        it( "should define circular and rectangular actor types", () => {
            expect( ActorTypes.CIRCULAR ).toBeDefined();
            expect( ActorTypes.RECTANGULAR ).toBeDefined();
        });

        it( "should define left and right flipper types", () => {
            expect( ActorTypes.LEFT_FLIPPER ).toBeDefined();
            expect( ActorTypes.RIGHT_FLIPPER ).toBeDefined();
            expect( ActorTypes.LEFT_FLIPPER ).not.toEqual( ActorTypes.RIGHT_FLIPPER );
        });

        it( "should define a trigger actor type", () => {
            expect( ActorTypes.TRIGGER ).toBeDefined();
        });
    });

    describe( "ActorLabels enum", () => {
        it( "should map labels to expected string values", () => {
            expect( ActorLabels.BALL ).toEqual( "ball" );
            expect( ActorLabels.FLIPPER ).toEqual( "flipper" );
            expect( ActorLabels.POPPER ).toEqual( "popper" );
            expect( ActorLabels.BUMPER ).toEqual( "bumper" );
            expect( ActorLabels.TRIGGER ).toEqual( "trigger" );
            expect( ActorLabels.TRIGGER_GROUP ).toEqual( "trigger-group" );
        });
    });

    describe( "TriggerTarget enum", () => {
        it( "should define all trigger targets", () => {
            expect( TriggerTarget.MULTIPLIER ).toBeDefined();
            expect( TriggerTarget.MULTIBALL ).toBeDefined();
            expect( TriggerTarget.SEQUENCE_COMPLETION ).toBeDefined();
            expect( TriggerTarget.UNDERWORLD ).toBeDefined();
            expect( TriggerTarget.TELEPORT ).toBeDefined();
        });
    });

    describe( "TriggerTypes enum", () => {
        it( "should define BOOL and SERIES trigger types", () => {
            expect( TriggerTypes.BOOL ).toBeDefined();
            expect( TriggerTypes.SERIES ).toBeDefined();
            expect( TriggerTypes.BOOL ).not.toEqual( TriggerTypes.SERIES );
        });
    });
});

describe( "Game engine public API", () => {

    describe( "getBallPosition()", () => {
        it( "should return null when no game is running", () => {
            expect( getBallPosition() ).toBeNull();
        });
    });

    describe( "getBallCount()", () => {
        it( "should return 0 when no game is running", () => {
            expect( getBallCount() ).toEqual( 0 );
        });
    });

    describe( "setPaused()", () => {
        it( "should not throw when canvas is not initialized", () => {
            expect(() => setPaused( true )).not.toThrow();
        });

        it( "should not throw when toggling pause off without canvas", () => {
            expect(() => setPaused( false )).not.toThrow();
        });
    });

    describe( "getMachineMood() (A1)", () => {
        it( "should default to calm when no game is running", () => {
            expect( getMachineMood() ).toEqual( "calm" );
        });
    });

    describe( "kill cam signal (A2)", () => {
        it( "should not consume a kill cam when none is pending", () => {
            expect( consumeKillCam() ).toBe( false );
        });

        it( "should stay consumed on repeated reads (one-shot)", () => {
            consumeKillCam();
            expect( consumeKillCam() ).toBe( false );
        });

        it( "should toggle enablement without throwing", () => {
            expect(() => setKillCamEnabled( false )).not.toThrow();
            expect(() => setKillCamEnabled( true )).not.toThrow();
        });
    });
});
