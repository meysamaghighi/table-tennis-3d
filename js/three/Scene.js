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
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // Mobile GPUs choke on full DPR + soft shadows. Cap both on touch devices.
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = isTouch ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
        this._isTouch = isTouch;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.scene.fog = new THREE.Fog(0x1a1a2e, 8, 20);
        
        // Third-person camera. Two rigs, chosen by aspect ratio each frame:
        //  - PORTRAIT (phone): lower + closer, wider FOV, table fills the narrow
        //    frame width; a Fury-like behind-the-player view.
        //  - LANDSCAPE (desktop/tablet wide): the original broadcast framing.
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.01,
            50
        );
        this.camera.position.set(0, 2.05, 2.65);
        this.camera.lookAt(0, 0.5, -0.3);

        // Decaying FOV "punch-in" on hard hits (added to the base FOV; negative
        // = zoom in). Kept here so both the rig and the juice can drive it.
        this._fovKick = 0;
        this._curFov = 60;
        this._shake = 0; // decaying screen-shake magnitude (metres)
        
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
        const shadowRes = this._isTouch ? 1024 : 2048;
        mainLight.shadow.mapSize.width = shadowRes;
        mainLight.shadow.mapSize.height = shadowRes;
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
        const aspect = this.camera.aspect || (window.innerWidth / window.innerHeight);
        const portrait = aspect < 1.0;

        const ballX = (ballPosition && ballPosition.lengthSq() > 0) ? ballPosition.x : 0;
        const ballZ = (ballPosition && ballPosition.lengthSq() > 0) ? ballPosition.z : 0;

        let targetCamX, targetCamY, targetCamZ, lookY, lookZ, baseFov, lean;
        if (portrait) {
            // Lower, closer, wider — the table fills the phone's frame width.
            baseFov = 62;
            targetCamY = 2.05 + Math.abs(playerOffset.z) * 0.1;
            targetCamZ = 2.65 + playerOffset.z * 0.2;
            lookY = 0.52;
            lookZ = -0.35;
            lean = 0.15;            // subtle lateral lean following the ball
        } else {
            // Original broadcast framing (desktop / wide tablet).
            baseFov = 50;
            targetCamY = 2.7 + Math.abs(playerOffset.z) * 0.1;
            targetCamZ = 3.5 + playerOffset.z * 0.2;
            lookY = 0.6;
            lookZ = 0;
            lean = 0.10;
        }
        // Lateral lean = player offset plus a clamped follow of the ball's X.
        targetCamX = playerOffset.x * 0.3 + Math.max(-lean, Math.min(lean, ballX * 0.3));

        this.camera.position.x += (targetCamX - this.camera.position.x) * 0.06;
        this.camera.position.y += (targetCamY - this.camera.position.y) * 0.06;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.06;

        // Screen shake: decaying random offset applied on top of the smoothed
        // position (juice on smashes). Applied before lookAt so the view jitters.
        this._shake *= 0.82;
        if (this._shake < 0.001) this._shake = 0;
        if (this._shake > 0) {
            this.camera.position.x += (Math.random() - 0.5) * this._shake;
            this.camera.position.y += (Math.random() - 0.5) * this._shake;
        }

        const lookTarget = new THREE.Vector3(ballX * 0.2, lookY, lookZ + ballZ * 0.1);
        this.camera.lookAt(lookTarget);

        // FOV: base + decaying punch-in. Only touch the projection matrix when
        // it actually changes (updateProjectionMatrix isn't free).
        this._fovKick *= 0.86;
        if (Math.abs(this._fovKick) < 0.05) this._fovKick = 0;
        const fov = baseFov + this._fovKick;
        if (Math.abs(fov - this._curFov) > 0.01) {
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
            this._curFov = fov;
        }
    }

    // Decaying zoom-in punch on impact (juice). strength ~1 = a firm smash.
    triggerImpact(strength = 1) {
        this._fovKick = Math.min(this._fovKick, -3.5 * strength);
    }

    // Decaying camera shake (metres of jitter) on impact.
    triggerShake(magnitude = 0.05) {
        this._shake = Math.max(this._shake, magnitude);
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
