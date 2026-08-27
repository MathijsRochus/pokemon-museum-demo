// ==========================================
// MUSEUMDEX — a Pokémon-style museum explorer
//
// All artwork in this demo is generated procedurally at runtime
// (see section 2). There are no image files to load or ship.
// ==========================================

// ==========================================
// 1. GLOBAL STATE & THE COLLECTION API
// ==========================================

// ------------------------------------------
// Design Museum Gent — live collection data
// ------------------------------------------
// https://data.designmuseumgent.be/v2 — open, no key, CORS-enabled JSON-LD
// over 9,879 catalogued objects. The vocabulary is CIDOC-CRM, so fields are
// property codes rather than friendly names: crm:P108i_was_produced_by is
// "who made it", crm:P45_consists_of is "what it is made of".
//
// Two things about the API shape drive the code below. The collection listing
// is thin — a label and a IIIF manifest id, nothing more — so every exhibit
// costs one extra detail request. And the detail response is generous: label,
// curatorial description, photograph, maker, materials, techniques, real
// dimensions and acquisition history, which is more than enough for a dex
// entry.

const DMG = {
    BASE: 'https://data.designmuseumgent.be/v2/id',

    TOTAL_OBJECTS: 9879,   // hydra:totalItems — used to pick a random page
    TIMEOUT_MS: 8000,

    // Every request is on a hard timeout: a slow museum must not mean a game
    // that never boots. Both hosts have been seen to answer 500 or 504 in
    // bursts and then recover within a second, so a failure is retried a
    // couple of times before it counts.
    RETRIES: 2,

    // The IIIF presentation server is far slower than the data API — measured
    // at a 17s median when cold, and often 504 — so manifest fetches get their
    // own budget. They only ever run in the background, never at boot.
    MANIFEST_TIMEOUT_MS: 30000,

    // The end-of-run gallery is the one place a photograph is shown properly,
    // so it asks for a width worth looking at rather than a sprite.
    GALLERY_WIDTH: 600,

    async json(url, timeoutMs) {
        let lastError = null;
        const budget = timeoutMs || DMG.TIMEOUT_MS;

        for (let attempt = 0; attempt <= DMG.RETRIES; attempt++) {
            const abort = new AbortController();
            const timer = setTimeout(() => abort.abort(), budget);
            try {
                const response = await fetch(url, { signal: abort.signal });

                if (!response.ok) {
                    const error = new Error('HTTP ' + response.status);
                    error.status = response.status;
                    throw error;
                }
                return await response.json();
            } catch (error) {
                lastError = error;

                // A 4xx is a decision, not a hiccup — retrying a 403 or a 404
                // just spends time to be told the same thing. 429 is the
                // exception: that one is asking us to wait.
                const definitive = error.status >= 400 && error.status < 500 && error.status !== 429;
                if (definitive || attempt >= DMG.RETRIES) break;

                await DMG.pause(250 * (attempt + 1));
            } finally {
                clearTimeout(timer);
            }
        }
        throw lastError;
    },

    pause(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // How many requests are allowed in flight at once. Thirty-two parallel
    // draws did work, until a burst of testing started coming back empty —
    // the API evidently has a ceiling, and a boot that quietly returns no
    // objects is much worse than one that takes another second.
    CONCURRENCY: 8,

    // Run tasks with a cap on how many are in flight. Results keep the order
    // of the input, and a rejection becomes null rather than sinking the rest.
    async pool(tasks, limit) {
        const results = new Array(tasks.length).fill(null);
        let next = 0;

        const worker = async () => {
            while (next < tasks.length) {
                const index = next++;
                try {
                    results[index] = await tasks[index]();
                } catch (error) {
                    results[index] = null;
                }
            }
        };

        await Promise.all(
            Array.from({ length: Math.min(limit || DMG.CONCURRENCY, tasks.length) }, worker)
        );
        return results;
    },

    // Walk a IIIF presentation manifest down to the image service that serves
    // it. The service url is the useful one: unlike the resource url, it can be
    // asked for any size.
    async spriteViaManifest(manifestUrl) {
        let manifest;
        try {
            manifest = await DMG.json(manifestUrl, DMG.MANIFEST_TIMEOUT_MS);
        } catch (error) {
            return null;
        }

        for (const sequence of DMG.list(manifest.sequences)) {
            for (const canvas of DMG.list(sequence.canvases)) {
                for (const image of DMG.list(canvas.images)) {
                    const service = (image.resource || {}).service;
                    const base = service && service['@id'];
                    if (base) return base + '/full/' + DMG.GALLERY_WIDTH + ',/0/default.jpg';
                }
            }
        }
        return null;
    },

    // One attempt, no retry and no warning.
    tryImage(url) {
        return new Promise(resolve => {
            const candidate = new Image();
            candidate.crossOrigin = 'anonymous';
            candidate.onload = () => resolve(candidate);
            candidate.onerror = () => resolve(null);
            candidate.src = url;
        });
    },

    // crossOrigin is essential: without it the pixels cannot be read back out
    // of a canvas, which is the whole pixelation step. Both IIIF hosts send
    // Access-Control-Allow-Origin: *.
    async loadImage(url) {
        for (let attempt = 0; attempt <= DMG.RETRIES; attempt++) {
            const image = await DMG.tryImage(url);
            if (image) return image;
            if (attempt < DMG.RETRIES) await DMG.pause(400 * (attempt + 1));
        }

        console.warn('Museumdex: foto niet geladen na ' + (DMG.RETRIES + 1) + ' pogingen — ' + url);
        return null;
    },

    // JSON-LD gives a bare object where there is one value and an array where
    // there are several, so every read goes through this first.
    list(value) {
        if (value === undefined || value === null) return [];
        return Array.isArray(value) ? value : [value];
    },

    // Labels are usually a plain string, but the multilingual ones arrive as
    // [{ '@value', '@language' }]. Dutch is preferred — that is the language
    // the collection is catalogued in.
    label(node) {
        if (!node) return null;
        const raw = node['rdfs:label'];
        if (typeof raw === 'string') return raw;

        const values = DMG.list(raw).filter(v => v && v['@value']);
        const dutch = values.find(v => v['@language'] === 'nl');
        return (dutch || values[0] || {})['@value'] || null;
    },

    // The curatorial text lives among the linguistic objects attached to the
    // record, identified by its type rather than its position.
    description(object) {
        const refs = DMG.list(object['crm:P67i_is_referred_to_by']);
        const match = refs.find(ref => DMG.label(ref['crm:P2_has_type']) === 'description');
        return DMG.label(match) || null;
    },

    // Vessels are far and away the bulk of this collection — porcelain, glass
    // and earthenware outnumber everything else — so a vessel silhouette is a
    // fair stand-in for most photo-less objects. Anything else gets the crate,
    // which reads as "not unpacked yet" rather than pretending to be a
    // specific thing.
    // ---- Rarity ------------------------------------------------------
    // The museum publishes an object count for every one of its 687 type
    // names, which is a rarity table sitting in plain sight. A `bord
    // (vaatwerk)` is one of 770; plenty of types have exactly one object.
    //
    // Rarest-type-wins, because that is the most specific thing the catalogue
    // says about an object: a `stapeldoos` that is also a `deksel` is
    // interesting for being a stacking box, not for having a lid.
    //
    // The thresholds were measured, not guessed, and then measured again. The
    // first set was derived from the count of a single type and turned out far
    // too generous once rarest-of-several was applied — objects carry 1.47
    // types on average, so taking the minimum drags everything rarer, and a
    // museum of sixteen was landing two Unicums. Sampled over 82 real draws,
    // these land a random object at roughly:
    //
    //   Unicum          2%    (about one museum in three)
    //   Zeer zeldzaam  11%
    //   Zeldzaam       15%
    //   Ongewoon       18%
    //   Gewoon         54%
    TIERS: [
        { key: 'unicum',   label: 'Unicum',        max: 1,        color: '#f5c451' },
        { key: 'zeer',     label: 'Zeer zeldzaam', max: 5,        color: '#d47ae8' },
        { key: 'zeldzaam', label: 'Zeldzaam',      max: 20,       color: '#5aa9e6' },
        { key: 'ongewoon', label: 'Ongewoon',      max: 80,       color: '#4cc46a' },
        { key: 'gewoon',   label: 'Gewoon',        max: Infinity, color: '#9a94a8' }
    ],

    typeCounts: null,

    // One request for the whole table. Fetched alongside the objects rather
    // than after them, so it costs no extra wall-clock.
    async loadTypeCounts() {
        try {
            const index = await DMG.json(DMG.BASE + '/types');
            const counts = new Map();

            DMG.list(index['hydra:member']).forEach(entry => {
                const label = entry['rdfs:label'];
                const count = entry.object_count;
                if (label && typeof count === 'number') counts.set(label.toLowerCase(), count);
            });

            DMG.typeCounts = counts;
            return counts.size;
        } catch (error) {
            // No table means no rarity shown, which is a missing ornament
            // rather than a broken game.
            console.warn('Museumdex: typeregister niet geladen —', error.message);
            DMG.typeCounts = null;
            return 0;
        }
    },

    rarityFor(types) {
        if (!DMG.typeCounts || !types || !types.length) return null;

        let count = Infinity;
        let rarestType = null;

        types.forEach(type => {
            const found = DMG.typeCounts.get(String(type).toLowerCase());
            if (found !== undefined && found < count) {
                count = found;
                rarestType = type;
            }
        });

        if (!Number.isFinite(count)) return null;

        const tier = DMG.TIERS.find(t => count <= t.max);
        return { count: count, type: rarestType, key: tier.key, label: tier.label, color: tier.color };
    },

    // ---- Categories, for when there is no photograph ----------------
    // The museum's image service goes down independently of the data API, and
    // when it does the catalogue text still arrives. So rather than dropping
    // those objects or showing a wall of identical crates, each one is drawn as
    // its broad category. Five buckets, chosen by running the museum's own type
    // index (687 type names, ~12,950 objects) through this classifier: they
    // cover 87% of the collection, and what is left over is mostly genuinely
    // unspecific — "fragment", "onderdeel", "staal (monster)" — where a crate
    // is the honest answer rather than a wrong guess.
    //
    // Matching is on word ENDINGS, not substrings, because Dutch compounds put
    // the category in the final element: a `champagneglas` is a glass, a
    // `bijzettafel` is a table, a `stapelstoel` is a chair. Suffix matching
    // also avoids the trap that plain `includes` falls into, where "kandelaar"
    // reads as a jug because "kan" sits inside it.
    //
    // Order matters — the first bucket to match wins, so the narrower
    // categories are listed before the broad ones.
    CATEGORIES: [
        // 'kant' is deliberately absent: as a suffix it swallows 'ledikant',
        // which is a bed. Lace shows up under its own compounds instead.
        ['textile', ['servet', 'weefsel', 'stof', 'stoffering', 'fluweel', 'laken',
                     'naaldkant', 'kloskant', 'kantwerk', 'tapijt', 'sjaal', 'doek',
                     'damast', 'brokaat', 'zijde', 'textiel', 'handdoek', 'vitrage',
                     'sprei', 'dekbed', 'stalenboek', 'borduurwerk', 'kussen', 'gordijn',
                     'tule', 'lint', 'garen', 'wol', 'katoen', 'japon', 'kleed',
                     'franje', 'passement', 'tressen', 'das']],
        ['tile',    ['tegel', 'haardsteen', 'paneel', 'sierelement', 'plaquette', 'lambrisering',
                     'baksteen', 'ornament', 'kader', 'tableau', 'fries', 'medaillon', 'reliëf']],
        ['furniture', ['stoel', 'zetel', 'fauteuil', 'tafel', 'kast', 'bank', 'bed', 'ledikant', 'wieg',
                       'buffet', 'commode', 'kabinet', 'rek', 'kruk', 'voetenbank', 'stoelsport',
                       'meubel', 'meubelbeslag', 'ladegreep', 'sleutelplaat', 'scharnier',
                       'tafelblad', 'spiegel', 'bureau', 'schab', 'poot', 'leuning', 'zitting',
                       'vitrine', 'ladeknop', 'sofa', 'divan', 'dressoir', 'kapstok', 'schraag',
                       'kist', 'sokkel', 'voetstuk', 'meubelonderdeel']],
        ['vessel',  ['vaas', 'vaatwerk', 'bord', 'schaal', 'schotel', 'kop', 'kom', 'pot', 'kan',
                     'kruik', 'fles', 'glas', 'beker', 'terrine', 'servies', 'deksel', 'karaf',
                     'bokaal', 'kelk', 'vloot', 'vat', 'dop', 'bus', 'kroes', 'mok', 'kuip',
                     'emmer', 'tuit', 'flacon', 'coupe', 'bonbonnière', 'onderzetter',
                     'servetring', 'inktstel', 'fleurs']],
        ['device',  ['verpakking', 'schrijfmachine', 'strijkijzer', 'wafelijzer', 'stofzuiger',
                     'lamp', 'armatuur', 'luchter', 'radio', 'telefoon', 'apparaat', 'machine',
                     'toestel', 'prototype', 'dummy', 'maquette', 'ontwerp', 'kaart', 'affiche',
                     'doos', 'dienblad', 'koffer', 'klok', 'horloge', 'ventilator', 'mixer',
                     'ketel', 'bestek', 'lepel', 'vork', 'mes', 'tang', 'schaar', 'pan', 'plaat',
                     'bak', 'logo', 'houder', 'beslag', 'sleutel', 'opener', 'weegschaal',
                     'legger', 'lampenkap', 'fototoestel', 'blad', 'rooster', 'pers', 'molen',
                     'zeef', 'trechter', 'schep', 'kurkentrekker', 'trekker', 'haardroger',
                     'magneet', 'etui', 'draagtas', 'kandelaar', 'deurknop', 'theelicht']]
    ],

    // Dutch diminutives hide the head noun: schoteltje is a schotel, kannetje a
    // kan, eierdopje a dop. Every applicable ending is tried rather than just
    // the first that fits — "eierdopje" ends in both "-pje" and "-je", and only
    // stripping "-je" leaves the "dop" that identifies it.
    DIMINUTIVES: ['etje', 'tje', 'pje', 'kje', 'je'],

    stemsOf(word) {
        const stems = [word];

        DMG.DIMINUTIVES.forEach(suffix => {
            if (!word.endsWith(suffix) || word.length <= suffix.length + 2) return;

            const base = word.slice(0, -suffix.length);
            stems.push(base);

            // Dutch doubles the consonant before the diminutive: kannetje.
            if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
                stems.push(base.slice(0, -1));
            }
        });
        return stems;
    },

    // Which drawn piece stands in for an object with no photograph, or null for
    // the crate when the type says nothing useful.
    fallbackArtFor(object) {
        const types = DMG.list(object['crm:P2_has_type']).map(DMG.label).filter(Boolean);
        const words = types.join(' ').toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);

        for (const [category, keywords] of DMG.CATEGORIES) {
            for (const word of words) {
                for (const stem of DMG.stemsOf(word)) {
                    if (keywords.some(keyword => keyword.length >= 3 && stem.endsWith(keyword))) {
                        return category;
                    }
                }
            }
        }
        return null;
    },

    // Rewrite a IIIF Image API url to a different width. The size segment is
    // third from the end: .../full/{size}/{rotation}/default.jpg
    iiifWidth(url, width) {
        if (!url) return null;
        const parts = url.split('/');
        if (parts.length < 4) return url;
        parts[parts.length - 3] = width + ',';
        return parts.join('/');
    },

    // One API record, flattened into what the game actually reads.
    normalise(object) {
        const image = object.image || DMG.list(object['crm:P138i_has_representation'])[0] || null;
        const source = image ? (image.thumbnail || image['@id']) : null;
        const production = DMG.list(object['crm:P108i_was_produced_by'])[0] || null;
        const acquisition = object['crm:P24i_changed_ownership_through'] || null;

        const dimensions = DMG.list(object['crm:P43_has_dimension'])
            .map(dimension => ({
                axis: DMG.label(dimension['crm:P2_has_type']),
                value: dimension['crm:P90_has_value'],
                unit: DMG.label(dimension['crm:P91_has_unit'])
            }))
            .filter(dimension => dimension.axis && dimension.value !== undefined);

        return {
            pid: String(object['@id'] || '').split('/').pop(),
            name: DMG.label(object),
            description: DMG.description(object),
            // Which drawn piece stands in when there is no photograph. The
            // museum's image service goes down independently of the data API,
            // and when it does the catalogue text still arrives — so an
            // exhibit without a photo is still a real exhibit.
            art: DMG.fallbackArtFor(object),
            // Kept for the end-of-run gallery and the export, never for the
            // plinths. The museum's photograph is only shown at a size where it
            // is worth looking at; on a 20px plinth it survived as a smudge, and
            // downloading sixteen of them delayed every boot for that.
            photo: source,
            manifest: (object['crm:P129i_is_subject_of'] || {})['@id'] || null,
            credit: image ? (image['crm:P3_has_note'] || null) : null,
            types: DMG.list(object['crm:P2_has_type']).map(DMG.label).filter(Boolean),
            materials: DMG.list(object['crm:P45_consists_of']).map(DMG.label).filter(Boolean),
            maker: production ? DMG.label(production['crm:P14_carried_out_by']) : null,
            place: production ? DMG.label(production['crm:P7_took_place_at']) : null,
            techniques: production
                ? DMG.list(production['crm:P32_used_general_technique']).map(DMG.label).filter(Boolean)
                : [],
            acquired: acquisition ? DMG.label(acquisition['crm:P4_has_time-span']) : null,
            acquiredHow: acquisition ? DMG.label(acquisition['crm:P2_has_type']) : null,
            dimensions: dimensions,
            url: object['@id'] || null
        };
    },

    // One uniformly random object, complete. fullRecord=true is the whole
    // reason this is a single request: without it the listing returns a label
    // and a manifest id, and every exhibit costs a second fetch for its
    // description. With it, one page of one item is one finished record.
    async randomFullRecord() {
        const page = 1 + Math.floor(Math.random() * DMG.TOTAL_OBJECTS);
        const listing = await DMG.json(
            DMG.BASE + '/objects?fullRecord=true&itemsPerPage=1&page=' + page
        );
        return DMG.list(listing['hydra:member'])[0] || null;
    },

    // Catalogue numbers of the form 1998-0024_044-755 are the 44th of 755
    // fragments of one album. Two of those side by side is a dull museum, so
    // exhibits are kept to one per set.
    setOf(pid) {
        return String(pid).split('_')[0];
    },

    // A third of the collection is components of a parent record — a single
    // chair's four loose sports, a service's every saucer. They make thin
    // exhibits, so they lose to a whole object whenever there is one to spare.
    isComponent(object) {
        return !!object['crm:P46i_forms_part_of'];
    },

    // A different museum every launch. Each exhibit is drawn independently
    // rather than off one page: consecutive catalogue numbers are usually
    // variants of the same object, so a single page would hand back four views
    // of the same album.
    async randomExhibits(count, onProgress) {
        const report = onProgress || (() => {});

        // Over-sampled, because a record can turn out to have no description,
        // to duplicate a set already drawn, or to be a component.
        const wanted = count * 2;
        let drawn = 0;

        const draws = await DMG.pool(
            Array.from({ length: wanted }, () => () => DMG.randomFullRecord().finally(() => {
                drawn++;
                report(drawn / wanted, 'Objecten kiezen uit de collectie\u2026');
            }))
        );

        const whole = [];
        const parts = [];
        const seenSets = new Set();

        draws.forEach(object => {
            if (!object) return;

            const record = DMG.normalise(object);
            if (!record.name || !record.description) return;

            const set = DMG.setOf(record.pid);
            if (seenSets.has(set)) return;
            seenSets.add(set);

            (DMG.isComponent(object) ? parts : whole).push(record);
        });

        // Whole objects first, components only to fill the remaining plinths.
        return whole.concat(parts).slice(0, count);
    }
};

