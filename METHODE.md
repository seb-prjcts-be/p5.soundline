# Methode: van geluidsbestand naar tijdgecodeerde p5-functies

Datum: 27 oktober 2026. Dit document beschrijft wat `soundline-analysis.js` en `soundline-codegen.js` precies doen, welke keuzes daarin zitten, wat geverifieerd is en wat niet. Het is een onderzoeksnotitie bij het lab, geen definitieve specificatie.

## 1. Doel en afbakening

Het lab beantwoordt één vraag: **wanneer gebeurt er iets in dit geluidsbestand, en hoe geef ik die momenten als lege, benoemde functies aan een p5.js-sketch?** De functies tekenen niets; de sketch roept ze aan op het juiste moment. Wat erin komt, is aan de maker.

Bewust buiten beeld: toonhoogte- en akkoordherkenning, stem- of instrumentherkenning, bronscheiding, en alles wat een getraind model vraagt. Alles hier is klassieke signaalverwerking die in een browser zonder bibliotheken draait en in Node controleerbaar is.

## 2. Overzicht van de pijplijn

```text
bestand ─► decodeAudioData ─► mono ─► STFT (één keer) ─► frames
                                                            │
        ┌───────────────┬──────────────┬───────────────────┼──────────────┬───────────┐
        ▼               ▼              ▼                   ▼              ▼           ▼
   onsets per band   tempo + beats   maten (downbeat)   secties (SSM)   pieken   stiltes, drops
        └───────────────┴──────────────┴───────────────────┴──────────────┴───────────┘
                                                            │
                                             events (chronologisch) ─► codegen ─► sketch.js / index.html / score.json
```

De splitsing tussen `stft` (zwaar, één keer) en `detect` (licht, bij elke schuif) is de belangrijkste ontwerpkeuze voor het lab: een nummer van twee minuten kost minder dan een seconde FFT en rond 70 ms detectie, dus elke parameter voelt direct.

## 3. Decoderen en STFT

- Decoderen gebeurt met `AudioContext.decodeAudioData`; kanalen worden gemiddeld naar mono. De samplefrequentie is die van de decoder (vaak 44,1 of 48 kHz), niet van het bestand.
- Frames: Hann-venster van `fftSize` samples, verschoven met `hop`. Standaard 2048/512.
- Het tijdstip van frame *f* is het midden van het venster: `(f·hop + fftSize/2) / sr`. Zo liggen onsets niet systematisch te vroeg.
- De FFT is een eigen radix-2 Cooley-Tukey (in place, tabellen per grootte gecachet). Magnitudes worden gedeeld door `fftSize/4`, de piekversterking van een Hann-venster, zodat een volle sinus ongeveer 1,0 geeft.

| fftSize / hop | frame-afstand bij 44,1 kHz | bin-breedte | gebruik |
| --- | --- | --- | --- |
| 1024 / 256 | 5,8 ms | 43 Hz | strakke percussie, hi-hats |
| 2048 / 512 | 11,6 ms | 21,5 Hz | standaard |
| 4096 / 1024 | 23,2 ms | 10,8 Hz | trage, tonale muziek; beter laag |

Per frame worden bewaard: RMS en RMS in dBFS (over het hop-centrum, zonder venster), spectrale centroid (Hz), spectrale vlakheid (0..1), spectrale flux per band, zeven bandenergieën in dB (sub 20–60, bass 60–150, lowmid 150–400, mid 400–1200, himid 1200–3500, high 3500–9000, air 9000–16000) en een log-spectrogram van 96 bins (30 Hz–16 kHz) als bytes voor weergave en sectie-analyse.

## 4. Onsets

**Detectiefunctie.** Spectrale flux op log-gecomprimeerde magnitudes, half-golf gelijkgericht, per band gemiddeld over de bins:

```text
L_k[f]   = log(1 + λ·|X_k[f]|)             λ = 20
flux_b[f] = (1 / |b|) · Σ_{k∈b} max(0, L_k[f] − L_k[f−1])
```

De log-compressie maakt zachte aanzetten even zichtbaar als luide en is de gangbare keuze sinds Böck en Widmer (2013). Drie banden: laag 20–150 Hz (kick, bas), midden 150–2000 Hz (snare, stem, akkoorden), hoog 2–16 kHz (hi-hat, transiënten). `flux.all` is het gemiddelde van de drie en voedt de tempo-schatting.

