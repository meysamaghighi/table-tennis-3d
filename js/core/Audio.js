/**
 * Audio Manager
 * Synthesized sound effects using Web Audio API.
 */

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        this.volume = 0.5;
    }
    
    init() {
        if (this.initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }
    
    ensureContext() {
        if (!this.initialized) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
    
    playHit(intensity = 1.0) {
        this.ensureContext();
        if (!this.ctx) return;
        
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(200 + intensity * 400, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3000 + intensity * 2000, t);
        filter.frequency.exponentialRampToValueAtTime(500, t + 0.15);
        
        gain.gain.setValueAtTime(this.volume * 0.3 * intensity, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(t);
        osc.stop(t + 0.15);
    }
    
    playBounce(intensity = 0.5) {
        this.ensureContext();
        if (!this.ctx) return;
        
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400 + intensity * 300, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.08);
        
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, t);
        filter.Q.setValueAtTime(2, t);
        
        gain.gain.setValueAtTime(this.volume * 0.2 * intensity, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(t);
        osc.stop(t + 0.08);
    }
    
    playNet() {
        this.ensureContext();
        if (!this.ctx) return;
        
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.linearRampToValueAtTime(100, t + 0.2);
        
        gain.gain.setValueAtTime(this.volume * 0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(t);
        osc.stop(t + 0.2);
    }
    
    playScore() {
        this.ensureContext();
        if (!this.ctx) return;
        
        const t = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + i * 0.1);
            
            gain.gain.setValueAtTime(0, t + i * 0.1);
            gain.gain.linearRampToValueAtTime(this.volume * 0.2, t + i * 0.1 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.3);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(t + i * 0.1);
            osc.stop(t + i * 0.1 + 0.3);
        });
    }
    
    playFault() {
        this.ensureContext();
        if (!this.ctx) return;
        
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.linearRampToValueAtTime(150, t + 0.3);
        
        gain.gain.setValueAtTime(this.volume * 0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(t);
        osc.stop(t + 0.3);
    }
}
