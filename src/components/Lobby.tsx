import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Clipboard, Copy, Crown, DoorOpen, Gamepad2, Handshake, Inbox, LockKeyhole, Radio, Scale, Share2, ShieldCheck, Sparkles, UserRound, Users, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { RULE_VARIANTS, VARIANT_RULES, type RoomSeat, type RuleVariant } from '../../shared/types';
import { roomCodeFromLocation } from '../net/socket';
import { useTableStore } from '../state/tableStore';
import { useTheme } from '../themes/useTheme';
import { KarmicLedger } from './KarmicLedger';
import { MutatorSettings } from './MutatorSettings';
import { ThemePicker } from './ThemePicker';

const LOBBY_VARIANTS = RULE_VARIANTS.filter((variant) => variant !== 'caribbean' && variant !== 'all-fives');
const SEAT_LABELS = ['South', 'West', 'North', 'East'] as const;
const VARIANT_META: Record<RuleVariant, { icon: ReactNode; blurb: string; players: string; set: string }> = {
  block: { icon: <ShieldCheck size={19} />, blurb: 'Empty your rack first—or win by trapping the table.', players: '2–4 players', set: 'Double-6' },
  draw: { icon: <Inbox size={19} />, blurb: 'No legal move? Draw from the boneyard and keep the hand moving.', players: '2–4 players', set: 'Double-6' },
  'all-fives': { icon: <Scale size={19} />, blurb: 'Score whenever the exposed ends add up to a multiple of five.', players: '2–4 players', set: 'Double-6' },
  latin: { icon: <Handshake size={19} />, blurb: 'Partners sit opposite and combine their score in a tactical 2v2.', players: '4 players · 2v2', set: 'Double-6' },
  caribbean: { icon: <Users size={19} />, blurb: 'Classic Caribbean rules.', players: '2–4 players', set: 'Double-9' },
};
const PIPS: Record<number, readonly string[]> = { 0: [], 1: ['mc'], 2: ['tl', 'br'], 3: ['tl', 'mc', 'br'], 4: ['tl', 'tr', 'bl', 'br'], 5: ['tl', 'tr', 'mc', 'bl', 'br'], 6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'] };
const DECORATIONS = [
  { className: 'left-[3%] top-[16%] -rotate-12', a: 6, b: 6, delay: 0 },
  { className: 'right-[4%] top-[22%] rotate-[14deg]', a: 5, b: 3, delay: 0.12 },
  { className: 'bottom-[8%] left-[8%] rotate-[8deg]', a: 4, b: 2, delay: 0.22 },
  { className: 'bottom-[6%] right-[7%] -rotate-[9deg]', a: 1, b: 5, delay: 0.32 },
] as const;

function roomLink(code: string) { return `${window.location.origin}/table/${code}`; }
function initials(name: string) { const clean = name.trim(); return clean ? clean.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') : '—'; }
function PipHalf({ value }: { readonly value: number }) { return <span className="domino-half" aria-hidden="true">{PIPS[value]?.map((position) => <i key={position} className={`domino-pip pip-${position}`} />)}</span>; }
function DominoMark({ a = 6, b = 4, small = false }: { readonly a?: number; readonly b?: number; readonly small?: boolean }) { return <span className={`domino-mark ${small ? 'domino-mark--small' : ''}`} aria-hidden="true"><PipHalf value={a} /><span className="domino-divider" /><PipHalf value={b} /></span>; }

function Atmosphere() {
  const reduceMotion = useReducedMotion();
  return <div className="lobby-atmosphere" aria-hidden="true"><div className="lobby-spotlight" /><div className="lobby-grain" />{DECORATIONS.map((tile) => <motion.div key={tile.className} className={`lobby-floating-tile ${tile.className}`} initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.92 }} animate={reduceMotion ? undefined : { opacity: 0.42, y: [0, -5, 0], scale: 1 }} transition={reduceMotion ? undefined : { opacity: { delay: tile.delay, duration: 0.5 }, y: { delay: tile.delay, duration: 6, repeat: Infinity, ease: 'easeInOut' } }}><DominoMark a={tile.a} b={tile.b} /></motion.div>)}</div>;
}

function ClubHeader({ connected }: { readonly connected: boolean }) {
  const theme = useTheme();
  return <header className="club-header"><div className="club-brand"><DominoMark a={6} b={1} small /><div><strong>DOMINO</strong><span>Private table club</span></div></div><div className="club-header-actions"><div className={`connection-pill ${connected ? 'is-online' : ''}`} role="status">{connected ? <Wifi size={14} /> : <WifiOff size={14} />}<span>{connected ? 'Online · Low latency' : 'Connecting'}</span></div><ThemePicker themeId={theme.themeId} onChange={theme.setThemeId} /><KarmicLedger /></div></header>;
}

