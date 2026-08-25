// ==========================================
// MUSEUMDEX — a Pokémon-style museum explorer
//
// All artwork in this demo is generated procedurally at runtime
// (see section 2). There are no image files to load or ship.
// ==========================================

// ==========================================
// 1. GLOBAL STATE & MOCK API DATA
// ==========================================

// The key is exhibit_<tile value>, so dropping that number on the map is what
// places the piece. Add an entry here, an art function in EXHIBIT_ART, and a
// tile on the map — the textures, the dialogue, the tick badges, the Museumdex
// listing and the progress counter all follow on their own.
const MuseumAPI = {
    "exhibit_2": {
        name: "T-Rex Skull",
        description: "A massive fossilized skull from the late Cretaceous period. Its jaw held sixty serrated teeth, some as long as a human hand."
    },
    "exhibit_3": {
        name: "Roman Vase",
        description: "An ancient clay vessel used for transporting olive oil across the Mediterranean. The maker's stamp is still visible on the handle."
    },
    "exhibit_4": {
        name: "Funerary Mask",
        description: "A pharaoh's death mask beaten from a single sheet of gold. The eyes are inlaid with obsidian and the stripes of the headdress are ground lapis lazuli."
    },
    "exhibit_5": {
        name: "Brass Astrolabe",
        description: "An instrument for reading the height of the stars. Navigators used one to find their latitude long before the compass reached Europe."
    }
};

const TOTAL_EXHIBITS = Object.keys(MuseumAPI).length;

// Tile values 2 and up are exhibits; which ones exist is decided entirely by
// what the API returned.
function isExhibitTile(tileValue) {
    return Object.prototype.hasOwnProperty.call(MuseumAPI, 'exhibit_' + tileValue);
}

function tileValueFor(exhibitId) {
    return Number(exhibitId.split('_')[1]);
}

const GameState = {
    sessionPokedex: new Set(),
    isReading: false,        // dialogue box is open
    dexOpen: false,          // pokedex overlay is open
    gameOver: false,         // CHARMOT got you
    threatOverride: null     // set by the demo slider; null = automatic ramp
};

// Everything that should freeze the world routes through here: player
// movement, the interaction prompt, and CHARMOT herself. That last one
// matters — without it she could materialise on you while you're reading
// an exhibit, which is a death you had no way to avoid.
function uiIsBlocking() {
    return GameState.isReading || GameState.dexOpen || GameState.gameOver;
}

// ==========================================
// 2. PROCEDURAL ART
// ==========================================

const PALETTE = {
    marbleA:  '#ddd6c8',
    marbleB:  '#d2c9b8',
    marbleLn: '#c0b6a2',
    wall:     '#4b4a57',
    wallTop:  '#6e6c7e',
    wallLow:  '#3a3944',
    stone:    '#9a99a6',
    stoneTop: '#b9b8c4',
    stoneLow: '#6f6e7b',
    bone:     '#efe7d3',
    boneDark: '#c9bfa6',
    clay:     '#b5623a',
    clayDark: '#8a462a',
    clayTrim: '#e0b27a',
    skin:     '#f2c9a0',
    skinDark: '#d6a67c',
    cap:      '#d94b3f',
    capDark:  '#a83a30',
    shirt:    '#3f6fa8',
    shirtDk:  '#2f5580',
    pants:    '#2e3440',
    shoe:     '#191d24',
    ink:      '#20242c',
    gold:     '#f5c451',
    goldDark: '#b8862b',
    green:    '#4cc46a',

    maskGold: '#e8b53c',
    maskGoldD:'#b8862b',
    lapis:    '#2f5fa8',
    lapisDark:'#1f3f74',
    obsidian: '#1a1520',
    brass:    '#c99a3f',
    brassDark:'#8f6a26',

    // CHARMOT
    gown:     '#3b2246',
    gownDark: '#271531',
    hair:     '#171320',
    pallor:   '#e8e2ef',
    pallorDk: '#c9c2d4',
    hollow:   '#0d0a12',
    warn:     '#e0457b'
};

// Create a canvas-backed texture and hand its 2D context to a draw function.
function makeTexture(scene, key, width, height, draw) {
    if (scene.textures.exists(key)) return scene.textures.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // px() is the workhorse for all the chunky pixel drawing below.
    const px = (x, y, w, h, color, alpha) => {
        ctx.globalAlpha = (alpha === undefined) ? 1 : alpha;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
    };

    draw(px, ctx);
    return scene.textures.addCanvas(key, canvas);
}

// --- Floor: two marble tones, laid in a checkerboard by the map builder ---
function makeFloorTexture(scene, key, base) {
    makeTexture(scene, key, 32, 32, (px) => {
        px(0, 0, 32, 32, base);
        // Grout lines along two edges so tiles read as separate slabs.
        px(0, 0, 32, 1, PALETTE.marbleLn);
        px(0, 0, 1, 32, PALETTE.marbleLn);
        // A few fixed "veins" — deterministic, so the floor never shimmers.
        px(6, 9, 7, 1, PALETTE.marbleLn, 0.45);
        px(12, 10, 4, 1, PALETTE.marbleLn, 0.3);
        px(20, 22, 6, 1, PALETTE.marbleLn, 0.35);
        px(24, 6, 3, 1, PALETTE.marbleLn, 0.25);
    });
}

