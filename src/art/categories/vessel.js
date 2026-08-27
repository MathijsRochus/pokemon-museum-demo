// ==========================================
// CATEGORY: VESSEL
// ==========================================
//
// Plates, bowls, cups, glasses and jugs. Porcelain, glass and earthenware
// outnumber everything else here, so this is the category that comes up most —
// about 43% of the collection. The offline demo's 'Romeinse vaas' reuses this
// drawing.

function drawVessel(px) {
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

registerCategory({
    key: 'vessel',
    keywords: [
        'vaas', 'vaatwerk', 'bord', 'schaal', 'schotel', 'kop', 'kom',
        'pot', 'kan', 'kruik', 'fles', 'glas', 'beker', 'terrine',
        'servies', 'deksel', 'karaf', 'bokaal', 'kelk', 'vloot', 'vat',
        'dop', 'bus', 'kroes', 'mok', 'kuip', 'emmer', 'tuit', 'flacon',
        'coupe', 'bonbonnière', 'onderzetter', 'servetring', 'inktstel',
        'fleurs'
    ],
    draw: drawVessel
});