function IdentityCard({ name, onChange }: { readonly name: string; readonly onChange: (name: string) => void }) {
  const alias = name.trim(); const valid = alias.length >= 3 && alias.length <= 24;
  return <section className="club-card identity-card"><div className={`identity-avatar ${valid ? 'is-valid' : ''}`}>{initials(name)}</div><div className="min-w-0 flex-1"><div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="player-alias" className="club-label">Your display name</label><span className={`validation-badge ${valid ? 'is-valid' : ''}`}>{valid ? <><Check size={12} /> Ready</> : `${name.length}/24`}</span></div><input id="player-alias" value={name} onChange={(event) => onChange(event.target.value)} maxLength={24} autoComplete="nickname" placeholder="Enter your alias" className="club-input" aria-label="Your display name" aria-describedby="alias-help" aria-invalid={!valid} /><p id="alias-help" className={`field-help ${name.length > 0 && !valid ? 'is-error' : ''}`}>{name.length > 0 && !valid ? 'Alias must contain at least 3 characters.' : 'This is how players will see you at the table.'}</p></div></section>;
}

function VariantCard({ id, selected, onSelect }: { readonly id: RuleVariant; readonly selected: boolean; readonly onSelect: (id: RuleVariant) => void }) {
  const meta = VARIANT_META[id]; const descriptionId = `variant-${id}-description`;
  return <button type="button" role="radio" aria-label={VARIANT_RULES[id].label} aria-describedby={descriptionId} aria-checked={selected} onClick={() => onSelect(id)} className="variant-card"><span className="variant-icon">{meta.icon}</span><span className="min-w-0 flex-1"><span className="variant-heading"><strong>{VARIANT_RULES[id].label}</strong>{selected ? <Check size={16} /> : null}</span><span className="variant-pills"><i>{meta.set}</i><i>{meta.players}</i></span><span id={descriptionId} className="variant-description">{meta.blurb}</span></span></button>;
}
function FeatureStrip() { const features = [{ icon: <ShieldCheck size={15} />, label: 'Provably fair' }, { icon: <LockKeyhole size={15} />, label: 'Private racks' }, { icon: <Radio size={15} />, label: 'Spatial voice' }, { icon: <Users size={15} />, label: 'Human tables' }]; return <div className="feature-strip">{features.map((feature) => <span key={feature.label}>{feature.icon}{feature.label}</span>)}</div>; }

function HostPanel({ variant, setVariant, disabled, onCreate }: { readonly variant: RuleVariant; readonly setVariant: (variant: RuleVariant) => void; readonly disabled: boolean; readonly onCreate: () => void }) {
  return <section className="club-card action-panel host-panel" aria-labelledby="host-title"><div className="panel-heading"><span className="eyebrow">Start a new game</span><h2 id="host-title">Host a table</h2><p>Choose the house rules. Friends can join instantly with your private code.</p></div><div className="variant-grid" role="radiogroup" aria-label="Rule variant">{LOBBY_VARIANTS.map((id) => <VariantCard key={id} id={id} selected={variant === id} onSelect={setVariant} />)}</div><button type="button" aria-label="Create table" disabled={disabled} onClick={onCreate} className="primary-club-button"><Sparkles size={18} />Create table<span className="button-arrow">→</span></button></section>;
}
function JoinPanel({ code, setCode, incoming, disabled, onJoin }: { readonly code: string; readonly setCode: (code: string) => void; readonly incoming: boolean; readonly disabled: boolean; readonly onJoin: () => void }) {
  return <section className={`club-card action-panel join-panel ${incoming ? 'has-invite' : ''}`} aria-labelledby="join-title"><div className="invite-stamp"><Clipboard size={18} /><span>{incoming ? 'Invitation received' : 'Table pass'}</span></div><div className="panel-heading"><span className="eyebrow">Take your seat</span><h2 id="join-title">Join a table</h2><p>{incoming ? 'Your code is ready. Add your alias, then take your seat.' : 'Enter the six-character code from your invitation.'}</p></div><label htmlFor="room-code" className="club-label">Room code</label><div className="code-input-wrap"><span aria-hidden="true">#</span><input id="room-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} onBlur={() => setCode(code.trim())} placeholder="6K7M2Q" maxLength={6} spellCheck={false} autoCapitalize="characters" className="club-input code-input" aria-label="Room code" /></div><p className="field-help">Invite links fill this automatically.</p><button type="button" aria-label="Join" disabled={disabled} onClick={onJoin} className="secondary-club-button"><DoorOpen size={18} />Join<span className="button-arrow">→</span></button><div className="ticket-notches" aria-hidden="true" /></section>;
}

