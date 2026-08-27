// ==========================================
// CATEGORY REGISTRY AND CLASSIFIER
// ==========================================
//
// The museum's image service is unreliable and its photographs are wasted on a
// twenty-pixel plinth, so every exhibit is drawn as its broad category instead.
// Each category lives in its own file next to this one and registers itself
// here, keeping its keywords and its drawing in one place.
//
// ORDER MATTERS. The first category whose keywords match wins, so the narrower
// ones must register before the broader ones — a `tafellaken` is textile, not
// furniture. Registration order is script order, set in index.html.
//
// Coverage was measured against the museum's own type index (687 type names,
// ~12,950 objects): these five cover 90%. The rest get the dust sheet, and
// mostly deserve to — the largest unmatched types are `onderdeel`, `fragment`
// and `staal (monster)`, where a stand-in would be a claim about the object's
// shape that the catalogue does not support.

const CATEGORIES = [];

// The drawing for every art name the game can ask for: the five categories,
// the dust sheet, and the offline demo pieces.
const PROCEDURAL_ART = {};

// A category: matched by keyword, drawn by its own function.
function registerCategory(category) {
    CATEGORIES.push({ key: category.key, keywords: category.keywords });
    PROCEDURAL_ART[category.key] = category.draw;
}

// A drawing with no keywords — the demo pieces, asked for by name rather than
// found by classification.
function registerArt(name, draw) {
    PROCEDURAL_ART[name] = draw;
}

// Dutch diminutives hide the head noun: schoteltje is a schotel, kannetje a
// kan, eierdopje a dop. Every applicable ending is tried rather than just the
// first that fits — "eierdopje" ends in both "-pje" and "-je", and only
// stripping "-je" leaves the "dop" that identifies it.
const DIMINUTIVES = ['etje', 'tje', 'pje', 'kje', 'je'];

function stemsOf(word) {
    const stems = [word];

    DIMINUTIVES.forEach(suffix => {
        if (!word.endsWith(suffix) || word.length <= suffix.length + 2) return;

        const base = word.slice(0, -suffix.length);
        stems.push(base);

        // Dutch doubles the consonant before the diminutive: kannetje.
        if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
            stems.push(base.slice(0, -1));
        }
    });
    return stems;
}

// Which drawing stands in for an object, or null for the dust sheet when the
// type says nothing useful.
//
// Matching is on word ENDINGS, not substrings, because Dutch compounds put the
// category in the final element: a `champagneglas` is a glass, a `bijzettafel`
// is a table, a `stapelstoel` is a chair. Suffix matching also avoids the trap
// plain `includes` falls into, where "kandelaar" reads as a jug because "kan"
// sits inside it.
function classifyTypes(types) {
    const words = (types || []).join(' ').toLowerCase()
        .split(/[^a-zà-ÿ]+/).filter(Boolean);

    for (const category of CATEGORIES) {
        for (const word of words) {
            for (const stem of stemsOf(word)) {
                if (category.keywords.some(k => k.length >= 3 && stem.endsWith(k))) {
                    return category.key;
                }
            }
        }
    }
    return null;
}

// One texture per exhibit in play, drawn from its category.
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
