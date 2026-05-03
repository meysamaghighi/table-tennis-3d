/**
 * AI Opponent
 * Realistic opponent paddle with movement, shot selection, and difficulty levels.
 */

import * as THREE from 'three';

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
        
        // Shot selection
        this.targetX = 0;
        this.shotPower = 0.7;
        this.shotSpin = new THREE.Vector3();
        
        // Reaction delay (based on difficulty)
        this.reactionTimer = 0;
        this.reactionDelay = 0.2;
    }
    
    setDifficulty(level) {
        this.difficulty = Math.max(0, Math.min(1, level));
    }
    
    update(dt, ballState, ballActive) {
        if (!ballActive) {
            // Return to ready position
            this.targetPosition.set(0, 1.0, -1.2);
            this.swingState = 'ready';
            this.hasHitBall = false;
        } else {
            this.think(ballState, dt);
        }
        
        // Smooth movement toward target
        const moveSpeed = 2.0 + this.difficulty * 2.0;
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
            // Position to intercept
            const interceptX = predictedLanding.x;
            const interceptZ = predictedLanding.z - 0.3;
            const interceptY = Math.max(0.8, Math.min(1.3, predictedLanding.y + 0.2));
            
            // Add error based on difficulty
            const errorAmount = (1 - this.difficulty) * 0.4;
            this.targetPosition.x = interceptX + (Math.random() - 0.5) * errorAmount;
            this.targetPosition.y = interceptY;
            this.targetPosition.z = interceptZ;
            
            // Decide shot
            this.planShot(ballState, predictedLanding);
            
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
    
    planShot(ballState, landing) {
        // Decide where to hit the ball
        const difficulty = this.difficulty;
        
        // Target: corners or center based on difficulty
        const targets = [
            { x: -0.5, z: 0.8 },  // wide to player left
            { x: 0.5, z: 0.8 },   // wide to player right
            { x: 0, z: 0.6 },     // deep center
            { x: -0.3, z: 0.5 },  // short left
            { x: 0.3, z: 0.5 },   // short right
        ];
        
        // Higher difficulty = better target selection
        const targetIndex = Math.floor(Math.random() * Math.max(1, targets.length * difficulty + 1));
        const target = targets[Math.min(targetIndex, targets.length - 1)];
        
        this.targetX = target.x;
        
        // Calculate required velocity - slower shots for easier play
        const dist = Math.sqrt(target.x * target.x + (target.z - landing.z) ** 2);
        this.shotPower = 2.2 + difficulty * 2.0 + dist * 1.0;
        
        // Spin based on shot type
        const shotType = Math.random();
        if (shotType < 0.4) {
            // Topspin
            this.shotSpin.set(-10 - difficulty * 30, 0, 0);
        } else if (shotType < 0.7) {
            // Backspin
            this.shotSpin.set(10 + difficulty * 20, 0, 0);
        } else {
            // Sidespin or no spin
            this.shotSpin.set((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 15);
        }
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
    
    getHitData() {
        // Return velocity and spin for the hit
        const angleX = this.targetX * 0.3;
        const angleY = 0.2 + Math.random() * 0.3;
        
        const speed = this.shotPower * (0.7 + Math.random() * 0.3);
        
        return {
            velocity: new THREE.Vector3(
                angleX * speed,
                angleY * speed,
                speed * 0.8
            ),
            spin: this.shotSpin.clone(),
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