// ------------------------------------------
// The exhibits in play
// ------------------------------------------
// The key is exhibit_<tile value>, so the number on the map is what places a
// piece. MuseumAPI is filled by installExhibits() during boot — from the
// museum if it answers, from FALLBACK_EXHIBITS if it does not.

const MuseumAPI = {};

// Enough of a museum to play with no network. These four keep their hand-drawn
// art; anything arriving from the API is rendered from its own photograph.
const FALLBACK_EXHIBITS = [
    {
        name: "Schedel van een T-rex",
        description: "Een massieve gefossiliseerde schedel uit het late Krijt. In de kaak stonden zestig gezaagde tanden, sommige zo lang als een mensenhand.",
        art: 'skull'
    },
    {
        name: "Romeinse vaas",
        description: "Een aardewerken kruik waarin olijfolie de Middellandse Zee overstak. Het stempel van de maker staat nog op het handvat.",
        art: 'vase'
    },
    {
        name: "Dodenmasker van een farao",
        description: "Een dodenmasker, geslagen uit \u00e9\u00e9n blad goud. De ogen zijn ingelegd met obsidiaan, de strepen van de hoofdtooi met gemalen lapis lazuli.",
        art: 'mask'
    },
    {
        name: "Astrolabium in messing",
        description: "Een instrument om de hoogte van de sterren te lezen. Zeevaarders vonden er hun breedtegraad mee, lang voor het kompas Europa bereikte.",
        art: 'astrolabe'
    }
];

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

