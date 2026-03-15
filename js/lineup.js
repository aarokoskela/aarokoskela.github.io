'use strict';

// ── Lineup ────────────────────────────────────────────────────────────────

const SOCCER_POS_GROUP = {
    'GK':0,'G':0,
    'CB':1,'LB':1,'RB':1,'LWB':1,'RWB':1,'SW':1,'D':1,'DF':1,'WB':1,
    'CM':2,'CAM':2,'CDM':2,'DM':2,'LM':2,'RM':2,'AM':2,'M':2,'MF':2,'ATT MID':2,'DEF MID':2,
    'ST':3,'CF':3,'LW':3,'RW':3,'SS':3,'FW':3,'F':3,'W':3,'AT':3,'ATT':3,
};

function getSoccerGroup(abbr) {
    if (!abbr) return 2;
    const a = abbr.toUpperCase().trim();
    if (SOCCER_POS_GROUP[a] !== undefined) return SOCCER_POS_GROUP[a];
    if (a === 'GK' || a.includes('GOAL')) return 0;
    if (a.startsWith('D') || a.endsWith('BACK') || a.endsWith('B')) return 1;
    if (a === 'ST' || a === 'CF' || a.startsWith('F') || a.includes('WARD')) return 3;
    return 2;
}

function shortName(athlete) {
    const sn = athlete?.shortName;
    if (sn) return sn;
    const full = athlete?.displayName || '?';
    const parts = full.split(' ');
    if (parts.length === 1) return parts[0];
    return parts[0][0] + '. ' + parts[parts.length - 1];
}

function parseFormationRows(roster) {
    if (!roster) return [];
    const starters = (roster.roster || []).filter(p => p.starter);
    if (!starters.length) return [];
    starters.sort((a, b) =>
        (a.formationSequence ?? a.formationPlace ?? 99) -
        (b.formationSequence ?? b.formationPlace ?? 99)
    );
    // ESPN sometimes orders GK last (attack→defense); detect and reverse
    const firstGrp = getSoccerGroup(starters[0].athlete?.position?.abbreviation);
    const lastGrp  = getSoccerGroup(starters[starters.length - 1].athlete?.position?.abbreviation);
    if (lastGrp === 0 && firstGrp !== 0) starters.reverse();

    const fmtn  = roster.formation || '';
    const parts = fmtn.split('-').map(Number).filter(n => n > 0);
    const total = parts.reduce((s, n) => s + n, 0);
    if (parts.length >= 2 && total === starters.length - 1) {
        const rows = [[starters[0]]]; // GK row
        let idx = 1;
        for (const count of parts) {
            rows.push(starters.slice(idx, idx + count));
            idx += count;
        }
        return rows;
    }
    // Fallback: group by position abbreviation
    const groups = [[], [], [], []];
    for (const p of starters) {
        groups[getSoccerGroup(p.athlete?.position?.abbreviation)].push(p);
    }
    return groups.filter(g => g.length > 0);
}

const SOCCER_POS_LABEL = { 0:'MV', 1:'Puolustajat', 2:'Keskikenttäpelaajat', 3:'Hyökkääjät' };

