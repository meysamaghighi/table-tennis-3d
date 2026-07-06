# Backlog — Pro-Level Gameplay

> **⭑ ACTIVE PLAN (2026-07-06): [PLAN-FURY-REMAKE.md](PLAN-FURY-REMAKE.md)** — approved
> direction: Ping-Pong-Fury-style swipe controls, target-solver shots, AI v2, portrait
> camera, juice, race-to-5 pacing. 7 phases sized for one Opus/Sonnet session each, with
> execution protocol. It **supersedes** the P0 items below (auto-hit decisions, swing
> animation) and the P1 "Mobile UX: aim feels indirect" item — do the plan first.

Current gameplay quality: **~2/10**. The mechanical scaffolding is in place
(auto-swing, physics, AutoTune, paddle orientation), but the *feel* and the
*decisions* on both sides are far from pro-level. The items below are the
gap to "professional table tennis simulation."

---

## P0 — Hit decisions are not what a pro would do

The auto-hit currently fires the moment the ball is within 0.45 m. A pro:
- Reads incoming spin and chooses **shot type first** (loop / drive / push / chop / smash / block / flick).
- Picks a **contact point** (waist height in front of the body for drives;
  high for smashes; low and forward for pushes).
- Aims at the **open court** (where the opponent is *not*), not the center.
- Times contact with the **rising / peak / descending** phase deliberately
  (e.g. counter-loop on the rise, loop at the peak, chop on the descent).

What to build:
- A `ShotPlanner` that, given `{ballState, opponentPos, paddlePos}`, returns
  `{shotType, contactPoint, aimTarget, paddleAngle, paddleSwingVel}`.
- Replace the current "fire when distance < 0.45" with "move paddle to
  `contactPoint`, then swing through it." Paddle moves to where the ball
  *will be*, not where it is.
- Drop the strong Y auto-track once the planner is in: the planner owns
  where the paddle goes, the player only tweaks placement.

## P0 — Opponent AI plays like a beginner

`Opponent.think()` picks random targets from a 5-point list and a random
shot type from `[topspin, backspin, sidespin]`. There's no concept of:
- Where the player is standing → choose the opposite corner.
- Player's last shot quality → counter weakness.
- Spin-on-spin physics → a pro reads spin and adjusts the paddle face.

Direction:
- Per-rally state machine: `serve → 3rd-ball attack → rally → finishing shot`.
- Score-aware aggression (raise risk at 9-9, conservative at 10-7 down).
- Spin-aware return: chop opens face, loop closes face, sidespin gets read
  off `ball.spin` not random dice.
- Footwork: opponent body should pivot, not just translate the paddle.

## P0 — Swing animation does not match the shot

There is **one** swing animation (backswing → forward → follow → recovery)
used for every shot. Pros swing very differently for:
- Drive (compact, level)
- Topspin loop (low to high, brushing)
- Smash (long backswing, downward)
- Chop / push (short, level, paddle open)
- Block (almost no swing)

Need a small library of animation curves selected by `shotType`, with the
paddle face orientation driven by the planner, not by an `autoPitch` hack.

## P1 — Camera does not help the player read the ball

Third-person fixed broadcast camera. Pros watch the ball from their own POV.
Options:
- Add a "behind paddle" follow camera (toggleable).
- On serves, briefly pull in close so the toss and contact read clearly.
- Slight chromatic / motion blur on fast smashes for impact feedback.

## P1 — Physics: spin model is too coarse

`Physics.calculateHit` decomposes into normal/tangential and does a single
friction factor. Misses:
- **Kick** on heavy topspin landing (the bounce should accelerate forward
  and stay low).
- **Float / sit-up** on heavy backspin landing (slow, high bounce).
- **Sidespin curve** mid-flight is implemented but weak — Magnus coefficient
  needs calibration against real ball trajectories.
- Spin **decay on table contact** is too fast — pro topspin retains spin
  through 2-3 bounces.

## P1 — Mobile UX: aim feels indirect

Drag-to-move-paddle works, but on a phone the paddle is also doing strong
auto-track, so the finger feels disconnected from the result. Try:
- Drag = aim **direction** (where you want the shot to go), not paddle
  position. Auto-track owns position, finger owns aim.
- Larger tap target for TOSS during serve.
- Haptic vibration on hit (`navigator.vibrate(15)`).

## P1 — Equipment selection is cosmetic right now

The Equipment screen exists but `props.spinBehavior` only affects the
return-spin code in `Physics.calculateHit`. Pros notice equipment
differences in the **first** half-second of a rally. Surface this:
- Show the rubber's behavior in the HUD ("Anti-spin: reverses incoming
  spin").
- Tune the four `spinBehavior` branches against real-world equipment
  reviews so the differences feel substantial.

## P2 — Sound is a placeholder

`AudioManager` synthesizes generic bounce/hit clicks. Pro impact has a
*pop* with a paddle wood tone, distinct between forehand/backhand rubber.
Either record short samples or build a richer synth (transient + resonator).

## P2 — Self-improvement (AutoTune) is too narrow

`AutoTune` only nudges 5 scalar knobs. To make the game self-improve toward
"pro" rather than "winnable," it needs:
- Per-shot success tracking (which shot types land vs. miss).
- A/B comparison of planner strategies across matches.
- Persistent **player profile** (preferred shot range, weak side) so the
  opponent can target weaknesses — the auto-tuner becomes the opponent's
  scouting report.
- Optional: a "session export" button that dumps the full event log so a
  human (or another LLM session) can analyze and propose tuning rules.

## P2 — Testing & telemetry

- The Playwright `auto_test.py` only screenshots; extend it to drive
  several rallies and assert plausible outcomes (rally length > N, no
  paddle clipping, score advances).
- Capture in-browser performance traces on mobile to find frame-time spikes.

## Cleanup debt

- Big media files committed to repo (`Screen Recording*.mov` 111 MB,
  `debug_small.m4v`). Move to Git LFS or delete from history.
- Debug overlays (`#debug-info`, etc.) are always rendered; gate behind
  `?debug=1` query param.
- Mobile angle button HTML block still in `index.html` (hidden via JS).
  Remove the dead DOM.
- `Input.dispose()` references `canvas` without `document.getElementById` —
  will throw if called.