// ==========================================
// 2. PROCEDURAL ART
// ==========================================

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
// photograph turns up after the museum has already opened.
function pixelPainter(ctx) {
    return (x, y, w, h, color, alpha) => {
        ctx.globalAlpha = (alpha === undefined) ? 1 : alpha;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
    };
}

function makeTexture(scene, key, width, height, draw) {
    if (scene.textures.exists(key)) return scene.textures.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    draw(pixelPainter(ctx), ctx);
    return scene.textures.addCanvas(key, canvas);
}

// --- Floor: two marble tones, laid in a checkerboard by the map builder ---
function makeFloorTexture(scene, key, base) {
    makeTexture(scene, key, 32, 32, (px) => {
        px(0, 0, 32, 32, base);
        // Grout lines along two edges so tiles read as separate slabs.
        px(0, 0, 32, 1, PALETTE.marbleLn);
        px(0, 0, 1, 32, PALETTE.marbleLn);
        // A few fixed "veins" — deterministic, so the floor never shimmers.
        px(6, 9, 7, 1, PALETTE.marbleLn, 0.45);
        px(12, 10, 4, 1, PALETTE.marbleLn, 0.3);
        px(20, 22, 6, 1, PALETTE.marbleLn, 0.35);
        px(24, 6, 3, 1, PALETTE.marbleLn, 0.25);
    });
}

// --- Wall: flat panel with a lit top edge for a touch of depth ---
function makeWallTexture(scene) {
    makeTexture(scene, 'wall', 32, 32, (px) => {
        px(0, 0, 32, 32, PALETTE.wall);
        px(0, 0, 32, 5, PALETTE.wallTop);       // lit cap
        px(0, 5, 32, 2, PALETTE.wallLow);       // shadow under the cap
        px(0, 26, 32, 6, PALETTE.wallLow);      // skirting board
        px(0, 26, 32, 1, PALETTE.wallTop, 0.4);
        px(5, 11, 1, 13, PALETTE.wallLow, 0.5); // faint panel seams
        px(26, 11, 1, 13, PALETTE.wallLow, 0.5);
    });
}

// Shared plinth that both exhibits stand on.
function drawPedestal(px) {
    px(4, 29, 24, 3, '#000000', 0.25);              // ground shadow
    px(6, 22, 20, 8, PALETTE.stone);                // body
    px(5, 20, 22, 3, PALETTE.stoneTop);             // top face
    px(6, 28, 20, 2, PALETTE.stoneLow);             // base shadow
    px(6, 22, 1, 8, PALETTE.stoneTop, 0.5);         // left highlight
}

// A pale diagonal streak sold as glare on a glass display case.
function drawCaseGlare(px) {
    px(8, 3, 3, 18, '#ffffff', 0.14);
    px(12, 3, 1, 18, '#ffffff', 0.10);
}

// --- The exhibits themselves ---
// Each function draws only the item; the plinth and the case glare are added
// around it by makeExhibitTextures().

function drawSkull(px) {
        // Side profile, snout to the left: tall braincase tapering to a jaw.
        px(16, 4, 9, 11, PALETTE.bone);       // braincase
        px(11, 7, 6, 8, PALETTE.bone);        // cheek
        px(5, 9, 7, 6, PALETTE.bone);         // snout
        px(5, 14, 20, 2, PALETTE.bone);       // upper jaw
        px(21, 14, 3, 5, PALETTE.boneDark);   // jaw hinge
        px(6, 17, 16, 2, PALETTE.boneDark);   // lower jaw
        px(17, 7, 4, 4, PALETTE.ink);         // eye socket
        px(18, 8, 2, 2, PALETTE.boneDark, 0.45);
        px(7, 10, 2, 2, PALETTE.ink);         // nostril
        for (let t = 6; t < 21; t += 3) px(t, 16, 1, 2, PALETTE.bone);  // teeth
        px(16, 4, 9, 1, '#ffffff', 0.4);      // top highlight
        px(5, 9, 1, 6, PALETTE.boneDark);     // snout tip shading
}

