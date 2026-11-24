import { useCallback, useMemo, useState } from 'react';
import { cameraTarget, clamp, type CameraState, type Viewport } from '../../shared/camera';
import { tilesPerRowForWidth, type LayoutOptions } from '../../shared/board';
import { allBoardTiles } from '../../shared/graph';
import type { Chain } from '../../shared/types';

/** React changes targets only on input or a board update; Pixi eases them on its ticker. */
export function useCamera(
  chain: Chain,
  viewport: Viewport,
  viewportRef: React.RefObject<HTMLDivElement | null>,
  focusTileId?: string,
) {
  const layout: LayoutOptions = useMemo(
    () => ({ tilesPerRow: tilesPerRowForWidth(viewport.width) }),
    [viewport.width],
  );
  const target = useMemo(
    () => cameraTarget(chain, viewport, layout, focusTileId),
    [chain, viewport, layout, focusTileId],
  );
  const key = `${viewport.width}:${viewport.height}:${allBoardTiles(chain)
    .map((tile) => tile.id)
    .join(',')}`;
  const [manual, setManual] = useState<{ key: string; camera: CameraState } | null>(null);
  const camera = manual?.key === key ? manual.camera : target;
  const pan = useCallback(
    (dx: number, dy: number) => {
      setManual((previous) => {
        const current = previous?.key === key ? previous.camera : camera;
        return {
          key,
          camera: {
            ...current,
            x: clamp(current.x - dx / current.zoom, -1500, 1500),
            y: clamp(current.y - dy / current.zoom, -1500, 1500),
          },
        };
      });
    },
    [key, camera],
  );
  const zoomAt = useCallback(
    (delta: number, clientX: number, clientY: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      const zoom = clamp(camera.zoom * Math.exp(delta), 0.2, 3);
      const x = clientX - (rect?.left ?? 0) - viewport.width / 2;
      const y = clientY - (rect?.top ?? 0) - viewport.height / 2;
      setManual({
        key,
        camera: {
          x: camera.x + x / camera.zoom - x / zoom,
          y: camera.y + y / camera.zoom - y / zoom,
          zoom,
        },
      });
    },
    [camera, key, viewport, viewportRef],
  );
  return {
    camera,
    layout,
    pan,
    zoomAt,
    reset: () => setManual(null),
    panning: manual?.key === key,
  };
}
