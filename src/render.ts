import { PLAYER_RADIUS } from './game.ts'
import type { GameState } from './game'
import { BACKWARD_VISIBLE_ANGLE, FORWARD_VISIBLE_ANGLE, radiusAtDistance, trajectoryAlpha } from './trajectory.ts'
import { SPRITE_SIZES } from './sprites.ts'
import type { Sprites } from './sprites.ts'

const METEOR_COLORS = {
  normal: { body: '#f39a5a', crater: '#ad583b' },
  heavy: { body: '#cc7150', crater: '#854532' },
  swift: { body: '#ffe3a0', crater: '#c19449' },
} as const

export function createRenderer(canvas: HTMLCanvasElement, sprites: Sprites = {}) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D를 사용할 수 없습니다.')

  function sprite(image: HTMLImageElement, x: number, y: number, size: number, rotation = 0) {
    const scale = size / Math.max(image.naturalWidth, image.naturalHeight)
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale
    context!.save()
    context!.translate(x, y)
    context!.rotate(rotation)
    context!.drawImage(image, -width / 2, -height / 2, width, height)
    context!.restore()
  }

  function circle(x: number, y: number, radius: number, fill: string) {
    context!.beginPath()
    context!.arc(x, y, radius, 0, Math.PI * 2)
    context!.fillStyle = fill
    context!.fill()
  }
  function trajectorySegment(x0: number, y0: number, x1: number, y1: number, alpha: number) {
    context!.globalAlpha = alpha * 0.45
    context!.beginPath()
    context!.moveTo(x0, y0)
    context!.lineTo(x1, y1)
    context!.stroke()
  }
  function renderTrajectory(game: GameState) {
    const player = game.player
    context!.strokeStyle = '#63879c'
    context!.lineWidth = 2
    // Butt caps avoid overlapping translucent endpoints appearing as dots.
    context!.lineCap = 'butt'
    let x = Math.cos(player.angle) * player.radius
    let y = Math.sin(player.angle) * player.radius
    // Conditional preview: keep the current direction and Stage target.
    // Stage entry changes this preview through the shared radius function.
    const segments = 48
    for (let i = 1; i <= segments; i++) {
      const distance = FORWARD_VISIBLE_ANGLE * i / segments
      const angle = player.angle + player.direction * distance
      const radius = radiusAtDistance(player, distance)
      const nextX = Math.cos(angle) * radius, nextY = Math.sin(angle) * radius
      const midpointDistance = FORWARD_VISIBLE_ANGLE * (i - 0.5) / segments
      trajectorySegment(x, y, nextX, nextY, trajectoryAlpha(midpointDistance, FORWARD_VISIBLE_ANGLE))
      x = nextX; y = nextY
    }
    x = Math.cos(player.angle) * player.radius
    y = Math.sin(player.angle) * player.radius
    let previousDistance = 0
    const history = game.trajectoryHistory
    for (let i = 0; i < history.count; i++) {
      const index = (history.nextIndex - 1 - i + history.points.length) % history.points.length
      const point = history.points[index]!
      const distance = player.distanceTraveled - point.distance
      if (distance <= previousDistance) continue
      const endDistance = Math.min(distance, BACKWARD_VISIBLE_ANGLE)
      const fraction = (endDistance - previousDistance) / (distance - previousDistance)
      const nextX = x + (point.x - x) * fraction, nextY = y + (point.y - y) * fraction
      trajectorySegment(x, y, nextX, nextY, trajectoryAlpha((previousDistance + endDistance) / 2, BACKWARD_VISIBLE_ANGLE))
      x = nextX; y = nextY
      previousDistance = endDistance
      if (distance >= BACKWARD_VISIBLE_ANGLE) break
    }
    context!.globalAlpha = 1
  }
  return (game: GameState, cssWidth: number, cssHeight: number, dpr: number) => {
    const width = Math.max(1, Math.round(cssWidth * dpr))
    const height = Math.max(1, Math.round(cssHeight * dpr))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.fillStyle = '#0b1422'
    context.fillRect(0, 0, width, height)
    const scale = Math.min(width / game.viewport.width, height / game.viewport.height)
    context.setTransform(scale, 0, 0, scale, width / 2, height / 2)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    renderTrajectory(game)
    circle(0, 0, 5, '#7390a6')
    context.strokeStyle = '#385166'
    context.beginPath()
    context.moveTo(-15, 0); context.lineTo(15, 0)
    context.moveTo(0, -15); context.lineTo(0, 15)
    context.stroke()
    for (const meteor of game.meteors) {
      const image = sprites[meteor.kind]
      if (image) {
        // Cosmetic variation from immutable velocity, without consuming gameplay RNG.
        const seed = Math.sin(meteor.vx * 12.9898 + meteor.vy * 78.233) * 43758.5453
        const variation = seed - Math.floor(seed)
        const rotation = variation * Math.PI * 2 + game.elapsed * (0.18 + variation * 0.17)
        sprite(image, meteor.x, meteor.y, meteor.radius * 2 * SPRITE_SIZES.meteorDiameterScale, rotation)
        continue
      }
      const colors = METEOR_COLORS[meteor.kind]
      circle(meteor.x, meteor.y, meteor.radius, colors.body)
      circle(meteor.x - meteor.radius * 0.25, meteor.y - meteor.radius * 0.2, meteor.radius * 0.25, colors.crater)
    }
    for (const heart of game.hearts) {
      if (sprites.heart) {
        sprite(sprites.heart, heart.x, heart.y, heart.radius * 2 * SPRITE_SIZES.heartDiameterScale)
        continue
      }
      const x = heart.x, y = heart.y, r = heart.radius
      context.beginPath()
      context.moveTo(x, y - r * 0.45)
      context.bezierCurveTo(x - r, y - r * 1.4, x - r * 1.5, y, x, y + r)
      context.bezierCurveTo(x + r * 1.5, y, x + r, y - r * 1.4, x, y - r * 0.45)
      context.fillStyle = '#ff739b'
      context.fill()
    }
    const x = Math.cos(game.player.angle) * game.player.radius
    const y = Math.sin(game.player.angle) * game.player.radius
    if (game.invulnerable > 0) {
      context.strokeStyle = '#b7fff1'
      context.beginPath()
      context.arc(x, y, PLAYER_RADIUS + 7, 0, Math.PI * 2)
      context.stroke()
    }
    context.globalAlpha = game.invulnerable > 0 && Math.floor(game.invulnerable * 12) % 2 === 0 ? 0.35 : 1
    if (sprites.rocket) {
      // Source points up; the tangent heading needs a further quarter turn.
      const rotation = game.player.angle + game.player.direction * Math.PI / 2 + Math.PI / 2
      sprite(sprites.rocket, x, y, PLAYER_RADIUS * 2 * SPRITE_SIZES.rocketDiameterScale, rotation)
    } else circle(x, y, PLAYER_RADIUS, '#65efce')
    context.globalAlpha = 1
    if (sprites.rocket) return
    // Keep the direction marker on the real upcoming spiral as well.
    const ahead = 19 / game.player.radius
    const markerAngle = game.player.angle + game.player.direction * ahead
    const markerRadius = radiusAtDistance(game.player, ahead)
    circle(Math.cos(markerAngle) * markerRadius, Math.sin(markerAngle) * markerRadius, 3, '#d7fff5')
  }
}
