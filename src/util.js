// ==========================================
// SHARED HELPERS
// ==========================================
//
// Small things used by more than one file. Everything here is pure.

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

function cssEscape(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
}

function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function lerp(a, b, t) { return a + (b - a) * t; }
