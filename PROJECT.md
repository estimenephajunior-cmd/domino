# Open-Source Social Dominoes
## Permanent Project Context

---

# 1. PROJECT PURPOSE

Open-Source Social Dominoes is a browser-first multiplayer domino platform designed to feel like friends sitting around a real physical table rather than using a commercial casino-style game.

Primary product philosophy:

> **Zero-Friction Tactile Lounge**

The experience should prioritize:

- Instant access
- No forced account creation
- No pay-to-win systems
- No coin economy
- No intrusive advertising
- No hidden bots pretending to be humans
- Physical-feeling domino interaction
- Real-time multiplayer
- Spatial voice communication
- Social rivalry and friend-group memory
- Optional local AI assistance
- Transparent Ghost AI
- Community-created game modifications
- Browser/PWA distribution
- Open-source-first implementation
- Minimal infrastructure cost

---

# 2. SOURCE-OF-TRUTH FILES

AI coding agents must read and respect:

```text
.clinerules/coding.md
PROJECT.md
MASTER_ROADMAP.md
```

Responsibilities:

```text
.clinerules/coding.md
→ coding behavior, maintainability, refactoring, testing, safety

PROJECT.md
→ permanent architecture and product decisions

MASTER_ROADMAP.md
→ implementation phases, requirements, acceptance criteria, progress
```

Do not duplicate the entire roadmap inside this file.

---

# 3. CORE ARCHITECTURAL PRINCIPLE

The system is divided into three main workspaces:

```text
packages/shared-engine
packages/server
packages/client
```

Responsibilities:

## `shared-engine`

Contains deterministic game logic independent of UI and networking.

It owns:

- Domino types
- Tile generation
- Shuffle logic
- Fairness verification
- Board graph
- Legal move validation
- Rule variants
- Scoring
- Mutators
- Socratic modifiers
- Shadow Predictor logic
- Plugin contracts

It must not depend on React, PixiJS, browser DOM APIs, or server-only code unless an isolated adapter is explicitly required.

---

## `server`

Contains authoritative multiplayer coordination and persistence.

It owns:

- Room creation
- Seat management
- Session recovery
- Socket.io events
- WebRTC signaling
- Authoritative game state integration
- Reconnect handling
- SQLite persistence
- Karmic Ledger persistence
- Web Push coordination
- Ghost profile storage/training coordination
- Plugin synchronization metadata

The server must never expose another player's private hand.

---

## `client`

Contains the browser application.

It owns:

- React UI
- PixiJS board rendering
- Matter.js effects
- Drag interaction
- Zustand client/UI state
- Audio
- WebRTC
- Spatial positioning
- VAD
- RNNoise
- Soundboard
- Themes
- Procedural music
- Shadow Predictor UI
- Replay generation
- Local Ghost inference
- IndexedDB
- PWA
- Plugin marketplace UI

---

# 4. TECHNOLOGY POLICY

The project follows an:

> **Open-Source-First / Native-Browser-First / Local-First**

architecture.

Core game features should not require paid third-party APIs.

DeepSeek may be used through Cline during development.

DeepSeek is **not** a production runtime dependency.

Production gameplay should not require:

- OpenAI
- Anthropic
- DeepSeek
- Gemini
- ElevenLabs
- Twilio
- Agora
- paid realtime backends
- paid hosted inference
- paid video rendering APIs
- paid push-notification APIs

unless explicitly approved later.

---

# 5. APPROVED TECHNOLOGY STACK

The approved stack is already installed unless repository inspection proves otherwise.

Before installing anything:

1. Inspect `package.json`.
2. Inspect workspace manifests.
3. Inspect lockfile.
4. Search current imports.
5. Confirm the dependency is actually missing.

Do not reinstall or replace existing tools unnecessarily.

---

## Frontend / Rendering

```text
React 19
TypeScript
Vite
PixiJS
Matter.js
Framer Motion
dnd-kit
Canvas-Confetti
HTML5 Vibration API
```

---

## UI / State

```text
Tailwind CSS
Radix UI
Lucide Icons
Zustand
Recharts
```

