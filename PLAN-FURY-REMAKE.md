# Plan: Fury-Like Swipe Gameplay Remake

**Goal:** Make the mobile game feel like *Ping Pong Fury* (Yakuto): portrait one-thumb play,
finger drives the paddle 1:1, swipe *through* the ball to hit, swipe direction/speed/curve =
placement/power/spin, snappy race-to-5 matches vs AI, heavy game-feel (trails, hit-stop,
slow-mo, haptics).

**Approach (approved 2026-07-06):** Keep `js/core/Physics.js`, the three.js scene objects
(`Table`, `Ball`, `Effects`), `Audio`, and the menu shell. **Replace the entire
input→paddle→hit pipeline.** Delete the crutches once replaced: auto-swing/auto-hit,
instant-hit, TOSS button, virtual-mouse accumulation, `AutoTune` shot knobs (keep only
opponent difficulty adaptation), aim-assist + shotArc.

**Design pillars:**
1. Finger = paddle. Lower ~45% of screen is the control zone; paddle tracks the thumb
   continuously (mapped to table X / height Y). No discrete "swing button".
2. Hits happen when the paddle sweeps into the ball during its hit window with sufficient
   finger velocity. Whiffing is possible; timing shifts placement (early → cross-court,
   late → down-the-line).
3. **Target-solver shots, not reflection physics.** The swipe picks a landing target +
   power + spin; a solver computes the initial velocity that lands there under the real
   physics (gravity/drag/Magnus), then the ball flies with the engine. Low power = safe
   arcs; high power = flat and risky (solver target pushed deep, may go long). This is the
   core trick that makes swipe games feel fair AND expressive.
4. AI uses the same solver with an error model (target scatter grows with difficulty gap
   and incoming shot quality).
5. Portrait-first camera; juice everywhere (see Phase 6).

---

## Phases (each = one focused session, independently shippable & verifiable)

### Phase 1 — SwipeInput + 1:1 paddle tracking  [Sonnet]
- New `js/core/SwipeInput.js` using **Pointer Events** (works for touch AND mouse drag —
  desktop support falls out for free). Keeps a rolling ~120ms buffer of `{x, y, t}`
  samples; exposes `position`, `velocity` (px/s, smoothed), and `pathCurvature`.
- Paddle maps control zone → table space: screen X → paddle X (−0.75..0.75), screen Y →
  paddle height (0.78..1.35) and forward reach (drag up = reach over table).
- Remove Y auto-track and X ball-follow from `Paddle.update` (finger owns position now).
  Keep the swing-pose animation for later phases but don't trigger it yet.
- Auto-hit stays functional this phase so the game still plays.
- **Verify:** harness (see Protocol below) — synthetic pointer sequences; assert paddle
  position follows within one frame; screenshot at 390×720.

### Phase 2 — Shot solver  [Sonnet]
- New `js/core/ShotSolver.js`, **pure functions**, no game state:
  `solveShot({contact, targetLanding, arcHeight, spin}) → initialVelocity | null`.
  Iterate with the real `PhysicsEngine` stepping (binary-search launch angle at given
  speed, or fixed-point iterate) — do NOT re-derive closed-form ballistics; drag+Magnus
  matter (this repo's constants make ~9 m/s² of Magnus at 80 rad/s spin).
- Build a validation table in-browser: grid of contacts (y 0.78–1.35, z 1.2–1.8) ×
  targets (z −0.3..−1.2, x ±0.6) × spin (−60..+60 rad/s). Must land within 10cm of target
  for ≥95% of the grid. Store the script in `tools/validate_solver.js` (run via harness).
- **Verify:** validation table printed to console; commit results in the PR/commit message.

### Phase 3 — Swipe-to-hit + serve (THE core phase)  [Opus]
- Hit detection: during ball hit-window (ball within reach sphere of paddle, moving toward
  player), if finger speed > threshold, contact fires. Map:
  - swipe direction X → target X on opponent court (clamped ±0.6)
  - swipe speed → power tier → target depth (soft: z −0.4, medium: −0.8, hard: −1.15)
    + arc height (high/med/low); hard shots use flat arcs (can sail — risk/reward)
  - path curvature → sidespin; upward swipe component → topspin; downward → backspin/chop
  - timing early/late → shifts target X (cross-court / down-the-line)
- Serve: swipe up = toss+strike in one motion (ball tossed, contact at descent, solver
  fires the validated serve profile from `processPaddleHit`'s SERVING branch — reuse the
  bounce-own-side-first constants already in Game.js, keep spin from swipe curve ±25 rad/s).
- Delete: auto-hit block in `Game.update`, `triggerSwing`-on-click, TOSS button + its
  listeners, `Input.js` virtual mouse, aimAssist/shotArc application. `input.justClicked`
  remains only for menu/pause.
- Trigger swing animation from the swipe itself (pose follows finger velocity).
- **Verify:** scripted swipe gestures in harness → assert: soft/med/hard land at expected
  depths; curved swipe produces sidespin; whiff (no swipe) loses point; full match
  completes. Then REAL PHONE test before calling it done.

### Phase 4 — AI opponent v2  [Sonnet, spec below is tight]
- Replace `Opponent.getHitData/planShot` with the Phase-2 solver: pick target = open court
  (away from player paddle X) with error scatter `σ = 0.25·(1−difficulty)` m; power tier
  chosen by incoming ball height (high ball → smash tier).
- Keep movement/swing animation; keep AutoTune's `opponentDifficulty` nudging (delete its
  other knobs).
