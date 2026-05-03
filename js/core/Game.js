/**
 * Main Game Logic
 * Manages game state, scoring, rally flow, and hit detection.
 */

import * as THREE from 'three';
import { PhysicsEngine, TABLE_LENGTH } from './Physics.js';
import { Equipment } from './Equipment.js';
import { EffectsManager } from '../three/Effects.js';
import { AudioManager } from './Audio.js';
import { GameDebugger } from './Debugger.js';

const WINNING_SCORE = 11;
const SERVE_CHANGE_INTERVAL = 2;

export const GameState = {
    MENU: 'menu',
    SERVING: 'serving',
    RALLY: 'rally',
    POINT_END: 'point_end',
    PAUSED: 'paused',
    GAME_OVER: 'game_over',
};

export class Game {
    constructor(sceneManager, paddle, opponent, ballMesh, input) {
        this.sceneManager = sceneManager;
        this.paddle = paddle;
        this.opponent = opponent;
        this.ballMesh = ballMesh;
        this.input = input;
        
        this.effects = new EffectsManager(sceneManager.scene);
        this.audio = new AudioManager();
        this.physics = new PhysicsEngine();
        this.equipment = new Equipment();
        this.debugger = new GameDebugger();
        
        this.state = GameState.MENU;
        this.score = { player: 0, opponent: 0 };
        this.server = 'player';
        this.servesRemaining = SERVE_CHANGE_INTERVAL;
        
        this.ballToss = { active: false, velocity: new THREE.Vector3() };
        this.serveBounceCount = 0;
        
        this.pointMessage = '';
        this.pointMessageTimer = 0;
        
        this.lastBounceSide = null;
        this.bouncePositions = [];
        
        this.rallyShotCount = 0;
        this.lastShotType = '';
        
        // Callbacks for UI
        this.onScoreChange = null;
        this.onStateChange = null;
        this.onMessage = null;
        this.onServeChange = null;
        this.onShotInfo = null;
        
        // Paddle hit state
        this.playerHitProcessed = false;
        
        // Input callbacks
        this.input.on('keydown', (code) => this.handleKey(code));
    }
    
    handleKey(code) {
        if (code === 'KeyP') {
            if (this.state === GameState.RALLY || this.state === GameState.SERVING) {
                this.setState(GameState.PAUSED);
            }
        }
        if (code === 'KeyR') {
            if (this.state === GameState.RALLY) {
                this.resetBall();
            }
        }
        if (code === 'Space') {
            if (this.state === GameState.SERVING && this.server === 'player') {
                this.tossBall();
            }
        }
    }
    
    startMatch() {
        this.audio.init();
        this.debugger.resetSession();
        this.score = { player: 0, opponent: 0 };
        this.server = 'player';
        this.servesRemaining = SERVE_CHANGE_INTERVAL;
        this.resetBall();
        this.setState(GameState.SERVING);
        if (this.onServeChange) this.onServeChange(this.server);
        this.debugger.startPoint();
    }
    
    resetBall() {
        this.physics.reset();
        this.ballToss.active = false;
        this.serveBounceCount = 0;
        this.lastBounceSide = null;
        this.bouncePositions = [];
        this.rallyShotCount = 0;
        
        if (this.server === 'player') {
            this.physics.ball.position.set(0, 1.3, 0.8);
        } else {
            this.physics.ball.position.set(0, 1.3, -0.8);
        }
        
        // Update mesh immediately to prevent position flash
        this.ballMesh.setVisible(true);
        this.ballMesh.update(
            this.physics.ball.position,
            new THREE.Vector3(),
            new THREE.Vector3()
        );
    }
    
    tossBall() {
        if (!this.ballToss.active && this.state === GameState.SERVING && this.server === 'player') {
            this.ballToss.active = true;
            this.physics.ball.position.set(0, 1.2, 0.8);
            this.ballToss.velocity.set(
                (Math.random() - 0.5) * 0.2,
                2.4,
                (Math.random() - 0.5) * 0.15
            );
            this.physics.ball.serve(this.ballToss.velocity);
            this.setState(GameState.SERVING); // Still serving until hit
        }
    }
    
    setState(newState) {
        const oldState = this.state;
        this.state = newState;
        if (this.onStateChange) this.onStateChange(newState, oldState);
    }
    
