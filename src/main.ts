import "@fontsource/bebas-neue/400.css";
import "./style.css";
import { loadUiFont } from "./fonts";
import { Game } from "./game/Game";
import { LoadingScreen } from "./ui/LoadingScreen";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Root app element not found.");
}

app.innerHTML =
  '<div class="game-shell"></div><div class="crosshair" aria-hidden="true"></div>';
const shell = app.querySelector<HTMLDivElement>(".game-shell");

if (!shell) {
  throw new Error("Game shell element not found.");
}

const loading = new LoadingScreen(document.body);

/** Lets the browser paint (so the loading screen shows) before heavy work. */
const paint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

// Start once the font is ready, so text drawn onto canvases (the in-world
// labels) uses it from the first frame.
void (async () => {
  try {
    loading.stage("Building the arena", 0);
    await loadUiFont();
    await paint();

    const game = new Game(shell, (label, done) => loading.stage(label, done));

    await game.ready;
    loading.finish();
  } catch (error) {
    console.error(error);
    loading.fail("Failed to start. Reload to try again.");
  }
})();
