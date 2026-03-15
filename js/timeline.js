'use strict';

// ── Timeline ───────────────────────────────────────────────────────────────
const SOCCER_ICONS = {
    'goal':'⚽','own-goal':'⚽','yellow-card':'🟨','red-card':'🟥',
    'yellow-red-card':'🟨🟥','substitution':'🔄','penalty-goal':'⚽','missed-penalty':'❌',
};
const HOCKEY_ICONS = {
    'goal':'🏒','penalty':'⛔','penalty-shot':'🏒','shootout-goal':'🏒','goalie-change':'🥅',
};

// Normalise an ESPN event type to a lowercase slug.
// Soccer keyEvents: type = { type:'goal', text:'Goal' }
// NHL plays:        type = { id:'505', text:'Goal', abbreviation:'goal' }  (no .type field!)
function espnEventType(e) {
    const t = e.type;
    if (!t) return '';
    if (typeof t === 'string') return t;
    if (t.type) return t.type;
    // NHL plays use abbreviation; soccer falls back to text
    const raw = t.abbreviation || t.text || '';
    return raw.toLowerCase().trim().replace(/\s+/g, '-');
}

function buildTimeline(keyEvents, homeTeamId, sport) {
    const isHockey = sport === 'hockey';
    const SHOW = isHockey
        ? new Set(['goal','penalty','penalty-shot','shootout-goal'])
        : new Set(['goal','own-goal','yellow-card','red-card','yellow-red-card','substitution','penalty-goal','missed-penalty']);
    const NON_SCORE_MARKERS = {
        'yellow-card':'🟨','red-card':'🟥','yellow-red-card':'🟨🟥',
        'substitution':'🔄','missed-penalty':'❌','penalty':'⛔','goalie-change':'🥅',
    };

    const events = keyEvents.filter(e => {
        const type = espnEventType(e);
        if (SHOW.has(type)) return true;
        if (e.scoringPlay) return true;
        if (isHockey && e.type?.penaltyMinutes) return true;
        return false;
    });
    if (!events.length) return '<div class="no-events">Ei kirjattuja tapahtumia</div>';

    let html = '<div class="timeline">';
    let curPeriod = null;
    let homeGoals = 0, awayGoals = 0;

    for (const e of events) {
        const period       = e.period?.number ?? 0;
        const type         = espnEventType(e);
        const min          = e.clock?.displayValue || '';
        const isHome       = e.team?.id === homeTeamId;
        const parts        = e.participants || [];
        const isOwnGoal    = type === 'own-goal';
        const isScoring    = e.scoringPlay || ['goal','penalty-goal','shootout-goal'].includes(type);
        const isNHLPenalty = isHockey && !e.scoringPlay && e.type?.penaltyMinutes;

        // Track running score
        if (isScoring && !isNHLPenalty) {
            if (isOwnGoal) { if (isHome) awayGoals++; else homeGoals++; }
            else           { if (isHome) homeGoals++; else awayGoals++; }
        }

        // Period header
        if (period !== curPeriod) {
            curPeriod = period;
            let lbl;
            if (isHockey) {
                lbl = period === 4 ? 'Jatkoaika'
                    : period >= 5  ? 'Voittolaukauskilpailu'
                    : period > 0   ? `${period}. erä` : '';
            } else {
                lbl = period === 1 ? '1. puoliaika'
                    : period === 2 ? '2. puoliaika'
                    : period >= 3  ? 'Jatkoaika' : '';
            }
            if (lbl) html += `<div class="tl-period"><span class="tl-period-label">${lbl}</span></div>`;
        }

        // Marker on outer edge
        let marker;
        if (isScoring && !isNHLPenalty) {
            const scoredHome = (isHome && !isOwnGoal) || (!isHome && isOwnGoal);
            const hDisp = scoredHome ? `<b>${homeGoals}</b>` : homeGoals;
            const aDisp = scoredHome ? awayGoals          : `<b>${awayGoals}</b>`;
            const chipSide = scoredHome ? 'tl-chip-home' : 'tl-chip-away';
            marker = `<span class="tl-score-chip ${chipSide}">${hDisp}–${aDisp}</span>`;
        } else {
            marker = NON_SCORE_MARKERS[type] || (isNHLPenalty ? '⛔' : '•');
        }

        // Content: player, assist, time
        let playerHTML = '', assistText = '';
        if (type === 'substitution') {
            const pOn  = parts[0]?.athlete?.displayName ?? '?';
            const pOff = parts[1]?.athlete?.displayName ?? '';
            playerHTML = `<div class="tl-player">▲ ${pOn}</div>`
                       + (pOff ? `<div class="tl-player tl-sub-off">▼ ${pOff}</div>` : '');
        } else if (isNHLPenalty) {
            const name    = parts[0]?.athlete?.displayName ?? '';
            const penName = e.type?.text || '';
            const penMins = e.type?.penaltyMinutes || '';
            playerHTML = `<div class="tl-player">${name}</div>`;
            assistText = `${penName}${penMins ? ' (' + penMins + ' min)' : ''}`;
        } else {
            const scorer = (parts.find(p => p.type === 'scorer') ?? parts[0])?.athlete?.displayName ?? '';
            const a1     = (parts.find(p => p.type === 'assister') ?? parts[1])?.athlete?.displayName ?? '';
            const a2     = parts.filter(p => p.type === 'assister')[1]?.athlete?.displayName ?? '';
            playerHTML   = `<div class="tl-player">${scorer}${isOwnGoal ? ' (om)' : ''}</div>`;
            const showA  = (a1 || a2) && (isScoring || ['goal','penalty-goal'].includes(type));
            assistText   = showA ? [a1, a2].filter(Boolean).join(', ') : '';
        }

        const bodyHTML = `<div class="tl-event-body">
            ${playerHTML}
            ${assistText ? `<div class="tl-assist">↳ ${assistText}</div>` : ''}
            ${min        ? `<div class="tl-min">${min}</div>` : ''}
        </div>`;

        if (isHome) {
            html += `<div class="tl-event tl-type-${type}">
                <div class="tl-home-col">
                    <div class="tl-marker">${marker}</div>
                    ${bodyHTML}
                </div>
                <div class="tl-away-col"></div>
            </div>`;
        } else {
            html += `<div class="tl-event tl-type-${type}">
                <div class="tl-home-col"></div>
                <div class="tl-away-col">
                    ${bodyHTML}
                    <div class="tl-marker">${marker}</div>
                </div>
            </div>`;
        }
    }

    return html + '</div>';
}
