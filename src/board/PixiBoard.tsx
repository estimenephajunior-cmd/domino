import { useEffect, useRef } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { layoutChain, type BoardSlot, type LayoutOptions } from '../../shared/board';
import { easeCamera, type CameraState } from '../../shared/camera';
import { allBoardTiles } from '../../shared/graph';
import { judgeSlam } from '../../shared/slam';
import type { Chain } from '../../shared/types';
import { RecoilWorld } from './RecoilWorld';

export interface PixiBoardProps {
  readonly chain: Chain;
  readonly camera: CameraState;
  readonly layout: LayoutOptions;
  readonly impact?: { tileId: string; velocity: number; winning: boolean } | null;
  readonly onReady?: () => void;
  readonly onError?: () => void;
}

export function PixiBoard(props: PixiBoardProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const wake = useRef<() => void>(() => {});
  useEffect(() => {
    latest.current = props;
    wake.current();
  }, [props]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let initialized = false;
    const app = new Application();
    const world = new Container();
    const physics = new RecoilWorld();
    const tiles = new Map<string, Container>();
    let slots: BoardSlot[] = [];
    let previousChain: Chain | null = null;
    let previousLayout: LayoutOptions | null = null;
    let previousImpact: PixiBoardProps['impact'] = null;
    let camera = latest.current.camera;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const draw = () => {
      const current = latest.current;
      if (current.chain !== previousChain || current.layout !== previousLayout) {
        slots = layoutChain(current.chain, current.layout);
        const seen = new Set(slots.map((slot) => slot.tile.id));
        for (const [id, tile] of tiles) {
          if (seen.has(id)) continue;
          tile.destroy({ children: true });
          tiles.delete(id);
        }
        for (const slot of slots) {
          let tile = tiles.get(slot.tile.id);
          if (!tile) {
            tile = createTile(slot);
            tiles.set(slot.tile.id, tile);
            world.addChild(tile);
          }
          tile.rotation = ((slot.rotation ?? 0) * Math.PI) / 180;
        }
        physics.sync(
          allBoardTiles(current.chain),
          new Map(slots.map((slot) => [slot.tile.id, slot])),
        );
        previousChain = current.chain;
        previousLayout = current.layout;
      }
      if (current.impact && current.impact !== previousImpact) {
        const target = slots.find((slot) => slot.tile.id === current.impact?.tileId);
        if (target && !reduced.matches)
          physics.slam(
            judgeSlam({
              velocity: current.impact.velocity,
              isDouble: target.tile.low === target.tile.high,
              isWinning: current.impact.winning,
            }),
            target,
          );
        previousImpact = current.impact;
      }
      physics.step(Math.min(app.ticker.deltaMS, 1000 / 60));
      for (const [id, tile] of tiles) {
        const point = physics.positionOf(id);
        tile.position.set(point.x, point.y);
      }
      camera = reduced.matches ? current.camera : easeCamera(camera, current.camera, 0.2);
      world.position.set(
        app.screen.width / 2 - camera.x * camera.zoom,
        app.screen.height / 2 - camera.y * camera.zoom,
      );
      world.scale.set(camera.zoom);
      const settled =
        Math.abs(camera.x - current.camera.x) < 0.01 &&
        Math.abs(camera.y - current.camera.y) < 0.01 &&
        Math.abs(camera.zoom - current.camera.zoom) < 0.0001;
      if (settled && !physics.isRunning) {
        app.render();
        app.stop();
      }
    };
    void app
      .init({
        backgroundAlpha: 0,
        antialias: true,
        resizeTo: host,
        autoDensity: true,
        resolution: Math.min(devicePixelRatio, 2),
        preference: 'webgl',
        autoStart: false,
      })
      .then(() => {
        initialized = true;
        if (cancelled) {
          app.destroy(true, { children: true });
          return;
        }
        app.stage.addChild(world);
        host.appendChild(app.canvas);
        app.ticker.add(draw);
        wake.current = () => app.start();
        app.start();
        latest.current.onReady?.();
      })
      .catch(() => {
        if (!cancelled) latest.current.onError?.();
      });
    return () => {
      cancelled = true;
      wake.current = () => {};
      physics.clear();
      if (initialized) {
        app.ticker.remove(draw);
        app.destroy(true, { children: true });
      }
    };
  }, []);
  return (
    <div
      ref={hostRef}
      data-testid="pixi-board"
      className="pointer-events-none absolute inset-0"
      aria-hidden
    />
  );
}

function createTile(slot: BoardSlot): Container {
  const container = new Container();
  const body = new Graphics()
    .roundRect(-46, -22, 92, 44, 6)
    .fill(0x171310)
    .stroke({ width: 1.5, color: 0xd4af37, alpha: 0.7 });
  container.addChild(body);
  for (const [index, value] of [slot.tile.left, slot.tile.right].entries()) {
    const x = index === 0 ? -23 : 23;
    const plate = new Graphics().roundRect(x - 18, -18, 36, 36, 3).fill(0xf7f3e8);
    const cells =
      value >= 8
        ? [0, 1, 2, 3, 5, 6, 7, 8, ...(value === 9 ? [4] : [])]
        : value >= 6
          ? [0, 2, 3, 5, 6, 8, ...(value === 7 ? [4] : [])]
          : value >= 4
            ? [0, 2, 6, 8, ...(value === 5 ? [4] : [])]
            : value === 3
              ? [0, 4, 8]
              : value === 2
                ? [0, 8]
                : value === 1
                  ? [4]
                  : [];
    for (const cell of cells)
      plate.circle(x + ((cell % 3) - 1) * 10, (Math.floor(cell / 3) - 1) * 10, 2.5).fill(0x0b0b0b);
    container.addChild(plate);
  }
  return container;
}
