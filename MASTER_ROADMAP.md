# Open-Source Social Dominoes

## Master Product Specification, Technology Lock & Autonomous Development Roadmap

---

# 0. DOCUMENT PURPOSE

This document is the authoritative specification, architecture contract, technology policy, implementation roadmap, acceptance checklist, and autonomous development instruction set for the Open-Source Social Dominoes project.

AI coding agents must treat this file as the source of truth for **what must be built**.

The following file defines **how code must be written**:

```text
.clinerules/coding.md
```

The following file contains stable product/project context:

```text
PROJECT.md
```

This file:

```text
MASTER_ROADMAP.md
```

defines:

- Product requirements
- User experience
- Game rules
- Multiplayer architecture
- Rendering architecture
- Audio architecture
- AI/ML architecture
- Persistence
- Video/replay system
- Social systems
- Plugin ecosystem
- Privacy
- Security
- Testing
- Deployment
- Open-source technology requirements
- Cost restrictions
- Completion criteria
- Autonomous agent continuation rules

No requirement in this roadmap may be silently removed.

Do not substitute a required working implementation with:

- mocks
- fake data
- placeholders
- TODO-only modules
- static demonstrations
- hard-coded sample output

and then mark the feature complete.

---

# 1. AUTONOMOUS AGENT BOOT PROCEDURE

Before writing code, read:

```text
.clinerules/coding.md
PROJECT.md
MASTER_ROADMAP.md
package.json
workspace package.json files
```

Then:

1. Inspect the existing repository.
2. Determine what is already implemented.
3. Determine what dependencies are already installed.
4. Never reinstall an existing dependency unnecessarily.
5. Find the first unfinished roadmap phase.
6. Read its acceptance criteria.
7. Inspect only the relevant source files.
8. Make a concise implementation plan.
9. Implement incrementally.
10. Test.
11. Fix regressions.
12. Update this roadmap.
13. Continue to the next unfinished task.

---

# 2. EXISTING DEPENDENCY POLICY

The project's approved libraries are already installed unless repository inspection proves otherwise.

Therefore:

**DO NOT blindly run package installation commands.**

Before installing anything:

```text
1. Inspect root package.json
2. Inspect workspace package.json files
3. Inspect lockfile
4. Search existing imports
5. Confirm dependency is actually missing
```

If an approved dependency exists:

```text
USE IT.
DO NOT REINSTALL IT.
DO NOT REPLACE IT.
```

If a dependency appears missing but is listed in the Approved Technology Stack:

- verify first;
- install only if implementation genuinely requires it.

Do not perform package upgrades unrelated to the current task.

Do not replace working libraries merely because another library is fashionable.

---

# 3. OPEN-SOURCE-FIRST / NO-PAID-API POLICY

The production application must be designed to operate without requiring paid third-party APIs for its core features.

The following are prohibited unless the project owner explicitly approves them:

- OpenAI API
- Anthropic API
- Gemini paid API
- commercial voice AI APIs
- ElevenLabs
- paid speech-to-text APIs
- paid text-to-speech APIs
- paid hosted ML inference
- paid multiplayer/game backends
- paid realtime voice SDKs
- paid TURN providers
- paid analytics APIs
- paid video transcoding APIs
- paid database APIs where an approved local/free alternative exists
- paid notification APIs where Web Push can accomplish the requirement
- paid media-generation APIs
- paid proprietary game services

If a feature can be implemented using an approved local/open-source/browser technology, use that implementation.

---

# 4. DEVELOPMENT AI IS NOT A PRODUCTION DEPENDENCY

Cline may use:

```text
DeepSeek API
```

during development.

That is a developer tool.

It must **not** become an application runtime dependency.

Production source code must not depend on DeepSeek merely because DeepSeek was used to write the application.

For example:

```text
Cline + DeepSeek
        ↓
writes code
        ↓
React / TypeScript / TensorFlow.js / browser APIs
        ↓
production application
```

NOT:

```text
User action
   ↓
production server
   ↓
DeepSeek API
   ↓
required game feature
```

unless the project owner explicitly requests such a feature in the future.

---

# 5. LOCAL-FIRST COMPUTATION POLICY

Prefer performing computation:

```text
Browser
    ↓
Local JavaScript / WASM / Web APIs
```

whenever technically sensible.

Examples:

Shadow Predictor:

```text
local combinatorial engine
TensorFlow.js / ONNX where useful
```

Ghost inference:

```text
TensorFlow.js / ONNX Runtime Web
```

Noise detection:

```text
VAD-WASM / RNNoise-WASM
```

Music:

```text
Tone.js
```

Speech:

```text
Web Speech API
or
Piper TTS WASM
```

Replay:

```text
Canvas
MediaRecorder
ffmpeg.wasm
```

Plugins:

```text
QuickJS WASM
```

This reduces:

- server bandwidth
- hosting costs
- privacy exposure
- backend complexity
- vendor lock-in

---

# 6. COST MODEL

Target:

```text
Software licensing: $0
Core API subscriptions: $0
Voice media relay under direct P2P conditions: $0
Client-side ML inference: $0 external inference cost
Client-side media encoding: $0 external transcoding cost
```

Free hosting tiers may have quotas or change over time.

Therefore:

**Never assume a hosting provider is permanently unlimited or permanently free.**

At deployment time:

1. Check current quotas.
2. Prefer a free option compatible with requirements.
3. Never enable a paid plan automatically.
4. Never enter billing information.
5. Never provision a paid resource without explicit approval.

---

# 7. PRODUCT VISION

Create a browser-first multiplayer domino platform that feels like friends sitting around a physical table.

Primary philosophy:

> Zero-Friction Tactile Lounge

The platform should emphasize:

- immediate access
- no forced registration
- no coin economy
- no pay-to-win
- no gambling mechanics
- no intrusive advertising
- no fake human bots
- tactile tile interactions
- spatial voice
- friend-group rivalry
- procedural ambience
- optional local AI assistance
- transparent Ghost AI
- community mods
- browser/PWA distribution

---

# 8. EXPERIENCE TARGET

Where technically practical:

```text
Launch → usable interface: ~1.2 seconds target
Create room → one meaningful click
Join room → link
```

The user should feel that the application is a digital table rather than a menu-driven casino application.

---

# 9. VISUAL IDENTITY

Default atmosphere:

```text
warm late-night social club
```

Palette:

```text
Deep slate emerald: #0F291E
Brushed brass:      #D4AF37
Playable-end glow:  #F59E0B
```

Tiles:

- tactile ivory/ebony appearance
- subtle bevel
- soft depth
- realistic shadow
- clear pips
- visual weight

---

# 10. TYPOGRAPHY

Use:

```text
Space Grotesk
```

for:

- scoring
- pip numbers
- primary numeric values

Use:

```text
Inter
```

for:

- interface text
- controls
- menus

Use:

```text
JetBrains Mono
```

for:

- probability values
- timers
- room codes
- developer/statistical displays

---

# 11. THEMES

Provide:

```text
Classic Green Felt
Havana Courtyard
Cyberpunk Bodega
Tokyo Lofi Study
```

Theme logic must remain separate from game-state logic.

Themes may modify:

- background
- tile styling
- lighting
- decorative effects
- ambience

Themes may not modify rules unless implemented as explicit plugins/mutators.

---

# 12. FULL-SCREEN TABLE

Gameplay uses a no-scroll spatial viewport.

Concept:

```text
+--------------------------------------------------------------------+
| Logo | Room Code | Copy | Dilemma | Lofi | Mods                    |
+--------------------------------------------------------------------+
|                       TOP PLAYER                                   |
|              Avatar + Voice Ring + Tiles                           |
|                                                                    |
| LEFT PLAYER       DOMINO TABLE/CANVAS         RIGHT PLAYER         |
| Avatar                                          Avatar             |
| Tiles              Auto-Snaking Chain          Tiles              |
| Shadow HUD                                      Soundboard          |
|                                                                    |
+--------------------------------------------------------------------+
| Undo               YOUR PRIVATE RACK               TURN TIMER      |
| Mic / PTT / Mute                            Score                  |
+--------------------------------------------------------------------+
```