    update(dt) {
        if (this.state === GameState.PAUSED || this.state === GameState.MENU || 
            this.state === GameState.GAME_OVER) {
            return;
        }
        
        // Update input
        this.input.update(dt);
        
        // Update physics
        const events = this.physics.update(dt);
        this.handlePhysicsEvents(events);
        
        const ballState = this.physics.getBallState();
        const paddlePos = this.paddle.getHitPosition();
        const distToBall = ballState.active ? paddlePos.distanceTo(ballState.position) : 999;
        const canHitBall = ballState.active && distToBall < 2.00 && ballState.lastHitBy !== 'player';
        const justClicked = this.input.justClicked();
        
        // ---- DEBUGGER: Log click attempt ----
        if (justClicked && (this.state === GameState.SERVING || this.state === GameState.RALLY)) {
            this.debugger.logClick(
                this.frameCount || 0,
                ballState,
                paddlePos,
                this.paddle.swingState,
                distToBall
            );
        }
        
        // DEBUG: log all clicks
        if (justClicked) {
            console.log('CLICK detected! state=' + this.state + ' ballActive=' + ballState.active + ' ballZ=' + (ballState.position?.z?.toFixed(2) || '--'));
        }
        
        // Player serve: click to auto-toss then hit
        if (this.state === GameState.SERVING && this.server === 'player' && !this.ballToss.active) {
            if (justClicked) {
                console.log('SERVE: tossing ball');
                this.tossBall();
            }
        }
        
        // Check for player hit during serving/rally
        if ((this.state === GameState.SERVING || this.state === GameState.RALLY) && ballState.active) {
            if (justClicked) {
                console.log('SWING triggered');
                this.paddle.triggerSwing();
            }
        }
        
        // Process paddle contact during swing
        if (this.paddle.canHit()) {
            this.checkPaddleContact();
        }
        
        // DEBUG: extremely generous auto-hit fallback (2m radius)
        const inAutoHitZone = ballState.active && distToBall < 2.00 && ballState.lastHitBy !== 'player' && 
            this.paddle.swingState === 'ready';
        if (inAutoHitZone) {
            console.log('AUTO-HIT at dist=' + distToBall.toFixed(2));
            this.paddle.triggerSwing();
        }
        
        // Update opponent AI
        this.opponent.update(dt, ballState, ballState.active);
        
        // Check opponent hit
        if (this.opponent.shouldHit(ballState) && ballState.lastHitBy !== 'opponent') {
            this.handleOpponentHit();
        }
        
        // Auto-serve for AI
        if (this.state === GameState.SERVING && this.server === 'opponent') {
            this.aiServeTimer = (this.aiServeTimer || 0) + dt;
            if (this.aiServeTimer > 1.5) {
                this.aiServeTimer = 0;
                this.performAIServe();
            }
        }
        
        // ---- DEBUGGER: Log states ----
        this.debugger.logBallState(this.frameCount || 0, ballState);
        this.debugger.logPaddleState(this.frameCount || 0, paddlePos);
        
        // Show CLICK prompt when ball is very close
        const clickPrompt = document.getElementById('click-prompt');
        if (clickPrompt) {
            if (canHitBall && distToBall < 0.45) {
                clickPrompt.style.opacity = '1';
                clickPrompt.style.transform = 'translate(-50%, -50%) scale(1)';
            } else {
                clickPrompt.style.opacity = '0';
                clickPrompt.style.transform = 'translate(-50%, -50%) scale(0.8)';
            }
        }
        
        // Update debug UI
        this.updateDebugUI(ballState, paddlePos, distToBall, justClicked);
        
        // Update paddle position
        this.paddle.update(this.input, dt, ballState.position, ballState.active, canHitBall);
        
        // Update effects
        this.effects.update(dt);
        
        // Update ball visual
        this.ballMesh.update(
            this.physics.ball.position,
            this.physics.ball.spin,
            this.physics.ball.velocity
        );
        
        // Update camera (pass ball for dynamic framing)
        this.sceneManager.updateCameraPosition(this.input.playerOffset, this.paddle.group.position, ballState.position);
        
        // Update message timer
        if (this.pointMessageTimer > 0) {
            this.pointMessageTimer -= dt;
            if (this.pointMessageTimer <= 0) {
                this.pointMessage = '';
                if (this.onMessage) this.onMessage('');
            }
        }
        
        this.frameCount = (this.frameCount || 0) + 1;
    }
    
