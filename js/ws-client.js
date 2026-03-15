'use strict';

// ── WebSocket live-päivitykset ─────────────────────────────────────────────
// Yhdistää palvelimeen, kuuntelee muutoksia ja päivittää kortit DOM:issa
// ilman sivun uudelleenlatausta.
(function () {
    const WS_URL = 'ws://localhost:4000';
    let ws             = null;
    let reconnectTimer = null;
    let reconnectDelay = 2000;

    // ── Yhteyden hallinta ──────────────────────────────────────────────────
    function connect() {
        ws = new WebSocket(WS_URL);

        ws.addEventListener('open', () => {
            console.log('[ws] yhteys avattu');
            setIndicator('live');
            reconnectDelay = 2000; // nollaa backoff
            clearTimeout(reconnectTimer);
        });

        ws.addEventListener('message', (e) => {
            try { handleMessage(JSON.parse(e.data)); } catch { /* ignore */ }
        });

        ws.addEventListener('close', () => {
            setIndicator('offline');
            // Exponential backoff, max 30 s
            reconnectTimer = setTimeout(connect, reconnectDelay);
            reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        });

        ws.addEventListener('error', () => {
            ws.close();
        });
    }

    // ── Viestien käsittely ─────────────────────────────────────────────────
    function handleMessage(msg) {
        if (msg.type === 'snapshot') {
            // Alkutila vastaanotettu — ei visuaalista muutosta, data on jo renderöity REST:llä
            return;
        }

        if (msg.type === 'score_update') {
            let needsReload = false;

            for (const { snapshot, stateChange } of msg.updates) {
                if (stateChange) {
                    // Tilamuutos (pre→in tai in→post) vaatii kortin uudelleenrakentamisen
                    needsReload = true;
                } else {
                    updateCardScore(snapshot);
                }
            }

            // Yksi ladataan kaikki-kutsu riittää, vaikka useita tilamuutoksia
            if (needsReload && currentTab === 'day') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (currentDayDate.getTime() === today.getTime()) {
                    loadDayView(currentDayDate);
                }
            }
        }
    }

    // ── Kortin pistetuloksen päivitys DOM:issa ─────────────────────────────
    function updateCardScore(snap) {
        const card = document.querySelector(`[data-event-id="${snap.id}"]`);
        if (!card) return;

        // Pistetulos  "1–2"
        const scoreEl = card.querySelector('.score');
        if (scoreEl) {
            const newText = `${snap.homeScore}\u20132${snap.awayScore}`.replace('2', ''); // "X–Y"
            const correct = `${snap.homeScore}\u2013${snap.awayScore}`;
            if (scoreEl.textContent !== correct) {
                scoreEl.textContent = correct;
                flashElement(scoreEl);
            }
        }

        // Live-kello score-pillissä (statusText = "67'", displayClock = jääkiekon kello)
        const clockEl = card.querySelector('.score-detail');
        if (clockEl && snap.state === 'in') {
            clockEl.textContent = snap.statusText || snap.displayClock || 'LIVE';
        }
    }

    // ── Flash-animaatio pistetuloksen muuttuessa ───────────────────────────
    function flashElement(el) {
        el.classList.remove('score-flash');
        void el.offsetWidth; // pakota reflow animaation uudelleenkäynnistämiseksi
        el.classList.add('score-flash');
        setTimeout(() => el.classList.remove('score-flash'), 1500);
    }

    // ── Yhteysindikaattori ─────────────────────────────────────────────────
    function setIndicator(state) {
        let el = document.getElementById('ws-indicator');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ws-indicator';
            document.body.appendChild(el);
        }
        el.className = `ws-indicator ws-${state}`;
        el.title = state === 'live'
            ? 'Reaaliaikainen yhteys aktiivinen'
            : 'Yhteyttä palautetaan...';
    }

    // Käynnistys
    connect();
})();
