import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
import { createGame, reverseDirection, updateGame, score } from '../src/game.ts'
import { logicalViewport } from '../src/viewport.ts'

// Execute the actual DOM/loop/input wiring with a controllable browser clock.
// Only Canvas, asset loading and browser surfaces are stubbed; simulation is real.
async function app() {
  const elements = new Map()
  class Element extends EventTarget {
    hidden = false
    attributes = new Map()
    setAttribute(name, value) { this.attributes.set(name, value) }
    getBoundingClientRect() { return { width: 800, height: 800 } }
    focus() {}
    blur() {}
  }
  for (const selector of ['#app', 'canvas', '#score', '#stage', '#health', '#controls', '#overlay', '#paused', '#final-score', '#restart', '#restart-hint']) {
    elements.set(selector, new Element())
  }
  elements.get('#overlay').hidden = true
  const document = new EventTarget()
  document.hidden = false
  document.hasFocus = () => true
  document.querySelector = selector => elements.get(selector)
  const window = new EventTarget()
  window.devicePixelRatio = 1
  let now = 0, nextFrame, game
  const context = vm.createContext({
    document, window,
    performance: { now: () => now },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame: callback => { nextFrame = callback },
    createGame: viewport => { game = createGame(viewport); return game },
    reverseDirection, updateGame, score, logicalViewport,
    createRenderer: () => () => {}, loadSprites: async () => ({}),
  })
  const source = readFileSync(new URL('../src/input.ts', import.meta.url), 'utf8').replace('export function', 'function')
    + readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '')
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText
  vm.runInContext(javascript, context)
  await Promise.resolve()
  function frame(time) { now = time; nextFrame(time) }
  function key(type, repeat = false) {
    const event = new Event(type, { cancelable: true })
    Object.assign(event, { code: 'Space', key: ' ', repeat })
    window.dispatchEvent(event)
    return event
  }
  function press() { key('keydown'); key('keyup') }
  function die(time) {
    game.health = 1
    game.meteors.push({ kind: 'normal', radius: 17, x: Math.cos(game.player.angle) * game.player.radius, y: Math.sin(game.player.angle) * game.player.radius, vx: 0, vy: 0 })
    frame(time)
    assert.equal(game.phase, 'game-over')
  }
  return { elements, frame, key, press, die, get game() { return game } }
}

test('Game Over unlocks Space and its hint together at 800ms; ignored presses never replay across sessions', async () => {
  const a = await app()
  a.frame(0)
  const initialDirection = a.game.player.direction
  a.press()
  assert.equal(a.game.player.direction, -initialDirection, 'playing Space remains immediate')
  a.die(10)
  const dead = a.game
  const hint = a.elements.get('#restart-hint')
  assert.equal(a.elements.get('#overlay').hidden, false, 'Game Over is displayed immediately')
  assert.equal(hint.attributes.get('aria-hidden'), 'true')
  a.press()
  for (const time of [11, 100, 400, 809.999]) {
    a.frame(time)
    a.press()
    assert.equal(a.game, dead)
    assert.equal(hint.attributes.get('aria-hidden'), 'true')
  }
  a.key('keydown') // Hold an ignored press through the unlock boundary.
  a.frame(810)
  assert.equal(hint.attributes.get('aria-hidden'), 'false')
  assert.equal(a.game, dead, 'unlock does not replay ignored input')
  a.key('keydown', true)
  a.key('keydown')
  assert.equal(a.game, dead, 'repeat and unreleased presses cannot restart')
  a.key('keyup')
  a.press()
  assert.notEqual(a.game, dead)
  assert.equal(a.game.phase, 'playing')
  assert.equal(hint.attributes.get('aria-hidden'), 'true')
  a.frame(900)
  a.die(901)
  const secondDead = a.game
  a.press()
  a.frame(1700.999)
  a.press()
  assert.equal(a.game, secondDead)
  assert.equal(hint.attributes.get('aria-hidden'), 'true')
  a.frame(1701)
  assert.equal(hint.attributes.get('aria-hidden'), 'false')
  a.press()
  assert.notEqual(a.game, secondDead)
})

test('restart button still works immediately during the Space grace period', async () => {
  const a = await app()
  a.frame(0)
  a.die(1)
  const dead = a.game
  a.elements.get('#restart').dispatchEvent(new Event('click'))
  assert.notEqual(a.game, dead)
  assert.equal(a.game.phase, 'playing')
  assert.equal(a.game.health, 3)
  a.frame(2)
  assert.equal(a.elements.get('#overlay').hidden, true)
  a.die(3)
  a.press()
  assert.equal(a.game.phase, 'game-over', 'button restart also resets the next grace period')
})
