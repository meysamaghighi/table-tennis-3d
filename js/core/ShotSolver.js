/**
 * Shot Solver
 * Pure functions, no game state. Given a paddle contact point, a desired
 * table-landing target, an arc height, and outgoing spin, computes the
 * initial ball velocity that actually lands there under the REAL physics
 * engine (gravity + quadratic drag + Magnus) — this repo's drag/Magnus
 * constants bend the trajectory enough (~9 m/s^2 of Magnus accel at
 * 80 rad/s spin) that a closed-form ballistic model would miss badly, so
 * every candidate velocity is judged by driving PhysicsEngine.step()
 * directly, never by analytic range/height formulas.
 *
 * The vertical launch speed is derived once from the requested arc height
 * (closed-form, no-drag — used only to pick a reasonable shot shape, not to
 * predict where it lands). The horizontal launch velocity is then root-found
 * against the real simulated landing point by binary-searching launch speed
 * (at a fixed aim angle) to match range, alternating with a damped aim-angle
 * correction to cancel any lateral drift — never Newton-Raphson: the
 * landing-position function jumps discontinuously across event-type
 * boundaries (a shot that just clears vs. just misses the far table edge
 * flips between "bounce" and "floor/out" with a wildly different landing
 * point), which made a numerically-differenced Jacobian routinely overshoot
 * into a different regime and diverge. Bisection can't diverge like that —
 * each step only shrinks its bracket — so it's the robust choice here even
 * though it costs more simulated shots per solve.
 *
 * Heavy spin can also make the achievable range swing sharply over a
 * fraction of a radian of aim angle (Magnus lift fighting gravity skims the
 * ball along the table-height detection band, so both bounce timing and
 * range become locally near-chaotic). When the fast angle-correction path
 * doesn't converge, solveShot falls back to sweeping a wide angle fan (and
 * then a finer zoom around the best sample) rather than trusting a single
 * local correction — see the grid-search validation in
 * tools/validate_solver.js for the coverage this achieves in practice.
 */

import { PhysicsEngine, TABLE_HEIGHT } from './Physics.js';

const GRAVITY = 9.81;
const MAX_FLIGHT_STEPS = 600; // 5s at 120Hz — generous upper bound for a table-tennis shot

/**
 * Drives the real PhysicsEngine forward from a launch state until the ball's
 * trajectory resolves (table bounce, net, floor, out-of-bounds, or timeout).
 * @param {{x:number,y:number,z:number}} contact
 * @param {{x:number,y:number,z:number}} velocity
 * @param {{x:number,y:number,z:number}} spin
 * @returns {{type:string, position:{x:number,y:number,z:number}, side?:string}}
 */
export function simulateShot(contact, velocity, spin) {
    const engine = new PhysicsEngine();
    const ball = engine.ball;
    ball.position.set(contact.x, contact.y, contact.z);
    ball.velocity.set(velocity.x, velocity.y, velocity.z);
    ball.spin.set(spin.x || 0, spin.y || 0, spin.z || 0);
    ball.active = true;
    ball.bounces = 0;
    ball.lastHitBy = null;
    ball.lastBounceSide = null;

    let hitNet = false;
    for (let i = 0; i < MAX_FLIGHT_STEPS; i++) {
        const event = engine.step();
        if (!event) continue;
        if (event.type === 'net') {
            // checkNetCollision only dampens velocity and nudges the ball off
            // the net plane — it keeps flying, so a graze isn't terminal.
            // Treating the clamped net-contact position as "the landing"
            // would make the residual flat (zero-gradient) right at the net,
            // which stalls Newton's method with a singular Jacobian.
            hitNet = true;
            continue;
        }
        return { type: event.type, position: event.position, side: event.side, hitNet };
    }
    return { type: 'timeout', position: ball.position.clone(), hitNet };
}

/**
 * Solves for the initial ball velocity at `contact` that lands the ball at
 * `targetLanding` under the real physics engine.
 *
 * @param {Object} opts
 * @param {{x:number,y:number,z:number}} opts.contact - ball position at the moment of the hit
 * @param {{x:number,z:number}} opts.targetLanding - desired first-bounce point on the table
 * @param {number} opts.arcHeight - desired apex height above the table surface (meters)
 * @param {{x:number,y:number,z:number}} [opts.spin] - outgoing spin (rad/s) imparted at contact
 * @param {number} [opts.tolerance] - acceptable landing error (meters) to accept convergence
 * @param {number} [opts.maxOuterIterations] - angle-correction iterations before falling back to a wide angle sweep
 * @param {number} [opts.maxSpeed] - upper bound (m/s) for the launch-speed search
 * @returns {{x:number,y:number,z:number}|null} initial velocity, or null if no shot converges
 */
