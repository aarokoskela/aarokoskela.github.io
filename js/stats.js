'use strict';

// ── Stats bars ─────────────────────────────────────────────────────────────
const STAT_DEFS_SOCCER = [
    { key:'Possession',    label:'Pallonhallinta %', isPct:true  },
    { key:'SHOTS',         label:'Laukaukset',        isPct:false },
    { key:'ON GOAL',       label:'Maalia kohti',      isPct:false },
    { key:'Corner Kicks',  label:'Kulmapotkut',       isPct:false },
    { key:'Fouls',         label:'Rikkeet',           isPct:false },
    { key:'Offsides',      label:'Paitsiot',          isPct:false },
    { key:'Saves',         label:'Torjunnat',         isPct:false },
    { key:'Yellow Cards',  label:'Keltaiset kortit',  isPct:false },
    { key:'Red Cards',     label:'Punaiset kortit',   isPct:false },
];
const STAT_DEFS_HOCKEY = [
    { key:'shots',                   label:'Laukaukset',          isPct:false },
    { key:'powerPlayGoals',          label:'Ylivoimamaalit',      isPct:false },
    { key:'powerPlayOpportunities',  label:'Ylivoimatilanteet',   isPct:false },
    { key:'faceOffWinPercent',       label:'Aloitusvoitot %',     isPct:true  },
    { key:'hits',                    label:'Taklaukset',          isPct:false },
    { key:'blocked',                 label:'Blokatut laukaukset', isPct:false },
    { key:'pims',                    label:'Rangaistusmin.',      isPct:false },
];

function buildStats(bsTeams, homeTeam, awayTeam, sport) {
    const homeBS = bsTeams.find(t => t.homeAway === 'home');
    const awayBS = bsTeams.find(t => t.homeAway === 'away');
    if (!homeBS || !awayBS) return '';

    const defs = sport === 'hockey' ? STAT_DEFS_HOCKEY : STAT_DEFS_SOCCER;

    const getVal = (stats, key) => {
        const s = stats.find(s => s.label === key || s.name === key);
        return s ? parseFloat(s.displayValue) : null;
    };

    const hName = homeTeam.shortDisplayName || homeTeam.displayName;
    const aName = awayTeam.shortDisplayName || awayTeam.displayName;
    let html = `<div class="stats-teams">
        <span class="home-label"><span class="team-dot home-dot"></span>${hName}</span>
        <span class="away-label">${aName}<span class="team-dot away-dot"></span></span>
    </div>`;

    let hasAny = false;
    for (const def of defs) {
        const hRaw = getVal(homeBS.statistics, def.key);
        const aRaw = getVal(awayBS.statistics, def.key);
        if (hRaw === null && aRaw === null) continue;
        hasAny = true;
        const hVal = hRaw ?? 0, aVal = aRaw ?? 0;
        const total = hVal + aVal;
        const hPct  = def.isPct ? Math.round(hVal) : (total === 0 ? 50 : Math.round(hVal / total * 100));
        const aPct  = 100 - hPct;
        const hDisp = def.isPct ? hVal.toFixed(1) + '%' : hVal;
        const aDisp = def.isPct ? aVal.toFixed(1) + '%' : aVal;

        html += `<div class="stat-row">
            <div class="stat-row-head">
                <span class="stat-val home-v">${hDisp}</span>
                <span class="stat-label">${def.label}</span>
                <span class="stat-val away-v">${aDisp}</span>
            </div>
            <div class="stat-bar-track">
                <div class="bar-h" style="width:${hPct}%"></div>
                <div class="bar-a" style="width:${aPct}%"></div>
            </div>
        </div>`;
    }

    return hasAny ? html : '';
}

