/**
 * Visual Effects
 * Particle bursts, screen shake, and hit feedback.
 */

import * as THREE from 'three';

export class EffectsManager {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        
        // Pre-create particle materials
        this.particleMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.015,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true,
            depthWrite: false,
        });
        
        this.sparkMat = new THREE.PointsMaterial({
            color: 0xffaa44,
            size: 0.02,
            transparent: true,
            opacity: 0.9,
            sizeAttenuation: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
    }
    
    spawnHitParticles(position, intensity = 1.0) {
        const count = Math.floor(15 * intensity);
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];
        
        for (let i = 0; i < count; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;
            
            velocities.push(new THREE.Vector3(
                (Math.random() - 0.5) * 2.0,
                (Math.random() - 0.5) * 2.0 + 0.5,
                (Math.random() - 0.5) * 2.0
            ).multiplyScalar(intensity * 1.5));
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const points = new THREE.Points(geometry, this.sparkMat.clone());
        this.scene.add(points);
        
        this.particles.push({
            mesh: points,
            velocities,
            life: 1.0,
            decay: 2.0 + Math.random() * 2.0,
        });
    }
    
    spawnBounceDust(position, intensity = 0.5) {
        const count = Math.floor(10 * intensity);
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];
        
        for (let i = 0; i < count; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;
            
            velocities.push(new THREE.Vector3(
                (Math.random() - 0.5) * 1.0,
                Math.random() * 1.5,
                (Math.random() - 0.5) * 1.0
            ).multiplyScalar(intensity));
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const dustMat = this.particleMat.clone();
        dustMat.color.set(0xaaaaaa);
        dustMat.size = 0.01;
        const points = new THREE.Points(geometry, dustMat);
        this.scene.add(points);
        
        this.particles.push({
            mesh: points,
            velocities,
            life: 1.0,
            decay: 1.5 + Math.random(),
        });
    }
    
    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= p.decay * dt;
            
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                if (p.mesh.material !== this.particleMat && p.mesh.material !== this.sparkMat) {
                    p.mesh.material.dispose();
                }
                this.particles.splice(i, 1);
                continue;
            }
            
            const positions = p.mesh.geometry.attributes.position.array;
            for (let j = 0; j < p.velocities.length; j++) {
                p.velocities[j].y -= 2.0 * dt; // gravity
                positions[j * 3] += p.velocities[j].x * dt;
                positions[j * 3 + 1] += p.velocities[j].y * dt;
                positions[j * 3 + 2] += p.velocities[j].z * dt;
            }
            p.mesh.geometry.attributes.position.needsUpdate = true;
            p.mesh.material.opacity = p.life * 0.8;
        }
    }
    
    dispose() {
        this.particles.forEach(p => {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
        });
        this.particles = [];
    }
}
