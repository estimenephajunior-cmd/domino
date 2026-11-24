/**
 * The voice mesh: one peer connection per opponent.
 *
 * The table holds at most four players, so a full mesh is cheap: every
 * player connects to every other player. The lower player id makes the
 * offer, which keeps the two sides from negotiating at the same time.
 */
import type { Socket } from 'socket.io-client';
import {
  PEER_SILENCE_TIMEOUT_MS,
  type PeerConnectionState,
  type VoiceUnavailableReason,
} from '../../shared/voice';
import { parseSignal, sendSignal, shouldOffer, type VoiceSignalMessage } from './signaling';

/** The ICE servers used for the peer connections. */
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** One remote peer. */
export interface Peer {
  readonly id: string;
  readonly connection: RTCPeerConnection;
  /** The remote audio stream, once it arrives. */
  stream: MediaStream | null;
  /** When the last audio frame was received, in milliseconds. */
  lastHeardAt: number;
  queue: Promise<void>;
  dataChannel: RTCDataChannel | null;
}

/** The callbacks the mesh reports through. */
export interface MeshHandlers {
  /** A peer's connection state changed. */
  onState(playerId: string, state: PeerConnectionState): void;
  /** A remote audio stream arrived (or was replaced). */
  onStream(playerId: string, stream: MediaStream): void;
  /** A peer could not be reached. */
  onError(playerId: string, reason: VoiceUnavailableReason): void;
  /** A peer went quiet for longer than the timeout. */
  onSilence(playerId: string): void;
  /** A small social event arrived over the peer data channel. */
  onData(playerId: string, payload: unknown): void;
}

/** The mesh's configuration. */
export interface MeshOptions {
  /** The local player's id. */
  readonly localId: string;
  /** The signalling socket. */
  readonly socket: Socket | null;
  /** The local microphone track, added to every peer connection. */
  readonly localTrack: MediaStreamTrack | null;
  /** The callbacks. */
  readonly handlers: MeshHandlers;
}

/**
 * Manage the peer connections.
 *
 * The mesh owns its own lifecycle: peers are added and removed as players
 * join and leave, and every connection is closed when the mesh is disposed.
 */
export class VoiceMesh {
  private readonly localId: string;
  private readonly socket: Socket | null;
  private readonly localTrack: MediaStreamTrack | null;
  private readonly handlers: MeshHandlers;
  private readonly peers = new Map<string, Peer>();
  private readonly pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private disposed = false;
  private allowed = new Set<string>();
  private readonly timer: ReturnType<typeof setInterval>;

  sync(ids: readonly string[]): void {
    this.allowed = new Set(ids.filter((id) => id !== this.localId));
    for (const id of this.peerIds) if (!this.allowed.has(id)) this.disconnect(id);
    for (const id of this.allowed)
      void this.connect(id).catch(() => this.handlers.onError(id, 'unknown'));
  }
  retry(): void {
    for (const id of this.peerIds) this.disconnect(id);
    this.sync([...this.allowed]);
  }

  constructor(options: MeshOptions) {
    this.localId = options.localId;
    this.socket = options.socket;
    this.localTrack = options.localTrack;
    this.handlers = options.handlers;
    this.timer = setInterval(() => {
      for (const id of this.silentPeers()) {
        this.handlers.onError(id, 'no-peer-support');
        this.handlers.onSilence(id);
      }
    }, 2000);

    if (this.socket) {
      this.socket.on('signal:offer', this.handleSignal);
      this.socket.on('signal:answer', this.handleSignal);
      this.socket.on('signal:ice', this.handleSignal);
    }
  }

  /** The peers currently in the mesh. */
  get peerIds(): string[] {
    return [...this.peers.keys()];
  }

  /** A peer, if it exists. */
  peer(playerId: string): Peer | undefined {
    return this.peers.get(playerId);
  }

