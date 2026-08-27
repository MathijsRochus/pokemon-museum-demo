// ==========================================
// BOOT
// ==========================================
//
// Loaded last. The collection fetch and the string table happen here, before
// Phaser is created, so the museum is stocked by the time the scene builds its
// textures.

function restartRun() {
    // A fresh run: the dex empties, but whatever difficulty you dialled in
    // on the slider is deliberately kept so demoing a level stays easy.
    GameState.sessionPokedex.clear();
    GameState.isReading = false;
    GameState.dexOpen = false;
    GameState.gameOver = false;

    finishTyping();
    document.getElementById('dialogue-box').style.display = 'none';
    document.getElementById('pokedex-screen').style.display = 'none';
    document.getElementById('gameover-screen').style.display = 'none';
    document.getElementById('toast').classList.remove('visible');

    updateProgressCounter();

    // create() runs again; every texture builder guards on textures.exists(),
    // so the generated art is reused rather than rebuilt.
    game.scene.keys.MuseumScene.scene.restart();
}

const config = {
    type: Phaser.AUTO,
    width: 480,     // 15 tiles across
    height: 320,    // 10 tiles down
    parent: 'game-container',
    pixelArt: true,
    backgroundColor: '#1a1a20',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [MuseumScene]
};

// Assigned by startGame(); restartRun() reaches through it to restart the scene.
let game = null;

// ------------------------------------------
// Loading
// ------------------------------------------
// One phase: fetch the objects. Nothing else is downloaded, so the bar tracks
// the collection fetch and nothing more. The plinths are drawn from the
// object's category, which is why the museum can open in a couple of seconds.

function setLoadProgress(fraction, message) {
    const bar = document.getElementById('boot-bar');
    const status = document.getElementById('boot-status');

    if (bar) bar.style.width = Math.round(Phaser.Math.Clamp(fraction, 0, 1) * 100) + '%';
    if (status && message) status.innerText = message;
}

// The museum is drawn and playable: clear the load screen and greet the player.
// create() runs again on every retry, so this only fires the first time.
let hasFinishedLoading = false;

function finishLoading() {
    if (hasFinishedLoading) return;
    hasFinishedLoading = true;

    setLoadProgress(1, t('loading.ready'));

    const screen = document.getElementById('boot-screen');
    if (screen) screen.style.display = 'none';

    showToast(t('loading.welcome', { name: GameState.playerName }));
}


// Called by the START button once a name has been entered.
async function startGame() {
    const nameField = document.getElementById('player-name');
    const typed = nameField ? nameField.value.trim() : '';
    GameState.playerName = typed || t('start.defaultName');

    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('boot-screen').style.display = 'flex';
    setLoadProgress(0, t('loading.connecting'));

    // The type register rides along with the object draw rather than after it,
    // so the rarity table costs no extra wall-clock.
    let records = [];
    const [drawn] = await Promise.all([
        DMG.randomExhibits(EXHIBIT_SLOTS, (fraction, message) => {
            setLoadProgress(fraction, message);
        }).catch(error => {
            console.warn('Museumdex: collectie-API onbereikbaar —', error.message);
            return [];
        }),
        DMG.loadTypeCounts()
    ]);
    records = drawn;

    // Short of a full museum, pad rather than leave plinths that cannot be
    // inspected. The stand-ins are sixteen real objects from the museum's
    // permanent display, fetched only now — so a normal load never pays for
    // them, and an empty draw still fills the floor with the collection.
    const fromApi = records.length;
    if (records.length < EXHIBIT_SLOTS) {
        setLoadProgress(0.9, t('loading.demo'));
        const demo = await DMG.loadDemoCollection();

        for (let i = 0; records.length < EXHIBIT_SLOTS && demo.length; i++) {
            records.push(demo[i % demo.length]);
        }
    }

    // Rarity is worked out once, here, rather than on every dex render. Records
    // from the offline collection already carry theirs — computed when the file
    // was built — so they are left alone: recomputing would need the type index,
    // which is exactly what is unreachable when that path runs.
    records.forEach(record => {
        if (!record.rarity) record.rarity = DMG.rarityFor(record.types);
    });

    installExhibits(records);
    updateProgressCounter();
    updateSourceNote(fromApi, records.length);

    setLoadProgress(1, t('loading.ready'));
    game = new Phaser.Game(config);
    initDangerControls();
}

// Says where this run's exhibits came from, under the game window.
function updateSourceNote(fromApi, total) {
    const note = document.getElementById('source-note');
    if (!note) return;

    if (!fromApi) {
        note.innerHTML = t('source.offline');
        return;
    }

    const link = '<a href="https://data.designmuseumgent.be/v2" target="_blank" rel="noopener">' +
                 t('source.linkText') + '</a>';

    // Singular is a separate string, not a plural rule: "1 van de 16 objecten
    // komt" is reachable when most draws fail, and Dutch conjugates it.
    const sentence = fromApi === 1
        ? t('source.liveOne', { total: total, link: link })
        : t('source.live', { count: fromApi, total: total, link: link });

    note.innerHTML = sentence + ' ' + t('source.drawnNote') + ' ' + t('source.reload');
}

// Nothing is shown until the strings are in: the markup carries no copy of its
// own, so revealing it first would flash an interface of empty boxes.
async function init() {
    const loaded = await I18n.load();

    // No strings means nothing readable to show, so the game does not start at
    // all — it explains itself instead.
    if (!loaded) {
        I18n.showLoadFailure();
        return;
    }

    I18n.apply();

    const start = document.getElementById('start-screen');
    if (start) start.style.display = 'flex';

    const field = document.getElementById('player-name');
    const button = document.getElementById('start-button');

    if (button) button.addEventListener('click', startGame);
    if (field) {
        // The name field should not need a mouse.
        field.addEventListener('keydown', event => {
            if (event.key === 'Enter') startGame();
        });
        field.focus();
    }
}

init();
