const Matter = require("matter-js");
const BaseArena = require("./BaseArena");
const ARENA_CONFIG = require("../config/arenaConfig");

class TripleRingArena extends BaseArena {
    constructor() {
        super();

        this.Engine = Matter.Engine;
        this.World = Matter.World;
        this.Bodies = Matter.Bodies;
        this.Body = Matter.Body;
        this.Sleeping = Matter.Sleeping;

        this.engine = this.Engine.create();
        this.world = this.engine.world;
        this.engine.world.gravity.y = 0.1;

        this.balls = [];
        this.rings = [];
        this.walls = [];
    }

    init(players) {
        this.engine = this.Engine.create();
        this.world = this.engine.world;
        this.engine.world.gravity.y = 0.2;
        this.engine.positionIterations = 10;
        this.engine.velocityIterations = 10;
        this.engine.constraintIterations = 4;
        this.engine.enableSleeping = false;
        this.balls = [];
        this.rings = [];
        this.walls = [];

        const centerX = ARENA_CONFIG.center.x;
        const centerY = ARENA_CONFIG.center.y;

        players.forEach((p) => {
            const ball = this.Bodies.circle(
                centerX + (Math.random() - 0.5) * 100,
                centerY + (Math.random() - 0.5) * 100,
                ARENA_CONFIG.balls.radius,
                {
                    restitution: 1,
                    friction: 0,
                    frictionAir: 0,
                    density: 0.01,
                }
            );

            this.Body.setVelocity(ball, {
                x: (Math.random() - 0.5) * ARENA_CONFIG.balls.radius,
                y: (Math.random() - 0.5) * ARENA_CONFIG.balls.radius
            });

            ball.label = p.name;
            this.balls.push(ball);
        });

        ARENA_CONFIG.rings.forEach((ringConfig) => {
            this.createRing(centerX, centerY, ringConfig);
        });

        this.World.add(this.world, this.balls);
    }

    createRing(x, y, config) {
        const { id, radius, gapAngle, angularSpeed } = config;
        const thickness = 12;
        const colliderThickness = thickness + 4;
        const gapCenter = Math.random() * Math.PI * 2;
        const gapStart = gapCenter - gapAngle / 2;
        const arcSpan = (Math.PI * 2) - gapAngle;
        const segments = Math.max(72, Math.ceil((radius * arcSpan) / 10));
        const segmentAngle = arcSpan / segments;
        const segmentLength = Math.max(14, radius * segmentAngle * 1.2);

        const ring = {
            id,
            x,
            y,
            radius,
            thickness,
            colliderThickness,
            gapAngle,
            gapStart,
            angularSpeed,
            rotation: 0,
            segments: []
        };

        for (let i = 0; i < segments; i++) {
            const baseAngle = gapStart + gapAngle + (segmentAngle * (i + 0.5));
            const wall = this.Bodies.rectangle(0, 0, segmentLength, colliderThickness, {
                isStatic: true,
                restitution: 1,
                friction: 0,
                frictionStatic: 0
            });

            ring.segments.push({ body: wall, baseAngle });
            this.walls.push(wall);
        }

        this.rings.push(ring);
        this.syncRing(ring);
        this.World.add(this.world, ring.segments.map((segment) => segment.body));
    }

    syncRing(ring) {
        ring.segments.forEach((segment) => {
            const angle = segment.baseAngle + ring.rotation;
            const px = ring.x + Math.cos(angle) * ring.radius;
            const py = ring.y + Math.sin(angle) * ring.radius;

            this.Body.setPosition(segment.body, { x: px, y: py });
            this.Body.setAngle(segment.body, angle + Math.PI / 2);
        });
    }

    advanceRings(stepScale = 1) {
        this.rings.forEach((ring) => {
            if (ring.angularSpeed === 0) {
                return;
            }

            ring.rotation += ring.angularSpeed * stepScale;
            this.syncRing(ring);
        });
    }

    keepBallsMoving() {
        const minimumSpeed = 4;

        this.balls.forEach((ball) => {
            this.Sleeping.set(ball, false);

            if (ball.speed >= minimumSpeed) {
                return;
            }

            const currentAngle = ball.speed > 0.001
                ? Math.atan2(ball.velocity.y, ball.velocity.x)
                : Math.random() * Math.PI * 2;

            const nextAngle = currentAngle + (Math.random() - 0.5) * 0.35;

            this.Body.setVelocity(ball, {
                x: Math.cos(nextAngle) * minimumSpeed,
                y: Math.sin(nextAngle) * minimumSpeed
            });
        });
    }

    update() {
        const substeps = 2;
        const delta = 1000 / 60 / substeps;

        for (let i = 0; i < substeps; i++) {
            this.advanceRings(1 / substeps);
            this.Engine.update(this.engine, delta);
        }

        this.keepBallsMoving();

        // Remove escaped balls (outside bounds)
        this.balls = this.balls.filter(b => {
            return b.position.x > 0 && b.position.x < 800 &&
                b.position.y > 0 && b.position.y < 600;
        });
    }

    getState() {
        return {
            ballRadius: ARENA_CONFIG.balls.radius,
            balls: this.balls.map(b => ({
                x: b.position.x,
                y: b.position.y,
                name: b.label
            })),
            walls: this.walls.map(w => ({
                x: w.position.x,
                y: w.position.y,
                angle: w.angle,
                width: w.bounds.max.x - w.bounds.min.x,
                height: w.bounds.max.y - w.bounds.min.y
            })),
            rings: this.rings.map((ring) => ({
                id: ring.id,
                x: ring.x,
                y: ring.y,
                radius: ring.radius,
                thickness: ring.thickness,
                colliderThickness: ring.colliderThickness,
                rotation: ring.rotation,
                gapStart: ring.gapStart,
                gapAngle: ring.gapAngle
            }))
        };
    }

    isFinished() {
        return this.balls.length <= 1;
    }

    getWinner() {
        return this.balls[0]
            ? { name: this.balls[0].label }
            : null;
    }

    reset() {
        this.balls = [];
        this.rings = [];
        this.walls = [];
    }
}

module.exports = TripleRingArena;