**Peak-picking** (naar Böck, Krebs en Schedl 2012). Frame *i* is een onset als, na een 3-frames gemiddelde:

1. `o[i]` het maximum is in `[i − 30 ms, i + 30 ms]`;
2. `o[i] ≥ mean(o[i − 100 ms .. i + 70 ms]) + δ`;
3. de vorige onset minstens `onsetMinGapMs` (80 ms) geleden is; bij conflict wint de sterkste.

De drempel δ hangt af van de schuif *gevoeligheid s* (0..1) en van de schaal van het signaal zelf, het 95e percentiel van de envelop: `δ = P95 · (0,04 + 0,9·(1 − s)²)`. Daardoor betekent 0,5 op een zacht nummer hetzelfde als op een luid nummer. De gerapporteerde *sterkte* is `o[i] / P95`, begrensd op 1.

Onsets worden niet weggefilterd in stiltes: een eerste slag na een stilte is precies het soort moment dat je wilt hebben.

## 5. Tempo

**Autocorrelatie** van de onset-envelop na aftrek van een lopend gemiddelde van 0,5 s (half-golf gelijkgericht), over lags tussen `bpmMin` en `bpmMax` (55–210). Elke lag krijgt een score:

```text
score[τ] = (acf[τ] + 0,5·acf[2τ] + 0,25·acf[τ/2]) · prior(bpm)
prior(bpm) = exp(−½ · (log2(bpm / bpmPrior) / σ)²)        bpmPrior = 120, σ = 1 octaaf
```

De harmonische termen helpen het echte tempo te kiezen boven een subharmonische; de prior (Ellis 2007) lost de rest van de octaafambiguïteit op in het voordeel van de buurt van 120. De beste lag wordt parabolisch verfijnd. Het **vertrouwen** is `(score_max / score_gemiddeld − 1) / 6`, begrensd op 0..1: een scherpe piek geeft 1, een vlak spectrum geeft bijna 0. Het lab toont de vier beste kandidaten, omdat de juiste keuze bij muziek zonder duidelijke puls aan de maker is.

## 6. Beats en maten

**Beat-tracking** met dynamisch programmeren (Ellis 2007). Met periode *P* in frames en strakheid α:

```text
C[i] = o[i] + max_{τ ∈ [P/2, 2P]} ( C[i − τ] − α · ln²(τ / P) )
```

De beats volgen uit teruglopen vanaf het hoogste `C` in de laatste periode. De envelop wordt genormeerd op haar P95, zodat α = 300 betekent: één procent afwijking van de periode kost ongeveer 0,03 beat-eenheid, tien procent kost 2,7. Kleine tempodrift wordt dus gevolgd, een halvering niet. Beats binnen een gedetecteerde stilte worden verwijderd.

**Downbeat.** Voor elke fase 0..`meter−1` wordt `Σ flux_low + ½·flux_all` op de betrokken beats opgeteld; de fase met de meeste lage energie wordt maat-één. Dit is de simpelste bruikbare aanname (kick op de één) en gaat mis bij muziek met de nadruk op de twee en vier of zonder lage slag. De maatsoort is een instelling (4/4, 3/4, 2/4), geen detectie. Beats vóór de eerste downbeat krijgen maatnummer 0 (opmaat).

## 7. Secties

**Kenmerken.** Per venster van 0,5 s: 24 gemiddelde log-bandenergieën (gegroepeerd uit de 96 spectrogram-bins) plus het genormaliseerde niveau, als eenheidsvector.

**Zelfgelijkenis en nieuwheid** (Foote 2000). De gelijkenis tussen vensters is de cosinus van hun kenmerkvectoren. Een dambord-kernel met Gaussische afval en halve breedte `sectionKernelSec / 2` (standaard 5 s) schuift langs de diagonaal:

```text
N[w] = Σ_{a,b ∈ [−L, L)} K[a][b] · S[w+a][w+b]         K = teken(a·b) · gauss(a,b)
```

Een hoge `N[w]` betekent: wat vóór *w* komt lijkt op zichzelf, wat erna komt lijkt op zichzelf, en de twee lijken niet op elkaar. De curve wordt genormeerd op haar maximum en staat in de tijdlijn als witte lijn.

