/**
 * Table Tennis Table and Net
 * Realistic table geometry with proper materials.
 */

import * as THREE from 'three';
import { TABLE_LENGTH, TABLE_WIDTH, TABLE_HEIGHT, NET_HEIGHT, NET_OVERHANG } from '../core/Physics.js';

export class TableManager {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;
        this.net = null;
        this.createTable();
        this.createNet();
    }
    
    createTable() {
        const group = new THREE.Group();
        
        // Table surface - ITTF competition blue
        const surfaceGeo = new THREE.BoxGeometry(TABLE_WIDTH, 0.025, TABLE_LENGTH);
        const surfaceMat = new THREE.MeshStandardMaterial({
            color: 0x1d5fb0,
            roughness: 0.35,
            metalness: 0.05,
        });
        const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
        surface.position.y = TABLE_HEIGHT;
        surface.castShadow = true;
        surface.receiveShadow = true;
        group.add(surface);
        
        // White lines on table
        const lineWidth = 0.02;
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        // Center line
        const centerLine = new THREE.Mesh(
            new THREE.BoxGeometry(lineWidth, 0.003, TABLE_LENGTH),
            lineMat
        );
        centerLine.position.set(0, TABLE_HEIGHT + 0.014, 0);
        group.add(centerLine);
        
        // End lines
        const endLineGeo = new THREE.BoxGeometry(TABLE_WIDTH, 0.003, lineWidth);
        [-1, 1].forEach(side => {
            const line = new THREE.Mesh(endLineGeo, lineMat);
            line.position.set(0, TABLE_HEIGHT + 0.014, side * TABLE_LENGTH / 2);
            group.add(line);
        });
        
        // Side lines
        const sideLineGeo = new THREE.BoxGeometry(lineWidth, 0.003, TABLE_LENGTH);
        [-1, 1].forEach(side => {
            const line = new THREE.Mesh(sideLineGeo, lineMat);
            line.position.set(side * TABLE_WIDTH / 2, TABLE_HEIGHT + 0.014, 0);
            group.add(line);
        });
        
        // Net line (white tape on top)
        const netLine = new THREE.Mesh(
            new THREE.BoxGeometry(TABLE_WIDTH + 0.04, 0.004, 0.015),
            lineMat
        );
        netLine.position.set(0, TABLE_HEIGHT + NET_HEIGHT, 0);
        group.add(netLine);
        
        // Table edge banding
        const edgeThickness = 0.02;
        const edgeMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.3,
            metalness: 0.3,
        });
        
        // Side edges
        [-1, 1].forEach(side => {
            const edge = new THREE.Mesh(
                new THREE.BoxGeometry(edgeThickness, 0.03, TABLE_LENGTH),
                edgeMat
            );
            edge.position.set(side * (TABLE_WIDTH / 2 + edgeThickness / 2), TABLE_HEIGHT, 0);
            edge.castShadow = true;
            group.add(edge);
        });
        
        // End edges
        [-1, 1].forEach(side => {
            const edge = new THREE.Mesh(
                new THREE.BoxGeometry(TABLE_WIDTH + edgeThickness * 2, 0.03, edgeThickness),
                edgeMat
            );
            edge.position.set(0, TABLE_HEIGHT, side * (TABLE_LENGTH / 2 + edgeThickness / 2));
            edge.castShadow = true;
            group.add(edge);
        });
        
        // Legs
        const legMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.4,
            metalness: 0.6,
        });
        
        const legPositions = [
            [-TABLE_WIDTH / 2 + 0.15, -TABLE_LENGTH / 2 + 0.2],
            [TABLE_WIDTH / 2 - 0.15, -TABLE_LENGTH / 2 + 0.2],
            [-TABLE_WIDTH / 2 + 0.15, TABLE_LENGTH / 2 - 0.2],
            [TABLE_WIDTH / 2 - 0.15, TABLE_LENGTH / 2 - 0.2],
        ];
        
        legPositions.forEach(([x, z]) => {
            const leg = new THREE.Mesh(
                new THREE.CylinderGeometry(0.025, 0.025, TABLE_HEIGHT - 0.01, 16),
                legMat
            );
            leg.position.set(x, TABLE_HEIGHT / 2, z);
            leg.castShadow = true;
            group.add(leg);
            
            // Foot pad
            const foot = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 0.01, 16),
                new THREE.MeshStandardMaterial({ color: 0x111111 })
            );
            foot.position.set(x, 0.005, z);
            group.add(foot);
        });
        
        // Crossbar
        const crossbar = new THREE.Mesh(
            new THREE.BoxGeometry(TABLE_WIDTH - 0.3, 0.03, 0.03),
            legMat
        );
        crossbar.position.set(0, TABLE_HEIGHT * 0.4, 0);
        crossbar.castShadow = true;
        group.add(crossbar);
        
        this.scene.add(group);
        this.mesh = group;
    }
    
    createNet() {
        const group = new THREE.Group();
        
        // Net mesh
        const netWidth = TABLE_WIDTH + NET_OVERHANG * 2;
        const netGeo = new THREE.PlaneGeometry(netWidth, NET_HEIGHT, 20, 10);
        
        // Create net texture with grid pattern
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.strokeStyle = 'rgba(200,200,200,0.6)';
        ctx.lineWidth = 1;
        
        // Grid pattern
        for (let x = 0; x <= 256; x += 8) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 64);
            ctx.stroke();
        }
        for (let y = 0; y <= 64; y += 8) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(256, y);
            ctx.stroke();
        }
        
        // Top tape
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(0, 0, 256, 6);
        
        const netTexture = new THREE.CanvasTexture(canvas);
        netTexture.wrapS = THREE.RepeatWrapping;
        netTexture.wrapT = THREE.RepeatWrapping;
        
        const netMat = new THREE.MeshStandardMaterial({
            map: netTexture,
            transparent: true,
            side: THREE.DoubleSide,
            alphaTest: 0.3,
            roughness: 0.8,
        });
        
        const netMesh = new THREE.Mesh(netGeo, netMat);
        netMesh.position.y = TABLE_HEIGHT + NET_HEIGHT / 2;
        netMesh.position.z = 0;
        group.add(netMesh);
        
        // Net posts
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.3,
            metalness: 0.7,
        });
        
        [-1, 1].forEach(side => {
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.015, 0.015, NET_HEIGHT + 0.04, 12),
                postMat
            );
            post.position.set(
                side * (TABLE_WIDTH / 2 + NET_OVERHANG),
                TABLE_HEIGHT + NET_HEIGHT / 2,
                0
            );
            post.castShadow = true;
            group.add(post);
            
            // Post base
            const base = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 0.015, 12),
                postMat
            );
            base.position.set(
                side * (TABLE_WIDTH / 2 + NET_OVERHANG),
                TABLE_HEIGHT + 0.008,
                0
            );
            group.add(base);
        });
        
        // Net supports (small clamps on table edge)
        [-1, 1].forEach(side => {
            const clamp = new THREE.Mesh(
                new THREE.BoxGeometry(0.02, 0.02, 0.04),
                postMat
            );
            clamp.position.set(
                side * (TABLE_WIDTH / 2 + 0.01),
                TABLE_HEIGHT + 0.01,
                0
            );
            group.add(clamp);
        });
        
        this.scene.add(group);
        this.net = group;
    }
}