// --- Wall: flat panel with a lit top edge for a touch of depth ---
function makeWallTexture(scene) {
    makeTexture(scene, 'wall', 32, 32, (px) => {
        px(0, 0, 32, 32, PALETTE.wall);
        px(0, 0, 32, 5, PALETTE.wallTop);       // lit cap
        px(0, 5, 32, 2, PALETTE.wallLow);       // shadow under the cap
        px(0, 26, 32, 6, PALETTE.wallLow);      // skirting board
        px(0, 26, 32, 1, PALETTE.wallTop, 0.4);
        px(5, 11, 1, 13, PALETTE.wallLow, 0.5); // faint panel seams
        px(26, 11, 1, 13, PALETTE.wallLow, 0.5);
    });
}

// Shared plinth that both exhibits stand on.
function drawPedestal(px) {
    px(4, 29, 24, 3, '#000000', 0.25);              // ground shadow
    px(6, 22, 20, 8, PALETTE.stone);                // body
    px(5, 20, 22, 3, PALETTE.stoneTop);             // top face
    px(6, 28, 20, 2, PALETTE.stoneLow);             // base shadow
    px(6, 22, 1, 8, PALETTE.stoneTop, 0.5);         // left highlight
}

// A pale diagonal streak sold as glare on a glass display case.
function drawCaseGlare(px) {
    px(8, 3, 3, 18, '#ffffff', 0.14);
    px(12, 3, 1, 18, '#ffffff', 0.10);
}

// --- The exhibits themselves ---
// Each function draws only the item; the plinth and the case glare are added
// around it by makeExhibitTextures().

function drawSkull(px) {
        // Side profile, snout to the left: tall braincase tapering to a jaw.
        px(16, 4, 9, 11, PALETTE.bone);       // braincase
        px(11, 7, 6, 8, PALETTE.bone);        // cheek
        px(5, 9, 7, 6, PALETTE.bone);         // snout
        px(5, 14, 20, 2, PALETTE.bone);       // upper jaw
        px(21, 14, 3, 5, PALETTE.boneDark);   // jaw hinge
        px(6, 17, 16, 2, PALETTE.boneDark);   // lower jaw
        px(17, 7, 4, 4, PALETTE.ink);         // eye socket
        px(18, 8, 2, 2, PALETTE.boneDark, 0.45);
        px(7, 10, 2, 2, PALETTE.ink);         // nostril
        for (let t = 6; t < 21; t += 3) px(t, 16, 1, 2, PALETTE.bone);  // teeth
        px(16, 4, 9, 1, '#ffffff', 0.4);      // top highlight
        px(5, 9, 1, 6, PALETTE.boneDark);     // snout tip shading
}

function drawVase(px) {
        px(12, 4, 8, 2, PALETTE.clayDark);   // rim
        px(14, 6, 4, 3, PALETTE.clay);       // neck
        px(12, 9, 8, 2, PALETTE.clay);       // shoulder
        px(10, 11, 12, 6, PALETTE.clay);     // belly
        px(11, 17, 10, 2, PALETTE.clay);     // taper
        px(13, 19, 6, 1, PALETTE.clayDark);  // foot
        px(8, 10, 2, 5, PALETTE.clayDark);   // handles
        px(22, 10, 2, 5, PALETTE.clayDark);
        px(10, 13, 12, 1, PALETTE.clayTrim); // decorative bands
        px(10, 15, 12, 1, PALETTE.clayTrim, 0.6);
        px(11, 11, 2, 6, '#ffffff', 0.18);   // sheen
}

// --- Egyptian funerary mask: nemes headdress over a gold face ---
function drawMask(px) {
        px(7, 3, 18, 13, PALETTE.maskGold);        // headdress
        px(7, 5, 18, 1, PALETTE.lapis);            // stripes
        px(7, 8, 18, 1, PALETTE.lapis);
        px(7, 11, 18, 1, PALETTE.lapis);
        px(6, 9, 3, 8, PALETTE.maskGold);          // lappets down each side
        px(23, 9, 3, 8, PALETTE.maskGold);
        px(6, 12, 3, 1, PALETTE.lapis);
        px(23, 12, 3, 1, PALETTE.lapis);

        px(11, 7, 10, 9, PALETTE.maskGold);        // face
        px(11, 15, 10, 1, PALETTE.maskGoldD);
        px(12, 9, 3, 1, PALETTE.lapisDark);        // painted brows
        px(17, 9, 3, 1, PALETTE.lapisDark);
        px(12, 10, 3, 2, PALETTE.obsidian);        // inlaid eyes
        px(17, 10, 3, 2, PALETTE.obsidian);
        px(15, 12, 2, 2, PALETTE.maskGoldD);       // nose
        px(14, 14, 4, 1, PALETTE.maskGoldD);       // mouth
        px(14, 16, 4, 3, PALETTE.lapis);           // plaited beard
        px(7, 3, 18, 1, '#ffffff', 0.35);
}

