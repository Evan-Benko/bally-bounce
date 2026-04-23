const TripleRingArena = require("./Arena/TripleRingArena");

class GameManager {
    constructor(io) {
        this.io = io;
        this.players = [];
        this.arena = new TripleRingArena();
        this.running = false;
        this.minimumPlayers = 2;
        this.lastWinner = null;
    }

    addPlayer(user) {
        if (this.running) {
            return { ok: false, error: "Round already in progress" };
        }

        if (this.players.some((player) => player.userId === user.userId)) {
            return { ok: true, alreadyJoined: true, message: "You are already queued for upcoming rounds" };
        }

        this.players.push(user);
        console.log("Player joined:", user.name);
        this.emitLobbyState();
        return { ok: true };
    }

    startRound() {
        this.running = true;
        this.arena.init(this.players);
        this.emitLobbyState();
    }

    update() {
        if (!this.running && this.players.length >= this.minimumPlayers) {
            this.startRound();
        }

        if (this.running) {
            this.arena.update();

            this.io.emit("state", this.arena.getState());

            if (this.arena.isFinished()) {
                const winner = this.arena.getWinner();
                if (winner) {
                    this.lastWinner = winner;
                    this.io.emit("winner", winner);
                    console.log("Winner:", winner.name);
                } else {
                    console.log("Round finished with no winner");
                }

                this.reset();
            }
        }
    }

    emitLobbyState() {
        this.io.emit("lobby_state", {
            running: this.running,
            playersJoined: this.players.length,
            playersNeeded: Math.max(0, this.minimumPlayers - this.players.length),
            previousWinner: this.lastWinner
        });
    }

    reset() {
        this.running = false;
        this.arena.reset();
        this.emitLobbyState();
    }
}

module.exports = GameManager;
