/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2023-2024 - https://www.igorski.nl
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { GameSounds } from "@/definitions/game";
import { STORED_MUTED_FX_SETTING, STORED_MUTED_MUSIC_SETTING } from "@/definitions/settings";
import { getFromStorage, setInStorage } from "@/utils/local-storage";
import { IMMERSION } from "@/config/immersion-tuning";

let inited  = false;
let playing = false;
let suppressed = false;
let fxMuted = getFromStorage( STORED_MUTED_FX_SETTING ) === "true";
let musicMuted = getFromStorage( STORED_MUTED_MUSIC_SETTING ) === "true";
let queuedTrackId: string | null = null;
let playingTrackId: string | null = null;
let scheduledFrequency = 0;

let audioContext: AudioContext;
let filter: BiquadFilterNode;
let effectsBus: BiquadFilterNode;
let masterGain: GainNode;
let sound: HTMLMediaElement | undefined;
let acSound: MediaElementAudioSourceNode | undefined;

// Music is served from local assets only.
// (SoundCloud streaming was removed to reduce deps + avoid fragile OAuth/CORS flows.)
const MUSIC_SOURCE = "local" as const;

const SOUND_FX_PATH = "./assets/audio/";
const SOUND_EFFECTS = [
    { key: GameSounds.BALL_OUT,  file: "sfx_ball_out.mp3" },
    { key: GameSounds.BUMP,      file: "sfx_bump.mp3" },
    { key: GameSounds.BUMPER,    file: "sfx_bumper.mp3" },
    { key: GameSounds.EVENT,     file: "sfx_event.mp3" },
    { key: GameSounds.FLIPPER,   file: "sfx_flipper.mp3" },
    { key: GameSounds.POPPER,    file: "sfx_popper.mp3" },
    { key: GameSounds.TRIGGER,   file: "sfx_trigger.mp3" },
    // Kamikaze Ball sounds (reuse base samples; per-effect character below)
    { key: GameSounds.POWERUP_ROULETTE, file: "sfx_trigger.mp3" },
    { key: GameSounds.POWERUP_ACTIVATE, file: "sfx_event.mp3" },
    { key: GameSounds.DRAIN_VICTORY,    file: "sfx_popper.mp3" },
    { key: GameSounds.AI_SAVE,          file: "sfx_flipper.mp3" },
];

// Distinct sonic identity for kamikaze events: fixed detune/rate (small jitter)
// instead of the fully random pitch used for generic table sounds.
const FX_CHARACTER = new Map<GameSounds, { detune: number; rate: number }>([
    [ GameSounds.POWERUP_ROULETTE, { detune: 700,  rate: 1.35 }],
    [ GameSounds.POWERUP_ACTIVATE, { detune: 450,  rate: 1.15 }],
    [ GameSounds.DRAIN_VICTORY,    { detune: -500, rate: 0.8 }],
    [ GameSounds.AI_SAVE,          { detune: -900, rate: 0.65 }],
]);

const soundEffects: Map<GameSounds, HTMLMediaElement> = new Map();

// ── Sound density (cosmetic only: never feeds physics) ─────────────
// One sample per event sounds like a loop pedal. Each hit instead plays a
// decoded buffer through its own voice (so rapid hits overlap instead of
// cutting off), picks the next of several timbre variants round-robin, scales
// gain/pitch/brightness with impact speed and pans by where it happened.

export type FxOptions = {
    /** 0..1 impact strength (e.g. ball speed). Default 0.6. */
    intensity?: number;
    /** -1 (left) .. 1 (right). Default 0 (centre). */
    pan?: number;
};

type FxVariant = { detune: number; rate: number; cutoff: number };

