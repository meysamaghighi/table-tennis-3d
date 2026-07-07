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
import { AutoTune } from './AutoTune.js';

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
    constructor(sceneManager, paddle, opponent, ballMesh, input, swipeInput) {
        this.sceneManager = sceneManager;
        this.paddle = paddle;
        this.opponent = opponent;
        this.ballMesh = ballMesh;
        this.input = input;
        this.swipeInput = swipeInput;
        
        this.effects = new EffectsManager(sceneManager.scene);
        this.audio = new AudioManager();
        this.physics = new PhysicsEngine();
        this.equipment = new Equipment();
        this.debugger = new GameDebugger();
        this.autoTune = new AutoTune();
        this._lastEndReason = null;
        
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
            // Toss near the player's end of the table so the resting paddle (z ~ 1.70) can reach it.
            this.physics.ball.position.set(0, 1.3, 1.45);
        } else {
            this.physics.ball.position.set(0, 1.3, -1.0);
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
            this.physics.ball.position.set(0, 1.2, 1.45);
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
        
        // CRITICAL: Read click BEFORE input.update() clears it!
        const justClicked = this.input.justClicked();
        
        // Update input (clears click flags)
        this.input.update(dt);
        
        // Update physics
        const events = this.physics.update(dt);
        this.handlePhysicsEvents(events);
        
        const ballState = this.physics.getBallState();
        const paddlePos = this.paddle.getHitPosition();
        const distToBall = ballState.active ? paddlePos.distanceTo(ballState.position) : 999;
        const canHitBall = ballState.active && distToBall < 0.35 && ballState.lastHitBy !== 'player';
        
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
        
        // Player serve: a click/tap kicks off the toss; from there auto-hit handles it.
        if (this.state === GameState.SERVING && this.server === 'player' && !this.ballToss.active) {
            if (justClicked) {
                this.tossBall();
            }
        }

        // AUTO-HIT: no click required. The paddle swings on its own whenever the
        // ball enters the hit window. Works for both rallies and serves.
        if (ballState.active && ballState.lastHitBy !== 'player'
            && (this.state === GameState.SERVING || this.state === GameState.RALLY)) {

            const serveReady = this.state === GameState.SERVING
                && this.ballToss.active
                && ballState.velocity.y < 0               // ball is falling
                && ballState.position.y < 1.10;           // let it drop to a hittable height
            const rallyReady = this.state === GameState.RALLY
                && ballState.velocity.z > 0;              // ball moving toward player

            if ((serveReady || rallyReady) && distToBall < 0.55) {
                if (this.paddle.swingState === 'ready') this.paddle.triggerSwing();
                this.processPaddleHit(ballState, paddlePos, distToBall);
            }
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
        
        // Update debug UI
        this.updateDebugUI(ballState, paddlePos, distToBall, justClicked, this.input);
        
        // Sync auto-tuned opponent difficulty, then update paddle.
        this.opponent.setDifficulty(this.autoTune.get('opponentDifficulty'));
        this.paddle.update(this.input, this.swipeInput, dt, ballState, canHitBall, this.autoTune);
        
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
    
    updateDebugUI(ballState, paddlePos, distToBall, justClicked, input) {
        // Real-time status
        const status = this.debugger.getRealTimeStatus(ballState, paddlePos, this.paddle.swingState, distToBall);
        const debugInfo = document.getElementById('debug-info');
        if (debugInfo && status) {
            debugInfo.innerHTML = `
<span style="color:#0f0">${status.canHit ? '✓ CAN HIT' : '✗ TOO FAR'}</span> | 
dist: ${status.dist}m | ballZ: ${status.ballZ} | ballY: ${status.ballY}<br>
swing: ${status.swingState} | clicked: ${justClicked} | lastHit: ${status.lastHitBy}<br>
mouseX: ${input.mouse.x.toFixed(2)} | virtualX: ${input.virtualMouseX.toFixed(2)} | touch: ${input.isTouch}<br>
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
                this._lastEndReason = 'fault';
                this.endPoint('fault');
                return;
            }

            // Serve is in play once it bounces on the receiver's side —
            // this is what lets the receiver's auto-hit return it.
            const receiverSide = this.server === 'player' ? 'opponent' : 'player';
            if (event.side === receiverSide) {
                this.setState(GameState.RALLY);
            } else if (this.serveBounceCount >= 2) {
                // Two bounces without reaching the receiver = failed serve
                this._lastEndReason = 'fault';
                this.endPoint('fault');
                return;
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
                        this._lastEndReason = 'double_bounce';
                        this._lastHitByAtEnd = this.physics.ball.lastHitBy;
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
        this._lastEndReason = 'floor';
        this._lastHitByAtEnd = ballState.lastHitBy;

        if (ballState.lastHitBy === 'player') {
            this.scorePoint('opponent');
        } else if (ballState.lastHitBy === 'opponent') {
            this.scorePoint('player');
        } else {
            this.scorePoint(this.server === 'player' ? 'opponent' : 'player');
        }
    }
    
    checkPaddleContact() {
        const ballState = this.physics.getBallState();
        const paddlePos = this.paddle.getHitPosition();
        const dist = paddlePos.distanceTo(ballState.position);
        
        // DEBUG: huge hit radius for testing
        if (dist > 0.50) {
            this.debugger.logMiss(this.frameCount || 0, 'too_far', { dist });
            return;
        }
        
        if (ballState.lastHitBy === 'player') {
            this.debugger.logMiss(this.frameCount || 0, 'already_hit', { lastHitBy: ballState.lastHitBy });
            return;
        }
        
        this.paddle.markHit();
        this.processPaddleHit(ballState, paddlePos, dist);
    }
    
    processPaddleHit(ballState, paddlePos, dist) {
        const sweetSpotDist = Math.sqrt(
            (ballState.position.x - paddlePos.x) ** 2 +
            (ballState.position.y - paddlePos.y) ** 2
        );
        const hitQuality = Math.max(0.3, 1.0 - sweetSpotDist * 3);

        // Was this an auto-hit (no recent manual click)?
        const recentClicks = this.debugger.session.clicks.slice(-3);
        const wasAuto = recentClicks.length === 0 ||
            (performance.now() - recentClicks[recentClicks.length - 1].time) > 500;
        this.debugger.logHit(this.frameCount || 0, ballState, paddlePos, hitQuality, wasAuto);

        const props        = this.equipment.getPaddleProperties();
        const paddleNormal = this.paddle.getPaddleNormal();

        // Per-shot power: pro players don't swing the same way at every ball.
        // Scale the swing magnitude by ball height + incoming speed so high
        // balls get smashed, low pushes stay soft, and fast incoming gets blocked.
        const baseThrust    = this.autoTune.get('paddleThrust');
        const heightAbove   = ballState.position.y - 0.76;        // TABLE_HEIGHT
        const incomingSpeed = ballState.velocity.length();
        let thrustMul = 1.0;
        if (heightAbove > 0.25)        thrustMul = 1.30;          // smash
        else if (heightAbove < 0.06)   thrustMul = 0.70;          // soft push
        if (incomingSpeed > 6.0)       thrustMul *= 0.80;         // block fast incoming
        if (this.state === GameState.SERVING) thrustMul = 0.80;   // serves are placed, not smashed
        const paddleVel = new THREE.Vector3(0, 0, -baseThrust * thrustMul);

        const result = this.physics.calculateHit(
            ballState.position, ballState.velocity, ballState.spin,
            paddlePos, paddleVel, paddleNormal,
            props, hitQuality
        );

        const speed     = result.velocity.length();
        const aimAssist = this.autoTune.get('aimAssist');
        const shotArc   = this.autoTune.get('shotArc');
        const aimX      = this.input.mouse.x * 0.5;

        if (this.state === GameState.SERVING) {
            // Auto-serve uses a shaped velocity profile instead of raw hit
            // physics: bounce own side (~z 0.3), clear the net, land short on
            // the opponent's side (~z -0.3). Range validated against the
            // physics engine (legal for vy 1.2-1.6 / vz -2.4..-2.8 from the
            // contact point at y~1.05, z~1.45).
            const vy = 1.3 + Math.random() * 0.3;
            const vz = -2.5 - Math.random() * 0.3;
            result.velocity.set(aimX * 0.8, vy, vz);
            // Light backspin only — Magnus from the raw hit spin (topspin,
            // ~80 rad/s) dives this trajectory straight into the net.
            result.spin.set(10 + Math.random() * 15, 0, 0);
        } else {
            // Direction assist: blend outgoing velocity toward a sensible target on
            // the opponent's court — straight ahead with mouse-controlled lateral bias.
            if (aimAssist > 0 && speed > 0.1) {
                const target = new THREE.Vector3(aimX, 0.18, -1).normalize().multiplyScalar(speed);
                result.velocity.lerp(target, aimAssist);
            }
            // Net-clearance arc (auto-tuned). No more hard `Math.max(0.25, y)` clamp.
            result.velocity.y += shotArc;
        }

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

        // Feed the auto-tuner with this point's outcome BEFORE we mutate state.
        this.autoTune.observePoint({
            winner,
            reason: this._lastEndReason || 'other',
            lastHitBy: this._lastHitByAtEnd || this.physics.ball.lastHitBy,
            rallyShots: this.rallyShotCount,
        });
        this._lastEndReason = null;
        this._lastHitByAtEnd = null;

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
        this._lastEndReason = reason;
        this._lastHitByAtEnd = ballState.lastHitBy;
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