**Grenzen.** Eerst worden begin en einde van elke stilte langer dan 1,5 s als grens vastgelegd. Daarna de nieuwheidspieken: lokale maxima (±2 vensters) boven `gemiddelde + σ·(0,3 + 2,2·(1 − gevoeligheid))`, waarbij gemiddelde en σ berekend zijn zonder de hoogste 2 % van de curve (één dominante grens, zoals een outro, mag de rest niet verbergen), sterkste eerst, met minimale afstand `sectionMinSec` (6 s) tot elke al gekozen grens. Grenzen uit nieuwheid snappen naar de dichtstbijzijnde maatstreep binnen 2 s, als er maten zijn.

**Labels.** Per sectie het gemiddelde niveau; ten opzichte van de luidste sectie: `loud` (≥ −3 dB), `mid`, `quiet` (≤ −12 dB). Hints: `intro` (eerste sectie, niet luid), `outro` (laatste, niet luid), `lift` (6 dB luider dan de vorige), `breakdown` (6 dB zachter), `peak` (luid zonder andere hint). Dit zijn niveauhints, geen vormanalyse.

## 8. Pieken, stiltes, drops

- **Stilte**: het 125 ms-gemiddelde niveau ligt onder `max(−60 dBFS, P99,5 − silenceDropDb)`, standaard 45 dB onder de top, gedurende minstens 400 ms.
- **Piek**: lokaal maximum van het 0,5 s-gemiddelde niveau, minstens zo luid als het gemiddelde van het nummer, niet in een stilte; de `peakCount` luidste met minstens 6 s tussenruimte. `rank` geeft de volgorde van luidheid, `index` de volgorde in tijd.
- **Drop**: het 50 ms-niveau springt minstens `dropMinDb` (8 dB) boven het gemiddelde van de voorgaande 2 s, die aanloop lag onder het gemiddelde van het nummer, en het nieuwe niveau zit op of boven dat gemiddelde. Binnen 10 s wint de grootste sprong.

## 9. Niveaucurves

Voor de sketch worden vijf curves gedownsampled naar ongeveer 20 Hz (het dichtstbijzijnde gehele aantal frames): `level` (lineair tussen stiltevloer en top), `low`, `mid`, `high` (bandenergie in een venster van 50 dB onder hun eigen top) en `centroid` (log-schaal 50 Hz–10 kHz). De sketch interpoleert lineair. Zo heeft een sketch toegang tot "hoe luid is het nu" zonder zelf een FFT te draaien en zonder p5.sound.

## 10. Codegeneratie

Elke gebeurtenis wordt een cue met een eigen functie. Namen zijn `type_index`, met de index uit de analyse (niet hernummerd na een maximum), zodat `low_017` hetzelfde moment blijft als je later minder cues meeneemt.

| type | aanroep | actief |
| --- | --- | --- |
| section, silence | `during(t, start, duur, fn)` | de hele duur, `p` 0 → 1 |
| bar, beat, low, mid, high, peak, drop | `hit(t, start, fn)` | `SOUNDLINE.hold` seconden (0,25 s), `p` 0 → 1 |

`during` houdt per functienaam bij of hij vorig frame al actief was; `e.first` is daardoor één frame waar. De klok is `audio.currentTime`; als het bestand niet laadt of `play()` wordt geweigerd, loopt de klok op `millis()` zodat de sketch nooit stilvalt. De HUD toont tijd, secties, niveau en actieve cues en is één vlag.

Twee stijlen. *Tijdlijn*: elke cue een regel in `draw()`, met sectiekoppen; dit is letterlijk een tijdgecodeerde functielijst in `draw`, leesbaar en bewerkbaar met de hand, maar lang bij veel beats. *Compact*: dezelfde functies, een `CUES`-lijst en één lus. In beide staan de lege functies in tijdsvolgorde met het tijdstip als commentaar.

## 11. Verificatie

**Synthetisch signaal** (`node analysis.test.js`, uitvoer in `research/analysis-verification.json`): 24 s, 120 BPM, kick (55 Hz, 180 ms) op elke tel, hi-hat (ruis, 50 ms) op elke achtste, ruisbodem op −55 dBFS, een pad van 8 tot 15 s, stilte van 15 tot 17 s, daarna een vol signaal. Resultaten met standaardinstellingen:

| controle | resultaat |
| --- | --- |
| lage onsets op de kicks (±30 ms) | recall 0,98, precisie 1,00 |
| hoge onsets op de hi-hats (±30 ms) | recall 1,00, precisie 1,00 |
| tempo | 120,1 BPM, vertrouwen 1,00 |
| beats op de kicks (±40 ms) | recall 0,98, precisie 0,96 |
| stilte | 15,12–16,88 s |
| sectiegrenzen | 8,00 s, 15,12 s, 16,88 s |
| drop | 17,04 s, +43 dB |
| sterkste piek | in het volle deel (22,0 s) |