/** Timbre variants per event; picked round-robin, never the same twice running. */
export const FX_VARIANTS: Partial<Record<GameSounds, FxVariant[]>> = {
    [ GameSounds.BUMPER ]: [
        { detune: 0,    rate: 1,    cutoff: 9000 },
        { detune: 300,  rate: 1.08, cutoff: 12000 },
        { detune: -250, rate: 0.94, cutoff: 7000 },
        { detune: 500,  rate: 1.12, cutoff: 14000 },
        { detune: -450, rate: 0.9,  cutoff: 6000 },
        { detune: 150,  rate: 1.04, cutoff: 10000 },
    ],
    [ GameSounds.POPPER ]: [
        { detune: 0,    rate: 1,    cutoff: 10000 },
        { detune: -300, rate: 0.92, cutoff: 7000 },
        { detune: 250,  rate: 1.06, cutoff: 12000 },
        { detune: -600, rate: 0.85, cutoff: 5500 },
    ],
    [ GameSounds.FLIPPER ]: [
        { detune: 0,    rate: 1,    cutoff: 8000 },
        { detune: -150, rate: 0.97, cutoff: 6500 },
        { detune: 120,  rate: 1.03, cutoff: 9500 },
        { detune: -80,  rate: 0.99, cutoff: 7200 },
    ],
    [ GameSounds.TRIGGER ]: [
        { detune: 0,    rate: 1,    cutoff: 12000 },
        { detune: 200,  rate: 1.05, cutoff: 14000 },
        { detune: 400,  rate: 1.1,  cutoff: 16000 },
        { detune: 700,  rate: 1.18, cutoff: 18000 },
    ],
    [ GameSounds.BUMP ]: [
        { detune: 0,    rate: 1,    cutoff: 3000 },
        { detune: -200, rate: 0.95, cutoff: 2400 },
        { detune: 150,  rate: 1.04, cutoff: 3600 },
    ],
};

const variantCursor = new Map<GameSounds, number>();

/** Next timbre variant for `effect` (round-robin). Exported for tests. */
export const nextFxVariant = ( effect: GameSounds ): FxVariant | undefined => {
    const list = FX_VARIANTS[ effect ];
    if ( !list?.length ) return undefined;
    const i = ( ( variantCursor.get( effect ) ?? -1 ) + 1 ) % list.length;
    variantCursor.set( effect, i );
    return list[ i ];
};

/** Clamp to [lo, hi]; NaN → lo. */
const clamp = ( v: number, lo: number, hi: number ): number => ( v > lo ? ( v < hi ? v : hi ) : lo );

/**
 * Pure mix for an impact: harder hits are louder, a touch higher and brighter.
 * Gain spans ~-14dB..0dB so soft grazes stay audible under the music.
 */
export const impactMix = ( intensity = 0.6 ): { gain: number; detune: number; brightness: number } => {
    const i = clamp( intensity, 0, 1 );
    return { gain: 0.2 + 0.8 * i * i, detune: ( i - 0.5 ) * 240, brightness: 0.45 + 0.55 * i };
};

/** Stereo position for a table x coordinate. Kept off the hard edges. */
export const panForX = ( x: number, width: number ): number => {
    if ( !( width > 0 ) || !Number.isFinite( x ) ) return 0;
    return clamp( ( x / width ) * 2 - 1, -1, 1 ) * 0.8;
};

/** Impact strength from a ball velocity (physics units/tick). */
export const intensityForSpeed = ( vx: number, vy: number, fullAt = 22 ): number =>
    clamp( Math.hypot( vx, vy ) / fullAt, 0, 1 );

const fxBuffers = new Map<GameSounds, AudioBuffer | null>();

function loadFxBuffers(): void {
    if ( !audioContext || typeof fetch !== "function" ) return;
    for ( const { key, file } of SOUND_EFFECTS ) {
        if ( fxBuffers.has( key )) continue;
        fxBuffers.set( key, null ); // in flight; element path covers it meanwhile
        fetch( `${SOUND_FX_PATH}${file}` )
            .then( r => r.arrayBuffer() )
            .then( data => audioContext.decodeAudioData( data ))
            .then( buf => { fxBuffers.set( key, buf ); })
            .catch(() => { /* keep the <audio> element fallback */ });
    }
}

