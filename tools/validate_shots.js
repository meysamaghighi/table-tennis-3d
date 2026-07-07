/**
 * Phase 3 validation: grid-sweeps the swipe→shot mapping (SwipeShot.computeShot
 * + solvePlayerShot) across realistic rally contact points and swipe gestures,
 * then independently re-simulates each solved velocity through the real
 * PhysicsEngine (simulateShot) to confirm it bounces on the opponent's court
 * near the tier's intended landing. Pass/fail is judged on the independent
 * re-simulation, not on the solver's own convergence flag.
 *
 * It also emits per-tier depth checks (do soft/medium/hard actually land at
 * their intended depths?) and a sidespin check (does a curved swipe impart
 * sidespin?) — the specific Phase-3 assertions from the plan.
 */

import { computeShot, solvePlayerShot, TIERS, classifyTier } from '../js/core/SwipeShot.js';
import { simulateShot } from '../js/core/ShotSolver.js';

const LAND_TOL = 0.15; // m — how close the re-simulated bounce must be to target

// Representative rally contact points (finger owns the paddle, so contacts span
// a band in front of the player). Within Phase-2's validated contact envelope.
const CONTACT_Y = [0.90, 1.05, 1.25];
const CONTACT_Z = [1.00, 1.30, 1.60];
const CONTACT_X = [-0.20, 0, 0.20];

// One representative finger speed per tier (mid-band), plus swipe shapes.
const TIER_SPEEDS = { soft: 2.2, medium: 4.2, hard: 7.0 };
const H_DIRS = [-0.7, 0, 0.7]; // aim left / straight / right
const V_DIRS = [0.4, 0.8];     // gentle vs strong topspin (all upward swipes)
const CURVES = [0, 0.25];      // straight vs hooked

export function runValidation() {
    const rows = [];
    let passed = 0;
    const perTier = { soft: { pass: 0, total: 0 }, medium: { pass: 0, total: 0 }, hard: { pass: 0, total: 0 } };

    for (const tier of ['soft', 'medium', 'hard']) {
        const speedNorm = TIER_SPEEDS[tier];
        for (const cy of CONTACT_Y) {
            for (const cz of CONTACT_Z) {
                for (const cx of CONTACT_X) {
                    for (const hDir of H_DIRS) {
                        for (const vDir of V_DIRS) {
                            for (const curvature of CURVES) {
                                const contact = { x: cx, y: cy, z: cz };
                                const dirSign = hDir >= 0 ? 1 : -1;
                                const shot = computeShot({ speedNorm, hDir, vDir, curvature, dirSign, timing: 0 });
                                const solved = solvePlayerShot(contact, shot.targetLanding, shot.arcHeight, shot.spin);
                                const outcome = simulateShot(contact, solved.velocity, shot.spin);

                                const dx = outcome.position.x - shot.targetLanding.x;
                                const dz = outcome.position.z - shot.targetLanding.z;
                                const error = Math.hypot(dx, dz);
                                // "Good" = lands as a bounce on the opponent's court near the target.
                                const ok = outcome.type === 'bounce' && outcome.position.z < 0 && error <= LAND_TOL;

                                perTier[tier].total++;
                                if (ok) { passed++; perTier[tier].pass++; }
                                rows.push({ tier, contact, shot, error, ok, reason: outcome.type, land: outcome.position });
                            }
                        }
                    }
                }
            }
        }
    }

    const total = rows.length;

    // ---- Specific Phase-3 assertions ----
    const assertions = [];

    // Depth tiers: a clean, mostly-vertical swipe from a central contact should
    // land at (or beyond, for the flat hard tier) the tier's intended depth.
    const centralContact = { x: 0, y: 1.05, z: 1.30 };
    for (const tier of ['soft', 'medium', 'hard']) {
        const shot = computeShot({ speedNorm: TIER_SPEEDS[tier], hDir: 0, vDir: 0.5, curvature: 0, dirSign: 1, timing: 0 });
        const solved = solvePlayerShot(centralContact, shot.targetLanding, shot.arcHeight, shot.spin);
        const outcome = simulateShot(centralContact, solved.velocity, shot.spin);
        const err = Math.hypot(outcome.position.x - shot.targetLanding.x, outcome.position.z - shot.targetLanding.z);
        assertions.push({
            name: `${tier} lands at depth z=${TIERS[tier].depth}`,
            ok: outcome.type === 'bounce' && err <= LAND_TOL,
            detail: `target z=${shot.targetLanding.z.toFixed(2)}, landed z=${outcome.position.z.toFixed(2)} (err ${err.toFixed(3)}m, ${outcome.reason || outcome.type})`,
        });
    }

    // Tiers are ordered by depth: soft shorter than medium shorter than hard.
    {
        const land = (tier) => {
            const shot = computeShot({ speedNorm: TIER_SPEEDS[tier], hDir: 0, vDir: 0.5, curvature: 0, dirSign: 1, timing: 0 });
            const solved = solvePlayerShot(centralContact, shot.targetLanding, shot.arcHeight, shot.spin);
            return simulateShot(centralContact, solved.velocity, shot.spin).position.z;
        };
        const zs = land('soft'), zm = land('medium'), zh = land('hard');
        assertions.push({
            name: 'depth ordering soft > medium > hard (less deep → deeper)',
            ok: zs > zm && zm > zh,
            detail: `soft z=${zs.toFixed(2)}, medium z=${zm.toFixed(2)}, hard z=${zh.toFixed(2)}`,
        });
    }

    // Sidespin: a curved swipe imparts meaningful sidespin; a straight one ~none.
    {
        const curved = computeShot({ speedNorm: 4.2, hDir: 0.5, vDir: 0.5, curvature: 0.3, dirSign: 1, timing: 0 });
        const straight = computeShot({ speedNorm: 4.2, hDir: 0.5, vDir: 0.5, curvature: 0, dirSign: 1, timing: 0 });
        assertions.push({
            name: 'curved swipe → sidespin |spin.z| > 15',
            ok: Math.abs(curved.spin.z) > 15,
            detail: `curved spin.z=${curved.spin.z.toFixed(1)}`,
        });
        assertions.push({
            name: 'straight swipe → ~no sidespin |spin.z| < 5',
            ok: Math.abs(straight.spin.z) < 5,
            detail: `straight spin.z=${straight.spin.z.toFixed(1)}`,
        });
    }

    // Topspin vs backspin sign: upward swipe = topspin (spin.x<0), downward = backspin (>0).
    {
        const up = computeShot({ speedNorm: 4.2, hDir: 0, vDir: 0.8, curvature: 0, dirSign: 1, timing: 0 });
        const down = computeShot({ speedNorm: 4.2, hDir: 0, vDir: -0.8, curvature: 0, dirSign: 1, timing: 0 });
        assertions.push({
            name: 'upward swipe → topspin (spin.x < 0), downward → backspin (spin.x > 0)',
            ok: up.spin.x < -10 && down.spin.x > 10,
            detail: `up spin.x=${up.spin.x.toFixed(1)}, down spin.x=${down.spin.x.toFixed(1)}`,
        });
    }

    return { rows, passed, total, passRate: passed / total, perTier, assertions };
}
