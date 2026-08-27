// ==========================================
// DOORS AND UI MARKERS
// ==========================================

function makeDoorTexture(scene) {
    makeTexture(scene, 'door', 32, 32, (px) => {
        px(4, 2, 24, 30, PALETTE.doorDark);
        px(6, 4, 20, 28, PALETTE.doorWarm);
        px(8, 7, 16, 25, PALETTE.doorGlow, 0.55);
        px(6, 4, 20, 1, PALETTE.doorLt);
        px(6, 4, 1, 28, PALETTE.doorLt, 0.6);
        px(25, 4, 1, 28, PALETTE.doorDark);
        // A threshold strip, so the tile still reads as walkable floor.
        px(4, 29, 24, 3, PALETTE.stoneTop);
        px(4, 31, 24, 1, PALETTE.stoneLow);
    });
}

// The autofocus frame that shows you where she is about to line up a shot —
// the same corner brackets a camera puts over its subject.
function makeWarnTexture(scene) {
    makeTexture(scene, 'warn', 32, 32, (px) => {
        px(2, 2, 28, 28, PALETTE.warn, 0.12);
        px(2, 2, 9, 3, PALETTE.warn);    px(2, 2, 3, 9, PALETTE.warn);
        px(21, 2, 9, 3, PALETTE.warn);   px(27, 2, 3, 9, PALETTE.warn);
        px(2, 27, 9, 3, PALETTE.warn);   px(2, 21, 3, 9, PALETTE.warn);
        px(21, 27, 9, 3, PALETTE.warn);  px(27, 21, 3, 9, PALETTE.warn);
        // Centre crosshair, to sell it as a viewfinder rather than a hazard.
        px(15, 13, 2, 6, PALETTE.warn, 0.5);
        px(13, 15, 6, 2, PALETTE.warn, 0.5);
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

    // A small gem that sits over the rarest plinths, so a Unicum is worth
    // walking to before MARLOT gets her shot. Drawn twice, in two tints.
    [['gem-unicum', PALETTE.gold, PALETTE.goldDark],
     ['gem-zeer', '#d47ae8', '#8e3ea8']].forEach(([key, bright, dark]) => {
        makeTexture(scene, key, 10, 12, (px) => {
            px(4, 0, 2, 2, bright);
            px(2, 2, 6, 2, bright);
            px(1, 4, 8, 3, bright);
            px(2, 7, 6, 2, dark);
            px(3, 9, 4, 2, dark);
            px(4, 11, 2, 1, dark);
            px(3, 3, 2, 2, '#ffffff', 0.7);
        });
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
