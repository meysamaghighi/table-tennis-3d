/**
 * Pro Table Tennis 3D - Main Entry Point
 */

import { SceneManager } from './three/Scene.js';
import { TableManager } from './three/Table.js';
import { BallMesh } from './three/Ball.js';
import { PaddleMesh } from './three/Paddle.js';
import { Opponent } from './three/Opponent.js';
import { InputManager } from './core/Input.js';
import { SwipeInput } from './core/SwipeInput.js';
import { Game } from './core/Game.js';
import { UIManager } from './ui/Menu.js';

class App {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.lastTime = 0;
        this.isRunning = false;
        
        this.init();
    }
    
    async init() {
        try {
            // Detect touch device
            if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
                document.body.classList.add('touch-device');
            }

            // Debug overlays are dev-only — hide unless explicitly requested.
            const DEBUG = new URLSearchParams(location.search).has('debug');
            if (!DEBUG) {
                ['debug-info', 'debug-diagnosis', 'debug-summary'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
            }

            // Core systems
            this.input = new InputManager();
            this.swipeInput = new SwipeInput(this.canvas);
            this.sceneManager = new SceneManager(this.canvas);
            
            // 3D objects
            this.table = new TableManager(this.sceneManager.scene);
            this.ballMesh = new BallMesh(this.sceneManager.scene);
            this.paddle = new PaddleMesh(this.sceneManager.scene);
            this.opponent = new Opponent(this.sceneManager.scene);
            
            // Game logic
            this.game = new Game(
                this.sceneManager,
                this.paddle,
                this.opponent,
                this.ballMesh,
                this.input,
                this.swipeInput
            );
            
            // UI
            this.ui = new UIManager(this.game);
            
            // Setup mobile controls
            this.setupMobileControls();
            
            // Start loop
            this.isRunning = true;
            this.ui.hideLoading();
            
            // Handle pointer lock for game (desktop only)
            this.setupPointerLock();
            
            requestAnimationFrame((t) => this.loop(t));
            
        } catch (error) {
            console.error('Failed to initialize game:', error);
            document.querySelector('#loading-screen p').textContent = 
                'Error loading game. Please refresh.';
        }
    }
    
    setupMobileControls() {
        // Serving is a swipe-up now (SwipeInput → Game.handleSwipeInput); no TOSS button.
        // Paddle angle is auto-determined from ball/swing state; no manual control.
        // Only the pause button remains.
        const pauseBtn = document.getElementById('btn-mobile-pause');

        if (pauseBtn) {
            pauseBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (this.game.state === 'rally' || this.game.state === 'serving') {
                    this.game.setState('paused');
                }
            }, { passive: false });
            pauseBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (this.game.state === 'rally' || this.game.state === 'serving') {
                    this.game.setState('paused');
                }
            });
        }
    }
    
    setupPointerLock() {
        // POINTER LOCK DISABLED - it breaks mouse tracking on macOS
        // Mouse uses movement accumulation instead
    }
    
    loop(time) {
        if (!this.isRunning) return;
        
        requestAnimationFrame((t) => this.loop(t));
        
        const dt = Math.min((time - this.lastTime) / 1000, 0.05); // Cap dt at 50ms
        this.lastTime = time;
        
        if (dt <= 0) return;
        
        // Update game
        this.game.update(dt);
        
        // Update UI
        this.ui.update(dt);
        
        // Render
        this.sceneManager.render();
    }
    
    dispose() {
        this.isRunning = false;
        this.input.dispose();
        this.swipeInput.dispose();
        this.sceneManager.dispose();
        this.paddle.dispose();
        this.opponent.dispose();
    }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new App());
} else {
    new App();
}
