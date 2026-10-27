# p5.soundline Lab

Laad een geluidsbestand, laat het lab de muziek ontleden en krijg een p5.js-sketch terug met **lege functies op de juiste tijdstippen in `draw()`**. Jij vult de functies; het lab levert de tijdlijn.

Open [http://localhost/p5.soundline/](http://localhost/p5.soundline/) op de lokale server. Er is geen buildstap en geen netwerk nodig behalve de Google-fonts; het rekenwerk gebeurt volledig in de browser en er wordt niets verstuurd. `brunk.mp3` in deze map dient als voorbeeld (knop **Voorbeeld: brunk.mp3**).

## Wat het lab doet

1. **Decoderen** met de Web Audio API en mengen naar mono.
2. **STFT** over het hele bestand (Hann-venster, standaard 2048/512): één FFT per hop. Dit gebeurt één keer; alle detectoren werken daarna op de bewaarde frames en reageren meteen op de schuiven.
3. **Detectoren**: onsets in drie banden (laag, midden, hoog), tempo en beats, maatstrepen, secties, luidste pieken, stiltes en drops.
4. **Codegeneratie**: een `sketch.js` met een cue per gebeurtenis, een `index.html` om hem te draaien en een `score.json` met alle gevonden tijden en niveaucurves.

De tijdlijn in het midden toont golfvorm, log-spectrogram, flux/nieuwheid/niveau en negen cue-lanen. Scrollen zoomt, slepen schuift, klikken springt; het overzicht bovenaan toont het hele nummer. De preview-tab draait de gegenereerde sketch met de HUD aan, zodat je ziet welke cues wanneer actief zijn, nog voor je iets getekend hebt.

## Het contract van de gegenereerde sketch

```js
function draw() {
  background(12);
  const t = soundlineTime();                 // seconden in het nummer, -1 vóór de start
  // ───── 00:00.000 sectie 1 · quiet · intro ─────
  during(t,        0,   14.532, section_1);  // 00:00.000 → 00:14.532 · sectie 1 · quiet · intro
  hit(t,       0.512, bar_001);              // 00:00.512 · maat 1 ●●●○
  hit(t,       0.512, low_001);              // 00:00.512 · low onset 1 ●●●●
  …
  if (SOUNDLINE.hud) soundlineHud(t);
}

function section_1(t, p, e) {}   // 00:00.000 → 00:14.532 · sectie 1 · quiet · intro
function bar_001(t, p, e) {}     // 00:00.512 · maat 1 ●●●○
function low_001(t, p, e) {}     // 00:00.512 · low onset 1 ●●●●
```

- Elke functie krijgt `(t, p, e)`: `t` seconden sinds de start van de cue, `p` voortgang 0..1, `e.first` is `true` op het eerste frame van de cue.
- Een **slag-cue** (`hit`) blijft `SOUNDLINE.hold` seconden actief (standaard 0,25 s); een **duur-cue** (`during`) loopt over de hele sectie of stilte.
- `soundlineLevel(t)` geeft het niveau 0..1 op elk moment, uit een meegeleverde curve (geen FFT in de sketch zelf). Met de optie *niveau + laag/midden/hoog + helderheid* ook `soundlineLevel(t, 'low')` enzovoort.
- De klok is `audio.currentTime` van het geluidsbestand. Klik op het canvas of druk spatie om te starten en te pauzeren. Zonder bestand loopt de klok op `millis()`.
- Stijl **compact** geeft dezelfde functies met een `CUES`-lijst en één lus in `draw()`.

De sketch is geschreven voor p5.js 2.x in globale modus en gebruikt geen p5.sound.

## Bestanden

| Bestand | Rol |
| --- | --- |
| `index.html`, `style.css`, `app.js` | het lab: laden, tijdlijn, parameters, uitvoer en preview |
| `soundline-analysis.js` | rekenkern: FFT, STFT, features, detectoren; ook in Node te laden |
| `soundline-codegen.js` | van score naar `sketch.js`, `index.html` en `score.json`; ook in Node te laden |
| `analysis.test.js` | modelcontrole met een synthetisch signaal met bekende waarheid |
| `codegen.test.js` | controle dat de gegenereerde sketch geldig is en de cues op tijd vuren |
| `vendor/p5-2.3.4.min.js` | lokale p5 voor de preview (gegenereerde `index.html` laadt p5 van jsDelivr) |
| `research/` | verificatie-uitvoer en een voorbeeldsketch |
| `METHODE.md` | formules, keuzes, verificatie en beperkingen |

Draai de controles met:

```bash
node analysis.test.js
```

```bash
node codegen.test.js
```

## Beperkingen, kort

Tempo kan een octaaf ernaast zitten (82 of 165 in plaats van 110); het vertrouwen staat ernaast en de voorkeur-BPM is instelbaar. Maten gaan uit van 4/4 (instelbaar 3/4, 2/4). Secties zijn grenzen in klankkleur en niveau, geen muzikale vormanalyse; de labels *intro*, *peak*, *lift*, *breakdown*, *outro* zijn hints op basis van niveau. Alles staat uitgebreider in [METHODE.md](METHODE.md).
