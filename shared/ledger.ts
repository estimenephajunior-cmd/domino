import type { RuleVariant } from './types.js';

export type PlayerTitle = 'The Executioner' | 'The Houdini' | null;

export interface LedgerMatchPlayer {
  readonly profileId: string;
  readonly name: string;
  readonly score: number;
  readonly won: boolean;
  readonly finalHandCount: number;
  readonly draws: number;
}

export interface LedgerMatch {
  readonly id: string;
  readonly roomCode: string;
  readonly variant: RuleVariant;
  readonly playedAt: number;
  readonly handNumber: number;
  readonly blocked: boolean;
  readonly players: readonly LedgerMatchPlayer[];
}

export interface RivalryPoint {
  readonly playedAt: number;
  readonly myWins: number;
  readonly rivalWins: number;
}

export interface RivalrySummary {
  readonly profileId: string;
  readonly name: string;
  readonly matches: number;
  readonly myWins: number;
  readonly rivalWins: number;
  readonly series: readonly RivalryPoint[];
}

export interface LedgerSnapshot {
  readonly profileId: string;
  readonly title: PlayerTitle;
  readonly matchesPlayed: number;
  readonly wins: number;
  readonly winRate: number;
  readonly history: readonly LedgerMatch[];
  readonly rivalries: readonly RivalrySummary[];
  readonly generatedAt: number;
}

export function calculateTitle(input: {
  readonly matches: number;
  readonly wins: number;
  readonly escapeWins: number;
}): PlayerTitle {
  if (input.matches < 3) return null;
  if (input.escapeWins >= 3) return 'The Houdini';
  if (input.matches >= 5 && input.wins / input.matches >= 0.65) return 'The Executioner';
  return null;
}