function SeatCard({ seat, position, playerId, hostId }: { readonly seat?: RoomSeat; readonly position: string; readonly playerId: string | null; readonly hostId?: string }) {
  if (!seat) return <div className="seat-card is-open"><span className="seat-position">{position}</span><div className="seat-avatar"><UserRound size={18} /></div><span>Open seat</span></div>;
  const status = seat.connected === false ? 'Reconnecting' : seat.ready ? 'Ready' : 'Waiting';
  return <motion.li layout className={`seat-card is-occupied ${seat.ready ? 'is-ready' : ''}`}><span className="seat-position">{position}</span><div className="seat-avatar">{initials(seat.name)}</div><span className="seat-name">{seat.name}</span><span className="seat-badges">{seat.id === hostId ? <i><Crown size={11} />Host</i> : null}{seat.id === playerId ? <i>You</i> : null}</span><span className={`seat-status status-${status.toLowerCase()}`}><b />{status}</span></motion.li>;
}

function InviteTicket({ code }: { readonly code: string }) {
  const [feedback, setFeedback] = useState(''); const link = code ? roomLink(code) : '';
  async function copyLink() { if (!link) return; try { await navigator.clipboard.writeText(link); setFeedback('Invite copied'); } catch { setFeedback('Copy unavailable—select the link below'); } window.setTimeout(() => setFeedback(''), 2200); }
  async function shareLink() { if (!link || !navigator.share) return copyLink(); try { await navigator.share({ title: 'Join my domino table', text: 'Take a seat at my domino table.', url: link }); } catch { /* Native share cancellation is not an error. */ } }
  return <section className="invite-ticket" aria-labelledby="invite-title"><div><span className="eyebrow">Private invitation</span><h3 id="invite-title">Bring your people to the table</h3></div><div className="invite-code-row"><code>{code}</code><button type="button" onClick={() => void copyLink()}><Copy size={16} /><span>Copy invite link</span></button>{typeof navigator.share === 'function' ? <button type="button" onClick={() => void shareLink()} aria-label="Share invite"><Share2 size={16} /></button> : null}</div><input className="share-url" value={link} readOnly aria-label="Shareable invite URL" onFocus={(event) => event.currentTarget.select()} /><span className="sr-only" role="status" aria-live="polite">{feedback}</span>{feedback ? <p className="copy-feedback">{feedback}</p> : null}</section>;
}

function WaitingRoom() {
  const room = useTableStore((state) => state.room);
  const playerId = useTableStore((state) => state.playerId);
  const connected = useTableStore((state) => state.connected);
  const error = useTableStore((state) => state.error);
  const toggleReady = useTableStore((state) => state.toggleReady);
  const leave = useTableStore((state) => state.leave);
  const changeVariant = useTableStore((state) => state.changeVariant);

  const me = room?.seats.find((seat) => seat.id === playerId);
  const hostId = room?.seats[0]?.id;
  const isHost = hostId === playerId;
  const readyCount = room?.seats.filter((seat) => seat.ready).length ?? 0;
  const allReady = Boolean(room && room.seats.length > 0 && room.seats.every((seat) => seat.ready));
  const seatsByIndex = new Map(room?.seats.map((seat) => [seat.seat, seat]));

  if (!room) return null;

  return (
    <motion.main
      data-testid="waiting-room"
      className="waiting-layout"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <section className="waiting-hero">
        <div>
          <span className="eyebrow">Table is open</span>
          <h1>Waiting for the crew</h1>
          <p>
            {readyCount} of {room.playerCount} seated player{room.playerCount === 1 ? '' : 's'} ready
          </p>
        </div>
        {!connected ? (
          <div className="reconnect-banner" role="status">
            <WifiOff size={16} /> Reconnecting—your seat is reserved for 60 seconds.
          </div>
        ) : null}
        {error ? <p role="alert" className="error-banner">{error}</p> : null}
      </section>

      <div className="waiting-grid">
        <section className="table-lounge" aria-label="Table seats">
          <div className="table-felt" aria-hidden="true" />
          <div data-testid="seat-list" className="seat-grid">
            {[0, 1, 2, 3].map((index) => (
              <SeatCard
                key={index}
                seat={seatsByIndex.get(index)}
                position={SEAT_LABELS[index]!}
                playerId={playerId}
                hostId={hostId}
              />
            ))}
          </div>
          <div className="waiting-table-center">
            <DominoMark a={6} b={6} />
            <strong>{VARIANT_RULES[room.variant].label}</strong>
            <span>{VARIANT_META[room.variant].players}</span>
            <div className="ready-progress">
              <i
                style={{
                  width: `${room.playerCount === 0 ? 0 : (readyCount / room.playerCount) * 100}%`,
                }}
              />
            </div>
            <small>{room.playerCount} / {room.maxPlayers} seated</small>
          </div>
        </section>

        <aside className="waiting-sidebar">
          <InviteTicket code={room.code} />
          <section className="club-card host-controls">
            <div className="control-heading">
              <div>
                <span className="eyebrow">Table rules</span>
                <h2>{isHost ? 'Host controls' : 'House setup'}</h2>
              </div>
              {isHost ? (
                <span className="host-badge"><Crown size={12} /> Host only</span>
              ) : (
                <span className="host-badge">View only</span>
              )}
            </div>
            <label className="club-label" htmlFor="table-rules">
              Game variant
            </label>
            <select
              id="table-rules"
              aria-label="Table rules"
              value={room.variant}
              disabled={!isHost || !connected}
              onChange={(event) => changeVariant(event.target.value as RuleVariant)}
              className="club-select"
            >
              {LOBBY_VARIANTS.map((item) => (
                <option key={item} value={item}>
                  {VARIANT_RULES[item].label}
                </option>
              ))}
            </select>
            {VARIANT_RULES[room.variant].partnership && room.playerCount < 4 ? (
              <p className="partnership-note">
                <Users size={15} /> Partnership requires all four seats.
              </p>
            ) : null}
            <MutatorSettings />
          </section>
        </aside>
      </div>

      <div className="waiting-actions">
        <div>
          <strong>{me?.ready ? "You're ready to play" : 'Ready when you are'}</strong>
          <span>
            {connected
              ? 'The game starts when every seated player is ready.'
              : 'Actions resume when the connection returns.'}
          </span>
        </div>
        <button
          type="button"
          data-testid="leave-room"
          onClick={leave}
          className="leave-button"
        >
          Leave
        </button>
        <button
          type="button"
          data-testid="toggle-ready"
          disabled={!connected}
          onClick={() => toggleReady(!me?.ready)}
          className={`primary-club-button ${allReady ? 'is-all-ready' : ''}`}
        >
          {me?.ready ? (
            <><Check size={18} /> Not ready</>
          ) : (
            <><Gamepad2 size={18} /> Ready up</>
          )}
        </button>
      </div>
    </motion.main>
  );
}

