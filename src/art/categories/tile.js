// ==========================================
// CATEGORY: TILE
// ==========================================
//
// Wall tiles and flat architectural pieces. The museum holds 540 wandtegels
// alone, most of them cobalt on white, which is what this draws.

function drawTile(px) {
    px(9, 5, 14, 14, PALETTE.ceramicDk);     // edge
    px(10, 6, 12, 12, PALETTE.ceramic);      // glazed face
    px(11, 7, 2, 2, PALETTE.cobalt);         // corner motifs
    px(19, 7, 2, 2, PALETTE.cobalt);
    px(11, 15, 2, 2, PALETTE.cobalt);
    px(19, 15, 2, 2, PALETTE.cobalt);
    px(15, 10, 2, 4, PALETTE.cobalt);        // centre rosette
    px(14, 11, 4, 2, PALETTE.cobalt);
    px(15, 9, 2, 1, PALETTE.cobaltDk);
    px(15, 14, 2, 1, PALETTE.cobaltDk);
    px(10, 6, 12, 1, '#ffffff', 0.4);        // glaze sheen
    px(9, 19, 14, 1, PALETTE.stoneLow);      // where it meets the plinth
}

registerCategory({
    key: 'tile',
    keywords: [
        'tegel', 'haardsteen', 'paneel', 'sierelement', 'plaquette',
        'lambrisering', 'baksteen', 'ornament', 'kader', 'tableau',
        'fries', 'medaillon', 'reliëf'
    ],
    draw: drawTile
});
