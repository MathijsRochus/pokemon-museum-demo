// ==========================================
// CATEGORY: TEXTILE
// ==========================================
//
// Cloth, and anything woven or sewn. Registered first because it is the
// narrowest: a `tafellaken` is textile, not furniture.
// 
// 'kant' is deliberately absent — as a suffix it swallows 'ledikant', which is a
// bed. Lace shows up under its own compounds instead.

function drawTextile(px) {
    px(9, 5, 14, 11, PALETTE.cloth);
    px(9, 5, 14, 1, PALETTE.clothLt);
    px(9, 5, 1, 11, PALETTE.clothLt, 0.5);
    px(13, 6, 1, 10, PALETTE.clothDk, 0.6);  // folds
    px(17, 6, 1, 10, PALETTE.clothDk, 0.6);
    px(9, 9, 14, 1, PALETTE.bone, 0.7);      // selvedge stripe
    px(9, 16, 14, 1, PALETTE.clothDk);
    for (let x = 9; x < 23; x += 4) {        // scalloped hem
        px(x, 16, 3, 2, PALETTE.cloth);
        px(x + 1, 18, 1, 1, PALETTE.clothDk);
    }
}

// A boxy appliance: dark panel, lit display, one brass dial. Stands in for the
// packaging, prototypes, lamps and machines that make up the design half of

registerCategory({
    key: 'textile',
    keywords: [
        'servet', 'weefsel', 'stof', 'stoffering', 'fluweel', 'laken',
        'naaldkant', 'kloskant', 'kantwerk', 'tapijt', 'sjaal', 'doek',
        'damast', 'brokaat', 'zijde', 'textiel', 'handdoek', 'vitrage',
        'sprei', 'dekbed', 'stalenboek', 'borduurwerk', 'kussen',
        'gordijn', 'tule', 'lint', 'garen', 'wol', 'katoen', 'japon',
        'kleed', 'franje', 'passement', 'tressen', 'das'
    ],
    draw: drawTextile
});