- Serve with the same solver (bounce own side, then receiver side — physics-validate).
- **Verify:** harness AI-vs-scripted-player match: AI serve legality 100%, AI return-in
  rate 70–90% depending on difficulty, avg rally ≥ 4 shots.

### Phase 5 — Portrait camera & framing  [Sonnet]
- Portrait rig: camera higher/closer (x 0, y ~2.0, z ~2.6 ballpark — tune visually), table
  fills frame width at 390px; subtle lateral lean following ball X (±0.15); punch-in +
  slight FOV kick on smash-tier hits; keep landscape/desktop framing as fallback based on
  aspect ratio.
- **Verify:** screenshots at 390×720, 390×844, 768×1024, 1470×746.

### Phase 6 — Juice  [Opus]
- Hit-stop (2–3 frozen frames on hard contact), slow-mo (0.3× for 400ms) on smash winners
  and match point, ball trail intensity scales with speed, impact particles + screen shake
  on smashes, `navigator.vibrate(15)` on player hits (guard for iOS Safari where it's
  absent), score pop animation, richer synth layers in `Audio.js` (transient + wood tone).
- **Verify:** record a GIF via harness; frame-step to confirm hit-stop/slow-mo timing;
  real phone for haptics.

### Phase 7 — Pacing, HUD cleanup, ship  [Sonnet]
- Race-to-5 default (11 as option), point-reset delay 1500→700ms, auto-ready next serve.
- Delete debug overlays from prod (gate behind `?debug=1`), remove power/spin meters +
  mobile-angle dead DOM, minimal HUD (score, serve dot, "NICE!"-style shot callouts).
- Fix `Input.dispose()` undefined `canvas` bug. Update CLAUDE.md architecture section to
  describe the new pipeline. Deploy `vercel --prod`, verify live URL on phone.

---

## Session execution protocol (for Opus/Sonnet sessions)

**Model choice:** Sonnet for phases with tight specs above (1, 2, 4, 5, 7). Opus for the
two feel-critical phases (3, 6) — they need judgment and iterative tuning, not just spec
compliance. If a Sonnet session stalls or the result feels off, re-run that phase's
tuning step with Opus rather than iterating blind.

**Prompt template per session:**
> Read PLAN-FURY-REMAKE.md and CLAUDE.md. Execute Phase N only. Use the verification
> harness described in the plan before claiming success. Commit when verified, update the
> phase checkbox in PLAN-FURY-REMAKE.md, and stop — do not start the next phase.

**Rules for every session:**
1. One phase per session. Commit at the end (small, reviewable diffs).
2. Serve locally with no-cache headers (browser caches modules aggressively):
   `python3 -c "import http.server,functools; h=type('H',(http.server.SimpleHTTPRequestHandler,),{'end_headers':lambda s:(s.send_header('Cache-Control','no-store'),http.server.SimpleHTTPRequestHandler.end_headers(s))}); http.server.ThreadingHTTPServer(('127.0.0.1',8080),functools.partial(h,directory='.')).serve_forever()`
3. **Verification harness recipe** (proven in the 2026-07-05 session): Chrome-extension
   testing of a background tab freezes rAF — do NOT rely on real-time play. Instead:
   - Load the game in an iframe on a small harness page (`390×720`) so phone media
     queries/viewport apply; add `touch-device` class to the iframe body.
   - `import('/js/core/Game.js')` inside the iframe realm and patch
     `Game.prototype.startMatch` to capture the instance on `window.__game`.
   - Drive deterministically: `for(i<N) game.update(1/60); sceneManager.render()` —
     no rAF needed. Dispatch synthetic `PointerEvent`/`TouchEvent` on the iframe canvas
     between steps (touchstart/touchend back-to-back; timers are throttled in hidden tabs).
   - Patch `Game.prototype.scorePoint` to log `{winner, reason, lastHitBy, rallyShots}`
     per point; assert on the aggregate (rally length, fault rates, score balance).
4. Physics-validate any new trajectory constants with a grid sim against the real
   `PhysicsEngine` (see Phase 2 pattern) — never hand-derive.
5. Real-phone check for anything touch-feel related before marking Phase 3/6/7 done
   (deploy preview: `vercel`, or prod: `vercel --prod`).

## Phase status
- [x] Phase 1 — SwipeInput + paddle tracking
- [x] Phase 2 — Shot solver
- [x] Phase 3 — Swipe-to-hit + serve  _(harness-verified; real-phone feel check still pending — deploy a preview and test on device)_
- [x] Phase 4 — AI opponent v2  _(harness-verified: serve legality 100%, return-in 83→96% by difficulty, avg rally 4.9)_
- [x] Phase 5 — Portrait camera  _(aspect-based portrait/landscape rigs; verified at 390×720, 390×844, 768×1024, 1470×746)_
- [x] Phase 6 — Juice  _(hit-stop/slow-mo/shake/FOV-kick frame-step verified; trail+audio+score-pop+haptics for device review)_
- [ ] Phase 7 — Pacing, HUD cleanup, ship
