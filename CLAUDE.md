# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based 3D table tennis game built on **three.js (0.160.0, loaded via importmap from unpkg)**. It is a **pure static site** — no build step, no bundler, no package.json. Open `index.html` in a web server and it runs.

Deployment target is Vercel (`.vercel/project.json` links to project `table-tennis`).

## Commands

There is no build/test/lint pipeline. To work on it:

```bash
# Serve locally (any static server works; matches what auto_test.py expects)
python3 -m http.server 8080
# → http://localhost:8080
```

Optional Playwright smoke test (uses `.venv`):
```bash
.venv/bin/python auto_test.py     # opens game, takes screenshots into test_videos/, records video
```

Deploy:
```bash
vercel              # preview
vercel --prod       # production
```

## Architecture

Single-page app. `index.html` defines all menu/HUD DOM, loads `js/main.js` as a module.

`App` (js/main.js) wires everything together and owns the `requestAnimationFrame` loop. Each frame: `game.update(dt) → ui.update(dt) → sceneManager.render()`. `dt` is capped at 50ms.

### Two clear layers

- **`js/core/`** — game logic, no three.js scene objects.
  - `Game.js` — central orchestrator. Owns state machine (`GameState`: MENU/SERVING/RALLY/POINT_END/PAUSED/GAME_OVER), score, serve rotation, paddle-hit detection, opponent-hit dispatch. Exposes callbacks (`onScoreChange`, `onStateChange`, `onMessage`, `onServeChange`, `onShotInfo`) that `UIManager` subscribes to.
  - `Physics.js` — fixed-timestep (1/120s accumulator) ball simulation: gravity, quadratic air drag, Magnus from spin, table/net/floor collision. Exports table dimensions (`TABLE_LENGTH/WIDTH/HEIGHT`, `NET_HEIGHT`). `calculateHit()` produces outgoing velocity+spin from paddle contact, branching on rubber `spinBehavior` (`normal` / `reverse` / `disrupt` / `flat`).
  - `Input.js` — unified mouse / keyboard / wheel / touch. Pointer lock is intentionally disabled (comment in `main.setupPointerLock` and Input header — "breaks mouse tracking on macOS"). Both absolute (`mouse.x/y`) and accumulated-delta (`virtualMouseX/Y`) cursor positions are maintained; Paddle picks whichever has moved.
  - `Equipment.js` — blade/rubber catalog driving paddle `properties` (speed/spin/control/elasticity/friction/spinBehavior).
  - `Audio.js`, `Debugger.js` — Web Audio synthesizer + in-game diagnostics panels (visible at `#debug-info`, `#debug-diagnosis`, `#debug-summary`).

- **`js/three/`** — scene + rendered objects, no game state.
  - `Scene.js` — `SceneManager`: renderer, lights, environment, third-person camera (camera position derived from `playerOffset` in `updateCameraPosition`).
  - `Table.js`, `Ball.js`, `Paddle.js`, `Opponent.js`, `Effects.js` — meshes + per-frame `update()`.

- **`js/ui/Menu.js`** — `UIManager` binds DOM buttons, manages screen-switch transitions, fills equipment lists, drives HUD updates.

### Coordinate convention

- `+Z` is the **player's** side of the table; `-Z` is the **opponent's** side. Origin sits at the center of the net at floor level. `TABLE_HEIGHT = 0.76` is the playing surface.
- The third-person camera lives behind the player (`+Z`, elevated), looking toward `-Z`.

### Hit pipeline (what's worth knowing before editing it)

1. `Game.update` reads `input.justClicked()` **before** calling `input.update(dt)` (the latter clears click flags) — there is an explicit comment in Game.js about this ordering; do not reorder.
2. On click during SERVING/RALLY: triggers paddle swing animation, and if `paddlePos.distanceTo(ball) < 0.70` and the ball wasn't last hit by the player, calls `processPaddleHit` **immediately** (instant-hit model — does not wait for the swing animation to reach contact).
3. `processPaddleHit` → `physics.calculateHit(...)` → applies aim correction from `input.mouse.x`, forces `velocity.y >= 0.25`, adds player-controlled spin, calls `ball.hit(...)`.
4. Opponent hits are polled per frame in `Game.update` via `opponent.shouldHit(ballState)` once its swing reaches the `forward` phase and the ball is close.

### Serve flow

Player serve: Space (or click) → `tossBall()` places ball at `(0, 1.2, 0.8)` with vertical toss velocity → ball becomes hittable. AI serve: `performAIServe()` randomly picks topspin/backspin/sidespin and seeds the ball with `lastHitBy='opponent'`.

## Things to know before changing behavior

- **No module resolution beyond the importmap.** Any new dependency has to be added as a CDN URL in `index.html`'s importmap block, or vendored.
- **DOM IDs are the contract between UI and game logic.** `Game` and `UIManager` look up elements by id (e.g. `#click-prompt`, `#debug-info`, `#power-fill`, `#mobile-controls`). Renaming an id in `index.html` will silently break feedback.
- **`index.html` has an 8-second fallback timer** that force-hides the loading screen even if init failed — failures during `App.init()` are caught and only the loader paragraph text changes. Check the browser console when a feature appears dead.
- **Debug overlays are always rendered** (`#debug-info`, `#debug-diagnosis`, `#debug-summary`). Toggling them off is a CSS change, not a code change.
- The recent git history shows iterative input-system rewrites (pointer-lock removal, virtual mouse, instant-hit). Treat the input/hit code as load-bearing and ad-hoc — read it before refactoring.
