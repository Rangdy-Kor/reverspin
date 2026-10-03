import { DEFAULT_VIEWPORT } from './viewport.ts'
import type { Viewport } from './viewport.ts'
import { advanceOrbit, beginRadiusTransition, createHistory, createOrbit } from './trajectory.ts'
import type { OrbitPlayer, TrajectoryHistory } from './trajectory.ts'

export const PLAYER_RADIUS = 12
export const MAX_HEALTH = 3
export const INVULNERABILITY = 0.5
export const HEART_SPEED = 45
export const HEART_RADIUS = 12
export const METEOR_TYPES = {
  normal: { radius: 17, speedMultiplier: 1 },
  heavy: { radius: 30, speedMultiplier: 0.45 },
  swift: { radius: 9, speedMultiplier: 2.1 },
} as const
export type MeteorKind = keyof typeof METEOR_TYPES
const TAU = Math.PI * 2

export interface StageDifficulty {
  progression: number
  orbitRadius: number
  angularVelocity: number
  meteorBaseSpeed: number
  meteorSpawnRate: number
  normalWeight: number
  heavyWeight: number
  swiftWeight: number
  meteorTargetRadius: number
}

export function stageForScore(points: number): number {
  return Math.floor(points / 100) + 1
}

export function difficultyProgression(stage: number): number {
  if (!Number.isInteger(stage) || stage < 1) throw new RangeError('Stage must be a positive integer.')
  // Subtract each Stage 1 baseline: D(1) is exactly zero. The positive linear
  // tail keeps progression unbounded after the three sigmoid rises settle.
  return 0.0014 * (stage - 1)
    + 0.18 * (sigmoid((stage - 9) / 2.5) - sigmoid((1 - 9) / 2.5))
    + 0.88 * (sigmoid((stage - 19) / 4) - sigmoid((1 - 19) / 4))
    + 0.58 * (sigmoid((stage - 38) / 12) - sigmoid((1 - 38) / 12))
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value))
}

export function stageDifficulty(stage: number): Readonly<StageDifficulty> {
  const growth = difficultyProgression(stage)
  const variety = Math.tanh(0.232 * growth ** 1.887)
  return {
    progression: growth,
    orbitRadius: 180 / (1 + 7.3 * growth ** 1.82) ** 0.256,
    angularVelocity: 3.4 + 2.38 * growth ** 0.875,
    meteorBaseSpeed: 150 + 107.3 * growth ** 0.837,
    meteorSpawnRate: 0.55 + 0.415 * growth ** 1.241,
    normalWeight: 0.8 - 0.25 * variety,
    heavyWeight: 0.15 + 0.1 * variety,
    swiftWeight: 0.05 + 0.15 * variety,
    meteorTargetRadius: 600 / (1 + 3.49 * growth ** 1.395) ** 0.710,
  }
}

export function sampleMeteorTarget(difficulty: Readonly<StageDifficulty>, random: () => number): { x: number; y: number } {
  const angle = random() * TAU
  // sqrt(U) samples equal areas, rather than overpopulating the center.
  const radius = difficulty.meteorTargetRadius * Math.sqrt(random())
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

interface MovingCircle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}
export interface Meteor extends MovingCircle {
  kind: MeteorKind
}
export interface Heart extends MovingCircle {}

export interface GameState {
  phase: 'playing' | 'game-over'
  player: OrbitPlayer
  trajectoryHistory: TrajectoryHistory
  health: number
  elapsed: number
  stage: number
  difficulty: Readonly<StageDifficulty>
  viewport: Readonly<Viewport>
  invulnerable: number
  spawnProgress: number
  heartSpawnRemaining: number
  meteors: Meteor[]
  hearts: Heart[]
}

export function createGame(viewport: Readonly<Viewport> = DEFAULT_VIEWPORT): GameState {
  const difficulty = stageDifficulty(1)
  const player = createOrbit(difficulty.orbitRadius)
  return {
    phase: 'playing', player, trajectoryHistory: createHistory(player),
    health: MAX_HEALTH, elapsed: 0, stage: 1, difficulty, viewport,
    invulnerable: 0, spawnProgress: 0.67, heartSpawnRemaining: 8, meteors: [], hearts: [],
  }
}

export function score(game: GameState): number {
  // Avoid a one-point discrepancy at exact tenths from floating-point accumulation.
  return Math.floor(game.elapsed * 10 + 1e-9)
}

export function reverseDirection(game: GameState) {
  if (game.phase === 'playing') game.player.direction = game.player.direction === 1 ? -1 : 1
}

function inwardPath(game: GameState, radius: number, speed: number, spread: number | undefined, random: () => number): MovingCircle {
  const angle = random() * TAU
  const cos = Math.cos(angle), sin = Math.sin(angle)
  // Intersect a ray with the expanded viewport rectangle, keeping the whole
  // object offscreen even on ultrawide or portrait displays.
  const distance = Math.min(
    (game.viewport.width / 2 + radius + 16) / Math.abs(cos),
    (game.viewport.height / 2 + radius + 16) / Math.abs(sin),
  )
  const x = cos * distance, y = sin * distance
  let targetX: number, targetY: number
  if (spread === undefined) {
    const target = sampleMeteorTarget(game.difficulty, random)
    targetX = target.x; targetY = target.y
  } else {
    // Preserve Heart's existing perpendicular target line and RNG consumption.
    const offset = (random() * 2 - 1) * game.difficulty.orbitRadius * spread
    targetX = -sin * offset; targetY = cos * offset
  }
  const dx = targetX - x, dy = targetY - y
  const length = Math.hypot(dx, dy)
  return { x, y, vx: dx / length * speed, vy: dy / length * speed, radius }
}

