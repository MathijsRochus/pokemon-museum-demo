// ==========================================
// UI: THE DIALOGUE BOX
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
    if (!text) return t('dialogue.noDescription');
    if (text.length <= DIALOGUE_LIMIT) return text;

    const head = text.slice(0, DIALOGUE_LIMIT);
    const lastStop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));

    // Only break on a sentence if one lands somewhere near the end; otherwise
    // a single long opening sentence would be cut to almost nothing.
    if (lastStop > DIALOGUE_LIMIT * 0.5) {
        return head.slice(0, lastStop + 1) + '  ' + t('dialogue.more');
    }
    return head.replace(/\s+\S*$/, '') + '\u2026  ' + t('dialogue.more');
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
