import { nanoid } from 'nanoid';
import { calculateTitle, type LedgerMatch, type LedgerSnapshot } from '../shared/ledger.js';
import type { DominosState } from '../shared/dominosGame.js';
import type { Room, RoomStore } from './rooms.js';

export function touchLedgerPlayer(store: RoomStore, profileId: string, name: string): void {
  const now = Date.now();
  store.db
    .prepare(
      `INSERT INTO players (id, name, created_at, last_seen) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`,
    )
    .run(profileId, name.slice(0, 24), now, now);
}

export function recordCompletedHand(
  store: RoomStore,
  room: Room,
  state: DominosState,
  matchKey = state.seed,
): void {
  if (state.phase !== 'hand-complete') return;
  const id = `${room.code}:${matchKey}:${state.handNumber}`;
  const identity = Object.fromEntries(
    [...room.players.values()].map((player) => [player.id, player.profileId ?? `seat-${player.id}`]),
  );
  const actions = state.publicActions ?? [];
  const players = state.players.map((player) => ({
    profileId: identity[player.id] ?? `seat-${player.id}`,
    name: player.name,
    score: player.score,
    won: player.id === state.winner,
    finalHandCount: player.hand.length,
    draws: actions
      .filter((action) => action.type === 'draw' && action.playerId === player.id)
      .reduce((sum, action) => sum + (action.type === 'draw' ? action.count : 0), 0),
  }));
  const match: LedgerMatch = {
    id,
    roomCode: room.code,
    variant: state.variant,
    playedAt: Date.now(),
    handNumber: state.handNumber,
    blocked: state.blocked,
    players,
  };
  const transaction = store.db.transaction(() => {
    const inserted = store.db
      .prepare(
        'INSERT OR IGNORE INTO matches (id, room_code, variant, played_at, payload) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, room.code, state.variant, match.playedAt, JSON.stringify(match));
    if (inserted.changes === 0) return;
    const playerStatement = store.db.prepare(
      `INSERT INTO match_players
       (match_id, player_id, name, score, won, hand_count, draws)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const player of players) {
      touchLedgerPlayer(store, player.profileId, player.name);
      playerStatement.run(
        id,
        player.profileId,
        player.name,
        player.score,
        player.won ? 1 : 0,
        player.finalHandCount,
        player.draws,
      );
    }
  });
  transaction();
}

function parseMatch(payload: string): LedgerMatch | null {
  try {
    return JSON.parse(payload) as LedgerMatch;
  } catch {
    return null;
  }
}

export function ledgerSnapshot(store: RoomStore, profileId: string): LedgerSnapshot {
  const rows = store.db
    .prepare(
      `SELECT m.payload FROM matches m
       JOIN match_players p ON p.match_id = m.id
       WHERE p.player_id = ? ORDER BY m.played_at DESC LIMIT 20`,
    )
    .all(profileId) as { payload: string }[];
  const history = rows.map((row) => parseMatch(row.payload)).filter((match): match is LedgerMatch => !!match);
  const wins = history.filter((match) => match.players.find((player) => player.profileId === profileId)?.won).length;
  const escapeWins = history.filter((match) => {
    const player = match.players.find((entry) => entry.profileId === profileId);
    return player?.won && player.draws >= 2;
  }).length;
  const rivals = new Map<string, { name: string; matches: LedgerMatch[] }>();
  for (const match of history) {
    for (const player of match.players) {
      if (player.profileId === profileId) continue;
      const entry = rivals.get(player.profileId) ?? { name: player.name, matches: [] };
      entry.matches.push(match);
      rivals.set(player.profileId, entry);
    }
  }
  const rivalries = [...rivals].map(([rivalId, entry]) => {
    let myWins = 0;
    let rivalWins = 0;
    const series = [...entry.matches].reverse().map((match) => {
      if (match.players.find((player) => player.profileId === profileId)?.won) myWins += 1;
      if (match.players.find((player) => player.profileId === rivalId)?.won) rivalWins += 1;
      return { playedAt: match.playedAt, myWins, rivalWins };
    });
    return {
      profileId: rivalId,
      name: entry.name,
      matches: entry.matches.length,
      myWins,
      rivalWins,
      series,
    };
  });
  rivalries.sort((a, b) => b.matches - a.matches || b.rivalWins - a.rivalWins);
  return {
    profileId,
    title: calculateTitle({ matches: history.length, wins, escapeWins }),
    matchesPlayed: history.length,
    wins,
    winRate: history.length ? wins / history.length : 0,
    history,
    rivalries,
    generatedAt: Date.now(),
  };
}

export function anonymousProfileId(): string {
  return `guest-${nanoid(24)}`;
}