/** A short struck-metal partial over hard bumper hits: the table's "ting". */
function playMetalTing( when: number, gain: number, panNode: AudioNode ): void {
    const g = audioContext.createGain();
    g.gain.setValueAtTime( 0.0001, when );
    g.gain.exponentialRampToValueAtTime( gain, when + 0.004 );
    g.gain.exponentialRampToValueAtTime( 0.0001, when + 0.22 );
    g.connect( panNode );
    const base = 1800 + Math.random() * 900;
    for ( const ratio of [ 1, 2.76, 5.4 ] ) {
        const o = audioContext.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime( base * ratio, when );
        o.connect( g );
        o.start( when );
        o.stop( when + 0.24 );
    }
}

/** Play via a fresh buffer voice. False when no decoded buffer is ready. */
function playFxVoice( effect: GameSounds, opts: FxOptions ): boolean {
    const buffer = fxBuffers.get( effect );
    if ( !audioContext || !buffer || !effectsBus ) return false;
    const now = audioContext.currentTime;
    const character = FX_CHARACTER.get( effect );
    const variant = nextFxVariant( effect );
    const mix = impactMix( opts.intensity );

    const src = audioContext.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = ( character?.rate ?? 1 ) * ( variant?.rate ?? 1 );
    // Small human jitter so even the same variant never repeats exactly.
    src.detune.value = ( character?.detune ?? 0 ) + ( variant?.detune ?? 0 ) + mix.detune + ( Math.random() * 60 - 30 );

    const tone = audioContext.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = ( variant?.cutoff ?? 12000 ) * mix.brightness;

    const gain = audioContext.createGain();
    gain.gain.value = mix.gain;

    let out: AudioNode = gain;
    if ( typeof audioContext.createStereoPanner === "function" ) {
        const panner = audioContext.createStereoPanner();
        panner.pan.value = clamp( opts.pan ?? 0, -1, 1 );
        gain.connect( panner );
        out = panner;
    }
    out.connect( masterGain );
    src.connect( tone ).connect( gain );
    src.start( now );

    if ( effect === GameSounds.BUMPER && ( opts.intensity ?? 0 ) > 0.55 ) {
        playMetalTing( now, 0.05 + 0.1 * ( ( opts.intensity ?? 0 ) - 0.55 ), gain );
    }
    return true;
}

/**
 * Must be called on user interaction to prevent locked AudioContext
 */
export const init = (): void => {
    if ( inited ) {
        return;
    }
    inited = true;

    setupWebAudioAPI();

    if ( !fxMuted ) {
        loadSoundEffects();
    }

    // enqueue the first track for playback
    if ( queuedTrackId !== null ) {
        enqueueTrack( queuedTrackId );
    }
};

/**
 * Attract/demo mode: silence everything without touching the user's
 * persisted mute settings.
 */
export const setAudioSuppressed = ( value: boolean ): void => {
    suppressed = value;
    if ( suppressed && playing ) {
        stop();
    }
};

export const playSoundEffect = ( effect: GameSounds, opts: FxOptions = {} ): void => {
    if ( !inited || fxMuted || suppressed ) {
        return;
    }

    if ( soundEffects.size === 0 ) {
        loadSoundEffects();
    }
    if ( playFxVoice( effect, opts )) {
        return;
    }

    const soundEffect = soundEffects.get( effect );
    if ( soundEffect ) {
        _playSoundFX( soundEffect, effect );
    }
};

/**
 * Briefly dip the music/FX volume so a key moment (drain, AI save) punches
 * through the mix, then ramp back to full.
 */
export const duckMusic = ( durationMs = 700, level = 0.25 ): void => {
    if ( !audioContext || !masterGain ) {
        return;
    }
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues( now );
    masterGain.gain.setValueAtTime( masterGain.gain.value, now );
    masterGain.gain.linearRampToValueAtTime( level, now + 0.05 );
    masterGain.gain.linearRampToValueAtTime( 1, now + Math.max( 0.1, durationMs / 1000 ));
};

