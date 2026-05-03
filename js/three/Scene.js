/**
 * 3D Scene Setup
 * Renderer, camera, lighting, and environment.
 */

import * as THREE from 'three';
import { TABLE_LENGTH, TABLE_WIDTH, TABLE_HEIGHT } from '../core/Physics.js';

export class SceneManager {
    constructor(canvas) {
        this.canvas = canvas;
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ 
            canvas, 
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.scene.fog = new THREE.Fog(0x1a1a2e, 5, 15);
        
        // Camera - First person from player side
        this.camera = new THREE.PerspectiveCamera(
            70, 
            window.innerWidth / window.innerHeight, 
            0.01, 
            50
        );
        this.camera.position.set(0, 1.30, 1.5);
        
        this.setupLighting();
        this.setupEnvironment();
        
        // Resize handler
        this._resizeHandler = () => this.onResize();
        window.addEventListener('resize', this._resizeHandler);
    }
    
    setupLighting() {
        // Ambient
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);
        
        // Main overhead light (simulating venue lighting)
        const mainLight = new THREE.DirectionalLight(0xfff5e6, 1.5);
        mainLight.position.set(0, 4, 0);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 10;
        mainLight.shadow.camera.left = -3;
        mainLight.shadow.camera.right = 3;
        mainLight.shadow.camera.top = 3;
        mainLight.shadow.camera.bottom = -3;
        mainLight.shadow.bias = -0.0005;
        this.scene.add(mainLight);
        
        // Fill light from front
        const fillLight = new THREE.DirectionalLight(0xcce0ff, 0.3);
        fillLight.position.set(0, 2, 3);
        this.scene.add(fillLight);
        
        // Rim light from back
        const rimLight = new THREE.DirectionalLight(0xffaa77, 0.4);
        rimLight.position.set(0, 3, -4);
        this.scene.add(rimLight);
        
        // Subtle point lights for atmosphere
        const pl1 = new THREE.PointLight(0xff8844, 0.3, 6);
        pl1.position.set(-2, 2.5, -1);
        this.scene.add(pl1);
        
        const pl2 = new THREE.PointLight(0x4488ff, 0.2, 6);
        pl2.position.set(2, 2.5, -1);
        this.scene.add(pl2);
    }
    
    setupEnvironment() {
        // Floor
        const floorGeo = new THREE.PlaneGeometry(20, 20);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a3a,
            roughness: 0.8,
            metalness: 0.1,
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
        
        // Floor markings (court lines)
        const lineGeo = new THREE.PlaneGeometry(TABLE_WIDTH + 2, 0.05);
        const lineMat = new THREE.MeshBasicMaterial({ color: 0x444466 });
        
        const centerLine = new THREE.Mesh(lineGeo, lineMat);
        centerLine.rotation.x = -Math.PI / 2;
        centerLine.position.y = 0.002;
        this.scene.add(centerLine);
        
        // Back walls
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x1e1e2e,
            roughness: 0.9,
        });
        
        const backWall = new THREE.Mesh(
            new THREE.PlaneGeometry(20, 8),
            wallMat
        );
        backWall.position.set(0, 4, -5);
        backWall.receiveShadow = true;
        this.scene.add(backWall);
        
        // Side walls
        const leftWall = new THREE.Mesh(
            new THREE.PlaneGeometry(20, 8),
            wallMat
        );
        leftWall.position.set(-6, 4, 0);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.receiveShadow = true;
        this.scene.add(leftWall);
        
        const rightWall = new THREE.Mesh(
            new THREE.PlaneGeometry(20, 8),
            wallMat
        );
        rightWall.position.set(6, 4, 0);
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.receiveShadow = true;
        this.scene.add(rightWall);
        
        // Ceiling
        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(20, 20),
            new THREE.MeshStandardMaterial({ color: 0x151520, roughness: 1 })
        );
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = 5;
        this.scene.add(ceiling);
        
        // Spectator barriers
        for (let side of [-1, 1]) {
            const barrier = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, 0.6, 8),
                new THREE.MeshStandardMaterial({ color: 0x333344 })
            );
            barrier.position.set(side * (TABLE_WIDTH / 2 + 1.5), 0.3, 0);
            barrier.castShadow = true;
            this.scene.add(barrier);
        }
    }
    
    updateCameraPosition(playerOffset, paddlePosition) {
        // Smooth camera following - closer to the action
        const targetX = playerOffset.x * 0.4;
        const targetY = 1.28 + Math.abs(playerOffset.z) * 0.05;
        const targetZ = 1.45 + playerOffset.z * 0.2;
        
        this.camera.position.x += (targetX - this.camera.position.x) * 0.1;
        this.camera.position.y += (targetY - this.camera.position.y) * 0.1;
        this.camera.position.z += (targetZ - this.camera.position.z) * 0.1;
        
        // Look at the table center with slight bias toward paddle
        const lookTarget = new THREE.Vector3(
            paddlePosition.x * 0.25,
            0.75,
            -0.3
        );
        this.camera.lookAt(lookTarget);
    }
    
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    render() {
        this.renderer.render(this.scene, this.camera);
    }
    
    dispose() {
        window.removeEventListener('resize', this._resizeHandler);
        this.renderer.dispose();
    }
}
