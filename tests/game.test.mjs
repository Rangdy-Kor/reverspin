import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame, updateGame, reverseDirection, score, difficulty, ORBIT_RADIUS, ANGULAR_SPEED, INVULNERABILITY, METEOR_TYPES } from '../src/game.ts'
import { bindInput } from '../src/input.ts'

function advance(game, seconds, frame = 1 / 60) {
  const count = Math.round(seconds / frame)
  for (let i = 0; i < count; i++) updateGame(game, frame)
}
function hit(game) {
  game.meteors.push({ kind: 'normal', x: Math.cos(game.player.angle) * ORBIT_RADIUS, y: Math.sin(game.player.angle) * ORBIT_RADIUS, vx: 0, vy: 0, radius: 17 })
  updateGame(game, 1 / 120)
}

test('orbit and survival score are independent of frame rate', () => {
  const slow = createGame(), fast = createGame()
  advance(slow, 0.5, 1 / 30)
  advance(fast, 0.5, 1 / 144)
  assert.ok(Math.abs(slow.player.angle - fast.player.angle) < 1e-10)
  assert.ok(Math.abs(slow.elapsed - fast.elapsed) < 1e-10)
  assert.equal(score(slow), score(fast))
  const angle = slow.player.angle
  reverseDirection(slow)
  updateGame(slow, 0.05)
  assert.ok(slow.player.angle < angle)
})
test('simultaneous hits lose one health and invulnerability expires', () => {
  const game = createGame()
  hit(game)
  assert.equal(game.invulnerable, 0.5)
  hit(game)
  assert.equal(game.health, 2)
  assert.equal(INVULNERABILITY, 0.5)
  game.meteors.length = 0
  advance(game, 0.45)
  hit(game)
  assert.equal(game.health, 2)
  game.meteors.length = 0
  advance(game, 0.05)
  hit(game)
  assert.equal(game.health, 1)
})
test('game over freezes simulation and a fresh session resets all state', () => {
  const game = createGame()
  for (let i = 0; i < 3; i++) { game.invulnerable = 0; hit(game) }
  assert.equal(game.phase, 'game-over')
  const snapshot = structuredClone(game)
  updateGame(game, 0.05)
  reverseDirection(game)
  assert.deepEqual(game, snapshot)
  assert.deepEqual(createGame(), { phase: 'playing', player: { angle: -Math.PI / 2, direction: 1 }, health: 3, elapsed: 0, invulnerable: 0, spawnRemaining: 0.6, meteors: [] })
})
test('large frame gaps are capped and escaped meteors are removed', () => {
  const game = createGame()
  game.meteors.push({ kind: 'heavy', x: 700, y: 0, vx: 1, vy: 0, radius: 30 })
  updateGame(game, 60)
  assert.ok(game.elapsed <= 0.05000001)
  assert.equal(game.meteors.length, 0)
})
test('difficulty increases gradually and has an upper bound', () => {
  assert.deepEqual(difficulty(0), { speed: 150, interval: 1.1 })
  assert.ok(difficulty(60).speed > difficulty(0).speed)
  assert.ok(difficulty(60).interval < difficulty(0).interval)
  assert.deepEqual(difficulty(120), difficulty(1200))
})
test('fastest Swift still collides across a maximum-length frame', () => {
  const game = createGame()
  game.player.angle = 0
  game.meteors.push({ kind: 'swift', x: 120, y: 0, vx: -280 * 1.65 * 1.1, vy: 0, radius: 9 })
  updateGame(game, 0.05)
  assert.equal(game.health, 2)
  assert.equal(game.meteors.length, 0)
})
test('long sessions keep meteor population bounded', () => {
  const game = createGame()
  for (let i = 0; i < 6000; i++) {
    game.invulnerable = 1
    updateGame(game, 0.05)
    assert.ok(game.meteors.length < 40)
  }
})
test('smaller orbit completes a revolution in about 1.85 seconds', () => {
  assert.equal(ORBIT_RADIUS, 100)
  assert.equal(ANGULAR_SPEED, 3.4)
  const period = 2 * Math.PI / ANGULAR_SPEED
  assert.ok(period > 1.8 && period < 1.9)
  const game = createGame()
  const initial = game.player.angle
  let remaining = period
  while (remaining > 0) {
    const delta = Math.min(remaining, 0.05)
    updateGame(game, delta)
    remaining -= delta
  }
  assert.ok(Math.abs(Math.sin(game.player.angle) - Math.sin(initial)) < 1e-10)
  assert.ok(Math.abs(Math.cos(game.player.angle) - Math.cos(initial)) < 1e-10)
})
test('meteor types have distinct sizes, speeds and weighted spawn frequencies', (t) => {
  let values = []
  t.mock.method(Math, 'random', () => values.shift())
  const counts = { normal: 0, heavy: 0, swift: 0 }
  for (let i = 0; i < 1000; i++) {
    values = [(i + 0.5) / 1000, 0.25, 0.5, 0.5]
    const game = createGame()
    game.spawnRemaining = 0
    updateGame(game, 0.001)
    const meteor = game.meteors[0]
    counts[meteor.kind]++
    const settings = METEOR_TYPES[meteor.kind]
    assert.equal(meteor.radius, settings.radius)
    assert.ok(Math.abs(Math.hypot(meteor.vx, meteor.vy) - difficulty(game.elapsed).speed * settings.speedMultiplier) < 1e-10)
  }
  assert.deepEqual(counts, { normal: 600, heavy: 250, swift: 150 })
  assert.ok(METEOR_TYPES.heavy.radius > METEOR_TYPES.normal.radius)
  assert.ok(METEOR_TYPES.swift.radius < METEOR_TYPES.normal.radius)
  assert.ok(METEOR_TYPES.heavy.speedMultiplier < METEOR_TYPES.normal.speedMultiplier)
  assert.ok(METEOR_TYPES.swift.speedMultiplier > METEOR_TYPES.normal.speedMultiplier)
})
test('orbit-relative paths both cross and miss without tracking the player', (t) => {
  let values = []
  t.mock.method(Math, 'random', () => values.shift())
  let crossing = 0
  for (let i = 0; i < 1000; i++) {
    const spawnValues = [0.1, i / 1000, (i + 0.5) / 1000, 0.5]
    const first = createGame(), second = createGame()
    first.spawnRemaining = second.spawnRemaining = 0
    second.player.angle = 1.2
    values = [...spawnValues]
    updateGame(first, 0.001)
    values = [...spawnValues]
    updateGame(second, 0.001)
    assert.deepEqual(first.meteors, second.meteors)
    const meteor = first.meteors[0]
    const closest = Math.abs(meteor.x * meteor.vy - meteor.y * meteor.vx) / Math.hypot(meteor.vx, meteor.vy)
    if (closest <= ORBIT_RADIUS) crossing++
    const vx = meteor.vx, vy = meteor.vy
    updateGame(first, 0.05)
    assert.equal(meteor.vx, vx)
    assert.equal(meteor.vy, vy)
  }
  assert.ok(crossing > 700 && crossing < 760, `crossings: ${crossing}`)
})
test('Space hold and repeat trigger once; release and focus recovery work', () => {
  globalThis.window = new EventTarget()
  globalThis.document = new EventTarget()
  let reversals = 0
  bindInput(() => { reversals++ })
  function key(type, code = 'Space', repeat = false) {
    const event = new Event(type, { cancelable: true })
    Object.assign(event, { code, repeat })
    window.dispatchEvent(event)
    return event
  }
  assert.equal(key('keydown').defaultPrevented, true)
  key('keydown', 'Space', true)
  key('keydown')
  assert.equal(reversals, 1)
  key('keyup'); key('keydown')
  assert.equal(reversals, 2)
  window.dispatchEvent(new Event('blur'))
  key('keydown', 'Space', true)
  assert.equal(reversals, 2)
  key('keydown')
  assert.equal(reversals, 3)
  assert.equal(key('keydown', 'ArrowDown').defaultPrevented, false)
  delete globalThis.window
  delete globalThis.document
})