---

# 13. SEAT MODEL

Relative seat mapping:

```text
Bottom = local player
Left   = player/opponent
Top    = partner/player
Right  = player/opponent
```

All spatial voice mapping must be relative to the local user's perspective.

---

# 14. TILE DRAG UX

When grabbed:

```text
scale ≈ 1.12x
```

Apply:

- raised shadow
- smooth lift
- responsive drag
- legal-target feedback

---

# 15. MAGNETIC SNAP

Valid endpoints glow:

```text
#F59E0B
```

Near approximately:

```text
40px
```

the tile should:

- snap
- rotate
- orient correctly
- preview placement

The authoritative game engine must still validate the move.

---

# 16. HEAVY SLAM

Trigger a Slam Play based on:

- release velocity
- double tile
- winning tile

Effects:

```text
~250ms screen shake
Matter.js neighbor recoil
weighted tile impact sound
device haptic when supported
```

Suggested vibration:

```javascript
navigator.vibrate([120, 40, 180]);
```

The Vibration API is optional enhancement only.

---

# 17. AUTO-SNAKING BOARD

When chain approaches approximately:

```text
120px
```

from viewport edge:

1. detect available direction;
2. turn chain 90 degrees;
3. continue layout;
4. update camera target;
5. smoothly pan/zoom;
6. prevent clipping.

Must support:

- two-end chains
- spinner branches
- dynamic orientation
- resize
- zoom
- viewport reflow

---

# 18. GAME SETS

Support:

```text
Double-Six → 28 tiles
Double-Nine → 55 tiles
```

All unordered combinations must occur exactly once.

---

# 19. FAIR SHUFFLE

Use:

```text
seedrandom
```

for deterministic shuffle behavior.

Use SHA-256 commitment/verification using native cryptographic functionality where practical.

Important distinction:

`seedrandom` provides deterministic PRNG behavior.

Cryptographic verification should be performed separately using appropriate SHA-256 functionality such as the native Web Crypto/Node crypto facilities.

Expose fairness information after the round.

---

# 20. GAME VARIANTS

Required:

```text
Classic Block
Draw Dominoes
All Fives / Muggins
Caribbean / Cuban Double-Nine
Latin Partnership
```

Rule variants must be modular.

Avoid one enormous `if/else` rule file.

---

# 21. NO-SIGN-UP TABLE LINKS

Use:

```text
Nanoid
```

Generate:

```text
/table/:roomCode
```

No account required for basic friend-table gameplay.

Store temporary identity:

```text
playerID
sessionToken
```

in:

```text
sessionStorage
```

---

# 22. MULTIPLAYER AUTHORITY

Use:

```text
boardgame.io
Socket.io
Node.js
Express
```

The server remains authoritative for:

- legal moves
- turn ownership
- scoring
- undo outcome
- room state
- secret hand assignment

Clients must never be trusted to submit complete authoritative state.

---

# 23. RECONNECTION

Socket.io handles transport reconnection.

Custom reconnect manager must:

- reserve seat ~60 seconds
- display immediate reconnect UI
- validate sessionToken
- restore player
- synchronize missed state
- restore private rack securely

The visible short reconnect experience may show:

```text
Player reconnecting...
5 seconds
```

while server reservation remains longer.

---

# 24. HUMAN / GHOST TRANSPARENCY

Never disguise AI as a person.

Example:

```text
Bob's Ghost AI
Trained on 142 consenting matches
```

Human-only mode must remain available.

---

# 25. APPROVED TECHNOLOGY STACK — GENERAL RULE

The following 42 technologies are the default implementation stack.

If functionality can be implemented with one of these approved tools:

**use the approved tool first.**

Do not introduce a commercial API to duplicate its function.

---

# 26. APPROVED STACK A — FRONTEND / RENDERING / PHYSICS

## 1. React 19

Role:

- components
- lobby
- HUD
- drawers
- modal orchestration

## 2. TypeScript

Role:

- game types
- network contracts
- plugin API
- state safety

## 3. Vite

Role:

- development bundling
- HMR
- static production build

## 4. PixiJS

Primary rendering engine.

Role:

- game table
- domino chain
- sprites
- particles
- 60 FPS canvas

Phaser 3 may only replace PixiJS with owner approval.

Do not run both renderers without a strong reason.

## 5. Matter.js

Role:

- impact recoil
- tile physics
- slam behavior
- optional boneyard visual physics

## 6. Framer Motion

Role:

- HUD transitions
- card flipping
- score animation
- drawers

## 7. dnd-kit

Role:

- accessible rack drag interaction
- pointer/touch/keyboard sensors

Coordinate it carefully with PixiJS board hit testing.

## 8. Canvas-Confetti

Role:

- wins
- Domino callouts
- celebrations
- tournaments

## 9. HTML5 Vibration API

Role:

- optional haptic enhancement

Never make game information depend exclusively on vibration.

---

# 27. APPROVED STACK B — UI / DESIGN SYSTEM

## 10. Tailwind CSS

Role:

- responsive UI
- themes
- overlays
- utility styling

## 11. Radix UI Primitives

Role:

- undo dialogs
- settings dialogs
- rule configuration
- accessible drawers

## 12. Lucide Icons

Role:

- microphone icons
- mute states
- audio indicators
- mutator badges
- controls

## 13. Zustand

Role:

- lightweight client UI state
- bridge between canvas state and React overlays

Do not duplicate authoritative multiplayer state in Zustand.

Zustand should primarily store client/UI state.

## 14. Recharts

Role:

- Karmic Ledger
- statistics
- timelines
- rivalry graphs

---

# 28. APPROVED STACK C — GAME STATE / NETWORKING

## 15. boardgame.io

Role:

- deterministic game state
- turn sequencing
- phases
- legal move integration
- undo history

## 16. Node.js

Role:

- backend runtime

## 17. Express.js

Role:

- HTTP
- health endpoints
- room metadata
- static/plugin manifests where appropriate

## 18. Socket.io

Role:

- rooms
- signaling
- lobby state
- text events
- reconnect coordination

## 19. Nanoid

Role:

- room IDs

## 20. seedrandom

Role:

- deterministic shuffle PRNG

---

# 29. APPROVED STACK D — VOICE / AUDIO

## 21. Native WebRTC

Use:

```text
RTCPeerConnection
getUserMedia
RTCDataChannel
```

No paid realtime voice SDK.

## 22. Simple-Peer / PeerJS

May simplify mesh management.

Select **one** after evaluating existing installed implementation.

Do not maintain two competing WebRTC wrappers.

Native RTCPeerConnection may be used directly if cleaner.

## 23. Google Public STUN

Initial STUN:

```text
stun:stun.l.google.com:19302
```

Important:

STUN does **not** guarantee connectivity through every NAT/firewall.

Do not add a paid TURN provider automatically.

If TURN becomes necessary:

1. document the limitation;
2. degrade voice gracefully;
3. request owner approval before changing infrastructure;
4. a future self-hosted open-source TURN solution may be evaluated separately.

Gameplay must still function if voice cannot establish.

## 24. Web Audio API

Use:

```text
AudioContext
PannerNode
AnalyserNode
GainNode
```

for:

- 3D seat positioning
- voice visualization
- audio volume

## 25. @ricky0123/vad-web

Role:

- speech detection
- open-mic gating

## 26. RNNoise WASM

Role:

- optional enhanced noise suppression

Use browser built-in suppression first where sufficient.

RNNoise should be lazy-loaded when enabled.

## 27. Tone.js

Role:

- procedural lofi
- synthesizer
- ambient loops

## 28. Howler.js

Role:

- impact sounds
- soundboard
- UI SFX

---

# 30. APPROVED STACK E — AI / STORAGE / VIDEO / MODS

