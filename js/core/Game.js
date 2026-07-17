/**
 * Main Game Logic
 * Manages game state, scoring, rally flow, and hit detection.
 */

import * as THREE from 'three';
import { PhysicsEngine } from './Physics.js';
import { Equipment } from './Equipment.js';
import { EffectsManager } from '../three/Effects.js';
import { AudioManager } from './Audio.js';
import { GameDebugger } from './Debugger.js';
import { AutoTune } from './AutoTune.js';
import { computeShot, solvePlayerShot, SWIPE_HIT_THRESHOLD } from './SwipeShot.js';

const WINNING_SCORE = 11;
const SERVE_CHANGE_INTERVAL = 2;

// Swipe-to-hit tuning (Phase 3). The paddle is finger-controlled; a rally hit
// fires when the ball is inside this reach sphere, moving toward the player,
// and the finger is sweeping through it faster than SWIPE_HIT_THRESHOLD.
const HIT_REACH = 0.45;

// Serve envelope — validated against the real PhysicsEngine (grid sweep of
// depthT × aim × jitter × spin: ~98% land legally; the rest are extreme
// wide/heavy-spin serves that fairly fault). Serve must bounce own side,
// clear the net, then land in the receiver's court. A legal two-bounce serve
// from this contact geometry can only reach ~mid-court, so short↔long is a
// relative range: soft flick = gentle high DROP just past the net (lands z≈
// -0.22); fast swipe = flat downward DRIVE to mid-court (lands z≈-0.5, and
// noticeably faster). depthT (0=short..1=long) lerps vy/vz between these.
const SERVE = {
    VZ_SHORT: -2.4,   // depthT=0: gentle, drops short just over the net
    VZ_LONG:  -4.6,   // depthT=1: fast, drives to mid-court
    VY_SHORT:  1.5,   // high arc for the short drop serve
    VY_LONG:  -0.5,   // downward flat drive for the long serve
    VX_MAX:    1.1,   // lateral velocity at full left/right aim
};

