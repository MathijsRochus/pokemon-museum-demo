// ==========================================
// CHARACTERS
// ==========================================
//
// The player's 16-frame walk cycle and MARLOT, both drawn frame by frame.

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

// --- MARLOT: the museum's communications team, camera already raised ---
// She reads as staff rather than as a monster: lanyard, blazer, and a camera
// held up to her eye. The threat is the shutter, so the camera is the thing
// the sprite puts front and centre.
function makeMarlotTexture(scene) {
    makeTexture(scene, 'marlot', 32, 32, (px) => {
        // Legs and shoes.
        px(12, 24, 3, 6, PALETTE.pants);
        px(17, 24, 3, 6, PALETTE.pants);
        px(11, 29, 4, 2, PALETTE.shoe);
        px(17, 29, 4, 2, PALETTE.shoe);

        // Blazer over a bright top — museum-staff smart.
        px(10, 14, 12, 11, PALETTE.blazer);
        px(14, 15, 4, 9, PALETTE.press);
        px(10, 14, 12, 1, PALETTE.blazerLt);
        px(9, 24, 14, 1, PALETTE.blazerDk);

        // Lanyard: two straps meeting at a badge on the chest.
        px(13, 14, 1, 4, PALETTE.lanyard);
        px(18, 14, 1, 4, PALETTE.lanyard);
        px(14, 18, 4, 3, PALETTE.badge);
        px(15, 19, 2, 1, PALETTE.ink, 0.5);

        // Hair: a short bob, tucked behind the ears.
        px(10, 3, 12, 8, PALETTE.hairPr);
        px(9, 5, 2, 7, PALETTE.hairPr);
        px(21, 5, 2, 7, PALETTE.hairPr);
        px(10, 3, 12, 1, PALETTE.hairPrLt);

        // Face, mostly hidden behind the viewfinder.
        px(12, 8, 8, 7, PALETTE.skin);
        px(12, 14, 8, 1, PALETTE.skinDark);
        px(14, 13, 4, 1, '#b4635a');        // a working smile

        // Arms come forward to hold the camera up.
        px(7, 15, 3, 5, PALETTE.blazer);
        px(22, 15, 3, 5, PALETTE.blazer);
        px(8, 12, 3, 4, PALETTE.skin);
        px(21, 12, 3, 4, PALETTE.skin);

        // The camera itself, across her eyes.
        px(10, 8, 12, 6, PALETTE.camera);
        px(10, 8, 12, 1, PALETTE.cameraLt);
        px(10, 13, 12, 1, PALETTE.cameraDk);
        px(13, 6, 5, 2, PALETTE.cameraDk);   // prism hump
        px(19, 9, 3, 2, PALETTE.flash);      // hotshoe flash
        px(19, 9, 3, 1, '#ffffff', 0.6);

        // Lens barrel, pointed straight at the player.
        px(13, 9, 6, 6, PALETTE.cameraDk);
        px(14, 10, 4, 4, PALETTE.lens);
        px(15, 11, 2, 2, PALETTE.lensLt);
        px(15, 11, 1, 1, '#ffffff', 0.85);   // glint on the glass
    });
}
