const ARENA_CONFIG = {
    center: {
        x: 400,
        y: 300
    },
    rings: [
        {
            id: "outer",
            radius: 200,
            gapAngle: 0.20,
            angularSpeed: -0.0025
        },
        {
            id: "middle",
            radius: 140,
            gapAngle: 0.30,
            angularSpeed: 0.0035
        },
        {
            id: "inner",
            radius: 80,
            gapAngle: 0.28,
            angularSpeed: -0.005
        }
    ],
    balls: {
        radius: 5
    }
};

module.exports = ARENA_CONFIG;
