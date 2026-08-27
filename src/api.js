// ==========================================
// THE COLLECTION API
// ==========================================
//
// Design Museum Gent's open collection, at https://data.designmuseumgent.be/v2
// — no key, CORS open, JSON-LD in the CIDOC-CRM vocabulary, which is why the
// fields are property codes rather than friendly names:
// crm:P108i_was_produced_by is "who made it".
//
// Classifying an object into a drawing category lives with the drawings, in
// src/art/categories/index.js.

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
        { key: 'unicum',   max: 1,        color: '#f5c451' },
        { key: 'zeer',     max: 5,        color: '#d47ae8' },
        { key: 'zeldzaam', max: 20,       color: '#5aa9e6' },
        { key: 'ongewoon', max: 80,       color: '#4cc46a' },
        { key: 'gewoon',   max: Infinity, color: '#9a94a8' }
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

        return DMG.rarityFromCount(count, rarestType);
    },

    // Split out because the curated offline collection carries its counts
    // already: it has to show the same tiers when the type index cannot be
    // reached either.
    rarityFromCount(count, type) {
        if (!Number.isFinite(count)) return null;

        const tier = DMG.TIERS.find(t => count <= t.max);
        // The label is looked up rather than stored, so a translation reaches
        // the rarity chips too.
        return {
            count: count,
            type: type,
            key: tier.key,
            label: t('rarity.' + tier.key),
            color: tier.color
        };
    },

    // Sixteen objects from the museum's own permanent display, saved out of the
    // collection API. Fetched only when the live draw comes up short, so it
    // costs nothing on a normal load.
    async loadDemoCollection() {
        try {
            const file = await DMG.json('content/demo-collection.json?v=' + I18n.VERSION);
            const records = DMG.list(file.objects).map(object => {
                const record = Object.assign({}, object);
                record.rarity = DMG.rarityFromCount(object.rarityCount, object.rarityType);
                return record;
            });

            // Shuffled, or the file's order becomes the floor's order and both
            // Unicums sit in the entrance hall every single time.
            for (let i = records.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [records[i], records[j]] = [records[j], records[i]];
            }
            return records;
        } catch (error) {
            console.warn('Museumdex: demo-collectie niet geladen —', error.message);
            return [];
        }
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
            // Which drawing stands in for this object; see
            // src/art/categories/index.js for how it is chosen.
            art: classifyTypes(DMG.list(object['crm:P2_has_type']).map(DMG.label).filter(Boolean)),
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
                report(drawn / wanted, t('loading.picking'));
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
// museum if it answers, from content/demo-collection.json if it does not.