/**
 * B3 "audio dodge": cut the master bus to near-silence for a beat, then
 * restore. On a near-drain save the sudden vacuum reads louder than any SFX —
 * the table holds its breath, then the save lands. Cancels any pending duck
 * so it wins when both fire on the same moment.
 */
export const momentarySilence = ( durationMs = 200 ): void => {
    if ( !audioContext || !masterGain ) {
        return;
    }
    const now = audioContext.currentTime;
    const hold = Math.max( 0.05, durationMs / 1000 );
    masterGain.gain.cancelScheduledValues( now );
    masterGain.gain.setValueAtTime( masterGain.gain.value, now );
    masterGain.gain.linearRampToValueAtTime( 0.0001, now + 0.015 );
    masterGain.gain.setValueAtTime( 0.0001, now + hold );
    masterGain.gain.linearRampToValueAtTime( 1, now + hold + 0.08 );
};

// ── Japanese identity sounds (synthesized, no new assets) ────────
// Taiko: a deep drum thump for bumper hits during Kamikaze mode.
// Furin: a glass wind-chime ring for the winning drain.
let taikoNoiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(): AudioBuffer | null {
    if ( !taikoNoiseBuffer && audioContext ) {
        const len = Math.floor( audioContext.sampleRate * 0.1 );
        taikoNoiseBuffer = audioContext.createBuffer( 1, len, audioContext.sampleRate );
        const data = taikoNoiseBuffer.getChannelData( 0 );
        for ( let i = 0; i < len; i++ ) data[i] = Math.random() * 2 - 1;
    }
    return taikoNoiseBuffer;
}

export const playTaikoHit = ( deep = false ): void => {
    if ( !inited || fxMuted || suppressed || !audioContext || !masterGain ) {
        return;
    }
    const t = audioContext.currentTime;
    // Body thump: pitched-down sine. The kill-cam variant (deep) drops the
    // fundamental lower and rings longer — the gate closing on the blossom.
    const startFreq = deep ? 62 : 95;
    const endFreq = deep ? 28 : 45;
    const decay = deep ? 0.42 : 0.22;
    const osc = audioContext.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime( startFreq, t );
    osc.frequency.exponentialRampToValueAtTime( endFreq, t + ( deep ? 0.28 : 0.16 ) );
    const g = audioContext.createGain();
    g.gain.setValueAtTime( deep ? 1.0 : 0.9, t );
    g.gain.exponentialRampToValueAtTime( 0.001, t + decay );
    osc.connect( g ).connect( masterGain );
    osc.start( t );
    osc.stop( t + decay + 0.05 );
    // Stick attack: short band-passed noise burst.
    const noiseBuf = getNoiseBuffer();
    if ( noiseBuf ) {
        const noise = audioContext.createBufferSource();
        noise.buffer = noiseBuf;
        const nf = audioContext.createBiquadFilter();
        nf.type = "bandpass";
        nf.frequency.value = 900;
        nf.Q.value = 0.8;
        const ng = audioContext.createGain();
        ng.gain.setValueAtTime( 0.35, t );
        ng.gain.exponentialRampToValueAtTime( 0.001, t + 0.06 );
        noise.connect( nf ).connect( ng ).connect( masterGain );
        noise.start( t );
        noise.stop( t + 0.08 );
    }
};

