/**
 * Social audio: the soundboard catalogue, the anti-spam rules, the mixer
 * channels and the wire format used to share a soundboard press with the
 * rest of the table.
 *
 * The rules live here (not in the browser) so both the client and the
 * signaling server can enforce the same limits without drifting apart.
 */

/** The eight soundboard effects a player can trigger. */
export type SoundEffectId =
  | 'applause'
  | 'laugh'
  | 'boo'
  | 'gasp'
  | 'whistle'
  | 'gong'
  | 'dice'
  | 'cheer';

/** The two effects exposed by the table soundboard. */
export const SOUND_EFFECTS: readonly {
  readonly id: SoundEffectId;
  readonly label: string;
  /** A short glyph so the mobile grid needs no image assets. */
  readonly glyph: string;
}[] = [
  { id: 'applause', label: 'Applause', glyph: '👏' },
  { id: 'laugh', label: 'Laugh', glyph: '😄' },
] as const;

/** The sound effect ids, as a lookup. */
export const SOUND_EFFECT_IDS: readonly SoundEffectId[] = SOUND_EFFECTS.map(
  (effect) => effect.id,
);

/** Whether a value is one of the exposed effects. */
export function isSoundEffectId(value: unknown): value is SoundEffectId {
  return typeof value === 'string' && (SOUND_EFFECT_IDS as readonly string[]).includes(value);
}

/* ------------------------------- Anti-spam ------------------------------- */

/** The anti-spam budget for one player. */
export interface SoundboardLimits {
  /** How many presses are allowed inside the window. */
  readonly burst: number;
  /** The window length in milliseconds. */
  readonly windowMs: number;
  /** The shortest gap between two presses, in milliseconds. */
  readonly cooldownMs: number;
}

/** The default anti-spam budget: four presses every ten seconds. */
export const DEFAULT_SOUNDBOARD_LIMITS: SoundboardLimits = {
  burst: 4,
  windowMs: 10_000,
  cooldownMs: 1_200,
};

/** Why a soundboard press was refused. */
export type SoundboardRejection = 'unknown-effect' | 'cooldown' | 'rate-limit' | 'muted';

export interface SoundboardDecision {
  /** True when the press may play. */
  readonly allowed: boolean;
  /** The reason, when the press was refused. */
  readonly reason: SoundboardRejection | null;
  /** How many presses remain in the current window. */
  readonly remaining: number;
}
/**
 * A token bucket that enforces the anti-spam budget.
 *
 * The bucket refills continuously, so a player may burst up to `burst`
 * presses and then must wait for the window to reopen.
 */
export class SoundboardLimiter {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly limits: SoundboardLimits = DEFAULT_SOUNDBOARD_LIMITS,
    now = Date.now(),
  ) {
    this.tokens = limits.burst;
    this.updatedAt = now;
  }

  /** Refill the bucket for the time that has passed. */
  private refill(now: number): void {
    if (now <= this.updatedAt) return;
    const elapsed = now - this.updatedAt;
    const refillRate = this.limits.burst / this.limits.windowMs;
    this.tokens = Math.min(this.limits.burst, this.tokens + elapsed * refillRate);
    this.updatedAt = now;
  }

  /** How many presses are still allowed right now. */
  remaining(now = Date.now()): number {
    this.refill(now);
    return Math.floor(this.tokens);
  }

  /** Ask whether a press may play, without consuming the budget. */
  check(lastAt: number | null, now = Date.now()): SoundboardDecision {
    this.refill(now);
    if (lastAt !== null && now - lastAt < this.limits.cooldownMs) {
      return { allowed: false, reason: 'cooldown', remaining: Math.floor(this.tokens) };
    }
    if (this.tokens < 1) {
      return { allowed: false, reason: 'rate-limit', remaining: 0 };
    }
    return { allowed: true, reason: null, remaining: Math.floor(this.tokens) };
  }

  /** Consume one press, or report why it was refused. */
  consume(lastAt: number | null, now = Date.now()): SoundboardDecision {
    const decision = this.check(lastAt, now);
    if (!decision.allowed) return decision;
    this.tokens -= 1;
    this.updatedAt = now;
    return { allowed: true, reason: null, remaining: Math.floor(this.tokens) };
  }
}

/* --------------------------------- Wire ---------------------------------- */

/** A soundboard press as it travels between players. */
export interface SoundboardEvent {
  /** Unique id used to collapse peer and fallback delivery. */
  readonly id: string;
  /** The effect that was pressed. */
  readonly effect: SoundEffectId;
  /** Who pressed it. */
  readonly playerId: string;
  /** Their display name. */
  readonly name: string;
  /** When it was pressed. */
  readonly at: number;
}

/**
 * Parse an incoming soundboard payload.
 *
 * The payload is untrusted, so every field is checked before it is used.
 */
export function parseSoundboardEvent(payload: unknown): SoundboardEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as Record<string, unknown>;
  if (typeof body.id !== 'string' || body.id.length < 8 || body.id.length > 80) return null;
  if (!isSoundEffectId(body.effect)) return null;
  if (typeof body.playerId !== 'string' || !body.playerId) return null;
  if (typeof body.name !== 'string') return null;
  const at = typeof body.at === 'number' && Number.isFinite(body.at) ? body.at : Date.now();
  return {
    id: body.id,
    effect: body.effect,
    playerId: body.playerId,
    name: body.name.slice(0, 24),
    at,
  };
}

/* -------------------------------- Mixer ---------------------------------- */

/** The mixer channels a player can balance. */
export type AudioChannelId = 'effects' | 'music' | 'voice' | 'ambience';

/** The mixer channels, in the order the mixer shows them. */
export const AUDIO_CHANNELS: readonly { readonly id: AudioChannelId; readonly label: string }[] = [
  { id: 'effects', label: 'Effects' },
  { id: 'music', label: 'Music' },
  { id: 'voice', label: 'Voice' },
  { id: 'ambience', label: 'Ambience' },
] as const;

/** The mixer channel ids. */
export const AUDIO_CHANNEL_IDS: readonly AudioChannelId[] = AUDIO_CHANNELS.map(
  (channel) => channel.id,
);

/** The mixer's channel levels, each between 0 and 1. */
export type MixLevels = Readonly<Record<AudioChannelId, number>>;

/** The mixer's starting levels. */
export const DEFAULT_MIX_LEVELS: MixLevels = {
  effects: 0.8,
  music: 0.45,
  voice: 1,
  ambience: 0.6,
};

/**
 * Clamp a level into the 0..1 range the audio graph accepts.
 *
 * A bad value from storage or a corrupted preference must never make the
 * audio graph blow up, so every level passes through here.
 */
export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(1, Math.max(0, level));
}

/** Apply a channel level to a master level. */
export function effectiveLevel(master: number, channel: number): number {
  return clampLevel(clampLevel(master) * clampLevel(channel));
}