    updateDebugUI(ballState, paddlePos, distToBall, justClicked) {
        // Real-time status
        const status = this.debugger.getRealTimeStatus(ballState, paddlePos, this.paddle.swingState, distToBall);
        const debugInfo = document.getElementById('debug-info');
        if (debugInfo && status) {
            debugInfo.innerHTML = `
<span style="color:#0f0">${status.canHit ? '✓ CAN HIT' : '✗ TOO FAR'}</span> | 
dist: ${status.dist}m | ballZ: ${status.ballZ} | ballY: ${status.ballY}<br>
swing: ${status.swingState} | clicked: ${justClicked} | lastHit: ${status.lastHitBy}<br>
Clicks: ${status.sessionClicks} | Hits: ${status.sessionHits} | Auto: ${status.sessionAutoHits} | Miss: ${status.sessionMisses}
            `.trim();
        }
        
        // Point diagnosis panel
        const diagPanel = document.getElementById('debug-diagnosis');
        if (diagPanel) {
            const diagnosis = this.debugger.getPointDiagnosis();
            if (diagnosis.length > 0) {
                diagPanel.innerHTML = '<strong>Point Analysis:</strong><br>' + 
                    diagnosis.map(d => this.debugger.formatDiagnosis(d)).join('<br><br>');
                diagPanel.style.display = 'block';
            } else {
                diagPanel.style.display = 'none';
            }
        }
        
        // Session summary
        const summaryPanel = document.getElementById('debug-summary');
        if (summaryPanel) {
            const s = this.debugger.getSessionSummary();
            summaryPanel.innerHTML = `
<strong>Session Stats</strong><br>
Points: ${s.pointsPlayed} | Clicks: ${s.totalClicks}<br>
Manual Hits: ${s.manualHits} | Auto Hits: ${s.totalAutoHits}<br>
Hit Rate: <span style="color:${parseInt(s.hitRate) > 50 ? '#4caf50' : '#ff9800'}">${s.hitRate}</span><br>
Top Miss Reason: ${s.topMissReason}
            `.trim();
        }
    }
    
    handlePhysicsEvents(events) {
        for (const event of events) {
            switch (event.type) {
                case 'bounce':
                    this.handleBounce(event);
                    this.effects.spawnBounceDust(event.position, 0.6);
                    this.audio.playBounce(0.5);
                    break;
                case 'net':
                    this.effects.spawnBounceDust(event.position, 0.3);
                    this.audio.playNet();
                    this.endPoint('net');
                    break;
                case 'floor':
                    this.effects.spawnBounceDust(event.position, 0.4);
                    this.handleFloorBounce();
                    break;
                case 'out':
                    this.endPoint('out');
                    break;
            }
        }
    }
    
    handleBounce(event) {
        this.lastBounceSide = event.side;
        this.bouncePositions.push(event.position.clone());
        
        // Check serve rules
        if (this.state === GameState.SERVING) {
            this.serveBounceCount++;
            
            // Ball cannot bounce before being struck during serve
            if (this.physics.ball.lastHitBy === null) {
                this.endPoint('fault');
                return;
            }
            
            // After second bounce, serve is in play
            if (this.serveBounceCount >= 2) {
                this.setState(GameState.RALLY);
            }
        } else if (this.state === GameState.RALLY) {
            // In rally, check for double bounce
            if (event.bounces >= 2) {
                // Check if both bounces on same side
                const lastTwo = this.bouncePositions.slice(-2);
                if (lastTwo.length === 2) {
                    const side1 = lastTwo[0].z > 0 ? 'player' : 'opponent';
                    const side2 = lastTwo[1].z > 0 ? 'player' : 'opponent';
                    
                    if (side1 === side2) {
                        // Double bounce - point to other player
                        if (side1 === 'player') {
                            this.scorePoint('opponent');
                        } else {
                            this.scorePoint('player');
                        }
                        return;
                    }
                }
            }
        }
    }
    
