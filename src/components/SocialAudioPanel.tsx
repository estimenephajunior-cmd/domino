import { motion } from 'framer-motion';
import { Music2, SlidersHorizontal } from 'lucide-react';
import { AUDIO_CHANNELS, SOUND_EFFECTS } from '../../shared/social';
import type { SocialAudioController } from '../audio/useSocialAudio';

export function SocialAudioPanel({ audio }: { readonly audio: SocialAudioController }) {
  return (
    <details className="relative mr-20" data-testid="social-audio">
      <summary className="cursor-pointer rounded-lg bg-white/10 px-2.5 py-1.5 text-xs">
        <SlidersHorizontal size={14} className="mr-1 inline" /> Lounge audio
      </summary>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-full right-0 z-40 mb-2 w-72 rounded-xl border border-white/10 bg-[var(--theme-panel)] p-3 shadow-2xl"
      >
        <div className="mb-3 grid grid-cols-2 gap-2">
          {SOUND_EFFECTS.map((effect) => (
            <button
              key={effect.id}
              type="button"
              data-testid={`sound-${effect.id}`}
              onClick={() => audio.play(effect.id)}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              <span aria-hidden="true" className="mr-1">{effect.glyph}</span>
              {effect.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-testid="lofi-toggle"
          aria-pressed={audio.lofiEnabled}
          onClick={() => void audio.toggleLofi()}
          className="mb-3 w-full rounded-lg border border-[var(--theme-brass)]/50 px-3 py-2"
        >
          <Music2 size={14} className="mr-1 inline" />
          {audio.lofiEnabled ? 'Pause lofi' : 'Play procedural lofi'}
        </button>
        <label className="mb-2 block text-xs">
          <span>Master {Math.round(audio.master * 100)}%</span>
          <input
            aria-label="Master volume"
            className="block w-full"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={audio.master}
            onChange={(event) => audio.setMaster(Number(event.target.value))}
          />
        </label>
        {AUDIO_CHANNELS.map((channel) => (
          <label key={channel.id} className="mb-1 block text-xs">
            <span>{channel.label}</span>
            <input
              aria-label={`${channel.label} volume`}
              className="block w-full"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audio.levels[channel.id]}
              onChange={(event) => audio.setChannel(channel.id, Number(event.target.value))}
            />
          </label>
        ))}
        {audio.notice && <p role="status" className="mt-2 text-xs text-[var(--theme-muted)]">{audio.notice}</p>}
      </motion.div>
    </details>
  );
}
