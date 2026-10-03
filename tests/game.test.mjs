import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame, updateGame, reverseDirection, score, stageForScore, stageDifficulty, INVULNERABILITY, METEOR_TYPES, HEART_SPEED, HEART_RADIUS } from '../src/game.ts'
import { logicalViewport } from '../src/viewport.ts'
import { bindInput } from '../src/input.ts'
import { createOrbit, createHistory } from '../src/trajectory.ts'

function seededRandom(seed = 1) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
}
function valuesRandom(values) {
  let i = 0
  return () => { assert.ok(i < values.length, 'Unexpected RNG call'); return values[i++] }
}
function advance(game, seconds, frame = 1 / 60, random = seededRandom()) {
  const count = Math.round(seconds / frame)
  for (let i = 0; i < count; i++) updateGame(game, frame, random)
}
function atStage(stage) {
  const game = createGame()
  game.elapsed = (stage - 1) * 10
  game.stage = stage
  game.difficulty = stageDifficulty(stage)
  game.player = createOrbit(game.difficulty.orbitRadius)
  game.trajectoryHistory = createHistory(game.player)
  return game
}
function atPlayer(game, radius = 17) {
  return { x: Math.cos(game.player.angle) * game.player.radius, y: Math.sin(game.player.angle) * game.player.radius, vx: 0, vy: 0, radius }
}
function hit(game) {
  game.meteors.push({ kind: 'normal', ...atPlayer(game) })
  updateGame(game, 1 / 120, seededRandom())
}
function closestApproach(object) {
  return Math.abs(object.x * object.vy - object.y * object.vx) / Math.hypot(object.vx, object.vy)
}

