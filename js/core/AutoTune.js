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

// Phase 3/4 removed the shot-shaping crutches (aim assist, shot arc, paddle
// thrust, Y auto-track) — swipe input + the target solver own those now. The
// only surviving knob is opponent difficulty, nudged toward a ~55% player win
// rate.
const DEFAULTS = {
    opponentDifficulty: 0.35,  // 0..1, opponent AI accuracy
};

const BOUNDS = {
    opponentDifficulty: [0.15, 0.85],
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

        const playerWins = recent.filter(p => p.winner === 'player').length;
        const winRate = playerWins / recent.length;

        // Opponent difficulty tracks the player's win rate toward ~55%.
        if (winRate < 0.35)      this._nudge('opponentDifficulty', -0.04);
        else if (winRate > 0.70) this._nudge('opponentDifficulty', +0.04);
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