## 29. TensorFlow.js / ONNX Runtime Web

Use local inference.

Primary applications:

- Ghost Agent
- behavioral model
- optional probability/model enhancements

The basic Shadow Predictor should remain deterministic/combinatorial where possible.

Choose TensorFlow.js or ONNX Runtime Web based on implementation needs.

Do not duplicate models across both unless justified.

## 30. Web Speech API / Piper TTS WASM

Role:

- optional Ghost-generated voice reactions

Priority:

```text
Piper WASM where deterministic/local speech is needed
Web Speech where supported and acceptable
```

No commercial TTS API required.

## 31. IndexedDB via Dexie.js

Role:

- match history
- local ledger cache
- cached Ghost profile data
- user settings
- optional audio metadata

## 32. SQLite via better-sqlite3 / Turso-compatible architecture

Default local/server persistence:

```text
better-sqlite3
```

Do not require a paid cloud database.

## 33. MediaRecorder API

Role:

- canvas capture
- audio capture where permission exists

## 34. ffmpeg.wasm

Role:

- client-side transcode
- audio/video composition
- MP4/WebM export where browser support permits

Do not use paid video rendering APIs.

## 35. Web Push / web-push

Role:

- Ghost results

No paid push notification platform required for basic web push.

## 36. QuickJS-Emscripten

Role:

- sandbox untrusted plugin JavaScript

No `eval()` for community plugins.

---

# 31. APPROVED STACK F — DEVOPS / TESTING / DISTRIBUTION

## 37. Workbox

Role:

- PWA service worker
- offline static caching
- update strategy

## 38. Static Hosting

Approved candidates:

```text
Vercel
Netlify
GitHub Pages
```

Choose according to current free-tier availability and project requirements.

Do not provision paid hosting automatically.

## 39. Node/WebSocket Hosting

Approved candidates:

```text
Render
Fly.io
Railway
```

Use only if suitable free-tier service is currently available.

Deployment availability must be verified at deployment time.

## 40. Playwright

Role:

- browser E2E
- multiplayer tabs
- regression testing

## 41. Vitest

Role:

- unit tests
- engine tests
- deterministic rule tests

## 42. ESLint + Prettier

Role:

- lint
- style
- consistency

---

# 32. STACK SUBSTITUTION POLICY

Do not substitute approved libraries without a concrete reason.

Examples:

Do not replace:

```text
Zustand → Redux
PixiJS → proprietary renderer
Socket.io → hosted realtime SaaS
SQLite → paid managed DB
WebRTC → paid voice SDK
Tone.js → hosted music generator
TensorFlow.js → paid inference API
ffmpeg.wasm → cloud transcoding API
web-push → commercial notification API
QuickJS → unsafe eval()
```

without explicit approval.

---

# 33. SPATIAL VOICE

Microphone constraints:

```javascript
{
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  },
  video: false
}
```

Spatial coordinates:

```text
Left  → x = -0.85
Top   → z = -1.0
Right → x = +0.85
```

Use:

```javascript
panner.panningModel = 'HRTF';
```

---

# 34. VAD / NOISE PIPELINE

Target:

```text
Microphone
   ↓
Browser audio processing
   ↓
VAD
   ↓
optional RNNoise
   ↓
WebRTC outgoing track
```

Support:

- Open Mic + VAD
- Push-to-Talk
- Spacebar PTT
- Mute
- Peer mute
- Peer volume

---

# 35. VAD VOICE RINGS

Use `AnalyserNode` to drive:

- avatar pulse
- glow
- speech indication

Do not transmit raw analysis data unnecessarily.

---

# 36. UNDO VOTE

After tile placement:

```text
Request Undo window ≈ 5s
```

Vote:

```text
≈ 10s
```

Use Radix UI.

If majority approves:

- authoritative rollback
- restore rack
- restore board
- restore turn state

---

# 37. CHAOS MUTATORS

Implement:

### Speed Dominoes

```text
10-second turn
buzzer
auto-skip
```

### Wild Double

```text
double → immediate extra turn
```

### Hot Potato

```text
pass → random penalty draw
```

All mutators must compose cleanly.

---

# 38. SOUNDBOARD

Provide:

1. Airhorn
2. Sad Trombone
3. Cricket Chirps
4. Dramatic Gulp
5. Cheering Crowd
6. Tile Slam
7. Buzzer
8. Laugh

Preferred synchronization:

```text
RTCDataChannel
```

Fallback:

```text
Socket.io
```

Anti-spam:

```text
3 seconds
```

Use Howler.js.

---

# 39. PROCEDURAL LOFI

Use Tone.js.

Target:

```text
75 BPM
Dm9 → G13 → Cmaj9 → A7alt
```

Include:

- Rhodes-style synth
- vinyl crackle
- boom-bap beat

No streaming music API.

No copyrighted hosted music required.

---

# 40. DOMINO SHADOW

Runs locally.

Process:

1. Generate all tiles.
2. Remove local hand.
3. Remove board tiles.
4. Track pass events.
5. Track draws.
6. update opponent possibility sets;
7. calculate current-end probabilities;
8. rank local moves.

Never call an external LLM for basic probability analysis.

---

# 41. REPLAY SYSTEM

Persist deterministic event timeline:

- player
- tile
- board placement
- score
- pass
- block
- timing
- Slam
- soundboard events

Maintain optional rolling reaction/audio buffer of approximately:

```text
15 seconds
```

---

# 42. HIGHLIGHT GENERATOR

Output target:

```text
1080x1920
9:16
~10 seconds
```

Use:

```text
Canvas
MediaRecorder
ffmpeg.wasm
```

Playback approximately:

```text
3x–4x
```

Possible captions:

```text
DEVASTATING BLOCK!
DOMINO SLAM!
```

No paid video rendering service.

---

# 43. KARMIC LEDGER

Use:

```text
better-sqlite3
Dexie.js
Recharts
```

Track:

- historical matches
- rivalries
- win rate
- blocking
- titles

---

# 44. BETRAYAL INDEX — REMOVED

Removed by owner decision to keep the product focused on core domino play.

---

# 45. PLAYER TITLES

Rolling approximately:

```text
20 games
```

Required examples:

```text
The Executioner
The Houdini
```

Title rules must be unit tested.

---

# 46. GRUDGE MATCH NOTIFICATIONS — REMOVED

Removed with the Betrayal/Grudge system.

---

# 47. BLIND FAITH MODE

2v2 special mode.

During active rounds:

- hide partner tile count
- mute normal voice
- disable normal text
- allow Table Tap
- expose hesitation rhythm/timing

Restore communications when restricted period ends.

---

# 48. SOCRATIC DILEMMA CARDS

Use Framer Motion.

Initial cards:

## Ego Trap

Publicly predict victory.

Correct:

```text
2x bonus
```

Wrong:

```text
round points split among opponents
```

## Prisoner's End

Partners choose secretly:

```text
Cooperate
Betray
```

Both cooperate:

```text
2x team score
```

One betrays:

```text
3x solo score to betrayer
partner zero
```

Both betray:

```text
both zero
```

---

# 49. GHOST AI PRIVACY

Behavioral Ghost training requires explicit opt-in.

Track only approved game telemetry:

- hesitation
- move preference
- blocking preference
- pip dumping
- risk rate
- dilemma behavior

Optional voice reactions require separate clear consent.

---

# 50. GHOST MODEL

Use:

```text
TensorFlow.js
or
ONNX Runtime Web
```

Do not call external hosted inference.

Ghost model should reproduce approximate:

- style
- timing
- risk
- move preference

All game moves still pass through the authoritative rules engine.

---

# 51. GHOST SPEECH

Available options:

```text
opt-in stored user clips
Piper TTS WASM
Web Speech API
```

Do not use commercial TTS by default.

Clearly label generated or Ghost speech.

---

# 52. PLUGIN SDK

Expose typed hooks:

