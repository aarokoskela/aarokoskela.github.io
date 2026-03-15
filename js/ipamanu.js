'use strict';

// ── Ipan ja ManU:n pelit ───────────────────────────────────────────────────
const MAN_UNITED_ESPN_ID = '360';
let ipaManUView   = 'upcoming'; // 'upcoming' | 'past'
let ipaManUFilter = 'both';     // 'both' | 'manu' | 'ilves'

function switchIpaView(view) {
    ipaManUView = view;
    document.getElementById('ipa-upcoming-btn').classList.toggle('active', view === 'upcoming');
    document.getElementById('ipa-past-btn').classList.toggle('active', view === 'past');
    loadIpaManUTab();
}

function switchIpaFilter(filter) {
    ipaManUFilter = filter;
    document.getElementById('ipa-filter-both').classList.toggle('active',  filter === 'both');
    document.getElementById('ipa-filter-manu').classList.toggle('active',  filter === 'manu');
    document.getElementById('ipa-filter-ilves').classList.toggle('active', filter === 'ilves');
    loadIpaManUTab();
}

async function loadIpaManUTab() {
    const el = document.getElementById('ipa-manu-body');
    el.innerHTML = '<div class="loading"><div class="spinner"></div>Ladataan...</div>';

    try {
        const upcoming = ipaManUView === 'upcoming';
        const [muEvents, ilvesEvents] = await Promise.all([
            fetchManUSchedule(upcoming),
            fetchIlvesSchedule(upcoming),
        ]);

        // Tag each event with its league so renderMixedMatches can use the right createCard
        muEvents.forEach(e => e._league = LEAGUES.pl);
        ilvesEvents.forEach(e => e._league = LEAGUES.liiga);

        const showMU    = ipaManUFilter !== 'ilves';
        const showIlves = ipaManUFilter !== 'manu';
        const all = [
            ...(showMU    ? muEvents    : []),
            ...(showIlves ? ilvesEvents : []),
        ].sort((a, b) =>
            upcoming
                ? new Date(a.date) - new Date(b.date)
                : new Date(b.date) - new Date(a.date)
        );

        el.innerHTML = '';

        if (!all.length) {
            el.innerHTML = '<div class="no-events">Ei otteluita.</div>';
            return;
        }

        renderMixedMatchesByDay(el, all, upcoming);

    } catch (err) {
        el.innerHTML = `<div class="error-msg">Virhe: ${err.message}</div>`;
    }
}

function normScore(score) {
    if (typeof score === 'string') return score;
    if (score && score.displayValue !== undefined) return score.displayValue;
    if (score && score.value !== undefined) return String(score.value);
    return '0';
}

async function fetchManUSchedule(upcoming) {
    let events;

    if (upcoming) {
        // Scoreboard API: today → end of season, filter for Man United
        const from = new Date();
        from.setHours(0, 0, 0, 0);
        const to = new Date(2026, 4, 31); // May 31 2026
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${toESPNDate(from)}-${toESPNDate(to)}&limit=200`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        events = (data.events || []).filter(e =>
            (e.competitions?.[0]?.competitors || []).some(
                c => c.team?.displayName === 'Manchester United'
            )
        ).filter(e => {
            const s = e.competitions?.[0]?.status?.type?.state;
            return s === 'pre' || s === 'in';
        }).sort((a, b) => new Date(a.date) - new Date(b.date));
    } else {
        // Team schedule API: returns this season's completed matches
        const res = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/${MAN_UNITED_ESPN_ID}/schedule`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        events = (data.events || [])
            .filter(e => e.competitions?.[0]?.status?.type?.state === 'post')
            .map(ev => {
                const comp = ev.competitions?.[0];
                if (comp) {
                    comp.competitors = (comp.competitors || []).map(c => ({
                        ...c,
                        score: normScore(c.score),
                        team: {
                            ...c.team,
                            logo: c.team?.logos?.[0]?.href || '',
                        },
                    }));
                }
                return ev;
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    return events;
}

async function fetchIlvesSchedule(upcoming) {
    const season = liigaCurrentSeason();
    const games  = await fetchLiigaGames(season);

    const filtered = games.filter(g => {
        if (!g.homeTeam.teamName || !g.awayTeam.teamName) return false;
        const isIlves =
            (g.homeTeam.teamName || '').toLowerCase().includes('ilves') ||
            (g.awayTeam.teamName || '').toLowerCase().includes('ilves');
        if (!isIlves) return false;
        return upcoming ? !g.ended : g.ended;
    });

    const events = filtered.map(liigaToESPN).filter(Boolean);
    return upcoming
        ? events.sort((a, b) => new Date(a.date) - new Date(b.date))
        : events.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderMixedMatchesByDay(container, events, upcoming) {
    // Group by day
    const byDay = new Map();
    for (const ev of events) {
        const day = ev.date.slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(ev);
    }
    const days = [...byDay.keys()].sort((a, b) =>
        upcoming ? a.localeCompare(b) : b.localeCompare(a));

    // Group days by month
    const byMonth = new Map();
    for (const day of days) {
        const month = day.slice(0, 7); // "2026-03"
        if (!byMonth.has(month)) byMonth.set(month, []);
        byMonth.get(month).push(day);
    }

    for (const [month, monthDays] of byMonth) {
        // Month header
        const monthHdr = document.createElement('div');
        monthHdr.className = 'ipa-month-header';
        const [y, m] = month.split('-');
        monthHdr.textContent = new Date(Number(y), Number(m) - 1, 1)
            .toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' });
        container.appendChild(monthHdr);

        // Days within month
        for (const day of monthDays) {
            const dt = new Date(day + 'T12:00:00');
            const dayLbl = document.createElement('div');
            dayLbl.className = 'ipa-day-label';
            dayLbl.textContent = dt.toLocaleDateString('fi-FI', {
                weekday: 'short', day: 'numeric', month: 'numeric',
            });
            container.appendChild(dayLbl);
            for (const ev of byDay.get(day)) container.appendChild(createCard(ev, ev._league));
        }
    }
}

function renderMatchesIntoEl(container, events, league, upcoming) {
    const groups = new Map();
    for (const ev of events) {
        const day = ev.date.slice(0, 10);
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day).push(ev);
    }
    const days = [...groups.keys()].sort((a, b) =>
        upcoming ? a.localeCompare(b) : b.localeCompare(a));
    for (const day of days) {
        const hdr = document.createElement('div');
        hdr.className = 'matchday-header';
        hdr.textContent = new Date(day + 'T12:00:00').toLocaleDateString('fi-FI', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });
        container.appendChild(hdr);
        for (const ev of groups.get(day)) container.appendChild(createCard(ev, league));
    }
}
