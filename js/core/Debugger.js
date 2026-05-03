/**
 * Gameplay Debugger & Analyzer
 * Instruments player actions to diagnose why hitting fails.
 */

export class GameDebugger {
    constructor() {
        this.enabled = true;
        this.resetSession();
        this.pointReport = null;
    }
    
    resetSession() {
        this.session = {
            totalClicks: 0,
            totalHits: 0,
            totalAutoHits: 0,
            totalMisses: 0,
            pointsPlayed: 0,
            clicks: [],
            hits: [],
            autoHits: [],
            misses: [],
            ballPath: [], // {t, pos, vel}
            paddlePath: [], // {t, pos}
            swings: [],
        };
    }
    
    startPoint() {
        this.pointReport = {
            clicks: [],
            hits: [],
            autoHits: [],
            misses: [],
            ballPath: [],
            paddlePath: [],
            diagnosis: [],
        };
    }
    
    endPoint(winner, score) {
        this.session.pointsPlayed++;
        if (this.pointReport) {
            this.analyzePoint();
        }
    }
    
    logClick(frame, ballState, paddleState, swingState, dist) {
        this.session.totalClicks++;
        const entry = {
            frame,
            time: performance.now(),
            ballPos: ballState?.position?.clone(),
            ballActive: ballState?.active,
            ballLastHitBy: ballState?.lastHitBy,
            paddlePos: paddleState?.clone(),
            swingState,
            distToBall: dist,
            ballVelocity: ballState?.velocity?.clone(),
        };
        this.session.clicks.push(entry);
        if (this.pointReport) this.pointReport.clicks.push(entry);
    }
    
    logHit(frame, ballState, paddleState, hitQuality, isAuto = false) {
        if (isAuto) {
            this.session.totalAutoHits++;
            const entry = { frame, time: performance.now(), hitQuality, type: 'auto' };
            this.session.autoHits.push(entry);
            if (this.pointReport) this.pointReport.autoHits.push(entry);
        } else {
            this.session.totalHits++;
            const entry = { frame, time: performance.now(), hitQuality, type: 'manual' };
            this.session.hits.push(entry);
            if (this.pointReport) this.pointReport.hits.push(entry);
        }
    }
    
    logMiss(frame, reason, details) {
        this.session.totalMisses++;
        const entry = { frame, time: performance.now(), reason, details };
        this.session.misses.push(entry);
        if (this.pointReport) this.pointReport.misses.push(entry);
    }
    
    logBallState(frame, ballState) {
        if (!ballState?.active) return;
        const entry = {
            frame,
            pos: ballState.position.clone(),
            vel: ballState.velocity.clone(),
            spin: ballState.spin.clone(),
        };
        this.session.ballPath.push(entry);
        if (this.pointReport) this.pointReport.ballPath.push(entry);
    }
    
    logPaddleState(frame, paddlePos) {
        const entry = { frame, pos: paddlePos.clone() };
        this.session.paddlePath.push(entry);
        if (this.pointReport) this.pointReport.paddlePath.push(entry);
    }
    
