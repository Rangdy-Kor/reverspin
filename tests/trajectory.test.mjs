import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame, updateGame, reverseDirection, stageDifficulty } from '../src/game.ts'
import { advanceOrbit, beginRadiusTransition, createHistory, createOrbit, radiusAtDistance, trajectoryAlpha, TRANSITION_ANGLE, FORWARD_VISIBLE_ANGLE } from '../src/trajectory.ts'

function advance(game, seconds, frame = 1 / 60) {
  for (let i = 0; i < Math.round(seconds / frame); i++) updateGame(game, frame, () => 0.5)
}

test('Stage radius change starts from the actual old orbit without teleporting', () => {
  const game = createGame()
  game.elapsed = 9.9995
  updateGame(game, 0.001)
  assert.equal(game.stage, 2)
  assert.equal(game.player.transition.fromRadius, 180)
  assert.equal(game.player.transition.toRadius, stageDifficulty(2).orbitRadius)
  assert.ok(game.player.radius > 179.99)
  assert.ok(game.player.radius > game.difficulty.orbitRadius)
  const before = game.player.radius
  advance(game, 0.3)
  assert.ok(game.player.radius < before && game.player.radius > game.difficulty.orbitRadius)
  advance(game, 0.7)
  assert.equal(game.player.radius, game.difficulty.orbitRadius)
  assert.equal(game.player.transition.traveledAngle, TRANSITION_ANGLE)
})
test('radius transition uses accumulated absolute angular distance, including reversal', () => {
  const game = createGame()
  beginRadiusTransition(game.player, 155)
  advanceOrbit(game.player, game.trajectoryHistory, TRANSITION_ANGLE / 4)
  const firstRadius = game.player.radius
  const samples = structuredClone(game.trajectoryHistory)
  reverseDirection(game)
  assert.deepEqual(game.trajectoryHistory, samples, 'reversal retains actual past path')
  advanceOrbit(game.player, game.trajectoryHistory, TRANSITION_ANGLE / 4)
  assert.equal(game.player.transition.traveledAngle, TRANSITION_ANGLE / 2)
  assert.equal(game.player.radius, (180 + 155) / 2)
  assert.ok(game.player.radius < firstRadius)
  advanceOrbit(game.player, game.trajectoryHistory, TRANSITION_ANGLE / 2)
  assert.equal(game.player.radius, 155)
})
test('different speeds and frame rates reach the same radius at the same traveled angle', () => {
  const first = createOrbit(180), second = createOrbit(180)
  const firstHistory = createHistory(first), secondHistory = createHistory(second)
  beginRadiusTransition(first, 155)
  beginRadiusTransition(second, 155)
  for (let i = 0; i < 40; i++) advanceOrbit(first, firstHistory, 0.025)
  for (let i = 0; i < 200; i++) advanceOrbit(second, secondHistory, 0.005)
  assert.ok(Math.abs(first.radius - second.radius) < 1e-10)
  assert.ok(Math.abs(first.transition.traveledAngle - 1) < 1e-10)
})
test('future radius samples match simulation on an inward spiral and settle onto the new arc', () => {
  const player = createOrbit(180)
  beginRadiusTransition(player, 155)
  advanceOrbit(player, createHistory(player), 0.4)
  let previous = player.radius
  for (const ahead of [0.1, 0.5, 1, 2, Math.PI, Math.PI + 1]) {
    const predictedRadius = radiusAtDistance(player, ahead)
    assert.ok(predictedRadius <= previous)
    const predictedAngle = player.angle + player.direction * ahead
    const moved = structuredClone(player)
    advanceOrbit(moved, createHistory(moved), ahead)
    assert.equal(moved.radius, predictedRadius)
    assert.ok(Math.abs(Math.cos(moved.angle) - Math.cos(predictedAngle)) < 1e-10)
    previous = predictedRadius
  }
  assert.equal(radiusAtDistance(player, Math.PI + 1), 155)
})
test('without transition, future samples stay on one circular arc; reversal changes their direction', () => {
  const game = createGame()
  for (const ahead of [0, 0.3, 1, FORWARD_VISIBLE_ANGLE]) assert.equal(radiusAtDistance(game.player, ahead), 180)
  const startAngle = game.player.angle
  const clockwiseAngle = startAngle + game.player.direction * 0.3
  reverseDirection(game)
  const counterclockwiseAngle = startAngle + game.player.direction * 0.3
  assert.ok(clockwiseAngle > startAngle)
  assert.ok(counterclockwiseAngle < startAngle)
  const moved = structuredClone(game.player)
  advanceOrbit(moved, createHistory(moved), 0.3)
  assert.equal(moved.angle, counterclockwiseAngle)
})
test('smooth fade has a bright center and a zero-alpha endpoint', () => {
  assert.equal(trajectoryAlpha(0, 1), 1)
  assert.equal(trajectoryAlpha(0.5, 1), 0.5)
  assert.equal(trajectoryAlpha(1, 1), 0)
  assert.equal(trajectoryAlpha(2, 1), 0)
  let previous = 1
  for (let i = 1; i <= 100; i++) {
    const alpha = trajectoryAlpha(i / 100, 1)
    assert.ok(alpha < previous)
    previous = alpha
  }
})
test('history samples retain the actual spiral and reuse a bounded buffer', () => {
  const player = createOrbit(180), history = createHistory(player)
  const pointReferences = [...history.points]
  beginRadiusTransition(player, 155)
  for (let i = 0; i < 40; i++) advanceOrbit(player, history, 0.025)
  for (let i = 0; i < history.count; i++) {
    const point = history.points[i]
    const stationary = createOrbit(180)
    beginRadiusTransition(stationary, 155)
    const expectedRadius = radiusAtDistance(stationary, point.distance)
    assert.ok(Math.abs(Math.hypot(point.x, point.y) - expectedRadius) < 1e-10)
  }
  for (let i = 0; i < 1000; i++) advanceOrbit(player, history, 0.025)
  assert.equal(history.count, history.points.length)
  for (let i = 0; i < history.points.length; i++) assert.equal(history.points[i], pointReferences[i])
})
test('collision and Heart pickup use the transitional actual position', () => {
  const game = createGame()
  game.elapsed = 9.9995
  updateGame(game, 0.001)
  const x = Math.cos(game.player.angle) * game.player.radius
  const y = Math.sin(game.player.angle) * game.player.radius
  game.meteors.push({ kind: 'swift', x, y, vx: 0, vy: 0, radius: 9 })
  updateGame(game, 0.001)
  assert.equal(game.health, 2)
  game.hearts.push({ x: Math.cos(game.player.angle) * game.player.radius, y: Math.sin(game.player.angle) * game.player.radius, vx: 0, vy: 0, radius: 12 })
  updateGame(game, 0.001)
  assert.equal(game.health, 3)
  assert.equal(game.hearts.length, 0)
})
test('retargeting an unfinished transition starts from the current radius', () => {
  const player = createOrbit(180), history = createHistory(player)
  beginRadiusTransition(player, 155)
  advanceOrbit(player, history, 1)
  const radius = player.radius
  beginRadiusTransition(player, 141)
  assert.equal(radiusAtDistance(player), radius)
  assert.equal(player.radius, radius)
  advanceOrbit(player, history, Math.PI)
  assert.equal(player.radius, 141)
  beginRadiusTransition(player, 1e-20)
  advanceOrbit(player, history, Math.PI)
  assert.equal(player.radius, 1e-20, 'finite transition reaches its exact target without a radius floor')
})