async function loadMatchStats(panel, eventId, homeTeam, awayTeam, league) {
    if (league.isLiiga) { return loadLiigaMatchStats(panel, eventId); }
    const content = panel.querySelector('.stats-content');
    content.innerHTML = '<div class="spinner-sm"></div>';
    try {
        if (!detailCache[eventId]) {
            const res = await fetch(summaryUrl(league, eventId));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            detailCache[eventId] = await res.json();
        }
        const data      = detailCache[eventId];
        const sport     = league.sport;
        const tlIcon    = sport === 'hockey' ? '🏒' : '⚽';
        // NHL has no keyEvents — use plays instead; soccer uses keyEvents
        const evArr = (data.keyEvents?.length) ? data.keyEvents : (data.plays || []);
        const tlHTML    = buildTimeline(evArr, homeTeam.id, sport);
        const statsHTML = buildStats(data.boxscore?.teams || [], homeTeam, awayTeam, sport);

        content.innerHTML = `
            <div class="details-section">
                <div class="details-title">${tlIcon} Tapahtumat</div>
                ${tlHTML}
            </div>
            ${statsHTML ? `<div class="details-section">
                <div class="details-title">📊 Tilastot</div>
                ${statsHTML}
            </div>` : ''}`;
        panel.dataset.loaded = '1';
    } catch (err) {
        content.innerHTML = `<div class="details-error">Virhe: ${err.message}</div>`;
    }
}

// ── FPL Stats ─────────────────────────────────────────────────────────────
function buildFplSection(players, fixtureId, teamName) {
    if (!players.length) return `<div class="no-events">Ei pelaajatietoja</div>`;

    let html = `<div class="fpl-team-name">${teamName}</div>`;
    html += `<div class="fpl-table">
        <div class="fpl-row fpl-hdr">
            <span>Pos</span><span>Pelaaja</span>
            <span style="text-align:center">Min</span>
            <span style="text-align:center">G</span>
            <span style="text-align:center">A</span>
            <span style="text-align:center">CS</span>
            <span style="text-align:center" title="Defensive Contribution (tackles + clearances + blocks + interceptions)">DC</span>
            <span style="text-align:center">Bon</span>
            <span style="text-align:center">Pts</span>
        </div>`;

    for (const p of players) {
        const fe = (p.live?.explain || []).find(e => e.fixture === fixtureId);
        if (!fe) continue;

        const stats = {};
        for (const s of fe.stats) stats[s.identifier] = s;

        const mins = stats.minutes?.value ?? 0;
        if (mins === 0) continue;

        const goals   = stats.goals_scored?.value ?? 0;
        const assists = stats.assists?.value ?? 0;
        const cs      = stats.clean_sheets?.value ?? 0;
        const bonus   = stats.bonus?.value ?? 0;
        const yc      = stats.yellow_cards?.value ?? 0;
        const rc      = stats.red_cards?.value ?? 0;
        const og      = stats.own_goals?.value ?? 0;
        const saves   = stats.saves?.value ?? 0;
        const penSav  = stats.penalties_saved?.value ?? 0;
        const dc      = p.live.stats.defensive_contribution ?? 0;
        const totalPts = fe.stats.reduce((sum, s) => sum + s.points, 0);

        const pos    = POS_NAME[p.element_type];
        const posCls = pos.toLowerCase();

        let nameExtra = '';
        if (yc) nameExtra += ' 🟨';
        if (rc) nameExtra += ' 🟥';
        if (og) nameExtra += ' ⚽(og)';
        if (saves >= 3) nameExtra += ` 🧤${saves}`;
        if (penSav) nameExtra += ' ✋';

        const isSub    = stats.starts?.value === 0;
        const minLabel = isSub ? `↑${mins}'` : `${mins}'`;
        const ptsCls   = totalPts >= 10 ? 'pts-high' : totalPts >= 6 ? 'pts-med' : 'pts-low';
        const nameCls  = totalPts >= 10 ? 'fpl-name row-starred' : 'fpl-name';
        const csLabel  = (pos === 'GK' || pos === 'DEF' || pos === 'MID') ? (cs ? '✓' : '–') : '–';

        html += `<div class="fpl-row">
            <span class="fpl-pos fpl-pos-${posCls}">${pos}</span>
            <span class="${nameCls}">${p.web_name}${nameExtra}</span>
            <span class="fpl-num" style="color:var(--muted);font-size:0.9em">${minLabel}</span>
            <span class="fpl-num ${goals   ? 'nonzero' : ''}">${goals   || '–'}</span>
            <span class="fpl-num ${assists ? 'nonzero' : ''}">${assists || '–'}</span>
            <span class="fpl-num" style="color:${cs ? '#0369a1' : 'var(--muted)'}">${csLabel}</span>
            <span class="fpl-num ${dc      ? 'nonzero' : ''}">${dc      || '–'}</span>
            <span class="fpl-num ${bonus   ? 'nonzero' : ''}">${bonus   || '–'}</span>
            <span class="fpl-pts ${ptsCls}">${totalPts}</span>
        </div>`;
    }

    return html + '</div>';
}

