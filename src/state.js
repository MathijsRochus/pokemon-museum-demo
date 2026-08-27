// ==========================================
// GAME STATE AND THE EXHIBITS IN PLAY
// ==========================================
//
// MuseumAPI is filled by installExhibits() during boot — from the museum if it
// answers, from the demo pieces in src/art/categories/demo.js if it does not.

const MuseumAPI = {};

// The offline museum lives in content/demo-collection.json: sixteen objects
// from the museum's own permanent display, with their real catalogue text.
// Loaded by DMG.loadDemoCollection() only when the live draw falls short, so
// nothing here is hard-coded and nothing is fetched on a normal load.

let TOTAL_EXHIBITS = 0;

// Tile values are handed out in order from 2, which is what the map is drawn
// against. Everything downstream — textures, dialogue, badges, the dex, the
// progress counter — reads MuseumAPI, so this is the only place that needs to
// know where the exhibits came from.
function installExhibits(records) {
    for (const key in MuseumAPI) delete MuseumAPI[key];
    records.forEach((record, index) => {
        MuseumAPI['exhibit_' + (index + 2)] = record;
    });
    TOTAL_EXHIBITS = records.length;
}

// Tile values 2 and up are exhibits; which ones exist is decided entirely by
// what the API returned.
function isExhibitTile(tileValue) {
    return Object.prototype.hasOwnProperty.call(MuseumAPI, 'exhibit_' + tileValue);
}

function tileValueFor(exhibitId) {
    return Number(exhibitId.split('_')[1]);
}

const GameState = {
    playerName: 'Bezoeker',
    sessionPokedex: new Set(),
    isReading: false,        // dialogue box is open
    dexOpen: false,          // pokedex overlay is open
    gameOver: false,         // MARLOT got her photo
    threatOverride: null     // set by the demo slider; null = automatic ramp
};

// Everything that should freeze the world routes through here: player
// movement, the interaction prompt, and MARLOT herself. That last one
// matters — without it she could line up a shot while you're reading an
// exhibit, which is a photo you had no way to dodge.
function uiIsBlocking() {
    return GameState.isReading || GameState.dexOpen || GameState.gameOver;
}
