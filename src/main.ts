import './style.css'
import { Game } from './game/Game'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Root app element not found.')
}

app.innerHTML = '<div class="game-shell"></div><div class="crosshair" aria-hidden="true"></div>'
const shell = app.querySelector<HTMLDivElement>('.game-shell')

if (!shell) {
  throw new Error('Game shell element not found.')
}

new Game(shell)
