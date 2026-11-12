# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla Tetris implementation: HTML5 Canvas + CSS + plain JavaScript (ES6+). No dependencies, no build step, no package.json, no test suite.

## Running the game

Open `index.html` directly in a browser, or serve it locally (needed if testing anything that requires an HTTP origin):

```bash
python3 -m http.server 8000
# or
npx serve .
```

There is no build/lint/test command — this repo has none configured.

## Architecture

Three files, no modules, everything global in `game.js`:

- `index.html` — DOM shell: `#board` canvas (300×600, 10×20 grid at `BLOCK=30`px/cell), `#next-canvas` for the next-piece preview, HUD spans (`#score`, `#lines`, `#level`), and a shared `#overlay` div reused for both PAUSE and GAME OVER states.
- `style.css` — dark/retro arcade theme; no build step, plain CSS.
- `game.js` — all game logic, organized around a `requestAnimationFrame` loop:
  - **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a piece-color index `1–7`.
  - **Pieces**: `PIECES` are square matrices; `rotateCW` rotates via transpose + row-reverse. `tryRotate` applies basic wall kicks (tries offsets `[0, -1, 1, -2, 2]` columns before giving up on a rotation).
  - **Collision**: `collide(shape, ox, oy)` checks bounds and overlap against the locked `board`; used for movement, rotation, and ghost-piece projection.
  - **Game loop**: `loop(ts)` accumulates elapsed time in `dropAccum` and advances the piece one row once `dropAccum >= dropInterval`, otherwise calls `lockPiece()`.
  - **Locking/clearing**: `lockPiece()` → `merge()` writes the piece into `board`, then `clearLines()` removes full rows bottom-up and unshifts empty rows at the top, updating score/level.
  - **Scoring/leveling**: `LINE_SCORES = [0, 100, 300, 500, 800]` × `level`; hard drop adds 2 pts/cell dropped, soft drop adds 1 pt/row. Level increments every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)` ms.
  - **Ghost piece**: `ghostY()` projects the current piece straight down against `collide`; drawn at `globalAlpha = 0.2`.
  - All game state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, timing vars) lives in module-level `let` bindings reset by `init()`.

Input is a single `keydown` listener switching on `e.code` (arrows move/rotate/soft-drop, `Space` hard-drops, `P` toggles pause via `togglePause()`). `spawn()` moves `next` into `current`, generates a new `next`, and triggers `endGame()` if the new piece immediately collides.

## Tunable constants (in `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).