---

## Game / Networking

```text
boardgame.io
Node.js
Express
Socket.io
Nanoid
seedrandom
```

---

## Voice / Audio

```text
Native WebRTC
Simple-Peer or PeerJS where appropriate
Google public STUN
Web Audio API
@ricky0123/vad-web
RNNoise WASM
Tone.js
Howler.js
```

Use either a WebRTC wrapper or native `RTCPeerConnection` according to existing implementation quality.

Do not maintain multiple competing peer abstractions without a clear need.

---

## Local AI / Storage / Media / Plugins

```text
TensorFlow.js or ONNX Runtime Web
Web Speech API or Piper TTS WASM
IndexedDB via Dexie.js
SQLite via better-sqlite3
MediaRecorder API
ffmpeg.wasm
Web Push / web-push
QuickJS-Emscripten
```

---

## Testing / DevOps

```text
Workbox
Playwright
Vitest
ESLint
Prettier
```

Hosting candidates should use current free tiers when practical.

---

# 6. STATE OWNERSHIP

Do not blur state responsibilities.

## Authoritative Game State

Owned by:

```text
server
boardgame.io
shared-engine
```

Includes:

- Hands
- Turn ownership
- Legal moves
- Board state
- Boneyard
- Scores
- Round state
- Mutators
- Dilemma outcomes

---

## Client UI State

Owned by:

```text
Zustand
React state
```

Includes:

- Open drawers
- Local volume
- Selected theme
- UI overlays
- Dragging state
- Local preferences
- HUD visibility

Do not copy the entire authoritative multiplayer state into Zustand as a second source of truth.

---

## Rendering State

Owned by:

```text
PixiJS
Matter.js
```

Includes:

- Tile positions
- Animation values
- Particle effects
- Temporary impact physics
- Camera transforms

Rendering state must not decide game legality.

---

## Browser Persistence

Owned by:

```text
Dexie.js
IndexedDB
```

Includes appropriate local:

- settings
- history cache
- Ghost profile data
- media metadata
- offline preferences

---

## Server Persistence

Owned by:

```text
SQLite
better-sqlite3
```

Includes:

- Karmic Ledger
- match history where required
- player titles
- rivalry statistics
- Ghost profile metadata
- push subscriptions where appropriate

---

# 7. GAME AUTHORITY RULE

The client may request an action.

The server/shared game engine decides whether it is valid.

Conceptually:

```text
Client
  ↓
"I want to play [6|4] on the left end"
  ↓
Server / Shared Engine
  ↓
validate move
  ↓
accept or reject
  ↓
broadcast authoritative result
```

Never trust:

```text
client says:
"my new game state is ..."
```

as authoritative multiplayer state.

---

# 8. PRIVATE INFORMATION

Private hands must remain private.

A player may receive:

- Their own hand
- Opponent tile counts
- Public board state
- Public scores
- Public game events

A player must not receive another player's hidden rack.

Shadow Predictor calculations must use:

- local player's own rack
- visible tiles
- public actions
- pass history
- draw events where public

It must not inspect hidden opponent hand data.

---

# 9. GAME VARIANTS

Required game variants:

```text
Classic Block
Draw Dominoes
All Fives / Muggins
Caribbean / Cuban Double-Nine
Latin Partnership
```

Required sets:

```text
Double-Six
Double-Nine
```

Rule implementations should be modular and testable.

Avoid giant branching files containing every game variant.

---

# 10. FAIRNESS

Use deterministic shuffle logic.

`seedrandom` is responsible for reproducible pseudo-random ordering.

Cryptographic commitment/verification should use SHA-256 through suitable native crypto facilities.

Do not treat `seedrandom` itself as a cryptographic security primitive.

Players should eventually be able to verify completed-round shuffle fairness.

---

# 11. ROOM MODEL

Basic gameplay requires no permanent account.

Create rooms with:

```text
nanoid(8)
```

Routes resemble:

```text
/table/:roomCode
```

Temporary browser identity uses:

```text
playerID
sessionToken
```

stored in:

```text
sessionStorage
```

---

