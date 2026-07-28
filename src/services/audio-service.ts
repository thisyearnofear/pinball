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

export const playSoundEffect = ( effect: GameSounds ): void => {
    if ( !inited || fxMuted || suppressed ) {
        return;
    }

    if ( soundEffects.size === 0 ) {
        loadSoundEffects();
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

export const playTaikoHit = (): void => {
    if ( !inited || fxMuted || suppressed || !audioContext || !masterGain ) {
        return;
    }
    const t = audioContext.currentTime;
    // Body thump: pitched-down sine.
    const osc = audioContext.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime( 95, t );
    osc.frequency.exponentialRampToValueAtTime( 45, t + 0.16 );
    const g = audioContext.createGain();
    g.gain.setValueAtTime( 0.9, t );
    g.gain.exponentialRampToValueAtTime( 0.001, t + 0.22 );
    osc.connect( g ).connect( masterGain );
    osc.start( t );
    osc.stop( t + 0.25 );
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
