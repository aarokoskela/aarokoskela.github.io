'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT          = 4000;
const POLL_INTERVAL = 30_000; // 30 s normaali
const POLL_LIVE     = 15_000; // 15 s kun live-otteluita käynnissä

// ── Liigakonfiguraatiot (sama rakenne kuin client config.js) ───────────────
const LEAGUES = {
    pl:     { key:'pl',     sport:'soccer', id:'eng.1',          northAmerica:false, isLiiga:false },
    laliga: { key:'laliga', sport:'soccer', id:'esp.1',          northAmerica:false, isLiiga:false },
    bl:     { key:'bl',     sport:'soccer', id:'ger.1',          northAmerica:false, isLiiga:false },
    seriea: { key:'seriea', sport:'soccer', id:'ita.1',          northAmerica:false, isLiiga:false },
    ligue1: { key:'ligue1', sport:'soccer', id:'fra.1',          northAmerica:false, isLiiga:false },
    ucl:    { key:'ucl',    sport:'soccer', id:'uefa.champions',  northAmerica:false, isLiiga:false },
    nhl:    { key:'nhl',    sport:'hockey', id:'nhl',             northAmerica:true,  isLiiga:false },
    liiga:  { key:'liiga',  sport:'hockey', id:'liiga',           northAmerica:false, isLiiga:true  },
};

