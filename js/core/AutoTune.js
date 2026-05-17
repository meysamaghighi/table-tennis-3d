/**
 * AutoTune
 *
 * Self-adjusting gameplay parameters. Observes point outcomes and nudges a
 * small set of knobs (opponent difficulty, paddle thrust, aim assist, shot arc,
 * paddle Y auto-track) so the game converges on a winnable-but-not-trivial
 * experience without prompt-driven retuning. State persists in localStorage.
 *
 * Read params via `get(name)` from Paddle/Game/Opponent each frame.
 * Push outcomes via `observePoint({winner, reason, lastHitBy, rallyShots})`.
 */

const STORAGE_KEY = 'tt3d.tune.v2';
const HISTORY_MAX = 24;

const DEFAULTS = {
    opponentDifficulty: 0.25,  // 0..1, opponent AI accuracy
    paddleThrust: 3.2,         // m/s, swing speed magnitude
    aimAssist: 0.35,           // 0..1, blend outgoing dir toward opponent court
    shotArc: 0.55,             // m/s of extra +Y on hit, helps clear the net
    autoTrackY: 0.70,          // 0..1, paddle Y follows ball Y
};

const BOUNDS = {
    opponentDifficulty: [0.10, 0.75],
    paddleThrust:       [2.2, 5.0],
    aimAssist:          [0.10, 0.55],
    shotArc:            [0.30, 0.90],
    autoTrackY:         [0.45, 0.85],
};

export class AutoTune {
    constructor() {
        this.params = { ...DEFAULTS, ...(this._load() || {}) };
        this.history = []; // recent point outcomes
        this._lastTuneSignature = '';
    }

    get(name) { return this.params[name]; }

    observePoint(outcome) {
        // outcome: { winner, reason, lastHitBy, rallyShots }
        this.history.push({ ...outcome, t: Date.now() });
        if (this.history.length > HISTORY_MAX) this.history.shift();
        this._tune();
        this._save();
    }

    _tune() {
        // Need a minimum window before we adjust anything.
        if (this.history.length < 6) return;
        const recent = this.history.slice(-12);

        const playerWins   = recent.filter(p => p.winner === 'player').length;
        const winRate      = playerWins / recent.length;
        const avgRally     = recent.reduce((s, p) => s + (p.rallyShots || 0), 0) / recent.length;

        // Player-side errors (player was the last to touch before ball died)
        const playerOut    = recent.filter(p => p.reason === 'out'  && p.lastHitBy === 'player').length;
        const playerNet    = recent.filter(p => p.reason === 'net'  && p.lastHitBy === 'player').length;
        const playerFault  = recent.filter(p => p.reason === 'fault'&& p.lastHitBy === 'player').length;
        const playerMissed = recent.filter(p => p.lastHitBy !== 'player' && p.winner === 'opponent').length;

        // --- Opponent difficulty: track player win rate toward ~55%
        if (winRate < 0.35)       this._nudge('opponentDifficulty', -0.04);
        else if (winRate > 0.70)  this._nudge('opponentDifficulty', +0.04);

        // --- Shot arc: too many in the net -> raise arc; too many sailing -> lower
        if (playerNet >= 3)       this._nudge('shotArc', +0.05);
        if (playerOut >= 3)       this._nudge('shotArc', -0.04);

        // --- Paddle thrust: balls dying short -> stronger; balls sailing long -> softer
        if (playerNet >= 3 && playerOut <= 1) this._nudge('paddleThrust', +0.15);
        if (playerOut >= 3 && playerNet <= 1) this._nudge('paddleThrust', -0.15);

        // --- Aim assist: lots of misses (couldn't reach / sent wide) -> more help
        if (playerMissed + playerFault >= 4)  this._nudge('aimAssist', +0.03);
        else if (winRate > 0.65 && avgRally > 5) this._nudge('aimAssist', -0.02);

        // --- Y auto-track: very short rallies AND mostly losing -> track harder
        if (avgRally < 2 && winRate < 0.4)    this._nudge('autoTrackY', +0.03);
        else if (avgRally > 8 && winRate > 0.55) this._nudge('autoTrackY', -0.02);
    }

    _nudge(name, delta) {
        const [lo, hi] = BOUNDS[name];
        this.params[name] = Math.max(lo, Math.min(hi, this.params[name] + delta));
    }

    reset() {
        this.params = { ...DEFAULTS };
        this.history = [];
        this._save();
    }

    snapshot() {
        return { params: { ...this.params }, samples: this.history.length };
    }

    _load() {
        try {
            const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    }

    _save() {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.params));
            }
        } catch (_) { /* ignore */ }
    }
}
