/**
 * Ball Mesh with spin visualization
 */

import * as THREE from 'three';

export class BallMesh {
    constructor(scene) {
        this.scene = scene;
        
        // Ball geometry
        const geometry = new THREE.SphereGeometry(0.02, 32, 32);
        
        // Create ball texture - white with seam line
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // White background
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(0, 0, 512, 256);
        
        // Add subtle noise for realism
        for (let i = 0; i < 5000; i++) {
            ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.02})`;
            ctx.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
        }
        
        // Seam line
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(0, 128);
        ctx.lineTo(512, 128);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // ITTF logo area
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(200, 110, 112, 36);
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.strokeRect(200, 110, 112, 36);
        ctx.fillStyle = '#999';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('40+', 256, 134);
        
        // Brand text
        ctx.fillStyle = '#aaa';
        ctx.font = '10px Arial';
        ctx.fillText('PRO TABLE TENNIS', 100, 130);
        
        const texture = new THREE.CanvasTexture(canvas);
        
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            color: 0xffffff,
            roughness: 0.4,
            metalness: 0.0,
            emissive: 0xffffff,
            emissiveIntensity: 0.15,
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.scene.add(this.mesh);
        
        // Glow light that follows the ball
        this.glowLight = new THREE.PointLight(0xffffcc, 0.8, 1.5);
        this.scene.add(this.glowLight);
        
        // Trail effect
        this.trailPositions = [];
        this.maxTrailLength = 15;
        this.trailMesh = null;
        this.createTrail();
        
        // Spin indicator (small arrows around ball when spinning fast)
        this.spinIndicator = null;
        this.createSpinIndicator();
        
        // Shadow blob on table
        this.shadowBlob = new THREE.Mesh(
            new THREE.CircleGeometry(0.025, 16),
            new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.3,
            })
        );
        this.shadowBlob.rotation.x = -Math.PI / 2;
        this.scene.add(this.shadowBlob);
    }
    
    createTrail() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxTrailLength * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.015,
            transparent: true,
            opacity: 0.4,
            sizeAttenuation: true,
        });
        
        this.trailMesh = new THREE.Points(geometry, material);
        this.scene.add(this.trailMesh);
    }
    
    createSpinIndicator() {
        // Ring around ball that shows spin axis
        const geometry = new THREE.TorusGeometry(0.035, 0.002, 8, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0,
            depthTest: false,
        });
        this.spinIndicator = new THREE.Mesh(geometry, material);
        this.scene.add(this.spinIndicator);
    }
    
    update(position, spin, velocity) {
        // Update ball position
        this.mesh.position.copy(position);
        
        // Rotate ball based on spin (visual only)
        if (spin && spin.length() > 0.1) {
            const spinAxis = spin.clone().normalize();
            const spinAmount = spin.length() * 0.001;
            this.mesh.rotateOnWorldAxis(spinAxis, spinAmount);
            
            // Show spin indicator for high spin
            const spinStrength = spin.length();
            this.spinIndicator.material.opacity = Math.min(0.6, spinStrength / 50);
            this.spinIndicator.position.copy(position);
            
            // Orient ring perpendicular to spin axis
            const up = new THREE.Vector3(0, 1, 0);
            const quat = new THREE.Quaternion().setFromUnitVectors(up, spinAxis);
            this.spinIndicator.quaternion.copy(quat);
        } else {
            this.spinIndicator.material.opacity = 0;
        }
        
        // Update trail
        this.trailPositions.unshift(position.clone());
        if (this.trailPositions.length > this.maxTrailLength) {
            this.trailPositions.pop();
        }
        
        const positions = this.trailMesh.geometry.attributes.position.array;
        for (let i = 0; i < this.maxTrailLength; i++) {
            if (i < this.trailPositions.length) {
                positions[i * 3] = this.trailPositions[i].x;
                positions[i * 3 + 1] = this.trailPositions[i].y;
                positions[i * 3 + 2] = this.trailPositions[i].z;
            } else {
                positions[i * 3] = 0;
                positions[i * 3 + 1] = -100;
                positions[i * 3 + 2] = 0;
            }
        }
        this.trailMesh.geometry.attributes.position.needsUpdate = true;

        // Trail intensity scales with ball speed — faster shots streak brighter
        // and thicker, slow pushes barely trail.
        if (velocity) {
            const speed = velocity.length();
            const t = Math.max(0, Math.min(1, speed / 9));
            this.trailMesh.material.opacity = 0.12 + t * 0.55;
            this.trailMesh.material.size = 0.012 + t * 0.016;
            this.glowLight.intensity = 0.5 + t * 0.9;
        }

        // Update glow light
        if (this.glowLight) {
            this.glowLight.position.copy(position);
        }
        
        // Update shadow blob
        if (position.y < 1.5) {
            this.shadowBlob.position.set(position.x, 0.76 + 0.001, position.z);
            const dist = position.y - 0.76;
            const scale = 1 + dist * 2;
            this.shadowBlob.scale.set(scale, scale, 1);
            this.shadowBlob.material.opacity = Math.max(0, 0.4 - dist * 0.3);
            this.shadowBlob.visible = true;
        } else {
            this.shadowBlob.visible = false;
        }
    }
    
    setVisible(visible) {
        this.mesh.visible = visible;
        this.trailMesh.visible = visible;
        this.spinIndicator.visible = visible;
        this.shadowBlob.visible = visible;
    }
}
