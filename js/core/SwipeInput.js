/**
 * Swipe Input
 * Pointer Events based control: works for touch AND mouse drag, so desktop
 * support falls out for free. Tracks a rolling ~120ms sample buffer to
 * derive smoothed velocity (px/s) and path curvature for the swipe-to-hit
 * pipeline (Phase 3). Phase 1 only consumes `position`.
 */

const SAMPLE_WINDOW_MS = 120;
const CONTROL_ZONE_TOP = 0.55; // top 55% of the element is above the control zone

export class SwipeInput {
    constructor(element) {
        this.element = element;
        this.isDown = false;
        this.pointerId = null;

        // Normalized position: x in [-1, 1] (screen-width relative),
        // y in [0, 1] where 0 = top of the control zone (finger pushed up,
        // reaching over the table) and 1 = bottom (resting near the player).
        this.position = { x: 0, y: 1 };
        this.velocity = { x: 0, y: 0 }; // px/s, smoothed over the sample buffer
        this.pathCurvature = 0;

        this._samples = [];
        this._boundHandlers = {
            pointerdown: (e) => this._onPointerDown(e),
            pointermove: (e) => this._onPointerMove(e),
            pointerup: (e) => this._onPointerUp(e),
            pointercancel: (e) => this._onPointerUp(e),
        };

        this.element.addEventListener('pointerdown', this._boundHandlers.pointerdown);
        window.addEventListener('pointermove', this._boundHandlers.pointermove);
        window.addEventListener('pointerup', this._boundHandlers.pointerup);
        window.addEventListener('pointercancel', this._boundHandlers.pointercancel);
    }

    _onPointerDown(e) {
        this.isDown = true;
        this.pointerId = e.pointerId;
        this._samples.length = 0;
        this._updatePosition(e.clientX, e.clientY);
        this._pushSample(e.clientX, e.clientY);
    }

    _onPointerMove(e) {
        // Mice hover-track continuously (matches the previous mouse-follow
        // feel); touch only tracks while the finger that started the
        // gesture is still down.
        if (e.pointerType !== 'mouse' && (!this.isDown || e.pointerId !== this.pointerId)) return;
        this._updatePosition(e.clientX, e.clientY);
        this._pushSample(e.clientX, e.clientY);
        this._updateVelocityAndCurvature();
    }

    _onPointerUp(e) {
        if (e.pointerId !== this.pointerId) return;
        this.isDown = false;
        this.pointerId = null;
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.pathCurvature = 0;
    }

    _updatePosition(clientX, clientY) {
        const rect = this.element.getBoundingClientRect();
        const nx = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
        const ny = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;

        this.position.x = Math.max(-1, Math.min(1, nx * 2 - 1));

        // Remap so 0..1 spans just the control zone band (bottom portion of
        // the element); above the band clamps to 0 (full reach).
        const zoneY = (ny - CONTROL_ZONE_TOP) / (1 - CONTROL_ZONE_TOP);
        this.position.y = Math.max(0, Math.min(1, zoneY));
    }

    _pushSample(clientX, clientY) {
        const t = performance.now();
        this._samples.push({ x: clientX, y: clientY, t });
        const cutoff = t - SAMPLE_WINDOW_MS;
        while (this._samples.length > 2 && this._samples[0].t < cutoff) {
            this._samples.shift();
        }
    }

    _updateVelocityAndCurvature() {
        const n = this._samples.length;
        if (n < 2) return;
        const first = this._samples[0];
        const last = this._samples[n - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt <= 0) return;

        this.velocity.x = (last.x - first.x) / dt;
        this.velocity.y = (last.y - first.y) / dt;

        // Curvature: max perpendicular deviation of intermediate samples
        // from the straight line first->last, normalized by that line's
        // length. ~0 for a straight swipe, grows for a curved/hooked one.
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        const straightDist = Math.hypot(dx, dy);
        if (straightDist < 1) {
            this.pathCurvature = 0;
            return;
        }
        let maxDeviation = 0;
        for (let i = 1; i < n - 1; i++) {
            const p = this._samples[i];
            const cross = (dx * (p.y - first.y) - dy * (p.x - first.x)) / straightDist;
            maxDeviation = Math.max(maxDeviation, Math.abs(cross));
        }
        this.pathCurvature = maxDeviation / straightDist;
    }

    dispose() {
        this.element.removeEventListener('pointerdown', this._boundHandlers.pointerdown);
        window.removeEventListener('pointermove', this._boundHandlers.pointermove);
        window.removeEventListener('pointerup', this._boundHandlers.pointerup);
        window.removeEventListener('pointercancel', this._boundHandlers.pointercancel);
    }
}