function drawVase(px) {
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

// --- Egyptian funerary mask: nemes headdress over a gold face ---
function drawMask(px) {
        px(7, 3, 18, 13, PALETTE.maskGold);        // headdress
        px(7, 5, 18, 1, PALETTE.lapis);            // stripes
        px(7, 8, 18, 1, PALETTE.lapis);
        px(7, 11, 18, 1, PALETTE.lapis);
        px(6, 9, 3, 8, PALETTE.maskGold);          // lappets down each side
        px(23, 9, 3, 8, PALETTE.maskGold);
        px(6, 12, 3, 1, PALETTE.lapis);
        px(23, 12, 3, 1, PALETTE.lapis);

        px(11, 7, 10, 9, PALETTE.maskGold);        // face
        px(11, 15, 10, 1, PALETTE.maskGoldD);
        px(12, 9, 3, 1, PALETTE.lapisDark);        // painted brows
        px(17, 9, 3, 1, PALETTE.lapisDark);
        px(12, 10, 3, 2, PALETTE.obsidian);        // inlaid eyes
        px(17, 10, 3, 2, PALETTE.obsidian);
        px(15, 12, 2, 2, PALETTE.maskGoldD);       // nose
        px(14, 14, 4, 1, PALETTE.maskGoldD);       // mouth
        px(14, 16, 4, 3, PALETTE.lapis);           // plaited beard
        px(7, 3, 18, 1, '#ffffff', 0.35);
}

// --- Brass astrolabe: a ring on a stand, crossed by its rule ---
function drawAstrolabe(px) {
        const cx = 16, cy = 11, R = 7;

        // Ring, two pixels thick, walked row by row.
        for (let dy = -R; dy <= R; dy++) {
            const halfWidth = Math.round(Math.sqrt(R * R - dy * dy));
            px(cx - halfWidth, cy + dy, 2, 1, PALETTE.brass);
            px(cx + halfWidth - 1, cy + dy, 2, 1, PALETTE.brass);
        }
        px(cx - 3, cy - R, 6, 1, PALETTE.brass);   // close the top
        px(cx - 3, cy + R, 6, 1, PALETTE.brass);   // and the bottom

        px(cx - 6, cy, 12, 1, PALETTE.brassDark);  // the rule
        px(cx, cy - 6, 1, 12, PALETTE.brassDark);
        px(cx - 2, cy - 2, 4, 4, PALETTE.brass);   // central boss
        px(cx - 1, cy - 1, 2, 2, PALETTE.brassDark);

        px(cx - 1, 1, 2, 3, PALETTE.brass);        // suspension ring
        px(cx - 1, cy + R, 2, 3, PALETTE.brassDark);  // stand
        px(12, cy + R + 2, 8, 1, PALETTE.brassDark);
        px(cx - 5, cy - 5, 1, 1, '#ffffff', 0.5);
}

// --- Category stand-ins, for objects that arrived without a photograph ---
// One piece per broad category from DMG.CATEGORIES. Between them they cover
// about 87% of the collection, so an image-service outage leaves a museum of
// roughly the right shapes rather than a room of identical crates.

// A side chair: two back posts, two slats, a seat, four legs.
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
// museum's 540 of them are painted.
function drawTile(px) {
    px(9, 5, 14, 14, PALETTE.ceramicDk);     // edge
    px(10, 6, 12, 12, PALETTE.ceramic);      // glazed face
    px(11, 7, 2, 2, PALETTE.cobalt);         // corner motifs
    px(19, 7, 2, 2, PALETTE.cobalt);
    px(11, 15, 2, 2, PALETTE.cobalt);
    px(19, 15, 2, 2, PALETTE.cobalt);
    px(15, 10, 2, 4, PALETTE.cobalt);        // centre rosette
    px(14, 11, 4, 2, PALETTE.cobalt);
    px(15, 9, 2, 1, PALETTE.cobaltDk);
    px(15, 14, 2, 1, PALETTE.cobaltDk);
    px(10, 6, 12, 1, '#ffffff', 0.4);        // glaze sheen
    px(9, 19, 14, 1, PALETTE.stoneLow);      // where it meets the plinth
}

// A bolt of cloth hung to display the weave, with a scalloped hem.
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
// the collection.
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

// The drawn pieces, keyed by the `art` name a fallback exhibit asks for.
const PROCEDURAL_ART = {
    // The offline demo pieces ask for these by name.
    skull: drawSkull,
    vase: drawVase,
    mask: drawMask,
    astrolabe: drawAstrolabe,

    // The category stand-ins, keyed by the names DMG.CATEGORIES hands out.
    // 'vessel' shares the vase, which is what a vessel category should look
    // like anyway.
    vessel: drawVase,
    furniture: drawFurniture,
    tile: drawTile,
    textile: drawTextile,
    device: drawDevice
};

// Shown when an object has no photograph and its type says nothing about its
// shape — 'fragment', 'onderdeel', 'staal (monster)' and the like, about 4% of
// the collection. A dust sheet is the honest answer: it is a real thing to see
// in a museum, and unlike a category stand-in it makes no claim about what is
// underneath.
// The silhouette, one horizontal span per row from the top down. Written out
// rather than computed because the whole point is that it is irregular: the
// cloth is pulled over something with a corner on the right, so that side goes
// square while the left falls away in a soft curve. A symmetrical dome reads as
// a shrouded figure, which is the wrong idea entirely.
const DRAPE_ROWS = [
    [14, 5], [13, 7], [13, 8], [12, 10], [12, 11], [11, 13], [11, 14], [10, 15],
    [10, 15], [9, 16], [9, 16], [9, 16], [8, 17], [8, 17], [8, 17], [8, 17]
];
const DRAPE_TOP = 4;

// Which hem pixels drop a row. Deliberately not periodic — an even zigzag
// reads as teeth rather than as fabric.
const DRAPE_HEM = [0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1];

function drawUnknownExhibit(px) {
    // The body, then the lit near edge, then the shaded far side.
    DRAPE_ROWS.forEach(([x, w], i) => px(x, DRAPE_TOP + i, w, 1, PALETTE.sheet));
    DRAPE_ROWS.forEach(([x], i) => px(x, DRAPE_TOP + i, 2, 1, PALETTE.sheetLt));
    DRAPE_ROWS.forEach(([x, w], i) => {
        px(x + w - 3, DRAPE_TOP + i, 3, 1, PALETTE.sheetDk);
        px(x + w - 1, DRAPE_TOP + i, 1, 1, PALETTE.sheetSh);
    });

    // The hard edge of whatever is underneath, showing through on the right.
    for (let i = 6; i < 10; i++) {
        const [x, w] = DRAPE_ROWS[i];
        px(x + w - 4, DRAPE_TOP + i, 1, 1, PALETTE.sheetSh, 0.7);
    }

    // Folds fanning out from under the peak, drifting wider as they fall.
    DRAPE_ROWS.forEach(([x, w], i) => {
        if (i < 2) return;
        const y = DRAPE_TOP + i;
        px(x + 3 + Math.floor(i / 5), y, 1, 1, PALETTE.sheetDk, 0.45);
        if (w > 10) px(x + w - 6 - Math.floor(i / 6), y, 1, 1, PALETTE.sheetDk, 0.3);
        if (w > 13 && i > 6) px(x + Math.floor(w / 2) + 1, y, 1, 1, PALETTE.sheetDk, 0.2);
    });

    const [baseX, baseW] = DRAPE_ROWS[DRAPE_ROWS.length - 1];
    const hemY = DRAPE_TOP + DRAPE_ROWS.length;

    for (let k = 0; k < baseW; k++) {
        px(baseX + k, hemY - 1 + DRAPE_HEM[k % DRAPE_HEM.length], 1, 1, PALETTE.sheetSh);
    }
    px(baseX, hemY, baseW, 1, '#000000', 0.12);

    // Two legs showing beneath the hem. Without them the sheet reads as a shape
    // in its own right rather than as a cover over an object.
    px(baseX + 3, hemY, 2, 2, PALETTE.woodDark);
    px(baseX + baseW - 5, hemY, 2, 2, PALETTE.woodDark);

    px(6, 21, 20, 1, '#000000', 0.16);   // contact shadow on the plinth top
}

// One texture per exhibit in play. A piece with a photograph loaded is
// rendered from it; the offline fallbacks fall back to their drawn art.
function makeExhibitTextures(scene) {
    Object.keys(MuseumAPI).forEach(id => {
        const record = MuseumAPI[id];

        makeTexture(scene, 'exhibit-' + tileValueFor(id), 32, 32, (px) => {
            drawPedestal(px);

            if (PROCEDURAL_ART[record.art]) {
                PROCEDURAL_ART[record.art](px);
            } else {
                drawUnknownExhibit(px);
            }

            drawCaseGlare(px);
        });
    });
}

// --- Player: a 4x4 spritesheet drawn frame by frame ---
// Rows are down / left / right / up; within each row the frames are
// stand, step-A, stand, step-B — the classic 4-frame RPG walk cycle.
function makePlayerTexture(scene) {
    const texture = makeTexture(scene, 'playerSprite', 128, 128, (px) => {
        const DIRS = ['down', 'left', 'right', 'up'];
        for (let row = 0; row < 4; row++) {
            for (let step = 0; step < 4; step++) {
                drawPlayerFrame(px, step * 32, row * 32, DIRS[row], step);
            }
        }
    });

    // Register the 16 frames so generateFrameNumbers() can find them.
    for (let i = 0; i < 16; i++) {
        texture.add(i, 0, (i % 4) * 32, Math.floor(i / 4) * 32, 32, 32);
    }
    return texture;
}

function drawPlayerFrame(pxRaw, ox, oy, dir, step) {
    // Offset every draw call into this frame's cell of the sheet.
    const px = (x, y, w, h, c, a) => pxRaw(ox + x, oy + y, w, h, c, a);

    const stepping = (step === 1 || step === 3);
    const bob = stepping ? 1 : 0;          // body lifts a pixel mid-stride
    const legL = (step === 1) ? 6 : (step === 3 ? 4 : 5);
    const legR = (step === 1) ? 4 : (step === 3 ? 6 : 5);
    const side = (dir === 'left' || dir === 'right');

    px(10, 29, 12, 2, '#000000', 0.22);    // ground shadow (stays put)

    // Legs
    const lx = side ? 13 : 12;
    const rx = side ? 16 : 17;
    px(lx, 23 - bob, 3, legL, PALETTE.pants);
    px(rx, 23 - bob, 3, legR, PALETTE.pants);
    px(lx, 23 - bob + legL - 2, 3, 2, PALETTE.shoe);
    px(rx, 23 - bob + legR - 2, 3, 2, PALETTE.shoe);

    // Torso
    const bx = side ? 11 : 10;
    const bw = side ? 10 : 12;
    px(bx, 16 - bob, bw, 8, PALETTE.shirt);
    px(bx, 22 - bob, bw, 2, PALETTE.shirtDk);

    // Arms — swing forward/back with the stride
    const swing = (step === 1) ? 1 : (step === 3 ? -1 : 0);
    px(bx - 2, 17 - bob + swing, 2, 5, PALETTE.shirt);
    px(bx + bw, 17 - bob - swing, 2, 5, PALETTE.shirt);
    px(bx - 2, 22 - bob + swing, 2, 2, PALETTE.skin);
    px(bx + bw, 22 - bob - swing, 2, 2, PALETTE.skin);

    // Head
    px(10, 7 - bob, 12, 10, PALETTE.skin);
    px(10, 15 - bob, 12, 2, PALETTE.skinDark);

    // Cap — the brim points wherever the character is facing
    px(9, 4 - bob, 14, 4, PALETTE.cap);
    px(9, 7 - bob, 14, 1, PALETTE.capDark);
    if (dir === 'down')  px(9, 8 - bob, 14, 2, PALETTE.capDark);
    if (dir === 'left')  px(6, 6 - bob, 4, 2, PALETTE.capDark);
    if (dir === 'right') px(22, 6 - bob, 4, 2, PALETTE.capDark);
    if (dir === 'up')    px(9, 4 - bob, 14, 7, PALETTE.capDark); // back of the cap

    // Face — hidden entirely when walking away from the camera
    if (dir === 'down') {
        px(13, 11 - bob, 2, 2, PALETTE.ink);
        px(18, 11 - bob, 2, 2, PALETTE.ink);
    } else if (dir === 'left') {
        px(12, 11 - bob, 2, 2, PALETTE.ink);
    } else if (dir === 'right') {
        px(19, 11 - bob, 2, 2, PALETTE.ink);
    }
}

// --- MARLOT: the museum's communications team, camera already raised ---
// She reads as staff rather than as a monster: lanyard, blazer, and a camera
// held up to her eye. The threat is the shutter, so the camera is the thing
// the sprite puts front and centre.
function makeMarlotTexture(scene) {
    makeTexture(scene, 'marlot', 32, 32, (px) => {
        // Legs and shoes.
        px(12, 24, 3, 6, PALETTE.pants);
        px(17, 24, 3, 6, PALETTE.pants);
        px(11, 29, 4, 2, PALETTE.shoe);
        px(17, 29, 4, 2, PALETTE.shoe);

        // Blazer over a bright top — museum-staff smart.
        px(10, 14, 12, 11, PALETTE.blazer);
        px(14, 15, 4, 9, PALETTE.press);
        px(10, 14, 12, 1, PALETTE.blazerLt);
        px(9, 24, 14, 1, PALETTE.blazerDk);

        // Lanyard: two straps meeting at a badge on the chest.
        px(13, 14, 1, 4, PALETTE.lanyard);
        px(18, 14, 1, 4, PALETTE.lanyard);
        px(14, 18, 4, 3, PALETTE.badge);
        px(15, 19, 2, 1, PALETTE.ink, 0.5);

        // Hair: a short bob, tucked behind the ears.
        px(10, 3, 12, 8, PALETTE.hairPr);
        px(9, 5, 2, 7, PALETTE.hairPr);
        px(21, 5, 2, 7, PALETTE.hairPr);
        px(10, 3, 12, 1, PALETTE.hairPrLt);

        // Face, mostly hidden behind the viewfinder.
        px(12, 8, 8, 7, PALETTE.skin);
        px(12, 14, 8, 1, PALETTE.skinDark);
        px(14, 13, 4, 1, '#b4635a');        // a working smile

        // Arms come forward to hold the camera up.
        px(7, 15, 3, 5, PALETTE.blazer);
        px(22, 15, 3, 5, PALETTE.blazer);
        px(8, 12, 3, 4, PALETTE.skin);
        px(21, 12, 3, 4, PALETTE.skin);

        // The camera itself, across her eyes.
        px(10, 8, 12, 6, PALETTE.camera);
        px(10, 8, 12, 1, PALETTE.cameraLt);
        px(10, 13, 12, 1, PALETTE.cameraDk);
        px(13, 6, 5, 2, PALETTE.cameraDk);   // prism hump
        px(19, 9, 3, 2, PALETTE.flash);      // hotshoe flash
        px(19, 9, 3, 1, '#ffffff', 0.6);

        // Lens barrel, pointed straight at the player.
        px(13, 9, 6, 6, PALETTE.cameraDk);
        px(14, 10, 4, 4, PALETTE.lens);
        px(15, 11, 2, 2, PALETTE.lensLt);
        px(15, 11, 1, 1, '#ffffff', 0.85);   // glint on the glass
    });
}

// The doorway between rooms: an open arch with a warm spill of light.
function makeDoorTexture(scene) {
    makeTexture(scene, 'door', 32, 32, (px) => {
        px(4, 2, 24, 30, PALETTE.doorDark);
        px(6, 4, 20, 28, PALETTE.doorWarm);
        px(8, 7, 16, 25, PALETTE.doorGlow, 0.55);
        px(6, 4, 20, 1, PALETTE.doorLt);
        px(6, 4, 1, 28, PALETTE.doorLt, 0.6);
        px(25, 4, 1, 28, PALETTE.doorDark);
        // A threshold strip, so the tile still reads as walkable floor.
        px(4, 29, 24, 3, PALETTE.stoneTop);
        px(4, 31, 24, 1, PALETTE.stoneLow);
    });
}

// The autofocus frame that shows you where she is about to line up a shot —
// the same corner brackets a camera puts over its subject.
function makeWarnTexture(scene) {
    makeTexture(scene, 'warn', 32, 32, (px) => {
        px(2, 2, 28, 28, PALETTE.warn, 0.12);
        px(2, 2, 9, 3, PALETTE.warn);    px(2, 2, 3, 9, PALETTE.warn);
        px(21, 2, 9, 3, PALETTE.warn);   px(27, 2, 3, 9, PALETTE.warn);
        px(2, 27, 9, 3, PALETTE.warn);   px(2, 21, 3, 9, PALETTE.warn);
        px(21, 27, 9, 3, PALETTE.warn);  px(27, 21, 3, 9, PALETTE.warn);
        // Centre crosshair, to sell it as a viewfinder rather than a hazard.
        px(15, 13, 2, 6, PALETTE.warn, 0.5);
        px(13, 15, 6, 2, PALETTE.warn, 0.5);
    });
}

// --- Small UI bits drawn as textures ---
function makeMarkerTextures(scene) {
    // Downward chevron that hovers over an exhibit you can interact with.
    makeTexture(scene, 'hint', 14, 12, (px) => {
        px(1, 0, 12, 2, PALETTE.goldDark);
        px(2, 2, 10, 2, PALETTE.gold);
        px(3, 4, 8, 2, PALETTE.gold);
        px(4, 6, 6, 2, PALETTE.gold);
        px(5, 8, 4, 2, PALETTE.goldDark);
        px(6, 10, 2, 2, PALETTE.goldDark);
    });

    // A small gem that sits over the rarest plinths, so a Unicum is worth
    // walking to before MARLOT gets her shot. Drawn twice, in two tints.
    [['gem-unicum', PALETTE.gold, PALETTE.goldDark],
     ['gem-zeer', '#d47ae8', '#8e3ea8']].forEach(([key, bright, dark]) => {
        makeTexture(scene, key, 10, 12, (px) => {
            px(4, 0, 2, 2, bright);
            px(2, 2, 6, 2, bright);
            px(1, 4, 8, 3, bright);
            px(2, 7, 6, 2, dark);
            px(3, 9, 4, 2, dark);
            px(4, 11, 2, 1, dark);
            px(3, 3, 2, 2, '#ffffff', 0.7);
        });
    });

    // Tick badge stamped on exhibits already in the Museumdex.
    makeTexture(scene, 'check', 12, 12, (px) => {
        px(2, 1, 8, 10, PALETTE.green);
        px(1, 2, 10, 8, PALETTE.green);
        px(3, 5, 2, 2, '#ffffff');
        px(5, 7, 2, 2, '#ffffff');
        px(7, 4, 2, 2, '#ffffff');
        px(9, 2, 2, 2, '#ffffff');
    });
}

// ==========================================
// 3. MARLOT
//
// She works in the museum's communications team. She is not hunting you to
// hurt you — she wants
// you in the campaign: a candid visitor shot for the website, the posters, the
// socials. You came to look at the collection quietly, so being photographed
// is the thing you lose to.
//
// Mechanically she is not an NPC that walks around, but a four-state cycle:
//
//   HIDDEN -> TELEGRAPH -> SOLID -> FADING -> HIDDEN
//   (gone)   (lining up     (SHUTTER  (lowering
//             the shot)      FIRES)    the camera)
//
// Only SOLID catches you. TELEGRAPH puts an autofocus frame on the tile she is
// about to shoot from, so every photo is one you could see coming. Difficulty
// is mostly a question of how long that warning lasts.
// ==========================================

const PHASE = { HIDDEN: 'hidden', TELEGRAPH: 'telegraph', SOLID: 'solid', FADING: 'fading' };

// How long the automatic difficulty ramp takes to reach maximum threat.
const RAMP_MS = 90000;

function lerp(a, b, t) { return a + (b - a) * t; }

// The entire tuning surface, in one place. threat runs 0..1.
function difficultyFor(threat) {
    const t = Phaser.Math.Clamp(threat, 0, 1);
    return {
        hiddenMs:    lerp(6000, 1400, t),   // gap between appearances
        telegraphMs: lerp(1200,  260, t),   // your reaction window
        solidMs:     lerp( 800, 2000, t),   // how long she stays lethal
        fadeMs:      320,
        minDistance: Math.max(1, Math.round(lerp(6, 1, t))),  // how close she may appear
        count:       t > 0.75 ? 3 : (t > 0.4 ? 2 : 1),
        chases:      t > 0.85,              // late game: she takes steps toward you
        chaseMs:     lerp(700, 380, t)
    };
}

class Marlot {
    constructor(scene, index) {
        this.scene = scene;
        this.index = index;
        this.phase = PHASE.HIDDEN;
        this.elapsed = 0;
        this.chaseTimer = 0;
        this.gridX = -1;
        this.gridY = -1;

        // Staggered start so several of them never pulse in lockstep.
        this.wait = 3000 + index * 1200;

        this.marker = scene.add.image(0, 0, 'warn').setDepth(4).setVisible(false);
        this.sprite = scene.add.image(0, 0, 'marlot').setDepth(9).setVisible(false);
    }

    get isLethal()  { return this.phase === PHASE.SOLID; }
    get isPresent() { return this.phase !== PHASE.HIDDEN; }

    enter(phase) {
        this.phase = phase;
        this.elapsed = 0;
    }

    // Called when the difficulty drops and this one is no longer in play.
    retire() {
        this.phase = PHASE.HIDDEN;
        this.elapsed = 0;
        this.wait = 2000;
        this.gridX = this.gridY = -1;
        this.sprite.setVisible(false);
        this.marker.setVisible(false);
    }

    // Driven by an accumulated delta rather than Phaser timers, so that
    // freezing her while the UI is open is simply "don't call this".
    update(delta, cfg) {
        this.elapsed += delta;

        switch (this.phase) {
            case PHASE.HIDDEN:
                if (this.elapsed >= this.wait) this.materialise(cfg);
                return;

            case PHASE.TELEGRAPH: {
                const p = Math.min(this.elapsed / cfg.telegraphMs, 1);
                this.sprite.setAlpha(0.15 + 0.45 * p).setScale(0.7 + 0.3 * p);
                this.marker.setAlpha(0.3 + 0.5 * Math.abs(Math.sin(this.elapsed / 90)));
                if (p >= 1) this.enter(PHASE.SOLID);
                return;
            }

            case PHASE.SOLID:
                this.sprite.setAlpha(1).setScale(1);
                this.marker.setAlpha(0.75);
                if (cfg.chases) {
                    this.chaseTimer += delta;
                    if (this.chaseTimer >= cfg.chaseMs) {
                        this.chaseTimer = 0;
                        this.stepTowardPlayer();
                    }
                }
                if (this.elapsed >= cfg.solidMs) this.enter(PHASE.FADING);
                return;

            case PHASE.FADING: {
                const p = Math.min(this.elapsed / cfg.fadeMs, 1);
                this.sprite.setAlpha(0.9 * (1 - p));
                this.marker.setAlpha(0.7 * (1 - p));
                if (p >= 1) {
                    this.phase = PHASE.HIDDEN;
                    this.elapsed = 0;
                    this.chaseTimer = 0;
                    this.wait = cfg.hiddenMs * Phaser.Math.FloatBetween(0.75, 1.25);
                    this.gridX = this.gridY = -1;
                    this.sprite.setVisible(false);
                    this.marker.setVisible(false);
                }
                return;
            }
        }
    }

    materialise(cfg) {
        const tile = this.scene.pickSpawnTile(cfg, this);

        // No fair tile available right now — wait a beat and try again
        // rather than forcing an unavoidable spawn.
        if (!tile) {
            this.elapsed = 0;
            this.wait = 400;
            return;
        }

        this.placeAt(tile.x, tile.y);
        this.enter(PHASE.TELEGRAPH);
        this.sprite.setVisible(true).setAlpha(0.15).setScale(0.7);
        this.marker.setVisible(true).setAlpha(0.4);
    }

    placeAt(x, y) {
        this.gridX = x;
        this.gridY = y;
        const ts = this.scene.tileSize;
        const cx = x * ts + ts / 2;
        const cy = y * ts + ts / 2;
        this.sprite.setPosition(cx, cy);
        this.marker.setPosition(cx, cy);
    }

    // Late-game pursuit: she stops waiting for you to wander into frame and
    // starts repositioning, one tile at a time, favouring the longer axis so
    // she closes in cleanly instead of jittering on the diagonal.
    stepTowardPlayer() {
        const s = this.scene;
        const dx = Math.sign(s.playerGridX - this.gridX);
        const dy = Math.sign(s.playerGridY - this.gridY);
        const horizontalFirst =
            Math.abs(s.playerGridX - this.gridX) >= Math.abs(s.playerGridY - this.gridY);
        const options = horizontalFirst ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];

        for (const [ox, oy] of options) {
            if (ox === 0 && oy === 0) continue;
            const nx = this.gridX + ox;
            const ny = this.gridY + oy;
            if (!s.isWalkable(nx, ny)) continue;
            if (s.tileHasMarlot(nx, ny, this)) continue;
            this.placeAt(nx, ny);
            return;
        }
    }
}