export const playFurinChime = (): void => {
    if ( !inited || fxMuted || suppressed || !audioContext || !masterGain ) {
        return;
    }
    const t = audioContext.currentTime;
    // Two-ish detuned high sine partials with a long ring — a glass furin.
    const partials = [
        { freq: 2637, gain: 0.16, dur: 1.4 },
        { freq: 3951, gain: 0.10, dur: 1.1 },
        { freq: 1975, gain: 0.08, dur: 1.6 },
    ];
    for ( const p of partials ) {
        const osc = audioContext.createOscillator();
        osc.type = "sine";
        osc.frequency.value = p.freq * ( 1 + ( Math.random() - 0.5 ) * 0.004 );
        const g = audioContext.createGain();
        g.gain.setValueAtTime( 0.0001, t );
        g.gain.exponentialRampToValueAtTime( p.gain, t + 0.012 );
        g.gain.exponentialRampToValueAtTime( 0.0001, t + p.dur );
        osc.connect( g ).connect( masterGain );
        osc.start( t );
        osc.stop( t + p.dur + 0.05 );
    }
};

// ── Verb feedback sounds (control feel) ─────────────────────────────
// Distinct SFX per player verb so every action audibly "lands".

/** Nudge: a soft breathy whoosh rising in pitch with power. */
export const playVerbNudge = ( power = 1 ): void => {
    if ( !inited || fxMuted || suppressed || !audioContext || !masterGain ) {
        return;
    }
    const t = audioContext.currentTime;
    const noiseBuf = getNoiseBuffer();
    if ( noiseBuf ) {
        const noise = audioContext.createBufferSource();
        noise.buffer = noiseBuf;
        const f = audioContext.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.setValueAtTime( 600 + power * 300, t );
        f.frequency.exponentialRampToValueAtTime( 1800 + power * 500, t + 0.12 );
        f.Q.value = 0.6;
        const g = audioContext.createGain();
        g.gain.setValueAtTime( 0.16 * Math.min( power, 3 ) / 3 + 0.08, t );
        g.gain.exponentialRampToValueAtTime( 0.001, t + 0.15 );
        noise.connect( f ).connect( g ).connect( masterGain );
        noise.start( t );
        noise.stop( t + 0.18 );
    }
};

/** Dive: a deep descending thud — committing to the fall. */
export const playVerbDive = (): void => {
    if ( !inited || fxMuted || suppressed || !audioContext || !masterGain ) {
        return;
    }
    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime( 160, t );
    osc.frequency.exponentialRampToValueAtTime( 38, t + 0.3 );
    const g = audioContext.createGain();
    g.gain.setValueAtTime( 0.85, t );
    g.gain.exponentialRampToValueAtTime( 0.001, t + 0.35 );
    osc.connect( g ).connect( masterGain );
    osc.start( t );
    osc.stop( t + 0.4 );
    const noiseBuf = getNoiseBuffer();
    if ( noiseBuf ) {
        const noise = audioContext.createBufferSource();
        noise.buffer = noiseBuf;
        const nf = audioContext.createBiquadFilter();
        nf.type = "lowpass";
        nf.frequency.value = 400;
        const ng = audioContext.createGain();
        ng.gain.setValueAtTime( 0.4, t );
        ng.gain.exponentialRampToValueAtTime( 0.001, t + 0.12 );
        noise.connect( nf ).connect( ng ).connect( masterGain );
        noise.start( t );
        noise.stop( t + 0.15 );
    }
};

/** Deploy: a bright metallic "shing" — unsheathing the banked munition. */
export const playVerbDeploy = (): void => {
    if ( !inited || fxMuted || suppressed || !audioContext || !masterGain ) {
        return;
    }
    const t = audioContext.currentTime;
    const partials = [
        { freq: 1108, gain: 0.18, dur: 0.35 },
        { freq: 1661, gain: 0.12, dur: 0.28 },
        { freq: 2217, gain: 0.09, dur: 0.22 },
    ];
    for ( const p of partials ) {
        const osc = audioContext.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = p.freq;
        const g = audioContext.createGain();
        g.gain.setValueAtTime( 0.0001, t );
        g.gain.exponentialRampToValueAtTime( p.gain, t + 0.008 );
        g.gain.exponentialRampToValueAtTime( 0.0001, t + p.dur );
        osc.connect( g ).connect( masterGain );
        osc.start( t );
        osc.stop( t + p.dur + 0.03 );
    }
};

