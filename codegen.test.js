/* Controle voor soundline-codegen.js: de gegenereerde sketch moet geldige JavaScript zijn,
   elke cue in draw() moet een bijbehorende lege functie hebben, en de klok moet de functies
   op het juiste moment aanroepen (gesimuleerd met een minimale p5-omgeving). Draai: node codegen.test.js */
'use strict';
const A = require('./soundline-analysis.js');
const G = require('./soundline-codegen.js');
const vm = require('vm');

const sr = 22050, dur = 12, N = sr * dur, x = new Float32Array(N);
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
for (let i = 0; i < N; i++) x[i] = 0.003 * rnd();
for (let t = 0; t < dur; t += 0.5) { const s0 = Math.round(t * sr); for (let i = 0; i < 2000 && s0 + i < N; i++) x[s0 + i] += 0.8 * Math.sin(2 * Math.PI * 55 * i / sr) * Math.exp(-i / 2000 * 6); }
for (let i = 6 * sr; i < N; i++) x[i] += 0.2 * Math.sin(2 * Math.PI * 330 * i / sr);
const score = A.detect(A.stft(x, sr));

let fails = 0;
const check = (name, ok, d) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${d ? '  — ' + d : ''}`); if (!ok) fails++; };

for (const style of ['timeline', 'compact']) {
  for (const names of ['en', 'nl']) {
    const out = G.generate(score, { fileName: 'test.mp3', style, names, include: { section: true, bar: true, beat: true, low: true, mid: true, high: true, peak: true, silence: true, drop: true }, embedCurves: 'all' });
    let syntaxOk = true, err = '';
    try { new vm.Script(out.sketch); } catch (e) { syntaxOk = false; err = e.message; }
    check(`${style}/${names}: sketch is geldige JavaScript`, syntaxOk, err || `${out.sketch.split('\n').length} regels, ${out.summary.cues} cues`);
    const declared = new Set([...out.sketch.matchAll(/^function (\w+)\(t, p, e\) \{\}/gm)].map((m) => m[1]));
    const used = [...out.sketch.matchAll(/(?:hit|during)\(t,\s*[\d.]+,\s*(?:[\d.]+,\s*)?(\w+)/g)].map((m) => m[1]);
    const usedCompact = [...out.sketch.matchAll(/^\s+\[\s*[\d.]+,\s*[\d.]+,\s*(\w+)\s*,/gm)].map((m) => m[1]);
    const all = style === 'timeline' ? used : usedCompact;
    check(`${style}/${names}: elke cue heeft een lege functie`, all.length === out.summary.cues && all.every((n) => declared.has(n)), `${all.length} aanroepen, ${declared.size} functies`);
    check(`${style}/${names}: functienamen zijn uniek`, declared.size === all.length);

    // Simulatie: minimale p5-omgeving, klok handmatig, controleer dat de eerste lage onset precies op tijd vuurt.
    const calls = [];
    const sandbox = {
      document: { querySelector: () => null }, window: { addEventListener() {} }, console,
      Audio: function () { return { addEventListener() {}, play: () => Promise.resolve(), paused: false, currentTime: 0 }; },
      createCanvas() {}, background() {}, push() {}, pop() {}, resetMatrix() {}, noStroke() {}, textFont() {}, textSize() {}, textAlign() {}, fill() {}, rect() {}, text() {},
      millis: () => 0, width: 800, height: 800, LEFT: 0, CENTER: 1, Math, Number, String, Map, JSON,
    };
    vm.createContext(sandbox);
    vm.runInContext(out.sketch + '\nsetup();', sandbox);
    const first = out.cues.find((c) => c.type === 'low');
    const fnName = G.cueName(first, { names });
    // Timeline-stijl: de functie vervangen volstaat. Compact-stijl: CUES houdt de referentie vast, dus daar vervangen we hem in de lijst.
    const override = style === 'compact'
      ? `CUES.find((c) => c[2].name === '${fnName}')[2] = function (t, p, e) { __calls.push([t, p, e.first]); };`
      : `${fnName} = function (t, p, e) { __calls.push([t, p, e.first]); };`;
    vm.runInContext(override, Object.assign(sandbox, { __calls: calls }));
    const at = Number(first.t.toFixed(3));   // de sketch rondt tijden af op 3 decimalen
    vm.runInContext(`_sl.started = true; _sl.audio.currentTime = ${at - 0.01}; draw(); _sl.audio.currentTime = ${at + 0.01}; draw(); _sl.audio.currentTime = ${at + 0.1}; draw(); _sl.audio.currentTime = ${at + 1}; draw();`, sandbox);
    check(`${style}/${names}: eerste lage onset vuurt op tijd (2 van 4 frames, e.first één keer)`, calls.length === 2 && calls[0][2] === true && calls[1][2] === false && Math.abs(calls[0][0] - 0.01) < 1e-6 && Math.abs(calls[1][0] - 0.1) < 1e-6, JSON.stringify(calls));
    const lvl = vm.runInContext(`soundlineLevel(${first.t})`, sandbox);
    check(`${style}/${names}: soundlineLevel geeft een waarde 0..1`, lvl >= 0 && lvl <= 1, String(lvl));
    if (style === 'timeline' && names === 'en') require('fs').writeFileSync(__dirname + '/research/example-output.sketch.js', out.sketch);
  }
}
// ── Nieuwe opties: duur tot de volgende cue, sterktefilter, eigen lanes en MIDI.
{
  const all = { section: true, bar: true, beat: true, low: true, mid: true, high: true, peak: true, silence: true, drop: true };
  const base = G.generate(score, { include: all });
  const until = G.generate(score, { include: all, holdMode: 'untilNext', holdMax: 4 });
  const lows = until.cues.filter((c) => c.type === 'low');
  const noOverlap = lows.every((c, i) => i === lows.length - 1 || c.t + c.holdDur <= lows[i + 1].t + 1e-9);
  check('untilNext: lage cues overlappen niet binnen hun lane', noOverlap && lows.length > 2, `${lows.length} lage cues, duren ${lows.slice(0, 3).map((c) => c.holdDur.toFixed(3)).join(', ')}`);
  check('untilNext: draw() gebruikt during() met expliciete duur', /during\(t,\s*[\d.]+,\s*[\d.]+,\s*low_001\)/.test(until.sketch));
  const strict = G.generate(score, { include: all, minStrength: 0.9 });
  check('sterktefilter laat minder slag-cues door', strict.summary.cues < base.summary.cues && strict.cues.filter((c) => c.dur === 0).every((c) => c.strength >= 0.9), `${strict.summary.cues} < ${base.summary.cues}`);

  const taps = [
    { type: 'tap:kick', lane: 'kick', key: 'k', t: 1.234, dur: 0, index: 1, strength: 1, label: 'tik k · kick 1', raw: 1.3 },
    { type: 'tap:kick', lane: 'kick', key: 'k', t: 2.5, dur: 0, index: 2, strength: 1, label: 'tik k · kick 2', raw: 2.56 },
    { type: 'tap:Sfeer laag', lane: 'Sfeer laag', key: 's', t: 3, dur: 2.5, index: 1, strength: 1, label: 'tik s · Sfeer laag 1', raw: 3.05 },
  ];
  const withTaps = G.generate(score, { include: all, extraEvents: taps });
  check('eigen lanes krijgen eigen functies', /function kick_001\(t, p, e\) \{\}/.test(withTaps.sketch) && /function sfeer_laag_001\(t, p, e\) \{\}/.test(withTaps.sketch), `${withTaps.summary.taps} eigen cues`);
  check('eigen duur-cue staat als during() in draw()', /during\(t,\s*3,\s*2\.5,\s*sfeer_laag_001\)/.test(withTaps.sketch));
  const js = JSON.parse(withTaps.json);
  check('score.json bevat de taps met ruwe tijd en letters per sectie', js.taps.length === 3 && js.taps[0].raw === 1.3 && js.sections.every((x) => /^[A-Z]$/.test(x.letter)), js.sections.map((x) => x.letter).join(''));
  let ok = true; try { new vm.Script(withTaps.sketch); } catch (e) { ok = false; }
  check('sketch met eigen lanes is geldige JavaScript', ok);

  // MIDI: header, één track, en evenveel note-on-berichten als cues.
  const m = withTaps.midi, txt = (a, b) => String.fromCharCode(...m.slice(a, b));
  const trackLen = (m[18] << 24) | (m[19] << 16) | (m[20] << 8) | m[21];   // kop 14 bytes, 'MTrk' 4, lengte 4
  let noteOns = 0;
  for (let i = 22; i < m.length - 2; i++) if ((m[i] & 0xf0) === 0x90 && m[i + 2] > 0 && (m[i - 1] & 0x80) === 0) noteOns++;
  check('MIDI: geldige kop, tracklengte klopt, note-ons = cues', txt(0, 4) === 'MThd' && txt(14, 18) === 'MTrk' && 22 + trackLen === m.length && noteOns === withTaps.summary.cues, `${m.length} bytes, ${noteOns} note-ons, ${withTaps.summary.cues} cues`);
}

// ── Duur per cue-type: vast per type, en als maximum bij 'tot de volgende'.
{
  const all = { section: true, bar: true, beat: true, low: true, mid: true, high: true, peak: true, silence: true, drop: true };
  const per = G.generate(score, { include: all, holdSec: 0.25, holdPerType: { low: 0.6, beat: 0.1 } });
  const lows = per.cues.filter((c) => c.type === 'low'), beats = per.cues.filter((c) => c.type === 'beat'), highs = per.cues.filter((c) => c.type === 'high');
  check('duur per type: laag 0,6 s, beat 0,1 s, hoog valt terug op 0,25 s', lows.every((c) => c.holdDur === 0.6) && beats.every((c) => c.holdDur === 0.1) && highs.every((c) => c.holdDur === 0.25));
  check('afwijkende duur staat expliciet als during() in draw()', /during\(t,\s*[\d.]+,\s*0\.6,\s*low_001\)/.test(per.sketch) && /hit\(t,\s*[\d.]+,\s*mid_001\)/.test(per.sketch));
  const capped = G.generate(score, { include: all, holdMode: 'untilNext', holdPerType: { low: 0.3 } });
  check('bij "tot de volgende" is de duur per type het maximum', capped.cues.filter((c) => c.type === 'low').every((c) => c.holdDur <= 0.3 + 1e-9));
}

const parsed = JSON.parse(G.generate(score, {}).json);
check('score.json is geldige JSON met secties en curves', Array.isArray(parsed.sections) && parsed.curves.level.length > 0);
console.log(fails ? `\n${fails} controle(s) mislukt` : '\nalle controles geslaagd');
process.exit(fails ? 1 : 0);
