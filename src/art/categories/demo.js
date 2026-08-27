// ==========================================
// THE OFFLINE DEMO PIECES
// ==========================================
//
// Enough of a museum to play with no network. Only these four are hand-drawn as
// specific objects; everything from the API is drawn as its category.

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

// --- Category stand-ins, for objects that arrived without a photograph ---
// One piece per broad category from DMG.CATEGORIES. Between them they cover
// about 87% of the collection, so an image-service outage leaves a museum of
// roughly the right shapes rather than a room of identical crates.

// Asked for by name rather than found by classification: an offline exhibit
// says which piece it wants. 'vase' reuses the vessel category's drawing, which
// is the same shape by design.
registerArt('skull', drawSkull);
registerArt('vase', drawVessel);
registerArt('mask', drawMask);
registerArt('astrolabe', drawAstrolabe);
