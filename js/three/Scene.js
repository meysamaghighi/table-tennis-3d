/**
 * 3D Scene Setup - Third-person broadcast view
 */

import * as THREE from 'three';

export class SceneManager {
    constructor(canvas) {
        this.canvas = canvas;
        
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
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.scene.fog = new THREE.Fog(0x1a1a2e, 8, 20);
        
        // Third-person broadcast camera - positioned to see full table
        this.camera = new THREE.PerspectiveCamera(
            50, 
            window.innerWidth / window.innerHeight, 
            0.01, 
            50
        );
        // Positioned behind player, elevated, looking down the table
        this.camera.position.set(0, 2.8, 3.6);
        this.camera.lookAt(0, 0.5, 0);
        
        this.setupLighting();
        this.setupEnvironment();
        
        this._resizeHandler = () => this.onResize();
        window.addEventListener('resize', this._resizeHandler);
    }
    
    setupLighting() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.45);
        this.scene.add(ambient);
        
        // Main overhead light
        const mainLight = new THREE.DirectionalLight(0xfff5e6, 1.5);
        mainLight.position.set(0, 5, 1);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 12;
        mainLight.shadow.camera.left = -4;
        mainLight.shadow.camera.right = 4;
        mainLight.shadow.camera.top = 4;
        mainLight.shadow.camera.bottom = -4;
        mainLight.shadow.bias = -0.0005;
        this.scene.add(mainLight);
        
        // Fill from front
        const fillLight = new THREE.DirectionalLight(0xcce0ff, 0.35);
        fillLight.position.set(0, 2, 4);
        this.scene.add(fillLight);
        
        // Rim from back
        const rimLight = new THREE.DirectionalLight(0xffaa77, 0.35);
        rimLight.position.set(0, 3, -4);
        this.scene.add(rimLight);
        
        // Subtle point lights
        const pl1 = new THREE.PointLight(0xff8844, 0.25, 8);
        pl1.position.set(-2.5, 3, 0);
        this.scene.add(pl1);
        
        const pl2 = new THREE.PointLight(0x4488ff, 0.2, 8);
        pl2.position.set(2.5, 3, 0);
        this.scene.add(pl2);
    }
    
    setupEnvironment() {
        // Floor
        const floorGeo = new THREE.PlaneGeometry(24, 24);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a3a,
            roughness: 0.8,
            metalness: 0.1,
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
        
        // Court center line on floor
        const lineGeo = new THREE.PlaneGeometry(2.0, 0.04);
        const lineMat = new THREE.MeshBasicMaterial({ color: 0x444466 });
        const centerLine = new THREE.Mesh(lineGeo, lineMat);
        centerLine.rotation.x = -Math.PI / 2;
        centerLine.position.y = 0.002;
        this.scene.add(centerLine);
        
        // Back wall
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x1e1e2e,
            roughness: 0.9,
        });
        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(24, 10), wallMat);
        backWall.position.set(0, 5, -6);
        backWall.receiveShadow = true;
        this.scene.add(backWall);
        
        // Side walls
        [-1, 1].forEach(side => {
            const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 10), wallMat);
            wall.position.set(side * 7, 5, 0);
            wall.rotation.y = side * Math.PI / 2;
            wall.receiveShadow = true;
            this.scene.add(wall);
        });
        
        // Ceiling
        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(24, 24),
            new THREE.MeshStandardMaterial({ color: 0x151520, roughness: 1 })
        );
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = 6;
        this.scene.add(ceiling);
        
        // Spectator barriers
        [-1, 1].forEach(side => {
            const barrier = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, 0.6, 10),
                new THREE.MeshStandardMaterial({ color: 0x333344 })
            );
            barrier.position.set(side * 2.5, 0.3, 0);
            barrier.castShadow = true;
            this.scene.add(barrier);
        });
    }
    
    updateCameraPosition(playerOffset, paddlePosition, ballPosition) {
        // Smooth third-person broadcast camera
        const targetCamX = playerOffset.x * 0.3;
        const targetCamY = 2.7 + Math.abs(playerOffset.z) * 0.1;
        const targetCamZ = 3.5 + playerOffset.z * 0.2;
        
        this.camera.position.x += (targetCamX - this.camera.position.x) * 0.06;
        this.camera.position.y += (targetCamY - this.camera.position.y) * 0.06;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.06;
        
        // Look at table center, with slight tracking toward ball
        let lookX = 0;
        let lookZ = 0;
        
        if (ballPosition && ballPosition.lengthSq() > 0) {
            lookX = ballPosition.x * 0.2;
            lookZ = ballPosition.z * 0.1;
        }
        
        const lookTarget = new THREE.Vector3(lookX, 0.6, lookZ);
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
