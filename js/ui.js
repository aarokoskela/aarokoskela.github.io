'use strict';

function showTab(tab, btn) {
    // Auto-switch to PL if switching to playerstats with an unsupported league
    if (tab === 'playerstats') {
        const supported = ['pl','laliga','bl','seriea','ligue1','ucl','nhl','liiga'];
        if (!supported.includes(currentLeagueKey)) {
            currentLeagueKey = 'pl';
            document.querySelectorAll('.tab-league-picker .league-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.league === 'pl');
            });
        }
    }

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tab).classList.add('active');
    currentTab = tab;

    // Lazy load if still showing spinner
    const el = document.getElementById(tab);
    if (el.querySelector('.loading')) {
        loadTabContent(tab, getLeague());
    }
}

function loadTabContent(tab, league) {
    switch (tab) {
        case 'day':         loadDayView(currentDayDate); break;
        case 'standings':   loadStandings(league);       break;
        case 'playerstats': loadPlayerStats(league);     break;
        case 'ipa-manu':    loadIpaManUTab();             break;
    }
}


function switchLeague(leagueKey) {
    if (leagueKey === currentLeagueKey) return;
    currentLeagueKey = leagueKey;

    // Synkronoi aktiivisuus molemmissa pickereissä
    document.querySelectorAll('.tab-league-picker .league-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.league === leagueKey);
    });

    // Lataa nykyisen tabin sisältö uudelleen
    if (currentTab === 'standings' || currentTab === 'playerstats') {
        const bodyId = currentTab + '-body';
        document.getElementById(bodyId).innerHTML =
            '<div class="loading"><div class="spinner"></div>Ladataan...</div>';
        loadTabContent(currentTab, LEAGUES[leagueKey]);
    }
}

