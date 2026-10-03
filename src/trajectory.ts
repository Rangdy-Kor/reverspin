export const TRANSITION_ANGLE = Math.PI
export const FORWARD_VISIBLE_ANGLE = Math.PI * 0.55
export const BACKWARD_VISIBLE_ANGLE = Math.PI * 0.35
const HISTORY_SAMPLE_ANGLE = 0.025
const HISTORY_CAPACITY = 96
const TAU = Math.PI * 2

export interface OrbitPlayer {
  angle: number
  direction: 1 | -1
  radius: number
  distanceTraveled: number
  transition: { fromRadius: number; toRadius: number; traveledAngle: number }
}

export interface TrajectoryHistory {
  points: { x: number; y: number; distance: number }[]
  nextIndex: number
  count: number
  lastSampleDistance: number
}

export function createOrbit(radius: number): OrbitPlayer {
  return {
    angle: -Math.PI / 2, direction: 1, radius, distanceTraveled: 0,
    transition: { fromRadius: radius, toRadius: radius, traveledAngle: TRANSITION_ANGLE },
  }
}

export function createHistory(player: OrbitPlayer): TrajectoryHistory {
  const points = Array.from({ length: HISTORY_CAPACITY }, () => ({ x: 0, y: 0, distance: 0 }))
  points[0] = { x: Math.cos(player.angle) * player.radius, y: Math.sin(player.angle) * player.radius, distance: player.distanceTraveled }
  return { points, nextIndex: 1, count: 1, lastSampleDistance: player.distanceTraveled }
}

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

// The finite transition clamps its progress, not the Stage radius curve.
// Both future preview and actual movement evaluate this same function.
export function radiusAtDistance(player: Readonly<OrbitPlayer>, aheadAngle = 0): number {
  const transition = player.transition
  const t = Math.min(1, Math.max(0, (transition.traveledAngle + aheadAngle) / TRANSITION_ANGLE))
  if (t === 1) return transition.toRadius
  return transition.fromRadius + (transition.toRadius - transition.fromRadius) * smoothstep(t)
}

export function trajectoryAlpha(distance: number, visibleAngle: number): number {
  const t = Math.min(1, Math.max(0, distance / visibleAngle))
  return 1 - smoothstep(t)
}

export function beginRadiusTransition(player: OrbitPlayer, radius: number) {
  player.transition = { fromRadius: player.radius, toRadius: radius, traveledAngle: 0 }
}

export function advanceOrbit(player: OrbitPlayer, history: TrajectoryHistory, angularDistance: number) {
  const endDistance = player.distanceTraveled + angularDistance
  // Sample by traveled angular distance, so history length is independent of
  // refresh rate. Reuse a small ring buffer instead of allocating every frame.
  let sampleDistance = history.lastSampleDistance + HISTORY_SAMPLE_ANGLE
  while (sampleDistance <= endDistance) {
    const ahead = sampleDistance - player.distanceTraveled
    const angle = player.angle + player.direction * ahead
    const radius = radiusAtDistance(player, ahead)
    const point = history.points[history.nextIndex]!
    point.x = Math.cos(angle) * radius
    point.y = Math.sin(angle) * radius
    point.distance = sampleDistance
    history.nextIndex = (history.nextIndex + 1) % history.points.length
    history.count = Math.min(history.count + 1, history.points.length)
    history.lastSampleDistance = sampleDistance
    sampleDistance += HISTORY_SAMPLE_ANGLE
  }
  player.angle = (player.angle + player.direction * angularDistance) % TAU
  player.transition.traveledAngle = Math.min(TRANSITION_ANGLE, player.transition.traveledAngle + angularDistance)
  player.radius = radiusAtDistance(player)
  player.distanceTraveled = endDistance
}