// ── Apufunktiot ─────────────────────────────────────────────────────────────
function toDateStr(d) {
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

async function apiFetch(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function liigaCurrentSeason() {
    const now = new Date();
    return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

// ── Hae päivän ottelut per liiga ───────────────────────────────────────────
async function fetchTodayESPN(league, date) {
    const base = `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.id}/scoreboard`;

    if (league.northAmerica) {
        // NHL: ottelut tallennettu US-aikavyöhykkeellä → hae myös edellinen päivä
        const prev = new Date(date);
        prev.setDate(prev.getDate() - 1);
        const [a, b] = await Promise.all([
            apiFetch(`${base}?dates=${toDateStr(prev)}-${toDateStr(prev)}&limit=100`),
            apiFetch(`${base}?dates=${toDateStr(date)}-${toDateStr(date)}&limit=100`),
        ]);
        const dayStr = toDateStr(date);
        const seen   = new Set();
        return [...(a.events || []), ...(b.events || [])].filter(ev => {
            if (seen.has(ev.id)) return false;
            seen.add(ev.id);
            return toDateStr(new Date(ev.date)) === dayStr;
        });
    }

    const data = await apiFetch(`${base}?dates=${toDateStr(date)}-${toDateStr(date)}&limit=100`);
    return data.events || [];
}

async function fetchTodayLiiga(date) {
    const season = liigaCurrentSeason();
    const res    = await fetch(`https://www.liiga.fi/api/v2/games?season=${season}&gameType=runkosarja`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const games  = await res.json();
    const dayStr = toDateStr(date);
    return games.filter(g => g.homeTeam.teamName && toDateStr(new Date(g.start)) === dayStr);
}

// ── Muunna API-vastaus yksinkertaiseksi snapshotiksi ──────────────────────
function espnSnapshot(ev) {
    const comp   = ev.competitions[0];
    const home   = comp.competitors.find(c => c.homeAway === 'home');
    const away   = comp.competitors.find(c => c.homeAway === 'away');
    const status = comp.status.type;
    return {
        id:           ev.id,
        homeScore:    home?.score ?? '0',
        awayScore:    away?.score ?? '0',
        state:        status.state,
        statusText:   status.shortDetail || status.detail || '',
        displayClock: status.displayClock || '',
    };
}

function liigaSnapshot(game) {
    let state;
    if (game.ended)        state = 'post';
    else if (game.started) state = 'in';
    else                   state = 'pre';

    const ft = game.finishedType;
    const statusText = state === 'post'
        ? (ft === 'ENDED_DURING_OVERTIME' ? 'JA' : ft === 'ENDED_DURING_SHOOTOUT' ? 'VL' : 'Lopputulos')
        : state === 'in' ? `${game.currentPeriod}. erä` : '';

    return {
        id:           String(game.id),
        homeScore:    String(game.homeTeam.goals ?? 0),
        awayScore:    String(game.awayTeam.goals ?? 0),
        state,
        statusText,
        displayClock: state === 'in' ? `${game.currentPeriod}. erä` : '',
    };
}

// ── Tila ───────────────────────────────────────────────────────────────────
const prevSnapshots = new Map();  // eventId → snapshot
const currentState  = new Map();  // leagueKey → snapshot[]
let   pollTimer     = null;

// ── Polling ────────────────────────────────────────────────────────────────
async function pollAll() {
    const today   = new Date();
    today.setHours(0, 0, 0, 0);

    const updates  = [];
    let   hasLive  = false;

    for (const [key, league] of Object.entries(LEAGUES)) {
        try {
            let snapshots;
            if (league.isLiiga) {
                const games = await fetchTodayLiiga(today);
                snapshots   = games.map(liigaSnapshot);
            } else {
                const events = await fetchTodayESPN(league, today);
                snapshots    = events.map(espnSnapshot);
            }

            currentState.set(key, snapshots);

            for (const snap of snapshots) {
                if (snap.state === 'in') hasLive = true;

                const prev    = prevSnapshots.get(snap.id);
                const changed = !prev
                    || prev.homeScore    !== snap.homeScore
                    || prev.awayScore    !== snap.awayScore
                    || prev.state        !== snap.state
                    || prev.displayClock !== snap.displayClock
                    || prev.statusText   !== snap.statusText;

                if (changed) {
                    if (prev && snap.state === 'in') {
                        console.log(`[${key}] ${snap.id} | kello: ${snap.statusText || snap.displayClock} | tulos: ${snap.homeScore}-${snap.awayScore}`);
                    }
                    updates.push({
                        leagueKey:   key,
                        snapshot:    snap,
                        stateChange: prev ? prev.state !== snap.state : false,
                    });
                    prevSnapshots.set(snap.id, { ...snap });
                }
            }
        } catch (err) {
            console.error(`[poll] ${key}: ${err.message}`);
        }
    }

    if (updates.length > 0) {
        console.log(`[poll] ${updates.length} muutosta löytyi`);
        broadcast({ type: 'score_update', updates });
    }

    // Nopeampi polling kun live-otteluita käynnissä
    const nextInterval = hasLive ? POLL_LIVE : POLL_INTERVAL;
    clearTimeout(pollTimer);
    pollTimer = setTimeout(pollAll, nextInterval);
}

// ── WebSocket-palvelin ─────────────────────────────────────────────────────
const server = http.createServer(serveStatic);
const wss    = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[ws] yhteys: ${ip}`);

    // Lähetä nykyinen tila uudelle asiakkaalle heti
    const snapshot = {};
    for (const [key, snaps] of currentState) snapshot[key] = snaps;
    ws.send(JSON.stringify({ type: 'snapshot', data: snapshot }));

    ws.on('close', () => console.log(`[ws] yhteys katkesi: ${ip}`));
    ws.on('error', err => console.error(`[ws] virhe: ${err.message}`));
});

function broadcast(msg) {
    const str = JSON.stringify(msg);
    wss.clients.forEach(client => {
        if (client.readyState === 1 /* OPEN */) client.send(str);
    });
}

// ── Staattisten tiedostojen tarjoilu ───────────────────────────────────────
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.ico':  'image/x-icon',
    '.svg':  'image/svg+xml',
};

function serveStatic(req, res) {
    // Salli CORS (FPL-proxy ei enää tarvita tätä, mutta hyvä käytäntö)
    res.setHeader('Access-Control-Allow-Origin', '*');

    let urlPath = req.url.split('?')[0]; // poista query-parametrit
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(__dirname, urlPath);
    const ext      = path.extname(filePath);

    // Estoturva: älä palvele tiedostoja hakemiston ulkopuolelta
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

// ── Käynnistys ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`\nTulospalvelu käynnissä → http://localhost:${PORT}`);
    console.log(`WebSocket-palvelin samassa portissa.`);
    console.log(`Ensimmäinen API-pollaus käynnistyy...\n`);
});

// Ensimmäinen pollaus heti, sitten automaattisesti
pollAll();
