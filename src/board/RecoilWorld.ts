/**
 * Matter.js recoil: the tiles around a slammed tile are nudged aside and
 * settle back into place.
 *
 * Matter.js owns the physical simulation; the Pixi renderer reads the
 * bodies' positions each frame. The engine is kept separate so the physics
 * can be stepped and tested without a renderer.
 */
import Matter from 'matter-js';
import { recoilImpulse, type SlamEffect } from '../../shared/slam';
import type { PlacedTile } from '../../shared/types';

const { Bodies, Body, Composite, Engine } = Matter;

/** How strongly the world resists movement. */
const FRICTION = 0.06;
/** How fast the world damps motion. */
const FRICTION_AIR = 0.12;
/** The restitution of the tiles. */
const RESTITUTION = 0.2;

/** A tile in the physics world. */
interface RecoilBody {
  readonly id: string;
  readonly body: Matter.Body;
  /** The tile's resting position, in board units. */
  readonly home: { x: number; y: number };
}

export interface RecoilWorldOptions {
  /** The width of a laid tile, in board units. */
  readonly tileWidth?: number;
}

/**
 * A small physics world holding the laid tiles.
 *
 * The world is static until a slam fires an impulse; afterwards the bodies
 * settle back to their home positions, so the chain always ends up exactly
 * where the layout says it should be.
 */
export class RecoilWorld {
  private readonly engine: Matter.Engine;
  private readonly bodies = new Map<string, RecoilBody>();
  private readonly tileWidth: number;
  private running = false;

  constructor(options: RecoilWorldOptions = {}) {
    this.tileWidth = options.tileWidth ?? 92;
    this.engine = Engine.create({
      // Gravity is off: tiles slide along the felt, they do not fall.
      gravity: { x: 0, y: 0, scale: 0 },
    });
  }

  /** The tiles currently in the world. */
  get size(): number {
    return this.bodies.size;
  }

  /** Make sure every laid tile has a body. */
  sync(
    tiles: readonly PlacedTile[],
    positions: ReadonlyMap<string, { x: number; y: number }>,
  ): void {
    const seen = new Set<string>();
    for (const tile of tiles) {
      seen.add(tile.id);
      const position = positions.get(tile.id) ?? { x: 0, y: 0 };
      const existing = this.bodies.get(tile.id);
      if (existing) {
        existing.home.x = position.x;
        existing.home.y = position.y;
        Body.setPosition(existing.body, position);
        Body.setStatic(existing.body, true);
        continue;
      }
      const body = Bodies.rectangle(position.x, position.y, this.tileWidth, 40, {
        friction: FRICTION,
        frictionAir: FRICTION_AIR,
        restitution: RESTITUTION,
        collisionFilter: { mask: 0 },
        // The tiles never fall over; they are held in place by the felt.
        isStatic: true,
      });
      body.label = tile.id;
      this.bodies.set(tile.id, { id: tile.id, body, home: { ...position } });
      Composite.add(this.engine.world, body);
    }

    for (const [id, entry] of this.bodies) {
      if (seen.has(id)) continue;
      Composite.remove(this.engine.world, entry.body);
      this.bodies.delete(id);
    }
  }

  /**
   * Apply a slam: every tile near the impact is pushed away from it.
   */
  slam(effect: SlamEffect, impact: { x: number; y: number }): void {
    if (effect.recoil <= 0) return;
    for (const entry of this.bodies.values()) {
      const impulse = recoilImpulse(effect, impact, entry.body.position, this.tileWidth);
      if (impulse.x === 0 && impulse.y === 0) continue;
      // The body becomes dynamic for the recoil, then is parked again.
      Body.setStatic(entry.body, false);
      Body.setVelocity(entry.body, { x: impulse.x, y: impulse.y });
      Body.setAngularVelocity(entry.body, 0);
    }
    this.start();
  }

  /** Step the simulation. */
  step(deltaMs = 16.666): void {
    if (!this.running) return;
    for (const entry of this.bodies.values()) {
      if (entry.body.isStatic) continue;
      Body.setVelocity(entry.body, {
        x: entry.body.velocity.x * 0.72 + (entry.home.x - entry.body.position.x) * 0.09,
        y: entry.body.velocity.y * 0.72 + (entry.home.y - entry.body.position.y) * 0.09,
      });
    }
    Engine.update(this.engine, deltaMs);
    this.settle();
  }

  /** Stop the simulation. */
  stop(): void {
    this.running = false;
  }

  /** Whether the simulation is running. */
  get isRunning(): boolean {
    return this.running;
  }

  /** The current position of a tile, in board units. */
  positionOf(id: string): { x: number; y: number } {
    const entry = this.bodies.get(id);
    if (!entry) return { x: 0, y: 0 };
    return { x: entry.body.position.x, y: entry.body.position.y };
  }

  /** Forget every tile. */
  clear(): void {
    for (const entry of this.bodies.values()) {
      Composite.remove(this.engine.world, entry.body);
    }
    this.bodies.clear();
    this.stop();
  }

  private start(): void {
    this.running = true;
  }

  /**
   * Park the tiles that have settled back home.
   *
   * A tile is parked once it is both nearly at its home and barely moving,
   * so the chain ends up pixel-identical to the layout again.
   */
  private settle(): void {
    for (const entry of this.bodies.values()) {
      const dx = entry.body.position.x - entry.home.x;
      const dy = entry.body.position.y - entry.home.y;
      const speed = Math.hypot(entry.body.velocity.x, entry.body.velocity.y);
      if (Math.hypot(dx, dy) < 0.4 && speed < 0.05) {
        Body.setStatic(entry.body, true);
        Body.setPosition(entry.body, { x: entry.home.x, y: entry.home.y });
        Body.setVelocity(entry.body, { x: 0, y: 0 });
      }
    }
    // Once every tile is parked the simulation can stop.
    const moving = [...this.bodies.values()].some(
      (entry) => !entry.body.isStatic || entry.body.speed > 0.05,
    );
    if (!moving) this.running = false;
  }
}