// --- Brass astrolabe: a ring on a stand, crossed by its rule ---
function drawAstrolabe(px) {
        const cx = 16, cy = 11, R = 7;

        // Ring, two pixels thick, walked row by row.
        for (let dy = -R; dy <= R; dy++) {
            const halfWidth = Math.round(Math.sqrt(R * R - dy * dy));
            px(cx - halfWidth, cy + dy, 2, 1, PALETTE.brass);
            px(cx + halfWidth - 1, cy + dy, 2, 1, PALETTE.brass);
        }
        px(cx - 3, cy - R, 6, 1, PALETTE.brass);   // close the top
        px(cx - 3, cy + R, 6, 1, PALETTE.brass);   // and the bottom

        px(cx - 6, cy, 12, 1, PALETTE.brassDark);  // the rule
        px(cx, cy - 6, 1, 12, PALETTE.brassDark);
        px(cx - 2, cy - 2, 4, 4, PALETTE.brass);   // central boss
        px(cx - 1, cy - 1, 2, 2, PALETTE.brassDark);

        px(cx - 1, 1, 2, 3, PALETTE.brass);        // suspension ring
        px(cx - 1, cy + R, 2, 3, PALETTE.brassDark);  // stand
        px(12, cy + R + 2, 8, 1, PALETTE.brassDark);
        px(cx - 5, cy - 5, 1, 1, '#ffffff', 0.5);
}

const EXHIBIT_ART = {
    exhibit_2: drawSkull,
    exhibit_3: drawVase,
    exhibit_4: drawMask,
    exhibit_5: drawAstrolabe
};

// One texture per exhibit the API returned — no hand-maintained list.
function makeExhibitTextures(scene) {
    Object.keys(MuseumAPI).forEach(id => {
        makeTexture(scene, 'exhibit-' + tileValueFor(id), 32, 32, (px) => {
            drawPedestal(px);
            EXHIBIT_ART[id](px);
            drawCaseGlare(px);
        });
    });
}

// --- Player: a 4x4 spritesheet drawn frame by frame ---
// Rows are down / left / right / up; within each row the frames are
// stand, step-A, stand, step-B — the classic 4-frame RPG walk cycle.
function makePlayerTexture(scene) {
    const texture = makeTexture(scene, 'playerSprite', 128, 128, (px) => {
        const DIRS = ['down', 'left', 'right', 'up'];
        for (let row = 0; row < 4; row++) {
            for (let step = 0; step < 4; step++) {
                drawPlayerFrame(px, step * 32, row * 32, DIRS[row], step);
            }
        }
    });

    // Register the 16 frames so generateFrameNumbers() can find them.
    for (let i = 0; i < 16; i++) {
        texture.add(i, 0, (i % 4) * 32, Math.floor(i / 4) * 32, 32, 32);
    }
    return texture;
}

function drawPlayerFrame(pxRaw, ox, oy, dir, step) {
    // Offset every draw call into this frame's cell of the sheet.
    const px = (x, y, w, h, c, a) => pxRaw(ox + x, oy + y, w, h, c, a);

    const stepping = (step === 1 || step === 3);
    const bob = stepping ? 1 : 0;          // body lifts a pixel mid-stride
    const legL = (step === 1) ? 6 : (step === 3 ? 4 : 5);
    const legR = (step === 1) ? 4 : (step === 3 ? 6 : 5);
    const side = (dir === 'left' || dir === 'right');

    px(10, 29, 12, 2, '#000000', 0.22);    // ground shadow (stays put)

    // Legs
    const lx = side ? 13 : 12;
    const rx = side ? 16 : 17;
    px(lx, 23 - bob, 3, legL, PALETTE.pants);
    px(rx, 23 - bob, 3, legR, PALETTE.pants);
    px(lx, 23 - bob + legL - 2, 3, 2, PALETTE.shoe);
    px(rx, 23 - bob + legR - 2, 3, 2, PALETTE.shoe);

    // Torso
    const bx = side ? 11 : 10;
    const bw = side ? 10 : 12;
    px(bx, 16 - bob, bw, 8, PALETTE.shirt);
    px(bx, 22 - bob, bw, 2, PALETTE.shirtDk);

    // Arms — swing forward/back with the stride
    const swing = (step === 1) ? 1 : (step === 3 ? -1 : 0);
    px(bx - 2, 17 - bob + swing, 2, 5, PALETTE.shirt);
    px(bx + bw, 17 - bob - swing, 2, 5, PALETTE.shirt);
    px(bx - 2, 22 - bob + swing, 2, 2, PALETTE.skin);
    px(bx + bw, 22 - bob - swing, 2, 2, PALETTE.skin);

    // Head
    px(10, 7 - bob, 12, 10, PALETTE.skin);
    px(10, 15 - bob, 12, 2, PALETTE.skinDark);

    // Cap — the brim points wherever the character is facing
    px(9, 4 - bob, 14, 4, PALETTE.cap);
    px(9, 7 - bob, 14, 1, PALETTE.capDark);
    if (dir === 'down')  px(9, 8 - bob, 14, 2, PALETTE.capDark);
    if (dir === 'left')  px(6, 6 - bob, 4, 2, PALETTE.capDark);
    if (dir === 'right') px(22, 6 - bob, 4, 2, PALETTE.capDark);
    if (dir === 'up')    px(9, 4 - bob, 14, 7, PALETTE.capDark); // back of the cap

    // Face — hidden entirely when walking away from the camera
    if (dir === 'down') {
        px(13, 11 - bob, 2, 2, PALETTE.ink);
        px(18, 11 - bob, 2, 2, PALETTE.ink);
    } else if (dir === 'left') {
        px(12, 11 - bob, 2, 2, PALETTE.ink);
    } else if (dir === 'right') {
        px(19, 11 - bob, 2, 2, PALETTE.ink);
    }
}