// ==========================================
// 4. THE MUSEUM FLOOR PLAN
// ==========================================

// Rooms are authored as text, one character per tile — a grid of numbers stops
// being readable once there are four of them:
//
//   #  wall            .  floor
//   E  plinth          1-9  a doorway, keyed to this room's `exits`
//
// Every plinth needs a walkable tile directly below it, which is where the
// player stands to inspect it. Every doorway sits in a boundary wall and is
// walkable — stepping onto one carries you into the next room.

const ROOMS = [
    {
        key: 'inkomhal',
        name: 'Inkomhal',
        rows: [
            '###############',
            '#.............#',
            '#...E.....E...#',
            '#.............#',
            '#......#......1',
            '#.............#',
            '#...E.....E...#',
            '#.............#',
            '#.............#',
            '######2########'
        ],
        exits: {
            1: { to: 'keramiek', at: [1, 4] },
            2: { to: 'meubels',  at: [6, 1] }
        }
    },
    {
        key: 'keramiek',
        name: 'Keramiekzaal',
        rows: [
            '###############',
            '#....E...E....#',
            '#.............#',
            '#.....###.....#',
            '1.............#',
            '#.............#',
            '#....E...E....#',
            '#.............#',
            '#.............#',
            '########2######'
        ],
        exits: {
            1: { to: 'inkomhal', at: [13, 4] },
            2: { to: 'design',   at: [8, 1] }
        }
    },
    {
        key: 'meubels',
        name: 'Meubelzaal',
        rows: [
            '######1########',
            '#.............#',
            '#..E.......E..#',
            '#.............#',
            '#.###.....###.2',
            '#.............#',
            '#..E.......E..#',
            '#.............#',
            '#.............#',
            '###############'
        ],
        exits: {
            1: { to: 'inkomhal', at: [6, 8] },
            2: { to: 'design',   at: [1, 4] }
        }
    },
    {
        key: 'design',
        name: 'Designzaal',
        rows: [
            '########1######',
            '#.............#',
            '#...E.....E...#',
            '#.............#',
            '2......#......#',
            '#.............#',
            '#...E.....E...#',
            '#.............#',
            '#.............#',
            '###############'
        ],
        exits: {
            1: { to: 'keramiek', at: [8, 8] },
            2: { to: 'meubels',  at: [13, 4] }
        }
    }
];

