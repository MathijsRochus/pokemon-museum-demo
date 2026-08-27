// ==========================================
// MARLOT
// ==========================================
//
// She works in the museum's communications team and wants you in the campaign
// photos. Mechanically a four-state cycle, not a wandering NPC.

const PHASE = { HIDDEN: 'hidden', TELEGRAPH: 'telegraph', SOLID: 'solid', FADING: 'fading' };

// How long the automatic difficulty ramp takes to reach maximum threat.
const RAMP_MS = 90000;

// The entire tuning surface, in one place. threat runs 0..1.
function difficultyFor(threat) {
    const t = Phaser.Math.Clamp(threat, 0, 1);
    return {
        hiddenMs:    lerp(6000, 1400, t),   // gap between appearances
        telegraphMs: lerp(1200,  260, t),   // your reaction window
        solidMs:     lerp( 800, 2000, t),   // how long she stays lethal
        fadeMs:      320,
        minDistance: Math.max(1, Math.round(lerp(6, 1, t))),  // how close she may appear
        count:       t > 0.75 ? 3 : (t > 0.4 ? 2 : 1),
        chases:      t > 0.85,              // late game: she takes steps toward you
        chaseMs:     lerp(700, 380, t)
    };
}

class Marlot {
    constructor(scene, index) {
        this.scene = scene;
        this.index = index;
        this.phase = PHASE.HIDDEN;
        this.elapsed = 0;
        this.chaseTimer = 0;
        this.gridX = -1;
        this.gridY = -1;

        // Staggered start so several of them never pulse in lockstep.
        this.wait = 3000 + index * 1200;

        this.marker = scene.add.image(0, 0, 'warn').setDepth(4).setVisible(false);
        this.sprite = scene.add.image(0, 0, 'marlot').setDepth(9).setVisible(false);
    }

    get isLethal()  { return this.phase === PHASE.SOLID; }
    get isPresent() { return this.phase !== PHASE.HIDDEN; }

    enter(phase) {
        this.phase = phase;
        this.elapsed = 0;
    }

    // Called when the difficulty drops and this one is no longer in play.
    retire() {
        this.phase = PHASE.HIDDEN;
        this.elapsed = 0;
        this.wait = 2000;
        this.gridX = this.gridY = -1;
        this.sprite.setVisible(false);
        this.marker.setVisible(false);
    }

    // Driven by an accumulated delta rather than Phaser timers, so that
    // freezing her while the UI is open is simply "don't call this".
    update(delta, cfg) {
        this.elapsed += delta;

        switch (this.phase) {
            case PHASE.HIDDEN:
                if (this.elapsed >= this.wait) this.materialise(cfg);
                return;

            case PHASE.TELEGRAPH: {
                const p = Math.min(this.elapsed / cfg.telegraphMs, 1);
                this.sprite.setAlpha(0.15 + 0.45 * p).setScale(0.7 + 0.3 * p);
                this.marker.setAlpha(0.3 + 0.5 * Math.abs(Math.sin(this.elapsed / 90)));
                if (p >= 1) this.enter(PHASE.SOLID);
                return;
            }

            case PHASE.SOLID:
                this.sprite.setAlpha(1).setScale(1);
                this.marker.setAlpha(0.75);
                if (cfg.chases) {
                    this.chaseTimer += delta;
                    if (this.chaseTimer >= cfg.chaseMs) {
                        this.chaseTimer = 0;
                        this.stepTowardPlayer();
                    }
                }
                if (this.elapsed >= cfg.solidMs) this.enter(PHASE.FADING);
                return;

            case PHASE.FADING: {
                const p = Math.min(this.elapsed / cfg.fadeMs, 1);
                this.sprite.setAlpha(0.9 * (1 - p));
                this.marker.setAlpha(0.7 * (1 - p));
                if (p >= 1) {
                    this.phase = PHASE.HIDDEN;
                    this.elapsed = 0;
                    this.chaseTimer = 0;
                    this.wait = cfg.hiddenMs * Phaser.Math.FloatBetween(0.75, 1.25);
                    this.gridX = this.gridY = -1;
                    this.sprite.setVisible(false);
                    this.marker.setVisible(false);
                }
                return;
            }
        }
    }

    materialise(cfg) {
        const tile = this.scene.pickSpawnTile(cfg, this);

        // No fair tile available right now — wait a beat and try again
        // rather than forcing an unavoidable spawn.
        if (!tile) {
            this.elapsed = 0;
            this.wait = 400;
            return;
        }

        this.placeAt(tile.x, tile.y);
        this.enter(PHASE.TELEGRAPH);
        this.sprite.setVisible(true).setAlpha(0.15).setScale(0.7);
        this.marker.setVisible(true).setAlpha(0.4);
    }

    placeAt(x, y) {
        this.gridX = x;
        this.gridY = y;
        const ts = this.scene.tileSize;
        const cx = x * ts + ts / 2;
        const cy = y * ts + ts / 2;
        this.sprite.setPosition(cx, cy);
        this.marker.setPosition(cx, cy);
    }

    // Late-game pursuit: she stops waiting for you to wander into frame and
    // starts repositioning, one tile at a time, favouring the longer axis so
    // she closes in cleanly instead of jittering on the diagonal.
    stepTowardPlayer() {
        const s = this.scene;
        const dx = Math.sign(s.playerGridX - this.gridX);
        const dy = Math.sign(s.playerGridY - this.gridY);
        const horizontalFirst =
            Math.abs(s.playerGridX - this.gridX) >= Math.abs(s.playerGridY - this.gridY);
        const options = horizontalFirst ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];

        for (const [ox, oy] of options) {
            if (ox === 0 && oy === 0) continue;
            const nx = this.gridX + ox;
            const ny = this.gridY + oy;
            if (!s.isWalkable(nx, ny)) continue;
            if (s.tileHasMarlot(nx, ny, this)) continue;
            this.placeAt(nx, ny);
            return;
        }
    }
}