export function Lobby() {
  const identity = useTableStore((state) => state.identity); const setIdentityName = useTableStore((state) => state.setIdentityName); const createRoom = useTableStore((state) => state.createRoom); const join = useTableStore((state) => state.join); const connected = useTableStore((state) => state.connected); const error = useTableStore((state) => state.error); const room = useTableStore((state) => state.room);
  const inviteCode = roomCodeFromLocation() ?? ''; const [joinCode, setJoinCode] = useState(inviteCode); const [variant, setVariant] = useState<RuleVariant>('block'); const [mobilePanel, setMobilePanel] = useState<'host' | 'join'>(inviteCode ? 'join' : 'host'); const alias = identity.name.trim(); const aliasValid = alias.length >= 3 && alias.length <= 24;
  useEffect(() => { window.scrollTo({ top: 0, left: 0 }); }, [room]);
  return <div className="club-page"><Atmosphere /><div className="club-shell"><ClubHeader connected={connected} />{room ? <WaitingRoom /> : <main className="lobby-main"><section className="lobby-intro"><span className="eyebrow"><Sparkles size={13} />The table is yours</span><h1>Real dominoes.<br /><em>Real people.</em></h1><p>Pull up a chair, invite your crew, and play the game the way it feels around a real table.</p></section><IdentityCard name={identity.name} onChange={setIdentityName} /><div className="mobile-panel-tabs" role="tablist" aria-label="Table action"><button type="button" role="tab" aria-selected={mobilePanel === 'host'} onClick={() => setMobilePanel('host')}>Host</button><button type="button" role="tab" aria-selected={mobilePanel === 'join'} onClick={() => setMobilePanel('join')}>{inviteCode ? 'Your invite' : 'Join'}</button></div><div className="lobby-action-grid"><div className={mobilePanel === 'host' ? 'mobile-panel-active' : 'mobile-panel-hidden'}><HostPanel variant={variant} setVariant={setVariant} disabled={!connected || !aliasValid} onCreate={() => createRoom(variant)} /></div><div className={mobilePanel === 'join' ? 'mobile-panel-active' : 'mobile-panel-hidden'}><JoinPanel code={joinCode} setCode={setJoinCode} incoming={Boolean(inviteCode)} disabled={!connected || !aliasValid || joinCode.trim().length < 3} onJoin={() => join(joinCode.trim(), identity.name)} /></div></div><AnimatePresence>{error ? <motion.p role="alert" className="error-banner lobby-error" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{error}</motion.p> : null}</AnimatePresence><FeatureStrip /><footer className="club-footer"><span>© Domino Table Club</span><span>Deterministic engine · Fair shuffles · Private racks</span><span>Private by design</span></footer></main>}</div></div>;
}
