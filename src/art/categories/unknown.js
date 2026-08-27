// ==========================================
// CATEGORY: UNKNOWN — a dust sheet
// ==========================================
//
// The fallback when an object's type says nothing about its shape: 'fragment',
// 'onderdeel', 'staal (monster)' and the like, about 4% of the collection.

const DRAPE_ROWS = [
    [14, 5], [13, 7], [13, 8], [12, 10], [12, 11], [11, 13], [11, 14], [10, 15],
    [10, 15], [9, 16], [9, 16], [9, 16], [8, 17], [8, 17], [8, 17], [8, 17]
];
const DRAPE_TOP = 4;

// Which hem pixels drop a row. Deliberately not periodic — an even zigzag
// reads as teeth rather than as fabric.
const DRAPE_HEM = [0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1];

function drawUnknownExhibit(px) {
    // The body, then the lit near edge, then the shaded far side.
    DRAPE_ROWS.forEach(([x, w], i) => px(x, DRAPE_TOP + i, w, 1, PALETTE.sheet));
    DRAPE_ROWS.forEach(([x], i) => px(x, DRAPE_TOP + i, 2, 1, PALETTE.sheetLt));
    DRAPE_ROWS.forEach(([x, w], i) => {
        px(x + w - 3, DRAPE_TOP + i, 3, 1, PALETTE.sheetDk);
        px(x + w - 1, DRAPE_TOP + i, 1, 1, PALETTE.sheetSh);
    });

    // The hard edge of whatever is underneath, showing through on the right.
    for (let i = 6; i < 10; i++) {
        const [x, w] = DRAPE_ROWS[i];
        px(x + w - 4, DRAPE_TOP + i, 1, 1, PALETTE.sheetSh, 0.7);
    }

    // Folds fanning out from under the peak, drifting wider as they fall.
    DRAPE_ROWS.forEach(([x, w], i) => {
        if (i < 2) return;
        const y = DRAPE_TOP + i;
        px(x + 3 + Math.floor(i / 5), y, 1, 1, PALETTE.sheetDk, 0.45);
        if (w > 10) px(x + w - 6 - Math.floor(i / 6), y, 1, 1, PALETTE.sheetDk, 0.3);
        if (w > 13 && i > 6) px(x + Math.floor(w / 2) + 1, y, 1, 1, PALETTE.sheetDk, 0.2);
    });

    const [baseX, baseW] = DRAPE_ROWS[DRAPE_ROWS.length - 1];
    const hemY = DRAPE_TOP + DRAPE_ROWS.length;

    for (let k = 0; k < baseW; k++) {
        px(baseX + k, hemY - 1 + DRAPE_HEM[k % DRAPE_HEM.length], 1, 1, PALETTE.sheetSh);
    }
    px(baseX, hemY, baseW, 1, '#000000', 0.12);

    // Two legs showing beneath the hem. Without them the sheet reads as a shape
    // in its own right rather than as a cover over an object.
    px(baseX + 3, hemY, 2, 2, PALETTE.woodDark);
    px(baseX + baseW - 5, hemY, 2, 2, PALETTE.woodDark);

    px(6, 21, 20, 1, '#000000', 0.16);   // contact shadow on the plinth top
}

// One texture per exhibit in play. A piece with a photograph loaded is
