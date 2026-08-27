// ==========================================
// UI: HUD, TOAST AND THE DIFFICULTY SLIDER
// ==========================================

function updateProgressCounter() {
    const found = GameState.sessionPokedex.size;
    document.getElementById('progress-counter').innerText = found + '/' + TOTAL_EXHIBITS;
    document.getElementById('dex-count').innerText =
        t('dex.count', { found: found, total: TOTAL_EXHIBITS });
}

let toastTimer = null;
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.add('visible');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

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
    auto.innerText = isAuto ? t('hud.auto') : t('hud.manual');
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

function updateRoomLabel(room) {
    const label = document.getElementById('room-label');
    if (label) label.innerText = roomName(room);
}
