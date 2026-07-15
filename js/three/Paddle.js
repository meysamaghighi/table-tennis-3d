/**
 * Player Paddle with realistic rounded blade shape
 */

import * as THREE from 'three';
import { TABLE_HEIGHT, TABLE_LENGTH } from '../core/Physics.js';

export class PaddleMesh {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        
        const handleH = 0.09;
        const handleThickness = 0.028;
        
        // --- Round blade (circular, like a real table-tennis paddle) ---
        const bladeR = 0.078;
        // Blade centre sits above the handle so the two overlap at the throat.
        const bladeCenterY = handleH / 2 + bladeR * 0.55;

        const bladeShape = new THREE.Shape();
        bladeShape.absarc(0, 0, bladeR, 0, Math.PI * 2, false);

        const bladeThickness = 0.006;
        const extrudeSettings = {
            depth: bladeThickness,
            bevelEnabled: true,
            bevelThickness: 0.002,
            bevelSize: 0.002,
            bevelSegments: 3,
        };
        
        const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, extrudeSettings);
        bladeGeo.translate(0, bladeCenterY, -bladeThickness / 2);
        
        const bladeMat = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.6,
            metalness: 0.1,
        });
        this.blade = new THREE.Mesh(bladeGeo, bladeMat);
        this.blade.castShadow = true;
        this.group.add(this.blade);
        
        // Handle
        const handleGeo = new THREE.BoxGeometry(0.035, handleH, handleThickness);
        const handleMat = new THREE.MeshStandardMaterial({
            color: 0x5c3a1e,
            roughness: 0.5,
        });
        this.handle = new THREE.Mesh(handleGeo, handleMat);
        this.handle.position.y = -0.02;
        this.handle.castShadow = true;
        this.group.add(this.handle);
        
        // Handle flare
        const flare = new THREE.Mesh(
            new THREE.BoxGeometry(0.045, 0.02, handleThickness),
            handleMat
        );
        flare.position.y = -handleH / 2 + 0.01;
        this.group.add(flare);
        
        // Rubber forehand
        const rubberThick = 0.003;
        const rubberGeo = new THREE.ExtrudeGeometry(bladeShape, {
            depth: rubberThick,
            bevelEnabled: false,
        });
        rubberGeo.translate(0, bladeCenterY, -(bladeThickness + rubberThick));
        
        this.rubberMat = new THREE.MeshStandardMaterial({
            color: 0xb71c1c,
            roughness: 0.5,
            metalness: 0.0,
        });
        this.rubber = new THREE.Mesh(rubberGeo, this.rubberMat);
        this.group.add(this.rubber);
        
        // Rubber backhand
        const rubberBackGeo = new THREE.ExtrudeGeometry(bladeShape, {
            depth: rubberThick,
            bevelEnabled: false,
        });
        rubberBackGeo.translate(0, bladeCenterY, bladeThickness);
        this.rubberBack = new THREE.Mesh(rubberBackGeo, this.rubberMat.clone());
        this.group.add(this.rubberBack);
        
        // Edge tape (circular ring around the blade)
        const tapeShape = new THREE.Shape();
        tapeShape.absarc(0, 0, bladeR + 0.003, 0, Math.PI * 2, false);
        const holeShape = new THREE.Path();
        holeShape.absarc(0, 0, bladeR, 0, Math.PI * 2, true);
        tapeShape.holes.push(holeShape);
        
        const tapeGeo = new THREE.ExtrudeGeometry(tapeShape, {
            depth: bladeThickness + rubberThick * 2 + 0.002,
            bevelEnabled: false,
        });
        tapeGeo.translate(0, bladeCenterY, -(bladeThickness / 2 + rubberThick + 0.001));
        const tapeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
        this.group.add(new THREE.Mesh(tapeGeo, tapeMat));
        
        this.scene.add(this.group);
        
        // Swing state
        this.swingState = 'ready';
        this.swingTimer = 0;
        this.swingDuration = {
            backswing: 0.08,
            forward: 0.12,
            follow: 0.15,
            recovery: 0.12,
        };
        
        // Resting paddle position sits BEHIND the player's end line
        // (TABLE_LENGTH/2 = 1.37) so it never clips through the table surface.
        this.basePosition = new THREE.Vector3(0, 1.0, 1.70);
        this.hasHitThisSwing = false;
        
        // Hit zone indicator
        this.hitZoneMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.55, 16, 16),
            new THREE.MeshBasicMaterial({
                color: 0x00ff88,
                transparent: true,
                opacity: 0,
                wireframe: true,
            })
        );
        this.scene.add(this.hitZoneMesh);
    }
    
    setRubberColor(color) {
        this.rubberMat.color.set(color);
        this.rubberBack.material.color.set(color);
    }
    
    update(input, swipeInput, dt, ballState, canHitBall, autoTune) {
        const ballPosition = ballState.position;
        const ballVelocity = ballState.velocity;
        const ballActive = ballState.active;

        // ---- Finger/mouse → table-space mapping (control zone: lower ~45%
        // of the screen). The paddle tracks the pointer 1:1 — no ball-follow
        // or auto-track blending. `swipeInput.position.x` is -1..1 across
        // the full screen width; `.y` is 0 (pushed up, reaching over the
        // table) .. 1 (resting near the player) within the control zone.
        const reachX = 0.75;
        const minHeight = 0.78;
        const maxHeight = 1.35;
        const maxForwardReach = 1.15;

        const sx = swipeInput.position.x;
        const sy = swipeInput.position.y;

        let targetX = sx * reachX;
        let targetY = minHeight + sy * (maxHeight - minHeight);
        // Rest behind the player's end line (TABLE_LENGTH/2 = 1.37); dragging
        // up shortens that offset so the paddle reaches over the table.
        // Player W/S still nudges the rest depth.
        let targetZ = 1.70 + input.playerOffset.z * 0.2 - (1 - sy) * maxForwardReach;

        // ---- Table-surface constraint
        // When the paddle is hovering over the table, it must stay above the surface
        // (allow the head to come close — short pushes ride low — but never inside).
        const overTable = targetZ < TABLE_LENGTH / 2 + 0.05;
        const minY = overTable ? TABLE_HEIGHT + 0.025 : 0.55;
        if (targetY < minY) targetY = minY;

        // ---- Apply directly: finger drives the paddle 1:1, no lag.
        this.basePosition.set(targetX, targetY, targetZ);

        // ---- Automatic paddle orientation (no more scroll-wheel angle).
        // Pro heuristic: face follows the ball — closed face for descending/high
        // balls (drive down), open face for low/ascending balls (lift).
        let autoPitch = 0;
        let autoYaw   = -sx * 0.22;

        if (ballActive && ballPosition.z > -0.6 && ballPosition.z < 2.3) {
            const heightDiff = ballPosition.y - this.basePosition.y;     // + ball above paddle
            autoPitch = heightDiff * 0.9;                                // tilt face toward the ball
            if (ballVelocity.y < -0.5) autoPitch += 0.18;                // descending → close face
            else if (ballVelocity.y > 0.5) autoPitch -= 0.12;            // ascending → open face
            // Slight yaw adjust toward ball X so face squares up.
            autoYaw += (ballPosition.x - this.basePosition.x) * 0.20;
        }
        autoPitch = Math.max(-0.45, Math.min(0.45, autoPitch));
        autoYaw   = Math.max(-0.55, Math.min(0.55, autoYaw));

        const rotSmooth = 1 - Math.exp(-10 * dt);
        this._smPitch = (this._smPitch || 0) + (autoPitch - (this._smPitch || 0)) * rotSmooth;
        this._smYaw   = (this._smYaw   || 0) + (autoYaw   - (this._smYaw   || 0)) * rotSmooth;

        // ---- Swing animation (transient pose on top of rest pose)
        this.updateSwing(dt);

        let swingRotX = 0;
        let swingOffsetZ = 0;
        switch (this.swingState) {
            case 'backswing': {
                const bp = this.swingTimer / this.swingDuration.backswing;
                swingRotX = -0.30 * bp;
                swingOffsetZ = 0.08 * bp;
                break;
            }
            case 'forward': {
                const fp = this.swingTimer / this.swingDuration.forward;
                swingRotX = -0.30 + 0.60 * fp;
                swingOffsetZ = 0.08 - 0.25 * fp;
                break;
            }
            case 'follow': {
                const fop = this.swingTimer / this.swingDuration.follow;
                swingRotX = 0.30 * (1 - fop);
                swingOffsetZ = -0.17 * (1 - fop);
                break;
            }
        }

        // Apply
        this.group.position.copy(this.basePosition);
        this.group.position.z += swingOffsetZ;
        this.group.rotation.set(
            swingRotX + this._smPitch,
            this._smYaw,
            0
        );

        this.hitZoneMesh.visible = false;
    }
    
    updateSwing(dt) {
        if (this.swingState === 'ready') return;
        this.swingTimer += dt;
        if (this.swingTimer >= this.swingDuration[this.swingState]) {
            this.swingTimer = 0;
            const next = { backswing: 'forward', forward: 'follow', follow: 'recovery', recovery: 'ready' };
            this.swingState = next[this.swingState];
        }
    }
    
    triggerSwing() {
        if (this.swingState === 'ready') {
            this.swingState = 'backswing';
            this.swingTimer = 0;
            this.hasHitThisSwing = false;
        }
    }
    
    canHit() {
        return (this.swingState === 'forward' || this.swingState === 'backswing') && !this.hasHitThisSwing;
    }
    
    markHit() {
        this.hasHitThisSwing = true;
    }
    
    getHitPosition() {
        const pos = this.group.position.clone();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
        pos.add(forward.multiplyScalar(0.015));
        return pos;
    }
    
    getPaddleNormal() {
        return new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion).normalize();
    }
    
    dispose() {
        this.scene.remove(this.group);
        this.scene.remove(this.hitZoneMesh);
    }
}
