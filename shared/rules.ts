import type { RuleVariant, VariantRules } from './types.js';

export const VARIANT_RULES: Record<RuleVariant, VariantRules> = {
  block: {
    id: 'block',
    label: 'Block',
    setSize: 6,
    doublesCross: false,
    allowDraw: false,
    pipScoring: false,
    scoreMultiplier: 1,
    partnership: false,
  },
  draw: {
    id: 'draw',
    label: 'Draw',
    setSize: 6,
    doublesCross: false,
    allowDraw: true,
    pipScoring: false,
    scoreMultiplier: 1,
    partnership: false,
  },
  'all-fives': {
    id: 'all-fives',
    label: 'All Fives (Muggins)',
    setSize: 6,
    doublesCross: true,
    allowDraw: true,
    pipScoring: true,
    scoreMultiplier: 1,
    partnership: false,
  },
  caribbean: {
    id: 'caribbean',
    label: 'Caribbean (Cuban Double-Nine)',
    setSize: 9,
    doublesCross: false,
    allowDraw: false,
    pipScoring: true,
    scoreMultiplier: 1,
    partnership: true,
  },
  latin: {
    id: 'latin',
    label: 'Latin Partnership',
    setSize: 6,
    doublesCross: false,
    allowDraw: false,
    pipScoring: true,
    scoreMultiplier: 1,
    partnership: true,
  },
};

export function handSizeFor(variant: RuleVariant, _playerCount: number): number {
  if (variant === 'caribbean') return 10;
  return 7;
}
