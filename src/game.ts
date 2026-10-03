export const WORLD_SIZE = 800
export const ORBIT_RADIUS = 100
export const PLAYER_RADIUS = 12
export const ANGULAR_SPEED = 3.4
export const INVULNERABILITY = 0.5
export const METEOR_TYPES = {
  normal: { radius: 17, speedMultiplier: 1, probability: 0.6 },
  heavy: { radius: 30, speedMultiplier: 0.65, probability: 0.25 },
  swift: { radius: 9, speedMultiplier: 1.65, probability: 0.15 },
} as const
export type MeteorKind = keyof typeof METEOR_TYPES
const TAU = Math.PI * 2
const SPAWN_RADIUS = 600
const REMOVE_RADIUS = 660

export interface Meteor {
  kind: MeteorKind
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}
export interface GameState {
  phase: 'playing' | 'game-over'
  player: { angle: number; direction: 1 | -1 }
  health: number
  elapsed: number
  invulnerable: number
  spawnRemaining: number
  meteors: Meteor[]
}
export function createGame(): GameState {
  return {
    phase: 'playing', player: { angle: -Math.PI / 2, direction: 1 },
    health: 3, elapsed: 0, invulnerable: 0, spawnRemaining: 0.6, meteors: [],
  }
}
export function score(game: GameState): number {
  // Avoid a one-point discrepancy at exact tenths from floating-point accumulation.
  return Math.floor(game.elapsed * 10 + 1e-9)
}
export function difficulty(elapsed: number) {
  const progress = Math.min(elapsed / 120, 1)
  return { speed: 150 + 130 * progress, interval: 1.1 - 0.65 * progress }
}
export function reverseDirection(game: GameState) {
  if (game.phase === 'playing') game.player.direction = game.player.direction === 1 ? -1 : 1
}
function spawnMeteor(game: GameState) {
  const roll = Math.random()
  const kind: MeteorKind = roll < METEOR_TYPES.normal.probability ? 'normal'
    : roll < METEOR_TYPES.normal.probability + METEOR_TYPES.heavy.probability ? 'heavy' : 'swift'
  const settings = METEOR_TYPES[kind]
  const angle = Math.random() * TAU
  const x = Math.cos(angle) * SPAWN_RADIUS
  const y = Math.sin(angle) * SPAWN_RADIUS
  // Perpendicular offsets let about 72% of centerlines cross the orbit;
  // the rest skim or miss it. This never depends on the player's position.
  const offset = (Math.random() * 2 - 1) * ORBIT_RADIUS * 1.4
  const dx = -Math.sin(angle) * offset - x
  const dy = Math.cos(angle) * offset - y
  const speed = difficulty(game.elapsed).speed * settings.speedMultiplier * (0.9 + Math.random() * 0.2)
  const length = Math.hypot(dx, dy)
  game.meteors.push({ kind, x, y, vx: dx / length * speed, vy: dy / length * speed, radius: settings.radius })
}
function step(game: GameState, delta: number) {
  game.elapsed += delta
  game.player.angle = (game.player.angle + game.player.direction * ANGULAR_SPEED * delta) % TAU
  game.invulnerable = Math.max(0, game.invulnerable - delta)
  game.spawnRemaining -= delta
  if (game.spawnRemaining <= 0) {
    spawnMeteor(game)
    game.spawnRemaining += difficulty(game.elapsed).interval
  }
  const playerX = Math.cos(game.player.angle) * ORBIT_RADIUS
  const playerY = Math.sin(game.player.angle) * ORBIT_RADIUS
  for (let i = game.meteors.length - 1; i >= 0; i--) {
    const meteor = game.meteors[i]!
    meteor.x += meteor.vx * delta
    meteor.y += meteor.vy * delta
    const dx = meteor.x - playerX
    const dy = meteor.y - playerY
    const radii = meteor.radius + PLAYER_RADIUS
    if (game.invulnerable === 0 && dx * dx + dy * dy <= radii * radii) {
      game.meteors.splice(i, 1)
      game.health--
      game.invulnerable = INVULNERABILITY
      if (game.health === 0) {
        game.phase = 'game-over'
        return
      }
    } else if (meteor.x * meteor.x + meteor.y * meteor.y > REMOVE_RADIUS * REMOVE_RADIUS) {
      game.meteors.splice(i, 1)
    }
  }
}
export function updateGame(game: GameState, delta: number) {
  let remaining = Math.max(0, Math.min(delta, 0.05))
  // At maximum relative speed each substep moves less than the smallest hit radius.
  while (remaining > 0 && game.phase === 'playing') {
    const substep = Math.min(remaining, 1 / 120)
    step(game, substep)
    remaining -= substep
  }
}
