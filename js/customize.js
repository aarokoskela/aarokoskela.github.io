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

// ── Drag & drop -tila ──────────────────────────────────────────────────────
let _dragKey  = null;
let _dragOver = null;

function czDragStart(e, key) {
    _dragKey = key;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('cz-dragging');
}

function czDragEnd(e) {
    e.currentTarget.classList.remove('cz-dragging');
    document.querySelectorAll('.cz-row').forEach(r => r.classList.remove('cz-drag-over'));
    _dragKey = null; _dragOver = null;
}

function czDragOver(e, key) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (key === _dragOver) return;
    _dragOver = key;
    document.querySelectorAll('.cz-row').forEach(r => r.classList.remove('cz-drag-over'));
    e.currentTarget.classList.add('cz-drag-over');
}

function czDrop(e, targetKey) {
    e.preventDefault();
    if (!_dragKey || _dragKey === targetKey) return;
    const order = getLeagueOrder();
    const from  = order.indexOf(_dragKey);
    const to    = order.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, _dragKey);
    saveLeagueOrder(order);
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

        html += `<div class="cz-row${on ? '' : ' cz-row-off'}"
                    draggable="true"
                    ondragstart="czDragStart(event,'${key}')"
                    ondragend="czDragEnd(event)"
                    ondragover="czDragOver(event,'${key}')"
                    ondrop="czDrop(event,'${key}')">
            <span class="cz-handle" title="Vedä järjestääksesi">⠿</span>
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
