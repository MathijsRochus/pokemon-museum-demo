// ==========================================
// UI: THE MUSEUMDEX
// ==========================================

function togglePokedex() {
    const dexScreen = document.getElementById('pokedex-screen');
    const dexList = document.getElementById('dex-list');

    if (GameState.dexOpen) {
        dexScreen.style.display = 'none';
        GameState.dexOpen = false;
        return;
    }

    // Opening the dex dismisses any dialogue underneath it.
    if (GameState.isReading) closeDialogue();

    dexScreen.style.display = 'block';
    GameState.dexOpen = true;
    updateProgressCounter();

    dexList.innerHTML = '';

    // Grouped by wing, in the order you would walk them, so the dex doubles as
    // a map of what is still left to find.
    ROOMS.forEach(room => {
        const found = room.exhibitTiles.filter(
            tile => GameState.sessionPokedex.has('exhibit_' + tile)
        ).length;

        const heading = document.createElement('div');
        heading.className = 'dex-room';
        heading.innerHTML =
            '<span>' + escapeHtml(roomName(room)) + '</span>' +
            '<b>' + found + '/' + room.exhibitTiles.length + '</b>';
        dexList.appendChild(heading);

        room.exhibitTiles.forEach(tile => {
            const key = 'exhibit_' + tile;
            const entry = MuseumAPI[key];
            if (!entry) return;

            // Numbered across the whole museum rather than per room, so an
            // entry's number does not move when a wing fills up.
            const number = String(tile - 1).padStart(3, '0');
            const item = document.createElement('div');
            const isFound = GameState.sessionPokedex.has(key);
            item.className = 'dex-item' + (isFound ? '' : ' locked');

            if (isFound) {
                item.innerHTML =
                    '<div class="dex-num">' + escapeHtml(t('dex.entryNumber', { number: number })) +
                        (entry.pid ? ' &middot; ' + escapeHtml(entry.pid) : '') + '</div>' +
                    '<div class="dex-body">' +
                        (entry.photo
                            ? '<img class="dex-photo" src="' + encodeURI(entry.photo) + '" alt="" loading="lazy">'
                            : '') +
                        '<div class="dex-text">' +
                            '<div class="dex-name">' + escapeHtml(entry.name) + '</div>' +
                            rarityHtml(entry) +
                            factsHtml(entry) +
                            '<div class="dex-desc">' + escapeHtml(entry.description) + '</div>' +
                            creditHtml(entry) +
                        '</div>' +
                    '</div>';
            } else {
                item.innerHTML =
                    '<div class="dex-num">' + escapeHtml(t('dex.entryNumber', { number: number })) + '</div>' +
                    '<div class="dex-name">' + escapeHtml(t('dex.unknownName')) + '</div>' +
                    '<div class="dex-desc">' +
                        escapeHtml(t('dex.notFound', { room: roomName(room).toLowerCase() })) +
                    '</div>';
            }

            dexList.appendChild(item);
        });
    });
}

// ------------------------------------------
// Dex entry rendering
// ------------------------------------------
// Everything below builds HTML out of text that came off the network, so it
// all goes through escapeHtml() first — a catalogue label is free to contain
// an ampersand or an angle bracket.

// escapeHtml() and the other shared helpers live in src/util.js.


// The rarity chip, coloured by tier, with the count that earned it. Nothing is
// shown when the type register did not load or the object's type is not in it —
// an invented rarity would be worse than none.
function rarityHtml(entry) {
    const rarity = entry.rarity;
    if (!rarity) return '';

    return '<div class="dex-rarity" style="border-color:' + rarity.color +
           ';color:' + rarity.color + '">' +
           escapeHtml(rarity.label) +
           '<span>' + escapeHtml(t('dex.inCollection', { count: rarity.count })) + '</span>' +
           '</div>';
}

// Only the fields this particular object actually has — coverage across ten
// thousand catalogue records is uneven, and empty rows read as broken.
function factsHtml(entry) {
    const rows = [];
    const add = (label, value) => {
        if (value) rows.push('<span>' + label + '</span><b>' + escapeHtml(value) + '</b>');
    };

    add(t('facts.maker'), entry.maker);
    add(t('facts.place'), entry.place);
    add(t('facts.type'), (entry.types || []).join(', '));
    add(t('facts.material'), (entry.materials || []).join(', '));
    add(t('facts.technique'), (entry.techniques || []).join(', '));
    add(t('facts.dimensions'), formatDimensions(entry.dimensions));
    add(t('facts.acquired'), entry.acquiredHow && entry.acquired
        ? entry.acquiredHow + ', ' + entry.acquired
        : entry.acquired);

    return rows.length ? '<div class="dex-facts">' + rows.join('') + '</div>' : '';
}

// "h 11.8 x b 4.5 x d 10 cm" — the axis names are Dutch (hoogte, breedte,
// diepte), and their initials happen to be exactly the right abbreviation.
function formatDimensions(dimensions) {
    if (!dimensions || !dimensions.length) return null;

    const unit = dimensions[0].unit;
    const parts = dimensions.map(d => d.axis.charAt(0) + ' ' + d.value);
    return parts.join(' \u00d7 ') + (unit ? ' ' + unit : '');
}

// The museum publishes photographer and rightsholder per image; showing them
// is the least the API's terms deserve.
function creditHtml(entry) {
    const bits = [];
    if (entry.credit) bits.push(escapeHtml(entry.credit));
    if (entry.url) {
        bits.push('<a href="' + encodeURI(entry.url) + '" target="_blank" rel="noopener">' +
                  escapeHtml(t('dex.catalogueLink')) + '</a>');
    }
    return bits.length ? '<div class="dex-credit">' + bits.join(' &middot; ') + '</div>' : '';
}

// ------------------------------------------
// Exporting the Museumdex
// ------------------------------------------
// The dex on screen shows what fits in a pixel font. This writes out everything
// the museum holds on the objects you found, fetched fresh at the moment you
// press the button rather than reused from the copies the game has been
// carrying — so the file is the catalogue as it stands now, complete, not the
// handful of fields the game happens to render.
