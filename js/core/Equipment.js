/**
 * Equipment System
 * Defines blades and rubbers with realistic properties that affect gameplay physics.
 */

// Blade definitions
export const BLADES = [
    {
        id: 'allwood',
        name: 'All-Wood Classic',
        type: 'Allround',
        speed: 6,
        control: 9,
        weight: 5, // 1-10, affects swing inertia
        flex: 7,
        description: 'Traditional 5-ply wood construction. Excellent control and feeling.',
    },
    {
        id: 'carbon',
        name: 'Carbon Speed X',
        type: 'Offensive+',
        speed: 10,
        control: 4,
        weight: 3,
        flex: 3,
        description: 'Carbon fiber layers for maximum speed. Demands excellent technique.',
    },
    {
        id: 'defense',
        name: 'Defensive Master',
        type: 'Defensive',
        speed: 3,
        control: 10,
        weight: 8,
        flex: 9,
        description: 'Heavy, flexible blade designed for maximum control and absorption.',
    },
    {
        id: 'hybrid',
        name: 'Hybrid Fiber',
        type: 'Offensive',
        speed: 8,
        control: 7,
        weight: 5,
        flex: 5,
        description: 'Aramid-carbon blend. Balanced speed with good control.',
    },
    {
        id: 'junior',
        name: 'Junior Trainer',
        type: 'Beginner',
        speed: 4,
        control: 10,
        weight: 4,
        flex: 8,
        description: 'Lightweight and forgiving. Perfect for learning the basics.',
    }
];

// Rubber definitions with distinct physics behaviors
export const RUBBERS = [
    {
        id: 'tenergy',
        name: 'Tenergy 05',
        type: 'Inverted (Tension)',
        spin: 10,
        speed: 9,
        control: 6,
        friction: 0.95,
        elasticity: 0.92,
        throwAngle: 'High',
        spinBehavior: 'normal', // normal spin generation
        description: 'High-tension spring sponge. Maximum spin and catapult effect.',
        color: '#c62828',
    },
    {
        id: 'markv',
        name: 'Mark V',
        type: 'Inverted (Classic)',
        spin: 6,
        speed: 6,
        control: 9,
        friction: 0.75,
        elasticity: 0.70,
        throwAngle: 'Medium',
        spinBehavior: 'normal',
        description: 'The classic all-around rubber. Predictable and reliable.',
        color: '#b71c1c',
    },
    {
        id: 'antispin',
        name: 'Anti-Spin Pro',
        type: 'Anti-Spin',
        spin: 1,
        speed: 3,
        control: 10,
        friction: 0.15,
        elasticity: 0.30,
        throwAngle: 'Very Low',
        spinBehavior: 'reverse', // reverses incoming spin
        description: 'Reverses opponent spin. The ball dies and returns with opposite rotation.',
        color: '#37474f',
    },
    {
        id: 'longpips',
        name: 'Long Pips OX',
        type: 'Long Pimples',
        spin: 2,
        speed: 4,
        control: 7,
        friction: 0.25,
        elasticity: 0.45,
        throwAngle: 'Random',
        spinBehavior: 'disrupt', // randomizes/maintains incoming spin
        description: 'Long pimpled surface disrupts spin. Unpredictable for opponents.',
        color: '#e0e0e0',
    },
    {
        id: 'shortpips',
        name: 'Short Pips Speed',
        type: 'Short Pimples',
        spin: 3,
        speed: 8,
        control: 6,
        friction: 0.35,
        elasticity: 0.80,
        throwAngle: 'Low',
        spinBehavior: 'flat', // low spin, speed-focused
        description: 'Flat hits with low spin. Ball skids off the pimples for speed shots.',
        color: '#f5f5f5',
    },
    {
        id: 'hurricane',
        name: 'Hurricane 3',
        type: 'Inverted (Tacky)',
        spin: 10,
        speed: 7,
        control: 5,
        friction: 0.98,
        elasticity: 0.65,
        throwAngle: 'High',
        spinBehavior: 'normal',
        description: 'Extremely tacky Chinese rubber. Unmatched spin potential on loops.',
        color: '#d32f2f',
    }
];

export class Equipment {
    constructor() {
        this.blade = BLADES[0];
        this.rubberFH = RUBBERS[1]; // Mark V default FH
        this.rubberBH = RUBBERS[1]; // Mark V default BH
    }

    setBlade(bladeId) {
        const blade = BLADES.find(b => b.id === bladeId);
        if (blade) this.blade = blade;
    }

    setRubberFH(rubberId) {
        const rubber = RUBBERS.find(r => r.id === rubberId);
        if (rubber) this.rubberFH = rubber;
    }

    setRubberBH(rubberId) {
        const rubber = RUBBERS.find(r => r.id === rubberId);
        if (rubber) this.rubberBH = rubber;
    }

    // Get effective stats based on active rubber (forehand for now)
    getActiveRubber() {
        return this.rubberFH;
    }

    // Calculate overall paddle properties for physics
    getPaddleProperties() {
        const rubber = this.getActiveRubber();
        const blade = this.blade;

        // Composite properties
        return {
            speed: (blade.speed * 0.6 + rubber.speed * 0.4) / 10,
            spin: rubber.spin / 10,
            control: (blade.control * 0.5 + rubber.control * 0.5) / 10,
            friction: rubber.friction,
            elasticity: rubber.elasticity,
            weight: blade.weight / 10,
            spinBehavior: rubber.spinBehavior,
            throwAngle: rubber.throwAngle,
        };
    }

    getSummary() {
        return `${this.blade.name} + ${this.rubberFH.name} (FH) + ${this.rubberBH.name} (BH)`;
    }
}