    handleFloorBounce() {
        // Ball hit the floor outside table
        const ballState = this.physics.getBallState();
        
        // Determine who gets the point
        if (ballState.lastHitBy === 'player') {
            this.scorePoint('opponent');
        } else if (ballState.lastHitBy === 'opponent') {
            this.scorePoint('player');
        } else {
            // No one hit it - fault on server
            this.scorePoint(this.server === 'player' ? 'opponent' : 'player');
        }
    }
    
    checkPaddleContact() {
        const ballState = this.physics.getBallState();
        const paddlePos = this.paddle.getHitPosition();
        const dist = paddlePos.distanceTo(ballState.position);
        
        // DEBUG: huge hit radius for testing
        if (dist > 2.00) {
            console.log('MISS: too far', dist.toFixed(2));
            this.debugger.logMiss(this.frameCount || 0, 'too_far', { dist });
            return;
        }
        
        if (ballState.lastHitBy === 'player') {
            this.debugger.logMiss(this.frameCount || 0, 'already_hit', { lastHitBy: ballState.lastHitBy });
            return;
        }
        
        console.log('HIT! dist=' + dist.toFixed(2) + 'm');
        this.paddle.markHit();
        this.processPaddleHit(ballState, paddlePos, dist);
    }
    
    processPaddleHit(ballState, paddlePos, dist) {
        const sweetSpotDist = Math.sqrt(
            (ballState.position.x - paddlePos.x) ** 2 +
            (ballState.position.y - paddlePos.y) ** 2
        );
        const hitQuality = Math.max(0.3, 1.0 - sweetSpotDist * 3);
        
        // Check if this was an auto-hit (no recent manual click)
        const recentClicks = this.debugger.session.clicks.slice(-3);
        const wasAuto = recentClicks.length === 0 || 
            (performance.now() - recentClicks[recentClicks.length - 1].time) > 500;
        
        this.debugger.logHit(this.frameCount || 0, ballState, paddlePos, hitQuality, wasAuto);
        
        const props = this.equipment.getPaddleProperties();
        const paddleNormal = this.paddle.getPaddleNormal();
        const paddleVel = this.paddle.getPaddleVelocity();
        const aimX = this.input.mouse.x * 0.5;
        
        const playerSpin = new THREE.Vector3(
            -this.input.paddleAngle * 50,
            0,
            this.input.mouse.x * 20
        );
        
        const result = this.physics.calculateHit(
            ballState.position,
            ballState.velocity,
            ballState.spin,
            paddlePos,
            paddleVel,
            paddleNormal,
            props,
            hitQuality
        );
        
        const speed = result.velocity.length();
        const aimFactor = 0.35;
        result.velocity.x = result.velocity.x * (1 - aimFactor) + aimX * speed * aimFactor;
        result.velocity.y = Math.max(0.25, result.velocity.y);
        
        result.spin.add(playerSpin);
        
        this.physics.ball.hit(result.velocity, result.spin, 'player');
        
        const hitIntensity = result.velocity.length() / 8;
        this.effects.spawnHitParticles(ballState.position, hitIntensity);
        this.audio.playHit(hitIntensity);
        
        this.identifyShot(result.velocity, result.spin, 'player');
        this.rallyShotCount++;
        
        if (this.state === GameState.SERVING) {
            this.setState(GameState.RALLY);
        }
    }
    
    handleOpponentHit() {
        const ballState = this.physics.getBallState();
        const hitData = this.opponent.getHitData();
        
        // Add some spin based on ball trajectory
        const incomingSpin = ballState.spin.clone().multiplyScalar(0.3);
        hitData.spin.add(incomingSpin);
        
        this.physics.ball.hit(hitData.velocity, hitData.spin, 'opponent');
        this.opponent.hasHitBall = true;
        
        // Visual and audio feedback
        const hitIntensity = hitData.velocity.length() / 8;
        this.effects.spawnHitParticles(ballState.position, hitIntensity);
        this.audio.playHit(hitIntensity);
        
        this.identifyShot(hitData.velocity, hitData.spin, 'opponent');
        this.rallyShotCount++;
    }
    
