import { useCallback, useRef, useEffect } from 'react';
import { judgeSlam, shakeOffset, vibrate, SLAM_DURATION_MS } from '../../shared/slam';
import { playTileImpact } from '../audio/tileImpact';

export function useSlam() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const animation = useRef<Animation | null>(null);
  useEffect(() => () => animation.current?.cancel(), []);
  const slam = useCallback((velocity: number, isDouble: boolean, isWinning: boolean) => {
    const effect = judgeSlam({ velocity, isDouble, isWinning });
    void playTileImpact(effect.intensity);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || effect.kind === 'none') return;
    if (effect.vibrate) vibrate();
    animation.current?.cancel();
    const frames = Array.from({ length: 16 }, (_, i) => {
      const point = shakeOffset(effect, (i * SLAM_DURATION_MS) / 15);
      return { transform: `translate(${point.x}px, ${point.y}px)` };
    });
    animation.current = surfaceRef.current?.animate(frames, { duration: SLAM_DURATION_MS }) ?? null;
  }, []);
  const celebrate = useCallback(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    void import('canvas-confetti')
      .then(({ default: confetti }) => {
        void confetti({
          particleCount: 100,
          spread: 90,
          origin: { y: 0.65 },
          disableForReducedMotion: true,
        });
      })
      .catch(() => undefined);
  }, []);
  return { surfaceRef, slam, celebrate };
}