function buildSoccerLineup(homeRoster, awayRoster, homeTeam, awayTeam) {
    const buildTeam = (roster, teamName, color) => {
        if (!roster) return `<div class="no-events">Ei kokoonpanotietoja</div>`;
        const players  = roster.roster || [];
        const starters = players.filter(p => p.starter);
        const subs     = players.filter(p => !p.starter);
        if (!starters.length) return `<div class="no-events">Ei kokoonpanotietoja</div>`;

        const formation = roster.formation || '';
        const groups = [[], [], [], []];
        for (const p of starters) {
            groups[getSoccerGroup(p.athlete?.position?.abbreviation)].push(p);
        }

        const subTime = (p) => {
            const plays = p.plays || [];
            // Find the substitution play specifically, not e.g. a goal play
            const subPlay = plays.find(pl => pl.substitution === true)
                         || plays.find(pl => pl.type?.text?.toLowerCase().includes('sub'));
            const c = subPlay?.clock;
            if (!c) return '';
            const val = typeof c === 'string' ? c : (c.displayValue || c.value || '');
            return val ? ` ${val}` : '';
        };

        const playerRow = (p, isSub) => {
            const subbedOut = !isSub && p.subbedOut;
            const subbedIn  = isSub  && p.subbedIn;
            const subMark   = subbedOut
                ? `<span class="lu-sub-mark lu-sub-out" title="Vaihdettu pois${subTime(p)}">▼${subTime(p)}</span>`
                : subbedIn
                ? `<span class="lu-sub-mark lu-sub-in"  title="Tuli vaihdossa${subTime(p)}">▲${subTime(p)}</span>`
                : '';
            return `<div class="lu-player${isSub ? ' lu-sub' : ''}">
                <span class="lu-jersey">${p.jersey || '–'}</span>
                <span class="lu-name">${p.athlete?.displayName || '?'}</span>
                ${subMark}
            </div>`;
        };

        let html = `<div class="lu-team-header" style="border-color:${color}">
            <span class="lu-team-name" style="color:${color}">${teamName}</span>
            ${formation ? `<span class="lu-formation">${formation}</span>` : ''}
        </div>
        <div class="lu-section-title">⚽ Avauskokoonpano</div>`;

        for (let i = 0; i < 4; i++) {
            if (!groups[i].length) continue;
            html += groups[i].map(p => playerRow(p, false)).join('');
        }

        if (subs.length) {
            html += `<div class="lu-section-title" style="margin-top:12px">🔄 Vaihtopelaajat</div>`;
            html += subs.map(p => playerRow(p, true)).join('');
        }

        return `<div class="lu-team">${html}</div>`;
    };

    const homeName = homeTeam.shortDisplayName || homeTeam.displayName;
    const awayName = awayTeam.shortDisplayName || awayTeam.displayName;
    return `<div class="lineup-lists">
        ${buildTeam(homeRoster, homeName, '#0369a1')}
        ${buildTeam(awayRoster, awayName, '#1e40af')}
    </div>`;
}

