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

// ── Scoreboard fetch ───────────────────────────────────────────────────────
async function fetchMatches(league, from, to) {
    const url = scoreboardUrl(league, from, to);
    const res = await fetch(url);
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
    const res = await fetch(`https://www.liiga.fi/api/v2/games?season=${season}&gameType=runkosarja`);
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
