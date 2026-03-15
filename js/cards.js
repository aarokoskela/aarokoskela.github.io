'use strict';

// ── Card creation ──────────────────────────────────────────────────────────
function createCard(ev, league) {
    const comp   = ev.competitions[0];
    const home   = comp.competitors.find(c => c.homeAway === 'home');
    const away   = comp.competitors.find(c => c.homeAway === 'away');
    const status = comp.status.type;
    const matchMs   = new Date(ev.date).getTime();
    // Jos ottelu alkaa yli 5 min tulevaisuudessa, kohdellaan sitä aina tulevana
    // otteluna – ESPN palauttaa joskus virheellisen statuksen (esim. post)
    // lykätyille tai uudelleenaikataulutetuille peleille.
    const isFuture  = matchMs - Date.now() > 5 * 60 * 1000;
    const isPre     = isFuture || status.state === 'pre';
    const isPost    = !isFuture && status.state === 'post';
    const isLive    = !isFuture && status.state === 'in';
    const canStats  = isPost || isLive;
    const canLineup = !league.isLiiga && (canStats || (isPre && matchMs - Date.now() <= 10 * 60 * 1000));
    const canBtn    = canStats || canLineup;
    const hasFPL    = !!(league.hasFPL && canStats);

    let statusClass = 'status-pre', statusText = fmtTime(ev.date);
    if (isPost) { statusClass = 'status-ft';   statusText = status.shortDetail || 'FT'; }
    if (isLive) { statusClass = 'status-live'; statusText = status.detail      || 'LIVE'; }

    let centerHTML;
    if (isPost || isLive) {
        centerHTML = `<div class="score-block">
            <div class="score-pill">
                <div class="score">${home.score}&ndash;${away.score}</div>
                <div class="score-detail">${isLive ? statusText : 'Lopputulos'}</div>
            </div>
        </div>`;
    } else {
        centerHTML = `<div class="score-block">
            <div class="upcoming-block">
                <div class="upcoming-time">${fmtTime(ev.date)}</div>
                <div class="upcoming-vs">vs</div>
            </div>
        </div>`;
    }

    const venue = comp.venue?.fullName ?? '';
    const card  = document.createElement('div');
    const stateClass = isLive ? 'mc-live' : isPost ? 'mc-post' : 'mc-pre';
    card.className = `match-card ${stateClass}${canBtn ? ' has-btns' : ''}`;
    card.dataset.eventId  = ev.id;
    card.dataset.sport     = league.sport;
    card.dataset.startTime = new Date(ev.date).getTime();

    card.innerHTML = `
        ${(isLive || isPost) ? `<div class="match-meta"><span class="match-start-time">${fmtTime(ev.date)}</span></div>` : ''}
        <div class="match-teams">
            <div class="team">
                <div class="team-logo">
                    <img src="${home.team.logo}" alt="${home.team.displayName}"
                         onerror="this.style.visibility='hidden'">
                </div>
                <div class="team-name">${home.team.displayName}</div>
            </div>
            ${centerHTML}
            <div class="team">
                <div class="team-logo">
                    <img src="${away.team.logo}" alt="${away.team.displayName}"
                         onerror="this.style.visibility='hidden'">
                </div>
                <div class="team-name">${away.team.displayName}</div>
            </div>
        </div>
        ${canBtn ? `
        <div class="detail-panel stats-panel">
            <div class="detail-tab-row">
                ${canStats ? `<button class="detail-tab-btn stats-tab active">📊 Ottelutapahtumat</button>` : ''}
                <button class="detail-tab-btn lineups-tab${canStats ? '' : ' active'}">👥 Kokoonpanot</button>
                ${hasFPL ? '<button class="detail-tab-btn fpl-tab">⚽ FPL Pisteet</button>' : ''}
            </div>
            ${canStats ? `<div class="panel-content stats-content active"></div>` : ''}
            <div class="panel-content lineups-content${canStats ? '' : ' active'}"></div>
            ${hasFPL ? '<div class="panel-content fpl-content"></div>' : ''}
        </div>` : ''}`;

    if (canBtn) {
        const statsPanel      = card.querySelector('.stats-panel');
        const statsContent    = card.querySelector('.stats-content');
        const lineupsContent  = card.querySelector('.lineups-content');
        const fplContent      = card.querySelector('.fpl-content');
        const statsTab        = card.querySelector('.stats-tab');
        const lineupsTab      = card.querySelector('.lineups-tab');
        const fplTab          = card.querySelector('.fpl-tab');

        // Helper: activate one tab+content, deactivate rest
        const switchTab = (activeBtn, activeDiv) => {
            card.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
            card.querySelectorAll('.panel-content').forEach(c => c.classList.remove('active'));
            activeBtn.classList.add('active');
            activeDiv.classList.add('active');
        };

        // Click anywhere on card → open stats panel, or close if already open
        card.addEventListener('click', () => {
            if (statsPanel.classList.contains('panel-open')) {
                statsPanel.classList.remove('panel-open');
                card.classList.remove('panel-open');
            } else {
                statsPanel.classList.add('panel-open');
                card.classList.add('panel-open');
                if (canStats && !statsPanel.dataset.loaded) {
                    loadMatchStats(statsPanel, ev.id, home.team, away.team, league);
                } else if (!canStats && canLineup && !lineupsContent.dataset.loaded) {
                    loadLineups(lineupsContent, ev.id, league, home.team, away.team);
                }
            }
        });

        if (statsTab) {
            statsTab.addEventListener('click', e => {
                e.stopPropagation();
                switchTab(statsTab, statsContent);
            });
        }

        lineupsTab.addEventListener('click', e => {
            e.stopPropagation();
            switchTab(lineupsTab, lineupsContent);
            if (!lineupsContent.dataset.loaded) {
                loadLineups(lineupsContent, ev.id, league, home.team, away.team);
            }
        });

        if (hasFPL) {
            fplTab.addEventListener('click', e => {
                e.stopPropagation();
                switchTab(fplTab, fplContent);
                if (!fplContent.dataset.loaded) {
                    loadFplStats(fplContent, ev, home.team, away.team);
                }
            });
        }
    }

    return card;
}

// ── Render helpers ─────────────────────────────────────────────────────────
function renderEvents(events, containerId, upcoming, league) {
    const el = document.getElementById(containerId);
    el.innerHTML = '';

    if (!events.length) {
        el.innerHTML = '<div class="error-msg">Otteluita ei löytynyt.</div>';
        return;
    }

    const info = document.createElement('p');
    info.className = 'section-info';
    info.textContent = upcoming ? `${events.length} tulevaa ottelua` : `${events.length} ottelua`;
    el.appendChild(info);

    const groups = new Map();
    for (const ev of events) {
        const day = ev.date.slice(0, 10);
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day).push(ev);
    }

    const days = [...groups.keys()].sort((a, b) =>
        upcoming ? a.localeCompare(b) : b.localeCompare(a));

    for (const day of days) {
        const dayEvents = groups.get(day).sort((a, b) =>
            upcoming ? new Date(a.date) - new Date(b.date)
                     : new Date(b.date) - new Date(a.date));

        const hdr = document.createElement('div');
        hdr.className = 'matchday-header';
        hdr.textContent = new Date(day + 'T12:00:00').toLocaleDateString('fi-FI', {
            weekday:'long', day:'numeric', month:'long', year:'numeric'
        });
        el.appendChild(hdr);
        for (const ev of dayEvents) el.appendChild(createCard(ev, league));
    }
}

