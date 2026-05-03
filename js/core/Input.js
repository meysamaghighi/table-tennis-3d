/**
 * Input Manager
 * Handles mouse, keyboard, touch, and scroll inputs for paddle control and game actions.
 */

export class InputManager {
    constructor() {
        this.mouse = { x: 0, y: 0, dx: 0, dy: 0 };
        this.mouseRaw = { x: 0, y: 0 };
        this.isMouseDown = false;
        this.wasMouseDown = false;
        this.scrollDelta = 0;
        this.keys = {};
        
        this.paddleAngle = 0; // radians, positive = open face (topspin), negative = closed (backspin)
        this.paddleAngleTarget = 0;
        
        this.playerOffset = { x: 0, z: 0 }; // Player positional offset
        
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
        // Mouse move
        this._boundHandlers.mousemove = (e) => {
            if (this.isTouch) return;
            this.mouseRaw.x = e.clientX;
            this.mouseRaw.y = e.clientY;
            this.mouse.dx = e.movementX || 0;
            this.mouse.dy = e.movementY || 0;
            this.updateMouseFromClient(e.clientX, e.clientY);
        };
        
        // Mouse buttons
        this._boundHandlers.mousedown = (e) => {
            if (this.isTouch) return;
            if (e.button === 0) this.isMouseDown = true;
        };
        
        this._boundHandlers.mouseup = (e) => {
            if (this.isTouch) return;
            if (e.button === 0) this.isMouseDown = false;
        };
        
        // Scroll for paddle angle
        this._boundHandlers.wheel = (e) => {
            if (this.isTouch) return;
            e.preventDefault();
            this.scrollDelta += e.deltaY;
            this.paddleAngleTarget += e.deltaY * 0.001;
            this.paddleAngleTarget = Math.max(-0.8, Math.min(0.8, this.paddleAngleTarget));
        };
        
        // Keyboard
        this._boundHandlers.keydown = (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') e.preventDefault();
            this.emit('keydown', e.code);
        };
        
        this._boundHandlers.keyup = (e) => {
            this.keys[e.code] = false;
            this.emit('keyup', e.code);
        };
        
        // Pointer lock change
        this._boundHandlers.pointerlockchange = () => {
            this.emit('pointerlockchange', document.pointerLockElement !== null);
        };
        
        // Touch events for mobile - on canvas only
        const canvas = document.getElementById('game-canvas');
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
                        if (dx > 10 || dy > 10) {
                            this.hasTouchMoved = true;
                        }
                        this.updateMouseFromClient(t.clientX, t.clientY);
                        break;
                    }
                }
            };
            
            this._boundHandlers.touchend = (e) => {
                e.preventDefault();
                for (let i = 0; i < e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === this.touchId) {
                        const duration = Date.now() - this.touchStartTime;
                        // Quick tap without much movement = swing
                        if (!this.hasTouchMoved && duration < 250) {
                            this.triggerSwing();
                        }
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
        window.addEventListener('wheel', this._boundHandlers.wheel, { passive: false });
        window.addEventListener('keydown', this._boundHandlers.keydown);
        window.addEventListener('keyup', this._boundHandlers.keyup);
        document.addEventListener('pointerlockchange', this._boundHandlers.pointerlockchange);
    }
    
    updateMouseFromClient(clientX, clientY) {
        this.mouseRaw.x = clientX;
        this.mouseRaw.y = clientY;
        this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    }
    
    update(dt) {
        // Smooth paddle angle
        this.paddleAngle += (this.paddleAngleTarget - this.paddleAngle) * 8 * dt;
        
        // Player movement (WASD) - desktop only
        if (!this.isTouch) {
            const moveSpeed = 2.0 * dt;
            if (this.keys['KeyW'] || this.keys['ArrowUp']) this.playerOffset.z -= moveSpeed;
            if (this.keys['KeyS'] || this.keys['ArrowDown']) this.playerOffset.z += moveSpeed;
            if (this.keys['KeyA'] || this.keys['ArrowLeft']) this.playerOffset.x -= moveSpeed;
            if (this.keys['KeyD'] || this.keys['ArrowRight']) this.playerOffset.x += moveSpeed;
            
            // Clamp player position
            this.playerOffset.x = Math.max(-0.6, Math.min(0.6, this.playerOffset.x));
            this.playerOffset.z = Math.max(-0.2, Math.min(0.4, this.playerOffset.z));
        }
        
        // Reset dx/dy after read
        this.mouse.dx = 0;
        this.mouse.dy = 0;
        this.scrollDelta = 0;
        
        this.wasMouseDown = this.isMouseDown;
    }
    
    justClicked() {
        return this.isMouseDown && !this.wasMouseDown;
    }
    
    triggerSwing() {
        // Simulate a click for one frame
        this.isMouseDown = true;
        this.wasMouseDown = false;
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
    
    lockPointer(element) {
        if (this.isTouch) return;
        if (element && element.requestPointerLock) {
            element.requestPointerLock();
        }
    }
    
    unlockPointer() {
        if (document.exitPointerLock) {
            document.exitPointerLock();
        }
    }
    
    isPointerLocked() {
        return document.pointerLockElement !== null;
    }
    
    dispose() {
        window.removeEventListener('mousemove', this._boundHandlers.mousemove);
        window.removeEventListener('mousedown', this._boundHandlers.mousedown);
        window.removeEventListener('mouseup', this._boundHandlers.mouseup);
        window.removeEventListener('wheel', this._boundHandlers.wheel);
        window.removeEventListener('keydown', this._boundHandlers.keydown);
        window.removeEventListener('keyup', this._boundHandlers.keyup);
        document.removeEventListener('pointerlockchange', this._boundHandlers.pointerlockchange);
        
        const canvas = document.getElementById('game-canvas');
        if (canvas) {
            canvas.removeEventListener('touchstart', this._boundHandlers.touchstart);
            canvas.removeEventListener('touchmove', this._boundHandlers.touchmove);
            canvas.removeEventListener('touchend', this._boundHandlers.touchend);
            canvas.removeEventListener('touchcancel', this._boundHandlers.touchcancel);
        }
    }
}
