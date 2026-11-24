import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_MIX_LEVELS,
  SoundboardLimiter,
  clampLevel,
  parseSoundboardEvent,
  type AudioChannelId,
  type MixLevels,
  type SoundEffectId,
  type SoundboardEvent,
} from '../../shared/social';
import { useTableStore } from '../state/tableStore';
import type { VoiceController } from '../voice/useVoice';
import { createLofiPlayer, type LofiPlayer } from './lofiGenerator';
import { playSoundboardEffect } from './soundboard';

const STORAGE_KEY = 'domino-social-audio';

interface AudioPreferences {
  readonly master: number;
  readonly levels: MixLevels;
}

function readPreferences(): AudioPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<AudioPreferences>;
    return {
      master: clampLevel(value.master ?? 1),
      levels: {
        effects: clampLevel(value.levels?.effects ?? DEFAULT_MIX_LEVELS.effects),
        music: clampLevel(value.levels?.music ?? DEFAULT_MIX_LEVELS.music),
        voice: clampLevel(value.levels?.voice ?? DEFAULT_MIX_LEVELS.voice),
        ambience: clampLevel(value.levels?.ambience ?? DEFAULT_MIX_LEVELS.ambience),
      },
    };
  } catch {
    return { master: 1, levels: DEFAULT_MIX_LEVELS };
  }
}

export function useSocialAudio(voice: VoiceController) {
  const socket = useTableStore((state) => state.socket);
  const playerId = useTableStore((state) => state.playerId) ?? '';
  const name = useTableStore((state) => state.identity.name);
  const [preferences, setPreferences] = useState(readPreferences);
  const [lofiEnabled, setLofiEnabled] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const lofi = useRef<LofiPlayer | null>(null);
  const localLimiter = useRef(new SoundboardLimiter());
  const localLastAt = useRef<number | null>(null);
  const remoteLimiters = useRef(new Map<string, { limiter: SoundboardLimiter; lastAt: number | null }>());
  const seen = useRef(new Map<string, number>());

  const effectsVolume = preferences.master * preferences.levels.effects;
  const musicVolume = preferences.master * preferences.levels.music;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    voice.setGlobalVoiceVolume(preferences.master * preferences.levels.voice);
    lofi.current?.setVolume(musicVolume);
  }, [preferences, musicVolume, voice]);

  const receive = useCallback(
    (payload: unknown) => {
      const event = parseSoundboardEvent(payload);
      if (!event || event.playerId === playerId) return;
      const now = Date.now();
      for (const [id, at] of seen.current) if (now - at > 15_000) seen.current.delete(id);
      if (seen.current.has(event.id)) return;
      seen.current.set(event.id, now);
      const remote = remoteLimiters.current.get(event.playerId) ?? {
        limiter: new SoundboardLimiter(undefined, now),
        lastAt: null,
      };
      remoteLimiters.current.set(event.playerId, remote);
      const decision = remote.limiter.consume(remote.lastAt, now);
      if (!decision.allowed) return;
      remote.lastAt = now;
      playSoundboardEffect(event.effect, effectsVolume);
      setNotice(`${event.name} played ${event.effect}.`);
    },
    [effectsVolume, playerId],
  );

  useEffect(() => {
    if (!socket) return;
    socket.on('social:sound', receive);
    const rejected = () => setNotice('Soundboard cooling down.');
    socket.on('social:sound-rejected', rejected);
    const removePeerListener = voice.onSocialData(receive);
    return () => {
      socket.off('social:sound', receive);
      socket.off('social:sound-rejected', rejected);
      removePeerListener();
    };
  }, [receive, socket, voice]);

  const play = (effect: SoundEffectId): void => {
    const now = Date.now();
    const decision = localLimiter.current.consume(localLastAt.current, now);
    if (!decision.allowed) {
      setNotice('Soundboard cooling down.');
      return;
    }
    localLastAt.current = now;
    const event: SoundboardEvent = {
      id: crypto.randomUUID(),
      effect,
      playerId,
      name,
      at: now,
    };
    playSoundboardEffect(effect, effectsVolume);
    voice.sendSocialData(event);
    socket?.emit('social:sound', { id: event.id, effect, at: now });
    setNotice(`${decision.remaining} sound${decision.remaining === 1 ? '' : 's'} ready.`);
  };

  const setMaster = (master: number): void =>
    setPreferences((current) => ({ ...current, master: clampLevel(master) }));
  const setChannel = (id: AudioChannelId, level: number): void =>
    setPreferences((current) => ({
      ...current,
      levels: { ...current.levels, [id]: clampLevel(level) },
    }));
  const toggleLofi = async (): Promise<void> => {
    if (lofiEnabled) {
      lofi.current?.stop();
      setLofiEnabled(false);
      return;
    }
    const player = lofi.current ?? (await createLofiPlayer(musicVolume));
    lofi.current = player;
    await player.start();
    setLofiEnabled(true);
  };
  useEffect(
    () => () => {
      lofi.current?.dispose();
    },
    [],
  );

  return {
    ...preferences,
    lofiEnabled,
    notice,
    play,
    setMaster,
    setChannel,
    toggleLofi,
  };
}

export type SocialAudioController = ReturnType<typeof useSocialAudio>;
