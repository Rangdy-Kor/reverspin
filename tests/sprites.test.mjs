import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSprites, SPRITE_URLS, SPRITE_SIZES } from '../src/sprites.ts'
import { createRenderer } from '../src/render.ts'
import { createGame, reverseDirection } from '../src/game.ts'
import { beginRadiusTransition, advanceOrbit } from '../src/trajectory.ts'

test('loader waits for all five images and retains successful sprites when one fails', async () => {
  const images = []
  const loading = loadSprites(() => {
    const image = { naturalWidth: 200, naturalHeight: 400 }
    images.push(image)
    return image
  })
  assert.deepEqual(images.map(image => image.src), Object.values(SPRITE_URLS))
  let completed = false
  loading.then(() => { completed = true })
  for (const image of images.slice(0, 3)) image.onload()
  images[3].onerror()
  await Promise.resolve()
  assert.equal(completed, false)
  images[4].onload()
  const sprites = await loading
  assert.equal(sprites.rocket, images[0])
  assert.equal(sprites.heavy, images[1])
  assert.equal(sprites.normal, images[2])
  assert.equal(sprites.swift, undefined)
  assert.equal(sprites.heart, images[4])
})

function recordingRenderer(sprites) {
  const draws = [], circles = [], translations = [], rotations = []
  const stack = []
  const context = {
    globalAlpha: 1,
    save() { stack.push(this.globalAlpha) },
    restore() { this.globalAlpha = stack.pop() },
    translate: (...args) => translations.push(args),
    rotate: angle => rotations.push(angle),
    drawImage(...args) { draws.push({ args, alpha: this.globalAlpha }) },
    arc: (...args) => circles.push(args),
    setTransform() {}, beginPath() {}, fill() {}, stroke() {}, fillRect() {},
    moveTo() {}, lineTo() {}, bezierCurveTo() {},
  }
  const canvas = { width: 0, height: 0, getContext: () => context }
  return { render: createRenderer(canvas, sprites), draws, circles, translations, rotations, context }
}
const image = (width, height) => ({ naturalWidth: width, naturalHeight: height })

test('rocket stays centered on the real spiral, preserves aspect ratio and flips tangent immediately', () => {
  const rocket = image(190, 338)
  const record = recordingRenderer({ rocket })
  const game = createGame()
  beginRadiusTransition(game.player, 155)
  advanceOrbit(game.player, game.trajectoryHistory, Math.PI / 2)
  const before = structuredClone(game)
  record.render(game, 1200, 800, 2)
  assert.deepEqual(game, before)
  const [sprite, x, y, width, height] = record.draws[0].args
  assert.equal(sprite, rocket)
  assert.equal(height, 24 * SPRITE_SIZES.rocketDiameterScale)
  assert.ok(Math.abs(width / height - 190 / 338) < 1e-12)
  assert.equal(x, -width / 2)
  assert.equal(y, -height / 2)
  assert.deepEqual(record.translations[0], [Math.cos(game.player.angle) * game.player.radius, Math.sin(game.player.angle) * game.player.radius])
  const rotation = record.rotations[0]
  assert.equal(rotation, game.player.angle + Math.PI)
  reverseDirection(game)
  record.render(game, 1200, 800, 2)
  assert.ok(Math.abs(record.rotations[1] - rotation + Math.PI) < 1e-12)
  assert.equal(record.context.imageSmoothingEnabled, true)
  const reversed = structuredClone(game)
  for (const [width, height, dpr] of [[1920, 1080, 1], [1024, 768, 1.25], [390, 844, 3]]) {
    record.render(game, width, height, dpr)
    assert.deepEqual(record.draws.at(-1).args.slice(1), record.draws[0].args.slice(1), 'DPR and resize never alter logical sprite size')
    assert.deepEqual(game, reversed)
  }
})

test('meteor and Heart mapping, radius-based size hierarchy, blink and partial fallback leave gameplay intact', () => {
  const sprites = { heavy: image(220, 216), normal: image(187, 183), swift: image(116, 147), heart: image(153, 143), rocket: image(190, 338) }
  const record = recordingRenderer(sprites)
  const game = createGame()
  for (const [kind, radius] of [['heavy', 30], ['normal', 17], ['swift', 9]]) {
    game.meteors.push({ kind, radius, x: 100, y: 100, vx: -50, vy: 30 })
  }
  game.hearts.push({ x: 50, y: -50, radius: 12, vx: 0, vy: 45 })
  game.invulnerable = 0.4
  const before = structuredClone(game)
  record.render(game, 800, 800, 1)
  assert.deepEqual(game, before)
  const sizes = record.draws.map(({ args: [sprite, x, y, w, h] }, i) => {
    assert.equal(sprite, Object.values(sprites)[i])
    assert.equal(x, -w / 2)
    assert.equal(y, -h / 2)
    assert.ok(Math.abs(w / h - sprite.naturalWidth / sprite.naturalHeight) < 1e-12)
    return Math.max(w, h)
  })
  assert.ok(sizes[0] > sizes[1] && sizes[1] > sizes[2])
  assert.equal(record.draws.at(-1).alpha, 0.35)
  assert.equal(record.context.globalAlpha, 1)
  assert.deepEqual(record.translations[3], [50, -50])
  const fallback = recordingRenderer({ rocket: sprites.rocket })
  fallback.render(game, 800, 800, 1)
  assert.equal(fallback.draws.length, 1)
  assert.ok(fallback.circles.some(([x, y, r]) => x === 100 && y === 100 && r === 30))
})
