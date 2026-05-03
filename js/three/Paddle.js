/**
 * Player Paddle with realistic rounded blade shape
 */

import * as THREE from 'three';

export class PaddleMesh {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        
        const handleH = 0.09;
        const handleThickness = 0.028;
        
        // --- Rounded blade using Shape + ExtrudeGeometry ---
        const bladeW = 0.075;  // half-width
        const bladeH = 0.08;   // half-height
        const cornerR = 0.025;
        
        const bladeShape = new THREE.Shape();
        // Start at bottom center
        bladeShape.moveTo(0, -bladeH + cornerR);
        // Bottom left corner
        bladeShape.quadraticCurveTo(-bladeW, -bladeH, -bladeW + cornerR, -bladeH);
        // Left side
        bladeShape.lineTo(bladeW - cornerR, -bladeH);
        // Bottom right corner
        bladeShape.quadraticCurveTo(bladeW, -bladeH, bladeW, -bladeH + cornerR);
        // Right side up
        bladeShape.lineTo(bladeW, bladeH - cornerR);
        // Top right corner
        bladeShape.quadraticCurveTo(bladeW, bladeH, bladeW - cornerR, bladeH);
        // Top side
        bladeShape.lineTo(-bladeW + cornerR, bladeH);
        // Top left corner
        bladeShape.quadraticCurveTo(-bladeW, bladeH, -bladeW, bladeH - cornerR);
        // Close
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
        // Center the extrusion
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
        
        // Edge tape (thin ring around blade)
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
        
        this.basePosition = new THREE.Vector3(0, 1.0, 0.92);
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
    
    update(input, dt, ballPosition, ballActive, canHitBall) {
        const reachX = 0.9;
        const reachY = 0.5;
        const baseZ = 0.92 + input.playerOffset.z * 0.2;
        
        // Auto-track ball
        let targetX = input.mouse.x * reachX + input.playerOffset.x;
        let targetY = 0.82 + input.mouse.y * reachY;
        
        if (ballActive && ballPosition.z > 0 && ballPosition.z < 1.8) {
            targetX = targetX * 0.6 + ballPosition.x * 0.4;
            targetY = targetY * 0.65 + ballPosition.y * 0.35;
        }
        
        this.basePosition.set(
            targetX + Math.sin(Date.now() * 0.002) * 0.005,
            targetY + Math.cos(Date.now() * 0.0015) * 0.003,
            baseZ
        );
        
        this.updateSwing(dt);
        
        this.group.position.copy(this.basePosition);
        
        const paddleAngle = input.paddleAngle;
        let swingRotX = 0;
        let swingOffsetZ = 0;
        
        switch (this.swingState) {
            case 'backswing':
                const bp = this.swingTimer / this.swingDuration.backswing;
                swingRotX = -0.3 * bp;
                swingOffsetZ = 0.08 * bp;
                break;
            case 'forward':
                const fp = this.swingTimer / this.swingDuration.forward;
                swingRotX = -0.3 + 0.6 * fp;
                swingOffsetZ = 0.08 - 0.25 * fp;
                break;
            case 'follow':
                const fop = this.swingTimer / this.swingDuration.follow;
                swingRotX = 0.3 * (1 - fop);
                swingOffsetZ = -0.17 * (1 - fop);
                break;
        }
        
        this.group.position.z += swingOffsetZ;
        this.group.rotation.set(
            swingRotX + paddleAngle * 0.5,
            -input.mouse.x * 0.35,
            0 - paddleAngle
        );
        
        this.hitZoneMesh.position.copy(this.getHitPosition());
        if (canHitBall && ballActive) {
            this.hitZoneMesh.material.opacity = 0.12 + Math.sin(Date.now() * 0.01) * 0.06;
        } else {
            this.hitZoneMesh.material.opacity *= 0.9;
        }
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
    
    getPaddleVelocity() {
        if (this.swingState === 'forward' || this.swingState === 'backswing') {
            return new THREE.Vector3(0, 0, -3.5);
        }
        return new THREE.Vector3(0, 0, 0);
    }
    
    dispose() {
        this.scene.remove(this.group);
        this.scene.remove(this.hitZoneMesh);
    }
}
