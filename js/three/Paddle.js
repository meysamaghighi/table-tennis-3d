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
        
        // --- Rounded blade using Shape + ExtrudeGeometry ---
        const bladeW = 0.075;
        const bladeH = 0.08;
        const cornerR = 0.025;
        
        const bladeShape = new THREE.Shape();
        bladeShape.moveTo(0, -bladeH + cornerR);
        bladeShape.quadraticCurveTo(-bladeW, -bladeH, -bladeW + cornerR, -bladeH);
        bladeShape.lineTo(bladeW - cornerR, -bladeH);
        bladeShape.quadraticCurveTo(bladeW, -bladeH, bladeW, -bladeH + cornerR);
        bladeShape.lineTo(bladeW, bladeH - cornerR);
        bladeShape.quadraticCurveTo(bladeW, bladeH, bladeW - cornerR, bladeH);
        bladeShape.lineTo(-bladeW + cornerR, bladeH);
        bladeShape.quadraticCurveTo(-bladeW, bladeH, -bladeW, bladeH - cornerR);
        bladeShape.lineTo(-bladeW, -bladeH + cornerR);
        
        const bladeThickness = 0.006;
        const extrudeSettings = {
            depth: bladeThickness,
            bevelEnabled: true,
            bevelThickness: 0.002,
            bevelSize: 0.002,
            bevelSegments: 3,
        };
        
        const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, extrudeSettings);
        bladeGeo.translate(0, handleH / 2 + bladeH * 0.3, -bladeThickness / 2);
        
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
        rubberGeo.translate(0, handleH / 2 + bladeH * 0.3, -(bladeThickness + rubberThick));
        
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
        rubberBackGeo.translate(0, handleH / 2 + bladeH * 0.3, bladeThickness);
        this.rubberBack = new THREE.Mesh(rubberBackGeo, this.rubberMat.clone());
        this.group.add(this.rubberBack);
        
        // Edge tape
        const tapeShape = new THREE.Shape();
        const tw = bladeW + 0.003;
        const th = bladeH + 0.003;
        const tr = cornerR + 0.003;
        tapeShape.moveTo(0, -th + tr);
        tapeShape.quadraticCurveTo(-tw, -th, -tw + tr, -th);
        tapeShape.lineTo(tw - tr, -th);
        tapeShape.quadraticCurveTo(tw, -th, tw, -th + tr);
        tapeShape.lineTo(tw, th - tr);
        tapeShape.quadraticCurveTo(tw, th, tw - tr, th);
        tapeShape.lineTo(-tw + tr, th);
        tapeShape.quadraticCurveTo(-tw, th, -tw, th - tr);
        tapeShape.lineTo(-tw, -th + tr);
        
        const holeShape = new THREE.Path();
        holeShape.moveTo(0, -bladeH + cornerR);
        holeShape.quadraticCurveTo(-bladeW, -bladeH, -bladeW + cornerR, -bladeH);
        holeShape.lineTo(bladeW - cornerR, -bladeH);
        holeShape.quadraticCurveTo(bladeW, -bladeH, bladeW, -bladeH + cornerR);
        holeShape.lineTo(bladeW, bladeH - cornerR);
        holeShape.quadraticCurveTo(bladeW, bladeH, bladeW - cornerR, bladeH);
        holeShape.lineTo(-bladeW + cornerR, bladeH);
        holeShape.quadraticCurveTo(-bladeW, bladeH, -bladeW, bladeH - cornerR);
        holeShape.lineTo(-bladeW, -bladeH + cornerR);
        tapeShape.holes.push(holeShape);
        
        const tapeGeo = new THREE.ExtrudeGeometry(tapeShape, {
            depth: bladeThickness + rubberThick * 2 + 0.002,
            bevelEnabled: false,
        });
        tapeGeo.translate(0, handleH / 2 + bladeH * 0.3, -(bladeThickness / 2 + rubberThick + 0.001));
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
    
    update(input, dt, ballState, canHitBall, autoTune) {
        const ballPosition = ballState.position;
        const ballVelocity = ballState.velocity;
        const ballActive = ballState.active;

        const reachX = 0.9;
        const reachY = 0.40;

        // Use absolute cursor; fall back to accumulated movement only when meaningful.
        let mouseX = input.mouse.x;
        let mouseY = input.mouse.y;
        if (Math.abs(input.virtualMouseX) > 0.05) mouseX = input.virtualMouseX;
        if (Math.abs(input.virtualMouseY) > 0.05) mouseY = input.virtualMouseY;

        // ---- Target position
        let targetX = mouseX * reachX + input.playerOffset.x;
        let targetY = 0.95 + mouseY * reachY;
        // Rest behind the player's end line (TABLE_LENGTH/2 = 1.37). Player W/S nudges it.
        let targetZ = 1.70 + input.playerOffset.z * 0.2;

        const trackY = (autoTune && autoTune.get('autoTrackY')) || 0.7;

        // Auto-track ball when it's on the player's half (or just past the net).
        if (ballActive && ballPosition.z > -0.3 && ballPosition.z < 2.3) {
            // X: player controls placement, ball nudges
            targetX = targetX * 0.60 + ballPosition.x * 0.40;
            // Y: mostly automatic so kids don't have to align by hand
            targetY = targetY * (1 - trackY) + ballPosition.y * trackY;

            // Short-ball reach: paddle comes "on" the table when the ball is short.
            // Maps ball z in [-0.1 .. 1.2] to forward extension in [0.85 .. 0] m.
            if (ballPosition.z < 1.25) {
                const forwardness = Math.max(0, Math.min(1, (1.25 - ballPosition.z) / 1.35));
                targetZ = targetZ - forwardness * 0.85;
            }
        }

        // ---- Table-surface constraint
        // When the paddle is hovering over the table, it must stay above the surface
        // (allow the head to come close — short pushes ride low — but never inside).
        const overTable = targetZ < TABLE_LENGTH / 2 + 0.05;
        const minY = overTable ? TABLE_HEIGHT + 0.025 : 0.55;
        if (targetY < minY) targetY = minY;

        // ---- Smooth toward target (frame-rate independent damping). No more jumps.
        const posSmooth = 1 - Math.exp(-14 * dt);
        this.basePosition.x += (targetX - this.basePosition.x) * posSmooth;
        this.basePosition.y += (targetY - this.basePosition.y) * posSmooth;
        this.basePosition.z += (targetZ - this.basePosition.z) * posSmooth;

        // ---- Automatic paddle orientation (no more scroll-wheel angle).
        // Pro heuristic: face follows the ball — closed face for descending/high
        // balls (drive down), open face for low/ascending balls (lift).
        let autoPitch = 0;
        let autoYaw   = -mouseX * 0.22;

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
    
    getPaddleVelocity(autoTune) {
        if (this.swingState === 'forward' || this.swingState === 'backswing') {
            const thrust = (autoTune && autoTune.get('paddleThrust')) || 3.2;
            return new THREE.Vector3(0, 0, -thrust);
        }
        return new THREE.Vector3(0, 0, 0);
    }
    
    dispose() {
        this.scene.remove(this.group);
        this.scene.remove(this.hitZoneMesh);
    }
}