const lerp = (a, b, t) => a + (b - a) * t;

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
        this.debug = new URLSearchParams(location.search).has('debug');
        
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

        // Juice: hit-stop freezes the sim for a few frames on hard contact;
        // slow-mo plays the sim at 0.3x on smash winners / match point. Both
        // count down in REAL time; gameplay advances on the scaled sim dt.
        this.hitStop = 0;
        this.slowMo = 0;
        this._recentSmash = 0; // real-time window after a hard hit, for smash-winner slow-mo
        
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
        this.hitStop = 0;
        this.slowMo = 0;

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
    
    tossBall(serveParams) {
        if (!this.ballToss.active && this.state === GameState.SERVING && this.server === 'player') {
            // Swipe-derived aim/spin for the strike that follows on descent.
            this._pendingServe = serveParams || { aimX: 0, sideSpin: 0 };
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
        
        // ---- Juice time-scale: hit-stop freezes, slow-mo eases the sim. Timers
        // count down in REAL time; the sim advances on the scaled `sdt`. ----
        if (this.hitStop > 0) this.hitStop = Math.max(0, this.hitStop - dt);
        if (this.slowMo > 0) this.slowMo = Math.max(0, this.slowMo - dt);
        if (this._recentSmash > 0) this._recentSmash = Math.max(0, this._recentSmash - dt);
        const sdt = this.hitStop > 0 ? 0 : dt * (this.slowMo > 0 ? 0.30 : 1);

        // Update input (clears click flags — justClicked is only used by
        // menu/pause now, handled via DOM buttons and keyboard events).
        this.input.update(dt);

        // Update physics (scaled)
        const events = this.physics.update(sdt);
        this.handlePhysicsEvents(events);

        const ballState = this.physics.getBallState();
        const paddlePos = this.paddle.getHitPosition();
        const distToBall = ballState.active ? paddlePos.distanceTo(ballState.position) : 999;
        const canHitBall = ballState.active && distToBall < HIT_REACH && ballState.lastHitBy !== 'player';

        // ---- Swipe-to-hit: finger sweeps drive serves and rally returns ----
        this.handleSwipeInput(ballState, paddlePos, distToBall);

        // Update opponent AI (scaled)
        this.opponent.update(sdt, ballState, ballState.active, paddlePos.x);

        // Check opponent hit
        if (this.opponent.shouldHit(ballState) && ballState.lastHitBy !== 'opponent') {
            this.handleOpponentHit();
        }

        // Auto-serve for AI
        if (this.state === GameState.SERVING && this.server === 'opponent') {
            this.aiServeTimer = (this.aiServeTimer || 0) + sdt;
            if (this.aiServeTimer > 1.5) {
                this.aiServeTimer = 0;
                this.performAIServe();
            }
        }

        // ---- DEBUGGER: Log states ----
        this.debugger.logBallState(this.frameCount || 0, ballState);
        this.debugger.logPaddleState(this.frameCount || 0, paddlePos);

        // Update debug UI
        this.updateDebugUI(ballState, paddlePos, distToBall, this.input);

        // Sync auto-tuned opponent difficulty, then update paddle (scaled swing).
        this.opponent.setDifficulty(this.autoTune.get('opponentDifficulty'));
        this.paddle.update(this.input, this.swipeInput, sdt, ballState, canHitBall, this.autoTune);

        // Update effects (scaled)
        this.effects.update(sdt);
        
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
    
    updateDebugUI(ballState, paddlePos, distToBall, input) {
        if (!this.debug) return;

        // Real-time status
        const status = this.debugger.getRealTimeStatus(ballState, paddlePos, this.paddle.swingState, distToBall);
        const debugInfo = document.getElementById('debug-info');
        if (debugInfo && status) {
            const m = this.getSwipeMetrics();
            debugInfo.innerHTML = `
<span style="color:#0f0">${status.canHit ? '✓ CAN HIT' : '✗ TOO FAR'}</span> |
dist: ${status.dist}m | ballZ: ${status.ballZ} | ballY: ${status.ballY}<br>
swing: ${status.swingState} | lastHit: ${status.lastHitBy}<br>
swipe: ${m.speedNorm.toFixed(2)}sw/s | hDir: ${m.hDir.toFixed(2)} | vDir: ${m.vDir.toFixed(2)} | curve: ${m.curvature.toFixed(2)}<br>
Rally shots: ${this.rallyShotCount}
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
    
    /**
     * Normalized finger metrics for the current swipe. Speed is expressed in
     * screen-widths/second so power tiers feel the same on a 390px phone and a
     * wide desktop window. `hDir`/`vDir` are direction cosines (vDir > 0 = up).
     */
    getSwipeMetrics() {
        const si = this.swipeInput;
        const el = si && si.element;
        let w = 390;
        if (el && el.getBoundingClientRect) {
            const r = el.getBoundingClientRect();
            if (r.width > 0) w = r.width;
        } else if (typeof window !== 'undefined' && window.innerWidth) {
            w = window.innerWidth;
        }
        const vx = si.velocity.x, vy = si.velocity.y;
        const speedPx = Math.hypot(vx, vy);
        const speedNorm = speedPx / w;
        const hDir = speedPx > 1 ? vx / speedPx : 0;
        const vDir = speedPx > 1 ? -vy / speedPx : 0;   // screen y grows downward → up is negative
        return { speedNorm, hDir, vDir, dirSign: Math.sign(vx) || 1, curvature: si.pathCurvature || 0 };
    }

    handleSwipeInput(ballState, paddlePos, distToBall) {
        const m = this.getSwipeMetrics();
        const swiping = m.speedNorm > SWIPE_HIT_THRESHOLD;

        // ---- Serve: an upward swipe tosses the ball and arms the strike. ----
        if (this.state === GameState.SERVING && this.server === 'player' && !this.ballToss.active) {
            if (swiping && m.vDir > 0.2) {
                // Swipe ANGLE → left/right aim; swipe POWER (finger speed) → short/long depth.
                const depthT = Math.max(0, Math.min(1, (m.speedNorm - 1.5) / (5.0 - 1.5)));
                this.tossBall({
                    aimX: m.hDir,
                    depthT,
                    sideSpin: Math.max(-25, Math.min(25, m.dirSign * m.curvature * 120)),
                });
            }
        }

        // ---- Serve strike: fire on the toss's descent (one motion). ----
        if (this.state === GameState.SERVING && this.server === 'player'
            && this.ballToss.active && ballState.lastHitBy === null
            && ballState.velocity.y < 0 && ballState.position.y < 1.15) {
            this.paddle.triggerSwing({
                power: this._pendingServe?.depthT ?? 0.5,
                dir: this._pendingServe?.aimX ?? 0,
            });
            this.processServeHit(ballState);
            return;
        }

        // ---- Rally: swipe through the ball while it's in reach and incoming. ----
        if (this.state === GameState.RALLY && ballState.active && ballState.lastHitBy !== 'player') {
            const towardPlayer = ballState.velocity.z > 0;
            if (towardPlayer && distToBall < HIT_REACH && swiping) {
                this.paddle.triggerSwing();
                this.processSwipeHit(ballState, paddlePos, m);
            }
        }
    }

    processServeHit(ballState) {
        const serve = this._pendingServe || { aimX: 0, depthT: 0, sideSpin: 0 };
        // Shaped serve profile: bounce own side, clear the net, land in the
        // receiver's court. Depth (short↔long) and lateral aim (left↔right)
        // come from the swipe via the tunable SERVE envelope above; sidespin
        // is the (clamped) curvature-derived value from the swipe.
        const dT = serve.depthT ?? 0;
        const vy = lerp(SERVE.VY_SHORT, SERVE.VY_LONG, dT) + (Math.random() - 0.5) * 0.1;
        const vz = lerp(SERVE.VZ_SHORT, SERVE.VZ_LONG, dT) + (Math.random() - 0.5) * 0.1;
        const velocity = new THREE.Vector3(serve.aimX * SERVE.VX_MAX, vy, vz);
        const sideSpin = Math.max(-12, Math.min(12, serve.sideSpin));
        const spin = new THREE.Vector3(2 + Math.random() * 6, 0, sideSpin);

        this.physics.ball.hit(velocity, spin, 'player');

        const hitIntensity = velocity.length() / 8;
        this.effects.spawnHitParticles(ballState.position, hitIntensity);
        this.audio.playHit(hitIntensity);
        this.identifyShot(velocity, spin, 'player');
        this.rallyShotCount++;
        this._haptic(12);
        // State stays SERVING; handleBounce promotes to RALLY once the serve
        // legally reaches the receiver's side (and faults it otherwise).
    }

    processSwipeHit(ballState, paddlePos, m) {
        const contact = {
            x: ballState.position.x,
            y: ballState.position.y,
            z: ballState.position.z,
        };
        // Timing: ball still in front of the paddle plane = early (cross-court);
        // ball already past it = late (down-the-line).
        const timing = Math.max(-1, Math.min(1, (ballState.position.z - paddlePos.z) / 0.3));
        const shot = computeShot({ ...m, timing });
        const solved = solvePlayerShot(contact, shot.targetLanding, shot.arcHeight, shot.spin);

        const velocity = new THREE.Vector3(solved.velocity.x, solved.velocity.y, solved.velocity.z);
        const spin = new THREE.Vector3(shot.spin.x, shot.spin.y, shot.spin.z);
        this.physics.ball.hit(velocity, spin, 'player');

        const hitIntensity = velocity.length() / 8;
        this.effects.spawnHitParticles(ballState.position, hitIntensity);
        this.audio.playHit(hitIntensity);
        this.identifyShot(velocity, spin, 'player');
        this.rallyShotCount++;
        // Juice: hard swipes get hit-stop + punch-in + shake + a firmer buzz;
        // every player contact gets a light haptic tap.
        if (shot.tier === 'hard') {
            this.hitStop = Math.max(this.hitStop, 0.045);   // ~3 frozen frames
            this._recentSmash = 0.6;
            this.sceneManager.triggerImpact(1);
            this.sceneManager.triggerShake(0.06);
            this._haptic(25);
            if (this._isMatchPoint()) this.slowMo = 0.5;    // climactic slow-mo smash
        } else {
            this._haptic(12);
        }
    }

    _isMatchPoint() {
        return this.score.player >= WINNING_SCORE - 1 || this.score.opponent >= WINNING_SCORE - 1;
    }

    // Short haptic buzz; guarded for iOS Safari (no navigator.vibrate) and desktop.
    _haptic(ms) {
        try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) { /* ignore */ }
    }

    handleOpponentHit() {
        const ballState = this.physics.getBallState();
        // Solver-driven return: the outgoing spin is chosen by the AI and the
        // velocity was solved for exactly that spin, so we must NOT blend in the
        // incoming spin here (it would invalidate the landing solution).
        const hitData = this.opponent.getHitData(ballState);

        this.physics.ball.hit(hitData.velocity, hitData.spin, 'opponent');
        this.opponent.hasHitBall = true;
        
        // Visual and audio feedback
        const hitIntensity = hitData.velocity.length() / 8;
        this.effects.spawnHitParticles(ballState.position, hitIntensity);
        this.audio.playHit(hitIntensity);
        
        this.identifyShot(hitData.velocity, hitData.spin, 'opponent');
        this.rallyShotCount++;
        // Camera punch-in + shake on a fast opponent smash.
        if (hitData.velocity.length() > 7.5) {
            this.sceneManager.triggerImpact(0.8);
            this.sceneManager.triggerShake(0.045);
            this._recentSmash = 0.6;
            if (this._isMatchPoint()) this.slowMo = 0.5;
        }
    }
    
    performAIServe() {
        // Mirror of the player's validated serve profile (z-flipped): from a
        // contact behind the opponent's baseline, a low forward drive that
        // bounces the opponent's own side, clears the net, and lands short on
        // the player's side. spin.x < 0 gives the +z-travelling ball the same
        // net-clearing Magnus lift the player's backspin serve gets going -z.
        // Serve legality (own bounce → receiver bounce) is checked in the
        // Phase-4 harness. A small lateral aim places it across the player's box.
        // Params centered on the robustly-legal serve envelope (vy≈1.5,
        // vz≈2.8, spin.x≈0), scanned against the real physics — every neighbor
        // in a ±0.1/±0.1/±5 box around it serves legally, so the tight jitter
        // below stays inside the legal region (~100% serve legality).
        const aimX = (Math.random() - 0.5) * 0.4;
        const velocity = new THREE.Vector3(
            aimX * 0.8,
            1.5 + (Math.random() - 0.5) * 0.1,
            2.8 + (Math.random() - 0.5) * 0.1
        );
        const spin = new THREE.Vector3(-(Math.random() * 6), 0, (Math.random() - 0.5) * 8);

        this.physics.ball.position.set(0, 1.05, -1.45);
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
        // Guard against double-counting a single dead ball. Several physics
        // events (floor bounce, double bounce, serve fault) can fire within the
        // same frame and each calls scorePoint; without this guard the score
        // increments twice, skipping the legal 11-point / deuce game-over check
        // and producing impossible finals like 10-13. Only active play
        // (SERVING / RALLY) may score; once we're in POINT_END or GAME_OVER the
        // point is already decided.
        if (this.state === GameState.POINT_END || this.state === GameState.GAME_OVER) {
            return;
        }

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
        }, 700);
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