// Doorways live well above any exhibit value, so the two can never collide.
const DOOR_BASE = 100;

function isDoorTile(tileValue) {
    return tileValue >= DOOR_BASE;
}

function doorKeyFor(tileValue) {
    return tileValue - DOOR_BASE;
}

// Turn the authored text into a numeric grid, handing out exhibit tile values
// from `nextValue` upwards in reading order.
function compileRoom(room, nextValue) {
    const grid = [];
    const exhibitTiles = [];

    room.rows.forEach(row => {
        const line = [];
        for (const character of row) {
            if (character === '#') {
                line.push(1);
            } else if (character === 'E') {
                line.push(nextValue);
                exhibitTiles.push(nextValue);
                nextValue++;
            } else if (character >= '1' && character <= '9') {
                line.push(DOOR_BASE + Number(character));
            } else {
                line.push(0);
            }
        }
        grid.push(line);
    });

    room.grid = grid;
    room.exhibitTiles = exhibitTiles;
    return nextValue;
}

// Compile every room up front, so exhibit tile values run 2, 3, 4... across
// the whole museum rather than restarting in each room. How many exhibits to
// fetch falls out of the floor plan rather than being repeated as a number.
let EXHIBIT_SLOTS = 0;
(function compileAllRooms() {
    let next = 2;
    ROOMS.forEach(room => { next = compileRoom(room, next); });
    EXHIBIT_SLOTS = next - 2;
})();

function roomIndexByKey(key) {
    return ROOMS.findIndex(room => room.key === key);
}

// ==========================================
// 5. PHASER GAME SCENE
// ==========================================

class MuseumScene extends Phaser.Scene {
    constructor() {
        super('MuseumScene');
    }

