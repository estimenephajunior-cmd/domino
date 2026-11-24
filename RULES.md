# Implemented table rules

These are the project's explicit table conventions. Regional variants use different
opening, deal and scoring rules; these choices are deterministic and tested.

| Variant             | Players              | Set / tiles dealt per seat | Draw                                  | Scoring                                                                                                          |
| ------------------- | -------------------- | -------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Block               | 2-4                  | Double-Six / 6             | No                                    | One point per won hand                                                                                           |
| Draw                | 2-4                  | Double-Six / 6             | Until playable or stock empty         | One point per won hand                                                                                           |
| All Fives / Muggins | 2-4, individual      | Double-Six / 6             | Until playable or stock empty         | Exposed ends score their total when divisible by five; remaining opponent pips round to nearest five at hand end |
| Caribbean / Cuban   | 4, opposite partners | Double-Nine / 10           | No; fifteen stock tiles remain unused | Winning partnership receives opponents' remaining pips                                                           |
| Latin Partnership   | 4, opposite partners | Double-Six / 7             | No                                    | Winning partnership receives opponents' remaining pips                                                           |

The highest double dealt opens automatically; if none was dealt, the tile with the
highest pip total opens. The following seat takes the next turn. Seats stay fixed
across deals, and turns advance in roster order. Each hand uses a fresh server
secret seed. Scores carry across hands without a fixed match target.

All Fives uses one spinner: the first double. The two long sides must be covered
before its top and bottom arms open. Only started arms contribute to the exposed
sum; an uncovered terminal double contributes both halves. Other doubles do not
create extra arms. Cuban and Latin layouts remain linear.

A full rotation of passes blocks a hand. Individual games choose the lowest pip
rack; Latin compares combined partnership pip totals. Cuban chooses the lowest
individual rack and credits its partnership. A tie between opponents scores no
hand-end points; points already earned during All Fives play are retained.
Partnership scores are mirrored on both partners' seat displays, not added twice
to a separate team balance.

A permanent departure or expired reservation ends the current match and resets
remaining seats to the lobby. A transport disconnect reserves the seat and private
rack for 60 seconds. Settings are host-only before play, and changing rules clears
ready votes. Late joins wait for a fresh lobby; partnership games require four
connected, ready players.

Shuffle commitments are published before private views. The original commitment
is retained per hand in session storage. Seed, nonce and full shuffled order are
revealed only after the hand; players can verify the deterministic shuffle and its
SHA-256 commitment. A new hand never derives its secret from a previously revealed
seed.

Rule references: [All Fives](https://www.pagat.com/domino/cross/all_fives.html),
[Cuban partnership dominoes](https://www.pagat.com/domino/line/cuban.html).
The six-tile deal, one-point Block/Draw scoring, forced highest opening, roster turn
order and open-ended match length are retained project conventions rather than a
claim of compliance with every regional tournament ruleset.

## Undo and Chaos mutators

The host can combine any of the three mutators before the first deal. Changing
one toggle preserves the others and clears ready votes. Settings lock for the
match and carry across subsequent hands.

- **Speed Dominoes:** the server gives each turn ten seconds. A draw uses the same
  remaining time. A placement, pass, or automatic timeout starts the following
  turn's clock; a Wild Double extra turn also gets ten seconds. Expiry skips the
  turn even when a legal move exists. Clients show the deadline and play an
  optional, locally generated Howler buzzer. Completed hands stop the clock.
- **Wild Double:** playing a double retains the actor's turn, unless that tile ends
  the hand. Drawing a double does not itself earn another turn.
- **Hot Potato:** a legal pass adds one deterministically random tile from remaining
  stock to the passer's private rack, then yields the turn. Speed timeouts apply
  the same penalty even if an ordinary pass would be illegal. This explicitly
  makes otherwise unused Block/Cuban stock available for penalties. Empty stock
  produces no penalty; tiles are never invented or taken from an opponent.

A player may request undo of their latest non-winning placement for five seconds,
before any later successful play, draw, pass, timeout or redeal. An illegal attempt
does not erase that opportunity. The requester automatically votes yes. A strict
majority of the seated players must approve within ten seconds: two yes votes in
a two- or three-player room, three in a four-player room. Votes cannot be changed,
duplicated or submitted by outsiders.

Moves and the Speed clock pause during voting. Approval restores a single cached
immutable boardgame.io snapshot: all private racks, stock order, board branches,
scores, move history, phase and turn state. It restores the original actor's
remaining time, rather than awarding a fresh clock. Rejection or expiry resumes
the paused clock for the current actor. The cached opportunity is consumed either
way. Reconnects recover the same active vote; releasing a seat cancels the match,
its timers and its cached snapshot.

Completed hands cannot be undone because their shuffle secrets have already been
revealed for verification. Cached undo states remain server-only. Each client
receives its own sanitized rack and public vote totals, never the cached state or
an opponent's hand. No external cache or audio service is required: undo retains
one snapshot per table, and the local buzzer reuses one decoded Howler sound.
