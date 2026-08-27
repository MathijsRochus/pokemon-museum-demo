// ==========================================
// CATEGORY: FURNITURE
// ==========================================
//
// Seating, tables and casework. 'meubelonderdeel' is named in full on purpose:
// bare 'onderdeel' must stay a dust sheet, because it says nothing about shape.

function drawFurniture(px) {
    px(10, 3, 2, 12, PALETTE.woodDark);      // back posts
    px(19, 3, 2, 12, PALETTE.woodDark);
    px(10, 4, 11, 2, PALETTE.wood);          // slats
    px(10, 8, 11, 2, PALETTE.wood);
    px(11, 3, 1, 12, PALETTE.woodLt, 0.5);   // highlight down the near post
    px(9, 15, 13, 3, PALETTE.woodLt);        // seat
    px(9, 17, 13, 1, PALETTE.woodDark);
    px(10, 18, 2, 3, PALETTE.woodDark);      // front legs
    px(19, 18, 2, 3, PALETTE.woodDark);
    px(10, 20, 11, 1, PALETTE.woodDark, 0.4);
}

// A wall tile, propped up to be seen: cobalt on white, the way most of the

registerCategory({
    key: 'furniture',
    keywords: [
        'stoel', 'zetel', 'fauteuil', 'tafel', 'kast', 'bank', 'bed',
        'ledikant', 'wieg', 'buffet', 'commode', 'kabinet', 'rek',
        'kruk', 'voetenbank', 'stoelsport', 'meubel', 'meubelbeslag',
        'ladegreep', 'sleutelplaat', 'scharnier', 'tafelblad',
        'spiegel', 'bureau', 'schab', 'poot', 'leuning', 'zitting',
        'vitrine', 'ladeknop', 'sofa', 'divan', 'dressoir', 'kapstok',
        'schraag', 'kist', 'sokkel', 'voetstuk', 'meubelonderdeel'
    ],
    draw: drawFurniture
});
