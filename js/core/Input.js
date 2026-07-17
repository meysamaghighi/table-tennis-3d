/**
 * Input Manager
 * Handles mouse, keyboard, touch inputs. NO pointer lock (it breaks mouse tracking).
 */

export class InputManager {
    constructor() {
        this.mouse = { x: 0, y: 0, dx: 0, dy: 0 };
        this.mouseRaw = { x: 0, y: 0 };
        this.isMouseDown = false;
        this.wasMouseDown = false;
        this.clicked = false;
        this.keys = {};

        this.playerOffset = { x: 0, z: 0 };
        
        this._callbacks = {};
        this._boundHandlers = {};
        
        this.isTouch = false;
        this.touchId = null;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchStartTime = 0;
        this.hasTouchMoved = false;

        this.setupListeners();
    }
    
    setupListeners() {
        const canvas = document.getElementById('game-canvas');
        
        // Mouse move - track absolute position only. Paddle control is owned by
        // SwipeInput (pointer events) now; this stays for menu/pause niceties.
        this._boundHandlers.mousemove = (e) => {
            this.mouse.dx = e.movementX || 0;
            this.mouse.dy = e.movementY || 0;
            this.updateMouseFromClient(e.clientX, e.clientY);
        };
        
        // Mouse buttons - ALWAYS handle, don't block by isTouch
        this._boundHandlers.mousedown = (e) => {
            if (e.button === 0) {
                this.isMouseDown = true;
                this.clicked = true;
            }
        };
        
        // Click handler on canvas (more reliable on trackpads)
        if (canvas) {
            this._boundHandlers.canvasclick = (e) => {
                this.clicked = true;
            };
            canvas.addEventListener('click', this._boundHandlers.canvasclick);
        }
        
        this._boundHandlers.mouseup = (e) => {
            if (e.button === 0) this.isMouseDown = false;
        };
        
        // Keyboard
        this._boundHandlers.keydown = (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') {
                e.preventDefault();
                this.clicked = true; // Space bar = swing!
            }
            this.emit('keydown', e.code);
        };
        
        this._boundHandlers.keyup = (e) => {
            this.keys[e.code] = false;
            this.emit('keyup', e.code);
        };
        
        // Touch events for mobile
        if (canvas) {
            this._boundHandlers.touchstart = (e) => {
                e.preventDefault();
                this.isTouch = true;
                if (e.touches.length === 1) {
                    const t = e.touches[0];
                    this.touchId = t.identifier;
                    this.touchStartX = t.clientX;
                    this.touchStartY = t.clientY;
                    this.touchStartTime = Date.now();
                    this.hasTouchMoved = false;
                    this.updateMouseFromClient(t.clientX, t.clientY);
                }
            };
            
            this._boundHandlers.touchmove = (e) => {
                e.preventDefault();
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const t = e.changedTouches[i];
                    if (t.identifier === this.touchId) {
                        const dx = Math.abs(t.clientX - this.touchStartX);
                        const dy = Math.abs(t.clientY - this.touchStartY);
                        if (dx > 10 || dy > 10) this.hasTouchMoved = true;
                        this.updateMouseFromClient(t.clientX, t.clientY);
                        break;
                    }
                }
            };
            
            this._boundHandlers.touchend = (e) => {
                e.preventDefault();
                // Taps no longer swing — swipe-to-hit (SwipeInput) owns contact.
                // This handler only releases the tracked touch id.
                for (let i = 0; i < e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === this.touchId) {
                        this.touchId = null;
                        break;
                    }
                }
            };
            
            this._boundHandlers.touchcancel = (e) => {
                this.touchId = null;
            };
            
            canvas.addEventListener('touchstart', this._boundHandlers.touchstart, { passive: false });
            canvas.addEventListener('touchmove', this._boundHandlers.touchmove, { passive: false });
            canvas.addEventListener('touchend', this._boundHandlers.touchend, { passive: false });
            canvas.addEventListener('touchcancel', this._boundHandlers.touchcancel, { passive: false });
        }
        
        window.addEventListener('mousemove', this._boundHandlers.mousemove);
        window.addEventListener('mousedown', this._boundHandlers.mousedown);
        window.addEventListener('mouseup', this._boundHandlers.mouseup);
        window.addEventListener('keydown', this._boundHandlers.keydown);
        window.addEventListener('keyup', this._boundHandlers.keyup);
    }
    
    updateMouseFromClient(clientX, clientY) {
        this.mouseRaw.x = clientX;
        this.mouseRaw.y = clientY;
        this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    }
    
    update(dt) {
        // Player movement (WASD)
        if (!this.isTouch) {
            const moveSpeed = 2.0 * dt;
            if (this.keys['KeyW'] || this.keys['ArrowUp']) this.playerOffset.z -= moveSpeed;
            if (this.keys['KeyS'] || this.keys['ArrowDown']) this.playerOffset.z += moveSpeed;
            if (this.keys['KeyA'] || this.keys['ArrowLeft']) this.playerOffset.x -= moveSpeed;
            if (this.keys['KeyD'] || this.keys['ArrowRight']) this.playerOffset.x += moveSpeed;
            
            this.playerOffset.x = Math.max(-0.6, Math.min(0.6, this.playerOffset.x));
            this.playerOffset.z = Math.max(-0.2, Math.min(0.4, this.playerOffset.z));
        }
        
        this.mouse.dx = 0;
        this.mouse.dy = 0;
        this.clicked = false;
        this.wasMouseDown = this.isMouseDown;
    }
    
    justClicked() {
        return this.clicked || (this.isMouseDown && !this.wasMouseDown);
    }

    on(event, callback) {
        if (!this._callbacks[event]) this._callbacks[event] = [];
        this._callbacks[event].push(callback);
    }
    
    emit(event, data) {
        if (this._callbacks[event]) {
            this._callbacks[event].forEach(cb => cb(data));
        }
    }
    
    dispose() {
        const canvas = document.getElementById('game-canvas');

        window.removeEventListener('mousemove', this._boundHandlers.mousemove);
        window.removeEventListener('mousedown', this._boundHandlers.mousedown);
        window.removeEventListener('mouseup', this._boundHandlers.mouseup);
        window.removeEventListener('keydown', this._boundHandlers.keydown);
        window.removeEventListener('keyup', this._boundHandlers.keyup);
        
        if (canvas) {
            canvas.removeEventListener('touchstart', this._boundHandlers.touchstart);
            canvas.removeEventListener('touchmove', this._boundHandlers.touchmove);
            canvas.removeEventListener('touchend', this._boundHandlers.touchend);
            canvas.removeEventListener('touchcancel', this._boundHandlers.touchcancel);
            if (this._boundHandlers.canvasclick) {
                canvas.removeEventListener('click', this._boundHandlers.canvasclick);
            }
        }
    }
}
