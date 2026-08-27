// ==========================================
// UI: THE END-OF-RUN GALLERY
// ==========================================

function showGameOver(stats) {
    document.getElementById('go-found').innerText = stats.found + '/' + TOTAL_EXHIBITS;
    // The player's name is inside the sentence, so the whole line is rendered
    // from the string rather than patched into a span — word order differs
    // between languages.
    document.getElementById('go-sub').innerHTML =
        t('end.subtitle', { name: escapeHtml(GameState.playerName) });
    document.getElementById('go-time').innerText = formatTime(stats.ms);
    document.getElementById('go-threat').innerText = Math.round(stats.threat * 100) + '%';
    document.getElementById('gameover-screen').style.display = 'flex';

    buildEndGallery();
}

// ------------------------------------------
// The end-of-run gallery
// ------------------------------------------
// The one place the museum's own photographs are shown, and the reason the
// plinths do not bother with them: at 600px a Gallé vase is worth looking at,
// where the same photograph crushed onto a 20px plinth was a smudge.
//
// Photographs are fetched only now, once the run is over and the player is
// reading rather than waiting. A plain <img> is used rather than a canvas, so
// no CORS handshake is needed — display does not require reading the pixels.

// The drawn objects double as the gallery's fallback, which is what makes an
// empty frame unnecessary: every card shows the piece the plinth showed, and a
// photograph simply replaces it if one arrives.
//
// Cached by art name — there are six variants across sixteen cards, so drawing
// each one once is worth the map.
const galleryArtCache = new Map();

function categoryArtUrl(record) {
    const name = record.art || 'unknown';
    if (galleryArtCache.has(name)) return galleryArtCache.get(name);

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // No pedestal and no case glare: on a plinth those sell the object as an
    // exhibit, but in a gallery frame they are furniture around the subject.
    const draw = PROCEDURAL_ART[record.art];
    if (draw) draw(pixelPainter(ctx));
    else drawUnknownExhibit(pixelPainter(ctx));

    const url = cropToContent(canvas).toDataURL('image/png');
    galleryArtCache.set(name, url);
    return url;
}

// The art functions all draw around a plinth that is not here, so the result
// sits high in its 32x32 box with dead space below. Trimming to the pixels that
// were actually painted lets the frame centre the object instead of the box.
function cropToContent(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;

    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] === 0) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0) return canvas;   // nothing was drawn

    const cropped = document.createElement('canvas');
    cropped.width = maxX - minX + 1;
    cropped.height = maxY - minY + 1;

    const ctx = cropped.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, minX, minY, cropped.width, cropped.height,
                  0, 0, cropped.width, cropped.height);
    return cropped;
}

function buildEndGallery() {
    const list = document.getElementById('go-gallery');
    const empty = document.getElementById('go-gallery-empty');
    if (!list) return;

    list.innerHTML = '';

    const found = Object.keys(MuseumAPI)
        .filter(key => GameState.sessionPokedex.has(key))
        .map(key => MuseumAPI[key]);

    if (empty) empty.style.display = found.length ? 'none' : 'block';
    if (!found.length) return;

    found.forEach(entry => list.appendChild(galleryCard(entry)));
    upgradeGalleryPhotos(found);
}

function galleryCard(entry) {
    const card = document.createElement('div');
    card.className = 'go-card';
    // Always set, even with no photo url to try: the manifest upgrade finds its
    // cards by this, and a card without it can never be filled in later.
    card.dataset.pid = entry.pid || '';

    const frame = document.createElement('div');
    frame.className = 'go-card-frame';

    // The drawn object, always. This is the fallback and the default state, so
    // a frame is never blank and never has to apologise for a missing photo.
    const art = document.createElement('img');
    art.className = 'go-card-art';
    art.alt = entry.name || '';
    art.src = categoryArtUrl(entry);
    frame.appendChild(art);

    // The photograph, layered over it and revealed only once it decodes. The
    // element exists whether or not there is a url for it yet: two thirds of
    // records arrive without one, and building it only for the third that do
    // left the rest with nothing for the manifest upgrade to fill.
    const photo = document.createElement('img');
    photo.className = 'go-card-photo';
    photo.alt = entry.name || '';
    // Checked on load rather than trusted, because a blocked response still
    // fires load: the museum's dead image host answers 403 with an HTML page,
    // which the browser rejects as a non-image and reports as complete with a
    // naturalWidth of zero.
    photo.addEventListener('load', () => {
        if (photo.naturalWidth > 0) frame.classList.add('has-photo');
    });
    frame.appendChild(photo);

    if (entry.photo) {
        photo.src = DMG.iiifWidth(entry.photo, DMG.GALLERY_WIDTH) || entry.photo;
    }

    const body = document.createElement('div');
    body.className = 'go-card-body';
    body.innerHTML =
        '<div class="go-card-name">' + escapeHtml(entry.name) + '</div>' +
        rarityHtml(entry) +
        (entry.maker ? '<div class="go-card-maker">' + escapeHtml(entry.maker) + '</div>' : '') +
        '<div class="go-card-desc">' + escapeHtml(entry.description) + '</div>';

    card.appendChild(frame);
    card.appendChild(body);
    return card;
}

// Second chance for the photographs that failed. The IIIF manifest is the only
// route left while the record's own image host answers 403, and it is slow — a
// 17s median, and it fails more often than it works. Which is why the drawn
// object is the default rather than a placeholder: nothing is waiting on this,
// no frame is empty while it runs, and a photograph that arrives twenty seconds
// later simply replaces the drawing.
async function upgradeGalleryPhotos(entries) {
    const pending = entries.filter(entry => entry.manifest && entry.pid);

    await DMG.pool(pending.map(entry => async () => {
        const url = await DMG.spriteViaManifest(entry.manifest);
        if (!url) return;

        // Looked up after the slow fetch, not before: the player may have hit
        // retry in the seventeen seconds it took, and the card would be gone.
        const card = document.querySelector('.go-card[data-pid="' + cssEscape(entry.pid) + '"]');
        const frame = card && card.querySelector('.go-card-frame');
        const photo = frame && frame.querySelector('.go-card-photo');

        // Gone, or a photograph already landed by the direct route.
        if (!photo || frame.classList.contains('has-photo')) return;

        photo.src = url;
    }), 4);
}

