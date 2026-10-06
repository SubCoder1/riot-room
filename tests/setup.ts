// jsdom has no 2D canvas; the training dummy's HP label only draws when a
// context exists, so a null context is fine (and silences jsdom's warning).
HTMLCanvasElement.prototype.getContext = (() => null) as never;
