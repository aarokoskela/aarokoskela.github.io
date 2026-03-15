'use strict';

// ── Player stats ──────────────────────────────────────────────────────────
function playerStatsUrl(league) {
    if (league.sport === 'hockey' && !league.isLiiga)
        return `https://site.api.espn.com/apis/site/v2/sports/hockey/${league.id}/statistics`;
    return `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/statistics`;
}

function getStat(athlete, name) {
    const s = (athlete.statistics || []).find(s => s.name === name);
    return s ? Number(s.value) : 0;
}

let _psExpandId = 0;

function buildPlayerTable(leaders, mainStat, mainLabel, limit = 10, gpLabel = 'P') {
    const all     = leaders.slice(0, 50);
    const initial = all.slice(0, limit);
    const extra   = all.slice(limit);
    const uid     = 'pst' + (++_psExpandId);

    const makeRow = (l, i) => {
        const a    = l.athlete;
        const team = l.team?.displayName || a.team?.displayName || '';
        const gp   = l.gp ?? getStat(a, 'appearances');
        const val  = l.val ?? getStat(a, mainStat);
        return `<tr>
            <td class="st-rank">${i + 1}</td>
            <td style="text-align:left">
                <span class="ps-player">${a.displayName}</span>
                <span class="ps-team">${team}</span>
            </td>
            <td class="ps-apps">${gp}</td>
            <td class="ps-val">${val}</td>
        </tr>`;
    };

    const extraHTML = extra.length ? `
        <tbody id="${uid}-extra" style="display:none">
            ${extra.map((l, i) => makeRow(l, limit + i)).join('')}
        </tbody>
        <tfoot>
            <tr><td colspan="4" style="text-align:center;padding:8px 0">
                <button class="view-toggle-btn" style="font-size:0.78em;padding:5px 18px"
                    onclick="
                        document.getElementById('${uid}-extra').style.display='';
                        this.closest('tfoot').style.display='none';
                    ">Näytä enemmän (top ${all.length})</button>
            </td></tr>
        </tfoot>` : '';

    return `<div class="match-card" style="padding:0;overflow:hidden;border-radius:16px">
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
            <table class="standings-table">
                <thead><tr>
                    <th>#</th>
                    <th style="text-align:left">Pelaaja</th>
                    <th title="Ottelut pelattu">${gpLabel}</th>
                    <th>${mainLabel}</th>
                </tr></thead>
                <tbody>${initial.map(makeRow).join('')}</tbody>
                ${extraHTML}
            </table>
        </div>
    </div>`;
}

// ── NHL player stats (core ESPN API with parallel athlete/team resolution) ──
async function loadNHLPlayerStats(el) {
    const season  = liigaCurrentSeason();
    const base    = `https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl`;
    const fetchJ  = url => fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
    const refId   = ref => ref?.match(/\/(\d+)(?:\?|$)/)?.[1];

    const leadersRes = await fetch(`${base}/seasons/${season}/types/2/leaders`);
    if (!leadersRes.ok) throw new Error(`HTTP ${leadersRes.status}`);
    const leaderData = await leadersRes.json();
    const cats = leaderData.categories || [];

    const findCat = name => cats.find(c => c.name === name);
    const goalsCat   = findCat('goals');
    const assistsCat = findCat('assists');
    const pointsCat  = findCat('points');

    // Collect unique athlete and team refs
    const athleteMap = new Map(); // id → ref url
    const teamMap    = new Map();
    for (const cat of [goalsCat, assistsCat, pointsCat]) {
        for (const l of (cat?.leaders || [])) {
            const aId = refId(l.athlete?.$ref);
            const tId = refId(l.team?.$ref);
            if (aId && !athleteMap.has(aId)) athleteMap.set(aId, l.athlete.$ref);
            if (tId && !teamMap.has(tId))    teamMap.set(tId, l.team.$ref);
        }
    }

    // Resolve athletes and teams in parallel
    const [athleteResults, teamResults] = await Promise.all([
        Promise.all([...athleteMap.values()].map(fetchJ)),
        Promise.all([...teamMap.values()].map(fetchJ)),
    ]);

    const athletes = {}, teams = {};
    for (const a of athleteResults) if (a?.id) athletes[String(a.id)] = a.displayName || a.fullName || '?';
    for (const t of teamResults)    if (t?.id) teams[String(t.id)]    = t.shortDisplayName || t.displayName || '';

    const toLeader = l => ({
        athlete: { displayName: athletes[refId(l.athlete?.$ref)] || '?', id: refId(l.athlete?.$ref) },
        team:    { displayName: teams[refId(l.team?.$ref)] || '' },
        gp:      '–',
        val:     Math.round(l.value ?? 0),
    });

    const points  = (pointsCat?.leaders  || []).map(toLeader);
    const goals   = (goalsCat?.leaders   || []).map(toLeader);
    const assists = (assistsCat?.leaders || []).map(toLeader);

    el.innerHTML = `
        <p class="section-info">Kauden parhaat pelaajat ${season - 1}–${String(season).slice(2)}</p>
        <div class="ps-section">
            <div class="ps-section-title">🏒 Pistepörssi</div>
            ${buildPlayerTable(points, 'val', 'P', 10, 'O')}
        </div>
        <div class="ps-section">
            <div class="ps-section-title">🎯 Maalipörssi</div>
            ${buildPlayerTable(goals, 'val', 'M', 10, 'O')}
        </div>
        <div class="ps-section">
            <div class="ps-section-title">🍎 Syöttöpörssi</div>
            ${buildPlayerTable(assists, 'val', 'S', 10, 'O')}
        </div>`;
}