/** Charge: a rising pitch while the player holds — tension building. */
export const playVerbChargeTick = ( power: number ): void => {
    if ( !inited || fxMuted || suppressed || !audioContext || !masterGain ) {
        return;
    }
    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime( 220 + power * 180, t );
    const g = audioContext.createGain();
    g.gain.setValueAtTime( 0.04, t );
    g.gain.exponentialRampToValueAtTime( 0.001, t + 0.06 );
    osc.connect( g ).connect( masterGain );
    osc.start( t );
    osc.stop( t + 0.08 );
};

/** Tilt-lock: a hard metallic clank — seizing the table from the machine. */
export const playVerbTiltLock = (): void => {
    if ( !inited || fxMuted || suppressed || !audioContext || !masterGain ) {
        return;
    }
    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime( 180, t );
    osc.frequency.exponentialRampToValueAtTime( 90, t + 0.12 );
    const f = audioContext.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 700;
    const g = audioContext.createGain();
    g.gain.setValueAtTime( 0.22, t );
    g.gain.exponentialRampToValueAtTime( 0.001, t + 0.18 );
    osc.connect( f ).connect( g ).connect( masterGain );
    osc.start( t );
    osc.stop( t + 0.2 );
};

/**
 * What the browser knows about the connection, where it exposes anything at
 * all: Chrome/Android only. iOS Safari has no Network Information API, so the
 * checks below simply do not apply there.
 */
export type ConnectionHint = { saveData?: boolean; effectiveType?: string };

/**
 * Whether a music track is worth fetching right now. Pure.
 *
 * The music is the largest thing the game sends and the least necessary — a run
 * is seconds long — so it is the first thing to withhold when the player has
 * already told the browser they are on a metered or slow link. `saveData` is an
 * explicit preference rather than a guess, and honouring it is the one case
 * where spending the bytes is straightforwardly the wrong call.
 *
 * This is a withhold, not a delay: the fetch is already sequenced after the
 * world has loaded (GameMount awaits mountWorld before mountGame, and the only
 * enqueue lives in game init), so nothing critical is being raced here.
 */
export const shouldFetchMusic = ( connection?: ConnectionHint | null ): boolean => {
    if ( !connection ) {
        return true;
    }
    if ( connection.saveData === true ) {
        return false;
    }
    return connection.effectiveType !== "slow-2g" && connection.effectiveType !== "2g";
};

function connectionHint(): ConnectionHint | null {
    if ( typeof navigator === "undefined" ) {
        return null;
    }
    return ( navigator as Navigator & { connection?: ConnectionHint } ).connection ?? null;
}

/**
 * enqueue a track from the available pool for playing
 */
export const enqueueTrack = async( trackId: string ): Promise<void> => {
    if ( !inited || musicMuted || suppressed ) {
        queuedTrackId = trackId;
        return;
    }

    queuedTrackId = null;

    if ( playingTrackId === trackId ) {
        setFrequency();
        return;
    }

    // Hold the track rather than dropping it: the connection may improve, and
    // every later trigger re-checks before fetching (unmuting music, a further
    // enqueue). Nothing is fetched on a metered or slow link.
    if ( !shouldFetchMusic( connectionHint() )) {
        queuedTrackId = trackId;
        return;
    }

    stop();

    // Local-only music
    sound = createAudioElement( `${SOUND_FX_PATH}music_${trackId}.mp3`, true, masterGain );
    _startPlayingEnqueuedTrack( trackId );
};

export const stop = (): void => {
    if ( sound ) {
        if ( audioContext ) {
            acSound?.disconnect();
            acSound = undefined;
        }
        sound.pause();
        sound = undefined;
        playingTrackId = null;
    }
    playing = false;
};

