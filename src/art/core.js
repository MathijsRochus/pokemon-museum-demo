// ==========================================
// DRAWING CORE
// ==========================================
//
// px() is the whole drawing API: one call per rectangle. Everything else in
// src/art builds on it.

function pixelPainter(ctx) {
    return (x, y, w, h, color, alpha) => {
        ctx.globalAlpha = (alpha === undefined) ? 1 : alpha;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
    };
}

function makeTexture(scene, key, width, height, draw) {
    if (scene.textures.exists(key)) return scene.textures.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    draw(pixelPainter(ctx), ctx);
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
