// ==========================================
// UI: EXPORTING THE MUSEUMDEX
// ==========================================

let exportRunning = false;

async function downloadMuseumdex() {
    if (exportRunning) return;

    const button = document.getElementById('dex-download');
    const found = Object.keys(MuseumAPI)
        .filter(key => GameState.sessionPokedex.has(key))
        .map(key => ({ key: key, entry: MuseumAPI[key] }));

    if (!found.length) {
        showToast(t('dex.nothingSaved'));
        return;
    }

    exportRunning = true;
    const original = button ? button.innerText : '';
    const setLabel = text => { if (button) button.innerText = text; };
    setLabel(t('dex.downloading'));

    let done = 0;
    const records = await DMG.pool(found.map(({ key, entry }) => async () => {
        // A fallback exhibit has no object number, so there is nothing live to
        // fetch — it is written out as-is.
        const live = entry.pid
            ? await DMG.json(DMG.BASE + '/object/' + entry.pid).catch(() => null)
            : null;

        done++;
        setLabel(t('dex.downloadingProgress', { done: done, total: found.length }));

        const room = ROOMS.find(r => r.exhibitTiles.includes(tileValueFor(key)));
        return {
            museumdexNumber: tileValueFor(key) - 1,
            objectNumber: entry.pid || null,
            zaal: room ? roomName(room) : null,
            zeldzaamheid: entry.rarity
                ? { tier: entry.rarity.label, aantalInCollectie: entry.rarity.count, type: entry.rarity.type }
                : null,
            catalogusrecord: live,
            // Only when the live fetch failed, so the file always says
            // something about the object rather than nothing.
            spelgegevens: live ? undefined : {
                naam: entry.name,
                beschrijving: entry.description,
                maker: entry.maker,
                opmerking: t('export.liveFailed')
            }
        };
    }), 4);

    const payload = {
        museumdex: {
            speler: GameState.playerName,
            gevonden: found.length,
            totaalInDitMuseum: TOTAL_EXHIBITS,
            geexporteerdOp: new Date().toISOString()
        },
        bron: {
            api: 'https://data.designmuseumgent.be/v2',
            documentatie: 'https://api.designmuseumgent.be/v2/',
            rechten: t('export.rights')
        },
        objecten: records.filter(Boolean)
    };

    const stamp = new Date().toISOString().slice(0, 10);
    saveFile('museumdex-' + stamp + '.json',
             JSON.stringify(payload, null, 2),
             'application/json');

    setLabel(original || t('dex.download'));
    exportRunning = false;
    showToast(t('dex.saved', { count: records.filter(Boolean).length }));
}

// Hand the browser a file. The object url is revoked afterwards, or the blob
// stays in memory for the life of the page.
function saveFile(filename, text, mime) {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------
// Danger meter — doubles as a demo slider
// ------------------------------------------
