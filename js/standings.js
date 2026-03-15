'use strict';

// ── Standings ─────────────────────────────────────────────────────────────

// Flatten potentially nested ESPN standings children to get all team entries
function flattenEntries(node) {
    if (node.standings?.entries?.length) return node.standings.entries;
    if (!node.children) return [];
    let all = [];
    for (const child of node.children) all = all.concat(flattenEntries(child));
    return all;
}

// Stat category labels per sport
const TEAM_STAT_LABELS = {
    soccer: { goals: 'Maalit', assists: 'Syötöt', minutesPlayed: 'Minuutit', yellowCards: 'Kelt. kortit', saves: 'Torjunnat' },
    hockey: { points: 'Pisteet', goals: 'Maalit', assists: 'Syötöt', plusMinus: '+/–', saves: 'Torjunnat' },
};

async function loadTeamStats(div, teamId, league) {
    div.innerHTML = '<div class="spinner-sm"></div>';
    try {
        const res = await fetch(teamUrl(league, teamId));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const leaders = data.team?.leaders || [];
        const labels  = TEAM_STAT_LABELS[league.sport] || TEAM_STAT_LABELS.soccer;

        const cards = [];
        for (const cat of leaders) {
            const label = labels[cat.name];
            if (!label) continue;
            const top = cat.leaders?.[0];
            if (!top) continue;
            const name = top.athlete?.shortName || top.athlete?.displayName || '–';
            cards.push(`<div class="team-stat-card">
                <div class="team-stat-card-label">${label}</div>
                <div class="team-stat-value">${top.displayValue}</div>
                <div class="team-stat-name">${name}</div>
            </div>`);
            if (cards.length >= 3) break;
        }

        if (!cards.length) {
            div.innerHTML = '<div class="no-events">Ei tilastoja saatavilla.</div>';
            return;
        }
        div.innerHTML = `<div class="team-stat-cards">${cards.join('')}</div>`;
    } catch (err) {
        div.innerHTML = `<div class="no-events">Virhe: ${err.message}</div>`;
    }
}

function attachTeamStatsHandlers(el, league) {
    // Always update the current league reference
    el._statsLeague = league;

    // Create a fresh panel and append to standings container
    const panel = document.createElement('div');
    panel.className = 'team-stats-panel';
    panel.style.display = 'none';
    el.appendChild(panel);
    el._statsPanel = panel;

    // Only add the delegated listener once — it reads el._statsLeague / el._statsPanel dynamically
    if (el._statsListenerAdded) return;
    el._statsListenerAdded = true;

    el.addEventListener('click', function(e) {
        const row = e.target.closest('.st-row');
        if (!row) return;

        const p        = el._statsPanel;
        const lg       = el._statsLeague;
        const teamId   = row.getAttribute('data-team-id');
        const teamName = row.getAttribute('data-team-name');
        const teamLogo = row.getAttribute('data-team-logo');
        if (!teamId || !p) return;

        // Toggle same team closed
        if (p.dataset.openId === teamId && p.style.display !== 'none') {
            p.style.display = 'none';
            p.dataset.openId = '';
            el.querySelectorAll('.st-row').forEach(r => r.classList.remove('st-active'));
            return;
        }

        el.querySelectorAll('.st-row').forEach(r => r.classList.remove('st-active'));
        row.classList.add('st-active');
        p.dataset.openId = teamId;
        p.style.display = 'block';

        // Reposition panel after the nearest match-card
        const card = row.closest('.match-card');
        if (card) card.after(p);

        p.innerHTML = `
            <div class="team-stats-header">
                <img src="${teamLogo}" alt="" onerror="this.style.visibility='hidden'">
                <span>${teamName}</span>
            </div>
            <div class="ts-body"></div>`;
        loadTeamStats(p.querySelector('.ts-body'), teamId, lg);
    });
}

async function loadStandings(league) {
    const el = document.getElementById('standings-body');
    if (league.isLiiga) { return loadLiigaStandings(league); }

    try {
        const res = await fetch(standingsUrl(league));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const isHockey = league.sport === 'hockey';

        // Collect all entries
        let entries = flattenEntries(data);

        // For NHL, group by conference/division if children exist
        if (isHockey && data.children?.length) {
            renderHockeyStandings(el, data, league);
        } else {
            renderSoccerStandings(el, entries, league);
        }
    } catch (err) {
        el.innerHTML = `<div class="error-msg">Virhe sarjataulukon lataamisessa: ${err.message}</div>`;
    }
}