// NHL: data comes from boxscore.players[i].statistics categories
function buildHockeyLineup(homeBs, awayBs, homeTeam, awayTeam) {
    const parseToI = (toi) => {
        if (!toi) return 0;
        const [m, s] = String(toi).split(':').map(Number);
        return (m || 0) * 60 + (s || 0);
    };

    const buildTeam = (bsTeam, teamName, color) => {
        if (!bsTeam) return `<div class="no-events">Ei kokoonpanotietoja</div>`;
        const stats = bsTeam.statistics || [];
        const getGroup = (name) => (stats.find(s => s.name === name)?.athletes || []);

        const forwards = getGroup('forwards');
        const defense  = getGroup('defenses');
        const goalies  = getGroup('goalies');

        if (!forwards.length && !defense.length && !goalies.length)
            return `<div class="no-events">Ei kokoonpanotietoja</div>`;

        // Starting goalie = most ice time (stats index 9 = timeOnIce for goalies)
        const startGk = goalies.length
            ? goalies.reduce((best, g) =>
                parseToI(g.stats?.[9]) > parseToI(best?.stats?.[9]) ? g : best, goalies[0])
            : null;

        let html = `<div class="lu-team-header" style="border-color:${color}">
            <span class="lu-team-name" style="color:${color}">${teamName}</span>
        </div>`;

        if (goalies.length) {
            html += `<div class="lu-section-title">🥅 Maalivahti</div>`;
            for (const g of goalies) {
                const isStart = g === startGk;
                const name   = g.athlete?.displayName || '?';
                const jersey = g.athlete?.jersey || '–';
                html += `<div class="lu-player${isStart ? ' lu-starter-gk' : ' lu-sub'}">
                    <span class="lu-jersey">${jersey}</span>
                    <span class="lu-pos-tag" style="background:${isStart ? color+'33' : 'rgba(148,163,184,0.18)'};color:${isStart ? color : '#64748b'}">MV</span>
                    <span class="lu-name">${name}</span>
                    ${isStart ? '<span class="lu-starter-badge">Aloittaa</span>' : ''}
                </div>`;
            }
        }

        if (forwards.length) {
            html += `<div class="lu-section-title">🏒 Hyökkäysketjut</div>`;
            for (let i = 0; i < forwards.length; i += 3) {
                html += `<div class="lu-line-label">${Math.floor(i / 3) + 1}. ketju</div>`;
                for (const p of forwards.slice(i, i + 3)) {
                    const pos = p.athlete?.position?.abbreviation || '–';
                    html += `<div class="lu-player">
                        <span class="lu-jersey">${p.athlete?.jersey || '–'}</span>
                        <span class="lu-pos-tag" style="background:${color}22;color:${color}">${pos}</span>
                        <span class="lu-name">${p.athlete?.displayName || '?'}</span>
                    </div>`;
                }
            }
        }

        if (defense.length) {
            html += `<div class="lu-section-title">🛡️ Puolustusparit</div>`;
            for (let i = 0; i < defense.length; i += 2) {
                html += `<div class="lu-line-label">${Math.floor(i / 2) + 1}. pari</div>`;
                for (const p of defense.slice(i, i + 2)) {
                    html += `<div class="lu-player">
                        <span class="lu-jersey">${p.athlete?.jersey || '–'}</span>
                        <span class="lu-pos-tag" style="background:${color}22;color:${color}">D</span>
                        <span class="lu-name">${p.athlete?.displayName || '?'}</span>
                    </div>`;
                }
            }
        }

        return `<div class="lu-team">${html}</div>`;
    };

    const homeName = homeTeam.shortDisplayName || homeTeam.displayName;
    const awayName = awayTeam.shortDisplayName || awayTeam.displayName;
    return `<div class="lineup-lists">
        ${buildTeam(homeBs, homeName, '#0369a1')}
        ${buildTeam(awayBs, awayName, '#1e40af')}
    </div>`;
}