export function solveShot({
    contact,
    targetLanding,
    arcHeight,
    spin = { x: 0, y: 0, z: 0 },
    tolerance = 0.03,
    maxOuterIterations = 14,
    maxSpeed = 40, // m/s — generous upper bound, well above any real paddle speed
}) {
    const peakY = TABLE_HEIGHT + arcHeight;
    const vy0 = peakY > contact.y ? Math.sqrt(2 * GRAVITY * (peakY - contact.y)) : 0;

    const dx0 = targetLanding.x - contact.x;
    const dz0 = targetLanding.z - contact.z;
    const range = Math.hypot(dx0, dz0);
    if (range < 1e-6) return null; // degenerate: target sits on the contact point

    // Aim direction as an angle from +z, rotating toward +x, so that at
    // angleOffset = 0 the horizontal velocity points straight at the target.
    const baseAngle = Math.atan2(dx0, dz0);

    const launch = (speed, angle) => {
        const velocity = { x: speed * Math.sin(angle), y: vy0, z: speed * Math.cos(angle) };
        const result = simulateShot(contact, velocity, spin);
        const lx = result.position.x - contact.x;
        const lz = result.position.z - contact.z;
        return {
            velocity,
            result,
            forward: lx * Math.sin(angle) + lz * Math.cos(angle), // along the aim direction
            lateral: lx * Math.cos(angle) - lz * Math.sin(angle), // perpendicular to it
        };
    };

    // Binary-search launch speed at a fixed angle until the landing point's
    // projection onto the aim direction matches the required range.
    //
    // forward(speed) is not always monotonic: heavy backspin's Magnus lift
    // can partially cancel gravity, so the ball skims the table-height band
    // for an extended stretch and the discrete-step bounce detector becomes
    // hypersensitive to tiny speed changes (near-chaotic bounce timing).
    // Plain bisection assumes a single monotonic crossing and can lock onto
    // the wrong side of a local wobble, so first coarsely scan for every
    // sign change of (forward - range) and only then bisect within each
    // bracket, keeping whichever refined candidate lands closest to range.
    const solveSpeedForRange = (angle) => {
        const samples = 32;
        // Scan the whole speed range rather than a window around speedGuess:
        // the no-drag guess can be far off once Magnus lift (heavy backspin)
        // meaningfully extends hang time, and a too-small scan window can
        // miss the only bracket that actually reaches the target range.
        const scanMax = maxSpeed;
        const step = scanMax / samples;

        let prevSpeed = 0;
        let prevEval = launch(0, angle);
        let fallback = prevEval;

        const refine = (loSpeed, hiSpeed, loEval, hiEval) => {
            let lo = loSpeed, hi = hiSpeed, loF = loEval.forward;
            let result = hiEval;
            for (let i = 0; i < 22; i++) {
                const mid = (lo + hi) / 2;
                const midEval = launch(mid, angle);
                if ((loF - range) * (midEval.forward - range) <= 0) {
                    hi = mid;
                    result = midEval;
                } else {
                    lo = mid;
                    loF = midEval.forward;
                }
            }
            return result;
        };

        let best = null;
        for (let i = 1; i <= samples; i++) {
            const speed = i * step;
            const ev = launch(speed, angle);
            if (Math.abs(ev.forward - range) < Math.abs(fallback.forward - range)) fallback = ev;

            if ((prevEval.forward - range) * (ev.forward - range) <= 0) {
                const candidate = refine(prevSpeed, speed, prevEval, ev);
                if (!best || Math.abs(candidate.forward - range) < Math.abs(best.forward - range)) {
                    best = candidate;
                }
            }
            prevSpeed = speed;
            prevEval = ev;
        }

        return best || fallback;
    };

    const errorOf = (candidate) => Math.hypot(
        candidate.result.position.x - targetLanding.x,
        candidate.result.position.z - targetLanding.z,
    );
    const isGood = (candidate) => candidate.result.type === 'bounce' && errorOf(candidate) <= tolerance;

    let angle = baseAngle;
    let best = null;

    for (let outer = 0; outer < maxOuterIterations; outer++) {
        best = solveSpeedForRange(angle);
        if (isGood(best)) return best.velocity;

        // Damped correction for lateral drift (spin can redirect the ball
        // independently of the aim angle — e.g. topspin couples with the
        // vertical launch speed to push the ball off-line even at very low
        // horizontal speed — so the small-angle approximation can overshoot
        // for short, spin-dominated shots; damping keeps it from oscillating
        // without ever settling).
        angle -= 0.5 * (best.lateral / range);
    }

    if (isGood(best)) return best.velocity;

    // Fallback: the achievable range at a given angle isn't always smooth in
    // the angle either — heavy spin can make it swing sharply over a few
    // hundredths of a radian, so the damped correction above can get stuck
    // hunting near an angle where range is locally capped well short of the
    // target even though a solution exists nearby in angle-space. Sweep a
    // wide angle fan and keep the best result; this only runs for the rare
    // shot the cheap path above didn't already resolve.
    const fanSamples = 40;
    const fanSpan = Math.PI * 0.6;
    let bestAngle = angle;
    for (let i = 0; i <= fanSamples; i++) {
        const candidateAngle = baseAngle - fanSpan / 2 + (fanSpan * i) / fanSamples;
        const candidate = solveSpeedForRange(candidateAngle);
        if (errorOf(candidate) < errorOf(best)) {
            best = candidate;
            bestAngle = candidateAngle;
        }
        if (isGood(best)) return best.velocity;
    }

    // The fan's step size (~0.024 rad) is coarse relative to how sharply
    // achievable range can swing with angle in the spin-dominated regime
    // this fallback exists for, so zoom in around the best coarse sample
    // with a finer sweep before giving up.
    const zoomSpan = (fanSpan / fanSamples) * 2;
    const zoomSamples = 20;
    for (let i = 0; i <= zoomSamples; i++) {
        const candidateAngle = bestAngle - zoomSpan / 2 + (zoomSpan * i) / zoomSamples;
        const candidate = solveSpeedForRange(candidateAngle);
        if (errorOf(candidate) < errorOf(best)) best = candidate;
        if (isGood(best)) return best.velocity;
    }

    // Last resort: accept a looser-but-still-good landing rather than
    // discarding a shot that's close. Callers that need tighter precision
    // can always re-check the returned velocity's actual landing themselves.
    const fallbackTolerance = Math.max(tolerance, 0.07);
    return (best.result.type === 'bounce' && errorOf(best) <= fallbackTolerance) ? best.velocity : null;
}