export const setFrequency = ( value = 22050 ): void => {
    if ( scheduledFrequency === value ) {
        return;
    }
    if ( audioContext ) {
        scheduledFrequency = value;

        filter.frequency.cancelScheduledValues( audioContext.currentTime );
        filter.frequency.linearRampToValueAtTime( scheduledFrequency, audioContext.currentTime + 1.5 )
    }
};

export const getFxMuted = (): boolean => {
    return fxMuted;
};

export const setFxMuted = ( value: boolean ): void => {
    fxMuted = value;
    setInStorage( STORED_MUTED_FX_SETTING, fxMuted.toString() );
};

export const getMusicMuted = (): boolean => {
    return musicMuted;
};

export const setMusicMuted = ( value: boolean ): void => {
    musicMuted = value;
    setInStorage( STORED_MUTED_MUSIC_SETTING, musicMuted.toString() );

    if ( musicMuted && playing ) {
        stop();
    } else if ( !musicMuted && playing && queuedTrackId ) {
        enqueueTrack( queuedTrackId );
    }
};

/* internal methods */

function _startPlayingEnqueuedTrack( trackId: string ): void {
    if ( !sound ) {
        return;
    }
    try {
        sound.play();
        playingTrackId = trackId;
    } catch ( e ) {
        // no supported sources
        return;
    }
    playing = true;
}

function loadSoundEffects(): void {
    loadFxBuffers();
    SOUND_EFFECTS.forEach( mapping => {
        soundEffects.set( mapping.key, createAudioElement( `${SOUND_FX_PATH}${mapping.file}`, false, effectsBus ));
    });
}

function createAudioElement( source: string, loop = false, bus?: AudioNode ): HTMLMediaElement {
    const element = document.createElement( "audio" );
    element.crossOrigin = "anonymous";
    element.setAttribute( "src", source );

    if ( loop ) {
        element.setAttribute( "loop", "loop" );
    }

    // connect sound to AudioContext when supported
    if ( bus ) {
        acSound = audioContext.createMediaElementSource( element );
        acSound.connect( bus );
    }
    return element;
}

function _playSoundFX( audioElement: HTMLMediaElement, effect?: GameSounds ): void {
    if ( audioElement.currentTime > 0 && !audioElement.ended ) {
        return;
    }
    audioElement.currentTime = 0;
    const character = effect !== undefined ? FX_CHARACTER.get( effect ) : undefined;
    if ( effectsBus ) {
        if ( character ) {
            // fixed identity + slight jitter so repeats don't sound robotic
            effectsBus.detune.value = character.detune - 100 + ( Math.random() * 200 );
        } else {
            // randomize pitch to prevent BOREDOM
            effectsBus.detune.value = -1200 + ( Math.random() * 2400 ); // in -1200 to +1200 range
        }
    }
    audioElement.playbackRate = character?.rate ?? 1;
    if ( !audioElement.paused || audioElement.currentTime ) {
        audioElement.currentTime = 0; // audio was paused/stopped
    } else {
        audioElement.play();
    }
}

function setupWebAudioAPI(): void {
    // @ts-expect-error Property 'webkitAudioContext' does not exist on type 'Window & typeof globalThis'
    const acConstructor = window.AudioContext || window.webkitAudioContext;
    if ( typeof acConstructor !== "undefined" ) {
        audioContext = new acConstructor();
        // a "channel strip" to connect all audio nodes to
        masterGain = audioContext.createGain();
        // a bus for all sound effects (biquad filter allows detuning)
        effectsBus = audioContext.createBiquadFilter();
        effectsBus.connect( masterGain );
        // a low-pass filter to apply onto the master bus
        filter = audioContext.createBiquadFilter();
        filter.type = "lowpass";
        masterGain.connect( filter );
        // filter connects to the output so we can actually hear stuff
        filter.connect( audioContext.destination );
        // set default frequency of filter
        setFrequency();
    }
}

