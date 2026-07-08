/**
 * AI Opponent
 * Realistic opponent paddle with movement, shot selection, and difficulty levels.
 */

import * as THREE from 'three';
import { solveShot } from '../core/ShotSolver.js';
import { TABLE_HEIGHT } from '../core/Physics.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Standard-normal sample (Box–Muller) for target scatter.
function gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Solve a landing shot, progressively raising the arc so a deep/heavy-spin ask
// still finds a legal launch. Returns a velocity object, or null if even the
// safe arcs can't reach the target (target likely off the table → an error).
function solveWithBump(contact, targetLanding, arcHeight, spin) {
    for (const arc of [arcHeight, arcHeight + 0.15, arcHeight + 0.35, 0.7]) {
        const v = solveShot({ contact, targetLanding, arcHeight: arc, spin, tolerance: 0.07 });
        if (v) return v;
    }
    return null;
}

// Power tier → landing depth on the player's court (+z), apex arc, and the
// topspin(-)/backspin(+) the opponent imparts.
const OPP_TIERS = {
    smash: { z: 1.05, arc: 0.28, spinX: -35 },
    drive: { z: 0.80, arc: 0.38, spinX: -22 },
    push:  { z: 0.55, arc: 0.50, spinX: +18 },
};

export class Opponent {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        
        // Similar paddle geometry but simplified (no need for full detail on far side)
        const bladeW = 0.15;
        const bladeH = 0.16;
        const bladeThickness = 0.006;
        const handleH = 0.09;
        