De eerste versie faalde op dit signaal: de gaten tussen de slagen golden als stilte en onsets werden daarin weggefilterd. Dat leidde tot de ruisbodem in de test (echte opnames hebben er altijd een) en tot het laten vallen van het stiltefilter voor onsets. Ook de nieuwheidsgrens op 8 s viel eerst weg, omdat een sterkere piek binnen de minimale afstand elke zwakkere verwierp; de greedy keuze (sterkste eerst, afstand tot *gekozen* grenzen) loste dat op.

**Gegenereerde sketch** (`node codegen.test.js`): voor beide stijlen en beide naamtalen is de sketch geldige JavaScript, heeft elke cue in `draw()` precies één lege functie, zijn de namen uniek, en vuurt de eerste lage onset in een gesimuleerde p5-omgeving op de twee frames binnen de houdtijd en niet daarbuiten, met `e.first` één keer waar. Deze test vond een echte fout: in de compacte stijl kregen slag-cues duur 0 en vuurden ze nooit.

**brunk.mp3 in de browser** (Chromium in de desktop-app, 1680 × 1000): 1:57,5 bij 48 kHz, 11 016 frames op 93,8 fps; FFT 0,95 s, detectie 71 ms; 489 cues in de standaardselectie. Tempo 164,9 BPM met vertrouwen 0,13 en kandidaten 165,4 / 110,3 / 82,7 / 122,3: het nummer heeft geen duidelijke puls en het lab zegt dat ook. Twee secties (de lange hoofdsectie en een outro na 1:52), ook bij gevoeligheid 0,85: de klankkleur verandert weinig. De preview draait de gegenereerde sketch met p5 2.3.4 en de HUD.

**Niet geverifieerd.** Er is niet geluisterd of de onsets van brunk.mp3 muzikaal kloppen; recall en precisie op echte muziek zijn onbekend. Andere browsers, mobiel en zeer lange bestanden (meer dan tien minuten; het spectrogram-beeld groeit lineair mee) zijn niet getest. De drop-detector is alleen op het synthetische signaal gecontroleerd.

## 12. Beperkingen en open vragen

- **Octaafambiguïteit** blijft de zwakste plek van tempo. Een beat-synchrone tweede ronde (tempo opnieuw schatten op de gevonden beats) of een vergelijking van beat-sterktes op 1× en 2× kan helpen.
- **Secties** reageren op klankkleur en niveau. Herhaling (couplet dat terugkomt) is zichtbaar in de zelfgelijkenismatrix maar wordt niet gebruikt; een padalgoritme over de matrix zou secties ook kunnen *benoemen* (A, B, A). Chroma-kenmerken zouden harmonische wendingen zichtbaar maken die nu wegvallen.
- **Harmonisch/percussief scheiden** (mediaanfilters over het spectrogram) zou de lage en hoge onsets zuiverder maken bij dichte mixen zoals brunk.mp3.
- **Tempodrift** wordt gevolgd zolang hij klein is; ritardando of een live-opname vraagt om lokale tempo-schatting per sectie.
- De gegenereerde sketch gebruikt het **HTML-audio-element** als klok. Dat is precies genoeg voor beeld op 60 fps (de fout ligt onder één frame), maar niet sample-nauwkeurig; wie geluid wil synthetiseren moet naar de Web Audio-klok.
- De **duur van een slag-cue** is één getal voor alle cues. Een natuurlijker keuze is "tot de volgende cue in dezelfde lane" of een duur per type; beide zijn kleine wijzigingen in de generator.
- **Export naar andere vormen** ligt voor de hand: een MIDI-bestand met noten op de cues, een `.pde` voor processing.waves, of een p5.waves-compositie waarin elke sectie een eigen golf krijgt.

## 13. Bronnen

- J. Foote, *Automatic audio segmentation using a measure of audio novelty*, ICME 2000.
- D. Ellis, *Beat tracking by dynamic programming*, Journal of New Music Research 36(1), 2007.
- S. Böck, F. Krebs, M. Schedl, *Evaluating the online capabilities of onset detection methods*, ISMIR 2012.
- S. Böck, G. Widmer, *Maximum filter vibrato suppression for onset detection*, DAFx 2013 (log-compressie en spectrale flux).
- S. Dixon, *Onset detection revisited*, DAFx 2006.
