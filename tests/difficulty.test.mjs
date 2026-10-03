import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame, updateGame, reverseDirection, stageDifficulty, difficultyProgression, sampleMeteorTarget } from '../src/game.ts'
import { createRenderer } from '../src/render.ts'
import { createOrbit, createHistory } from '../src/trajectory.ts'
import { logicalViewport } from '../src/viewport.ts'

function seededRandom(seed = 17) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
}
const increment = stage => difficultyProgression(stage + 1) - difficultyProgression(stage)

test('every Stage through 1000 progresses monotonically and preserves normalized type probabilities', () => {
  let previous = stageDifficulty(1)
  for (let stage = 2; stage <= 1000; stage++) {
    const current = stageDifficulty(stage)
    for (const key of ['progression', 'angularVelocity', 'meteorBaseSpeed', 'meteorSpawnRate']) {
      assert.ok(current[key] > previous[key], `${key}: Stage ${stage}`)
    }
    assert.ok(current.orbitRadius < previous.orbitRadius)
    assert.ok(current.meteorTargetRadius < previous.meteorTargetRadius)
    const v = Math.tanh(0.232 * current.progression ** 1.887)
    assert.ok(v >= 0 && v < 1)
    assert.ok(Math.abs(current.normalWeight + current.heavyWeight + current.swiftWeight - 1) < 1e-12)
    previous = current
  }
})

test('specified sigmoid rises peak near Stage 20 and retain a positive long-session tail', () => {
  assert.equal(difficultyProgression(1), 0)
  assert.ok(increment(1) < 0.02)
  assert.ok(increment(5) > increment(1))
  assert.ok(increment(10) > increment(5))
  assert.ok(increment(15) > increment(10))
  const stages = Array.from({ length: 99 }, (_, i) => i + 1)
  const peak = stages.reduce((a, b) => increment(a) > increment(b) ? a : b)
  assert.equal(peak, 18, 'the specified sum peaks at 18→19; do not retune to a different peak')
  assert.ok(increment(30) < increment(20))
  assert.ok(increment(50) < increment(30))
  assert.ok(increment(100) < increment(50))
  for (const stage of [100, 500, 1000, 1000000]) {
    assert.ok(difficultyProgression(stage + 1) > difficultyProgression(stage))
    if (stage >= 500) assert.ok(Math.abs(increment(stage) - 0.0014) < 1e-9)
  }
  for (const stage of [100, 10000, 1e100]) {
    const a = stageDifficulty(stage), b = stageDifficulty(stage * 2)
    for (const value of Object.values(a)) assert.ok(Number.isFinite(value))
    for (const key of ['progression', 'angularVelocity', 'meteorBaseSpeed', 'meteorSpawnRate']) assert.ok(b[key] > a[key])
    assert.ok(b.orbitRadius < a.orbitRadius)
    assert.ok(b.meteorTargetRadius < a.meteorTargetRadius && b.meteorTargetRadius > 0)
  }
})

