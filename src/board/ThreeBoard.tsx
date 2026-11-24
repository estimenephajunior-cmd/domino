import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { layoutChain, type LayoutOptions } from '../../shared/board';
import type { Chain, Phase, PublicDealSlot } from '../../shared/types';

interface ThreeBoardProps {
  readonly chain: Chain;
  readonly layout?: LayoutOptions;
  readonly phase: Phase;
  readonly dealSlots: readonly PublicDealSlot[];
  readonly mixingEndsAt: number | null;
  readonly canPick: boolean;
  readonly cameraAction?: { readonly id: number; readonly type: 'fit' | 'zoom-in' | 'zoom-out' };
  readonly feltColor: string;
  onPick(slotId: string): void;
  onReady?(): void;
  onError?(): void;
}

const PIPS: Readonly<Record<number, readonly [number, number][]>> = {
  0: [],
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
  7: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [0, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
  8: [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ],
  9: [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [0, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ],
};

function pip(group: THREE.Group, x: number, z: number, material: THREE.Material): void {
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.018, 12), material);
  dot.position.set(x, 0.14, z);
  dot.castShadow = true;
  group.add(dot);
}

function domino(
  low: number,
  high: number,
  ivory: THREE.Material,
  dark: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.92, 0.22, 0.92, 3, 0.07), ivory);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const divider = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.014, 0.72), dark);
  divider.position.y = 0.125;
  group.add(divider);
  for (const [side, value] of [
    [-0.49, low],
    [0.49, high],
  ] as const) {
    for (const [column, row] of PIPS[value] ?? [])
      pip(group, side + column * 0.17, row * 0.2, dark);
  }
  return group;
}

function tileBack(
  id: string,
  ivory: THREE.Material,
  back: THREE.Material,
  brass: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.92, 0.22, 0.92, 3, 0.07), ivory);
  const inset = new THREE.Mesh(new RoundedBoxGeometry(1.74, 0.03, 0.74, 2, 0.045), back);
  inset.position.y = 0.126;
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), brass);
  pin.position.y = 0.18;
  body.castShadow = inset.castShadow = true;
  group.add(body, inset, pin);
  group.userData.slotId = id;
  group.traverse((child) => (child.userData.slotId = id));
  return group;
}

function scatter(index: number, time: number): [number, number, number] {
  const angle = index * 2.399963 + time * (index % 2 ? 1 : -1);
  const radius = 1.2 + ((index * 37) % 100) / 18;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.58, angle * 0.7];
}

