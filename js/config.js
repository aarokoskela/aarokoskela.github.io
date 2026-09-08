'use strict';

// ── League configurations ──────────────────────────────────────────────────
const LEAGUES = {
    pl: {
        key:'pl', sport:'soccer', id:'eng.1',
        name:'Premier League', subtitle:'Englannin Valioliiga \u2014 Ottelutulokset & ohjelma',
        logo:'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png', hasFPL: true
    },
    laliga: {
        key:'laliga', sport:'soccer', id:'esp.1',
        name:'La Liga', subtitle:'Espanjan La Liga \u2014 Ottelutulokset & ohjelma',
        logo:'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png'
    },
    bl: {
        key:'bl', sport:'soccer', id:'ger.1',
        name:'Bundesliga', subtitle:'Saksan Bundesliiga \u2014 Ottelutulokset & ohjelma',
        logo:'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png'
    },
    seriea: {
        key:'seriea', sport:'soccer', id:'ita.1',
        name:'Serie A', subtitle:'Italian Serie A \u2014 Ottelutulokset & ohjelma',
        logo:'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png'
    },
    ligue1: {
        key:'ligue1', sport:'soccer', id:'fra.1',
        name:'Ligue 1', subtitle:'Ranskan Ligue 1 \u2014 Ottelutulokset & ohjelma',
        logo:'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png'
    },
    ucl: {
        key:'ucl', sport:'soccer', id:'uefa.champions',
        name:'Champions League', subtitle:'UEFA Mestareiden liiga \u2014 Ottelutulokset & ohjelma',
        logo:'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png'
    },
    nhl: {
        key:'nhl', sport:'hockey', id:'nhl',
        name:'NHL', subtitle:'National Hockey League \u2014 Ottelutulokset & ohjelma',
        logo:'https://a.espncdn.com/i/leaguelogos/hockey/500/1.png', northAmerica: true, isNHL: true
    },
    liiga: {
        key:'liiga', sport:'hockey', id:'liiga',
        name:'Liiga', subtitle:'Suomen SM-Liiga \u2014 Ottelutulokset & ohjelma',
        logo:'', isLiiga: true
    },
    shl: {
        key:'shl', sport:'hockey', id:'shl',
        name:'SHL', subtitle:'Ruotsin jääkiekkoliiga \u2014 Ottelutulokset & ohjelma',
        logo:'https://sportality.cdn.s8y.se/series-logos/qQ9-bb0bzEWUk.svg', isSHL: true
    },
    nla: {
        key:'nla', sport:'hockey', id:'nla',
        name:'NLA', subtitle:'Sveitsin jääkiekkoliiga \u2014 Ottelutulokset & ohjelma',
        logo:'', isNLA: true
    },
};

let currentLeagueKey = 'pl';
let currentTab = 'day';
let currentDayDate = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();

function getLeague() { return LEAGUES[currentLeagueKey]; }

// ── FPL API (CORS proxy) ───────────────────────────────────────────────────
const FPL_PROXY = 'https://corsproxy.io/?url=';
const FPL_BASE  = 'https://fantasy.premierleague.com/api';

async function fplFetch(path) {
    const url = FPL_BASE + path;
    const res = await fetch(FPL_PROXY + encodeURIComponent(url));
    if (!res.ok) throw new Error(`FPL HTTP ${res.status}`);
    return res.json();
}

let   fplBootstrapCache = null;
let   fplFixturesCache  = null;
const fplEventCache     = {};
const detailCache       = {};

async function getFplBootstrap() {
    if (!fplBootstrapCache) fplBootstrapCache = await fplFetch('/bootstrap-static/');
    return fplBootstrapCache;
}
async function getFplFixtures() {
    if (!fplFixturesCache) fplFixturesCache = await fplFetch('/fixtures/');
    return fplFixturesCache;
}
async function getFplEventLive(gw) {
    if (!fplEventCache[gw]) fplEventCache[gw] = await fplFetch(`/event/${gw}/live/`);
    return fplEventCache[gw];
}

// ESPN team displayName → FPL short_name
const ESPN_TO_FPL = {
    'Arsenal':'ARS','Aston Villa':'AVL','AFC Bournemouth':'BOU','Bournemouth':'BOU',
    'Brentford':'BRE','Brighton & Hove Albion':'BHA','Brighton':'BHA',
    'Burnley':'BUR','Chelsea':'CHE','Crystal Palace':'CRY','Everton':'EVE',
    'Fulham':'FUL','Ipswich Town':'IPS','Ipswich':'IPS',
    'Leeds United':'LEE','Leeds':'LEE','Leicester City':'LEI','Leicester':'LEI',
    'Liverpool':'LIV','Manchester City':'MCI','Manchester United':'MUN',
    'Newcastle United':'NEW','Newcastle':'NEW','Nottingham Forest':'NFO',"Nott'm Forest":'NFO',
    'Southampton':'SOU','Sunderland':'SUN','Tottenham Hotspur':'TOT','Spurs':'TOT',
    'West Ham United':'WHU','West Ham':'WHU','Wolverhampton Wanderers':'WOL','Wolves':'WOL',
};
const POS_NAME = { 1:'GK', 2:'DEF', 3:'MID', 4:'FWD' };

