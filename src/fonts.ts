/**
 * The one font the game uses for every piece of text (HUD, damage numbers,
 * weapon wheel and in-world labels). It is bundled with the game
 * (@fontsource/bebas-neue), so it needs no network. It has a single (regular)
 * weight; the fallbacks only show if it somehow fails to load.
 */
export const UI_FONT_FAMILY =
  '"Bebas Neue", Impact, "Arial Narrow", sans-serif';

/** Resolves once the font is ready to draw with (also for canvas text). */
export function loadUiFont(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) {
    return Promise.resolve();
  }

  return document.fonts.load('20px "Bebas Neue"').then(
    () => undefined,
    () => undefined,
  );
}
