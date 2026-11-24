import { useEffect, useRef, useState } from 'react';
import { allBoardTiles } from '../../shared/graph';
import { legalMoves } from '../../shared/engine';
import { VARIANT_RULES, type Chain, type End, type Tile } from '../../shared/types';
import { useTableStore } from '../state/tableStore';
import { Board } from './Board';
import { ChatPanel } from './ChatPanel';
import { DraggableRack } from '../board/DraggableRack';
import { SeatPanel } from './SeatPanel';
import { VoiceControls } from './VoiceControls';
import { useSlam } from '../board/useSlam';
import { useCamera } from '../board/useCamera';
import { useVoice } from '../voice/useVoice';
import { CornerDownLeft, CornerDownRight, Copy, LogOut, Maximize, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';
import { PhaseFivePanel } from './PhaseFivePanel';
import { ThemePicker } from './ThemePicker';
import { useTheme } from '../themes/useTheme';
import { getTheme } from '../../shared/themes';
import { playBwasShuffle } from '../audio/bwasShuffle';
import { playDominoPick } from '../audio/dominoPick';

const EMPTY_CHAIN: Chain = { tiles: [], leftEnd: 0, rightEnd: 0, spinner: null };

/**
 * The playable table: seats, the chain on the felt, and the player's rack.
 *
 * All game truth comes from the server via `view`; this component only
 * renders it and forwards player intents.
 */
export function Table() {
  const view = useTableStore((s) => s.view);
  const playerId = useTableStore((s) => s.playerId);
  const room = useTableStore((s) => s.room);
  const connected = useTableStore((s) => s.connected);
  const error = useTableStore((s) => s.error);
  const leave = useTableStore((s) => s.leave);
  const selectedTileId = useTableStore((s) => s.selectedTileId);
  const selectedEnd = useTableStore((s) => s.selectedEnd);
  const selectTile = useTableStore((s) => s.selectTile);
  const chooseEnd = useTableStore((s) => s.chooseEnd);
  const playTile = useTableStore((s) => s.playTile);
  const drawTile = useTableStore((s) => s.drawTile);
  const passTurn = useTableStore((s) => s.passTurn);
  const nextHand = useTableStore((s) => s.nextHand);
  const mixTiles = useTableStore((s) => s.mixTiles);
  const pickTile = useTableStore((s) => s.pickTile);
  const lastPlayVelocity = useTableStore((s) => s.lastPlayVelocity);
  const lastPlacement = useTableStore((s) => s.lastPlacement);
  const voice = useVoice();
  const theme = useTheme();
  const palette = getTheme(theme.themeId).palette;
  const { surfaceRef, slam, celebrate } = useSlam();
  const [viewport, setViewport] = useState({ width: 800, height: 400 });
  const boardRef = useRef<HTMLDivElement | null>(null);
  const camera = useCamera(view?.chain ?? EMPTY_CHAIN, viewport, boardRef, view?.lastMove?.tile.id);
  const [drag, setDrag] = useState<{ tile: Tile | null; end: End | null }>({
    tile: null,
    end: null,
  });
  const [impact, setImpact] = useState<{
    tileId: string;
    velocity: number;
    winning: boolean;
  } | null>(null);
  const previous = useRef(view);
  const [copied, setCopied] = useState(false);
  const [pendingPick, setPendingPick] = useState<{ hand: number; slots: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [now, setNow] = useState(0);
  const [cameraAction, setCameraAction] = useState<{
    id: number;
    type: 'fit' | 'zoom-in' | 'zoom-out';
  }>({ id: 0, type: 'fit' });
  const [tailTurn, setTailTurn] = useState<{ count: 0 | 2 | 3 | 4; direction: -1 | 1 }>({
    count: 0,
    direction: 1,
  });
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  useEffect(() => {
    if (view?.phase !== 'mixing' || view.mixingEndsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [view?.phase, view?.mixingEndsAt]);
  useEffect(() => {
    if (view?.phase !== 'mixing' || view.mixingEndsAt === null) return;
    return playBwasShuffle(view.mixingEndsAt);
  }, [view?.phase, view?.mixingEndsAt]);
  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [boardRef]);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (!before || !view || before.handNumber !== view.handNumber) return;
    const last = view.lastMove;
    if (
      last &&
      !allBoardTiles(before.chain).some((tile) => tile.id === last.tile.id) &&
      allBoardTiles(view.chain).some((tile) => tile.id === last.tile.id)
    ) {
      const velocity =
        lastPlacement?.tileId === last.tile.id
          ? lastPlacement.velocity
          : last.playerId === playerId
            ? lastPlayVelocity
            : 0;
      const winning = view.phase === 'hand-complete' && view.winner === last.playerId;
      setImpact({ tileId: last.tile.id, velocity, winning });
      slam(velocity, last.tile.low === last.tile.high, winning);
    }
    if (before.phase === 'awaiting-play' && view.phase === 'hand-complete' && view.winner)
      celebrate();
  }, [view, playerId, lastPlayVelocity, lastPlacement, slam, celebrate]);

  if (!view) {
    return (
      <main
        data-testid="table-waiting"
        className="flex min-h-screen items-center justify-center p-10 text-slate-400"
      >
        Waiting for the dealer…
      </main>
    );
  }

  // `view` is narrowed by the guard above; bind it so the closures below
  // keep the non-null type.
  const table = view;
  const yourTurn =
    connected &&
    table.phase === 'awaiting-play' &&
    !table.phaseFive?.undo.vote &&
    table.currentPlayer === playerId;
  const mixing = table.phase === 'mixing';
  const picking =
    table.phase === 'picking' ||
    (mixing && table.mixingEndsAt !== null && now >= table.mixingEndsAt);
  const canMix = connected && mixing && table.mixingEndsAt === null && table.dealerId === playerId;
  const availableDealSlots = table.dealSlots.filter((slot) => !slot.claimed).length;
  const pickPending =
    pendingPick?.hand === table.handNumber && availableDealSlots >= pendingPick.slots;
  const canPick = connected && picking && table.yourHand.length < 7 && !pickPending;
  const rules = VARIANT_RULES[table.variant];
  const hasMove = legalMoves(table.yourHand, table.chain, table.variant).length > 0;
  // Drawing is only offered when the player is stuck and the variant allows it.
  const canDraw = yourTurn && rules.allowDraw && table.boneyardCount > 0 && !hasMove;
  const handlePickTile = (slotId: string) => {
    if (!canPick) return;
    setPendingPick({ hand: table.handNumber, slots: availableDealSlots });
    playDominoPick();
    pickTile(slotId);
  };
  const handleDrawTile = () => {
    if (!canDraw) return;
    playDominoPick();
    drawTile();
  };
  // The server only accepts a pass when drawing is impossible, so the button
  // must not be offered while the boneyard still has tiles in a draw variant.
  const canPass = yourTurn && !hasMove && (!rules.allowDraw || table.boneyardCount === 0);
  const canArrangeTail = table.chain.tiles
    .slice(1, -1)
    .some((tile) => tile.low === tile.high);

  const focusTile = drag.tile ?? table.yourHand.find((tile) => tile.id === selectedTileId);
  const legalEnds =
    yourTurn && focusTile
      ? legalMoves([focusTile], table.chain, table.variant).map((move) => move.end)
      : [];

  function handleSelectTile(tileId: string): void {
    // Selecting the already-selected tile plays it on the chosen end.
    if (selectedTileId === tileId) {
      if (yourTurn) playTile(tileId, selectedEnd, 0);
      return;
    }
    // Default to an end the tile can legally attach to.
    const options = legalMoves(table.yourHand, table.chain, table.variant).filter(
      (m) => m.tile.id === tileId,
    );
    if (options.length > 0 && !options.some((m) => m.end === selectedEnd)) {
      chooseEnd(options[0]!.end);
    }
    selectTile(tileId);
  }

  function handlePlay(tileId: string, end: End, velocity: number): void {
    if (yourTurn) playTile(tileId, end, velocity);
  }
  return (
    <main
      data-testid="table"
      className="domino-table relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden bg-[radial-gradient(circle_at_50%_0%,var(--theme-surface)_0%,#050A08_70%)] p-2 text-[var(--theme-text)] sm:p-3"
    >
      {!connected && (
        <p role="status">Reconnecting to the table... Your seat is reserved for 60 seconds.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="table-utility-dock">
        <button
          type="button"
          aria-label="Copy table invite"
          onClick={() => {
            void navigator.clipboard
              .writeText(`${location.origin}/table/${room?.code}`)
              .then(() => setCopied(true))
              .catch(() =>
                useTableStore.getState().setError('Copy the room code to invite a friend.'),
              );
          }}
          className="table-icon-button"
        >
          <Copy size={17} /><span className="sr-only">{copied ? 'Copied' : 'Invite'}</span>
        </button>
        <ThemePicker themeId={theme.themeId} onChange={theme.setThemeId} />
        <button type="button" className="table-icon-button" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else if (document.documentElement.requestFullscreen) void document.documentElement.requestFullscreen(); }}>
          {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
        <button
          type="button"
          aria-label="Leave table"
          onClick={leave}
          className="table-icon-button is-danger"
        >
          <LogOut size={17} />
        </button>
      </div>
      <section
        ref={surfaceRef}
        className="table-felt relative min-h-[140px] flex-1 rounded-2xl border border-[#D4AF37]/25 bg-[#0B1A14]/70 shadow-inner"
      >
        <SeatPanel
          view={view}
          playerId={playerId}
          peers={voice.peers}
          localSpeaking={voice.transmitting}
        />
        <div
          ref={boardRef}
          data-testid="board-viewport"
          className="absolute inset-2 sm:inset-5"
          style={{ touchAction: 'none' }}
        >
          <Board
            chain={view.chain}
            camera={camera.camera}
            layout={{
              ...camera.layout,
              tailTurnCount: tailTurn.count,
              tailTurnDirection: tailTurn.direction,
            }}
            legalEnds={legalEnds}
            preview={drag.tile && drag.end ? { tile: drag.tile, end: drag.end } : null}
            impact={impact}
            phase={table.phase}
            dealSlots={table.dealSlots}
            mixingEndsAt={table.mixingEndsAt}
            canPick={canPick}
            cameraAction={cameraAction}
            onPick={handlePickTile}
            feltColor={palette.surface}
          />
        </div>
        {(mixing || table.phase === 'picking') && (
          <div className="pointer-events-none absolute inset-x-4 top-3 z-20 flex justify-center">
            <div className="pointer-events-auto rounded-full bg-slate-950/80 px-4 py-2 text-sm shadow-lg backdrop-blur">
              {canMix ? (
                <button
                  data-testid="mix-tiles"
                  type="button"
                  onClick={mixTiles}
                  className="font-semibold text-amber-300"
                >
                  Mix / Bwas the tiles
                </button>
              ) : mixing && table.mixingEndsAt === null ? (
                <span>
                  Waiting for {table.players.find((p) => p.id === table.dealerId)?.name} to mix.
                </span>
              ) : mixing && !picking ? (
                <span data-testid="mixing-status">Mixing the tiles...</span>
              ) : canPick ? <span className="font-semibold text-amber-300">Pick your tiles</span> : <span>Rack complete</span>}
            </div>
          </div>
        )}
        <div className="absolute bottom-1 right-2 flex gap-2 rounded bg-slate-950/70 p-1">
          {view.chain.tiles.length >= 3 && canArrangeTail && (
            <div className="flex items-center gap-1" aria-label="Arrange recent tiles">
              <select
                aria-label="Recent tiles to bend"
                value={tailTurn.count}
                onChange={(event) =>
                  setTailTurn((current) => ({
                    ...current,
                    count: Number(event.target.value) as 0 | 2 | 3 | 4,
                  }))
                }
                className="rounded bg-black/25 px-1 py-0.5 text-[10px]"
              >
                <option value={0}>Auto</option>
                <option value={2}>Last 2</option>
                <option value={3}>Last 3</option>
                <option value={4}>Last 4</option>
              </select>
              <button type="button" aria-label="Bend recent tiles upward" onClick={() => setTailTurn((current) => ({ count: current.count || 2, direction: -1 }))}><CornerDownLeft size={16} /></button>
              <button type="button" aria-label="Bend recent tiles downward" onClick={() => setTailTurn((current) => ({ count: current.count || 2, direction: 1 }))}><CornerDownRight size={16} /></button>
            </div>
          )}
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => {
              setCameraAction((action) => ({ id: action.id + 1, type: 'zoom-out' }));
              const rect = boardRef.current?.getBoundingClientRect();
              if (rect) camera.zoomAt(-0.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
            }}
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => {
              setCameraAction((action) => ({ id: action.id + 1, type: 'zoom-in' }));
              const rect = boardRef.current?.getBoundingClientRect();
              if (rect) camera.zoomAt(0.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
            }}
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            aria-label="Fit board"
            onClick={() => {
              setCameraAction((action) => ({ id: action.id + 1, type: 'fit' }));
              camera.reset();
            }}
          >
            <Maximize size={16} />
          </button>
        </div>
      </section>
      <section className="table-rack shrink-0 rounded-2xl border border-slate-800 bg-slate-950/60 p-2">
        <DraggableRack
          view={view}
          enabled={connected}
          playerId={playerId}
          selectedTileId={selectedTileId}
          selectedEnd={selectedEnd}
          onSelectTile={handleSelectTile}
          onChooseEnd={chooseEnd}
          onPlay={handlePlay}
          boardRef={boardRef}
          onDragChange={(tile, end) => setDrag({ tile, end })}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {rules.allowDraw && (
            <button type="button" data-testid="draw-tile" disabled={!canDraw} onClick={handleDrawTile} className="rounded-lg border border-[#D4AF37]/50 px-3 py-1.5 text-sm text-[#D4AF37] transition hover:bg-[#D4AF37]/10 disabled:cursor-not-allowed disabled:opacity-30">Draw</button>
          )}
          <button
            type="button"
            data-testid="pass-turn"
            disabled={!canPass}
            onClick={passTurn}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Pass
          </button>
          {view.phase === 'hand-complete' && (
            <button
              type="button"
              data-testid="next-hand"
              onClick={nextHand}
              className="rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              Deal next hand
            </button>
          )}
        </div>
        <PhaseFivePanel />
      </section>

      {view.phase === 'hand-complete' && (
        <p data-testid="hand-result" className="text-center text-sm text-slate-300">
          {view.winner
            ? `${view.players.find((p) => p.id === view.winner)?.name ?? 'Winner'} wins the hand.`
            : 'Hand blocked — the fewest pips win.'}
        </p>
      )}

      <VoiceControls voice={voice} />
      <ChatPanel />
    </main>
  );
}
