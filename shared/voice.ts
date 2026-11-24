/**
 * Voice chat: shared types and the pure rules that decide who is heard.
 *
 * The browser owns the microphone, the peer connections and the Web Audio
 * graph; everything that can be decided without a browser lives here so it
 * can be unit tested.
 */
import type { TablePosition } from './seats.js';

export type { TablePosition };

/** How the microphone is gated. */
export type VoiceMode = 'ptt' | 'vad' | 'off';

/** The state of one remote peer, as far as this client is concerned. */
export type PeerConnectionState =
  'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

/** Why voice is unavailable, when it is. */
export type VoiceUnavailableReason =
  | 'no-microphone'
  | 'permission-denied'
  | 'no-peer-support'
  | 'unsupported-browser'
  | 'insecure-context'
  | 'unknown';

/** The voice state of one peer. */
export interface PeerVoiceState {
  readonly playerId: string;
  readonly name: string;
  /** The relative table position, used for spatial audio. */
  readonly position: TablePosition;
  readonly connection: PeerConnectionState;
  /** True while the peer is transmitting audio. */
  readonly speaking: boolean;
  /** The peer's playback volume, 0 to 1. */
  readonly volume: number;
  readonly muted: boolean;
  /** Set when the peer could not be reached. */
  readonly error: VoiceUnavailableReason | null;
}

/** The client's own voice state. */
export interface LocalVoiceState {
  readonly mode: VoiceMode;
  /** True while the local microphone is transmitting. */
  readonly transmitting: boolean;
  /** True while the push-to-talk key is held. */
  readonly talking: boolean;
  /** True while the voice-activity detector sees speech. */
  readonly detectedSpeech: boolean;
  /** True while noise suppression is running on the outgoing stream. */
  readonly noiseSuppressed: boolean;
  readonly muted: boolean;
  readonly volume: number;
  readonly error: VoiceUnavailableReason | null;
}

/** A signal message exchanged between peers. */
export interface VoiceSignal {
  readonly from: string;
  readonly to: string;
  /** The session description, when the message carries one. */
  readonly sdp?: unknown;
  /** The ICE candidate, when the message carries one. */
  readonly candidate?: unknown;
}

/** The key used to hold for push-to-talk. */
export const PTT_KEY = ' ';

/**
 * Should the microphone transmit right now?
 *
 * Push-to-talk always wins: holding the key transmits even when the
 * detector is silent, because the player asked for it. In voice-activity
 * mode the detector alone decides. Muting silences everything.
 */
export function shouldTransmit(state: {
  readonly mode: VoiceMode;
  readonly talking: boolean;
  readonly detectedSpeech: boolean;
  readonly muted: boolean;
}): boolean {
  if (state.muted) return false;
  if (state.mode === 'off') return false;
  if (state.mode === 'ptt') return state.talking;
  return state.detectedSpeech;
}

/**
 * The gain applied to a peer's audio.
 *
 * Volume is the player's own setting; muting silences a peer completely.
 * The result is clamped so a bad value can never blow up the audio graph.
 */
export function playbackGain(volume: number, muted: boolean): number {
  if (muted) return 0;
  if (!Number.isFinite(volume)) return 1;
  return Math.min(1, Math.max(0, volume));
}

/**
 * The spatial coordinates for a peer's voice, in listener space.
 *
 * The local player sits at the origin, so their own voice is never panned.
 */
export function listenerPoint(position: TablePosition): { x: number; y: number; z: number } {
  switch (position) {
    case 'left':
      return { x: -0.85, y: 0, z: 0 };
    case 'top':
      return { x: 0, y: 0, z: -1 };
    case 'right':
      return { x: 0.85, y: 0, z: 0 };
    case 'bottom':
    default:
      return { x: 0, y: 0, z: 0 };
  }
}

/** The browser features voice chat needs. */
export interface VoiceFeatures {
  readonly isSecureContext: boolean;
  readonly hasGetUserMedia: boolean;
  readonly hasPeerConnection: boolean;
  readonly hasAudioContext: boolean;
}

/**
 * The browser-side globals voice chat needs.
 *
 * The shape is declared here rather than taken from the DOM library, so the
 * shared module also compiles for the server, which has no DOM.
 */
interface VoiceWindow {
  readonly isSecureContext?: boolean;
  readonly navigator?: {
    readonly mediaDevices?: { readonly getUserMedia?: unknown };
  };
  readonly RTCPeerConnection?: unknown;
  readonly AudioContext?: unknown;
}

/** Read the browser features voice chat needs. */
export function readVoiceFeatures(
  win: VoiceWindow | undefined = globalThis as VoiceWindow,
): VoiceFeatures {
  const nav = win?.navigator;
  return {
    isSecureContext: win?.isSecureContext ?? false,
    hasGetUserMedia: typeof nav?.mediaDevices?.getUserMedia === 'function',
    hasPeerConnection: typeof win?.RTCPeerConnection === 'function',
    hasAudioContext: typeof win?.AudioContext === 'function',
  };
}

/**
 * Whether the browser can run voice chat at all.
 *
 * Voice needs a secure context (HTTPS or localhost), a microphone, the
 * WebRTC and Web Audio APIs. The reason is returned so the UI can explain
 * itself rather than silently failing.
 */
export function voiceSupport(features: VoiceFeatures): {
  supported: boolean;
  reason: VoiceUnavailableReason | null;
} {
  if (!features.isSecureContext) {
    return { supported: false, reason: 'insecure-context' };
  }
  if (!features.hasGetUserMedia) {
    return { supported: false, reason: 'no-microphone' };
  }
  if (!features.hasPeerConnection) {
    return { supported: false, reason: 'unsupported-browser' };
  }
  if (!features.hasAudioContext) {
    return { supported: false, reason: 'unsupported-browser' };
  }
  return { supported: true, reason: null };
}

/** How long a peer may stay silent before it is considered disconnected. */
export const PEER_SILENCE_TIMEOUT_MS = 12_000;