    analyzePoint() {
        const r = this.pointReport;
        if (!r) return;
        
        const diagnosis = [];
        
        // 1. Did player click at all?
        if (r.clicks.length === 0) {
            diagnosis.push({
                severity: 'info',
                issue: 'No clicks recorded',
                advice: 'Try clicking anywhere on the screen when the ball approaches.',
            });
        }
        
        // 2. Analyze each click
        r.clicks.forEach((click, i) => {
            if (!click.ballActive) {
                diagnosis.push({
                    severity: 'warning',
                    issue: `Click #${i+1}: Ball was not active`,
                    advice: 'Wait for the ball to be in play before clicking.',
                });
                return;
            }
            
            if (click.distToBall > 0.60) {
                diagnosis.push({
                    severity: 'warning',
                    issue: `Click #${i+1}: Ball was too far (${click.distToBall.toFixed(2)}m)`,
                    advice: 'Move mouse toward the ball. The green sphere shows hitting range.',
                });
            } else if (click.distToBall > 0.40) {
                diagnosis.push({
                    severity: 'info',
                    issue: `Click #${i+1}: Ball was at edge of range (${click.distToBall.toFixed(2)}m)`,
                    advice: 'Get a bit closer with the mouse.',
                });
            }
            
            if (click.ballLastHitBy === 'player') {
                diagnosis.push({
                    severity: 'info',
                    issue: `Click #${i+1}: Ball was already hit by you`,
                    advice: 'You hit it once already - wait for the opponent to return.',
                });
            }
            
            if (click.swingState && click.swingState !== 'ready') {
                diagnosis.push({
                    severity: 'info',
                    issue: `Click #${i+1}: Swing was in "${click.swingState}" phase`,
                    advice: 'Click once per shot. Wait for swing to reset.',
                });
            }
        });
        
        // 3. Were there hits?
        if (r.hits.length === 0 && r.autoHits.length === 0 && r.clicks.length > 0) {
            // Player clicked but never hit - find out why
            const avgDist = r.clicks.reduce((s, c) => s + (c.distToBall || 999), 0) / r.clicks.length;
            if (avgDist > 0.6) {
                diagnosis.push({
                    severity: 'critical',
                    issue: `Average click distance: ${avgDist.toFixed(2)}m (need <0.60m)`,
                    advice: 'CRITICAL: You are clicking when the paddle is far from the ball. Move the mouse to follow the ball!',
                });
            }
        }
        
        // 4. Ball path analysis
        if (r.ballPath.length > 0) {
            const ballOnPlayerSide = r.ballPath.filter(p => p.pos.z > 0);
            if (ballOnPlayerSide.length === 0) {
                diagnosis.push({
                    severity: 'warning',
                    issue: 'Ball never reached your side',
                    advice: 'Opponent may be missing, or ball is going out/net.',
                });
            }
        }
        
        r.diagnosis = diagnosis;
    }
    
    getRealTimeStatus(ballState, paddleState, swingState, dist) {
        if (!this.enabled) return null;
        
        const status = {
            dist: dist !== undefined ? dist.toFixed(2) : '--',
            ballActive: ballState?.active || false,
            ballZ: ballState?.position?.z?.toFixed(2) || '--',
            ballY: ballState?.position?.y?.toFixed(2) || '--',
            paddleX: paddleState?.x?.toFixed(2) || '--',
            paddleY: paddleState?.y?.toFixed(2) || '--',
            paddleZ: paddleState?.z?.toFixed(2) || '--',
            swingState: swingState || '--',
            lastHitBy: ballState?.lastHitBy || '--',
            canHit: ballState?.active && dist < 0.60 && ballState?.lastHitBy !== 'player',
            sessionClicks: this.session.totalClicks,
            sessionHits: this.session.totalHits,
            sessionAutoHits: this.session.totalAutoHits,
            sessionMisses: this.session.totalMisses,
        };
        
        return status;
    }
    
    getPointDiagnosis() {
        if (!this.pointReport) return [];
        return this.pointReport.diagnosis || [];
    }
    
    getSessionSummary() {
        const s = this.session;
        const totalAttempts = s.totalHits + s.totalAutoHits + s.totalMisses;
        const hitRate = totalAttempts > 0 ? ((s.totalHits + s.totalAutoHits) / totalAttempts * 100).toFixed(0) : 0;
        
        // Most common miss reason
        const reasonCounts = {};
        s.misses.forEach(m => {
            reasonCounts[m.reason] = (reasonCounts[m.reason] || 0) + 1;
        });
        let topReason = 'None';
        let topCount = 0;
        for (const [reason, count] of Object.entries(reasonCounts)) {
            if (count > topCount) {
                topReason = reason;
                topCount = count;
            }
        }
        
        return {
            pointsPlayed: s.pointsPlayed,
            totalClicks: s.totalClicks,
            manualHits: s.totalHits,
            autoHits: s.totalAutoHits,
            misses: s.totalMisses,
            hitRate: hitRate + '%',
            topMissReason: topReason,
        };
    }
    
    formatDiagnosis(diag) {
        const icons = { critical: '🔴', warning: '🟡', info: '🔵' };
        return `${icons[diag.severity] || '⚪'} ${diag.issue}\n   → ${diag.advice}`;
    }
}
