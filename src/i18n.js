// ==========================================
// STRINGS
// ==========================================
//
// Every word the player reads lives in content/<lang>.json, not in the code and
// not in the markup. Editing copy means editing that one file, and adding a
// language means adding another beside it — nothing here needs to change.
//
// What is NOT in there: anything that comes from the museum. Object titles,
// descriptions, makers, materials and techniques are catalogue data in Dutch,
// and translating them is the museum's business, not the game's.

const I18n = {
    lang: 'nl',
    strings: {},

    // Kept in step with the ?v= on the script tags and the preload hint in
    // index.html; see the comment beside the scripts there.
    VERSION: 8,

    // Which language to load. A ?lang= in the url wins, so a translation can be
    // tried without touching anything.
    requestedLang() {
        const asked = new URLSearchParams(location.search).get('lang');
        return /^[a-z]{2}(-[a-z]{2})?$/i.test(asked || '') ? asked.toLowerCase() : 'nl';
    },

    async load() {
        const wanted = I18n.requestedLang();

        // Dutch is the fallback because the collection is catalogued in Dutch:
        // a half-translated interface over Dutch object descriptions is worse
        // than a Dutch interface.
        for (const lang of [wanted, 'nl']) {
            try {
                // The url carries the same ?v= as the preload hint in
                // index.html, or the browser treats them as two resources and
                // fetches twice. I18n.VERSION is bumped with the script tags.
                const response = await fetch('content/' + lang + '.json?v=' + I18n.VERSION);
                if (!response.ok) throw new Error('HTTP ' + response.status);

                const table = await response.json();
                I18n.lang = table.lang || lang;
                I18n.strings = table.strings || {};
                document.documentElement.lang = I18n.lang;
                return I18n.lang;
            } catch (error) {
                console.warn('Museumdex: kon content/' + lang + '.json niet laden —', error.message);
            }
        }
        return null;
    },

    // The one message that cannot come from the string table, because the
    // string table is what failed. Shown when the game is opened as a file://
    // url, where browsers refuse fetch — the page would otherwise come up as a
    // dark screen full of key names, which looks broken rather than explained.
    showLoadFailure() {
        const panel = document.createElement('div');
        panel.id = 'strings-failed';
        panel.innerHTML =
            '<h2>Even serveren</h2>' +
            '<p>De teksten staan in <code>content/nl.json</code>, en een browser mag ' +
            'dat bestand niet lezen als je <code>index.html</code> rechtstreeks opent.</p>' +
            '<p>Start een kleine server in de projectmap:</p>' +
            '<pre>python3 -m http.server 8000</pre>' +
            '<p>en ga naar <code>http://localhost:8000</code>.</p>' +
            '<p class="en">Open via a local web server — browsers block reading ' +
            'local files from <code>file://</code>.</p>';
        document.body.appendChild(panel);
    },

    // t('key') or t('key', { name: 'Mathijs' }) for the ones with slots.
    // A missing key returns the key itself, which is ugly on purpose: it shows
    // up immediately rather than rendering as a blank.
    t(key, values) {
        let text = I18n.strings[key];
        if (text === undefined) {
            console.warn('Museumdex: geen tekst voor "' + key + '"');
            return key;
        }
        if (values) {
            Object.keys(values).forEach(name => {
                text = text.split('{' + name + '}').join(String(values[name]));
            });
        }
        return text;
    },

    // Fill every element carrying data-i18n from the table. data-i18n-html is
    // for the few strings that contain markup of their own — the controls line
    // and the intro, which need <b> around the keys.
    apply(root) {
        const scope = root || document;

        scope.querySelectorAll('[data-i18n]').forEach(element => {
            element.textContent = I18n.t(element.getAttribute('data-i18n'));
        });
        scope.querySelectorAll('[data-i18n-html]').forEach(element => {
            element.innerHTML = I18n.t(element.getAttribute('data-i18n-html'));
        });
        scope.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            element.placeholder = I18n.t(element.getAttribute('data-i18n-placeholder'));
        });
        scope.querySelectorAll('[data-i18n-alt]').forEach(element => {
            element.alt = I18n.t(element.getAttribute('data-i18n-alt'));
        });
    }
};

// Short alias — this gets called a few hundred times.
const t = (key, values) => I18n.t(key, values);
