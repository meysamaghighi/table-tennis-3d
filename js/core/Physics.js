/**
 * Realistic Table Tennis Physics Engine
 * Handles ball trajectory, spin (Magnus effect), air drag, gravity,
 * and bounce/collision physics with different surface types.
 */

import * as THREE from 'three';

// Constants (SI units)
const BALL_RADIUS = 0.02; // 20mm = 0.02m (actually 20mm is standard)
const BALL_MASS = 0.0027; // 2.7g
const BALL_AREA = Math.PI * BALL_RADIUS * BALL_RADIUS;
const AIR_DENSITY = 1.225;
const GRAVITY = 9.81;
const DRAG_COEFF = 0.4; // Approximate for table tennis ball

// Table dimensions
export const TABLE_LENGTH = 2.74;
export const TABLE_WIDTH = 1.525;
export const TABLE_HEIGHT = 0.76;
export const NET_HEIGHT = 0.1525;
export const NET_OVERHANG = 0.1525;

// Bounce coefficients
const TABLE_RESTITUTION = 0.82;
const TABLE_FRICTION = 0.35;
const NET_RESTITUTION = 0.2;

export class Ball {
    constructor() {
        this.position = new THREE.Vector3(0, 1.5, 0.5);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.spin = new THREE.Vector3(0, 0, 0); // angular velocity rad/s
        this.radius = BALL_RADIUS;
        this.mass = BALL_MASS;
        this.active = false;
        this.bounces = 0;
        this.lastHitBy = null; // 'player', 'opponent', null
        this.lastBounceSide = null; // 'player', 'opponent'
    }

    reset() {
        this.position.set(0, 1.5, 0.5);
        this.velocity.set(0, 0, 0);
        this.spin.set(0, 0, 0);
        this.active = false;
        this.bounces = 0;
        this.lastHitBy = null;
        this.lastBounceSide = null;
    }

    serve(tossVelocity) {
        this.velocity.copy(tossVelocity);
        this.spin.set(0, 0, 0);
        this.active = true;
        this.bounces = 0;
        this.lastHitBy = null;
        this.lastBounceSide = null;
    }

    hit(velocity, spin, hitter) {
        this.velocity.copy(velocity);
        this.spin.copy(spin);
        this.lastHitBy = hitter;
        this.bounces = 0;
        this.lastBounceSide = null;
    }
}

export class PhysicsEngine {
    constructor() {
        this.ball = new Ball();
        this.timeStep = 1 / 120; // 120Hz physics
        this.accumulator = 0;
    }

    reset() {
        this.ball.reset();
    }

    update(dt) {
        if (!this.ball.active) return [];

        this.accumulator += dt;
        const events = [];

        while (this.accumulator >= this.timeStep) {
            const event = this.step();
            if (event) events.push(event);
            this.accumulator -= this.timeStep;
        }

        return events;
    }

    step() {
        const b = this.ball;
        const dt = this.timeStep;

        // 1. Gravity
        b.velocity.y -= GRAVITY * dt;

        // 2. Air Drag (quadratic)
        const vMag = b.velocity.length();
        if (vMag > 0.01) {
            const dragMag = 0.5 * AIR_DENSITY * BALL_AREA * DRAG_COEFF * vMag * vMag / b.mass;
            const dragForce = b.velocity.clone().multiplyScalar(-dragMag / vMag);
            b.velocity.add(dragForce.multiplyScalar(dt));
        }

        // 3. Magnus Effect
        // F_magnus = S * (w x v) where S is spin coefficient
        const spinStrength = b.spin.length();
        if (spinStrength > 0.1 && vMag > 0.1) {
            const magnusCoeff = 0.00008; // Tuned for table tennis
            const magnusForce = new THREE.Vector3()
                .crossVectors(b.spin, b.velocity)
                .multiplyScalar(magnusCoeff);
            b.velocity.add(magnusForce.multiplyScalar(dt / b.mass));
        }

        // 4. Update position
        b.position.add(b.velocity.clone().multiplyScalar(dt));

        // 5. Spin decay (air resistance on spin)
        b.spin.multiplyScalar(1 - 0.02 * dt);

        // 6. Collision checks
        // Floor
        if (b.position.y < b.radius) {
            b.position.y = b.radius;
            return { type: 'floor', position: b.position.clone() };
        }

        // Net collision
        const netEvent = this.checkNetCollision();
        if (netEvent) return netEvent;

        // Table bounce
        const tableEvent = this.checkTableBounce();
        if (tableEvent) return tableEvent;

        // Bounds check (ball way out)
        if (b.position.z > 4 || b.position.z < -4 || 
            b.position.x > 3 || b.position.x < -3 ||
            b.position.y > 5) {
            return { type: 'out', position: b.position.clone() };
        }

        return null;
    }