```text
onRoundStart
onValidateMove
onTilePlayed
onTurnPass
onCalculateScore
customVisualTheme
```

Avoid `any` in the finalized SDK.

---

# 53. PLUGIN SECURITY

Execute plugins using:

```text
QuickJS-Emscripten
```

Restrictions:

```text
No DOM
No network
No filesystem
No process
No unrestricted host objects
```

Target:

```text
~50ms hook execution budget
```

Terminate runaway execution.

---

# 54. MOD MARKETPLACE

Hosts can:

- browse
- inspect
- enable
- disable
- paste plugin source
- configure plugins

Synchronize configuration using Socket.io.

Never directly execute pasted JS in the page's main JavaScript context.

---

# 55. MONOREPO ARCHITECTURE

```text
open-source-dominoes/
│
├── package.json
├── turbo.json
├── MASTER_ROADMAP.md
├── PROJECT.md
│
├── .clinerules/
│   └── coding.md
│
├── packages/
│   │
│   ├── shared-engine/
│   │   └── src/
│   │       ├── deck/
│   │       ├── board/
│   │       ├── rules/
│   │       ├── scoring/
│   │       ├── mutators/
│   │       ├── dilemmas/
│   │       ├── predictor/
│   │       ├── plugins/
│   │       └── types/
│   │
│   ├── server/
│   │   └── src/
│   │       ├── rooms/
│   │       ├── game/
│   │       ├── signaling/
│   │       ├── reconnect/
│   │       ├── persistence/
│   │       ├── push/
│   │       └── ghost/
│   │
│   └── client/
│       └── src/
│           ├── app/
│           ├── audio/
│           ├── canvas/
│           ├── components/
│           ├── features/
│           ├── hooks/
│           ├── state/
│           ├── theme/
│           ├── ai/
│           ├── replay/
│           ├── storage/
│           └── plugins/
│
└── tests/
    └── e2e/
```

This structure is illustrative.

Prefer focused modules.

Do not create one giant file for an entire subsystem.

---

# 56. MODULARITY REQUIREMENT

Large features should be divided by responsibility.

For example:

```text
audio/
├── voiceSession.ts
├── peerConnection.ts
├── spatialAudio.ts
├── vadController.ts
├── noiseSuppression.ts
├── soundboard.ts
└── lofiGenerator.ts
```

rather than:

```text
audio.ts
```

containing thousands of lines.

Likewise:

```text
rules/
├── block.ts
├── draw.ts
├── muggins.ts
├── partnership.ts
├── caribbean.ts
└── common.ts
```

is preferable when complexity justifies it.

---

# 57. PHASE 1 — REPOSITORY AUDIT + CORE ENGINE

Status:

```text
[x] COMPLETE
```

Completion audit: the implemented engine includes branched spinner legality,
All Fives per-play scoring, partnership resolution and the live multiplayer
SHA-256 commit/reveal flow. See the latest completion log and RULES.md.

First:

- inspect existing dependency installation;
- do not reinstall all 42 packages;
- confirm workspace layout;
- confirm TypeScript configuration.

Implement:

- Double-Six
- Double-Nine
- deterministic shuffle
- fairness commitment
- board graph
- move legality
- spinner
- scoring
- Block
- Draw
- Muggins
- Caribbean/Cuban
- Partnership

Tests:

```text
Vitest
```

Acceptance:

- deterministic
- fully typed
- presentation-independent
- tests pass

---

# 58. PHASE 2 — ROOMS + AUTHORITATIVE MULTIPLAYER

Status:

```text
[x] COMPLETE
```

Server and protocol now use a server-only boardgame.io state machine with
validated Socket.IO intents. Room metadata excludes session tokens; private
views exclude opponents' racks, live seeds, boneyard order and engine logs.
Host settings lock once play starts. Explicit departure and expired reservations
release the live match, return remaining seats to the lobby and clear ready votes.
Reconnect restores the same seat and private rack within the 60-second window.

Fairness commitments precede private views; each completed hand reveals its
seed, nonce and shuffled order. Each new hand gets an independent secret seed.
The browser pins the original commitment and offers local SHA-256 verification.
See RULES.md for the tested variant conventions.
Use:

```text
Node
Express
Socket.io
boardgame.io
Nanoid
```

Implement:

- instant room
- session token
- seating
- lobby settings
- private hand filtering
- reconnect
- text event infrastructure
- authoritative moves

Playwright test multiple tabs.

---

# 59. PHASE 3 — TABLE UI + PHYSICAL TILE SYSTEM

Status:

```text
[x] COMPLETE
```

The full-screen table now includes viewport-aware seats, rack, chat, an
accessible DOM board and a lazy PixiJS renderer. Tiles use dnd-kit pointer,
touch and keyboard controls with legal-end highlighting, magnetic snapping,
rotation, branched spinner auto-snaking and a pan/zoom/follow camera. Matter.js
adds short placement recoil without changing authoritative board positions.
Accepted server placements drive weighted impact audio, Slam vibration and
hand-completion confetti. Reduced-motion and WebGL-failure fallbacks remain
fully playable.

Use:

```text
React
PixiJS
Matter.js
dnd-kit
Tailwind
Zustand
Lucide
Canvas-Confetti
```

Implement:

- full-screen table
- seats
- rack
- board
- dragging
- snapping
- rotation
- auto-snaking
- camera
- Slam
- vibration
- confetti

---

# 60. PHASE 4 — VOICE + VAD + NOISE

Status:

```text
[x] COMPLETE
```

Use:

```text
WebRTC
Simple-Peer OR native RTCPeerConnection
Google STUN
Web Audio API
vad-web
RNNoise WASM
```

Implementation:

- Authenticated Socket.IO signaling and native RTCPeerConnection full mesh for up to four players.
- Opt-in microphone access with Open Mic + VAD, push-to-talk, Spacebar PTT and local mute.
- Per-peer mute and volume, HRTF seat spatialization and analyser-driven speaking rings.
- Stable outgoing audio tracks so gating modes do not renegotiate active calls.
- Browser echo cancellation, noise suppression and automatic gain control.
- Lazy, self-hosted neural VAD and RNNoise WASM with energy-VAD and browser-processing fallbacks.
- Voice state recovery after socket reconnect, plus complete track, peer and AudioContext cleanup.
- Permission denial, missing inference assets and failed P2P connections leave chat and gameplay usable.

Implement:

- signaling
- mesh
- PTT
- VAD
- mute
- volume
- spatialization
- voice rings
- graceful no-voice fallback

Never add paid voice infrastructure.

---

# 61. PHASE 5 — UNDO + MUTATORS

Status:

```text
[x] COMPLETE
```

Use:

```text
boardgame.io
Socket.io
Radix UI
Howler
```

Implement:

- Undo vote
- Speed
- Wild Double
- Hot Potato

Implementation:

- Server-authoritative five-second undo requests and ten-second strict-majority votes.
- One cached immutable boardgame.io state per eligible placement; full private/public rollback with no cached state sent to clients.
- Paused moves and Speed clocks during voting; authenticated vote recovery on reconnect.
- Ten-second server deadlines, automatic skips and an optional cached Howler buzzer.
- Wild Double extra turns and deterministic Hot Potato penalty draws; all eight toggle combinations supported.
- Host-only lobby toggles merge independently and reset ready votes; settings lock during play and persist across hands.
- Dedicated MutatorSettings / PhaseFivePanel components, including the accessible Radix vote dialog; no board or voice module edits.
- Winning placements are excluded from undo because completed-hand shuffle secrets have already been revealed. See RULES.md for exact interaction rules.

Validation:

- Full regression suite: 152 tests passed across 12 files.
- Final focused phase 5 suite: 24 tests passed, including the additional All Fives scoring/spinner rollback regression.
- Playwright: all 5 browser flows passed, including combined-mutator configuration and majority-approved undo.
- TypeScript, ESLint, changed-file Prettier and production web/server builds passed.
- Compiled Node server startup/health smoke test: HTTP 200.
- Repository-wide formatting backlog outside edited files remains as previously documented.

