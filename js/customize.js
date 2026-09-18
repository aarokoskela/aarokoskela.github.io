'use strict';

// ── Asetukset localStoragessa ─────────────────────────────────────────────
const CZ_ENABLED_KEY = 'tulospalvelu_leagues_v1';
const CZ_ORDER_KEY   = 'tulospalvelu_order_v1';

const ALL_LEAGUE_KEYS = () => Object.keys(LEAGUES);

// Käytössä olevat liigat (true/false per avain)
function getEnabledLeagues() {
    try {
        const stored = localStorage.getItem(CZ_ENABLED_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            for (const key of ALL_LEAGUE_KEYS()) {
                if (!(key in parsed)) parsed[key] = true;
            }
            return parsed;
        }
    } catch {}
    return Object.fromEntries(ALL_LEAGUE_KEYS().map(k => [k, true]));
}

function saveEnabledLeagues(map) {
    localStorage.setItem(CZ_ENABLED_KEY, JSON.stringify(map));
}

function isLeagueEnabled(key) {
    return getEnabledLeagues()[key] !== false;
}

// Liigajärjestys (taulukko avaimista)
function getLeagueOrder() {
    try {
        const stored = localStorage.getItem(CZ_ORDER_KEY);
        if (stored) {
            const saved = JSON.parse(stored);
            // Lisää uudet liigat loppuun jos ei ole tallennettu
            const all = ALL_LEAGUE_KEYS();
            const extra = all.filter(k => !saved.includes(k));
            return [...saved.filter(k => all.includes(k)), ...extra];
        }
    } catch {}
    return ALL_LEAGUE_KEYS();
}

function saveLeagueOrder(order) {
    localStorage.setItem(CZ_ORDER_KEY, JSON.stringify(order));
}

// Palauttaa liigat järjestyksessä ja filtteröitynä
function getOrderedEnabledLeagues() {
    const order   = getLeagueOrder();
    const enabled = getEnabledLeagues();
    return order
        .filter(k => LEAGUES[k] && enabled[k] !== false)
        .map(k => LEAGUES[k]);
}

// ── Toggle ─────────────────────────────────────────────────────────────────
function toggleLeagueEnabled(key) {
    const map = getEnabledLeagues();
    map[key] = !map[key];
    saveEnabledLeagues(map);
    renderCustomizeTab();
    if (currentTab === 'day') loadDayView(currentDayDate);
}

// ── Raahaus (pointer events – toimii sekä hiirellä että kosketuksella) ──────
let _dragKey = null;
let _dragEl  = null;
let _listEl  = null;

function czPointerDown(e, key) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const row = e.currentTarget.closest('.cz-row');
    _listEl = document.getElementById('cz-list');
    if (!row || !_listEl) return;

    _dragKey = key;
    _dragEl  = row;
    row.classList.add('cz-dragging');
    row.style.pointerEvents = 'none';
    document.body.style.userSelect = 'none';

    document.addEventListener('pointermove', czPointerMove, { passive: false });
    document.addEventListener('pointerup', czPointerUp);
    document.addEventListener('pointercancel', czPointerUp);
}

function czPointerMove(e) {
    if (!_dragKey) return;
    e.preventDefault();

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const row = target && target.closest ? target.closest('.cz-row') : null;
    if (!row || row === _dragEl || !_listEl.contains(row)) return;

    const rect = row.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    _listEl.insertBefore(_dragEl, before ? row : row.nextSibling);
}

function czPointerUp() {
    if (!_dragKey) return;
    document.removeEventListener('pointermove', czPointerMove);
    document.removeEventListener('pointerup', czPointerUp);
    document.removeEventListener('pointercancel', czPointerUp);
    document.body.style.userSelect = '';

    if (_dragEl) {
        _dragEl.classList.remove('cz-dragging');
        _dragEl.style.pointerEvents = '';
    }
    if (_listEl) {
        const order = Array.from(_listEl.querySelectorAll('.cz-row')).map(r => r.dataset.key);
        saveLeagueOrder(order);
    }

    _dragKey = null; _dragEl = null; _listEl = null;
    renderCustomizeTab();
    if (currentTab === 'day') loadDayView(currentDayDate);
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderCustomizeTab() {
    const el = document.getElementById('customize-body');
    if (!el) return;

    const enabled = getEnabledLeagues();
    const order   = getLeagueOrder();

    let html = '<div class="cz-list" id="cz-list">';

    for (const key of order) {
        const lg = LEAGUES[key];
        if (!lg) continue;

        const on = enabled[key] !== false;
        const icon = lg.logo
            ? `<img src="${lg.logo}" class="cz-logo" alt="" onerror="this.style.visibility='hidden'">`
            : `<span class="cz-logo-placeholder">🏒</span>`;

        html += `<div class="cz-row${on ? '' : ' cz-row-off'}" data-key="${key}">
            <span class="cz-handle" title="Vedä järjestääksesi" onpointerdown="czPointerDown(event,'${key}')">⠿</span>
            ${icon}
            <span class="cz-name">${lg.name}</span>
            <label class="cz-toggle" onclick="event.stopPropagation()">
                <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleLeagueEnabled('${key}')">
                <span class="cz-slider"></span>
            </label>
        </div>`;
    }

    html += '</div>';
    html += '<p class="cz-hint">Vedä rivejä järjestääksesi liigat. Valitut liigat näkyvät Päivän ottelut -näkymässä.</p>';
    el.innerHTML = html;
}

function loadCustomizeTab() {
    renderCustomizeTab();
}