        // Blade
        const blade = new THREE.Mesh(
            new THREE.BoxGeometry(bladeW, bladeH, bladeThickness),
            new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.6 })
        );
        blade.position.y = handleH / 2 + bladeH / 2 - 0.01;
        blade.castShadow = true;
        this.group.add(blade);
        
        // Handle
        const handle = new THREE.Mesh(
            new THREE.BoxGeometry(0.035, handleH, 0.028),
            new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.5 })
        );
        handle.position.y = -0.02;
        handle.castShadow = true;
        this.group.add(handle);
        
        // Rubber
        const rubberThick = 0.003;
        const rubber = new THREE.Mesh(
            new THREE.BoxGeometry(bladeW - 0.002, bladeH - 0.002, rubberThick),
            new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.5 })
        );
        rubber.position.set(0, handleH / 2 + bladeH / 2 - 0.01, bladeThickness / 2 + rubberThick / 2);
        this.group.add(rubber);
        
        // Rubber back
        const rubberBack = new THREE.Mesh(
            new THREE.BoxGeometry(bladeW - 0.002, bladeH - 0.002, rubberThick),
            new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.5 })
        );
        rubberBack.position.set(0, handleH / 2 + bladeH / 2 - 0.01, -bladeThickness / 2 - rubberThick / 2);
        this.group.add(rubberBack);
        
        this.scene.add(this.group);
        
        // AI state
        this.position = new THREE.Vector3(0, 1.0, -1.2);
        this.targetPosition = new THREE.Vector3(0, 1.0, -1.2);
        this.velocity = new THREE.Vector3();
        
        // Difficulty: 0 = easy, 1 = hard
        this.difficulty = 0.35; // Easier opponent for better rallies
        
        // Swing state
        this.swingState = 'ready';
        this.swingTimer = 0;
        this.hasHitBall = false;
        
        // Facing target (open-court x); actual shot is solved at contact time.
        this.targetX = 0;
        this.playerPaddleX = 0;

        // Reaction delay (based on difficulty)
        this.reactionTimer = 0;
        this.reactionDelay = 0.2;
    }
    
    setDifficulty(level) {
        this.difficulty = Math.max(0, Math.min(1, level));
    }
    
    update(dt, ballState, ballActive, playerPaddleX = 0) {
        this.playerPaddleX = playerPaddleX;
        if (!ballActive) {
            // Return to ready position
            this.targetPosition.set(0, 1.0, -1.2);
            this.swingState = 'ready';
            this.hasHitBall = false;
        } else {
            this.think(ballState, dt);
        }
        
        // Smooth movement toward target
        const moveSpeed = 2.8 + this.difficulty * 2.0;
        this.position.x += (this.targetPosition.x - this.position.x) * moveSpeed * dt;
        this.position.y += (this.targetPosition.y - this.position.y) * moveSpeed * dt;
        this.position.z += (this.targetPosition.z - this.position.z) * moveSpeed * dt;
        
        // Update swing animation
        this.updateSwing(dt, ballState);
        
        // Apply transforms
        this.group.position.copy(this.position);
        
        // Rotation
        let rotX = 0;
        let rotY = 0;
        
        switch (this.swingState) {
            case 'backswing':
                rotX = 0.2 * (this.swingTimer / 0.15);
                break;
            case 'forward':
                rotX = 0.2 - 0.5 * (this.swingTimer / 0.1);
                break;
            case 'follow':
                rotX = -0.3 * (1 - this.swingTimer / 0.2);
                break;
        }
        
        // Face toward ball landing spot
        rotY = this.targetX * 0.4;
        
        this.group.rotation.set(rotX, rotY, 0);
    }
    
    think(ballState, dt) {
        const { position, velocity, spin, bounces, lastHitBy } = ballState;
        
        // Only react to balls coming toward opponent (negative z velocity from player side)
        if (velocity.z > -0.1) return;
        
        // Predict ball landing position on opponent side
        const predictedLanding = this.predictLanding(position, velocity, spin);
        
        if (predictedLanding) {
            // Position to intercept — step in close behind short landings so
            // drop shots near the net stay returnable.
            const interceptX = predictedLanding.x;
            const interceptZ = Math.min(-0.30, predictedLanding.z - 0.25);
            const interceptY = Math.max(0.8, Math.min(1.3, predictedLanding.y + 0.2));
            
            // Add error based on difficulty
            const errorAmount = (1 - this.difficulty) * 0.4;
            this.targetPosition.x = interceptX + (Math.random() - 0.5) * errorAmount;
            this.targetPosition.y = interceptY;
            this.targetPosition.z = interceptZ;
            
            // Face toward the open court (away from the player's paddle). The
            // actual shot velocity is solved at contact time in getHitData.
            const openSide = (this.playerPaddleX || 0) >= 0 ? -1 : 1;
            this.targetX = openSide * (0.15 + this.difficulty * 0.45);

            // Trigger swing timing
            const distToBall = position.distanceTo(this.position);
            const timeToReach = distToBall / Math.max(velocity.length(), 1.0);
            
            if (timeToReach < 0.25 && this.swingState === 'ready' && !this.hasHitBall) {
                this.swingState = 'backswing';
                this.swingTimer = 0;
            }
        }
    }
    
    predictLanding(pos, vel, spin) {
        // Simple trajectory prediction
        // Using basic physics to find where ball crosses z = -TABLE_LENGTH/2 area
        
        if (vel.z >= 0) return null;
        
        const g = 9.81;
        let dt = 0;
        let p = pos.clone();
        let v = vel.clone();
        const step = 0.01;
        
        for (let t = 0; t < 2.0; t += step) {
            v.y -= g * step;
            p.add(v.clone().multiplyScalar(step));
            
            if (p.y < 0.76 && p.z < 0 && Math.abs(p.x) < 1.0) {
                return p.clone();
            }
            
            if (p.z < -2) break;
        }
        
        return null;
    }
    
    updateSwing(dt, ballState) {
        if (this.swingState === 'ready') return;
        
        this.swingTimer += dt;
        
        const durations = {
            backswing: 0.15,
            forward: 0.1,
            follow: 0.2,
            recovery: 0.15,
        };
        
        const currentDuration = durations[this.swingState];
        
        if (this.swingTimer >= currentDuration) {
            this.swingTimer = 0;
            
            switch (this.swingState) {
                case 'backswing':
                    this.swingState = 'forward';
                    break;
                case 'forward':
                    this.swingState = 'follow';
                    break;
                case 'follow':
                    this.swingState = 'recovery';
                    break;
                case 'recovery':
                    this.swingState = 'ready';
                    this.hasHitBall = false;
                    break;
            }
        }
    }
    
    shouldHit(ballState) {
        // Check if ball is in hitting zone and swing is in forward phase
        if (this.swingState !== 'forward') return false;
        if (this.hasHitBall) return false;
        
        const ballPos = ballState.position;
        const paddlePos = this.position;
        
        // Check distance to ball
        const dist = Math.sqrt(
            (ballPos.x - paddlePos.x) ** 2 +
            (ballPos.y - paddlePos.y) ** 2 +
            (ballPos.z - paddlePos.z) ** 2
        );
        
        return dist < 0.25 && ballPos.z < 0.1 && ballPos.z > -1.2;
    }
    
    /**
     * Solver-driven return. Picks an open-court target away from the player's
     * paddle, a power tier from the incoming ball height, and an error model
     * (placement scatter + a miss chance) that both grow as difficulty drops
     * and as the incoming shot gets faster/spinnier. The launch velocity is
     * solved against the real physics so a clean return actually lands where
     * aimed; a "miss" sabotages it into the net or long.
     *
     * @param {Object} ballState - live ball state at the moment of contact
     */
    getHitData(ballState) {
        const diff = this.difficulty;
        const contact = {
            x: ballState.position.x,
            y: ballState.position.y,
            z: ballState.position.z,
        };
        const heightAbove = contact.y - TABLE_HEIGHT;
        const incomingSpeed = ballState.velocity.length();
        const spinMag = ballState.spin.length();
        // Harder-to-handle incoming (fast / spinny) inflates the error terms.
        const quality = clamp(0.5 + incomingSpeed / 12 + spinMag / 120, 0.5, 1.8);

        let tierName = 'drive';
        if (heightAbove > 0.30) tierName = 'smash';       // high ball → put it away
        else if (heightAbove < 0.06) tierName = 'push';   // scraped low → safe push
        const tier = OPP_TIERS[tierName];

        // Open-court placement away from the player's paddle, plus scatter.
        // Spread scales strongly with difficulty: an easy opponent hits near
        // the middle (reachable → rallies develop), a hard one goes for the
        // wide open corner (winners).
        const openSide = (this.playerPaddleX || 0) >= 0 ? -1 : 1;
        const spread = 0.15 + diff * 0.45;
        const sigma = 0.18 * (1 - diff) * quality;
        let targetX = openSide * spread + gaussian() * sigma;
        let targetZ = tier.z + gaussian() * sigma * 0.7;
        // Keep the intended target on the table so a clean return is legal;
        // the miss model below is what puts balls out.
        targetX = clamp(targetX, -0.62, 0.62);
        targetZ = clamp(targetZ, 0.30, 1.25);

        const spin = new THREE.Vector3(tier.spinX, 0, gaussian() * 8);

        // Solve the intended (legal, on-table) shot first — this converges
        // cheaply. Never hand the solver an off-table target: that would force
        // its full non-converging fallback search on every miss (a big compute
        // hitch). Errors are applied by sabotaging the solved velocity instead.
        let vel = solveWithBump(contact, { x: targetX, z: targetZ }, tier.arc, spin);
        if (!vel) {
            const dx = targetX - contact.x, dz = targetZ - contact.z;
            const h = Math.hypot(dx, dz) || 1;
            vel = { x: (dx / h) * 5.5, y: 2.2, z: (dz / h) * 5.5 };
        }

        // Miss model: with a probability that grows as difficulty drops and the
        // incoming ball gets nastier, the opponent commits a genuine, reliably
        // fatal error — overhit long (flat + fast → sails past the baseline) or
        // dump into the net (kill the loft). So return-in ≈ 1 - pMiss, keeping
        // the game winnable at low difficulty.
        const pMiss = Math.min(0.5, 0.30 * (1 - diff) * quality);
        if (Math.random() < pMiss) {
            if (Math.random() < 0.6) { vel = { x: vel.x, y: vel.y * 0.55, z: vel.z * 2.0 }; } // long/out
            else { vel = { x: vel.x, y: vel.y * 0.12, z: vel.z * 0.7 }; }                     // into the net
        }

        return {
            velocity: new THREE.Vector3(vel.x, vel.y, vel.z),
            spin,
        };
    }
    
    getPaddleNormal() {
        const normal = new THREE.Vector3(0, 0, 1);
        normal.applyQuaternion(this.group.quaternion);
        return normal.normalize();
    }
    
    dispose() {
        this.scene.remove(this.group);
    }
}