---

# 62. PHASE 6 — SOCIAL AUDIO + THEMES

Status:

```text
[x] COMPLETE
```

Use:

```text
Howler
Tone.js
Web Audio
Framer Motion
Tailwind
RTCDataChannel
Socket.io fallback
```

Implement:

- 2 soundboard effects
- anti-spam
- procedural lofi
- volume mixer
- four themes

Implementation:

- Two locally synthesized Howler soundboard effects with client and server token-bucket anti-spam.
- RTCDataChannel delivery with deduplicated Socket.io fallback.
- Lazy Tone.js 75 BPM procedural lofi with Rhodes chords, bass, vinyl noise, and boom-bap percussion.
- Persisted master, effects, music, voice, and ambience volume controls.
- Four persisted palettes that update both the interface and Three.js felt.

---

# 63. PHASE 7 — SHADOW PREDICTOR

Status:

```text
[x] COMPLETE
```

Use deterministic local probability logic.

TensorFlow.js/ONNX may augment later only if useful.

Do not send player data to an AI API.

Implement:

- remaining tile model
- pass inference
- draw uncertainty
- pip heatmap
- move ranking
- safest-tile suggestion

Implementation:

- Pure deterministic analysis using only the local rack and public table actions.
- Remaining-set elimination for double-six and double-nine rule data.
- Per-opponent pass constraints with draw-based uncertainty recovery.
- Opponent pip coverage probabilities and a compact local heatmap.
- Legal-move scoring by response risk, pip relief, and double value.
- One-click safest-tile selection without automatic play or external AI calls.

---

# 64. PHASE 8 — REPLAY + CLIP GENERATOR

Status:

```text
[ ] NOT STARTED
```

Use:

```text
MediaRecorder
Canvas
ffmpeg.wasm
```

Implement:

- event timeline
- circular audio buffer
- highlight detection
- 9:16 renderer
- caption animation
- local encoding
- download/share

Lazy load ffmpeg.wasm.

---

# 65. PHASE 9 — KARMIC LEDGER

Status:

```text
[x] COMPLETE
```

Use:

```text
better-sqlite3
Dexie
IndexedDB
Recharts
```

Implement:

- match history
- titles
- rivalry charts

No paid analytics database.

Implementation:

- Anonymous persistent browser profiles remain separate from temporary room and seat identities.
- Completed hands persist in normalized SQLite match and participant records.
- Rolling twenty-hand titles include The Executioner and The Houdini.
- Dexie caches personal ledger snapshots locally for offline viewing.
- Lazy Recharts rivalry timelines show head-to-head wins.

---

# 66. PHASE 10 — BLIND FAITH + DILEMMAS

Status:

```text
[ ] NOT STARTED
```

Use:

```text
Framer Motion
boardgame.io
Socket.io
Howler
```

Implement:

- hidden partner count
- voice/text restriction
- Table Tap
- hesitation signal
- Ego Trap
- Prisoner's End

---

# 67. PHASE 11 — GHOST TABLE (SKIPPED)

Status:

```text
[-] SKIPPED — OWNER DECISION
```

Use:

```text
TensorFlow.js OR ONNX Runtime Web
Dexie
SQLite
Web Speech API / Piper TTS WASM
web-push
```

Implement:

- consent
- telemetry
- training/profile generation
- Ghost inference
- Ghost timing
- Ghost reactions
- summary notification

No paid AI inference.

---

# 68. PHASE 12 — PLUGIN SYSTEM

Status:

```text
[ ] NOT STARTED
```

Use:

```text
QuickJS-Emscripten
Socket.io
React
Radix
```

Implement:

- typed SDK
- sandbox
- timeout
- host API
- marketplace
- plugin synchronization
- visual themes
- rule hooks

---

# 69. CROSS-CUTTING TESTING

Use Vitest for unit tests.

Required coverage includes:

- deck generation
- shuffle
- fairness
- move validation
- open ends
- spinner
- scoring
- Block
- Draw
- Muggins
- Double-Nine
- Partnership
- mutators
- dilemmas
- predictor
- titles
- plugin host validation

Use Playwright for:

- room creation
- joining
- four browser tabs
- legal/illegal move
- drawing
- passing
- scoring
- disconnect
- reconnect
- Undo
- soundboard
- permissions
- end-of-round
- replay workflow

---

# 70. SECURITY REQUIREMENTS

Never:

- trust client state blindly;
- expose private hands;
- expose session tokens unnecessarily;
- execute plugin source outside sandbox;
- log secrets;
- automatically upload microphone recordings;
- enable Ghost recording without consent;
- weaken authorization to fix a bug;
- use `eval()` for plugins;
- allow client-submitted scoring without validation.

---

# 71. PRIVACY REQUIREMENTS

Require explicit permission for:

- microphone
- Web Push
- Ghost behavioral training
- voice snippet capture
- replay voice capture

Provide independent controls.

Game functionality must remain available when optional privacy-sensitive features are declined where technically possible.

---

# 72. PERFORMANCE REQUIREMENTS

Do not load everything at startup.

Lazy-load:

```text
ffmpeg.wasm
TensorFlow.js / ONNX Ghost system
RNNoise
Plugin marketplace
Replay editor
advanced analytics
Piper TTS
```

Keep initial game bundle focused on:

```text
core UI
room entry
engine
table rendering
networking essentials
```

Avoid:

- full React rerender per canvas frame
- sending full state when a compact diff/event is enough
- repeated audio decoding
- unnecessary allocations
- duplicate state stores

---

# 73. PWA / OFFLINE

Use Workbox.

Implement:

- manifest
- application icons
- service worker
- static shell cache
- update lifecycle
- install support

Never treat cached multiplayer game state as authoritative.

Do not allow stale service-worker data to corrupt active matches.

---

# 74. DEPLOYMENT POLICY

Frontend candidates:

```text
Vercel
Netlify
GitHub Pages
```

Backend candidates:

```text
Render
Fly.io
Railway
```

Persistent storage:

```text
SQLite
```

or a compatible free SQLite-based architecture if required.

Deployment agent must:

1. check current free-tier capability;
2. never assume old free-tier terms are current;
3. never automatically enable billing;
4. never provision paid resources;
5. report a blocker if free deployment cannot satisfy the requirement.

---

# 75. ZERO-PAID-SERVICE AUDIT

Before production completion, search the repository for:

```text
openai
anthropic
gemini
elevenlabs
twilio
agora
livekit-cloud
daily.co
ably
pusher
firebase paid-service assumptions
supabase paid-service assumptions
cloudinary
mux
paid TURN credentials
commercial AI endpoints
```

Presence of a name is not automatically an error—for example documentation may mention alternatives—but production runtime code must not depend on unapproved paid services.

Also inspect:

```text
.env.example
environment variable names
network request destinations
server configuration
package dependencies
CI/CD configuration
```

---

# 76. DEPENDENCY AUDIT

Before adding any new package:

```text
Search package.json
Search workspace manifests
Search lockfile
Search imports
```

If existing package solves requirement:

```text
reuse it
```

Do not duplicate functionality.

Example:

```text
Howler already exists
→ do not install another SFX library

Zustand already exists
→ do not install Redux for the same UI state

Recharts already exists
→ do not install another charting package

QuickJS already exists
→ do not execute plugins through eval
```

---

# 77. FRONTEND STATE BOUNDARIES

Authoritative game state:

```text
boardgame.io/server-controlled state
```

Client interface state:

```text
Zustand
React state
```

Persistent browser data:

```text
Dexie / IndexedDB
```

Canvas transient rendering state:

```text
PixiJS / Matter.js
```

Do not blur these responsibilities unnecessarily.

---

# 78. AUDIO BOUNDARIES

Voice transport:

```text
WebRTC
```

Spatial processing:

```text
Web Audio
```

Voice activity:

```text
vad-web
```

