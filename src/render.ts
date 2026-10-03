import { ORBIT_RADIUS, PLAYER_RADIUS, WORLD_SIZE } from './game'
import type { GameState } from './game'

const METEOR_COLORS = {
  normal: { body: '#f39a5a', crater: '#ad583b' },
  heavy: { body: '#cc7150', crater: '#854532' },
  swift: { body: '#ffe3a0', crater: '#c19449' },
} as const

export function createRenderer(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D를 사용할 수 없습니다.')
  let cssSize = canvas.getBoundingClientRect().width
  let lastDpr = 0
  let resized = true
  new ResizeObserver(([entry]) => {
    if (entry) cssSize = entry.contentRect.width
    resized = true
  }).observe(canvas)

  function circle(x: number, y: number, radius: number, fill: string) {
    context!.beginPath()
    context!.arc(x, y, radius, 0, Math.PI * 2)
    context!.fillStyle = fill
    context!.fill()
  }
  return (game: GameState) => {
    const dpr = window.devicePixelRatio || 1
    if (resized || dpr !== lastDpr) {
      canvas.width = canvas.height = Math.max(1, Math.round(cssSize * dpr))
      lastDpr = dpr
      resized = false
    }
    const scale = canvas.width / WORLD_SIZE
    context.setTransform(scale, 0, 0, scale, 0, 0)
    context.fillStyle = '#0b1422'
    context.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE)
    context.translate(WORLD_SIZE / 2, WORLD_SIZE / 2)
    context.strokeStyle = '#263c50'
    context.lineWidth = 2
    context.beginPath()
    context.arc(0, 0, ORBIT_RADIUS, 0, Math.PI * 2)
    context.stroke()
    circle(0, 0, 5, '#7390a6')
    context.strokeStyle = '#385166'
    context.beginPath()
    context.moveTo(-15, 0); context.lineTo(15, 0)
    context.moveTo(0, -15); context.lineTo(0, 15)
    context.stroke()
    for (const meteor of game.meteors) {
      const colors = METEOR_COLORS[meteor.kind]
      circle(meteor.x, meteor.y, meteor.radius, colors.body)
      circle(meteor.x - meteor.radius * 0.25, meteor.y - meteor.radius * 0.2, meteor.radius * 0.25, colors.crater)
    }
    const x = Math.cos(game.player.angle) * ORBIT_RADIUS
    const y = Math.sin(game.player.angle) * ORBIT_RADIUS
    if (game.invulnerable > 0) {
      context.strokeStyle = '#b7fff1'
      context.beginPath()
      context.arc(x, y, PLAYER_RADIUS + 7, 0, Math.PI * 2)
      context.stroke()
    }
    context.globalAlpha = game.invulnerable > 0 && Math.floor(game.invulnerable * 12) % 2 === 0 ? 0.35 : 1
    circle(x, y, PLAYER_RADIUS, '#65efce')
    context.globalAlpha = 1
    // A tangent marker exposes the direction immediately after a reversal.
    const tangent = game.player.angle + game.player.direction * Math.PI / 2
    circle(x + Math.cos(tangent) * 19, y + Math.sin(tangent) * 19, 3, '#d7fff5')
  }
}