    performAIServe() {
        const serveTypes = ['topspin', 'backspin', 'sidespin'];
        const type = serveTypes[Math.floor(Math.random() * serveTypes.length)];
        
        let velocity, spin;
        
        switch (type) {
            case 'topspin':
                velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 1.0,
                    1.5,
                    3.0
                );
                spin = new THREE.Vector3(-30, 0, 0);
                break;
            case 'backspin':
                velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.5,
                    1.2,
                    2.5
                );
                spin = new THREE.Vector3(20, 0, 0);
                break;
            case 'sidespin':
                velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 2.0,
                    1.3,
                    2.8
                );
                spin = new THREE.Vector3(-10, 0, 25);
                break;
        }
        
        this.physics.ball.position.set(0, 1.3, -0.8);
        this.physics.ball.serve(velocity);
        this.physics.ball.lastHitBy = 'opponent';
        this.physics.ball.spin.copy(spin);
        this.serveBounceCount = 0;
    }
    
    identifyShot(velocity, spin, hitter) {
        const spinStr = spin.length();
        const speed = velocity.length();
        
        let shotType = '';
        let spinType = '';
        
        if (spin.x < -10) {
            spinType = 'Heavy Topspin';
            shotType = 'Loop';
        } else if (spin.x > 10) {
            spinType = 'Heavy Backspin';
            shotType = 'Chop';
        } else if (Math.abs(spin.z) > 15) {
            spinType = 'Sidespin';
            shotType = 'Hook';
        } else if (speed > 6) {
            spinType = 'Flat';
            shotType = 'Smash';
        } else if (speed < 3) {
            spinType = 'Light';
            shotType = 'Push';
        } else {
            spinType = 'Medium';
            shotType = 'Drive';
        }
        
        this.lastShotType = shotType;
        
        if (this.onShotInfo) {
            this.onShotInfo(shotType, spinType, hitter);
        }
    }
    
    scorePoint(winner) {
        // Deactivate ball immediately
        this.physics.ball.active = false;
        this.ballMesh.setVisible(false);
        
        this.score[winner]++;
        
        if (this.onScoreChange) {
            this.onScoreChange(this.score.player, this.score.opponent);
        }
        
        // Check for game over
        if (this.score.player >= WINNING_SCORE || this.score.opponent >= WINNING_SCORE) {
            if (Math.abs(this.score.player - this.score.opponent) >= 2) {
                this.setState(GameState.GAME_OVER);
                return;
            }
        }
        
        // End debugger point tracking
        this.debugger.endPoint(winner, this.score);
        
        // Switch server
        this.servesRemaining--;
        if (this.servesRemaining <= 0) {
            this.server = this.server === 'player' ? 'opponent' : 'player';
            this.servesRemaining = SERVE_CHANGE_INTERVAL;
            if (this.onServeChange) this.onServeChange(this.server);
        }
        
        // Show message and play sound
        if (winner === 'player') {
            this.showMessage('POINT!');
            this.audio.playScore();
        } else {
            this.showMessage('Opponent Scores');
            this.audio.playFault();
        }
        
        this.setState(GameState.POINT_END);
        
        // Delay before next serve
        setTimeout(() => {
            if (this.state === GameState.POINT_END) {
                this.resetBall();
                this.setState(GameState.SERVING);
                this.debugger.startPoint();
            }
        }, 1500);
    }
    
    endPoint(reason) {
        const ballState = this.physics.getBallState();
        let winner = '';
        
        switch (reason) {
            case 'net':
                if (ballState.lastHitBy === 'player') winner = 'opponent';
                else if (ballState.lastHitBy === 'opponent') winner = 'player';
                else winner = this.server === 'player' ? 'opponent' : 'player';
                this.showMessage('Net!');
                break;
            case 'fault':
                winner = this.server === 'player' ? 'opponent' : 'player';
                this.showMessage('Fault!');
                break;
            case 'out':
                if (ballState.lastHitBy === 'player') winner = 'opponent';
                else winner = 'player';
                this.showMessage('Out!');
                break;
        }
        
        if (winner) {
            this.scorePoint(winner);
        }
    }
    
    showMessage(msg) {
        this.pointMessage = msg;
        this.pointMessageTimer = 2.0;
        if (this.onMessage) this.onMessage(msg);
    }
    
    resume() {
        if (this.state === GameState.PAUSED) {
            this.setState(GameState.RALLY);
        }
    }
    
    getWinner() {
        if (this.score.player > this.score.opponent) return 'player';
        return 'opponent';
    }
}