// --- CHARMOT: a pale woman in a long gown, hair over her shoulders ---
function makeCharmotTexture(scene) {
    makeTexture(scene, 'charmot', 32, 32, (px) => {
        // Gown, tapering into a wisp instead of feet.
        px(9, 15, 14, 9, PALETTE.gown);
        px(8, 18, 16, 6, PALETTE.gown);
        px(10, 24, 12, 3, PALETTE.gownDark);
        px(11, 27, 10, 2, PALETTE.gownDark, 0.7);
        px(12, 29, 8, 2, PALETTE.gownDark, 0.4);

        // Sleeves, with pale hands at the cuffs.
        px(6, 16, 3, 7, PALETTE.gown);
        px(23, 16, 3, 7, PALETTE.gown);
        px(6, 22, 3, 2, PALETTE.pallor);
        px(23, 22, 3, 2, PALETTE.pallor);

        // Hair falls behind the shoulders, so it goes down before the face.
        px(8, 3, 16, 15, PALETTE.hair);
        px(7, 6, 2, 11, PALETTE.hair);
        px(23, 6, 2, 11, PALETTE.hair);

        // Face
        px(12, 7, 8, 9, PALETTE.pallor);
        px(12, 15, 8, 1, PALETTE.pallorDk);
        px(12, 7, 8, 1, '#ffffff', 0.35);

        // Fringe and side locks framing it.
        px(11, 4, 10, 4, PALETTE.hair);
        px(11, 7, 2, 9, PALETTE.hair);
        px(19, 7, 2, 9, PALETTE.hair);

        // Hollow eyes, thin mouth.
        px(13, 10, 2, 3, PALETTE.hollow);
        px(17, 10, 2, 3, PALETTE.hollow);
        px(15, 14, 2, 1, '#8d7f9b');
    });
}

// The tile reticle that warns you where she is about to become solid.
function makeWarnTexture(scene) {
    makeTexture(scene, 'warn', 32, 32, (px) => {
        px(2, 2, 28, 28, PALETTE.warn, 0.12);
        px(2, 2, 9, 3, PALETTE.warn);    px(2, 2, 3, 9, PALETTE.warn);
        px(21, 2, 9, 3, PALETTE.warn);   px(27, 2, 3, 9, PALETTE.warn);
        px(2, 27, 9, 3, PALETTE.warn);   px(2, 21, 3, 9, PALETTE.warn);
        px(21, 27, 9, 3, PALETTE.warn);  px(27, 21, 3, 9, PALETTE.warn);
    });
}

// --- Small UI bits drawn as textures ---
function makeMarkerTextures(scene) {
    // Downward chevron that hovers over an exhibit you can interact with.
    makeTexture(scene, 'hint', 14, 12, (px) => {
        px(1, 0, 12, 2, PALETTE.goldDark);
        px(2, 2, 10, 2, PALETTE.gold);
        px(3, 4, 8, 2, PALETTE.gold);
        px(4, 6, 6, 2, PALETTE.gold);
        px(5, 8, 4, 2, PALETTE.goldDark);
        px(6, 10, 2, 2, PALETTE.goldDark);
    });

    // Tick badge stamped on exhibits already in the Museumdex.
    makeTexture(scene, 'check', 12, 12, (px) => {
        px(2, 1, 8, 10, PALETTE.green);
        px(1, 2, 10, 8, PALETTE.green);
        px(3, 5, 2, 2, '#ffffff');
        px(5, 7, 2, 2, '#ffffff');
        px(7, 4, 2, 2, '#ffffff');
        px(9, 2, 2, 2, '#ffffff');
    });
}

// ==========================================
// 3. CHARMOT
//
// She is not an NPC that walks around — she is a four-state cycle:
//
//   HIDDEN -> TELEGRAPH -> SOLID -> FADING -> HIDDEN
//   (gone)   (visible,     (visible, (visible,
//             harmless)     LETHAL)   harmless)
//
// Only SOLID kills. TELEGRAPH puts a reticle on the tile she is about to
// occupy, so every death is one the player could see coming. Difficulty is
// mostly a question of how long that warning lasts.
// ==========================================

