import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame } from '../src/game.ts'
import { createRenderer } from '../src/render.ts'
import { logicalViewport } from '../src/viewport.ts'

test('rectangular Canvas uses uniform world scaling, centered orbit and DPR backing resolution', () => {
  const transforms = [], circles = []
  const context = {
    setTransform: (...args) => transforms.push(args), arc: (...args) => circles.push(args),
    beginPath() {}, fill() {}, stroke() {}, fillRect() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {},
  }
  const canvas = { width: 0, height: 0, getContext: () => context }
  const render = createRenderer(canvas)
  for (const [width, height, dpr] of [[1920, 1080, 1], [1920, 1200, 2], [1024, 768, 1.25], [390, 844, 3]]) {
    const game = createGame(logicalViewport(width, height))
    const before = structuredClone(game)
    render(game, width, height, dpr)
    assert.deepEqual(game, before)
    assert.equal(canvas.width, Math.round(width * dpr))
    assert.equal(canvas.height, Math.round(height * dpr))
    const transform = transforms.at(-1)
    assert.equal(transform[0], transform[3])
    assert.equal(transform[4], canvas.width / 2)
    assert.equal(transform[5], canvas.height / 2)
    assert.ok(!circles.some(([x, y, r]) => x === 0 && y === 0 && r === 180), 'full orbit guide is absent')
    assert.ok(circles.some(([x, y, r]) => Math.abs(x) < 1e-10 && y === -180 && r === 12), 'player uses actual radius')
  }
  const game = createGame(logicalViewport(1920, 1080))
  render(game, 1920, 1080, 1)
  render(game, 1920, 1080, 2)
  assert.equal(canvas.width, 3840)
  assert.equal(canvas.height, 2160)
  assert.equal(game.difficulty.orbitRadius, 180)
})