Noise reduction:

```text
browser suppression / RNNoise
```

SFX:

```text
Howler
```

Procedural music:

```text
Tone.js
```

Do not route all audio through one massive subsystem.

---

# 79. AI BOUNDARIES

Shadow Predictor:

```text
deterministic inference first
```

Ghost AI:

```text
TensorFlow.js / ONNX local model
```

Speech:

```text
Piper WASM / Web Speech
```

Cline:

```text
DeepSeek developer model
```

These systems must remain independent.

---

# 80. DATABASE BOUNDARIES

Server persistence:

```text
SQLite / better-sqlite3
```

Browser persistence:

```text
IndexedDB / Dexie
```

Use versioned migrations.

Do not mix SQL queries directly into unrelated React components.

---

# 81. PLUGIN BOUNDARIES

Plugins receive constrained capabilities.

Example conceptual host API:

```typescript
interface PluginHostApi {
  playSound(id: string): void;
  triggerEffect(effect: SafeVisualEffect): void;
  requestRuleMutation(action: AllowedPluginAction): void;
}
```

Plugins must not receive:

```text
window
document
fetch
process
require
filesystem
database handle
Socket.io server instance
secret game state
```

---

# 82. COMPLETE FEATURE CHECKLIST

## Core

- [x] No-sign-up links
- [x] 2–4 players
- [x] seats
- [x] session tokens
- [x] reconnect
- [x] Double-Six
- [x] Double-Nine
- [x] fair shuffle
- [x] fairness verification
- [x] Block
- [x] Draw
- [x] Muggins
- [x] Caribbean/Cuban
- [x] Latin Partnership
- [x] lobby configuration

## Rendering

- [ ] PixiJS board
- [ ] rack
- [ ] drag
- [ ] snap
- [ ] orientation
- [ ] auto-snaking
- [ ] camera
- [ ] Matter.js impact
- [ ] screen shake
- [ ] haptics
- [ ] confetti

## Voice

- [ ] WebRTC
- [ ] STUN
- [ ] spatial audio
- [ ] HRTF
- [ ] VAD
- [ ] RNNoise optional enhancement
- [ ] PTT
- [ ] mute
- [ ] peer volume
- [ ] speaking ring
- [ ] graceful failed-P2P behavior

## Social

- [x] Undo
- [ ] soundboard
- [ ] lofi
- [ ] four themes

## AI

- [ ] Shadow Predictor
- [ ] pass inference
- [ ] probability HUD
- [ ] suggested move
- [ ] Ghost model
- [ ] Ghost transparency

## Chaos

- [x] Speed
- [x] Wild Double
- [x] Hot Potato

## Video

- [ ] timeline
- [ ] rolling buffer
- [ ] highlights
- [ ] vertical renderer
- [ ] local ffmpeg
- [ ] download/share

## Ledger

- [ ] SQLite
- [ ] Dexie mirror
- [ ] titles
- [ ] charts

## Psychological Modes

- [ ] Blind Faith
- [ ] Table Tap
- [ ] hesitation
- [ ] Ego Trap
- [ ] Prisoner's End

## Ghost

- [ ] explicit consent
- [ ] telemetry
- [ ] local/open-source model
- [ ] timing
- [ ] optional voice
- [ ] push summary

## Plugins

- [ ] typed SDK
- [ ] QuickJS
- [ ] no DOM
- [ ] no network
- [ ] timeout
- [ ] marketplace
- [ ] synchronization

## PWA

- [ ] manifest
- [ ] service worker
- [ ] offline assets
- [ ] update strategy
- [ ] installable app

## Quality

- [ ] Vitest
- [ ] Playwright
- [ ] ESLint
- [ ] Prettier
- [ ] TypeScript
- [ ] production builds

## Cost

- [ ] no required paid AI API
- [ ] no paid voice SDK
- [ ] no paid TTS API
- [ ] no paid video API
- [ ] no paid push API
- [ ] no paid game-state service
- [ ] no hidden paid runtime dependency

---

# 83. PHASE COMPLETION PROCEDURE

At the end of every implementation phase:

1. Review changed files.
2. Remove temporary debug code.
3. Run relevant Vitest tests.
4. Run TypeScript.
5. Run ESLint.
6. Run formatting checks.
7. Run relevant Playwright tests.
8. Build affected workspaces.
9. Check for security regressions.
10. Check for private-data leaks.
11. Check that no new paid API was introduced.
12. Check that existing installed libraries were reused.
13. Confirm acceptance criteria.
14. Mark phase complete.
15. Update Development Log.
16. Select next unfinished phase.
17. Continue.

Do not stop simply because one phase finished.

---

# 84. AUTONOMOUS CONTINUATION RULE

After completing a phase:

```text
[x] COMPLETE
```

Find the next:

```text
[ ] NOT STARTED
```

Change it to:

```text
[~] IN PROGRESS
```

Continue.

Stop only when:

- owner input is genuinely required;
- credentials are required;
- an irreversible action needs approval;
- requirements materially conflict;
- no approved/open-source solution can satisfy a mandatory requirement;
- free infrastructure is insufficient and a paid resource would be required;
- security/privacy implications require owner choice;
- all phases are complete.

---

# 85. BLOCKER FORMAT

When blocked:

```text
[!] BLOCKED

TASK:
...

REASON:
...

WHAT I VERIFIED:
...

WHY I CANNOT SAFELY CONTINUE:
...

FREE / OPEN-SOURCE OPTIONS:
...

OWNER DECISION REQUIRED:
...
```

Do not solve a blocker by silently purchasing or integrating a commercial service.

---

# 86. DEVELOPMENT LOG

Append:

```text
## YYYY-MM-DD — Phase X

Status:
COMPLETE / BLOCKED

Implemented:
- ...

Libraries used:
- ...

Tests:
- ...

Validation:
- TypeScript:
- Vitest:
- Playwright:
- ESLint:
- Build:

Files changed:
- ...

Architecture decisions:
- ...

Cost audit:
- No new paid runtime dependency: YES/NO

Remaining concerns:
- ...
```

Keep this concise.

---

# 87. FINAL COMPLETION GATE

Do not call the project complete until:

1. All roadmap phases are complete.
2. All required variants work.
3. Multiplayer is authoritative.
4. reconnect works.
5. hidden hands remain private.
6. fair shuffle verification works.
7. PixiJS board works.
8. drag/snap works.
9. auto-snaking works.
10. physical Slam works.
11. spatial voice works where WebRTC connectivity is available.
12. voice failure does not break gameplay.
13. VAD works.
14. PTT works.
15. undo works.
16. all three Chaos mutators work.
17. soundboard synchronizes.
18. procedural music works.
19. all four themes work.
20. Shadow Predictor works locally.
21. replay works.
22. local transcoding works on supported browsers.
23. Karmic Ledger persists.
24. titles work.
25. Blind Faith works.
26. Socratic scoring works.
27. Ghost Table is skipped by owner decision.
33. plugins execute in QuickJS.
34. plugin timeouts work.
35. plugins cannot directly access DOM/network.
36. PWA installs.
37. TypeScript passes.
38. Vitest passes.
39. relevant Playwright tests pass.
40. ESLint passes.
41. production builds pass.
42. no significant regression is knowingly hidden.
43. security boundaries are preserved.
44. privacy controls exist.
45. heavy optional packages are lazy loaded.
46. all 42 approved technologies are used where their corresponding feature requires them.
47. no redundant commercial service replaced an approved open-source solution.
48. production runtime does not depend on DeepSeek/OpenAI/Anthropic/etc.
49. paid infrastructure has not been silently provisioned.
50. owner-approved exceptions, if any, are explicitly documented.

---

# 88. FINAL COST AUDIT

Before release, produce:

```text
RUNTIME COST DEPENDENCIES

Paid APIs required:
NONE

Commercial AI required:
NONE

Commercial voice SDK required:
NONE

Commercial TTS required:
NONE

Commercial video transcoding required:
NONE

Commercial game backend required:
NONE

Commercial notification service required:
NONE
```

