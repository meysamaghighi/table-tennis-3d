/**
 * UI Manager
 * Handles all screen transitions, equipment selection, and HUD updates.
 */

import { BLADES, RUBBERS } from '../core/Equipment.js';

export class UIManager {
    constructor(game) {
        this.game = game;
        
        // Screens
        this.screens = {
            loading: document.getElementById('loading-screen'),
            menu: document.getElementById('main-menu'),
            equipment: document.getElementById('equipment-screen'),
            tutorial: document.getElementById('tutorial-screen'),
            game: document.getElementById('game-ui'),
        };
        
        // Overlays
        this.overlays = {
            pause: document.getElementById('pause-menu'),
            gameOver: document.getElementById('game-over'),
        };
        
        // Bind buttons
        this.bindButtons();
        
        // Setup equipment UI
        this.setupEquipmentUI();
        
        // Game callbacks
        this.setupGameCallbacks();
        
        this.currentScreen = 'loading';
    }
    
    bindButtons() {
        // Main menu
        document.getElementById('btn-quick-match').addEventListener('click', () => {
            this.hideScreen('menu');
            this.showScreen('game');
            this.game.startMatch();
        });
        
        document.getElementById('btn-equipment').addEventListener('click', () => {
            this.hideScreen('menu');
            this.showScreen('equipment');
        });
        
        document.getElementById('btn-tutorial').addEventListener('click', () => {
            this.hideScreen('menu');
            this.showScreen('tutorial');
        });
        
        // Back buttons
        document.getElementById('btn-back-from-equip').addEventListener('click', () => {
            this.hideScreen('equipment');
            this.showScreen('menu');
        });
        
        document.getElementById('btn-back-from-tut').addEventListener('click', () => {
            this.hideScreen('tutorial');
            this.showScreen('menu');
        });
        
        // Pause menu
        document.getElementById('btn-resume').addEventListener('click', () => {
            this.hideOverlay('pause');
            this.game.resume();
        });
        
        document.getElementById('btn-restart').addEventListener('click', () => {
            this.hideOverlay('pause');
            this.game.startMatch();
        });
        
        document.getElementById('btn-quit').addEventListener('click', () => {
            this.hideOverlay('pause');
            this.hideScreen('game');
            this.showScreen('menu');
        });
        
        // Game over
        document.getElementById('btn-play-again').addEventListener('click', () => {
            this.hideOverlay('gameOver');
            this.game.startMatch();
        });
        
        document.getElementById('btn-menu').addEventListener('click', () => {
            this.hideOverlay('gameOver');
            this.hideScreen('game');
            this.showScreen('menu');
        });
    }
    
    setupEquipmentUI() {
        // Blade list
        const bladeList = document.getElementById('blade-list');
        BLADES.forEach(blade => {
            const btn = document.createElement('button');
            btn.className = 'item-btn';
            btn.dataset.id = blade.id;
            btn.innerHTML = `${blade.name}<span class="item-type">${blade.type}</span>`;
            btn.addEventListener('click', () => this.selectBlade(blade.id));
            bladeList.appendChild(btn);
        });
        
        // Rubber FH list
        const rubberFhList = document.getElementById('rubber-fh-list');
        RUBBERS.forEach(rubber => {
            const btn = document.createElement('button');
            btn.className = 'item-btn';
            btn.dataset.id = rubber.id;
            btn.innerHTML = `${rubber.name}<span class="item-type">${rubber.type}</span>`;
            btn.addEventListener('click', () => this.selectRubberFH(rubber.id));
            rubberFhList.appendChild(btn);
        });
        
        // Rubber BH list
        const rubberBhList = document.getElementById('rubber-bh-list');
        RUBBERS.forEach(rubber => {
            const btn = document.createElement('button');
            btn.className = 'item-btn';
            btn.dataset.id = rubber.id;
            btn.innerHTML = `${rubber.name}<span class="item-type">${rubber.type}</span>`;
            btn.addEventListener('click', () => this.selectRubberBH(rubber.id));
            rubberBhList.appendChild(btn);
        });
        
        this.updateEquipmentUI();
    }
    
    selectBlade(id) {
        this.game.equipment.setBlade(id);
        this.updateEquipmentUI();
    }
    
    selectRubberFH(id) {
        this.game.equipment.setRubberFH(id);
        this.updateEquipmentUI();
    }
    
    selectRubberBH(id) {
        this.game.equipment.setRubberBH(id);
        this.updateEquipmentUI();
    }
    
