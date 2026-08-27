// ==========================================
// PALETTE
// ==========================================
//
// Every colour in the game. The first place to look when changing how something
// looks rather than how it behaves.

const PALETTE = {
    marbleA:  '#ddd6c8',
    marbleB:  '#d2c9b8',
    marbleLn: '#c0b6a2',
    wall:     '#4b4a57',
    wallTop:  '#6e6c7e',
    wallLow:  '#3a3944',
    stone:    '#9a99a6',
    stoneTop: '#b9b8c4',
    stoneLow: '#6f6e7b',
    bone:     '#efe7d3',
    boneDark: '#c9bfa6',
    clay:     '#b5623a',
    clayDark: '#8a462a',
    clayTrim: '#e0b27a',
    skin:     '#f2c9a0',
    skinDark: '#d6a67c',
    cap:      '#d94b3f',
    capDark:  '#a83a30',
    shirt:    '#3f6fa8',
    shirtDk:  '#2f5580',
    pants:    '#2e3440',
    shoe:     '#191d24',
    ink:      '#20242c',
    gold:     '#f5c451',
    goldDark: '#b8862b',
    green:    '#4cc46a',

    maskGold: '#e8b53c',
    maskGoldD:'#b8862b',
    lapis:    '#2f5fa8',
    lapisDark:'#1f3f74',
    obsidian: '#1a1520',
    brass:    '#c99a3f',
    brassDark:'#8f6a26',

    // The dust sheet, for objects the catalogue cannot describe a shape for
    sheet:     '#e6e1d2',
    sheetLt:   '#f7f4ec',
    sheetDk:   '#c3bda9',
    sheetSh:   '#a8a291',

    // Category stand-ins for objects with no photograph
    wood:      '#8a5a33',
    woodDark:  '#5f3d21',
    woodLt:    '#a9743f',
    ceramic:   '#e8eef2',
    ceramicDk: '#b9c7d1',
    cobalt:    '#3a5fa8',
    cobaltDk:  '#26407a',
    cloth:     '#c8536e',
    clothDk:   '#9c3550',
    clothLt:   '#e0798f',
    steel:     '#b0b6bd',
    steelDk:   '#7b8288',
    steelLt:   '#d7dbdf',
    glassBlue: '#8fb8cf',

    // MARLOT — museum communications team
    blazer:    '#c2385c',
    blazerLt:  '#e05878',
    blazerDk:  '#8e2340',
    press:     '#f4eee6',
    lanyard:   '#2b2b38',
    badge:     '#f5c451',
    hairPr:    '#3a2418',
    hairPrLt:  '#57371f',
    camera:    '#2b2b36',
    cameraLt:  '#4a4a5c',
    cameraDk:  '#16161e',
    lens:      '#1d2a3a',
    lensLt:    '#4f7fb0',
    flash:     '#f7f3e8',
    warn:      '#e0457b',

    // Doorway between rooms
    doorDark:  '#2b2119',
    doorWarm:  '#6d4b2c',
    doorGlow:  '#f5c451',
    doorLt:    '#8f6a3f'
};

// Create a canvas-backed texture and hand its 2D context to a draw function.
// px() is the workhorse for all the chunky pixel drawing below. Factored out of
// makeTexture() because a texture can also be redrawn in place, once a
