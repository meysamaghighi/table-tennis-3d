/**
 * Swipe → Shot mapping (Phase 3)
 *
 * Pure functions translating a swipe gesture into a target-solver shot. No
 * game state, no three.js — so the same mapping the live game uses can be
 * grid-validated headlessly (tools/validate_shots.js) against the real
 * PhysicsEngine, per the plan's rule "physics-validate any new trajectory
 * constants, never hand-derive".
 *
 * The shot is expressed as {targetLanding, arcHeight, spin} and handed to
 * ShotSolver.solveShot, which finds the launch velocity that actually lands
 * there under gravity+drag+Magnus. Power tier (from finger speed) chooses how
 * DEEP and how FLAT the target is: soft = short + high/safe arc, hard = deep +
 * flat/risky arc (flat shots can sail long — intended risk/reward). Vertical
 * swipe component becomes topspin (up) / backspin (down); path curvature
 * becomes sidespin; horizontal swipe direction + hit timing place the ball
 * laterally.
 *
 * Sign conventions (matching the rest of the codebase):
 *   spin.x < 0  = topspin,  spin.x > 0 = backspin   (see Game.identifyShot)
 *   +z          = player's side, -z = opponent's side (targets are negative z)
 */

import { solveShot } from './ShotSolver.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Finger speed is normalized to "screen-widths per second" so tiers behave the
// same on a 390px phone and a wide desktop window. Below the threshold a swipe
// is too weak to make contact (a whiff).
export const SWIPE_HIT_THRESHOLD = 1.2;

// Power tiers keyed on normalized finger speed. `depth` is the target landing
// z on the opponent's court; `arc` is the apex height above the table handed
// to the solver. Deeper + flatter as power rises.
export const TIERS = {
    soft:   { maxSpeed: 3.0,      depth: -0.45, arc: 0.45 },
    medium: { maxSpeed: 5.5,      depth: -0.85, arc: 0.34 },
    hard:   { maxSpeed: Infinity, depth: -1.10, arc: 0.24 },
};

const TARGET_X_MAX = 0.6;   // lateral placement clamp on the opponent's court
const SPIN_TOP_MAX = 55;    // rad/s topspin/backspin at a full vertical swipe
const SPIN_SIDE_MAX = 35;   // rad/s sidespin at a strongly curved swipe
const SPIN_SIDE_SCALE = 150;

export function classifyTier(speedNorm) {
    if (speedNorm < TIERS.soft.maxSpeed) return 'soft';
    if (speedNorm < TIERS.medium.maxSpeed) return 'medium';
    return 'hard';
}

/**
 * Map a swipe gesture to a target-solver shot spec.
 * @param {Object} swipe
 * @param {number} swipe.speedNorm - finger speed in screen-widths/second
 * @param {number} swipe.hDir - horizontal direction cosine (velocity.x / |velocity|), -1..1
 * @param {number} swipe.vDir - vertical direction cosine, + = swiping UP, -1..1
 * @param {number} swipe.curvature - path curvature (SwipeInput.pathCurvature), >= 0
 * @param {number} swipe.dirSign - sign of horizontal swipe (for sidespin direction)
 * @param {number} [swipe.timing] - -1 (early) .. +1 (late); shifts lateral placement
 * @returns {{tier:string, targetLanding:{x:number,z:number}, arcHeight:number, spin:{x:number,y:number,z:number}}}
 */
export function computeShot(swipe) {
    const tier = classifyTier(swipe.speedNorm);
    const t = TIERS[tier];

    // Lateral placement from the swipe's horizontal direction, nudged by timing
    // (early → pull cross-court, late → straighten down-the-line).
    const timing = swipe.timing || 0;
    let targetX = swipe.hDir * TARGET_X_MAX + timing * 0.15;
    targetX = clamp(targetX, -TARGET_X_MAX, TARGET_X_MAX);

    const spinX = clamp(-swipe.vDir * SPIN_TOP_MAX, -SPIN_TOP_MAX, SPIN_TOP_MAX);
    const spinZ = clamp(swipe.dirSign * swipe.curvature * SPIN_SIDE_SCALE, -SPIN_SIDE_MAX, SPIN_SIDE_MAX);

    return {
        tier,
        targetLanding: { x: targetX, z: t.depth },
        arcHeight: t.arc,
        spin: { x: spinX, y: 0, z: spinZ },
    };
}

/**
 * Solve for the launch velocity of a player shot. Tries the requested arc, then
 * progressively safer (higher) arcs so heavy-spin / deep-target combinations
 * that can't be reached flat still produce a legal landing rather than a null.
 * Always returns a velocity so the rally continues; `solved` reports whether it
 * actually converged on the target (best-effort loft otherwise).
 *
 * @returns {{velocity:{x,y,z}, solved:boolean, arc:number|null}}
 */
export function solvePlayerShot(contact, targetLanding, arcHeight, spin) {
    const arcs = [arcHeight, arcHeight + 0.15, arcHeight + 0.35, 0.7];
    for (const arc of arcs) {
        const v = solveShot({ contact, targetLanding, arcHeight: arc, spin, tolerance: 0.06 });
        if (v) return { velocity: v, solved: true, arc };
    }
    // Best-effort fallback: loft the ball toward the target so play continues
    // even for an unsolvable ask (it may land long — a genuinely bad shot).
    const dx = targetLanding.x - contact.x;
    const dz = targetLanding.z - contact.z;
    const horiz = Math.hypot(dx, dz) || 1;
    const speed = 6.0;
    return {
        velocity: { x: (dx / horiz) * speed, y: 2.6, z: (dz / horiz) * speed },
        solved: false,
        arc: null,
    };
}