    create() {
        // --- Build every texture before anything tries to use one ---
        makeFloorTexture(this, 'floor-a', PALETTE.marbleA);
        makeFloorTexture(this, 'floor-b', PALETTE.marbleB);
        makeWallTexture(this);
        makeExhibitTextures(this);
        makePlayerTexture(this);
        makeMarkerTextures(this);
        makeMarlotTexture(this);
        makeDoorTexture(this);
        makeWarnTexture(this);

        // Walk cycles — row order matches the spritesheet built above.
        this.anims.create({ key: 'walk-down',  frames: this.anims.generateFrameNumbers('playerSprite', { start: 0,  end: 3  }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-left',  frames: this.anims.generateFrameNumbers('playerSprite', { start: 4,  end: 7  }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-right', frames: this.anims.generateFrameNumbers('playerSprite', { start: 8,  end: 11 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-up',    frames: this.anims.generateFrameNumbers('playerSprite', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });

        // Idle frame per facing = the "stand" frame of that row.
        this.idleFrames = { down: 0, left: 4, right: 8, up: 12 };

        this.tileSize = 32;
        const mapWidthInPixels = ROOMS[0].grid[0].length * this.tileSize;
        const mapHeightInPixels = ROOMS[0].grid.length * this.tileSize;

        // Every room is the same size, so the viewport never has to change.
        // The tile layer is rebuilt on each room change; the player, MARLOT
        // and the hint chevron are made once and carried between rooms.
        this.roomLayer = this.add.container(0, 0);
        this.exhibitSprites = {};
        this.roomIndex = 0;

        // --- Player ---
        this.facing = 'down';
        this.player = this.add.sprite(0, 0, 'playerSprite');
        this.player.setDepth(10);
        this.player.setFrame(this.idleFrames.down);

        // A fixed pool; the difficulty table decides how many are in play.
        this.marlots = [0, 1, 2].map(i => new Marlot(this, i));

        this.runElapsed = 0;
        GameState.gameOver = false;

        // --- Interaction hint marker ---
        // Built before the first room, because buildRoom() hides it.
        this.hint = this.add.image(0, 0, 'hint');
        this.hint.setDepth(20);
        this.hint.setVisible(false);
        this.tweens.add({
            targets: this.hint,
            y: '-=4',
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Draw the opening room and drop the player into it.
        this.buildRoom(0, [2, 6]);

        // --- Controls ---
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys('W,A,S,D');
        this.isMoving = false;

        this.input.keyboard.on('keydown-SPACE', this.handleInteraction, this);
        this.input.keyboard.on('keydown-ENTER', this.handleInteraction, this);
        this.input.keyboard.on('keydown-P', () => togglePokedex());
        this.input.keyboard.on('keydown-ESC', () => {
            if (GameState.dexOpen) togglePokedex();
        });

        // --- Camera ---
        // The viewport is exactly the size of the map, so the whole museum is
        // on screen at once and the camera never has to scroll.
        this.cameras.main.setBounds(0, 0, mapWidthInPixels, mapHeightInPixels);
        this.cameras.main.setBackgroundColor('#1a1a20');

        updateProgressCounter();

        // Textures are built and every room is ready to be drawn from them —
        // this is the first moment the museum is actually playable.
        finishLoading();
    }

    update(time, delta) {
        this.updateHint();

        // Clamp the frame step before it reaches anything that accumulates.
        // A non-finite delta would poison these counters permanently, and a
        // huge one (backgrounded tab, paused debugger) would swallow a whole
        // telegraph window and kill the player with no warning shown.
        const dt = Number.isFinite(delta) ? Math.min(delta, 100) : 0;

        if (!uiIsBlocking()) this.runElapsed += dt;

        const threat = this.currentThreat();
        const cfg = difficultyFor(threat);
        updateDangerMeter(threat);

        // uiIsBlocking() covers game over too, so she freezes on death and
        // while any overlay is up.
        if (!uiIsBlocking()) {
            this.marlots.forEach((marlot, i) => {
                if (i < cfg.count) marlot.update(dt, cfg);
                else if (marlot.isPresent) marlot.retire();
            });
            this.checkMarlotCollision();
        }

        if (uiIsBlocking() || this.isMoving) return;

        let nextX = this.playerGridX;
        let nextY = this.playerGridY;
        let direction = null;

        if (this.cursors.left.isDown || this.wasd.A.isDown)       { nextX--; direction = 'left';  }
        else if (this.cursors.right.isDown || this.wasd.D.isDown) { nextX++; direction = 'right'; }
        else if (this.cursors.up.isDown || this.wasd.W.isDown)    { nextY--; direction = 'up';    }
        else if (this.cursors.down.isDown || this.wasd.S.isDown)  { nextY++; direction = 'down';  }

        if (!direction) return;

        // Turn to face the way you pressed even when the path is blocked —
        // this is what lets you stand still and look at an exhibit.
        this.facing = direction;

        if (this.canEnter(nextX, nextY)) {
            this.movePlayer(nextX, nextY, direction);
        } else {
            this.player.setFrame(this.idleFrames[direction]);
        }
    }

    // --- Rooms --------------------------------------------------------
    // Everything expensive — the API fetch, the photo downloads, the pixelated
    // exhibit textures — happened once before the game started. A room change
    // only throws away tile sprites and adds new ones from textures that
    // already exist, so it costs no network and no drawing.

    buildRoom(index, spawn) {
        const room = ROOMS[index];
        this.roomIndex = index;
        this.mapGrid = room.grid.map(row => row.slice());

        // Drop the previous room's tiles. destroy(true) takes the children
        // with it, which is what stops sprites accumulating room after room.
        this.roomLayer.removeAll(true);
        this.exhibitSprites = {};

        for (let y = 0; y < this.mapGrid.length; y++) {
            for (let x = 0; x < this.mapGrid[y].length; x++) {
                const tileType = this.mapGrid[y][x];
                const posX = x * this.tileSize + (this.tileSize / 2);
                const posY = y * this.tileSize + (this.tileSize / 2);

                if (tileType === 1) {
                    this.roomLayer.add(this.add.image(posX, posY, 'wall'));
                } else {
                    // Every non-wall tile gets marble underneath it, so the
                    // exhibits and doorways sit on a floor rather than on
                    // nothing.
                    this.roomLayer.add(
                        this.add.image(posX, posY, (x + y) % 2 === 0 ? 'floor-a' : 'floor-b')
                    );
                }

                if (isDoorTile(tileType)) {
                    const door = this.add.image(posX, posY, 'door');
                    door.setDepth(4);
                    this.roomLayer.add(door);
                }

                if (isExhibitTile(tileType)) {
                    const sprite = this.add.image(posX, posY, 'exhibit-' + tileType);
                    sprite.setDepth(5);
                    this.roomLayer.add(sprite);
                    this.exhibitSprites[x + ',' + y] = sprite;

                    this.markRarity(x, y, tileType);

                    // Anything already in the dex keeps its tick when you come
                    // back to the room that holds it.
                    if (GameState.sessionPokedex.has('exhibit_' + tileType)) {
                        this.roomLayer.add(this.makeBadge(x, y, false));
                    }
                }
            }
        }

        // Place the player, then work out where MARLOT is allowed to appear.
        this.playerGridX = spawn[0];
        this.playerGridY = spawn[1];
        this.player.setPosition(
            this.playerGridX * this.tileSize + (this.tileSize / 2),
            this.playerGridY * this.tileSize + (this.tileSize / 2)
        );
        this.player.setFrame(this.idleFrames[this.facing]);
        this.isMoving = false;

        // Flood fill from the player so she can only ever appear somewhere the
        // player can actually reach. Once per room, rather than rejection
        // sampling against walls on every spawn.
        this.walkableTiles = this.computeReachableTiles(this.playerGridX, this.playerGridY);

        // She does not follow you through a doorway — every room starts clear.
        this.marlots.forEach(marlot => marlot.retire());

        this.hint.setVisible(false);
        updateRoomLabel(room);
    }

    // Step onto a doorway and you are in the next room.
    useDoor(tileValue) {
        const exit = ROOMS[this.roomIndex].exits[doorKeyFor(tileValue)];
        if (!exit) return;

        const target = roomIndexByKey(exit.to);
        if (target < 0) {
            console.warn('Museumdex: no room keyed ' + exit.to);
            return;
        }

        this.cameras.main.fadeOut(120, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.buildRoom(target, exit.at);
            this.cameras.main.fadeIn(160, 0, 0, 0);
            showToast(ROOMS[target].name);
        });
    }

    // A gem floating over the two rarest tiers. Deliberately visible before you
    // inspect anything: it tells you which plinth to reach first, which is what
    // turns rarity from a label in the dex into a reason to cross the room.
    markRarity(x, y, tileValue) {
        const rarity = (MuseumAPI['exhibit_' + tileValue] || {}).rarity;
        if (!rarity) return;

        const key = rarity.key === 'unicum' ? 'gem-unicum'
                  : rarity.key === 'zeer'   ? 'gem-zeer'
                  : null;
        if (!key) return;

        const gem = this.add.image(
            x * this.tileSize + 8,
            y * this.tileSize + 7,
            key
        );
        gem.setDepth(6);
        this.roomLayer.add(gem);

        this.tweens.add({
            targets: gem,
            y: gem.y - 3,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    // A tick over a discovered exhibit. Popped in when it is earned, already
    // in place when you re-enter the room.
    makeBadge(x, y, animate) {
        const badge = this.add.image(
            x * this.tileSize + this.tileSize - 8,
            y * this.tileSize + 8,
            'check'
        );
        badge.setDepth(6);

        if (animate) {
            badge.setScale(0);
            this.tweens.add({ targets: badge, scale: 1, duration: 250, ease: 'Back.easeOut' });
        }
        return badge;
    }

    // --- MARLOT support ---------------------------------------------

    currentThreat() {
        if (GameState.threatOverride !== null) return GameState.threatOverride;

        // Squared so the opening stretch stays genuinely gentle, plus a step
        // for each discovery — she gets angrier every time you take something.
        const ramp = Phaser.Math.Clamp(this.runElapsed / RAMP_MS, 0, 1);
        return Phaser.Math.Clamp(ramp * ramp + GameState.sessionPokedex.size * 0.15, 0, 1);
    }

    // Where MARLOT may stand: plain floor only. Keeping her out of doorways
    // means she can never block the one tile you need to leave by.
    isWalkable(x, y) {
        return !!this.mapGrid[y] && this.mapGrid[y][x] === 0;
    }

    // Where the player may step: floor, or a doorway leading out of the room.
    canEnter(x, y) {
        if (!this.mapGrid[y]) return false;
        const tile = this.mapGrid[y][x];
        return tile === 0 || isDoorTile(tile);
    }

    tileHasMarlot(x, y, except) {
        return this.marlots.some(m =>
            m !== except && m.isPresent && m.gridX === x && m.gridY === y);
    }

    computeReachableTiles(startX, startY) {
        const seen = new Set([startX + ',' + startY]);
        const tiles = [{ x: startX, y: startY }];
        const queue = [{ x: startX, y: startY }];

        while (queue.length) {
            const { x, y } = queue.shift();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                const key = nx + ',' + ny;
                if (seen.has(key) || !this.isWalkable(nx, ny)) continue;
                seen.add(key);
                tiles.push({ x: nx, y: ny });
                queue.push({ x: nx, y: ny });
            }
        }
        return tiles;
    }

    // The fairness layer. Note that movePlayer() assigns playerGridX/Y at the
    // START of a step, so the player's logical tile is already their
    // destination for the whole 150ms tween — excluding it here is what stops
    // her materialising on a move you had already committed to.
    pickSpawnTile(cfg, forMarlot) {
        const px = this.playerGridX;
        const py = this.playerGridY;

        const candidates = this.walkableTiles.filter(t => {
            if (t.x === px && t.y === py) return false;
            if (this.tileHasMarlot(t.x, t.y, forMarlot)) return false;
            if (Math.abs(t.x - px) + Math.abs(t.y - py) < cfg.minDistance) return false;
            return this.playerKeepsAnEscape(t.x, t.y, forMarlot);
        });

        return candidates.length ? Phaser.Utils.Array.GetRandom(candidates) : null;
    }

    // Never leave the player boxed in with nowhere to step.
    playerKeepsAnEscape(spawnX, spawnY, ignore) {
        const px = this.playerGridX;
        const py = this.playerGridY;

        return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const nx = px + dx, ny = py + dy;
            if (!this.isWalkable(nx, ny)) return false;
            if (nx === spawnX && ny === spawnY) return false;
            return !this.tileHasMarlot(nx, ny, ignore);
        });
    }

    checkMarlotCollision() {
        if (GameState.gameOver) return;

        const caught = this.marlots.find(m =>
            m.isLethal && m.gridX === this.playerGridX && m.gridY === this.playerGridY);

        if (caught) this.failRun();
    }

    failRun() {
        GameState.gameOver = true;
        this.isMoving = false;
        this.tweens.killTweensOf(this.player);
        this.player.anims.stop();
        this.hint.setVisible(false);

        this.cameras.main.shake(260, 0.012);
        this.cameras.main.flash(320, 190, 40, 90);

        showGameOver({
            found: GameState.sessionPokedex.size,
            ms: this.runElapsed,
            threat: this.currentThreat()
        });
    }

    // Float the chevron over an exhibit whenever the player is standing
    // in front of one (i.e. directly below it).
    updateHint() {
        const target = this.exhibitInFront();

        if (!target || uiIsBlocking()) {
            this.hint.setVisible(false);
            return;
        }

        const markerX = target.x * this.tileSize + (this.tileSize / 2);
        const markerY = target.y * this.tileSize - 6;

        if (!this.hint.visible) {
            this.hint.setVisible(true);
            this.hint.setPosition(markerX, markerY);
            // Re-seat the hover tween on the new anchor point.
            this.tweens.killTweensOf(this.hint);
            this.tweens.add({
                targets: this.hint,
                y: markerY - 4,
                duration: 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    // The exhibit tile directly above the player, if there is one.
    exhibitInFront() {
        const y = this.playerGridY - 1;
        const x = this.playerGridX;
        if (y < 0 || !this.mapGrid[y]) return null;

        const tile = this.mapGrid[y][x];
        if (!isExhibitTile(tile)) return null;

        return { x, y, tile };
    }

    movePlayer(newX, newY, direction) {
        this.isMoving = true;
        this.player.play('walk-' + direction, true);

        this.playerGridX = newX;
        this.playerGridY = newY;

        this.tweens.add({
            targets: this.player,
            x: newX * this.tileSize + (this.tileSize / 2),
            y: newY * this.tileSize + (this.tileSize / 2),
            duration: 150,
            onComplete: () => {
                this.isMoving = false;
                this.player.anims.stop();
                // Settle on the idle pose for whichever way we ended up facing.
                this.player.setFrame(this.idleFrames[this.facing]);

                // The doorway fires on arrival rather than on the keypress, so
                // you see yourself step into it before the room changes.
                const landed = this.mapGrid[newY] && this.mapGrid[newY][newX];
                if (isDoorTile(landed)) this.useDoor(landed);
            }
        });
    }

    handleInteraction() {
        if (GameState.dexOpen) return;   // the dex has its own controls

        if (GameState.isReading) {
            // First press finishes the typewriter, second press closes.
            if (isTyping()) {
                finishTyping();
            } else {
                closeDialogue();
            }
            return;
        }

        const target = this.exhibitInFront();
        if (!target) return;

        const apiId = "exhibit_" + target.tile;
        const exhibitData = MuseumAPI[apiId];
        if (!exhibitData) return;

        const isNew = !GameState.sessionPokedex.has(apiId);
        GameState.sessionPokedex.add(apiId);

        // Face the exhibit and stop dead.
        this.facing = 'up';
        this.player.anims.stop();
        this.player.setFrame(this.idleFrames.up);
        this.hint.setVisible(false);

        if (isNew) {
            this.badgeExhibits(target.tile);
            updateProgressCounter();

            // A common find gets the plain line; a rare one is worth saying out
            // loud, since it is the reason to keep looking.
            const rarity = exhibitData.rarity;
            if (rarity && (rarity.key === 'unicum' || rarity.key === 'zeer')) {
                showToast(rarity.label.toUpperCase() + '! Slechts ' + rarity.count +
                    ' in de hele collectie');
            } else {
                showToast('NIEUW! Opgenomen in je Museumdex');
            }
        }

        openDialogue(exhibitData.name, trimForDialogue(exhibitData.description), isNew);
    }

    // Stamp a tick on every tile showing this exhibit, not just the one that
    // happened to be read. The badge joins the room layer so it is cleared
    // along with the rest of the room, then redrawn from the dex on return.
    badgeExhibits(tileType) {
        for (const key in this.exhibitSprites) {
            const [x, y] = key.split(',').map(Number);
            if (this.mapGrid[y][x] !== tileType) continue;
            this.roomLayer.add(this.makeBadge(x, y, true));
        }
    }
}

// ==========================================
// 5. HTML UI LOGIC
// ==========================================

let typeTimer = null;
let typeFullText = '';

function isTyping() {
    return typeTimer !== null;
}

// Reveal the description one character at a time.
function startTyping(text) {
    const target = document.getElementById('exhibit-desc');
    typeFullText = text;
    target.innerText = '';

    let i = 0;
    document.getElementById('dialogue-hint').style.visibility = 'hidden';

    typeTimer = setInterval(() => {
        i++;
        target.innerText = text.slice(0, i);
        if (i >= text.length) finishTyping();
    }, 18);
}

function finishTyping() {
    if (typeTimer !== null) {
        clearInterval(typeTimer);
        typeTimer = null;
    }
    document.getElementById('exhibit-desc').innerText = typeFullText;
    document.getElementById('dialogue-hint').style.visibility = 'visible';
}

// The catalogue writes for a wall label, not a dialogue box — descriptions run
// to several hundred characters, which is a long typewriter wait for a SPACE
// press. Cut at the last sentence that fits and point the reader at the dex,
// which shows the text in full.
const DIALOGUE_LIMIT = 220;

function trimForDialogue(text) {
    if (!text) return 'Bij dit object is geen beschrijving bewaard.';
    if (text.length <= DIALOGUE_LIMIT) return text;

    const head = text.slice(0, DIALOGUE_LIMIT);
    const lastStop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));

    // Only break on a sentence if one lands somewhere near the end; otherwise
    // a single long opening sentence would be cut to almost nothing.
    if (lastStop > DIALOGUE_LIMIT * 0.5) {
        return head.slice(0, lastStop + 1) + '  [P voor het hele verhaal]';
    }
    return head.replace(/\s+\S*$/, '') + '\u2026  [P voor het hele verhaal]';
}

function openDialogue(title, description, isNew) {
    document.getElementById('exhibit-title').innerText = title;
    document.getElementById('dialogue-new').style.display = isNew ? 'inline-block' : 'none';
    document.getElementById('dialogue-box').style.display = 'block';
    GameState.isReading = true;
    startTyping(description);
}

function closeDialogue() {
    finishTyping();
    document.getElementById('dialogue-box').style.display = 'none';
    GameState.isReading = false;
}

function updateProgressCounter() {
    const found = GameState.sessionPokedex.size;
    document.getElementById('progress-counter').innerText = found + '/' + TOTAL_EXHIBITS;
    document.getElementById('dex-count').innerText =
        found + ' van ' + TOTAL_EXHIBITS + ' objecten gevonden';
}

let toastTimer = null;
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.add('visible');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

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
            '<span>' + escapeHtml(room.name) + '</span>' +
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
                    '<div class="dex-num">Nr. ' + number +
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
                    '<div class="dex-num">Nr. ' + number + '</div>' +
                    '<div class="dex-name">???</div>' +
                    '<div class="dex-desc">Nog niet gevonden. Ga naar de ' +
                        escapeHtml(room.name).toLowerCase() +
                        ' en druk op SPATIE bij een sokkel.</div>';
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

function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// The rarity chip, coloured by tier, with the count that earned it. Nothing is
// shown when the type register did not load or the object's type is not in it —
// an invented rarity would be worse than none.
function rarityHtml(entry) {
    const rarity = entry.rarity;
    if (!rarity) return '';

    return '<div class="dex-rarity" style="border-color:' + rarity.color +
           ';color:' + rarity.color + '">' +
           escapeHtml(rarity.label) +
           '<span>' + rarity.count + ' in de collectie</span>' +
           '</div>';
}

// Only the fields this particular object actually has — coverage across ten
// thousand catalogue records is uneven, and empty rows read as broken.
function factsHtml(entry) {
    const rows = [];
    const add = (label, value) => {
        if (value) rows.push('<span>' + label + '</span><b>' + escapeHtml(value) + '</b>');
    };

    add('Maker', entry.maker);
    add('Gemaakt in', entry.place);
    add('Type', (entry.types || []).join(', '));
    add('Materiaal', (entry.materials || []).join(', '));
    add('Techniek', (entry.techniques || []).join(', '));
    add('Afmetingen', formatDimensions(entry.dimensions));
    add('Verworven', entry.acquiredHow && entry.acquired
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
        bits.push('<a href="' + encodeURI(entry.url) + '" target="_blank" rel="noopener">collectieregistratie</a>');
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

let exportRunning = false;

async function downloadMuseumdex() {
    if (exportRunning) return;

    const button = document.getElementById('dex-download');
    const found = Object.keys(MuseumAPI)
        .filter(key => GameState.sessionPokedex.has(key))
        .map(key => ({ key: key, entry: MuseumAPI[key] }));

    if (!found.length) {
        showToast('Je hebt nog niets gevonden om te bewaren');
        return;
    }

    exportRunning = true;
    const original = button ? button.innerText : '';
    const setLabel = text => { if (button) button.innerText = text; };
    setLabel('Ophalen\u2026');

    let done = 0;
    const records = await DMG.pool(found.map(({ key, entry }) => async () => {
        // A fallback exhibit has no object number, so there is nothing live to
        // fetch — it is written out as-is.
        const live = entry.pid
            ? await DMG.json(DMG.BASE + '/object/' + entry.pid).catch(() => null)
            : null;

        done++;
        setLabel('Ophalen\u2026 ' + done + '/' + found.length);

        const room = ROOMS.find(r => r.exhibitTiles.includes(tileValueFor(key)));
        return {
            museumdexNumber: tileValueFor(key) - 1,
            objectNumber: entry.pid || null,
            zaal: room ? room.name : null,
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
                opmerking: 'Live ophalen is mislukt; dit zijn de gegevens uit het spel.'
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
            rechten: 'Zie de collectieregistratie per object voor rechten en fotocredits.'
        },
        objecten: records.filter(Boolean)
    };

    const stamp = new Date().toISOString().slice(0, 10);
    saveFile('museumdex-' + stamp + '.json',
             JSON.stringify(payload, null, 2),
             'application/json');

    setLabel(original || 'Download volledige data');
    exportRunning = false;
    showToast(records.filter(Boolean).length + ' objecten bewaard');
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

let dangerDragging = false;

function updateDangerMeter(threat) {
    const slider = document.getElementById('threat-slider');
    const value = Math.round(threat * 100);

    // Don't fight the user while they're dragging it.
    if (!dangerDragging) slider.value = value;

    const hue = 130 - Math.round(threat * 130);          // green -> red
    const color = 'hsl(' + hue + ', 72%, 52%)';
    slider.style.background =
        'linear-gradient(to right, ' + color + ' 0%, ' + color + ' ' + value + '%,' +
        ' #2b2b38 ' + value + '%, #2b2b38 100%)';

    document.getElementById('threat-label').innerText = value + '%';

    const auto = document.getElementById('threat-auto');
    const isAuto = GameState.threatOverride === null;
    auto.innerText = isAuto ? 'AUTO' : 'MANUEEL';
    auto.classList.toggle('manual', !isAuto);
}

function initDangerControls() {
    const slider = document.getElementById('threat-slider');

    slider.addEventListener('pointerdown', () => { dangerDragging = true; });
    slider.addEventListener('input', () => {
        GameState.threatOverride = Number(slider.value) / 100;
    });

    const release = () => {
        if (!dangerDragging) return;
        dangerDragging = false;
        slider.blur();   // otherwise the arrow keys drive the slider, not the player
    };
    slider.addEventListener('pointerup', release);
    window.addEventListener('pointerup', release);

    // Keep the arrow keys in the game even if the slider somehow has focus.
    slider.addEventListener('keydown', e => e.preventDefault());

    document.getElementById('threat-auto').addEventListener('click', (e) => {
        GameState.threatOverride = null;
        e.currentTarget.blur();
    });
}

// ------------------------------------------
// Game over
// ------------------------------------------

function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function showGameOver(stats) {
    document.getElementById('go-found').innerText = stats.found + '/' + TOTAL_EXHIBITS;
    document.getElementById('go-name').innerText = GameState.playerName;
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

// Attribute selectors need their quotes and backslashes escaped. Object numbers
// are tame — digits, dashes, underscores — but they come off the network, so
// they are not trusted into a selector unescaped.
function cssEscape(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
}

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

// ==========================================
// 6. BOOT UP THE ENGINE
// ==========================================

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

    setLoadProgress(1, 'Klaar');

    const screen = document.getElementById('boot-screen');
    if (screen) screen.style.display = 'none';

    showToast('Welkom, ' + GameState.playerName + '!');
}

// The wing you are standing in, shown in the HUD.
function updateRoomLabel(room) {
    const label = document.getElementById('room-label');
    if (label) label.innerText = room.name;
}

// Called by the START button once a name has been entered.
async function startGame() {
    const nameField = document.getElementById('player-name');
    const typed = nameField ? nameField.value.trim() : '';
    GameState.playerName = typed || 'Bezoeker';

    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('boot-screen').style.display = 'flex';
    setLoadProgress(0, 'Verbinden met Design Museum Gent\u2026');

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
    // inspected. The demo pieces repeat if there are more gaps than fallbacks.
    const fromApi = records.length;
    while (records.length < EXHIBIT_SLOTS) {
        records.push(FALLBACK_EXHIBITS[records.length % FALLBACK_EXHIBITS.length]);
    }

    // Rarity is worked out once, here, rather than on every dex render.
    records.forEach(record => { record.rarity = DMG.rarityFor(record.types); });

    installExhibits(records);
    updateProgressCounter();
    updateSourceNote(fromApi, records.length);

    setLoadProgress(1, 'Klaar');
    game = new Phaser.Game(config);
    initDangerControls();
}

// Says where this run's exhibits came from, under the game window.
function updateSourceNote(fromApi, total) {
    const note = document.getElementById('source-note');
    if (!note) return;

    if (!fromApi) {
        note.innerHTML = 'De collectie van het museum is momenteel onbereikbaar \u2014 je speelt met offline demo-objecten.';
        return;
    }

    const link = '<a href="https://data.designmuseumgent.be/v2" target="_blank" rel="noopener">' +
                 'collectie van Design Museum Gent</a>';
    // "1 van de 16 objecten komt" — reachable if most detail requests fail.
    let text = fromApi === 1
        ? '1 van de ' + total + ' objecten komt live uit de ' + link + '.'
        : fromApi + ' van de ' + total + ' objecten komen live uit de ' + link + '.';

    text += ' De sokkels zijn getekend naar het soort object; de echte foto\u2019s ' +
            'zie je in het overzicht na je bezoek.';

    note.innerHTML = text + ' Herlaad de pagina voor een nieuwe selectie.';
}

// The name field should not need a mouse.
function initStartScreen() {
    const field = document.getElementById('player-name');
    const button = document.getElementById('start-button');

    if (button) button.addEventListener('click', startGame);
    if (field) {
        field.addEventListener('keydown', event => {
            if (event.key === 'Enter') startGame();
        });
        field.focus();
    }
}

initStartScreen();
