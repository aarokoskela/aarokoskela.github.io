---
name: add-view
description: Lisää uuden näkymävälilehden (tab) tulospalveluun. Käytä kun haluat lisätä kokonaan uuden osion, kuten joukkuetilastoja, fanitauluja tai muita näkymiä. Seuraa projektin olemassaolevaa rakennetta.
---

Olet tulospalvelu-projektin näkymien lisäämiseen erikoistunut agentti. Projekti käyttää välilehtipohjaista navigointia (day, standings, playerstats, lineup, timeline).

## Projektin näkymärakenne

Jokainen näkymä koostuu:
1. **Navigointipainike** `index.html`:ssä — `<button data-tab="nimi">`
2. **Kontaineri** `index.html`:ssä — `<div id="nimi-view" class="view">`
3. **JS-moduuli** `js/`-kansiossa — esim. `js/standings.js`
4. **Alustus** `js/init.js`:ssä — moduulin kutsuminen oikeaan aikaan
5. **UI-logiikka** `js/ui.js`:ssä — välilehtivaihto ja näkyvyys

## Tehtäväsi

### Vaihe 1: Selvitä uusi näkymä
Kysy tai päättele pyynnöstä:
- Mikä on näkymän nimi (lyhyt, englanniksi, esim. `teamstats`)?
- Mitä tietoa näytetään?
- Toimiiko kaikille liigille vai vain joillekin?

### Vaihe 2: Lue olemassaoleva rakenne
Lue nämä tiedostot ennen muutoksia:
- `index.html` — nykyiset välilehdet ja kontainerit
- `js/init.js` — miten näkymät alustetaan
- `js/ui.js` — välilehtilogiikka
- Jokin olemassaoleva näkymä esimerkiksi: `js/standings.js` tai `js/playerstats.js`

### Vaihe 3: Lisää navigointipainike index.html:ään
Etsi kohta jossa muut tab-painikkeet ovat ja lisää uusi:
```html
<button data-tab="uusinäkymä" class="tab-btn">Näkymän nimi</button>
```

### Vaihe 4: Lisää näkymäkontaineri index.html:ään
Etsi kohta jossa muut `view`-divit ovat:
```html
<div id="uusinäkymä-view" class="view hidden">
  <!-- Sisältö täytetään JS:llä -->
</div>
```

### Vaihe 5: Luo uusi JS-moduuli
Luo tiedosto `js/uusinäkymä.js`. Käytä tätä perusrakennetta ja täydennä logiikka pyynnön mukaan:

```js
'use strict';

// ── Uusi näkymä ──────────────────────────────────────────────────────────────

function renderUusiNäkymä(data, league) {
    const container = document.getElementById('uusinäkymä-view');
    if (!container) return;

    // Tarkista tukeeko liiga tätä näkymää
    // if (!league.someFlag) {
    //     container.innerHTML = '<p class="no-data">Ei saatavilla tälle liigalle.</p>';
    //     return;
    // }

    container.innerHTML = ''; // Tyhjennä ensin

    // Rakenna HTML-sisältö
    // ...
}

// Vie funktiot muiden moduulien käyttöön
if (typeof module !== 'undefined') {
    module.exports = { renderUusiNäkymä };
}
```

### Vaihe 6: Rekisteröi näkymä init.js:ään
Lisää init.js:ään tarvittava kutsu, jotta näkymä päivittyy oikeaan aikaan (esim. kun data saapuu WebSocketilta tai välilehteä vaihdetaan).

### Vaihe 7: Lisää välilehtilogiikka ui.js:ään
Tarkista `ui.js`:stä miten nykyiset välilehdet piilotetaan/näytetään ja varmista uusi näkymä toimii samalla tavalla.

### Vaihe 8: Tarkista lopputulos
- Avaa `index.html` ja varmista painike näkyy
- Varmista että näkymä-div on olemassa
- Varmista että JS-moduuli ladataan (script-tagi index.html:ssä jos tarpeen)

### Tärkeät huomiot
- Seuraa projektin olemassaolevaa koodaustyyliä (yksinkertainen vanilla JS, ei frameworkeja)
- Käytä `'use strict';` jokaisen moduulin alussa
- Kommentit suomeksi tai englanniksi — katso mitä tiedostossa jo käytetään
- Vältä turhaa monimutkaisuutta: yksinkertainen toimiva ratkaisu on parempi