function spawnMeteor(game: GameState, random: () => number) {
  const roll = random()
  const kind: MeteorKind = roll < game.difficulty.normalWeight ? 'normal'
    : roll < game.difficulty.normalWeight + game.difficulty.heavyWeight ? 'heavy' : 'swift'
  const settings = METEOR_TYPES[kind]
  const speed = game.difficulty.meteorBaseSpeed * settings.speedMultiplier * (0.9 + random() * 0.2)
  game.meteors.push({ kind, ...inwardPath(game, settings.radius, speed, undefined, random) })
}

function escaped(object: MovingCircle, viewport: Readonly<Viewport>): boolean {
  // A resize may put incoming objects outside the new bounds. Keep them until
  // they traverse the scene, and discard only objects leaving the viewport.
  return (Math.abs(object.x) > viewport.width / 2 + object.radius + 64 && object.x * object.vx > 0)
    || (Math.abs(object.y) > viewport.height / 2 + object.radius + 64 && object.y * object.vy > 0)
}

function sweptCollision(x0: number, y0: number, x1: number, y1: number, radius: number): boolean {
  const dx = x1 - x0, dy = y1 - y0
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(x0 * dx + y0 * dy) / lengthSquared))
  const x = x0 + t * dx, y = y0 + t * dy
  return x * x + y * y <= radius * radius
}

function step(game: GameState, delta: number, random: () => number) {
  game.elapsed += delta
  const stage = stageForScore(score(game))
  if (stage !== game.stage) {
    game.stage = stage
    game.difficulty = stageDifficulty(stage)
    beginRadiusTransition(game.player, game.difficulty.orbitRadius)
  }
  const previousPlayerX = Math.cos(game.player.angle) * game.player.radius
  const previousPlayerY = Math.sin(game.player.angle) * game.player.radius
  advanceOrbit(game.player, game.trajectoryHistory, game.difficulty.angularVelocity * delta)
  const playerX = Math.cos(game.player.angle) * game.player.radius
  const playerY = Math.sin(game.player.angle) * game.player.radius
  game.invulnerable = Math.max(0, game.invulnerable - delta)

  // Accumulate fractional spawns. Rate changes immediately on Stage entry,
  // without losing progress or imposing a maximum rate.
  game.spawnProgress += game.difficulty.meteorSpawnRate * delta
  while (game.spawnProgress >= 1) {
    spawnMeteor(game, random)
    game.spawnProgress -= 1
  }
  if (game.health < MAX_HEALTH && game.hearts.length === 0) {
    game.heartSpawnRemaining -= delta
    if (game.heartSpawnRemaining <= 0) {
      game.hearts.push(inwardPath(game, HEART_RADIUS, HEART_SPEED, 0.45, random))
      game.heartSpawnRemaining = 10 + random() * 6
    }
  }

  for (let i = game.meteors.length - 1; i >= 0; i--) {
    const meteor = game.meteors[i]!
    const x0 = meteor.x - previousPlayerX, y0 = meteor.y - previousPlayerY
    meteor.x += meteor.vx * delta
    meteor.y += meteor.vy * delta
    if (game.invulnerable === 0 && sweptCollision(x0, y0, meteor.x - playerX, meteor.y - playerY, meteor.radius + PLAYER_RADIUS)) {
      game.meteors.splice(i, 1)
      game.health--
      game.invulnerable = INVULNERABILITY
      if (game.health === 0) {
        game.phase = 'game-over'
        return
      }
    } else if (escaped(meteor, game.viewport)) {
      game.meteors.splice(i, 1)
    }
  }
  // Lethal meteor damage ends the session before recovery. Otherwise Hearts
  // can be collected during invulnerability and are consumed even at full HP.
  for (let i = game.hearts.length - 1; i >= 0; i--) {
    const heart = game.hearts[i]!
    const x0 = heart.x - previousPlayerX, y0 = heart.y - previousPlayerY
    heart.x += heart.vx * delta
    heart.y += heart.vy * delta
    if (sweptCollision(x0, y0, heart.x - playerX, heart.y - playerY, heart.radius + PLAYER_RADIUS)) {
      if (game.health < MAX_HEALTH) game.health++
      game.hearts.splice(i, 1)
    } else if (escaped(heart, game.viewport)) {
      game.hearts.splice(i, 1)
    }
  }
}

export function updateGame(game: GameState, delta: number, random: () => number = Math.random) {
  let remaining = Math.max(0, Math.min(delta, 0.05))
  // Substeps approximate the player's curved orbit; swept relative circles
  // also catch fast meteors passing between sampled positions at high Stages.
  while (remaining > 0 && game.phase === 'playing') {
    const substep = Math.min(remaining, 1 / 120)
    step(game, substep, random)
    remaining -= substep
  }
}