function standingsTableHTML(entries, cols, sport) {
    const zones = new Map();
    let rows = '';

    // Sort by rank stat
    entries.sort((a, b) => {
        const rA = Number(a.stats?.find(s => s.name === 'rank')?.displayValue ?? 99);
        const rB = Number(b.stats?.find(s => s.name === 'rank')?.displayValue ?? 99);
        return rA - rB;
    });

    for (const entry of entries) {
        const t     = entry.team;
        const stats = Object.fromEntries((entry.stats || []).map(s => [s.name, s.displayValue]));
        const note  = entry.note;
        const logo  = t.logos?.[0]?.href ?? '';

        let zoneBar = '';
        if (note?.color) {
            zoneBar = `<span class="zone-bar" style="background:${note.color}"></span>`;
            if (!zones.has(note.description)) zones.set(note.description, note.color);
        }

        const rank = Number(stats.rank ?? 0);

        let tdCells = '';
        for (const col of cols) {
            const raw = stats[col.name] ?? '';
            if (col.name === 'pointDifferential') {
                const n = Number(raw);
                const gdStr = raw.startsWith('+') || raw.startsWith('-') ? raw : (n >= 0 ? '+' + raw : raw);
                const gdColor = n > 0 ? '#0369a1' : n < 0 ? '#dc2626' : '';
                tdCells += `<td class="st-gd" style="color:${gdColor}">${gdStr}</td>`;
            } else if (col.cls) {
                tdCells += `<td class="${col.cls}">${raw}</td>`;
            } else {
                tdCells += `<td>${raw}</td>`;
            }
        }

        rows += `<tr class="st-row" data-team-id="${t.id}" data-team-name="${t.displayName}" data-team-logo="${logo}">
            <td class="st-rank">${rank}</td>
            <td><div class="st-team">
                ${zoneBar}
                <img src="${logo}" alt="${t.shortDisplayName}" onerror="this.style.visibility='hidden'">
                <span>${t.displayName}</span>
            </div></td>
            ${tdCells}
        </tr>`;
    }

    const thCells = cols.map(c => `<th>${c.label}</th>`).join('');

    const legendItems = [...zones.entries()].map(([desc, color]) => {
        const fi = desc === 'Champions League'         ? 'Mestareiden liiga'
                 : desc === 'Europa League'            ? 'Europa-liiga'
                 : desc === 'UEFA Conference League'   ? 'Conference-liiga'
                 : desc === 'Relegation'               ? 'Putoamisvyöhyke'
                 : desc === 'Playoff'                  ? 'Playoffs'
                 : desc;
        return `<div class="legend-item">
            <div class="legend-dot" style="background:${color}"></div>
            <span>${fi}</span>
        </div>`;
    }).join('');

    return { rows, thCells, legendHTML: legendItems };
}

function renderSoccerStandings(el, entries, league) {
    const cols = [
        { name:'gamesPlayed',      label:'P'   },
        { name:'wins',             label:'V'   },
        { name:'ties',             label:'T'   },
        { name:'losses',           label:'H'   },
        { name:'pointsFor',        label:'TM'  },
        { name:'pointsAgainst',    label:'PM'  },
        { name:'pointDifferential',label:'ME'  },
        { name:'points',           label:'Pts', cls:'st-pts' },
    ];

    const { rows, thCells, legendHTML } = standingsTableHTML(entries, cols, 'soccer');

    el.innerHTML = `
        <p class="section-info">Kausi 2025–26</p>
        <div class="match-card" style="padding:0;overflow:hidden;border-radius:16px">
            <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
                <table class="standings-table">
                    <thead><tr><th>#</th><th style="text-align:left">Joukkue</th>${thCells}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
        <div class="standings-legend">${legendHTML}</div>`;
    attachTeamStatsHandlers(el, league);
}

function renderHockeyStandings(el, data, league) {
    const cols = [
        { name:'gamesPlayed', label:'P'   },
        { name:'wins',        label:'V'   },
        { name:'losses',      label:'H'   },
        { name:'otLosses',    label:'OT'  },
        { name:'points',      label:'Pts', cls:'st-pts' },
        { name:'pointsFor',   label:'TM'  },
        { name:'pointsAgainst',label:'PM' },
    ];

    const thCells = cols.map(c => `<th>${c.label}</th>`).join('');
    let html = '<p class="section-info">Kausi 2025–26</p>';

    // Iterate conferences / divisions
    const conferences = data.children || [];

    for (const conf of conferences) {
        const confName = conf.name || conf.abbreviation || '';
        html += `<div class="matchday-header" style="margin-top:20px">${confName}</div>`;

        const divisions = conf.children || [conf];

        for (const div of divisions) {
            const divName = div.name || div.abbreviation || '';
            const entries = div.standings?.entries || [];

            if (!entries.length) continue;
            if (div !== conf) {
                html += `<div style="font-size:0.72em;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin:14px 0 6px;padding-left:4px">${divName}</div>`;
            }

            const { rows } = standingsTableHTML(entries, cols, 'hockey');

            html += `<div class="match-card" style="padding:0;overflow:hidden;margin-bottom:12px">
                <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
                    <table class="standings-table">
                        <thead><tr><th>#</th><th style="text-align:left">Joukkue</th>${thCells}</tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
        }
    }

    el.innerHTML = html;
    attachTeamStatsHandlers(el, league);
}
