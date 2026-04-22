'use strict';

// ── Day view ───────────────────────────────────────────────────────────────

function updateDayLabel(date) {
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.round((date - today) / 864e5);
    const el = document.getElementById('day-label');
    if (!el) return;
    if (diff === 0) {
        el.textContent = 'Tänään';
    } else if (diff === -1) {
        el.textContent = 'Eilen';
    } else if (diff === 1) {
        el.textContent = 'Huomenna';
    } else {
        el.textContent = date.toLocaleDateString('fi-FI', {
            weekday:'long', day:'numeric', month:'long'
        });
    }
    updateNavArrows();
}

function getMaxDate() {
    const t = new Date(); t.setHours(0,0,0,0);
    // Last day of the month 3 months from now
    return new Date(t.getFullYear(), t.getMonth() + 4, 0);
}

function changeDay(delta) {
    const next = new Date(currentDayDate);
    next.setDate(next.getDate() + delta);
    if (delta > 0 && next > getMaxDate()) return;
    currentDayDate = next;
    updateNavArrows();
    loadDayView(currentDayDate);
}

function updateNavArrows() {
    const rightBtn = document.querySelector('#date-nav .date-nav-btn:last-of-type');
    if (rightBtn) rightBtn.disabled = currentDayDate >= getMaxDate();
}

function goToToday() {
    currentDayDate = new Date(); currentDayDate.setHours(0,0,0,0);
    closeDatePicker();
    updateNavArrows();
    loadDayView(currentDayDate);
}

// ── Date picker ─────────────────────────────────────────────────────────────
let _dpView = new Date();

function toggleDatePicker() {
    const popup = document.getElementById('date-picker-popup');
    const btn   = popup.previousElementSibling;
    if (popup.classList.contains('open')) {
        popup.classList.remove('open');
        btn.classList.remove('active');
    } else {
        _dpView = new Date(currentDayDate);
        renderDatePicker();
        popup.classList.add('open');
        btn.classList.add('active');
    }
}

function closeDatePicker() {
    const popup = document.getElementById('date-picker-popup');
    if (!popup) return;
    popup.classList.remove('open');
    const btn = popup.previousElementSibling;
    if (btn) btn.classList.remove('active');
}

function dpChangeMonth(delta) {
    _dpView.setDate(1);
    _dpView.setMonth(_dpView.getMonth() + delta);
    renderDatePicker();
}

function pickDate(y, m, d) {
    const picked = new Date(y, m, d);
    if (picked > getMaxDate()) return;
    currentDayDate = picked;
    // Keep _dpView in sync with the picked month
    _dpView = new Date(y, m, 1);
    closeDatePicker();
    updateNavArrows();
    loadDayView(currentDayDate);
}

function renderDatePicker() {
    const popup  = document.getElementById('date-picker-popup');
    const year   = _dpView.getFullYear();
    const month  = _dpView.getMonth();
    const today  = new Date(); today.setHours(0,0,0,0);
    const sel    = new Date(currentDayDate);
    const maxD   = getMaxDate();

    // Is this the max allowed month?
    const maxYear = maxD.getFullYear(), maxMonth = maxD.getMonth();
    const atMaxMonth = year > maxYear || (year === maxYear && month >= maxMonth);
    // Is this the earliest we'd want to allow going back (say 1 year)?
    const minD = new Date(today.getFullYear() - 1, today.getMonth(), 1);
    const atMinMonth = year <= minD.getFullYear() && month <= minD.getMonth();

    const monthLabel = new Date(year, month, 1).toLocaleDateString('fi-FI', {
        month: 'long', year: 'numeric'
    });

    // Monday-first weekday offset
    let startDow = new Date(year, month, 1).getDay();
    startDow = (startDow + 6) % 7; // Mon=0

    const daysInMonth   = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const prevMonth     = month === 0 ? 11 : month - 1;
    const prevYear      = month === 0 ? year - 1 : year;
    const nextMonth     = month === 11 ? 0 : month + 1;
    const nextYear      = month === 11 ? year + 1 : year;

    const WDAYS = ['Ma','Ti','Ke','To','Pe','La','Su'];
    let grid = WDAYS.map(w => `<div class="dp-weekday">${w}</div>`).join('');

    // Leading days from prev month — clickable
    for (let i = startDow - 1; i >= 0; i--) {
        const d = prevMonthDays - i;
        grid += `<button class="dp-day dp-other" onclick="pickDate(${prevYear},${prevMonth},${d})">${d}</button>`;
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(year, month, d);
        let cls = 'dp-day';
        if (dt > maxD) { cls += ' dp-disabled'; }
        else {
            if (dt.getTime() === today.getTime()) cls += ' dp-today';
            if (dt.getTime() === sel.getTime())   cls += ' dp-selected';
        }
        grid += `<button class="${cls}" onclick="pickDate(${year},${month},${d})">${d}</button>`;
    }

    // Trailing days from next month — clickable if within limit
    const total = startDow + daysInMonth;
    const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let d = 1; d <= trailing; d++) {
        const dt = new Date(nextYear, nextMonth, d);
        if (dt > maxD) {
            grid += `<div class="dp-day dp-other dp-disabled">${d}</div>`;
        } else {
            grid += `<button class="dp-day dp-other" onclick="pickDate(${nextYear},${nextMonth},${d})">${d}</button>`;
        }
    }

    popup.innerHTML = `
        <div class="dp-header">
            <button class="dp-nav-btn" ${atMinMonth ? 'disabled' : ''} onclick="dpChangeMonth(-1)">&#8592;</button>
            <span class="dp-month-label">${monthLabel}</span>
            <button class="dp-nav-btn" ${atMaxMonth ? 'disabled' : ''} onclick="dpChangeMonth(1)">&#8594;</button>
        </div>
        <div class="dp-grid">${grid}</div>`;
}

