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

const nhlGameCache = {};

async function loadNHLMatchStats(panel, gameId, homeTeam, awayTeam) {
    const content = panel.querySelector('.stats-content');
    content.innerHTML = '<div class="spinner-sm"></div>';
    try {
        const gid = String(gameId);
        if (!nhlGameCache[gid]) {
            const [pbp, box] = await Promise.all([
                fetch(`${NHL_PROXY}gamecenter/${gid}/play-by-play`).then(r => r.ok ? r.json() : null),
                fetch(`${NHL_PROXY}gamecenter/${gid}/boxscore`).then(r => r.ok ? r.json() : null),
            ]);
            nhlGameCache[gid] = { pbp, box };
        }
        const { pbp, box } = nhlGameCache[gid];

        // Roster lookup
        const roster = {};
        for (const p of (pbp?.rosterSpots || [])) {
            const fn = typeof p.firstName === 'string' ? p.firstName : (p.firstName?.default || '');
            const ln = typeof p.lastName  === 'string' ? p.lastName  : (p.lastName?.default  || '');
            roster[p.playerId] = `${fn} ${ln}`.trim();
        }

        const homeId = String(pbp?.homeTeam?.id ?? homeTeam.id);

        const SHOW = new Set(['goal', 'penalty']);
        const plays = (pbp?.plays || []).filter(p => SHOW.has(p.typeDescKey));

        let tlHTML = '<div class="timeline">';
        let curPeriod = null;

        for (const play of plays) {
            const period = play.period;
            const pt     = play.periodDescriptor?.periodType;
            const isHome = String(play.details?.eventOwnerTeamId) === homeId;
            const timeStr = play.timeInPeriod || '';

            if (period !== curPeriod) {
                curPeriod = period;
                const lbl = pt === 'OT' ? 'Jatkoaika'
                          : pt === 'SO' ? 'Voittolaukauskilpailu'
                          : `${period}. erä`;
                tlHTML += `<div class="tl-period"><span class="tl-period-label">${lbl}</span></div>`;
            }

            if (play.typeDescKey === 'goal') {
                const d = play.details || {};
                const scorer  = roster[d.scoringPlayerId] || '?';
                const a1      = d.assist1PlayerId ? roster[d.assist1PlayerId] : '';
                const a2      = d.assist2PlayerId ? roster[d.assist2PlayerId] : '';
                const assists = [a1, a2].filter(Boolean).join(', ');
                const hScore  = d.homeScore ?? 0;
                const aScore  = d.awayScore ?? 0;
                const hDisp   = isHome ? `<b>${hScore}</b>` : hScore;
                const aDisp   = isHome ? aScore : `<b>${aScore}</b>`;
                const chipCls = isHome ? 'tl-chip-home' : 'tl-chip-away';
                const chip    = `<span class="tl-score-chip ${chipCls}">${hDisp}–${aDisp}</span>`;
                const body    = `<div class="tl-event-body">
                    <div class="tl-player">${scorer}</div>
                    ${assists  ? `<div class="tl-assist">↳ ${assists}</div>` : ''}
                    ${timeStr  ? `<div class="tl-min">${timeStr}</div>` : ''}
                </div>`;
                if (isHome) {
                    tlHTML += `<div class="tl-event tl-type-goal">
                        <div class="tl-home-col"><div class="tl-marker">${chip}</div>${body}</div>
                        <div class="tl-away-col"></div></div>`;
                } else {
                    tlHTML += `<div class="tl-event tl-type-goal">
                        <div class="tl-home-col"></div>
                        <div class="tl-away-col">${body}<div class="tl-marker">${chip}</div></div></div>`;
                }
            } else if (play.typeDescKey === 'penalty') {
                const d       = play.details || {};
                const player  = roster[d.committedByPlayerId] || '';
                const penType = d.descKey ? d.descKey.replace(/-/g, ' ') : '';
                const dur     = d.duration ? `${d.duration} min` : '';
                const label   = [penType, dur].filter(Boolean).join(' — ');
                const body    = `<div class="tl-event-body">
                    ${player ? `<div class="tl-player">${player}</div>` : ''}
                    ${label  ? `<div class="tl-assist">${label}</div>` : ''}
                    ${timeStr ? `<div class="tl-min">${timeStr}</div>` : ''}
                </div>`;
                if (isHome) {
                    tlHTML += `<div class="tl-event tl-type-penalty">
                        <div class="tl-home-col"><div class="tl-marker">⛔</div>${body}</div>
                        <div class="tl-away-col"></div></div>`;
                } else {
                    tlHTML += `<div class="tl-event tl-type-penalty">
                        <div class="tl-home-col"></div>
                        <div class="tl-away-col">${body}<div class="tl-marker">⛔</div></div></div>`;
                }
            }
        }
        if (!plays.length) tlHTML += '<div class="no-events">Ei kirjattuja tapahtumia</div>';
        tlHTML += '</div>';

        // Box stats
        const NHL_STATS = {
            sog:                 { label:'Laukaukset',          isPct:false },
            faceoffWinningPctg:  { label:'Aloitusvoitot %',     isPct:true  },
            powerPlayConversion: { label:'Ylivoimateho',        isStr:true  },
            pim:                 { label:'Rangaistusmin.',      isPct:false },
            hits:                { label:'Taklaukset',          isPct:false },
            blockedShots:        { label:'Blokatut laukaukset', isPct:false },
        };
        const hName = homeTeam.shortDisplayName || homeTeam.displayName;
        const aName = awayTeam.shortDisplayName || awayTeam.displayName;
        let statsHTML = '';
        const tgs = box?.teamGameStats || [];
        if (tgs.length) {
            let statRows = `<div class="stats-teams">
                <span class="home-label"><span class="team-dot home-dot"></span>${hName}</span>
                <span class="away-label">${aName}<span class="team-dot away-dot"></span></span>
            </div>`;
            let hasAny = false;
            for (const s of tgs) {
                const def = NHL_STATS[s.category];
                if (!def) continue;
                hasAny = true;
                if (def.isStr) {
                    statRows += `<div class="stat-row"><div class="stat-row-head">
                        <span class="stat-val home-v">${s.homeValue}</span>
                        <span class="stat-label">${def.label}</span>
                        <span class="stat-val away-v">${s.awayValue}</span>
                    </div></div>`;
                } else {
                    const hV    = def.isPct ? (s.homeValue * 100) : s.homeValue;
                    const aV    = def.isPct ? (s.awayValue * 100) : s.awayValue;
                    const total = hV + aV;
                    const hPct  = def.isPct ? Math.round(hV) : (total === 0 ? 50 : Math.round(hV / total * 100));
                    const aPct  = 100 - hPct;
                    const hDisp = def.isPct ? hV.toFixed(1) + '%' : hV;
                    const aDisp = def.isPct ? aV.toFixed(1) + '%' : aV;
                    statRows += `<div class="stat-row">
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
            }
            if (hasAny) statsHTML = statRows;
        }

        content.innerHTML = `
            <div class="details-section">
                <div class="details-title">🏒 Tapahtumat</div>
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

async function loadMatchStats(panel, eventId, homeTeam, awayTeam, league) {
    if (league.isLiiga) { return loadLiigaMatchStats(panel, eventId); }
    if (league.isNHL)   { return loadNHLMatchStats(panel, eventId, homeTeam, awayTeam); }
    if (league.isSHL || league.isNLA) {
        panel.querySelector('.stats-content').innerHTML = '<div class="no-events">Ottelukohtaisia tilastoja ei saatavilla.</div>';
        panel.dataset.loaded = '1';
        return;
    }
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

