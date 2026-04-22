'use strict';

// ── API URL builders ───────────────────────────────────────────────────────
function scoreboardUrl(league, from, to) {
    const base = `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.id}/scoreboard`;
    return `${base}?dates=${toESPNDate(from)}-${toESPNDate(to)}&limit=100`;
}
function summaryUrl(league, eventId) {
    return `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.id}/summary?event=${eventId}`;
}
function standingsUrl(league) {
    return `https://site.api.espn.com/apis/v2/sports/${league.sport}/${league.id}/standings`;
}
function teamUrl(league, teamId) {
    return `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.id}/teams/${teamId}`;
}

// ── Ympäristön tunnistus & proxy-apufunktiot ─────────────────────────────
// Localhostilla käytetään palvelimen omia proxy-reittejä.
// GitHub Pagesissa käytetään corsproxy.io:ta CORS-rajoitusten kiertämiseksi.
const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

function nhlApiUrl(path) {
    if (IS_LOCAL) return `/nhl-api/${path}`;
    return `https://corsproxy.io/?url=${encodeURIComponent('https://api-web.nhle.com/v1/' + path)}`;
}
function shlApiUrl(path) {
    if (IS_LOCAL) return `/shl-api/${path}`;
    return `https://corsproxy.io/?url=${encodeURIComponent('https://www.shl.se/api/' + path)}`;
}
function nlaApiUrl(path) {
    if (IS_LOCAL) return `/nla-api/${path}`;
    return `https://corsproxy.io/?url=${encodeURIComponent('https://www.nationalleague.ch/api/' + path)}`;
}

// ── NHL Official API ──────────────────────────────────────────────────────

function toNHLDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function fetchNHLGames(date) {
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    const safe = url => fetch(url, { cache: 'no-store' }).then(r => r.ok ? r.json() : { games: [] }).catch(() => ({ games: [] }));
    const [a, b] = await Promise.all([
        safe(nhlApiUrl(`score/${toNHLDateStr(prev)}`)),
        safe(nhlApiUrl(`score/${toNHLDateStr(date)}`)),
    ]);
    const dayStr = toESPNDate(date);
    const seen = new Set();
    return [...(a.games || []), ...(b.games || [])].filter(g => {
        if (seen.has(g.id)) return false;
        seen.add(g.id);
        return toESPNDate(new Date(g.startTimeUTC)) === dayStr;
    });
}

function nhlGameToESPN(game) {
    const ht = game.homeTeam;
    const at = game.awayTeam;
    const state = game.gameState;
    const period = game.period || 0;
    const pt = game.periodDescriptor?.periodType;
    let snapState, shortDetail, displayClock;
    if (state === 'FUT' || state === 'PRE') {
        snapState = 'pre'; shortDetail = ''; displayClock = '';
    } else if (state === 'FINAL' || state === 'OFF') {
        snapState = 'post';
        shortDetail = pt === 'OT' ? 'JA' : pt === 'SO' ? 'VL' : 'Lopputulos';
        displayClock = '';
    } else {
        snapState = 'in';
        shortDetail = pt === 'OT' ? 'Jatkoaika' : pt === 'SO' ? 'Voittolaukaukset' : `${period}. erä`;
        displayClock = game.clock?.timeRemaining || '';
    }
    const teamObj = t => ({
        id:               String(t.id),
        displayName:      t.name?.default || t.commonName?.default || t.abbrev,
        shortDisplayName: t.commonName?.default || t.abbrev,
        logo:             t.logo || '',
    });
    return {
        id:   String(game.id),
        date: game.startTimeUTC,
        competitions: [{
            competitors: [
                { homeAway:'home', team: teamObj(ht), score: String(ht.score ?? 0) },
                { homeAway:'away', team: teamObj(at), score: String(at.score ?? 0) },
            ],
            status: { type: { state: snapState, shortDetail, detail: shortDetail, displayClock } },
            venue: game.venue ? { fullName: game.venue.default || '' } : null,
        }],
    };
}

// ── SHL API ───────────────────────────────────────────────────────────────
const SHL_SEASON   = 'xs4m9qupsi';
const SHL_SERIES   = 'qQ9-bb0bzEWUk';
const SHL_TYPES    = ['qQ9-af37Ti40B', 'qQ9-7debq38kX']; // runkosarja + playoffs

const shlGamesCache = {}; // gameTypeUuid → { data, ts }

async function fetchAllSHLGames() {
    const now = Date.now();
    const results = await Promise.all(SHL_TYPES.map(async gt => {
        const cached = shlGamesCache[gt];
        if (cached && now - cached.ts < 60_000) return cached.data;
        const res = await fetch(shlApiUrl(`sports-v2/game-schedule?seasonUuid=${SHL_SEASON}&seriesUuid=${SHL_SERIES}&gameTypeUuid=${gt}`), { cache: 'no-store' });
        const data = res.ok ? await res.json() : { gameInfo: [] };
        shlGamesCache[gt] = { data: data.gameInfo || [], ts: now };
        return data.gameInfo || [];
    }));
    return results.flat();
}

