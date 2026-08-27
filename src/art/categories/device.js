// ==========================================
// CATEGORY: DEVICE
// ==========================================
//
// Packaging, machines, lamps, cutlery and prototypes — the design half of the
// collection. Registered last because it is the broadest.

function drawDevice(px) {
    px(8, 8, 16, 11, PALETTE.steel);         // housing
    px(8, 8, 16, 1, PALETTE.steelLt);
    px(8, 18, 16, 1, PALETTE.steelDk);
    px(23, 9, 1, 10, PALETTE.steelDk);
    px(10, 10, 9, 5, PALETTE.ink);           // front panel
    px(11, 11, 7, 3, PALETTE.glassBlue);     // display
    px(11, 11, 7, 1, '#ffffff', 0.3);
    px(20, 11, 3, 3, PALETTE.gold);          // dial
    px(21, 12, 1, 1, PALETTE.ink);
    px(20, 16, 3, 1, PALETTE.steelDk);       // vents
    px(10, 16, 6, 1, PALETTE.steelDk);
    px(10, 19, 3, 2, PALETTE.ink);           // feet
    px(19, 19, 3, 2, PALETTE.ink);
}

registerCategory({
    key: 'device',
    keywords: [
        'verpakking', 'schrijfmachine', 'strijkijzer', 'wafelijzer',
        'stofzuiger', 'lamp', 'armatuur', 'luchter', 'radio',
        'telefoon', 'apparaat', 'machine', 'toestel', 'prototype',
        'dummy', 'maquette', 'ontwerp', 'kaart', 'affiche', 'doos',
        'dienblad', 'koffer', 'klok', 'horloge', 'ventilator', 'mixer',
        'ketel', 'bestek', 'lepel', 'vork', 'mes', 'tang', 'schaar',
        'pan', 'plaat', 'bak', 'logo', 'houder', 'beslag', 'sleutel',
        'opener', 'weegschaal', 'legger', 'lampenkap', 'fototoestel',
        'blad', 'rooster', 'pers', 'molen', 'zeef', 'trechter', 'schep',
        'kurkentrekker', 'trekker', 'haardroger', 'magneet', 'etui',
        'draagtas', 'kandelaar', 'deurknop', 'theelicht'
    ],
    draw: drawDevice
});