export function ThreeBoard(props: ThreeBoardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef(props);
  const wake = useRef<() => void>(() => {});
  useEffect(() => {
    latest.current = props;
    wake.current();
  }, [props]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      latest.current.onError?.();
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.dataset.testid = 'three-board-canvas';
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07150f);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 11.5, 10.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 7;
    controls.maxDistance = 60;
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    controls.touches.ONE = THREE.TOUCH.PAN;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

    scene.add(new THREE.HemisphereLight(0xffe2b8, 0x062018, 1.25));
    const overhead = new THREE.DirectionalLight(0xffd19a, 3.2);
    overhead.position.set(-3, 10, 4);
    overhead.castShadow = true;
    overhead.shadow.mapSize.set(1024, 1024);
    scene.add(overhead);
    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 26),
      new THREE.MeshStandardMaterial({ color: 0x0c4b32, roughness: 0.96, metalness: 0 }),
    );
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = -0.14;
    felt.receiveShadow = true;
    scene.add(felt);

    const ivory = new THREE.MeshStandardMaterial({ color: 0xf4eedf, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x11100e, roughness: 0.68 });
    const back = new THREE.MeshStandardMaterial({ color: 0x171b19, roughness: 0.86 });
    const brass = new THREE.MeshStandardMaterial({
      color: 0xb69345,
      metalness: 0.55,
      roughness: 0.35,
    });
    const tiles = new THREE.Group();
    scene.add(tiles);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let signature = '';
    let cameraActionId = -1;
    const cameraDirection = new THREE.Vector3(0, 11.5, 10.5).normalize();

    const disposeTileGeometry = () => {
      tiles.traverse((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      tiles.clear();
    };

    const fitTiles = () => {
      if (tiles.children.length === 0) {
        controls.target.set(0, 0, 0);
        camera.position.copy(cameraDirection).multiplyScalar(15.5);
        controls.update();
        return;
      }
      tiles.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(tiles);
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const limitingHalfFov = Math.max(0.08, Math.min(verticalFov, horizontalFov) / 2);
      // A little breathing room keeps ivory edges, shadows, and end targets
      // away from the phone bezel while still keeping pips readable.
      const distance = THREE.MathUtils.clamp(
        (sphere.radius / Math.sin(limitingHalfFov)) * 1.12,
        controls.minDistance,
        controls.maxDistance,
      );
      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).add(cameraDirection.clone().multiplyScalar(distance));
      controls.update();
    };

    const applyCameraAction = () => {
      const action = latest.current.cameraAction;
      if (!action || action.id === cameraActionId) return;
      cameraActionId = action.id;
      if (action.type === 'fit') {
        fitTiles();
      } else {
        const factor = action.type === 'zoom-in' ? 0.82 : 1.22;
        const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor);
        const distance = THREE.MathUtils.clamp(offset.length(), controls.minDistance, controls.maxDistance);
        camera.position.copy(controls.target).add(offset.setLength(distance));
      }
      controls.update();
    };

    const rebuild = () => {
      const current = latest.current;
      const nextSignature = JSON.stringify({
        chain: current.chain,
        slots: current.dealSlots,
        phase: current.phase,
        layout: current.layout,
        feltColor: current.feltColor,
      });
      if (signature === nextSignature) return;
      signature = nextSignature;
      (felt.material as THREE.MeshStandardMaterial).color.set(current.feltColor);
      scene.background = new THREE.Color(current.feltColor).multiplyScalar(0.28);
      back.color.set(current.feltColor).multiplyScalar(0.48);
      disposeTileGeometry();
      if (current.phase === 'mixing' || current.phase === 'picking') {
        current.dealSlots.forEach((slot, index) => {
          if (slot.claimed) return;
          const mesh = tileBack(slot.id, ivory, back, brass);
          const [x, z, rotation] = scatter(index, 0);
          mesh.position.set(x, 0, z);
          mesh.rotation.y = rotation;
          tiles.add(mesh);
        });
      } else {
        for (const slot of layoutChain(current.chain, current.layout)) {
          const mesh = domino(slot.tile.left, slot.tile.right, ivory, dark);
          mesh.position.set(slot.x / 48, 0, slot.y / 48);
          mesh.rotation.y = -((slot.rotation ?? 0) * Math.PI) / 180;
          tiles.add(mesh);
        }
      }
      fitTiles();
    };
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const pick = (event: PointerEvent) => {
      const current = latest.current;
      if (!current.canPick) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const id = raycaster.intersectObjects(tiles.children, true)[0]?.object.userData.slotId;
      if (typeof id === 'string') current.onPick(id);
    };
    renderer.domElement.addEventListener('click', pick);

    const animate = (now: number) => {
      rebuild();
      applyCameraAction();
      const current = latest.current;
      if (
        !reduced.matches &&
        current.phase === 'mixing' &&
        current.mixingEndsAt !== null &&
        Date.now() < current.mixingEndsAt
      ) {
        tiles.children.forEach((mesh, index) => {
          const [x, z, rotation] = scatter(index, now / 650);
          mesh.position.x += (x - mesh.position.x) * 0.18;
          mesh.position.z += (z - mesh.position.z) * 0.18;
          mesh.rotation.y = rotation;
        });
      }
      const moving = controls.update();
      renderer.render(scene, camera);
      const mixing =
        current.phase === 'mixing' &&
        current.mixingEndsAt !== null &&
        Date.now() < current.mixingEndsAt;
      frame = mixing || moving ? requestAnimationFrame(animate) : 0;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(animate);
    };
    wake.current = schedule;
    controls.addEventListener('change', schedule);
    schedule();
    latest.current.onReady?.();
    return () => {
      cancelAnimationFrame(frame);
      wake.current = () => {};
      observer.disconnect();
      renderer.domElement.removeEventListener('click', pick);
      controls.dispose();
      disposeTileGeometry();
      renderer.dispose();
      for (const material of [ivory, dark, back, brass]) material.dispose();
      host.replaceChildren();
    };
  }, []);

  return (
    <div ref={hostRef} data-testid="three-board" className="pointer-events-auto absolute inset-0" />
  );
}
