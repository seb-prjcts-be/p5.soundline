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
const parsed = JSON.parse(G.generate(score, {}).json);
check('score.json is geldige JSON met secties en curves', Array.isArray(parsed.sections) && parsed.curves.level.length > 0);
console.log(fails ? `\n${fails} controle(s) mislukt` : '\nalle controles geslaagd');
process.exit(fails ? 1 : 0);