async function fetchSHLGames(date) {
    const games = await fetchAllSHLGames();
    const dayStr = toNHLDateStr(date);
    const todayGames = games.filter(g => {
        if (!g.rawStartDateTime) return false;
        const d = new Date(g.rawStartDateTime);
        return toNHLDateStr(d) === dayStr;
    });

    // game-schedule ei sisällä oikeaa tulosta — haetaan game-overview live-dataa varten
    const overviews = await Promise.all(todayGames.map(g =>
        fetch(shlApiUrl(`gameday/game-overview/${g.uuid}`), { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
    ));
    return todayGames.map((g, i) => ({ ...g, _overview: overviews[i] }));
}

function shlGameToESPN(game) {
    const ov = game._overview;
    const ht = game.homeTeamInfo;
    const at = game.awayTeamInfo;
    const teamObj = t => ({
        id:               t.uuid,
        displayName:      t.names?.long || t.names?.short || t.code,
        shortDisplayName: t.names?.short || t.code,
        logo:             t.icon || '',
    });

    // Jos game-overview on saatavilla, käytetään sen tilaa ja tulosta
    if (ov && ov.state) {
        const ovState = ov.state;
        let snapState, shortDetail, displayClock = '';
        if (ovState === 'GameEnded') {
            snapState = 'post';
            shortDetail = game.overtime ? 'JA' : game.shootout ? 'VL' : 'Lopputulos';
        } else if (ovState === 'Ongoing' || ovState === 'PeriodBreak' || ovState === 'Overtime' || ovState === 'Shootout') {
            snapState = 'in';
            const period = ov.time?.period || 0;
            if (ovState === 'Overtime')          shortDetail = 'Jatkoaika';
            else if (ovState === 'Shootout')     shortDetail = 'Voittolaukaukset';
            else if (ovState === 'PeriodBreak')  shortDetail = `${period}. erätauko`;
            else                                 shortDetail = `${period}. erä`;
            displayClock = ov.time?.periodTime || '';
        } else {
            snapState = 'pre'; shortDetail = '';
        }
        return {
            id:   game.uuid,
            date: game.rawStartDateTime,
            competitions: [{
                competitors: [
                    { homeAway:'home', team: teamObj(ht), score: String(ov.homeGoals ?? 0) },
                    { homeAway:'away', team: teamObj(at), score: String(ov.awayGoals ?? 0) },
                ],
                status: { type: { state: snapState, shortDetail, detail: shortDetail, displayClock } },
                venue: game.venueInfo ? { fullName: game.venueInfo.name || '' } : null,
            }],
        };
    }

    // Fallback: schedule-data (ei tulosta, vain ajastus)
    const state = game.state;
    let snapState, shortDetail;
    if (state === 'pre-game') {
        snapState = 'pre'; shortDetail = '';
    } else if (state === 'post-game') {
        snapState = 'post';
        shortDetail = game.overtime ? 'JA' : game.shootout ? 'VL' : 'Lopputulos';
    } else {
        snapState = 'in'; shortDetail = 'Live';
    }
    return {
        id:   game.uuid,
        date: game.rawStartDateTime,
        competitions: [{
            competitors: [
                { homeAway:'home', team: teamObj(ht), score: '0' },
                { homeAway:'away', team: teamObj(at), score: '0' },
            ],
            status: { type: { state: snapState, shortDetail, detail: shortDetail, displayClock: '' } },
            venue: game.venueInfo ? { fullName: game.venueInfo.name || '' } : null,
        }],
    };
}

// ── NLA API ───────────────────────────────────────────────────────────────

let nlaGamesCache = null;
let nlaGamesCacheTs = 0;

function nlaSeason(date) {
    return date.getMonth() >= 7 ? date.getFullYear() + 1 : date.getFullYear();
}

async function fetchNLAGames(date) {
    const now = Date.now();
    if (!nlaGamesCache || now - nlaGamesCacheTs > 60_000) {
        const season = nlaSeason(date);
        const res = await fetch(nlaApiUrl(`games?season=${season}`), { cache: 'no-store' });
        nlaGamesCache = res.ok ? await res.json() : [];
        nlaGamesCacheTs = now;
    }
    const dayStr = toNHLDateStr(date);
    return nlaGamesCache.filter(g => {
        if (g.status === 'canceled') return false;
        return toNHLDateStr(new Date(g.date)) === dayStr;
    });
}

function nlaGameToESPN(game) {
    const s = game.status;
    let snapState, shortDetail;
    if (s === 'finished') {
        snapState = 'post';
        shortDetail = game.isOvertime ? 'JA' : game.isShootout ? 'VL' : 'Lopputulos';
    } else if (s === 'live' || s === 'inProgress') {
        snapState = 'in'; shortDetail = 'Live';
    } else {
        snapState = 'pre'; shortDetail = '';
    }
    return {
        id:   String(game.gameId),
        date: game.date,
        competitions: [{
            competitors: [
                { homeAway:'home', team:{ id: String(game.homeTeamId), displayName: game.homeTeamName, shortDisplayName: game.homeTeamShortName, logo: '' }, score: String(game.homeTeamResult ?? 0) },
                { homeAway:'away', team:{ id: String(game.awayTeamId), displayName: game.awayTeamName, shortDisplayName: game.awayTeamShortName, logo: '' }, score: String(game.awayTeamResult ?? 0) },
            ],
            status: { type: { state: snapState, shortDetail, detail: shortDetail, displayClock: '' } },
            venue: game.arena ? { fullName: game.arena } : null,
        }],
    };
}

// ── Scoreboard fetch ───────────────────────────────────────────────────────
async function fetchMatches(league, from, to) {
    const url = scoreboardUrl(league, from, to);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).events || [];
}

// ── Liiga API ─────────────────────────────────────────────────────────────
function liigaCurrentSeason() {
    const now = new Date();
    // Season labeled by year it ends; new season starts in August
    return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

const liigaGamesCache = {}; // season → { data: [], ts: timestamp }
const liigaGameById   = {}; // gameId → raw game object

async function fetchLiigaGames(season, force) {
    const cached = liigaGamesCache[season];
    if (cached && !force && (Date.now() - cached.ts < 55000)) return cached.data;
    const res = await fetch(`https://www.liiga.fi/api/v2/games?season=${season}&gameType=runkosarja`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    liigaGamesCache[season] = { data, ts: Date.now() };
    for (const g of data) liigaGameById[String(g.id)] = g;
    return data;
}

const LIIGA_GOAL_TYPE = { YV:'YV', AV:'AV', VL:'VL', RL:'RL' };

function liigaToESPN(game) {
    const home = game.homeTeam;
    const away = game.awayTeam;
    if (!home.teamName || !away.teamName) return null;

    let state, shortDetail, displayClock;
    if (game.ended) {
        state = 'post';
        const ft = game.finishedType;
        shortDetail = ft === 'ENDED_DURING_OVERTIME' ? 'JA'
                    : ft === 'ENDED_DURING_SHOOTOUT'  ? 'VL'
                    : 'Lopputulos';
        displayClock = '';
    } else if (game.started) {
        state = 'in';
        shortDetail = `${game.currentPeriod}. erä`;
        displayClock = `${game.currentPeriod}. erä`;
    } else {
        state = 'pre';
        shortDetail = '';
        displayClock = '';
    }

    return {
        id: String(game.id),
        date: game.start,
        competitions: [{
            competitors: [
                { homeAway:'home', team:{ id: home.teamId, displayName: home.teamName,
                    shortDisplayName: home.teamName, logo: home.logos?.darkBg || '' },
                  score: String(home.goals ?? 0) },
                { homeAway:'away', team:{ id: away.teamId, displayName: away.teamName,
                    shortDisplayName: away.teamName, logo: away.logos?.darkBg || '' },
                  score: String(away.goals ?? 0) }
            ],
            status: { type: { state, shortDetail, detail: shortDetail, displayClock } },
            venue: game.iceRink ? { fullName: game.iceRink.name } : null
        }]
    };
}

async function loadLiigaMatchStats(panel, gameId) {
    const content = panel.querySelector('.stats-content');
    content.innerHTML = '<div class="spinner-sm"></div>';
    try {
        const game = liigaGameById[String(gameId)];
        if (!game) throw new Error('Pelin tietoja ei löydy');

        const toName = s => s ? s.split('-').map(p => p.charAt(0) + p.slice(1).toLowerCase()).join('-') : '';
        const fmtPlayer = p => p ? `${toName(p.firstName)} ${toName(p.lastName)}` : '?';

        const isDisallowed = ge => (ge.goalTypes || []).includes('RL0');

        const allGoals = [];
        for (const ge of (game.homeTeam.goalEvents || [])) if (!isDisallowed(ge)) allGoals.push({ ...ge, isHome: true });
        for (const ge of (game.awayTeam.goalEvents || [])) if (!isDisallowed(ge)) allGoals.push({ ...ge, isHome: false });
        allGoals.sort((a, b) => (a.period - b.period) || (a.gameTime - b.gameTime));

        let tlHTML = '<div class="timeline">';
        let curPeriod = null;
        for (const ge of allGoals) {
            if (ge.period !== curPeriod) {
                curPeriod = ge.period;
                const lbl = ge.period <= 3 ? `${ge.period}. erä` : 'Jatkoaika / VL';
                tlHTML += `<div class="tl-period"><span class="tl-period-label">${lbl}</span></div>`;
            }
            const mins    = Math.floor(ge.gameTime / 60);
            const secs    = String(ge.gameTime % 60).padStart(2, '0');
            const timeStr = `${mins}:${secs}`;
            const types   = (ge.goalTypes || []).join(', ');
            if (!ge.scorerPlayer) continue;
            const scorer  = `${fmtPlayer(ge.scorerPlayer)}${types ? ' (' + types + ')' : ''}`;
            const assists = (ge.assistantPlayers || []).map(fmtPlayer).join(', ');
            const hDisp   = ge.isHome  ? `<b>${ge.homeTeamScore}</b>` : ge.homeTeamScore;
            const aDisp   = !ge.isHome ? `<b>${ge.awayTeamScore}</b>` : ge.awayTeamScore;
            const chip    = `<span class="tl-score-chip">${hDisp}–${aDisp}</span>`;
            const bodyHTML = `<div class="tl-event-body">
                <div class="tl-player">${scorer}</div>
                ${assists ? `<div class="tl-assist">↳ ${assists}</div>` : ''}
                <div class="tl-min">${timeStr}</div>
            </div>`;
            if (ge.isHome) {
                tlHTML += `<div class="tl-event">
                    <div class="tl-home-col"><div class="tl-marker">${chip}</div>${bodyHTML}</div>
                    <div class="tl-away-col"></div>
                </div>`;
            } else {
                tlHTML += `<div class="tl-event">
                    <div class="tl-home-col"></div>
                    <div class="tl-away-col">${bodyHTML}<div class="tl-marker">${chip}</div></div>
                </div>`;
            }
        }
        if (!allGoals.length) tlHTML += '<div class="no-events">Ei maaleja kirjattu</div>';
        tlHTML += '</div>';

        content.innerHTML = `<div class="details-section">
            <div class="details-title">🏒 Maalit</div>${tlHTML}</div>`;
        panel.dataset.loaded = '1';
    } catch (err) {
        content.innerHTML = `<div class="details-error">Virhe: ${err.message}</div>`;
    }
}

async function loadLiigaStandings(league) {
    const el = document.getElementById('standings-body');
    try {
        const season = liigaCurrentSeason();
        const url    = `${FPL_PROXY}${encodeURIComponent(`https://www.liiga.fi/api/v2/standings?season=${season}&gameType=runkosarja`)}`;
        const res    = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data   = await res.json();
        const teams  = (data.season || []).slice().sort((a, b) => a.ranking - b.ranking);

        let rows = '';
        for (const t of teams) {
            const logo    = t.teamLogos?.darkBg || '';
            const otWins  = t.overtimeWins  || 0;
            const otLosses= t.overtimeLosses|| 0;
            const regWins = (t.wins   || 0) - otWins;
            const regLoss = (t.losses || 0) - otLosses;
            const gd      = (t.goals || 0) - (t.goalsAgainst || 0);
            const gdStr   = gd >= 0 ? '+' + gd : String(gd);
            const gdColor = gd > 0 ? '#0369a1' : gd < 0 ? '#dc2626' : '';
            rows += `<tr class="st-row" data-team-id="${t.teamId}" data-team-name="${t.teamName}" data-team-logo="${logo}">
                <td class="st-rank">${t.ranking}</td>
                <td><div class="st-team">
                    <img src="${logo}" alt="${t.teamName}" onerror="this.style.visibility='hidden'">
                    <span>${t.teamName}</span>
                </div></td>
                <td>${t.games}</td><td>${regWins}</td><td>${otWins}</td>
                <td>${otLosses}</td><td>${regLoss}</td>
                <td class="st-gd" style="color:${gdColor}">${gdStr}</td>
                <td class="st-pts">${t.points}</td>
            </tr>`;
        }
        const sy = season - 1, ey = String(season).slice(2);
        el.innerHTML = `<p class="section-info">Runkosarja ${sy}–${ey}</p>
            <div class="match-card" style="padding:0;overflow:hidden;border-radius:16px">
                <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
                    <table class="standings-table">
                        <thead><tr><th>#</th><th style="text-align:left">Joukkue</th>
                        <th>P</th><th title="Voitot">V</th><th title="Jatkoaikavoitot">JV</th>
                        <th title="Jatkoaikahäviöt">JH</th><th title="Häviöt">H</th>
                        <th>ME</th><th class="st-pts">Pts</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
    } catch (err) {
        el.innerHTML = `<div class="error-msg">Virhe sarjataulukon lataamisessa: ${err.message}</div>`;
    }
}