If any line cannot truthfully say `NONE`, do not silently release.

Document the dependency and ask the owner.

Hosting may still incur future costs if free-tier limits are exceeded.

That distinction must be documented clearly.

---

# 89. FINAL ARCHITECTURE PRINCIPLE

The intended system is:

```text
                       USER BROWSER
                            │
       ┌────────────────────┼─────────────────────┐
       │                    │                     │
     React                PixiJS               Zustand
       │                    │                     │
       └──────────── UI / GAME CLIENT ───────────┘
                            │
              ┌─────────────┼───────────────┐
              │             │               │
          WebRTC        Web Audio         IndexedDB
              │             │               │
      peer voice/data      audio           Dexie
              │
              │ signaling
              ▼
       Node + Express + Socket.io
              │
        boardgame.io
              │
      authoritative engine
              │
             SQLite

LOCAL OPTIONAL SYSTEMS
────────────────────────────────────
TensorFlow.js / ONNX → Ghost AI
Tone.js             → Lofi
RNNoise WASM        → Noise suppression
ffmpeg.wasm         → Replay encoding
Piper/Web Speech    → Ghost speech
QuickJS WASM        → Plugin sandbox
Workbox             → PWA
```

No cloud AI is required to play.

No paid voice network is required by design for direct P2P-capable peers.

No paid video rendering is required.

No paid plugin execution service is required.

No paid analytics platform is required.

---

# 90. FINAL PRODUCT PRINCIPLE

Every architectural choice should support one goal:

> Build a fast, tactile, social, moddable domino table that friends can enter instantly, where the board feels physical, conversation feels spatial, rivalries persist, optional AI runs locally or through open-source tooling, absent friends can be represented transparently by Ghost agents, social clips can be generated on-device, community mods execute safely, and the product remains free from casino mechanics, hidden bots, vendor lock-in, and unnecessary paid runtime APIs.

---

# 91. DEVELOPMENT LOG

## 2026-10-20 — Phase 1

Status:
COMPLETE

Implemented:

- Deterministic engine: Double-Six (28) + Double-Nine (55) sets, seedrandom shuffle
- SHA-256 hash-before-reveal fairness commitments (native Web Crypto) + verifier
- Board graph with linear chain + spinner tracking for doubles-cross variants
- Modular rule flags (doublesCross / allowDraw / pipScoring / blockedDoubleEndsHand / partnership)
- All five variants: Block, Draw, All Fives/Muggins, Caribbean (Cuban Double-Nine), Latin Partnership team scoring
- Opener deal rotation with stable seating order; opening tile's holder starts
- boardgame.io game definition delegating to shared pure move functions

Libraries used:

- seedrandom (existing), boardgame.io (existing)

Tests:

- tests/unit/engine.test.ts (31): deck, shuffle, commitments, deal ownership, legality, spinner, Block/Draw/Muggins/Double-Nine/Partnership scoring
- tests/unit/moves.test.ts (18): play/draw-until-playable/pass-streak blocked resolution, next-hand carry-over
- tests/integration/server.game.test.ts (1): full two-player socket hand with privacy assertions

Validation:

- TypeScript: PASS (web + server configs)
- Vitest: PASS 50/50
- Playwright: N/A (no browser UI yet — deferred to Phase 3 multi-tab e2e)
- ESLint: PASS
- Build: PASS (web + server)

Files changed:

- shared/engine.ts, shared/types.ts, shared/fairness.ts (new)
- shared/moves.ts (new), shared/dominosGame.ts
- tests/unit/engine.test.ts, tests/unit/moves.test.ts (new)

Architecture decisions:

- Rule logic lives in framework-free shared/moves.ts; boardgame.io is a thin adapter
- Hands rotate with deal order; playerStates keep stable seat order; opener = currentPlayer
- Draw rule: drawer keeps the turn (drawing flag) until playable or yard empty

Cost audit:

- No new paid runtime dependency: YES

Remaining concerns:

- None for Phase 1 acceptance.

## 2026-10-20 — Phase 2 (partial)

Status:
IN PROGRESS

Implemented:

- Express + Socket.IO rooms (create/join/leave), variant config, seating
- Session tokens issued at join; 60s seat reservation on disconnect; room:rejoin rebinds by token
- Authoritative game events (game:ready/play/draw/pass/next-hand) validated by shared engine; per-socket private views (opponent racks never leave the server)
- Typed socket contract in shared/types.ts (ClientToServer / ServerToClient / PlayerView)
- Server factory createServerInstance for ephemeral-port integration tests; isolated in-memory store under test

Libraries used:

- socket.io, socket.io-client (test), express, nanoid, zod (all existing)

Tests:

- tests/integration/server.game.test.ts: lobby → ready → full hand auto-played → next hand; privacy, rejection of illegal moves, turn advancement, scoring, redeal

Validation:

- TypeScript: PASS (web + server configs; integration tests typechecked under server config)
- Vitest: PASS (incl. integration)
- Playwright: BLOCKED on Phase 3 UI (no browser client to drive yet)
- ESLint: PASS
- Build: PASS (web + server)

Files changed:

- server/game.ts (new), server/index.ts, server/signaling.ts, server/rooms.ts
- shared/types.ts (socket contract + PlayerView)
- tests/integration/server.game.test.ts (new, node env)
- tsconfig.json, tsconfig.server.json, vitest.config.ts (integration boundary)

Architecture decisions:

- Never broadcast room-wide game state; emit each sanitized PlayerView only to its socket
- maybeStartHand is idempotent and never redeals a live hand
- Types are split by runtime: web config excludes server + integration; server config covers them

Cost audit:

- No new paid runtime dependency: YES

Remaining concerns:

- Playwright multi-tab suite requires the Phase 3 client UI; will land with it.

## 2026-10-20 â€” Phase 3 (playable client slice)

Status:
IN PROGRESS

Implemented:

- Socket.IO client service (src/net/socket.ts): typed connection lifecycle, same-origin transport through the Vite proxy, session persistence in sessionStorage, automatic seat reclaim on reconnect/refresh, invite-link auto-join via /table/<code>
- Zustand UI store (src/state/tableStore.ts): UI-only state plus intent emitters; authoritative game state is replaced wholesale from the server and never derived locally
- Lobby + waiting room + table shell: name entry, variant picker, create/join, seat roster with ready toggle, invite link
- Playable table: seat panel, snaking board renderer, private rack with click-to-select and end selection, draw/pass/next-hand actions, table chat
- Engine upgrade: the chain now stores tiles in board order with left/right orientation (PlacedTile), so the client renders the board without re-deriving flips
- New shared/board.ts: pure board geometry (snaking layout, centring, board footprint)
- Server: room:create accepts the creator's name and seats them immediately; double-join guard; room meta carries the seat roster; rejoining players receive the live game state
- Playwright config + tests/e2e/multiplayer.spec.ts: two browsers share one table, play a legal tile, verify private racks differ, and verify a page refresh reclaims the seat and keeps the hand

Libraries used:

- socket.io-client, zustand, react, tailwindcss (all existing); @playwright/test (existing)

Tests:

- tests/unit/board.test.ts (5): board order, row centring, serpentine rows, doubles drawn across
- tests/unit/engine.test.ts (+3): board order, tile orientation, adjacent-pair matching
- tests/e2e/multiplayer.spec.ts (2): two-tab shared table with a legal play; reconnect keeps the seat and the rack

Validation:

- TypeScript: PASS (web + server configs)
- Vitest: PASS 58/58
- Playwright: PASS 2/2 (repeat-each=3 stable on the shared-table test)
- ESLint: PASS
- Build: PASS (web + server)

Files changed:

- src/net/socket.ts (new), src/state/tableStore.ts (new)
- src/components/: Lobby, Table, Board, Rack, SeatPanel, ChatPanel, DominoTile
- src/App.tsx (shell routes lobby -> table)
- shared/board.ts (new), shared/types.ts (PlacedTile, RoomSeat), shared/engine.ts (board order + orientation)
- server/signaling.ts (creator name, double-join guard, seat roster, rejoin state), server/game.ts (sendGameStateTo)
- playwright.config.ts (new), tests/e2e/multiplayer.spec.ts (new)

Architecture decisions:

- The chain is stored positionally with orientation, so the renderer never re-derives which half matched
- The client sends intents only; every legality decision stays on the server
- The session token lives in sessionStorage under one key, so a refresh rejoins the same seat instead of taking a new one
- Board geometry is a pure shared module, reusable by the DOM renderer, tests and any future Pixi renderer

Cost audit:

- No new paid runtime dependency: YES

Remaining concerns:

- Drag-and-drop with snapping, the PixiJS/Matter.js renderer, Slam, vibration and confetti are still Phase 3 work.
- The Vite dev proxy logs ECONNABORTED when the browser closes a socket at test teardown; harmless, but noisy.

## 2026-10-20 - Phases 1 and 2 completion audit

Implemented:

- Shared spinner graph with independently validated top/bottom arms and public open-end enumeration.
- All Fives exposed-end scoring, terminal-double counts and rounded hand-end awards.
- Linear Cuban Double-Nine and Latin partnership rules, correct deal sizes, blocked-hand settlement and stable team seats.
- Forced opening now advances to the following seat; cumulative scores retain new opening bonuses.
- Server-only boardgame.io reducer integration and isolated game registries per server store.
- SHA-256 commit/reveal delivery, independent random seeds for subsequent hands and a browser verifier that pins commitments across refreshes.
- Host-only lobby rule changes reset ready votes; live settings and late joins are rejected.
- Room exit acknowledgment, secure session takeover, reservation expiry, full-room handling and match cleanup.
- Same-room signaling validation, socket event limits, reconnect indicators and client session cleanup.
- Integration/browser test TypeScript configuration; no dependencies installed or upgraded.

Architecture / rules:

- The repository retains its existing src/, server/, shared/ layout; these implement the documented client/server/engine boundaries without an unrelated workspace migration.
- RULES.md records regional and project rule choices; partnership score displays mirror a shared award.
- A released seat ends the unfinished match rather than transferring a private rack to a new guest.
- Small camera/ref compatibility fixes preserve concurrent table work while restoring browser verification.

Status: COMPLETE for phases 1 and 2. Phases 3 and 4 remain separate unfinished work.

Validation:

- TypeScript: PASS, including browser and socket integration test sources.
- Vitest: PASS, 124 tests across 10 files.
- Playwright: PASS, 4 browser tests, including full four-player All Fives play, reconnect, local fairness verification, redeal and departure cleanup.
- ESLint: PASS across the repository.
- Production build: PASS for web and server; compiled native-Node server smoke test returns HTTP 200 from /api/health.
- Prettier: changed phase 1/2 files checked; the existing repository-wide formatting backlog remains outside this implementation scope.
- Native Node ESM: boardgame.io imports use explicit runtime entry files with published API declarations; no dependency reinstall required.

Cost audit:

- No paid runtime API, voice provider, database service or new dependency introduced.

## 2026-10-20 - Phase 5: Undo and composable Chaos mutators

Status: COMPLETE

Implemented:

- Five-second owner-only requests and ten-second strict-majority undo voting using authenticated Socket.IO actions and an accessible Radix dialog.
- Moves and Speed deadlines pause while voting; approvals restore boardgame.io game/turn state, racks, stock, scores, history and the original remaining clock. Rejections and expiry resume the paused clock.
- A single immutable reducer snapshot is cached per eligible placement and discarded on later actions, expiry, vote settlement, seat release or server close. No private cache contents cross the socket boundary.
- Speed Dominoes: ten-second authoritative deadlines, automatic skips, deadline checks before incoming actions, countdown display, and a locally generated, cached Howler buzzer with mute control.
- Wild Double: another turn after a played double, with a fresh Speed deadline; winning placements still end the hand.
- Hot Potato: deterministic random penalty draws from remaining stock on legal passes or Speed timeouts. Empty stock remains safe and all tile ownership is preserved.
- Host-only mutator patches merge without overwriting other toggles, reset ready votes and lock during play. Configuration carries across hands.
- Dedicated phase 5 modules and controls; phase 3/4 board and voice modules left unchanged.

Rules / privacy boundary:

- Undo is limited to the latest non-winning placement before any subsequent successful action. A completed hand is final because its shuffle seed has already been revealed. This boundary is documented in RULES.md and enforced on the server.
- Reconnect restores active votes and private views. Disconnected seats retain their vote eligibility until the vote expires or the seat is released.

Validation:

- npm run verify: PASS (TypeScript, ESLint, full Vitest suite, production web/server builds).
- Full Vitest run: 152/152; final focused phase 5 run: 24/24, including one additional score/spinner rollback case added after the full run.
- Playwright: 5/5, including the existing full four-player fairness/redeal flow and the new combined-mutator undo flow.
- Compiled server health smoke test: HTTP 200, ok=true.
- Prettier: changed files pass. Existing unrelated repository formatting differences remain outside this task.
- No new dependencies, paid services, migrations, or external audio/cache providers.

Tests cover:

- All eight mutator combinations, strict majority, duplicate/stale/unauthorized votes, five- and ten-second expiry, paused/restored clocks, delayed timer callbacks, draw timing, extra turns, deterministic penalties, empty stock, blocked resolution, carry-over between hands, score/spinner rollback, private payload filtering, reconnect, cleanup and rapid lobby settings changes.

## 2026-10-21 - Phases 3 and 4: Physical table and spatial voice

Status: COMPLETE

Implemented:

- Responsive full-screen table with stable local-seat rotation, accessible rack and board controls, short-landscape layout and no document scrolling.
- Lazy PixiJS tile renderer backed by pure shared board geometry, viewport-aware branched auto-snaking, spinner arms, rotation, camera fit/pan/zoom and a DOM fallback.
- dnd-kit pointer and touch dragging with legal-end glow, zoom-independent magnetic snapping, placement previews and keyboard/click alternatives.
- Matter.js placement recoil plus accepted-move impact audio, Slam shake, optional vibration and hand-completion confetti; effects respect reduced motion.
- Authenticated Socket.IO voice signaling and native WebRTC full mesh with Google STUN, reconnect recovery and strict same-room validation.
- Opt-in microphone pipeline with PTT, Spacebar PTT, open-mic VAD, local/peer mute, peer volume, HRTF spatialization and analyser-driven speaking rings.
- Self-hosted lazy neural VAD and RNNoise WASM, with energy detection, browser processing and no-voice fallbacks that preserve chat and gameplay.

Validation:

- npm run verify: PASS (TypeScript, ESLint, 163/163 Vitest tests, production web/server builds).
- Playwright: PASS 10/10 full-suite scenarios, plus 2/2 focused fallback checks added afterward.
- Browser coverage includes real Pixi rendering and drag placement, portrait/landscape fit, two- and four-player native WebRTC meshes, remote audio activity, PTT, peer controls, RNNoise/VAD assets, transport reconnect, failed P2P and WebGL fallback keyboard play.
- The compiled server and production voice assets pass local smoke checks.
- No new paid runtime service, TURN provider or external inference API was introduced.

Architecture decisions:

- The server remains authoritative for placement; visual and audio effects start only after accepted placement broadcasts.
- Board geometry is shared and presentation-independent, while Pixi and DOM consume the same slots and camera state.
- Voice uses the existing authenticated room socket for signaling. Media stays peer-to-peer and microphone permission requires an explicit user action.
- Optional inference assets are excluded from the initial bundle and service-worker precache.

Remaining concerns:

- WebRTC voice requires direct peer connectivity; blocked networks fall back to text chat because no paid TURN infrastructure is configured.
