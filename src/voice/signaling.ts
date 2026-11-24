/**
 * The client half of the WebRTC voice mesh.
 *
 * The server already relays `signal:offer`, `signal:answer` and `signal:ice`
 * between two players in a room, so the mesh only needs to decide who calls
 * whom and to keep the two peer connections in step.
 */
import type { Socket } from 'socket.io-client';
import type { VoiceSignal } from '../../shared/voice';

/** The messages the mesh exchanges over the signalling server. */
export type VoiceSignalMessage =
  | { readonly type: 'offer'; readonly from: string; readonly sdp: RTCSessionDescriptionInit }
  | { readonly type: 'answer'; readonly from: string; readonly sdp: RTCSessionDescriptionInit }
  | { readonly type: 'ice'; readonly from: string; readonly candidate: RTCIceCandidateInit };

/**
 * Which side of a peer connection we are.
 *
 * The player with the lower id makes the offer, so both sides never offer at
 * the same time.
 */
export function shouldOffer(localId: string, remoteId: string): boolean {
  return localId < remoteId;
}

/** The signalling event a message is sent on. */
export function signalEventFor(
  type: VoiceSignalMessage['type'],
): 'signal:offer' | 'signal:answer' | 'signal:ice' {
  switch (type) {
    case 'offer':
      return 'signal:offer';
    case 'answer':
      return 'signal:answer';
    case 'ice':
      return 'signal:ice';
  }
}

/** Parse an incoming signalling payload into a typed message. */
export function parseSignal(payload: unknown): VoiceSignalMessage | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as { from?: unknown; sdp?: unknown; candidate?: unknown };
  if (typeof body.from !== 'string') return null;
  if (body.sdp !== undefined && body.sdp !== null) {
    const sdp = body.sdp as RTCSessionDescriptionInit;
    if (typeof sdp.sdp !== 'string') return null;
    if (sdp.type === 'offer') return { type: 'offer', from: body.from, sdp };
    if (sdp.type === 'answer') return { type: 'answer', from: body.from, sdp };
    return null;
  }
  if (
    typeof body.candidate === 'object' &&
    body.candidate !== null &&
    typeof (body.candidate as RTCIceCandidateInit).candidate === 'string'
  ) {
    return {
      type: 'ice',
      from: body.from,
      candidate: body.candidate as RTCIceCandidateInit,
    };
  }
  return null;
}

/** The socket events the signalling channel listens on. */
export const SIGNAL_EVENTS = ['signal:offer', 'signal:answer', 'signal:ice'] as const;

/**
 * Send a signalling message to another player.
 *
 * The server addresses messages by player id, so the `from` field is added by
 * the server and is not sent by the client.
 */
export function sendSignal(
  socket: Socket | null,
  to: string,
  message: {
    type: 'offer' | 'answer' | 'ice';
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  },
): void {
  if (!socket) return;
  const event = signalEventFor(message.type);
  if (message.type === 'ice') {
    socket.emit(event, { to, candidate: message.candidate });
    return;
  }
  socket.emit(event, { to, sdp: message.sdp });
}

/** The shape of a signal as it travels over the wire. */
export type WireSignal = VoiceSignal;
