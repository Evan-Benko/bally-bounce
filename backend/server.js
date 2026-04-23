const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");
const { OAuth2Client } = require("google-auth-library");
const GameManager = require("./GameManager");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});


const googleClientId = "861952746280-1mfasi57ff9ngqhomj9drgeodg3qugha.apps.googleusercontent.com";
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;
const sessions = new Map();
const game = new GameManager(io);

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.get("/api/config", (_req, res) => {
    res.json({
        googleClientId,
        googleEnabled: Boolean(googleClientId)
    });
});

app.post("/api/auth/google", async (req, res) => {
    if (!googleClient || !googleClientId) {
        return res.status(503).json({ error: "Google sign-in is not configured" });
    }

    const credential = req.body?.credential;
    if (!credential) {
        return res.status(400).json({ error: "Missing Google credential" });
    }

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: googleClientId
        });
        const payload = ticket.getPayload();

        if (!payload?.sub || !payload?.email) {
            return res.status(400).json({ error: "Incomplete Google profile" });
        }

        const sessionToken = crypto.randomUUID();
        const user = {
            userId: payload.sub,
            email: payload.email,
            name: payload.name || payload.email,
            picture: payload.picture || null,
            provider: "google"
        };

        sessions.set(sessionToken, user);

        return res.json({
            sessionToken,
            user
        });
    } catch (error) {
        console.error("Google auth failed:", error.message);
        return res.status(401).json({ error: "Invalid Google credential" });
    }
});

io.on("connection", (socket) => {
    console.log("Client connected");
    socket.emit("lobby_state", {
        running: game.running,
        playersJoined: game.players.length,
        playersNeeded: Math.max(0, 3 - game.players.length)
    });

    socket.on("join_game", (payload, callback) => {
        const sessionToken = payload?.sessionToken;
        const user = sessions.get(sessionToken);

        if (!user) {
            callback?.({ ok: false, error: "Please sign in with Google first" });
            return;
        }

        const result = game.addPlayer({
            userId: user.userId,
            email: user.email,
            name: user.name
        });

        callback?.(result);
    });
});

setInterval(() => {
    game.update();
}, 1000 / 60);

app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});