    checkTableBounce() {
        const b = this.ball;
        const halfLen = TABLE_LENGTH / 2;
        const halfWid = TABLE_WIDTH / 2;

        // Check if ball is near table height
        if (b.position.y < TABLE_HEIGHT + b.radius && b.position.y > TABLE_HEIGHT - 0.05) {
            // Check if within table bounds
            if (Math.abs(b.position.x) <= halfWid && Math.abs(b.position.z) <= halfLen) {
                // Only bounce if moving downward
                if (b.velocity.y < 0) {
                    return this.resolveTableBounce();
                }
            }
        }
        return null;
    }

    resolveTableBounce() {
        const b = this.ball;
        b.position.y = TABLE_HEIGHT + b.radius;
        b.bounces++;

        // Determine which side
        const side = b.position.z > 0 ? 'player' : 'opponent';
        b.lastBounceSide = side;

        // Normal bounce (restitution)
        b.velocity.y = -b.velocity.y * TABLE_RESTITUTION;

        // Friction and spin transfer
        // Relative velocity at contact point
        const tangential = new THREE.Vector3(b.velocity.x, 0, b.velocity.z);
        const spinEffect = new THREE.Vector3(b.spin.z, 0, -b.spin.x).multiplyScalar(b.radius);
        const relVelocity = tangential.clone().add(spinEffect);

        // Apply friction impulse
        const frictionImpulse = relVelocity.clone().multiplyScalar(-TABLE_FRICTION);
        
        // Update linear velocity
        b.velocity.x += frictionImpulse.x;
        b.velocity.z += frictionImpulse.z;

        // Update spin (transfer between linear and angular momentum)
        b.spin.x -= frictionImpulse.z / b.radius * 0.3;
        b.spin.z += frictionImpulse.x / b.radius * 0.3;

        // Check for second bounce on same side = point over
        if (b.bounces >= 2) {
            // Check if both bounces on same side
            // This is handled by game logic tracking bounce positions
        }

        return { 
            type: 'bounce', 
            side: side,
            position: b.position.clone(),
            bounces: b.bounces
        };
    }

    checkNetCollision() {
        const b = this.ball;
        const netZ = 0;
        const netHalfWidth = TABLE_WIDTH / 2 + NET_OVERHANG;
        const netTop = TABLE_HEIGHT + NET_HEIGHT;

        // Check net bounding box
        if (Math.abs(b.position.z) < 0.03 && 
            Math.abs(b.position.x) <= netHalfWidth &&
            b.position.y <= netTop + b.radius &&
            b.position.y >= TABLE_HEIGHT - b.radius) {
            
            // Only if moving across net
            if ((b.lastBounceSide === 'player' && b.velocity.z < 0) ||
                (b.lastBounceSide === 'opponent' && b.velocity.z > 0) ||
                b.lastBounceSide === null) {
                
                // Push ball away from net
                b.position.z = b.velocity.z > 0 ? 0.04 : -0.04;
                b.velocity.z *= -NET_RESTITUTION;
                b.velocity.x *= 0.5;
                b.velocity.y *= 0.5;
                return { type: 'net', position: b.position.clone() };
            }
        }
        return null;
    }

