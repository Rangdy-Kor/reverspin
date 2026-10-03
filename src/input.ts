export function bindInput(reverse: () => void) {
  let spaceHeld = false
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.key !== ' ') return
    event.preventDefault()
    if (event.repeat || spaceHeld) return
    spaceHeld = true
    reverse()
  })
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.key === ' ') spaceHeld = false
  })
  window.addEventListener('blur', () => { spaceHeld = false })
  document.addEventListener('visibilitychange', () => { spaceHeld = false })
}