// ── B3 Machine pulse (adaptive taiko heartbeat) ────────────────
// MAMORU's emotional state drives a synthesized heartbeat under the music:
// calm 60bpm single low hit · wary 90bpm doublet · desperate 120bpm + noise
// burst · enraged irregular · grieving stops dead. Lookahead scheduler
// (100ms tick, 200ms schedule-ahead). Wall-clock cosmetic only — never feeds
// physics, so it can use Math.random() freely (hard rule 1 is physics-only).
// Mixed ~-18dB under the music loop; respects suppress + music mute.

let pulseTimer: number | null = null;
let pulseNextTime = 0;
let pulseGetMood: () => string = () => "calm";

const PULSE_BPM: Record<string, number> = IMMERSION.pulse.bpm;

/** Tempo (bpm) for a mood; 0 = the heartbeat stops (grieving). Pure (B3). */
export const pulseBpmForMood = ( mood: string ): number => PULSE_BPM[ mood ] ?? 60;

function schedulePulseHit( time: number, mood: string ): void {
    if ( !audioContext || !masterGain ) return;
    const osc = audioContext.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime( 70, time );
    osc.frequency.exponentialRampToValueAtTime( 38, time + 0.14 );
    const g = audioContext.createGain();
    const peak = ( mood === "desperate" || mood === "enraged" ) ? IMMERSION.pulse.intenseGain : IMMERSION.pulse.gain;
    g.gain.setValueAtTime( peak, time );
    g.gain.exponentialRampToValueAtTime( 0.001, time + 0.2 );
    osc.connect( g ).connect( masterGain );
    osc.start( time );
    osc.stop( time + 0.25 );
    // desperate adds a breathy noise burst on top of the thump
    if ( mood === "desperate" ) {
        const nb = getNoiseBuffer();
        if ( nb ) {
            const noise = audioContext.createBufferSource();
            noise.buffer = nb;
            const nf = audioContext.createBiquadFilter();
            nf.type = "bandpass";
            nf.frequency.value = 600;
            nf.Q.value = 0.7;
            const ng = audioContext.createGain();
            ng.gain.setValueAtTime( 0.08, time );
            ng.gain.exponentialRampToValueAtTime( 0.001, time + 0.08 );
            noise.connect( nf ).connect( ng ).connect( masterGain );
            noise.start( time );
            noise.stop( time + 0.1 );
        }
    }
}

function pulseTick(): void {
    if ( !audioContext || !masterGain ) return;
    // No catch-up bursts: if we fell behind (e.g. context just started), resume
    // from now. While suppressed/music-muted the pulse is silent but keeps time.
    if ( pulseNextTime < audioContext.currentTime ) {
        pulseNextTime = audioContext.currentTime;
    }
    if ( suppressed || musicMuted ) return;
    const mood = pulseGetMood();
    const bpm = pulseBpmForMood( mood );
    if ( bpm === 0 ) return; // grieving: the heartbeat stops
    const secondsPerBeat = 60 / bpm;
    while ( pulseNextTime < audioContext.currentTime + IMMERSION.pulse.scheduleAheadS ) {
        const interval = mood === "enraged"
            ? secondsPerBeat * ( 0.6 + Math.random() * 0.8 )
            : secondsPerBeat;
        schedulePulseHit( pulseNextTime, mood );
        if ( mood === "wary" ) {
            schedulePulseHit( pulseNextTime + interval * 0.5, mood ); // doublet
        }
        pulseNextTime += interval;
    }
}

/**
 * Start the machine heartbeat, reading the live mood from `getMood`. Idempotent.
 */
export const startMachinePulse = ( getMood: () => string ): void => {
    pulseGetMood = getMood;
    if ( pulseTimer !== null ) return;
    pulseNextTime = audioContext ? audioContext.currentTime : 0;
    pulseTimer = window.setInterval( pulseTick, IMMERSION.pulse.lookaheadTickMs );
};

export const stopMachinePulse = (): void => {
    if ( pulseTimer !== null ) {
        window.clearInterval( pulseTimer );
        pulseTimer = null;
    }
};
