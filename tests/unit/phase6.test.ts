import { describe, expect, it } from 'vitest';
import {
  SOUND_EFFECTS,
  SoundboardLimiter,
  effectiveLevel,
  parseSoundboardEvent,
} from '../../shared/social';
import { THEMES, getTheme, isThemeId } from '../../shared/themes';

describe('phase 6 social audio and themes', () => {
  it('exposes exactly two soundboard effects', () => {
    expect(SOUND_EFFECTS.map((effect) => effect.id)).toEqual(['applause', 'laugh']);
  });

  it('enforces cooldown and burst limits', () => {
    const limiter = new SoundboardLimiter({ burst: 2, windowMs: 10_000, cooldownMs: 1_000 }, 0);
    expect(limiter.consume(null, 0).allowed).toBe(true);
    expect(limiter.consume(0, 500).reason).toBe('cooldown');
    expect(limiter.consume(0, 1_000).allowed).toBe(true);
    expect(limiter.consume(1_000, 2_000).reason).toBe('rate-limit');
  });

  it('validates the deduplicated wire event and mixer levels', () => {
    expect(
      parseSoundboardEvent({
        id: 'event-12345',
        effect: 'applause',
        playerId: 'p1',
        name: 'Ana',
        at: 42,
      }),
    ).toMatchObject({ effect: 'applause', playerId: 'p1' });
    expect(parseSoundboardEvent({ id: 'short', effect: 'applause' })).toBeNull();
    expect(effectiveLevel(0.5, 0.4)).toBeCloseTo(0.2);
  });

  it('provides four valid palettes with a safe default', () => {
    expect(THEMES).toHaveLength(8);
    expect(THEMES.every((theme) => isThemeId(theme.id))).toBe(true);
    expect(getTheme('not-a-theme').id).toBe('classic');
  });
});