# 12. SEATING MODEL

Relative layout:

```text
Bottom = local player
Left   = other player
Top    = other player / partner
Right  = other player
```

The local player should always perceive their own seat from the bottom perspective.

Voice spatialization must rotate logically according to this local perspective.

---

# 13. WEBRTC MODEL

Voice is intended to be peer-to-peer.

Use:

```text
WebRTC
Socket.io signaling
Google STUN
```

The signaling server exchanges:

- peer presence
- SDP offers
- SDP answers
- ICE candidates

Audio media should remain peer-to-peer where connectivity permits.

STUN does not guarantee connectivity for every network.

If direct P2P fails:

- gameplay must continue;
- voice should fail gracefully;
- do not silently purchase or integrate a paid TURN provider.

A self-hosted TURN option may be evaluated later if needed.

---

# 14. AUDIO ARCHITECTURE

Separate responsibilities.

```text
WebRTC
→ voice transport

Web Audio API
→ spatial voice processing

vad-web
→ speech detection

RNNoise
→ optional enhanced noise filtering

Howler.js
→ sound effects / soundboard

Tone.js
→ procedural lofi
```

Avoid creating one giant audio manager containing every responsibility.

---

# 15. SPATIAL AUDIO MODEL

Approximate seat positions:

```text
Left:
x = -0.85

Top:
x = 0
z = -1.0

Right:
x = +0.85
```

Use:

```text
PannerNode
HRTF
```

where supported.

Speaking indicators use:

```text
AnalyserNode
```

---

# 16. TABLE UX

Gameplay should feel physical.

Tile interactions include:

- lifted state
- shadows
- magnetic snapping
- valid-end glow
- automatic rotation
- Slam effects
- optional vibration
- weighted impact sounds
- Matter.js recoil
- auto-snaking board
- smooth camera adjustment

The board must remain readable and usable without relying on effects.

---

# 17. UI VISUAL IDENTITY

Default palette:

```text
#0F291E — deep slate emerald
#D4AF37 — brushed brass
#F59E0B — legal placement glow
```

Primary atmosphere:

```text
warm late-night social club
```

Supported themes:

```text
Classic Green Felt
Havana Courtyard
Cyberpunk Bodega
Tokyo Lofi Study
```

---

# 18. TYPOGRAPHY

```text
Space Grotesk
→ scores / numbers

Inter
→ controls / interface

JetBrains Mono
→ probabilities / room codes / timers
```

---

# 19. LOCAL AI PHILOSOPHY

Prefer deterministic algorithms before machine learning.

Example:

```text
Shadow Predictor
```

should primarily use:

- combinatorics
- known tiles
- played tiles
- pass history
- draws
- probabilities

It should not require an LLM.

Machine learning is more appropriate for:

```text
Ghost behavioral modeling
```

Use:

```text
TensorFlow.js
or
ONNX Runtime Web
```

where useful.

---

# 20. GHOST AI PRINCIPLES

Ghost AI must be:

- optional
- transparent
- clearly labeled
- consent-based
- unable to bypass normal game rules

Example:

```text
Bob's Ghost AI
```

Never pretend Ghost AI is the real human player.

---

# 21. GHOST PRIVACY

Only collect behavioral telemetry from consenting users.

Permitted categories may include:

- hesitation time
- move preference
- blocking preference
- risk preference
- pip dumping
- dilemma behavior

Voice snippets require separate explicit opt-in.

Do not collect unrelated personal data.

---

# 22. GHOST SPEECH

Preferred options:

```text
stored opt-in reaction clips
Piper TTS WASM
Web Speech API
```

No commercial TTS dependency should be required for core functionality.

---

# 23. REPLAY ARCHITECTURE

Gameplay should produce deterministic event history where practical.

Use:

```text
MediaRecorder
Canvas / OffscreenCanvas
ffmpeg.wasm
```

for local highlight creation.

Heavy replay libraries should be lazy-loaded.

No commercial video-processing API is required.

---

# 24. PLUGIN ARCHITECTURE

Community code executes only inside:

```text
QuickJS-Emscripten
```