// ── Liiga player stats (computed from game data) ────────────────────────────
function renderLiigaPlayerStats(el, games) {
    const isDisallowed = ge => (ge.goalTypes || []).includes('RL0');
    const toName = s => s ? s.split('-').map(p => p.charAt(0) + p.slice(1).toLowerCase()).join('-') : '';

    const players = {}; // playerId → {name, team, goals, assists, gp_set}
    const gamesByPlayer = {}; // playerId → Set of gameIds

    for (const game of games) {
        if (!game.ended) continue;
        for (const side of [
            { events: game.homeTeam.goalEvents, teamName: game.homeTeam.teamName },
            { events: game.awayTeam.goalEvents, teamName: game.awayTeam.teamName },
        ]) {
            for (const ge of (side.events || [])) {
                if (isDisallowed(ge)) continue;

                const scorer = ge.scorerPlayer;
                if (scorer) {
                    const id = scorer.playerId;
                    if (!players[id]) players[id] = {
                        name: `${toName(scorer.firstName)} ${toName(scorer.lastName)}`.trim(),
                        team: side.teamName, goals: 0, assists: 0
                    };
                    players[id].goals++;
                    if (!gamesByPlayer[id]) gamesByPlayer[id] = new Set();
                    gamesByPlayer[id].add(game.id);
                }

                for (const ast of (ge.assistantPlayers || [])) {
                    const id = ast.playerId;
                    if (!players[id]) players[id] = {
                        name: `${toName(ast.firstName)} ${toName(ast.lastName)}`.trim(),
                        team: side.teamName, goals: 0, assists: 0
                    };
                    players[id].assists++;
                    if (!gamesByPlayer[id]) gamesByPlayer[id] = new Set();
                    gamesByPlayer[id].add(game.id);
                }
            }
        }
    }

    const toLeaders = list => list.map(([id, p]) => ({
        athlete: { displayName: p.name, id },
        team:    { displayName: p.team },
        gp:      gamesByPlayer[id]?.size || 0,
        val:     p._sortVal,
    }));

    const byPoints = Object.entries(players)
        .map(([id, p]) => [id, { ...p, _sortVal: p.goals + p.assists }])
        .sort((a, b) => b[1]._sortVal - a[1]._sortVal || b[1].goals - a[1].goals)
        .slice(0, 50);

    const byGoals = Object.entries(players)
        .map(([id, p]) => [id, { ...p, _sortVal: p.goals }])
        .sort((a, b) => b[1]._sortVal - a[1]._sortVal)
        .slice(0, 50);

    const season = liigaCurrentSeason();
    el.innerHTML = `
        <p class="section-info">Runkosarja ${season - 1}–${String(season).slice(2)} — laskettu maalitiedoista</p>
        <div class="ps-section">
            <div class="ps-section-title">🏒 Pistepörssi</div>
            ${buildPlayerTable(toLeaders(byPoints), 'val', 'P', 10, 'O')}
        </div>
        <div class="ps-section">
            <div class="ps-section-title">🎯 Maalipörssi</div>
            ${buildPlayerTable(toLeaders(byGoals), 'val', 'M', 10, 'O')}
        </div>`;
}

function renderPlayerStats(el, data) {
    const goalsCat   = data.stats?.find(s => s.name === 'goalsLeaders');
    const assistsCat = data.stats?.find(s => s.name === 'assistsLeaders');

    if (!goalsCat && !assistsCat) {
        el.innerHTML = '<div class="error-msg">Tilastoja ei saatavilla</div>';
        return;
    }

    // Build G+A leaders by merging both lists
    const seen = new Map();
    for (const l of [...(goalsCat?.leaders || []), ...(assistsCat?.leaders || [])]) {
        if (!seen.has(l.athlete.id)) seen.set(l.athlete.id, l);
    }
    const gaLeaders = [...seen.values()].sort((a, b) => {
        const gaA = getStat(a.athlete, 'totalGoals') + getStat(a.athlete, 'goalAssists');
        const gaB = getStat(b.athlete, 'totalGoals') + getStat(b.athlete, 'goalAssists');
        return gaB - gaA || getStat(b.athlete, 'totalGoals') - getStat(a.athlete, 'totalGoals');
    }).map(l => ({
        athlete: {
            ...l.athlete,
            statistics: [
                ...(l.athlete.statistics || []),
                { name: 'ga', value: getStat(l.athlete, 'totalGoals') + getStat(l.athlete, 'goalAssists') },
            ]
        }
    }));

    el.innerHTML = `
        <p class="section-info">Kauden parhaat pelaajat</p>
        <div class="ps-section">
            <div class="ps-section-title">⚽ Maalipörssi</div>
            ${buildPlayerTable(goalsCat?.leaders || [], 'totalGoals', 'M')}
        </div>
        <div class="ps-section">
            <div class="ps-section-title">🎯 Syöttöpörssi</div>
            ${buildPlayerTable(assistsCat?.leaders || [], 'goalAssists', 'S')}
        </div>
        <div class="ps-section">
            <div class="ps-section-title">📊 Pistepörssi (M+S)</div>
            ${buildPlayerTable(gaLeaders, 'ga', 'M+S')}
        </div>`;
}

async function loadPlayerStats(league) {
    const el = document.getElementById('playerstats-body');
    el.innerHTML = '<div class="loading"><div class="spinner"></div>Ladataan...</div>';
    try {
        if (league.isLiiga) {
            const season = liigaCurrentSeason();
            const games  = await fetchLiigaGames(season);
            renderLiigaPlayerStats(el, games);
        } else if (league.sport === 'hockey') {
            await loadNHLPlayerStats(el);
        } else {
            const res = await fetch(playerStatsUrl(league));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            renderPlayerStats(el, await res.json());
        }
    } catch (err) {
        el.innerHTML = `<div class="error-msg">Virhe tilastojen lataamisessa: ${err.message}</div>`;
    }
}