test('specified Stage 1, 25, 50, 100 and 500 parameter benchmarks remain stable', () => {
  const references = [
    [1, 0, 180, 3.4, 150, 0.55, 0.8, 0.15, 0.05, 600],
    [25, 1.037312542, 103.143826302, 5.857524647, 260.640997156, 0.984302117, 0.739098331, 0.174360668, 0.086541001, 200.788632371],
    [50, 1.510112734, 87.879586899, 6.813580551, 301.506255382, 1.242147611, 0.683492818, 0.196602873, 0.119904309, 147.690432364],
    [100, 1.733188363, 82.702299600, 7.250942205, 320.025330101, 1.371212763, 0.656256383, 0.207497447, 0.136246170, 131.119136358],
    [500, 2.296477662, 72.900632852, 8.326136075, 365.183419450, 1.714464675, 0.598648448, 0.230540621, 0.170810931, 102.000481187],
  ]
  const keys = ['progression', 'orbitRadius', 'angularVelocity', 'meteorBaseSpeed', 'meteorSpawnRate', 'normalWeight', 'heavyWeight', 'swiftWeight', 'meteorTargetRadius']
  for (const [stage, ...values] of references) {
    const d = stageDifficulty(stage)
    keys.forEach((key, i) => assert.ok(Math.abs(d[key] - values[i]) < 1e-8, `Stage ${stage}: ${key}`))
  }
  assert.ok(stageDifficulty(1).meteorTargetRadius > 1.4 * 180)
  for (const stage of [1, 5, 11, 20, 1000, 1e100]) {
    const d = stageDifficulty(stage)
    assert.ok(d.orbitRadius > 0 && d.meteorTargetRadius > 0)
    assert.ok(Math.abs(d.normalWeight + d.heavyWeight + d.swiftWeight - 1) < 1e-12)
    const variety = Math.tanh(0.232 * d.progression ** 1.887)
    assert.ok(variety >= 0 && variety <= 1)
    // IEEE-754 tanh rounds to 1 at extreme inputs, without a gameplay clamp.
    if (stage <= 1000) assert.ok(variety < 1)
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

function pathStatistics(stage, viewport = { width: 800, height: 800 }, count = 30000) {
  const random = seededRandom(41)
  const game = createGame(viewport)
  game.stage = stage; game.elapsed = (stage - 1) * 10
  game.difficulty = stageDifficulty(stage)
  game.player = createOrbit(game.difficulty.orbitRadius)
  game.trajectoryHistory = createHistory(game.player)
  let crossing = 0, outgoing = 0
  for (let i = 0; i < count; i++) {
    game.meteors.length = 0; game.spawnProgress = 1
    updateGame(game, 0.000001, random)
    const m = game.meteors[0]
    const inward = m.x * m.vx + m.y * m.vy < 0
    const distance = Math.abs(m.x * m.vy - m.y * m.vx) / Math.hypot(m.vx, m.vy)
    // Only a forward-moving path can threaten the orbit. An extended line behind
    // an outward meteor must not inflate the measured crossing probability.
    if (!inward) outgoing++
    else if (distance < game.difficulty.orbitRadius) crossing++
  }
  return { crossing: crossing / count, outgoing: outgoing / count }
}

test('actual fixed-seed paths measure increasing crossings without forcing target percentages', t => {
  let previousCrossing = 0
  for (const stage of [1, 5, 10, 15, 20, 25, 30, 40, 50, 100, 500]) {
    const stats = pathStatistics(stage)
    const fraction = stats.crossing
    const d = stageDifficulty(stage)
    t.diagnostic(JSON.stringify({ stage, D: d.progression, deltaD: increment(stage), radius: d.orbitRadius,
      angularVelocity: d.angularVelocity, meteorSpeed: d.meteorBaseSpeed, spawnRate: d.meteorSpawnRate,
      normalPercent: d.normalWeight * 100, heavyPercent: d.heavyWeight * 100, swiftPercent: d.swiftWeight * 100,
      targetRadius: d.meteorTargetRadius, crossingPercent: fraction * 100,
      crossingPerSecond: fraction * d.meteorSpawnRate, outgoingPercent: stats.outgoing * 100 }))
    assert.ok(fraction > previousCrossing)
    if (stage === 1) assert.ok(fraction > 0.35 && fraction < 0.45, 'initial paths retain substantial misses')
    assert.ok(fraction < 0.99)
    previousCrossing = fraction
  }
})

test('widescreen paths retain misses without changing RNG count or spawn geometry', t => {
  for (const stage of [1, 10, 22, 50]) {
    const stats = pathStatistics(stage, logicalViewport(1920, 1080))
    assert.ok(stats.crossing > 0.3 && stats.crossing < 0.8)
    t.diagnostic(`16:9 Stage ${stage}: ${(stats.crossing * 100).toFixed(2)}% orbit crossing`)
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
