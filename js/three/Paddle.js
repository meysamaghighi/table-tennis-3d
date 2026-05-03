/**
 * Player Paddle
 * Realistic paddle geometry with rubber visualization and swing animation.
 */

import * as THREE from 'three';

export class PaddleMesh {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        
        // Blade dimensions (in meters)
        const bladeW = 0.15;
        const bladeH = 0.16;
        const bladeThickness = 0.006;
        const handleW = 0.035;
        const handleH = 0.09;
        const handleThickness = 0.028;
        
        // Blade
        const bladeGeo = new THREE.BoxGeometry(bladeW, bladeH, bladeThickness);
        const bladeMat = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.6,
            metalness: 0.1,
        });
        this.blade = new THREE.Mesh(bladeGeo, bladeMat);
        this.blade.position.y = handleH / 2 + bladeH / 2 - 0.01;
        this.blade.castShadow = true;
        this.group.add(this.blade);
        
        // Handle (flared style)
        const handleGeo = new THREE.BoxGeometry(handleW, handleH, handleThickness);
        const handleMat = new THREE.MeshStandardMaterial({
            color: 0x5c3a1e,
            roughness: 0.5,
            metalness: 0.0,
        });
        this.handle = new THREE.Mesh(handleGeo, handleMat);
        this.handle.position.y = -0.02;
        this.handle.castShadow = true;
        this.group.add(this.handle);
        
        // Handle flare
        const flareGeo = new THREE.BoxGeometry(handleW * 1.3, 0.02, handleThickness);
        const flare = new THREE.Mesh(flareGeo, handleMat);
        flare.position.y = -handleH / 2 + 0.01;
        this.group.add(flare);
        
        // Rubber forehand - on negative local z side (faces opponent for player)
        const rubberThick = 0.003;
        const rubberGeo = new THREE.BoxGeometry(bladeW - 0.002, bladeH - 0.002, rubberThick);
        this.rubberMat = new THREE.MeshStandardMaterial({
            color: 0xb71c1c,
            roughness: 0.5,
            metalness: 0.0,
        });
        this.rubber = new THREE.Mesh(rubberGeo, this.rubberMat);
        this.rubber.position.set(0, handleH / 2 + bladeH / 2 - 0.01, -(bladeThickness / 2 + rubberThick / 2));
        this.group.add(this.rubber);
        
        // Rubber backhand - on positive local z side
        this.rubberBack = new THREE.Mesh(rubberGeo, this.rubberMat.clone());
        this.rubberBack.position.set(0, handleH / 2 + bladeH / 2 - 0.01, bladeThickness / 2 + rubberThick / 2);
        this.group.add(this.rubberBack);
        
        // Edge tape
        const edgeGeo = new THREE.BoxGeometry(bladeW + 0.002, bladeH + 0.002, bladeThickness + rubberThick * 2 + 0.002);
        const edgeMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.7,
        });
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.position.y = handleH / 2 + bladeH / 2 - 0.01;
        edge.scale.set(1.01, 1.01, 1.01);
        this.group.add(edge);
        
        // Logo on rubber
        this.updateLogo();
        
        this.scene.add(this.group);
        
        // Swing animation state
        this.swingState = 'ready'; // ready, backswing, forward, follow, recovery
        this.swingTimer = 0;
        this.swingDuration = {
            backswing: 0.08,
            forward: 0.12,
            follow: 0.15,
            recovery: 0.12,
        };
        
        // Base transform - positioned near the hitting zone
        this.basePosition = new THREE.Vector3(0, 1.0, 0.92);
        this.baseRotation = new THREE.Euler(0, 0, 0);
        
        // Hit tracking
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
    
    updateLogo() {
        // Could add texture with logo here
    }
    
    setRubberColor(color) {
        this.rubberMat.color.set(color);
        this.rubberBack.material.color.set(color);
    }
    
    update(input, dt, ballPosition, ballActive, canHitBall) {
        // Position paddle based on mouse/touch (with player offset)
        const reachX = 0.9;
        const reachY = 0.5;
        
        // Base Z at hitting zone ~0.92m
        const baseZ = 0.92 + input.playerOffset.z * 0.2;
        
        // Auto-track ball horizontally (40% auto-aim) for easier play
        let targetX = input.mouse.x * reachX + input.playerOffset.x;
        let targetY = 0.82 + input.mouse.y * reachY;
        
        if (ballActive && ballPosition.z > 0 && ballPosition.z < 1.8) {
            targetX = targetX * 0.6 + ballPosition.x * 0.4;
            targetY = targetY * 0.65 + ballPosition.y * 0.35;
        }
        
        const targetZ = baseZ;
        
        // Add some natural sway
        const swayX = Math.sin(Date.now() * 0.002) * 0.005;
        const swayY = Math.cos(Date.now() * 0.0015) * 0.003;
        
        this.basePosition.x = targetX + swayX;
        this.basePosition.y = targetY + swayY;
        this.basePosition.z = targetZ;
        
        // Update swing animation
        this.updateSwing(dt, ballPosition, ballActive);
        
        // Apply transforms
        this.group.position.copy(this.basePosition);
        
        // Rotation: paddle angle from scroll/touch + swing rotation
        const paddleAngle = input.paddleAngle;
        
        // Calculate rotation based on swing state
        let swingRotX = 0;
        let swingRotZ = 0;
        let swingOffsetZ = 0;
        
        switch (this.swingState) {
            case 'backswing':
                const backProgress = this.swingTimer / this.swingDuration.backswing;
                swingRotX = -0.3 * backProgress;
                swingOffsetZ = 0.08 * backProgress;
                break;
            case 'forward':
                const fwdProgress = this.swingTimer / this.swingDuration.forward;
                swingRotX = -0.3 + 0.6 * fwdProgress;
                swingOffsetZ = 0.08 - 0.25 * fwdProgress;
                break;
            case 'follow':
                const folProgress = this.swingTimer / this.swingDuration.follow;
                swingRotX = 0.3 * (1 - folProgress);
                swingOffsetZ = -0.17 * (1 - folProgress);
                break;
            case 'recovery':
                swingRotX = 0;
                swingOffsetZ = 0;
                break;
        }
        
        // Apply swing offset
        this.group.position.z += swingOffsetZ;
        
        // Set rotation
        this.group.rotation.set(
            swingRotX + paddleAngle * 0.5,
            -input.mouse.x * 0.35,
            swingRotZ - paddleAngle
        );
        
        // Update hit zone indicator
        this.hitZoneMesh.position.copy(this.getHitPosition());
        if (canHitBall && ballActive) {
            this.hitZoneMesh.material.opacity = 0.12 + Math.sin(Date.now() * 0.01) * 0.06;
        } else {
            this.hitZoneMesh.material.opacity *= 0.9;
        }
    }
    
    updateSwing(dt, ballPosition, ballActive) {
        if (this.swingState === 'ready') {
            return;
        }
        
        this.swingTimer += dt;
        
        const currentDuration = this.swingDuration[this.swingState];
        
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
                    break;
            }
        }
    }
    
    triggerSwing() {
        if (this.swingState === 'ready') {
            this.swingState = 'backswing';
            this.swingTimer = 0;
            this.hasHitThisSwing = false;
        }
    }
    
    isHitting() {
        return this.swingState === 'forward';
    }
    
    canHit() {
        return (this.swingState === 'forward' || this.swingState === 'backswing') && !this.hasHitThisSwing;
    }
    
    markHit() {
        this.hasHitThisSwing = true;
    }
    
    getHitPosition() {
        const pos = this.group.position.clone();
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(this.group.quaternion);
        pos.add(forward.multiplyScalar(0.015));
        return pos;
    }
    
    getPaddleNormal() {
        const normal = new THREE.Vector3(0, 0, -1);
        normal.applyQuaternion(this.group.quaternion);
        return normal.normalize();
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
