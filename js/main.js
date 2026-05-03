/**
 * Pro Table Tennis 3D - Main Entry Point
 */

import { SceneManager } from './three/Scene.js';
import { TableManager } from './three/Table.js';
import { BallMesh } from './three/Ball.js';
import { PaddleMesh } from './three/Paddle.js';
import { Opponent } from './three/Opponent.js';
import { InputManager } from './core/Input.js';
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
            
            // Core systems
            this.input = new InputManager();
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
                this.input
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
        const swingBtn = document.getElementById('btn-mobile-swing');
        const tossBtn = document.getElementById('btn-mobile-toss');
        const pauseBtn = document.getElementById('btn-mobile-pause');
        const angleUpBtn = document.getElementById('btn-angle-up');
        const angleDownBtn = document.getElementById('btn-angle-down');
        
        if (swingBtn) {
            swingBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.input.triggerSwing();
            }, { passive: false });
            // Also support click for hybrid devices
            swingBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.input.triggerSwing();
            });
        }
        
        if (tossBtn) {
            tossBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.game.tossBall();
            }, { passive: false });
            tossBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.game.tossBall();
            });
        }
        
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
        
        if (angleUpBtn) {
            angleUpBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.input.paddleAngleTarget = Math.min(0.8, this.input.paddleAngleTarget + 0.15);
            }, { passive: false });
            angleUpBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.input.paddleAngleTarget = Math.min(0.8, this.input.paddleAngleTarget + 0.15);
            });
        }
        
        if (angleDownBtn) {
            angleDownBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.input.paddleAngleTarget = Math.max(-0.8, this.input.paddleAngleTarget - 0.15);
            }, { passive: false });
            angleDownBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.input.paddleAngleTarget = Math.max(-0.8, this.input.paddleAngleTarget - 0.15);
            });
        }
    }
    
    setupPointerLock() {
        // Click on game canvas to lock pointer (desktop only)
        this.canvas.addEventListener('click', () => {
            if (this.game.state === 'rally' ||
                this.game.state === 'serving') {
                this.input.lockPointer(this.canvas);
            }
        });
        
        // Handle ESC to pause
        this.input.on('pointerlockchange', (locked) => {
            if (!locked && (this.game.state === 'rally' ||
                this.game.state === 'serving')) {
                this.game.setState('paused');
            }
        });
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