  /**
   * Connect to a player.
   *
   * The connection is created immediately; the offer is sent afterwards, so
   * the local track is attached before the offer describes the media.
   */
  async connect(remoteId: string): Promise<void> {
    if (this.disposed || !this.allowed.has(remoteId) || this.peers.has(remoteId)) return;
    const connection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 2,
    });

    const peer: Peer = {
      id: remoteId,
      connection,
      stream: null,
      lastHeardAt: Date.now(),
      queue: Promise.resolve(),
      dataChannel: null,
    };
    this.peers.set(remoteId, peer);

    const attachDataChannel = (channel: RTCDataChannel): void => {
      peer.dataChannel?.close();
      peer.dataChannel = channel;
      channel.onmessage = (event) => {
        if (typeof event.data !== 'string' || event.data.length > 2048) return;
        try {
          this.handlers.onData(remoteId, JSON.parse(event.data) as unknown);
        } catch {
          // Ignore malformed peer data; Socket.IO remains the fallback.
        }
      };
    };
    connection.ondatachannel = (event) => attachDataChannel(event.channel);
    if (shouldOffer(this.localId, remoteId))
      attachDataChannel(connection.createDataChannel('social', { ordered: true }));

    if (this.localTrack) {
      connection.addTrack(this.localTrack, new MediaStream([this.localTrack]));
    }

    connection.ontrack = (event) => {
      const receiver = event.receiver as RTCRtpReceiver & {
        playoutDelayHint?: number;
        jitterBufferTarget?: number;
      };
      receiver.playoutDelayHint = 0;
      if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = 0;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      peer.stream = stream;
      peer.lastHeardAt = Date.now();
      this.handlers.onStream(remoteId, stream);
    };

    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSignal(this.socket, remoteId, { type: 'ice', candidate: event.candidate.toJSON() });
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      peer.lastHeardAt = Date.now();
      this.handlers.onState(remoteId, state);
      if (state === 'failed') {
        this.handlers.onError(remoteId, 'no-peer-support');
      }
    };

    if (shouldOffer(this.localId, remoteId)) {
      await this.makeOffer(remoteId, connection);
    }
  }

  /** Close the connection to a player. */
  disconnect(remoteId: string): void {
    const peer = this.peers.get(remoteId);
    if (!peer) return;
    this.peers.delete(remoteId);
    this.pendingCandidates.delete(remoteId);
    peer.connection.ontrack = null;
    peer.connection.onicecandidate = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.ondatachannel = null;
    peer.dataChannel?.close();
    peer.connection.close();
  }

  /** Close every connection. */
  dispose(): void {
    this.disposed = true;
    clearInterval(this.timer);
    if (this.socket) {
      this.socket.off('signal:offer', this.handleSignal);
      this.socket.off('signal:answer', this.handleSignal);
      this.socket.off('signal:ice', this.handleSignal);
    }
    for (const id of [...this.peers.keys()]) {
      this.disconnect(id);
    }
  }

  /**
   * The peers that have gone quiet for too long.
   *
   * A silent peer is usually a peer whose connection died without the browser
   * noticing, so the UI drops them from the voice list.
   */
  silentPeers(now = Date.now()): string[] {
    const silent: string[] = [];
    for (const peer of this.peers.values()) {
      if (peer.connection.connectionState === 'connected') continue;
      if (now - peer.lastHeardAt > PEER_SILENCE_TIMEOUT_MS) silent.push(peer.id);
    }
    return silent;
  }

  /** Send a compact event to every open peer channel. */
  broadcastData(payload: unknown): number {
    const encoded = JSON.stringify(payload);
    if (encoded.length > 2048) return 0;
    let delivered = 0;
    for (const peer of this.peers.values()) {
      if (peer.dataChannel?.readyState !== 'open') continue;
      peer.dataChannel.send(encoded);
      delivered += 1;
    }
    return delivered;
  }

  private async makeOffer(remoteId: string, connection: RTCPeerConnection): Promise<void> {
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      sendSignal(this.socket, remoteId, { type: 'offer', sdp: offer });
    } catch {
      this.handlers.onError(remoteId, 'unknown');
    }
  }

  private readonly handleSignal = (payload: unknown): void => {
    const message = parseSignal(payload);
    if (!message || message.from === this.localId || !this.allowed.has(message.from)) return;
    void this.connect(message.from)
      .then(() => {
        const peer = this.peers.get(message.from);
        if (!peer || this.disposed) return;
        peer.queue = peer.queue
          .then(() => this.applySignal(message))
          .catch(() => this.handlers.onError(message.from, 'unknown'));
      })
      .catch(() => this.handlers.onError(message.from, 'no-peer-support'));
  };

  private async applySignal(message: VoiceSignalMessage): Promise<void> {
    const remoteId = message.from;

    // An offer from a peer we have not met yet: create the connection.
    if (message.type === 'offer' && !this.peers.has(remoteId)) {
      await this.connect(remoteId);
    }
    const peer = this.peers.get(remoteId);
    if (!peer) return;

    const connection = peer.connection;
    try {
      if (message.type === 'offer') {
        await connection.setRemoteDescription(message.sdp);
        await this.drainCandidates(remoteId, connection);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        sendSignal(this.socket, remoteId, { type: 'answer', sdp: answer });
        return;
      }
      if (message.type === 'answer') {
        await connection.setRemoteDescription(message.sdp);
        await this.drainCandidates(remoteId, connection);
        return;
      }
      // ICE candidates can arrive before the remote description; they are
      // queued until there is a description to attach them to.
      if (!connection.remoteDescription) {
        const queue = this.pendingCandidates.get(remoteId) ?? [];
        queue.push(message.candidate);
        this.pendingCandidates.set(remoteId, queue);
        return;
      }
      await connection.addIceCandidate(message.candidate);
    } catch {
      this.handlers.onError(remoteId, 'unknown');
    }
  }

  private async drainCandidates(remoteId: string, connection: RTCPeerConnection): Promise<void> {
    const queue = this.pendingCandidates.get(remoteId);
    if (!queue) return;
    this.pendingCandidates.delete(remoteId);
    for (const candidate of queue) {
      try {
        await connection.addIceCandidate(candidate);
      } catch {
        // A stale candidate is not fatal; the connection may still work.
      }
    }
  }
}