    updateEquipmentUI() {
        const eq = this.game.equipment;
        
        // Update selections
        document.querySelectorAll('#blade-list .item-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.id === eq.blade.id);
        });
        document.querySelectorAll('#rubber-fh-list .item-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.id === eq.rubberFH.id);
        });
        document.querySelectorAll('#rubber-bh-list .item-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.id === eq.rubberBH.id);
        });
        
        // Update stats panels
        this.renderStats('blade-stats', eq.blade, ['speed', 'control', 'weight', 'flex']);
        this.renderStats('rubber-fh-stats', eq.rubberFH, ['spin', 'speed', 'control', 'friction']);
        this.renderStats('rubber-bh-stats', eq.rubberBH, ['spin', 'speed', 'control', 'friction']);
        
        // Update summary
        document.getElementById('setup-summary').textContent = eq.getSummary();
        
        // Update ratings
        const props = eq.getPaddleProperties();
        document.getElementById('rating-speed').style.width = `${props.speed * 100}%`;
        document.getElementById('rating-spin').style.width = `${props.spin * 100}%`;
        document.getElementById('rating-control').style.width = `${props.control * 100}%`;
        
        // Update paddle rubber color
        if (this.game.paddle) {
            this.game.paddle.setRubberColor(eq.rubberFH.color);
        }
    }
    
    renderStats(elementId, item, statNames) {
        const container = document.getElementById(elementId);
        container.innerHTML = '';
        
        statNames.forEach(stat => {
            const value = item[stat];
            const percent = typeof value === 'number' ? value * 10 : 50;
            let barClass = 'medium';
            if (percent >= 70) barClass = 'high';
            else if (percent < 40) barClass = 'low';
            
            const row = document.createElement('div');
            row.className = 'stat-row';
            row.innerHTML = `
                <span>${this.capitalize(stat)}</span>
                <div class="stat-bar"><div class="stat-bar-fill ${barClass}" style="width:${percent}%"></div></div>
            `;
            container.appendChild(row);
        });
    }
    
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    setupGameCallbacks() {
        this.game.onScoreChange = (p, o) => {
            this._popScore('score-player', p, this._lastP);
            this._popScore('score-opponent', o, this._lastO);
            this._lastP = p; this._lastO = o;
        };
        
        this.game.onStateChange = (newState, oldState) => {
            if (newState === 'paused') {
                this.showOverlay('pause');
            }

            if (newState === 'game_over') {
                const winner = this.game.getWinner();
                document.getElementById('game-result').textContent =
                    winner === 'player' ? 'Victory!' : 'Defeat';
                document.getElementById('final-score').textContent =
                    `${this.game.score.player} - ${this.game.score.opponent}`;
                this.showOverlay('gameOver');
            }

        };
        
        this.game.onMessage = (msg) => {
            document.getElementById('message-area').textContent = msg;
        };
        
        this.game.onServeChange = (server) => {
            document.getElementById('serve-indicator').textContent =
                server === 'player' ? 'Your Serve' : "Opponent's Serve";
        };
        
        this.game.onShotInfo = (shotType, spinType, hitter) => {
            const shotEl = document.getElementById('shot-type');
            const spinEl = document.getElementById('spin-indicator');
            
            if (hitter === 'player') {
                shotEl.textContent = shotType;
                spinEl.textContent = spinType;
                shotEl.style.color = '#ff6b35';
            } else {
                shotEl.textContent = `${shotType}`;
                spinEl.textContent = spinType;
                shotEl.style.color = '#4488ff';
            }
            
            // Clear after delay
            setTimeout(() => {
                if (shotEl.textContent === shotType) {
                    shotEl.textContent = '';
                    spinEl.textContent = '';
                }
            }, 2000);
        };
    }
    
    showScreen(name) {
        if (this.screens[name]) {
            this.screens[name].classList.add('active');
            this.currentScreen = name;
        }
    }
    
    hideScreen(name) {
        if (this.screens[name]) {
            this.screens[name].classList.remove('active');
        }
    }
    
    showOverlay(name) {
        if (this.overlays[name]) {
            this.overlays[name].classList.add('active');
        }
    }
    
    hideOverlay(name) {
        if (this.overlays[name]) {
            this.overlays[name].classList.remove('active');
        }
    }
    
    hideLoading() {
        this.screens.loading.style.display = 'none';
        this.showScreen('menu');
    }
    
    _popScore(id, value, prev) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = value;
        // Only pop when the number actually goes up (a point scored).
        if (prev !== undefined && value > prev) {
            el.classList.remove('score-pop');
            void el.offsetWidth; // force reflow so the animation restarts
            el.classList.add('score-pop');
        }
    }

    update(dt) {
        // The power/spin meters used to visualize auto-tuned shot knobs that no
        // longer exist (swipe + solver own shot shape now). Leave them inert
        // here; the dead meter DOM is removed in Phase 7.
    }
}
