/**
 * The volume mixer: one Web Audio graph with a bus per channel.
 *
 * Everything audible routes through a channel bus (effects, music, voice,
 * ambience), and every bus runs through the master gain. Sliders therefore
 * only ever change gain nodes, never the sources themselves.
 */
import {
  clampLevel,
  effectiveLevel,
  type AudioChannelId,
  type MixLevels,
} from '../../shared/social';

/** One channel's gain node. */
export interface MixerChannel {
  readonly id: AudioChannelId;
  /** The input a source connects to. */
  readonly input: GainNode;
  /** The channel's own level, before the master gain. */
  level: number;
  /** True when the channel is muted. */
  muted: boolean;
}

export interface Mixer {
  readonly context: AudioContext;
  /** The master gain, before the destination. */
  readonly master: GainNode;
  /** Look a channel up by id. */
  channel(id: AudioChannelId): MixerChannel;
  /** Set the master level. */
  setMaster(level: number): void;
  /** Set a channel's level. */
  setChannel(id: AudioChannelId, level: number): void;
  /** Mute or unmute a channel. */
  setChannelMuted(id: AudioChannelId, muted: boolean): void;
  /** The current levels. */
  levels(): MixLevels;
  /** The master level. */
  masterLevel(): number;
  /** Apply a whole set of levels at once. */
  apply(levels: MixLevels, master: number): void;
  /** Tear the graph down. */
  dispose(): void;
}

/**
 * Build the mixer graph.
 *
 * The graph is created suspended: browsers only allow audio to start after a
 * user gesture, so `resume` is called from the first interaction.
 */
export function createMixer(context: AudioContext): Mixer {
  const master = context.createGain();
  master.gain.value = 1;
  master.connect(context.destination);

  const channels = new Map<AudioChannelId, MixerChannel>();
  for (const id of ['effects', 'music', 'voice', 'ambience'] as const) {
    const input = context.createGain();
    input.gain.value = 1;
    input.connect(master);
    channels.set(id, { id, input, level: 1, muted: false });
  }

  const applyChannel = (channel: MixerChannel, masterLevel: number): void => {
    const target = channel.muted ? 0 : effectiveLevel(masterLevel, channel.level);
    channel.input.gain.setTargetAtTime(target, context.currentTime, 0.02);
  };

  let masterValue = 1;
  const mixer: Mixer = {
    context,
    master,
    channel: (id) => {
      const channel = channels.get(id);
      if (!channel) throw new Error(`Unknown audio channel: ${id}`);
      return channel;
    },
    setMaster: (level) => {
      masterValue = clampLevel(level);
      for (const channel of channels.values()) applyChannel(channel, masterValue);
    },
    setChannel: (id, level) => {
      const channel = mixer.channel(id);
      channel.level = clampLevel(level);
      applyChannel(channel, masterValue);
    },
    setChannelMuted: (id, muted) => {
      const channel = mixer.channel(id);
      channel.muted = muted;
      applyChannel(channel, masterValue);
    },
    levels: () => ({
      effects: channels.get('effects')!.level,
      music: channels.get('music')!.level,
      voice: channels.get('voice')!.level,
      ambience: channels.get('ambience')!.level,
    }),
    masterLevel: () => masterValue,
    apply: (levels, master) => {
      masterValue = clampLevel(master);
      for (const [id, channel] of channels) {
        channel.level = clampLevel(levels[id] ?? channel.level);
        applyChannel(channel, masterValue);
      }
    },
    dispose: () => {
      for (const channel of channels.values()) {
        try {
          channel.input.disconnect();
        } catch {
          // Already disconnected; nothing to undo.
        }
      }
      try {
        master.disconnect();
      } catch {
        // Already disconnected; nothing to undo.
      }
      channels.clear();
    },
  };
  return mixer;
}