Plugins must not directly receive:

```text
window
document
fetch
filesystem access
process
Node require
database connections
secret game state
server internals
```

Expose only a constrained typed host API.

---

# 25. PLUGIN HOOKS

Required public hooks include:

```text
onRoundStart
onValidateMove
onTilePlayed
onTurnPass
onCalculateScore
customVisualTheme
```

Final interfaces should use strict types.

Avoid loose `any` in production plugin SDK contracts.

---

# 26. MODULARITY PRINCIPLE

Prefer cohesive modules over giant files.

Example:

```text
audio/
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

containing an entire subsystem.

Likewise:

```text
rules/
├── block.ts
├── draw.ts
├── muggins.ts
├── partnership.ts
└── caribbean.ts
```

may be preferable to one large variant file.

Split by responsibility, not arbitrary line counts.

---

# 27. PERFORMANCE PRINCIPLES

Initial load should stay lightweight.

Do not eagerly load:

```text
ffmpeg.wasm
TensorFlow.js
ONNX Runtime
RNNoise
Piper TTS
Plugin marketplace
advanced analytics
```

unless required immediately.

Prefer lazy loading.

Avoid:

- React rerender per animation frame
- excessive canvas allocation
- repeatedly decoding audio
- redundant full-state network messages
- duplicate caches
- duplicate client state stores

---

# 28. ACCESSIBILITY

The project should support where practical:

- keyboard input
- focus states
- screen-reader labels
- reduced motion
- high contrast
- visible voice indicators
- mute controls
- volume controls

Do not communicate required information only through:

- color
- sound
- vibration

---

# 29. TESTING PHILOSOPHY

Use:

```text
Vitest
```

for deterministic/unit behavior.

Use:

```text
Playwright
```

for full browser flows and multiplayer testing.

Every important bug fix should receive a regression test when practical.

Do not weaken tests merely to make them pass.

---

# 30. DEVELOPMENT QUALITY GATES

Before considering implementation work complete:

```text
TypeScript passes
Vitest passes
ESLint passes
Prettier checks pass
relevant Playwright tests pass
production build passes
```

Fix regressions introduced by the current task.

---

# 31. PWA PRINCIPLE

The game should ultimately be installable using browser/PWA functionality.

Use:

```text
Workbox
```

for:

- service worker
- static asset caching
- update handling

Never use stale cached multiplayer state as authoritative game state.

---

# 32. DEPLOYMENT PRINCIPLE

Frontend free-tier candidates:

```text
Vercel
Netlify
GitHub Pages
```

Backend free-tier candidates:

```text
Render
Fly.io
Railway
```

Availability and quotas may change.

Never automatically enable billing.

If free hosting cannot meet a required production capability, report it as a blocker rather than silently upgrading.

---

# 33. COST PRINCIPLE

The intended architecture has:

```text
Paid application AI API required: NO
Paid voice provider required: NO
Paid TTS provider required: NO
Paid video-processing API required: NO
Paid push API required: NO
Paid game backend required: NO
```

Hosting free tiers can have limits.

The system should be designed to minimize server bandwidth and compute through:

- P2P voice
- local ML
- browser audio
- local media processing
- static frontend hosting

---

# 34. DEPENDENCY RULE

When implementing a feature:

```text
existing approved library
        ↓
use it
```

Do not add a second library that duplicates the same responsibility without a strong reason.

Examples:

```text
Zustand exists
→ don't introduce Redux casually

Howler exists
→ don't add another SFX framework

Recharts exists
→ don't add another chart library

QuickJS exists
→ don't use eval()

PixiJS exists
→ don't introduce another canvas renderer casually
```

---

# 35. PRODUCT PRINCIPLE

All development should support the same central experience:

> Friends should be able to open a link, immediately sit around a convincing digital domino table, hear one another spatially, manipulate tactile tiles, play traditional or experimental rules, build long-running rivalries, generate memorable highlights, interact with transparent Ghost versions of absent friends, and safely extend the table through community mods—without pay-to-win mechanics, hidden bots, unnecessary commercial APIs, or vendor lock-in.