test('100-point boundaries determine Stage without a Stage ceiling', () => {
  for (const [points, stage] of [[0, 1], [99, 1], [100, 2], [199, 2], [200, 3], [999999900, 10000000]]) {
    assert.equal(stageForScore(points), stage)
  }
})
test('difficulty is cached within a Stage and changes at the score boundary', () => {
  const game = createGame()
  const initialDifficulty = game.difficulty
  game.elapsed = 9.98
  updateGame(game, 0.01)
  assert.equal(game.stage, 1)
  assert.equal(game.difficulty, initialDifficulty)
  updateGame(game, 0.02)
  assert.equal(score(game), 100)
  assert.equal(game.stage, 2)
  assert.deepEqual(game.difficulty, stageDifficulty(2))
  const secondDifficulty = game.difficulty
  game.elapsed = 19.9
  updateGame(game, 0.05)
  assert.equal(game.difficulty, secondDifficulty)
})
test('all difficulty changes remain monotonic without clamps', () => {
  for (const stage of [1, 2, 3, 5, 10, 20, 100, 1000, 1000000]) {
    const first = stageDifficulty(stage), second = stageDifficulty(stage + 1)
    assert.ok(second.orbitRadius < first.orbitRadius)
    for (const key of ['angularVelocity', 'meteorBaseSpeed', 'meteorSpawnRate']) {
      assert.ok(second[key] > first[key], `${key} increases at ${stage}`)
    }
    assert.ok(Math.abs(first.normalWeight + first.heavyWeight + first.swiftWeight - 1) < 1e-12)
    assert.ok(first.normalWeight > 0.55)
    assert.ok(second.heavyWeight > first.heavyWeight)
    assert.ok(second.swiftWeight > first.swiftWeight)
  }
  assert.ok(stageDifficulty(1000000).meteorBaseSpeed > stageDifficulty(1000).meteorBaseSpeed)
  assert.throws(() => stageDifficulty(1.5), RangeError)
})
test('Stage 1 eases spawn density while preserving the initial orbit', () => {
  const d = stageDifficulty(1)
  assert.equal(d.orbitRadius, 180)
  assert.equal(d.angularVelocity, 3.4)
  assert.equal(d.meteorSpawnRate, 0.55)
  assert.ok(d.meteorSpawnRate < 1 / 1.1 * 0.7)
  assert.ok(2 * Math.PI / d.angularVelocity > 1.8 && 2 * Math.PI / d.angularVelocity < 1.9)
})
test('fractional spawn accumulation matches Stage rate including rates above substep frequency', () => {
  const game = atStage(20)
  game.invulnerable = 1
  game.spawnProgress = 0
  advance(game, 1)
  assert.equal(game.meteors.length, Math.floor(game.difficulty.meteorSpawnRate))
  assert.ok(Math.abs(game.spawnProgress - (game.difficulty.meteorSpawnRate % 1)) < 1e-10)
  // Exercise multiple spawns without trying to allocate astronomical linear-tail rates.
  const extreme = atStage(1000000)
  extreme.spawnProgress = 0
  updateGame(extreme, 0.001)
  assert.equal(extreme.meteors.length, Math.floor(extreme.difficulty.meteorSpawnRate * 0.001))
})
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
test('simultaneous hits lose one health; invulnerability expires after 0.5 seconds', () => {
  const game = createGame()
  hit(game)
  assert.equal(game.invulnerable, INVULNERABILITY)
  assert.equal(INVULNERABILITY, 0.5)
  hit(game)
  assert.equal(game.health, 2)
  game.meteors.length = 0
  advance(game, 0.45)
  hit(game)
  assert.equal(game.health, 2)
  game.meteors.length = 0
  advance(game, 0.05)
  hit(game)
  assert.equal(game.health, 1)
})
test('game over freezes everything and restart resets Stage, Heart and session state', () => {
  const game = atStage(10)
  game.hearts.push({ x: 250, y: 0, vx: -HEART_SPEED, vy: 0, radius: HEART_RADIUS })
  for (let i = 0; i < 3; i++) { game.invulnerable = 0; hit(game) }
  assert.equal(game.phase, 'game-over')
  const snapshot = structuredClone(game)
  updateGame(game, 0.05)
  reverseDirection(game)
  assert.deepEqual(game, snapshot)
  const fresh = createGame(game.viewport)
  assert.equal(fresh.stage, 1)
  assert.deepEqual(fresh.difficulty, stageDifficulty(1))
  assert.equal(fresh.health, 3)
  assert.equal(fresh.elapsed, 0)
  assert.equal(score(fresh), 0)
  assert.equal(fresh.invulnerable, 0)
  assert.equal(fresh.hearts.length, 0)
  assert.equal(fresh.meteors.length, 0)
  assert.equal(fresh.heartSpawnRemaining, 8)
  assert.equal(fresh.spawnProgress, 0.67)
  assert.deepEqual(fresh.player, createOrbit(180))
  assert.equal(fresh.trajectoryHistory.count, 1)
  assert.equal(fresh.trajectoryHistory.lastSampleDistance, 0)
})
test('large frame gaps are capped and escaping objects are removed', () => {
  const game = createGame()
  game.meteors.push({ kind: 'heavy', x: 700, y: 0, vx: 1, vy: 0, radius: 30 })
  game.hearts.push({ x: 700, y: 0, vx: HEART_SPEED, vy: 0, radius: HEART_RADIUS })
  updateGame(game, 60)
  assert.ok(game.elapsed <= 0.05000001)
  assert.equal(game.meteors.length, 0)
  assert.equal(game.hearts.length, 0)
})
test('swept circles detect even a Swift crossing the player within one substep', () => {
  const game = createGame()
  game.player.angle = 0
  game.meteors.push({ kind: 'swift', x: 220, y: 0, vx: -10000, vy: 0, radius: 9 })
  updateGame(game, 1 / 120)
  assert.equal(game.health, 2)
  assert.equal(game.meteors.length, 0)
})
test('seeded long sessions remove old objects instead of accumulating them forever', () => {
  const game = createGame()
  const random = seededRandom(7)
  for (let i = 0; i < 6000; i++) {
    game.invulnerable = 1
    updateGame(game, 0.05, random)
    // Stage 31 still has finite density; slower Heavies remain longer than Normals.
    assert.ok(game.meteors.length < 100)
  }
})
test('Stage probabilities drive type selection and distinct sizes and speeds', () => {
  for (const stage of [1, 5, 20]) {
    const counts = { normal: 0, heavy: 0, swift: 0 }
    for (let i = 0; i < 1000; i++) {
      const game = atStage(stage)
      game.spawnProgress = 1
      updateGame(game, 0.001, valuesRandom([(i + 0.5) / 1000, 0.5, 0.25, 0.5, 0.5]))
      const meteor = game.meteors[0], settings = METEOR_TYPES[meteor.kind]
      counts[meteor.kind]++
      assert.equal(meteor.radius, settings.radius)
      assert.ok(Math.abs(Math.hypot(meteor.vx, meteor.vy) - game.difficulty.meteorBaseSpeed * settings.speedMultiplier) < 1e-10)
    }
    const d = stageDifficulty(stage)
    for (const kind of ['normal', 'heavy', 'swift']) assert.ok(Math.abs(counts[kind] - d[`${kind}Weight`] * 1000) <= 1)
  }
})
test('Heart < Heavy < Normal < Swift even with individual speed variation', () => {
  for (const stage of [1, 2, 20, 1000000]) {
    const speed = stageDifficulty(stage).meteorBaseSpeed
    assert.ok(HEART_SPEED < speed * METEOR_TYPES.heavy.speedMultiplier * 0.9)
    assert.ok(METEOR_TYPES.heavy.speedMultiplier * 1.1 < METEOR_TYPES.normal.speedMultiplier * 0.9)
    assert.ok(METEOR_TYPES.normal.speedMultiplier * 1.1 < METEOR_TYPES.swift.speedMultiplier * 0.9)
  }
})
test('meteor velocity is fixed at spawn and only new meteors use the new Stage speed', () => {
  const game = createGame()
  game.elapsed = 9.99
  game.spawnProgress = 1
  updateGame(game, 0.001, valuesRandom([0.1, 0.5, 0.25, 0.5, 0.5]))
  const old = game.meteors[0]
  const vx = old.vx, vy = old.vy
  assert.ok(Math.abs(Math.hypot(vx, vy) - stageDifficulty(1).meteorBaseSpeed) < 1e-10)
  updateGame(game, 0.02)
  assert.equal(game.stage, 2)
  assert.equal(old.vx, vx)
  assert.equal(old.vy, vy)
  game.spawnProgress = 1
  updateGame(game, 0.001, valuesRandom([0.1, 0.5, 0.25, 0.5, 0.5]))
  const fresh = game.meteors[1]
  assert.ok(Math.abs(Math.hypot(fresh.vx, fresh.vy) - stageDifficulty(2).meteorBaseSpeed) < 1e-10)
  assert.ok(Math.hypot(fresh.vx, fresh.vy) > Math.hypot(old.vx, old.vy))
  assert.equal(old.vx, vx)
  assert.equal(old.vy, vy)
})
test('individual meteor speed jitter still spans minus and plus ten percent', () => {
  for (const variation of [0, 0.5, 0.999999]) {
    const game = createGame()
    game.spawnProgress = 1
    updateGame(game, 0.001, valuesRandom([0.1, variation, 0.25, 0.5, 0.5]))
    const meteor = game.meteors[0]
    assert.ok(Math.abs(Math.hypot(meteor.vx, meteor.vy) - 150 * (0.9 + variation * 0.2)) < 1e-10)
  }
})
test('meteor paths do not track the player; Heart retains its original target line', () => {
  for (let i = 0; i < 500; i++) {
    const first = createGame(), second = createGame()
    first.spawnProgress = second.spawnProgress = 1
    second.player.angle = 1.2
    const values = [0.1, 0.5, i / 500, (i + 0.5) / 500, 0.5]
    updateGame(first, 0.001, valuesRandom(values))
    updateGame(second, 0.001, valuesRandom(values))
    assert.deepEqual(first.meteors, second.meteors)
    const heartGame = createGame()
    heartGame.health = 2
    heartGame.heartSpawnRemaining = 0
    updateGame(heartGame, 0.001, valuesRandom([i / 500, (i + 0.5) / 500, 0.5]))
    const heart = heartGame.hearts[0]
    assert.ok(closestApproach(heart) <= heartGame.difficulty.orbitRadius * 0.45)
    const vx = heart.vx, vy = heart.vy
    updateGame(heartGame, 0.05)
    assert.equal(heart.vx, vx)
    assert.equal(heart.vy, vy)
  }
})
test('Heart spawns only below full HP and its eligible-time rule and speed are Stage independent', () => {
  const full = createGame()
  full.heartSpawnRemaining = 0
  updateGame(full, 0.01)
  assert.equal(full.hearts.length, 0)
  assert.equal(full.heartSpawnRemaining, 0)
  for (const stage of [1, 20, 1000]) {
    const game = atStage(stage)
    game.health = 2
    game.heartSpawnRemaining = 0
    updateGame(game, 0.001, valuesRandom([0.25, 0.8, 0.5]))
    const heart = game.hearts[0]
    assert.ok(Math.abs(Math.hypot(heart.vx, heart.vy) - HEART_SPEED) < 1e-10)
    assert.equal(game.heartSpawnRemaining, 13)
    updateGame(game, 0.05)
    assert.equal(game.hearts.length, 1)
    assert.equal(game.heartSpawnRemaining, 13)
  }
})
test('Heart heals one HP, is consumed immediately, and cannot exceed maximum HP', () => {
  const game = createGame()
  game.health = 1
  game.invulnerable = 0.3
  game.hearts.push(atPlayer(game, HEART_RADIUS))
  updateGame(game, 0.001)
  assert.equal(game.health, 2)
  assert.equal(game.hearts.length, 0)
  game.hearts.push(atPlayer(game, HEART_RADIUS), atPlayer(game, HEART_RADIUS))
  updateGame(game, 0.001)
  assert.equal(game.health, 3)
  assert.equal(game.hearts.length, 0)
})
test('lethal damage ends the game before a simultaneous Heart can revive it', () => {
  const game = createGame()
  game.health = 1
  game.hearts.push(atPlayer(game, HEART_RADIUS))
  hit(game)
  assert.equal(game.health, 0)
  assert.equal(game.phase, 'game-over')
})
test('objects spawn fully offscreen on varying aspect ratios and use outgoing despawn bounds', () => {
  for (const [width, height] of [[1920, 1080], [1920, 1200], [1024, 768], [390, 844]]) {
    const viewport = logicalViewport(width, height)
    for (let i = 0; i < 16; i++) {
      const game = createGame(viewport)
      game.spawnProgress = 1
      updateGame(game, 0.001, valuesRandom([0.1, 0.5, i / 16, 0.6, 0.5]))
      const meteor = game.meteors[0]
      assert.ok(Math.abs(meteor.x) - meteor.radius > viewport.width / 2 || Math.abs(meteor.y) - meteor.radius > viewport.height / 2)
    }
    const game = createGame(viewport)
    game.health = 2
    game.invulnerable = 1
    game.hearts.push({ x: viewport.width / 2 + HEART_RADIUS + 63, y: 0, vx: HEART_SPEED, vy: 0, radius: HEART_RADIUS })
    updateGame(game, 0.05)
    assert.equal(game.hearts.length, 0)
  }
})
test('resizing keeps incoming objects and preserves movement, Stage and difficulty', () => {
  const game = createGame(logicalViewport(1920, 1080))
  game.meteors.push({ kind: 'normal', x: 800, y: 0, vx: -150, vy: 0, radius: 17 })
  game.viewport = logicalViewport(800, 800)
  const d = game.difficulty
  updateGame(game, 0.05)
  assert.equal(game.meteors.length, 1)
  assert.ok(Math.abs(game.meteors[0].x - 792.5) < 1e-10)
  assert.equal(game.difficulty, d)
  assert.equal(game.stage, 1)
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
  key('keydown', 'Space', true); key('keydown')
  assert.equal(reversals, 1)
  key('keyup'); key('keydown')
  assert.equal(reversals, 2)
  window.dispatchEvent(new Event('blur'))
  key('keydown', 'Space', true)
  assert.equal(reversals, 2)
  key('keydown')
  assert.equal(reversals, 3)
  assert.equal(key('keydown', 'ArrowDown').defaultPrevented, false)
  document.dispatchEvent(new Event('visibilitychange'))
  key('keydown')
  assert.equal(reversals, 4)
  delete globalThis.window
  delete globalThis.document
})