    /**
     * Calculate paddle hit physics
     * @param {Vector3} ballPos - Ball position at contact
     * @param {Vector3} ballVel - Ball incoming velocity
     * @param {Vector3} ballSpin - Ball incoming spin
     * @param {Vector3} paddlePos - Paddle position
     * @param {Vector3} paddleVel - Paddle velocity during swing
     * @param {Vector3} paddleNormal - Paddle surface normal
     * @param {Object} equipment - Equipment properties
     * @param {number} hitQuality - 0 to 1, based on timing and sweet spot
     */
    calculateHit(
        ballPos, ballVel, ballSpin,
        paddlePos, paddleVel, paddleNormal,
        equipment, hitQuality
    ) {
        const props = equipment;
        
        // Sweet spot factor - off-center hits lose power
        const sweetSpotBonus = 0.5 + 0.5 * hitQuality;
        
        // Blade speed factor
        const bladeSpeed = props.speed;
        
        // Rubber elasticity affects outgoing speed
        const restitution = 0.3 + props.elasticity * 0.6 * sweetSpotBonus;
        
        // Friction affects how much spin is transferred
        const friction = props.friction;
        
        // Relative velocity at contact
        const relVel = ballVel.clone().sub(paddleVel);
        
        // Decompose into normal and tangential components
        const normalVel = paddleNormal.clone().multiplyScalar(relVel.dot(paddleNormal));
        const tangentialVel = relVel.clone().sub(normalVel);
        
        // Outgoing normal velocity: reflect incoming normal component, then add paddle thrust.
        // normalVel already points along the projection of relVel on the paddle normal;
        // multiplying by -restitution gives the elastic rebound in the correct direction.
        const outNormal = normalVel.clone().multiplyScalar(-restitution);
        outNormal.add(paddleVel.clone().multiplyScalar(0.5 + bladeSpeed * 0.5));
        
        // Tangential component - affected by friction and spin
        let outTangential = tangentialVel.clone();
        
        // Spin behavior based on rubber type
        let outgoingSpin = new THREE.Vector3();
        
        switch (props.spinBehavior) {
            case 'reverse':
                // Anti-spin: reverses incoming spin, very low outgoing spin
                outgoingSpin = ballSpin.clone().multiplyScalar(-0.3 * friction);
                outTangential.multiplyScalar(0.3); // deadens the ball
                break;
                
            case 'disrupt':
                // Long pimples: randomizes spin, maintains some of incoming
                const disruptFactor = 0.3 + Math.random() * 0.4;
                outgoingSpin = ballSpin.clone().multiplyScalar(disruptFactor);
                // Add some randomness
                outgoingSpin.x += (Math.random() - 0.5) * 20;
                outgoingSpin.z += (Math.random() - 0.5) * 20;
                outTangential.multiplyScalar(0.6);
                break;
                
            case 'flat':
                // Short pimples: low spin, high speed
                outgoingSpin = ballSpin.clone().multiplyScalar(0.2);
                // Add some "skidding" effect - reduces tangential rebound
                outTangential.multiplyScalar(0.8);
                break;
                
            case 'normal':
            default:
                // Inverted rubber: generates spin based on tangential velocity difference
                const spinTransfer = tangentialVel.length() * friction * 80 * sweetSpotBonus;
                const spinAxis = new THREE.Vector3().crossVectors(paddleNormal, tangentialVel).normalize();
                if (spinAxis.length() > 0.1) {
                    outgoingSpin = spinAxis.multiplyScalar(spinTransfer);
                }
                // Also retain some incoming spin
                outgoingSpin.add(ballSpin.clone().multiplyScalar(0.3 * friction));
                break;
        }
        
        // Combine
        const outgoingVel = outNormal.add(outTangential.multiplyScalar(0.7 + friction * 0.3));
        
        // Add some randomness for off-center hits
        if (hitQuality < 0.7) {
            const randomness = (1 - hitQuality) * 0.5;
            outgoingVel.x += (Math.random() - 0.5) * randomness;
            outgoingVel.y += (Math.random() - 0.5) * randomness * 0.5;
            outgoingVel.z += (Math.random() - 0.5) * randomness;
        }
        
        // Ensure ball goes forward (roughly)
        // Player hits from positive z toward negative z
        // Opponent hits from negative z toward positive z
        
        return {
            velocity: outgoingVel,
            spin: outgoingSpin
        };
    }

    getBallState() {
        return {
            position: this.ball.position.clone(),
            velocity: this.ball.velocity.clone(),
            spin: this.ball.spin.clone(),
            active: this.ball.active,
            bounces: this.ball.bounces,
            lastHitBy: this.ball.lastHitBy,
            lastBounceSide: this.ball.lastBounceSide
        };
    }

    setBallState(state) {
        this.ball.position.copy(state.position);
        this.ball.velocity.copy(state.velocity);
        this.ball.spin.copy(state.spin);
        this.ball.active = state.active;
        this.ball.bounces = state.bounces || 0;
        this.ball.lastHitBy = state.lastHitBy;
        this.ball.lastBounceSide = state.lastBounceSide;
    }
}
