import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame, updateGame, reverseDirection, stageDifficulty, difficultyProgression, sampleMeteorTarget } from '../src/game.ts'
import { createRenderer } from '../src/render.ts'

function seededRandom(seed = 17) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
}
const increment = stage => difficultyProgression(stage + 1) - difficultyProgression(stage)

test('difficulty slope rises toward Stage 11 then falls to a positive unbounded linear tail', () => {
  assert.equal(difficultyProgression(1), 0)
  assert.ok(increment(1) < 0.04)
  for (let stage = 1; stage < 10; stage++) assert.ok(increment(stage + 1) > increment(stage))
  assert.ok(Math.abs(increment(10) - increment(11)) < 1e-12)
  for (let stage = 11; stage < 40; stage++) assert.ok(increment(stage + 1) < increment(stage))
  for (const stage of [100, 1000, 1000000]) {
    assert.ok(difficultyProgression(stage + 1) > difficultyProgression(stage))
    assert.ok(Math.abs(increment(stage) - 0.002) < 1e-9)
  }
  for (const stage of [100, 10000, 1e100]) {
    const a = stageDifficulty(stage), b = stageDifficulty(stage * 2)
    for (const key of ['progression', 'angularVelocity', 'meteorBaseSpeed', 'meteorSpawnRate']) assert.ok(b[key] > a[key])
    assert.ok(b.orbitRadius < a.orbitRadius)
    assert.ok(b.meteorTargetRadius < a.meteorTargetRadius && b.meteorTargetRadius > 0)
  }
})

test('separate sensitivities keep midgame near old scale and every target disc positive', () => {
  const d = stageDifficulty(20)
  assert.ok(Math.abs(d.meteorBaseSpeed / (150 + 32 * Math.log(20)) - 1) < 0.05)
  assert.ok(Math.abs(d.meteorSpawnRate / (0.55 + 0.7 * Math.log(20)) - 1) < 0.05)
  assert.ok(stageDifficulty(1).meteorTargetRadius > 1.4 * 180)
  for (const stage of [1, 5, 11, 20, 1000, 1e100]) {
    const d = stageDifficulty(stage)
    assert.ok(d.orbitRadius > 0 && d.meteorTargetRadius > 0)
    assert.ok(Math.abs(d.normalWeight + d.heavyWeight + d.swiftWeight - 1) < 1e-12)
    if (stage < 1000) assert.ok(d.meteorTargetRadius / d.orbitRadius > 1, 'finite midgame retains misses')
  }
})

test('seeded target discs are uniform in area, symmetric and progressively more central', () => {
  let previousMean = Infinity
  for (const stage of [1, 5, 11, 20, 1000, 1000000]) {
    const d = stageDifficulty(stage), random = seededRandom()
    let sum = 0, squareSum = 0, xSum = 0, ySum = 0, insideHalf = 0
    const count = 20000
    for (let i = 0; i < count; i++) {
      const point = sampleMeteorTarget(d, random)
      const r = Math.hypot(point.x, point.y)
      assert.ok(r <= d.meteorTargetRadius)
      sum += r; squareSum += r * r; xSum += point.x; ySum += point.y
      if (r < d.meteorTargetRadius / 2) insideHalf++
    }
    const mean = sum / count
    assert.ok(mean < previousMean)
    assert.ok(Math.abs(mean / d.meteorTargetRadius - 2 / 3) < 0.01)
    assert.ok(Math.abs(squareSum / count / d.meteorTargetRadius ** 2 - 0.5) < 0.01)
    assert.ok(Math.abs(insideHalf / count - 0.25) < 0.015)
    assert.ok(Math.hypot(xSum / count, ySum / count) / d.meteorTargetRadius < 0.015)
    previousMean = mean
  }
})

test('actual seeded meteor paths miss more early and threaten the orbit more often later', t => {
  let previousCrossing = 0
  for (const stage of [1, 11, 20]) {
    const random = seededRandom(41)
    const oldRandom = seededRandom(53)
    let crossing = 0, oldCrossing = 0
    const count = 4000
    for (let i = 0; i < count; i++) {
      const game = createGame()
      game.stage = stage; game.elapsed = (stage - 1) * 10
      game.difficulty = stageDifficulty(stage); game.spawnProgress = 1
      updateGame(game, 0.001, random)
      const m = game.meteors[0]
      const distance = Math.abs(m.x * m.vy - m.y * m.vx) / Math.hypot(m.vx, m.vy)
      if (distance < game.difficulty.orbitRadius) crossing++
      // Original Stage-1 perpendicular line: independent baseline sample.
      const angle = oldRandom() * Math.PI * 2
      const spawnDistance = Math.min(433 / Math.abs(Math.cos(angle)), 433 / Math.abs(Math.sin(angle)))
      const offset = (oldRandom() * 2 - 1) * 1.4 * 180
      if (Math.abs(offset) / Math.sqrt(1 + (offset / spawnDistance) ** 2) < 180) oldCrossing++
    }
    const fraction = crossing / count
    t.diagnostic(`Stage ${stage}: orbit crossing ${(fraction * 100).toFixed(1)}%; old Stage 1 ${(oldCrossing / count * 100).toFixed(1)}%`)
    assert.ok(fraction > previousCrossing)
    if (stage === 1) {
      assert.ok(fraction > 0.3 && fraction < 0.7)
      assert.ok(crossing < oldCrossing, 'early paths are less threatening than the old central line')
    }
    assert.ok(fraction < 0.99)
    previousCrossing = fraction
  }
})

test('seeded gameplay and inputs reproduce sessions independently of cosmetic rendering', () => {
  const a = createGame(), b = createGame()
  const randomA = seededRandom(97), randomB = seededRandom(97)
  const context = {
    setTransform() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, fillRect() {},
    moveTo() {}, lineTo() {}, save() {}, restore() {}, translate() {}, rotate() {}, drawImage() {},
  }
  const image = { naturalWidth: 100, naturalHeight: 100 }
  const render = createRenderer({ getContext: () => context, width: 0, height: 0 }, {
    rocket: image, normal: image, heavy: image, swift: image, heart: image,
  })
  for (let i = 0; i < 600; i++) {
    a.invulnerable = b.invulnerable = 1
    a.health = b.health = 2
    if (i % 31 === 0) { reverseDirection(a); reverseDirection(b) }
    updateGame(a, 0.05, randomA); updateGame(b, 0.05, randomB)
    render(b, 800, 800, i % 2 ? 1 : 2)
    assert.deepEqual(a, b)
  }
  let calls = 0
  const game = createGame(); game.spawnProgress = 1
  updateGame(game, 0.001, () => { calls++; return 0.5 })
  assert.equal(calls, 5, 'meteor RNG: type, speed, spawn angle, target angle, target area')
  assert.equal(game.meteors.length, 1)
})
