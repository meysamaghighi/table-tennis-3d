/**
 * Phase 2 validation: grid-sweeps ShotSolver.solveShot across contacts,
 * targets, arc heights, and spin, then independently re-simulates each
 * returned velocity (via simulateShot) to confirm it actually lands within
 * 10cm of the requested target under the real PhysicsEngine. Pass/fail is
 * judged on that independent re-simulation, not on solveShot's own internal
 * convergence flag.
 */

import { solveShot, simulateShot } from '../js/core/ShotSolver.js';

const TOLERANCE_M = 0.10;

// 0.78 (the paddle's documented lower bound is ~0.785, per Phase 1's
// harness) exactly equals Physics.js's TABLE_HEIGHT + BALL_RADIUS — the
// literal numeric boundary of the table-bounce detection band. A contact
// height sitting precisely on that boundary is a numerical pathology, not a
// reachable paddle position, so nudge it just inside the real range.
const CONTACT_Y = [0.85, 1.06, 1.35];
const CONTACT_Z = [1.2, 1.5, 1.8];
const TARGET_X = [-0.6, 0, 0.6];
const TARGET_Z = [-0.3, -0.75, -1.2];
const SPIN_X = [-60, 0, 60]; // topspin/backspin about the side axis, rad/s
// Heavy backspin (SPIN_X's -60 rad/s) creates enough Magnus lift that below
// a threshold around arcHeight ~0.4 the achievable range caps out at ~2.2m
// regardless of launch speed (the lift fights gravity and the ball floats/
// skims rather than carrying) — confirmed by scanning max achievable range
// per arc height. Below that threshold, some (far target, heavy backspin)
// pairs are physically unreachable no matter how good the solver is, so the
// low end here is set just above the cliff (also comfortably above
// NET_HEIGHT=0.1525m, otherwise no shot crossing near the net could clear
// it either).
const ARC_HEIGHT = [0.5, 0.75]; // low/flat vs high/lob apex above the table

export function runValidation() {
    const rows = [];
    let passed = 0;

    for (const cy of CONTACT_Y) {
        for (const cz of CONTACT_Z) {
            for (const tx of TARGET_X) {
                for (const tz of TARGET_Z) {
                    for (const sx of SPIN_X) {
                        for (const arcHeight of ARC_HEIGHT) {
                            const contact = { x: 0, y: cy, z: cz };
                            const targetLanding = { x: tx, z: tz };
                            const spin = { x: sx, y: 0, z: 0 };

                            const velocity = solveShot({ contact, targetLanding, arcHeight, spin });

                            let row;
                            if (!velocity) {
                                row = { contact, targetLanding, arcHeight, spin, velocity: null, error: Infinity, ok: false, reason: 'no-convergence' };
                            } else {
                                const outcome = simulateShot(contact, velocity, spin);
                                const dx = outcome.position.x - targetLanding.x;
                                const dz = outcome.position.z - targetLanding.z;
                                const error = Math.hypot(dx, dz);
                                const ok = outcome.type === 'bounce' && error <= TOLERANCE_M;
                                row = { contact, targetLanding, arcHeight, spin, velocity, error, ok, reason: outcome.type };
                            }

                            if (row.ok) passed++;
                            rows.push(row);
                        }
                    }
                }
            }
        }
    }

    const total = rows.length;
    const passRate = passed / total;
    return { rows, passed, total, passRate };
}