// Close picker on outside click
// composedPath() captures the event path at dispatch time, before any innerHTML replacement
document.addEventListener('click', e => {
    const wrap = document.querySelector('.date-picker-wrap');
    if (!wrap) return;
    const path = e.composedPath ? e.composedPath() : [e.target];
    if (!path.includes(wrap)) closeDatePicker();
});

async function fetchDayEvents(league, date) {
    if (league.isLiiga) {
        const season = liigaCurrentSeason();
        const games  = await fetchLiigaGames(season);
        const dayStr = toESPNDate(date);
        const dayMatches = games.filter(g => {
            if (!g.homeTeam.teamName) return false;
            return toESPNDate(new Date(g.start)) === dayStr;
        });
        return dayMatches.map(liigaToESPN).filter(Boolean);
    }
    if (league.isNHL) {
        const games = await fetchNHLGames(date);
        return games.map(nhlGameToESPN);
    }
    if (league.isSHL) {
        const games = await fetchSHLGames(date);
        return games.map(shlGameToESPN);
    }
    if (league.isNLA) {
        const games = await fetchNLAGames(date);
        return games.map(nlaGameToESPN);
    }
    return fetchMatches(league, date, date);
}

async function loadDayView(date) {
    updateDayLabel(date);

    const el = document.getElementById('day-content');
    el.innerHTML = '<div class="loading"><div class="spinner"></div>Ladataan...</div>';

    const leagueOrder = getOrderedEnabledLeagues();
    const results = await Promise.allSettled(
        leagueOrder.map(lg => fetchDayEvents(lg, date))
    );

    el.innerHTML = '';

    let anyEvents = false;

    for (let i = 0; i < leagueOrder.length; i++) {
        const league = leagueOrder[i];
        const result = results[i];
        if (result.status !== 'fulfilled') continue;
        const events = result.value;
        if (!events.length) continue;

        anyEvents = true;

        const section = document.createElement('div');
        section.className = 'league-section';

        const header = document.createElement('div');
        header.className = 'league-section-header';
        if (league.logo) {
            const img = document.createElement('img');
            img.src = league.logo;
            img.alt = league.name;
            img.onerror = () => { img.style.display = 'none'; };
            header.appendChild(img);
        }
        header.appendChild(document.createTextNode(league.name));
        section.appendChild(header);

        const sortedEvents = events.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
        for (const ev of sortedEvents) {
            section.appendChild(createCard(ev, league));
        }

        el.appendChild(section);
    }

    if (!anyEvents) {
        el.innerHTML = '<div class="no-events">Ei otteluita valitulla päivällä.</div>';
    }

    // Sovella palvelimen tuorein snapshot jos se on saapunut jo ennen renderöintiä
    if (typeof applyLatestSnapshot === 'function') applyLatestSnapshot();
}