async function loadLiigaLineup(div, gameId, homeTeam, awayTeam) {
    try {
        const game = liigaGameById[String(gameId)];
        if (!game) throw new Error('not found');

        // Try to parse players from game object if available
        const liigaName = p => {
            const fn = (p.firstName || '').split('-').map(s => s.charAt(0) + s.slice(1).toLowerCase()).join('-');
            const ln = (p.lastName  || p.name || '').split('-').map(s => s.charAt(0) + s.slice(1).toLowerCase()).join('-');
            return `${fn} ${ln}`.trim() || '?';
        };

        const buildLiigaTeam = (teamData, teamName, color) => {
            const players = teamData.players || teamData.roster || [];
            if (!players.length) return `<div class="no-events">Ei kokoonpanotietoja</div>`;

            const goalies  = players.filter(p => p.position === 'GK' || p.position === 'G' || p.position === 'MV');
            const forwards = players.filter(p => ['LW','C','RW','F','H'].includes(p.position));
            const defense  = players.filter(p => ['D','P'].includes(p.position));
            const startGk  = goalies[0];

            let html = `<div class="lu-team-header" style="border-color:${color}">
                <span class="lu-team-name" style="color:${color}">${teamName}</span>
            </div>`;

            if (goalies.length) {
                html += `<div class="lu-section-title">🥅 Maalivahti</div>`;
                for (const g of goalies) {
                    const isStart = g === startGk;
                    html += `<div class="lu-player${isStart ? ' lu-starter-gk' : ' lu-sub'}">
                        <span class="lu-jersey">${g.jerseyNumber || g.jersey || '–'}</span>
                        <span class="lu-pos-tag" style="background:${isStart ? color+'33' : 'rgba(148,163,184,0.18)'};color:${isStart ? color : '#64748b'}">MV</span>
                        <span class="lu-name">${liigaName(g)}</span>
                        ${isStart ? '<span class="lu-starter-badge">Aloittaa</span>' : ''}
                    </div>`;
                }
            }
            if (forwards.length) {
                html += `<div class="lu-section-title">🏒 Hyökkäysketjut</div>`;
                for (let i = 0; i < forwards.length; i += 3) {
                    html += `<div class="lu-line-label">${Math.floor(i/3)+1}. ketju</div>`;
                    for (const p of forwards.slice(i, i+3)) {
                        html += `<div class="lu-player">
                            <span class="lu-jersey">${p.jerseyNumber || p.jersey || '–'}</span>
                            <span class="lu-pos-tag" style="background:${color}22;color:${color}">${p.position || '–'}</span>
                            <span class="lu-name">${liigaName(p)}</span>
                        </div>`;
                    }
                }
            }
            if (defense.length) {
                html += `<div class="lu-section-title">🛡️ Puolustusparit</div>`;
                for (let i = 0; i < defense.length; i += 2) {
                    html += `<div class="lu-line-label">${Math.floor(i/2)+1}. pari</div>`;
                    for (const p of defense.slice(i, i+2)) {
                        html += `<div class="lu-player">
                            <span class="lu-jersey">${p.jerseyNumber || p.jersey || '–'}</span>
                            <span class="lu-pos-tag" style="background:${color}22;color:${color}">D</span>
                            <span class="lu-name">${liigaName(p)}</span>
                        </div>`;
                    }
                }
            }
            return `<div class="lu-team">${html}</div>`;
        };

        const hasPlayers = (game.homeTeam?.players?.length || game.homeTeam?.roster?.length);
        if (!hasPlayers) throw new Error('no players');

        div.innerHTML = `<div class="lineup-lists">
            ${buildLiigaTeam(game.homeTeam, homeTeam.displayName, '#0369a1')}
            ${buildLiigaTeam(game.awayTeam, awayTeam.displayName, '#1e40af')}
        </div>`;
        div.dataset.loaded = '1';
    } catch {
        div.innerHTML = '<div class="no-events">Kokoonpanotietoja ei saatavilla</div>';
        div.dataset.loaded = '1';
    }
}

async function loadLineups(div, eventId, league, homeTeam, awayTeam) {
    if (league.isLiiga) {
        return loadLiigaLineup(div, eventId, homeTeam, awayTeam);
    }
    div.innerHTML = '<div class="spinner-sm"></div>';
    try {
        if (!detailCache[eventId]) {
            const res = await fetch(summaryUrl(league, eventId));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            detailCache[eventId] = await res.json();
        }
        const data = detailCache[eventId];

        if (league.sport === 'hockey') {
            const bsPlayers = data.boxscore?.players || [];
            if (!bsPlayers.length) {
                div.innerHTML = '<div class="no-events">Kokoonpanotietoja ei saatavilla</div>';
                div.dataset.loaded = '1';
                return;
            }
            const homeBs = bsPlayers.find(t => t.team?.homeAway === 'home')
                        || bsPlayers.find(t => String(t.team?.id) === String(homeTeam.id));
            const awayBs = bsPlayers.find(t => t.team?.homeAway === 'away')
                        || bsPlayers.find(t => String(t.team?.id) === String(awayTeam.id));
            div.innerHTML = buildHockeyLineup(homeBs, awayBs, homeTeam, awayTeam);
            div.dataset.loaded = '1';
            return;
        }

        const rosters = data.rosters || [];
        if (!rosters.length) {
            div.innerHTML = '<div class="no-events">Kokoonpanotietoja ei saatavilla</div>';
            div.dataset.loaded = '1';
            return;
        }

        const homeRoster = rosters.find(r => r.homeAway === 'home');
        const awayRoster = rosters.find(r => r.homeAway === 'away');
        div.innerHTML = buildSoccerLineup(homeRoster, awayRoster, homeTeam, awayTeam);

        div.dataset.loaded = '1';
    } catch (err) {
        div.innerHTML = `<div class="details-error">Virhe: ${err.message}</div>`;
    }
}