async function loadFplStats(div, ev, homeTeam, awayTeam) {
    div.innerHTML = '<div class="spinner-sm"></div>';
    try {
        const bootstrap = await getFplBootstrap();

        const shortToId = {};
        for (const t of bootstrap.teams) shortToId[t.short_name] = t.id;

        const homeShort = ESPN_TO_FPL[homeTeam.displayName];
        const awayShort = ESPN_TO_FPL[awayTeam.displayName];

        if (!homeShort || !awayShort) {
            throw new Error(`Joukkueen nimi ei vastaa FPL-dataa (${homeTeam.displayName} / ${awayTeam.displayName})`);
        }

        const homeId = shortToId[homeShort];
        const awayId = shortToId[awayShort];

        const fixtures  = await getFplFixtures();
        const matchDate = ev.date.slice(0, 10);

        const fixture = fixtures.find(f => {
            if (!f.kickoff_time) return false;
            const fd = f.kickoff_time.slice(0, 10);
            return fd === matchDate && f.team_h === homeId && f.team_a === awayId;
        });

        if (!fixture || !fixture.event) throw new Error('FPL-ottelua ei löydy tai peli on lykätty');

        const liveData = await getFplEventLive(fixture.event);
        const liveMap  = {};
        for (const el of liveData.elements) liveMap[el.id] = el;

        const getPlayers = (teamId) =>
            bootstrap.elements
                .filter(p => p.team === teamId)
                .map(p => ({ ...p, live: liveMap[p.id] || null }))
                .filter(p => {
                    if (!p.live) return false;
                    const fe = (p.live.explain || []).find(e => e.fixture === fixture.id);
                    return fe && fe.stats.some(s => s.identifier === 'minutes' && s.value > 0);
                })
                .sort((a, b) => {
                    if (a.element_type !== b.element_type) return a.element_type - b.element_type;
                    const ptA = (a.live.explain||[]).find(e=>e.fixture===fixture.id)?.stats.reduce((s,x)=>s+x.points,0)??0;
                    const ptB = (b.live.explain||[]).find(e=>e.fixture===fixture.id)?.stats.reduce((s,x)=>s+x.points,0)??0;
                    return ptB - ptA;
                });

        const homePlayers = getPlayers(homeId);
        const awayPlayers = getPlayers(awayId);

        div.innerHTML = `
            <div class="details-section">
                <div class="details-title fpl-title">⚽ FPL-pisteet — Kierros ${fixture.event}</div>
                <div class="fpl-section">${buildFplSection(homePlayers, fixture.id, homeTeam.displayName)}</div>
                <div class="fpl-section">${buildFplSection(awayPlayers, fixture.id, awayTeam.displayName)}</div>
                <div style="font-size:0.68em;color:var(--muted);margin-top:10px;text-align:center">
                    ↑ = tullut vaihdossa &nbsp;|&nbsp; 🟨🟥 = kortit &nbsp;|&nbsp; 🧤 = torjunnat &nbsp;|&nbsp; ✋ = penaltyltorjunta
                </div>
            </div>`;
        div.dataset.loaded = '1';
    } catch (err) {
        div.innerHTML = `<div class="details-error">FPL-tilastoja ei saatavilla: ${err.message}</div>`;
    }
}

