import { useCallback, useEffect, useRef, useState } from 'react';
import { relativePositions } from '../../shared/seats';
import {
  readVoiceFeatures,
  shouldTransmit,
  voiceSupport,
  type PeerVoiceState,
  type VoiceMode,
} from '../../shared/voice';
import { useTableStore } from '../state/tableStore';
import { createAudioPipeline, requestMicrophone, type AudioPipeline } from './audioPipeline';
import { createEnergyDetector, createSpeechDetector, type SpeechDetector } from './speechDetector';
import { connectRemoteStream } from './spatialAudio';
import { VoiceMesh } from './voiceMesh';
import type { NoiseSuppression } from './noiseSuppression';

type RemoteAudio = ReturnType<typeof connectRemoteStream>;
interface Resources {
  pipeline: AudioPipeline;
  stream: MediaStream;
  mesh: VoiceMesh;
  detector: SpeechDetector;
  noise: NoiseSuppression | null;
  remotes: Map<string, RemoteAudio>;
}
export function useVoice() {
  const socket = useTableStore((s) => s.socket);
  const connected = useTableStore((s) => s.connected);
  const room = useTableStore((s) => s.room);
  const playerId = useTableStore((s) => s.playerId) ?? '';
  const support = voiceSupport(readVoiceFeatures());
  const [status, setStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mode, setModeState] = useState<VoiceMode>('vad');
  const [muted, setMutedState] = useState(false);
  const [talking, setTalkingState] = useState(false);
  const [speech, setSpeech] = useState(false);
  const [noise, setNoise] = useState<'off' | 'loading' | 'active' | 'fallback'>('off');
  const [detectorKind, setDetectorKind] = useState('energy');
  const [peers, setPeers] = useState<Record<string, Partial<PeerVoiceState>>>({});
  const resources = useRef<Resources | null>(null);
  const generation = useRef(0);
  const noiseGeneration = useRef(0);
  const settings = useRef({
    mode: 'vad' as VoiceMode,
    muted: false,
    talking: false,
    detectedSpeech: false,
  });
  const preferences = useRef<Record<string, { volume: number; muted: boolean }>>({});
  const globalVoiceVolume = useRef(1);
  const socialListeners = useRef(new Set<(payload: unknown) => void>());
  const patchPeer = useCallback((id: string, patch: Partial<PeerVoiceState>) => {
    setPeers((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }, []);
  const speaker = useCallback((id: string) => {
    const current = useTableStore.getState();
    const positions = relativePositions(current.room?.seats ?? [], current.playerId ?? '');
    return {
      id,
      position: positions.get(id) ?? 'top',
      volume: (preferences.current[id]?.volume ?? 1) * globalVoiceVolume.current,
      muted: preferences.current[id]?.muted ?? false,
    } as const;
  }, []);
  const release = useCallback(() => {
    generation.current++;
    noiseGeneration.current++;
    socket?.emit('voice:state', { enabled: false });
    const active = resources.current;
    resources.current = null;
    if (!active) return;
    active.mesh.dispose();
    for (const remote of active.remotes.values()) remote.dispose();
    void active.detector.stop();
    active.noise?.dispose();
    active.pipeline.dispose();
    active.stream.getTracks().forEach((track) => track.stop());
  }, [socket]);
  useEffect(() => release, [release]);
  const disable = useCallback(() => {
    release();
    setStatus('idle');
    setSpeech(false);
    setTalkingState(false);
    setPeers({});
    setNoise('off');
    settings.current.talking = false;
    settings.current.detectedSpeech = false;
  }, [release]);
  const enable = async () => {
    if (!support.supported || !socket || !connected || status === 'starting' || resources.current)
      return;
    const run = ++generation.current;
    setStatus('starting');
    setError(null);
    const result = await requestMicrophone();
    if (run !== generation.current) {
      result.stream?.getTracks().forEach((track) => track.stop());
      return;
    }
    if (!result.stream) {
      setStatus('error');
      setError(
        result.error === 'permission-denied'
          ? 'Microphone access denied. Text chat and gameplay remain available.'
          : 'Microphone unavailable. Text chat and gameplay remain available.',
      );
      return;
    }
    let pipeline: AudioPipeline | null = null;
    try {
      const stream = result.stream;
      pipeline = createAudioPipeline(stream, settings.current);
      await pipeline.context.resume();
      if (run !== generation.current) {
        pipeline.dispose();
        return;
      }
      const remotes = new Map<string, RemoteAudio>();
      const activity = (detectedSpeech: boolean) => {
        if (run !== generation.current) return;
        settings.current.detectedSpeech = detectedSpeech;
        setSpeech(detectedSpeech);
        resources.current?.pipeline.update({ detectedSpeech });
      };
      const detector = createEnergyDetector(pipeline.context, stream, activity);
      await detector.start();
      if (run !== generation.current) {
        await detector.stop();
        pipeline.dispose();
        return;
      }
      const mesh = new VoiceMesh({
        localId: playerId,
        socket,
        localTrack: pipeline.track,
        handlers: {
          onState: (id, connection) =>
            patchPeer(id, { connection, error: connection === 'connected' ? null : undefined }),
          onError: (id, reason) => patchPeer(id, { error: reason, connection: 'failed' }),
          onSilence: (id) => patchPeer(id, { connection: 'failed' }),
          onData: (_id, payload) => {
            for (const listener of socialListeners.current) listener(payload);
          },
          onStream: (id, remoteStream) => {
            remotes.get(id)?.dispose();
            remotes.set(
              id,
              connectRemoteStream(pipeline!.context, remoteStream, speaker(id), (speaking) =>
                patchPeer(id, { speaking }),
              ),
            );
          },
        },
      });
      const active: Resources = { pipeline, stream, mesh, detector, noise: null, remotes };
      resources.current = active;
      for (const track of stream.getAudioTracks())
        track.addEventListener(
          'ended',
          () => {
            if (resources.current !== active) return;
            release();
            setStatus('error');
            setError('The microphone stopped. Text chat and gameplay remain available.');
          },
          { once: true },
        );
      setStatus('ready');
      socket.emit('voice:state', { enabled: true });
      void createSpeechDetector({ context: pipeline.context, stream, onChange: activity })
        .then(async (neural) => {
          if (resources.current !== active) {
            await neural.stop();
            return;
          }
          await active.detector.stop();
          active.detector = neural;
          try {
            await neural.start();
          } catch {
            await neural.stop();
            if (resources.current !== active) return;
            const fallback = createEnergyDetector(active.pipeline.context, active.stream, activity);
            active.detector = fallback;
            await fallback.start();
            setDetectorKind('energy');
            return;
          }
          if (resources.current !== active) {
            await neural.stop();
            return;
          }
          setDetectorKind(neural.kind ?? 'energy');
        })
        .catch(() => {
          if (resources.current === active) setDetectorKind('energy');
        });
    } catch {
      pipeline?.dispose();
      result.stream.getTracks().forEach((track) => track.stop());
      if (run === generation.current) {
        setStatus('error');
        setError('Voice could not start. Text chat and gameplay remain available.');
      }
    }
  };
  useEffect(() => {
    const active = resources.current;
    if (!active) return;
    const ids =
      connected && room?.seats.some((seat) => seat.id === playerId && seat.voiceEnabled)
        ? (room?.seats ?? [])
            .filter((seat) => seat.voiceEnabled && seat.connected && seat.id !== playerId)
            .map((seat) => seat.id)
        : [];
    active.mesh.sync(ids);
    for (const [id, remote] of active.remotes) {
      if (!ids.includes(id)) {
        remote.dispose();
        active.remotes.delete(id);
        patchPeer(id, { connection: 'closed', speaking: false });
      } else remote.update(speaker(id));
    }
  }, [room, connected, playerId, status, patchPeer, speaker]);
  useEffect(() => {
    if (!socket) return;
    const rejoin = () => {
      const active = resources.current;
      if (!active) return;
      active.mesh.sync([]);
      socket.emit('voice:state', { enabled: true });
      active.pipeline.update(settings.current);
    };
    const disconnected = () => resources.current?.pipeline.update({ muted: true });
    socket.on('room:rejoined', rejoin);
    socket.on('disconnect', disconnected);
    return () => {
      socket.off('room:rejoined', rejoin);
      socket.off('disconnect', disconnected);
    };
  }, [socket]);
  const setMode = (next: VoiceMode) => {
    settings.current.mode = next;
    settings.current.talking = false;
    setTalkingState(false);
    setModeState(next);
    resources.current?.pipeline.update({ mode: next, talking: false });
  };
  const setMuted = (next: boolean) => {
    settings.current.muted = next;
    setMutedState(next);
    resources.current?.pipeline.update({ muted: next });
  };
  const setTalking = useCallback((next: boolean) => {
    settings.current.talking = next;
    setTalkingState(next);
    resources.current?.pipeline.update({ talking: next });
  }, []);
  useEffect(() => {
    if (status !== 'ready' || mode !== 'ptt') return;
    const pttSettings = settings.current;
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.altKey || event.metaKey)
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, button, [contenteditable="true"], [role="dialog"]',
        )
      )
        return;
      event.preventDefault();
      setTalking(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setTalking(false);
      }
    };
    const stop = () => setTalking(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', stop);
      pttSettings.talking = false;
      resources.current?.pipeline.update({ talking: false });
    };
  }, [status, mode, setTalking]);
  const setPeer = (id: string, next: { volume?: number; muted?: boolean }) => {
    preferences.current[id] = { volume: 1, muted: false, ...preferences.current[id], ...next };
    patchPeer(id, preferences.current[id]);
    resources.current?.remotes.get(id)?.update(speaker(id));
  };
  const setGlobalVoiceVolume = (volume: number) => {
    globalVoiceVolume.current = Math.min(1, Math.max(0, volume));
    for (const [id, remote] of resources.current?.remotes ?? []) remote.update(speaker(id));
  };
  const toggleNoise = async () => {
    const active = resources.current;
    if (!active) return;
    const request = ++noiseGeneration.current;
    if (noise !== 'off' && noise !== 'fallback') {
      active.pipeline.setInput(active.stream);
      active.noise?.dispose();
      active.noise = null;
      setNoise('off');
      return;
    }
    setNoise('loading');
    try {
      const { enableNoiseSuppression } = await import('./noiseSuppression');
      const filter = await enableNoiseSuppression(active.pipeline.context, active.stream);
      if (request !== noiseGeneration.current || resources.current !== active) {
        filter.dispose();
        return;
      }
      active.noise = filter;
      active.pipeline.setInput(filter.stream);
      setNoise(filter.active ? 'active' : 'fallback');
    } catch {
      if (request === noiseGeneration.current && resources.current === active) setNoise('fallback');
    }
  };
  return {
    status,
    error,
    supported: support.supported,
    unsupportedReason: support.reason,
    mode,
    muted,
    talking,
    speech,
    noise,
    detectorKind,
    peers,
    enable,
    disable,
    setMode,
    setMuted,
    setTalking,
    setPeer,
    setGlobalVoiceVolume,
    sendSocialData: (payload: unknown) => resources.current?.mesh.broadcastData(payload) ?? 0,
    onSocialData: (listener: (payload: unknown) => void) => {
      socialListeners.current.add(listener);
      return () => socialListeners.current.delete(listener);
    },
    toggleNoise,
    retry: () => {
      resources.current?.mesh.sync([]);
      socket?.emit('voice:state', { enabled: false }, () => {
        if (resources.current) socket.emit('voice:state', { enabled: true });
      });
    },
    transmitting:
      status === 'ready' &&
      connected &&
      shouldTransmit({ mode, muted, talking, detectedSpeech: speech }),
  };
}
export type VoiceController = ReturnType<typeof useVoice>;
