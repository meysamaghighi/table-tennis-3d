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
            // Short white-noise buffer reused for hit transients.
            const len = Math.floor(this.ctx.sampleRate * 0.05);
            this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
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

        // Layer 2 — transient "click": a very short, bright noise burst that
        // gives the contact its snap. Louder/brighter with intensity.
        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const nFilter = this.ctx.createBiquadFilter();
            nFilter.type = 'highpass';
            nFilter.frequency.setValueAtTime(1500 + intensity * 2500, t);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(this.volume * 0.22 * intensity, t);
            nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
            noise.connect(nFilter); nFilter.connect(nGain); nGain.connect(this.ctx.destination);
            noise.start(t); noise.stop(t + 0.05);
        }

        // Layer 3 — wood tone: a quick triangle resonance for the blade's
        // hollow "tock", pitched a little higher on harder hits.
        const wood = this.ctx.createOscillator();
        const woodGain = this.ctx.createGain();
        wood.type = 'triangle';
        wood.frequency.setValueAtTime(420 + intensity * 180, t);
        wood.frequency.exponentialRampToValueAtTime(220, t + 0.09);
        woodGain.gain.setValueAtTime(this.volume * 0.18 * (0.6 + intensity * 0.4), t);
        woodGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        wood.connect(woodGain); woodGain.connect(this.ctx.destination);
        wood.start(t); wood.stop(t + 0.1);
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