const PHASE = { HIDDEN: 'hidden', TELEGRAPH: 'telegraph', SOLID: 'solid', FADING: 'fading' };

// How long the automatic difficulty ramp takes to reach maximum threat.
const RAMP_MS = 90000;

function lerp(a, b, t) { return a + (b - a) * t; }

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

class Charmot {
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
        this.sprite = scene.add.image(0, 0, 'charmot').setDepth(9).setVisible(false);
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

    // Late-game pursuit: one tile at a time, favouring the longer axis so
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
            if (s.tileHasCharmot(nx, ny, this)) continue;
            this.placeAt(nx, ny);
            return;
        }
    }
}

// ==========================================
// 4. PHASER GAME SCENE
// ==========================================

class MuseumScene extends Phaser.Scene {
    constructor() {
        super('MuseumScene');
    }

    create() {
        // --- Build every texture before anything tries to use one ---
        makeFloorTexture(this, 'floor-a', PALETTE.marbleA);
        makeFloorTexture(this, 'floor-b', PALETTE.marbleB);
        makeWallTexture(this);
        makeExhibitTextures(this);
        makePlayerTexture(this);
        makeMarkerTextures(this);
        makeCharmotTexture(this);
        makeWarnTexture(this);

        // Walk cycles — row order matches the spritesheet built above.
        this.anims.create({ key: 'walk-down',  frames: this.anims.generateFrameNumbers('playerSprite', { start: 0,  end: 3  }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-left',  frames: this.anims.generateFrameNumbers('playerSprite', { start: 4,  end: 7  }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-right', frames: this.anims.generateFrameNumbers('playerSprite', { start: 8,  end: 11 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-up',    frames: this.anims.generateFrameNumbers('playerSprite', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });

        // Idle frame per facing = the "stand" frame of that row.
        this.idleFrames = { down: 0, left: 4, right: 8, up: 12 };

        // Museum Map Array — 0 floor, 1 wall, 2+ an exhibit from MuseumAPI.
        // Four plinths, four different pieces.
        this.mapGrid = [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 1],
            [1, 0, 2, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1],
            [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 3, 0, 0, 0, 0, 1, 0, 0, 5, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ];

        this.tileSize = 32;
        const mapWidthInPixels = this.mapGrid[0].length * this.tileSize;
        const mapHeightInPixels = this.mapGrid.length * this.tileSize;

        // --- Draw the map ---
        this.exhibitSprites = {};   // "x,y" -> sprite, so we can badge them later

        for (let y = 0; y < this.mapGrid.length; y++) {
            for (let x = 0; x < this.mapGrid[y].length; x++) {
                const tileType = this.mapGrid[y][x];
                const posX = x * this.tileSize + (this.tileSize / 2);
                const posY = y * this.tileSize + (this.tileSize / 2);

                if (tileType === 1) {
                    this.add.image(posX, posY, 'wall');
                } else {
                    // Every non-wall tile gets a floor underneath it, so the
                    // exhibits sit on marble rather than on nothing.
                    this.add.image(posX, posY, (x + y) % 2 === 0 ? 'floor-a' : 'floor-b');
                }

                if (isExhibitTile(tileType)) {
                    const sprite = this.add.image(posX, posY, 'exhibit-' + tileType);
                    sprite.setDepth(5);
                    this.exhibitSprites[x + ',' + y] = sprite;
                }
            }
        }

        // --- Player ---
        this.playerGridX = 2;
        this.playerGridY = 6;
        this.facing = 'down';
        this.player = this.add.sprite(
            this.playerGridX * this.tileSize + (this.tileSize / 2),
            this.playerGridY * this.tileSize + (this.tileSize / 2),
            'playerSprite'
        );
        this.player.setDepth(10);
        this.player.setFrame(this.idleFrames.down);

        // --- CHARMOT ---
        // Flood fill from the player's start so she can only ever appear in
        // the part of the museum the player can actually reach. Doing it once
        // here makes picking a spawn a filtered random draw instead of
        // rejection-sampling against walls every time.
        this.walkableTiles = this.computeReachableTiles(this.playerGridX, this.playerGridY);

        // A fixed pool; the difficulty table decides how many are in play.
        this.charmots = [0, 1, 2].map(i => new Charmot(this, i));
        this.runElapsed = 0;
        GameState.gameOver = false;

        // --- Interaction hint marker ---
        this.hint = this.add.image(0, 0, 'hint');
        this.hint.setDepth(20);
        this.hint.setVisible(false);
        this.tweens.add({
            targets: this.hint,
            y: '-=4',
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // --- Controls ---
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys('W,A,S,D');
        this.isMoving = false;

        this.input.keyboard.on('keydown-SPACE', this.handleInteraction, this);
        this.input.keyboard.on('keydown-ENTER', this.handleInteraction, this);
        this.input.keyboard.on('keydown-P', () => togglePokedex());
        this.input.keyboard.on('keydown-ESC', () => {
            if (GameState.dexOpen) togglePokedex();
        });

        // --- Camera ---
        // The viewport is exactly the size of the map, so the whole museum is
        // on screen at once and the camera never has to scroll.
        this.cameras.main.setBounds(0, 0, mapWidthInPixels, mapHeightInPixels);
        this.cameras.main.setBackgroundColor('#1a1a20');

        updateProgressCounter();
    }

    update(time, delta) {
        this.updateHint();

        // Clamp the frame step before it reaches anything that accumulates.
        // A non-finite delta would poison these counters permanently, and a
        // huge one (backgrounded tab, paused debugger) would swallow a whole
        // telegraph window and kill the player with no warning shown.
        const dt = Number.isFinite(delta) ? Math.min(delta, 100) : 0;

        if (!uiIsBlocking()) this.runElapsed += dt;

        const threat = this.currentThreat();
        const cfg = difficultyFor(threat);
        updateDangerMeter(threat);

        // uiIsBlocking() covers game over too, so she freezes on death and
        // while any overlay is up.
        if (!uiIsBlocking()) {
            this.charmots.forEach((charmot, i) => {
                if (i < cfg.count) charmot.update(dt, cfg);
                else if (charmot.isPresent) charmot.retire();
            });
            this.checkCharmotCollision();
        }

        if (uiIsBlocking() || this.isMoving) return;

        let nextX = this.playerGridX;
        let nextY = this.playerGridY;
        let direction = null;

        if (this.cursors.left.isDown || this.wasd.A.isDown)       { nextX--; direction = 'left';  }
        else if (this.cursors.right.isDown || this.wasd.D.isDown) { nextX++; direction = 'right'; }
        else if (this.cursors.up.isDown || this.wasd.W.isDown)    { nextY--; direction = 'up';    }
        else if (this.cursors.down.isDown || this.wasd.S.isDown)  { nextY++; direction = 'down';  }

        if (!direction) return;

        // Turn to face the way you pressed even when the path is blocked —
        // this is what lets you stand still and look at an exhibit.
        this.facing = direction;

        if (this.mapGrid[nextY] && this.mapGrid[nextY][nextX] === 0) {
            this.movePlayer(nextX, nextY, direction);
        } else {
            this.player.setFrame(this.idleFrames[direction]);
        }
    }

    // --- CHARMOT support ---------------------------------------------

    currentThreat() {
        if (GameState.threatOverride !== null) return GameState.threatOverride;

        // Squared so the opening stretch stays genuinely gentle, plus a step
        // for each discovery — she gets angrier every time you take something.
        const ramp = Phaser.Math.Clamp(this.runElapsed / RAMP_MS, 0, 1);
        return Phaser.Math.Clamp(ramp * ramp + GameState.sessionPokedex.size * 0.15, 0, 1);
    }

    isWalkable(x, y) {
        return !!this.mapGrid[y] && this.mapGrid[y][x] === 0;
    }

    tileHasCharmot(x, y, except) {
        return this.charmots.some(c =>
            c !== except && c.isPresent && c.gridX === x && c.gridY === y);
    }

    computeReachableTiles(startX, startY) {
        const seen = new Set([startX + ',' + startY]);
        const tiles = [{ x: startX, y: startY }];
        const queue = [{ x: startX, y: startY }];

        while (queue.length) {
            const { x, y } = queue.shift();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                const key = nx + ',' + ny;
                if (seen.has(key) || !this.isWalkable(nx, ny)) continue;
                seen.add(key);
                tiles.push({ x: nx, y: ny });
                queue.push({ x: nx, y: ny });
            }
        }
        return tiles;
    }

    // The fairness layer. Note that movePlayer() assigns playerGridX/Y at the
    // START of a step, so the player's logical tile is already their
    // destination for the whole 150ms tween — excluding it here is what stops
    // her materialising on a move you had already committed to.
    pickSpawnTile(cfg, forCharmot) {
        const px = this.playerGridX;
        const py = this.playerGridY;

        const candidates = this.walkableTiles.filter(t => {
            if (t.x === px && t.y === py) return false;
            if (this.tileHasCharmot(t.x, t.y, forCharmot)) return false;
            if (Math.abs(t.x - px) + Math.abs(t.y - py) < cfg.minDistance) return false;
            return this.playerKeepsAnEscape(t.x, t.y, forCharmot);
        });

        return candidates.length ? Phaser.Utils.Array.GetRandom(candidates) : null;
    }

    // Never leave the player boxed in with nowhere to step.
    playerKeepsAnEscape(spawnX, spawnY, ignore) {
        const px = this.playerGridX;
        const py = this.playerGridY;

        return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const nx = px + dx, ny = py + dy;
            if (!this.isWalkable(nx, ny)) return false;
            if (nx === spawnX && ny === spawnY) return false;
            return !this.tileHasCharmot(nx, ny, ignore);
        });
    }

    checkCharmotCollision() {
        if (GameState.gameOver) return;

        const hit = this.charmots.find(c =>
            c.isLethal && c.gridX === this.playerGridX && c.gridY === this.playerGridY);

        if (hit) this.failRun();
    }

    failRun() {
        GameState.gameOver = true;
        this.isMoving = false;
        this.tweens.killTweensOf(this.player);
        this.player.anims.stop();
        this.hint.setVisible(false);

        this.cameras.main.shake(260, 0.012);
        this.cameras.main.flash(320, 190, 40, 90);

        showGameOver({
            found: GameState.sessionPokedex.size,
            ms: this.runElapsed,
            threat: this.currentThreat()
        });
    }

    // Float the chevron over an exhibit whenever the player is standing
    // in front of one (i.e. directly below it).
    updateHint() {
        const target = this.exhibitInFront();

        if (!target || uiIsBlocking()) {
            this.hint.setVisible(false);
            return;
        }

        const markerX = target.x * this.tileSize + (this.tileSize / 2);
        const markerY = target.y * this.tileSize - 6;

        if (!this.hint.visible) {
            this.hint.setVisible(true);
            this.hint.setPosition(markerX, markerY);
            // Re-seat the hover tween on the new anchor point.
            this.tweens.killTweensOf(this.hint);
            this.tweens.add({
                targets: this.hint,
                y: markerY - 4,
                duration: 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    // The exhibit tile directly above the player, if there is one.
    exhibitInFront() {
        const y = this.playerGridY - 1;
        const x = this.playerGridX;
        if (y < 0 || !this.mapGrid[y]) return null;

        const tile = this.mapGrid[y][x];
        if (!isExhibitTile(tile)) return null;

        return { x, y, tile };
    }

    movePlayer(newX, newY, direction) {
        this.isMoving = true;
        this.player.play('walk-' + direction, true);

        this.playerGridX = newX;
        this.playerGridY = newY;

        this.tweens.add({
            targets: this.player,
            x: newX * this.tileSize + (this.tileSize / 2),
            y: newY * this.tileSize + (this.tileSize / 2),
            duration: 150,
            onComplete: () => {
                this.isMoving = false;
                this.player.anims.stop();
                // Settle on the idle pose for whichever way we ended up facing.
                this.player.setFrame(this.idleFrames[this.facing]);
            }
        });
    }

    handleInteraction() {
        if (GameState.dexOpen) return;   // the dex has its own controls

        if (GameState.isReading) {
            // First press finishes the typewriter, second press closes.
            if (isTyping()) {
                finishTyping();
            } else {
                closeDialogue();
            }
            return;
        }

        const target = this.exhibitInFront();
        if (!target) return;

        const apiId = "exhibit_" + target.tile;
        const exhibitData = MuseumAPI[apiId];
        if (!exhibitData) return;

        const isNew = !GameState.sessionPokedex.has(apiId);
        GameState.sessionPokedex.add(apiId);

        // Face the exhibit and stop dead.
        this.facing = 'up';
        this.player.anims.stop();
        this.player.setFrame(this.idleFrames.up);
        this.hint.setVisible(false);

        if (isNew) {
            this.badgeExhibits(target.tile);
            updateProgressCounter();
            showToast('NEW! Registered to the Museumdex');
        }

        openDialogue(exhibitData.name, exhibitData.description, isNew);
    }

    // Stamp a tick on every tile showing this exhibit, not just the one
    // that happened to be read.
    badgeExhibits(tileType) {
        for (const key in this.exhibitSprites) {
            const [x, y] = key.split(',').map(Number);
            if (this.mapGrid[y][x] !== tileType) continue;

            const badge = this.add.image(
                x * this.tileSize + this.tileSize - 8,
                y * this.tileSize + 8,
                'check'
            );
            badge.setDepth(6);
            badge.setScale(0);
            this.tweens.add({ targets: badge, scale: 1, duration: 250, ease: 'Back.easeOut' });
        }
    }
}

// ==========================================
// 5. HTML UI LOGIC
// ==========================================

let typeTimer = null;
let typeFullText = '';

function isTyping() {
    return typeTimer !== null;
}

// Reveal the description one character at a time.
function startTyping(text) {
    const target = document.getElementById('exhibit-desc');
    typeFullText = text;
    target.innerText = '';

    let i = 0;
    document.getElementById('dialogue-hint').style.visibility = 'hidden';

    typeTimer = setInterval(() => {
        i++;
        target.innerText = text.slice(0, i);
        if (i >= text.length) finishTyping();
    }, 18);
}

function finishTyping() {
    if (typeTimer !== null) {
        clearInterval(typeTimer);
        typeTimer = null;
    }
    document.getElementById('exhibit-desc').innerText = typeFullText;
    document.getElementById('dialogue-hint').style.visibility = 'visible';
}

function openDialogue(title, description, isNew) {
    document.getElementById('exhibit-title').innerText = title;
    document.getElementById('dialogue-new').style.display = isNew ? 'inline-block' : 'none';
    document.getElementById('dialogue-box').style.display = 'block';
    GameState.isReading = true;
    startTyping(description);
}

function closeDialogue() {
    finishTyping();
    document.getElementById('dialogue-box').style.display = 'none';
    GameState.isReading = false;
}

function updateProgressCounter() {
    const found = GameState.sessionPokedex.size;
    document.getElementById('progress-counter').innerText = found + '/' + TOTAL_EXHIBITS;
    document.getElementById('dex-count').innerText = found + ' of ' + TOTAL_EXHIBITS + ' discovered';
}

let toastTimer = null;
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.add('visible');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

function togglePokedex() {
    const dexScreen = document.getElementById('pokedex-screen');
    const dexList = document.getElementById('dex-list');

    if (GameState.dexOpen) {
        dexScreen.style.display = 'none';
        GameState.dexOpen = false;
        return;
    }

    // Opening the dex dismisses any dialogue underneath it.
    if (GameState.isReading) closeDialogue();

    dexScreen.style.display = 'block';
    GameState.dexOpen = true;
    updateProgressCounter();

    dexList.innerHTML = '';
    let index = 0;

    for (const key in MuseumAPI) {
        index++;
        const entry = MuseumAPI[key];
        const item = document.createElement('div');
        const found = GameState.sessionPokedex.has(key);

        item.className = 'dex-item' + (found ? '' : ' locked');
        const number = String(index).padStart(3, '0');

        if (found) {
            item.innerHTML =
                '<div class="dex-num">No. ' + number + '</div>' +
                '<div class="dex-name">' + entry.name + '</div>' +
                '<div class="dex-desc">' + entry.description + '</div>';
        } else {
            item.innerHTML =
                '<div class="dex-num">No. ' + number + '</div>' +
                '<div class="dex-name">???</div>' +
                '<div class="dex-desc">Not yet found. Explore the museum and press SPACE at an exhibit.</div>';
        }

        dexList.appendChild(item);
    }
}

// ------------------------------------------
// Danger meter — doubles as a demo slider
// ------------------------------------------

let dangerDragging = false;

function updateDangerMeter(threat) {
    const slider = document.getElementById('threat-slider');
    const value = Math.round(threat * 100);

    // Don't fight the user while they're dragging it.
    if (!dangerDragging) slider.value = value;

    const hue = 130 - Math.round(threat * 130);          // green -> red
    const color = 'hsl(' + hue + ', 72%, 52%)';
    slider.style.background =
        'linear-gradient(to right, ' + color + ' 0%, ' + color + ' ' + value + '%,' +
        ' #2b2b38 ' + value + '%, #2b2b38 100%)';

    document.getElementById('threat-label').innerText = value + '%';

    const auto = document.getElementById('threat-auto');
    const isAuto = GameState.threatOverride === null;
    auto.innerText = isAuto ? 'AUTO' : 'MANUAL';
    auto.classList.toggle('manual', !isAuto);
}

function initDangerControls() {
    const slider = document.getElementById('threat-slider');

    slider.addEventListener('pointerdown', () => { dangerDragging = true; });
    slider.addEventListener('input', () => {
        GameState.threatOverride = Number(slider.value) / 100;
    });

    const release = () => {
        if (!dangerDragging) return;
        dangerDragging = false;
        slider.blur();   // otherwise the arrow keys drive the slider, not the player
    };
    slider.addEventListener('pointerup', release);
    window.addEventListener('pointerup', release);

    // Keep the arrow keys in the game even if the slider somehow has focus.
    slider.addEventListener('keydown', e => e.preventDefault());

    document.getElementById('threat-auto').addEventListener('click', (e) => {
        GameState.threatOverride = null;
        e.currentTarget.blur();
    });
}

// ------------------------------------------
// Game over
// ------------------------------------------

function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function showGameOver(stats) {
    document.getElementById('go-found').innerText = stats.found + '/' + TOTAL_EXHIBITS;
    document.getElementById('go-time').innerText = formatTime(stats.ms);
    document.getElementById('go-threat').innerText = Math.round(stats.threat * 100) + '%';
    document.getElementById('gameover-screen').style.display = 'flex';
}

function restartRun() {
    // A fresh run: the dex empties, but whatever difficulty you dialled in
    // on the slider is deliberately kept so demoing a level stays easy.
    GameState.sessionPokedex.clear();
    GameState.isReading = false;
    GameState.dexOpen = false;
    GameState.gameOver = false;

    finishTyping();
    document.getElementById('dialogue-box').style.display = 'none';
    document.getElementById('pokedex-screen').style.display = 'none';
    document.getElementById('gameover-screen').style.display = 'none';
    document.getElementById('toast').classList.remove('visible');

    updateProgressCounter();

    // create() runs again; every texture builder guards on textures.exists(),
    // so the generated art is reused rather than rebuilt.
    game.scene.keys.MuseumScene.scene.restart();
}

// ==========================================
// 6. BOOT UP THE ENGINE
// ==========================================

const config = {
    type: Phaser.AUTO,
    width: 480,     // 15 tiles across
    height: 320,    // 10 tiles down
    parent: 'game-container',
    pixelArt: true,
    backgroundColor: '#1a1a20',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [MuseumScene]
};

const game = new Phaser.Game(config);

initDangerControls();
