import './style.css'
import { createGame, reverseDirection, updateGame, score } from './game'
import { bindInput } from './input'
import { createRenderer } from './render'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main aria-label="Reverspin">
    <div class="arena">
      <canvas aria-label="중앙을 공전하는 플레이어와 운석 회피 게임"></canvas>
      <section class="hud" aria-label="게임 상태">
        <div><span>점수</span><strong id="score">0</strong></div>
        <div><span>체력</span><strong id="health">● ● ●</strong></div>
      </section>
      <div id="overlay" class="overlay" hidden>
        <div class="panel"><h2>게임 오버</h2>
          <p>최종 점수 <strong id="final-score">0</strong></p>
          <button id="restart" type="button">다시 시작</button><p class="hint">Space로도 다시 시작</p></div>
      </div>
      <div id="paused" class="overlay pause" hidden>일시 정지</div>
      <p id="controls" class="controls"><kbd>Space</kbd> 방향 반전</p>
    </div>
  </main>`

const canvas = document.querySelector<HTMLCanvasElement>('canvas')!
const scoreElement = document.querySelector<HTMLElement>('#score')!
const healthElement = document.querySelector<HTMLElement>('#health')!
const controls = document.querySelector<HTMLElement>('#controls')!
const overlay = document.querySelector<HTMLElement>('#overlay')!
const pausedElement = document.querySelector<HTMLElement>('#paused')!
const finalScore = document.querySelector<HTMLElement>('#final-score')!
const restartButton = document.querySelector<HTMLButtonElement>('#restart')!
const render = createRenderer(canvas)
let game = createGame()
let previousTime: number | undefined
let active = !document.hidden && document.hasFocus()
let lastHud = ''
let controlsDismissed = false

function restart() {
  game = createGame()
  previousTime = undefined
  controlsDismissed = false
  restartButton.blur()
}
bindInput(() => {
  if (!active) return
  if (game.phase === 'game-over') restart()
  else {
    reverseDirection(game)
    controlsDismissed = true
  }
})
restartButton.addEventListener('click', restart)

function updateActivity() {
  active = !document.hidden && document.hasFocus()
  previousTime = undefined
  pausedElement.hidden = active || game.phase === 'game-over'
}
window.addEventListener('blur', updateActivity)
window.addEventListener('focus', updateActivity)
document.addEventListener('visibilitychange', updateActivity)

function updateHud() {
  const currentScore = score(game)
  const showControls = !controlsDismissed && game.elapsed < 4 && game.phase === 'playing' && active
  const hud = `${currentScore}/${game.health}/${game.phase}/${active}/${showControls}`
  if (hud === lastHud) return
  lastHud = hud
  scoreElement.textContent = String(currentScore)
  healthElement.textContent = '● '.repeat(game.health) + '○ '.repeat(3 - game.health)
  healthElement.setAttribute('aria-label', `체력 ${game.health} / 3`)
  controls.hidden = !showControls
  overlay.hidden = game.phase !== 'game-over'
  pausedElement.hidden = active || game.phase === 'game-over'
  if (game.phase === 'game-over') {
    finalScore.textContent = String(currentScore)
    restartButton.focus({ preventScroll: true })
  }
}
function frame(time: number) {
  // Discard excess time after a stall rather than jumping ahead on return.
  const delta = previousTime === undefined ? 0 : Math.min((time - previousTime) / 1000, 0.05)
  previousTime = time
  if (active) updateGame(game, delta)
  render(game)
  updateHud()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
