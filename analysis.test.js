/* Modelcontrole voor soundline-analysis.js. Draai: node analysis.test.js
   Synthetisch signaal met bekende waarheid: kicks op de beat (120 BPM), hi-hats op de
   achtste noten, een pad dat bij 8 s binnenkomt (sectiegrens), een stilte van 15–17 s
   en een harde herstart bij 17 s (drop). Elke bewering staat onder de meting. */
'use strict';
const A = require('./soundline-analysis.js');

const sr = 44100, dur = 24, bpm = 120;
const N = sr * dur, x = new Float32Array(N);
const beat = 60 / bpm;
const kickTimes = [], hatTimes = [];
function add(t, len, fn, gain) {
  const s0 = Math.round(t * sr), L = Math.round(len * sr);
  for (let i = 0; i < L && s0 + i < N; i++) x[s0 + i] += gain * fn(i / sr) * Math.exp(-i / L * 6);
}
let seed = 1; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
for (let i = 0; i < N; i++) x[i] += 0.003 * rnd();                         // bodem ≈ -55 dBFS, zoals een echte opname
for (let t = 0; t < dur; t += beat) {
  if (t >= 15 && t < 17) continue;                      // stilte
  kickTimes.push(t); add(t, 0.18, (s) => Math.sin(2 * Math.PI * 55 * s), 0.8);
  const h = t + beat / 2;
  if (h < 15 || h >= 17) { hatTimes.push(h); add(h, 0.05, () => rnd(), 0.25); }
}
for (let i = Math.round(8 * sr); i < Math.round(15 * sr); i++) {            // pad 8–15 s
  const s = i / sr; x[i] += 0.12 * (Math.sin(2 * Math.PI * 440 * s) + Math.sin(2 * Math.PI * 660 * s));
}
for (let i = Math.round(17 * sr); i < N; i++) {                              // vol na de drop
  const s = i / sr; x[i] += 0.25 * (Math.sin(2 * Math.PI * 220 * s) + 0.5 * Math.sin(2 * Math.PI * 1320 * s));
}

const t0 = Date.now();
const frames = A.stft(x, sr);
const score = A.detect(frames);
const ms = Date.now() - t0;

let fails = 0;
function check(name, ok, detail) { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`); if (!ok) fails++; }
function hitRate(found, truth, tol) {
  let hit = 0; for (const t of truth) if (found.some((f) => Math.abs(f - t) <= tol)) hit++;
  return { recall: hit / truth.length, precision: found.filter((f) => truth.some((t) => Math.abs(f - t) <= tol)).length / Math.max(1, found.length) };
}

console.log(`frames: ${frames.count} @ ${frames.frameRate.toFixed(2)} fps, analyse ${ms} ms`);
const low = score.onsets.low.map((o) => o.t), high = score.onsets.high.map((o) => o.t);
const rl = hitRate(low, kickTimes, 0.03), rh = hitRate(high, hatTimes, 0.03);
check('lage onsets vinden de kicks (±30 ms)', rl.recall >= 0.95 && rl.precision >= 0.9, `recall ${rl.recall.toFixed(2)} precisie ${rl.precision.toFixed(2)} (${low.length} gevonden, ${kickTimes.length} echt)`);
check('hoge onsets vinden de hi-hats (±30 ms)', rh.recall >= 0.9 && rh.precision >= 0.8, `recall ${rh.recall.toFixed(2)} precisie ${rh.precision.toFixed(2)} (${high.length} gevonden, ${hatTimes.length} echt)`);
check('tempo ≈ 120 BPM', Math.abs(score.tempo.bpm - 120) < 1.5, `${score.tempo.bpm.toFixed(2)} BPM, vertrouwen ${score.tempo.confidence.toFixed(2)}`);
const beats = score.beats.map((b) => b.t);
const rb = hitRate(beats, kickTimes, 0.04);
check('beats liggen op de kicks (±40 ms)', rb.recall >= 0.9 && rb.precision >= 0.9, `recall ${rb.recall.toFixed(2)} precisie ${rb.precision.toFixed(2)} (${beats.length} beats)`);
check('stilte 15–17 s gevonden', score.silences.some((s) => Math.abs(s.start - 15) < 0.3 && Math.abs(s.end - 17) < 0.3), JSON.stringify(score.silences.map((s) => [s.start.toFixed(2), s.end.toFixed(2)])));
const bounds = score.sections.slice(1).map((s) => s.start);
check('sectiegrens nabij 8 s (pad komt binnen)', bounds.some((b) => Math.abs(b - 8) <= 1.5), `grenzen: ${bounds.map((b) => b.toFixed(2)).join(', ')}`);
check('sectiegrens nabij 17 s (na stilte)', bounds.some((b) => Math.abs(b - 17) <= 1.0), `secties: ${score.sections.map((s) => `${s.index}:${s.level}[${s.tags}]`).join(' ')}`);
check('drop nabij 17 s', score.drops.some((d) => Math.abs(d.t - 17) < 0.3), JSON.stringify(score.drops.map((d) => [d.t.toFixed(2), d.deltaDb.toFixed(1)])));
check('sterkste piek ligt in het luide deel (≥17 s)', score.peaks.some((p) => p.rank === 1 && p.t >= 16.5), score.peaks.map((p) => `#${p.rank}@${p.t.toFixed(2)}`).join(', '));
check('geen beats of onsets in de stilte', !score.events.some((e) => e.type !== 'silence' && e.type !== 'section' && e.t > 15.2 && e.t < 16.9));
check('curves hebben de verwachte lengte', Math.abs(score.curves.level.length - dur * score.curves.hz) <= 2, `${score.curves.level.length} punten @ ${score.curves.hz.toFixed(1)} Hz`);
check('events zijn chronologisch', score.events.every((e, i, a) => i === 0 || a[i - 1].t <= e.t));

// Gevoeligheid: hogere drempel geeft niet méér onsets.
const strict = A.detect(frames, { onsetSensitivity: { low: 0.1, mid: 0.1, high: 0.1 } });
check('lagere gevoeligheid geeft niet meer onsets', strict.onsets.low.length <= score.onsets.low.length && strict.onsets.high.length <= score.onsets.high.length, `${strict.onsets.low.length}/${score.onsets.low.length} laag, ${strict.onsets.high.length}/${score.onsets.high.length} hoog`);

// ── Octaafcontrole: alleen kicks op 60 BPM. De voorkeur ligt bij 120, dus de schatter zegt 120;
//    om de andere beat is dan leeg en de controle moet naar 60 terug.
{
  const d2 = 20, N2 = sr * d2, y = new Float32Array(N2);
  for (let i = 0; i < N2; i++) y[i] = 0.003 * rnd();
  for (let tt = 0.25; tt < d2; tt += 1) { const s0 = Math.round(tt * sr); for (let i = 0; i < 0.18 * sr && s0 + i < N2; i++) y[s0 + i] += 0.8 * Math.sin(2 * Math.PI * 55 * i / sr) * Math.exp(-i / (0.18 * sr) * 6); }
  // Met een smalle voorkeur rond 120 kiest de schatter 120; de octaafcontrole moet dat terugdraaien.
  const sc = A.detect(A.stft(y, sr), { bpmPrior: 120, bpmPriorOctaves: 0.35 });
  check('octaafcontrole: schatter zegt 120 bij smalle voorkeur', Math.abs(sc.tempo.octave.estimatedBpm - 120) < 2, `${sc.tempo.octave.estimatedBpm.toFixed(1)} BPM`);
  check('octaafcontrole: 60 BPM-signaal eindigt op 60 BPM', Math.abs(sc.tempo.bpm - 60) < 1.5, `${sc.tempo.bpm.toFixed(2)} BPM, geschat ${sc.tempo.octave.estimatedBpm.toFixed(1)}, keuze ${sc.tempo.octave.applied}, alternatie ${sc.tempo.octave.alternation.toFixed(2)}, salience ${sc.tempo.octave.salience.toFixed(2)}`);
  const forced = A.detect(A.stft(y, sr), { bpmPrior: 120, bpmPriorOctaves: 0.35, tempoOctave: 'base' });
  check('octaafkeuze "base" houdt de schatting', Math.abs(forced.tempo.bpm - forced.tempo.octave.estimatedBpm) < 0.01, `${forced.tempo.bpm.toFixed(1)}`);
}
// ── A/B/A-letters: drie delen van 10 s, het derde klinkt als het eerste.
{
  const d3 = 30, N3 = sr * d3, z = new Float32Array(N3);
  for (let i = 0; i < N3; i++) z[i] = 0.003 * rnd();
  const tone = (from, to, freqs, amp) => { for (let i = from * sr; i < to * sr; i++) { const tt = i / sr; let v = 0; for (const f of freqs) v += Math.sin(2 * Math.PI * f * tt); z[i] += amp * v / freqs.length; } };
  tone(0, 10, [110, 220, 330], 0.3); tone(10, 20, [1500, 2300, 3100], 0.3); tone(20, 30, [110, 220, 330], 0.3);
  for (let tt = 0; tt < d3; tt += 0.5) { const s0 = Math.round(tt * sr); for (let i = 0; i < 0.05 * sr && s0 + i < N3; i++) z[s0 + i] += 0.2 * rnd() * Math.exp(-i / (0.05 * sr) * 6); }
  const sc = A.detect(A.stft(z, sr));
  const letters = sc.sections.map((x) => x.letter).join('');
  check('secties A B A krijgen de letters A B A', letters === 'ABA', `${letters} — ${sc.sections.map((x) => `${x.letter}:${x.start.toFixed(1)}–${x.end.toFixed(1)} sim ${x.similarity === null ? '-' : x.similarity.toFixed(2)}`).join(', ')}`);
}

// ── Visuele momenten: hoogstens max, verspreid, met de grote wendingen van het testsignaal.
{
  const vm = A.visualMoments(score, { max: 10 });
  const kinds = vm.map((m) => m.kind);
  check('visuele momenten: hoogstens 10, chronologisch, sluitend tot het einde', vm.length <= 10 && vm.length >= 4 && vm.every((m, i) => i === 0 || vm[i - 1].t < m.t) && Math.abs(vm[vm.length - 1].t + vm[vm.length - 1].dur - score.duration) < 1e-6, `${vm.length}: ${vm.map((m) => `${m.t.toFixed(1)} ${m.kind}`).join(', ')}`);
  check('opening, sectiewissel bij 8 s, stilte en drop/terugkeer bij 17 s zitten erbij', kinds[0] === 'opening' && vm.some((m) => m.kind === 'section' && Math.abs(m.t - 8) < 1.5) && vm.some((m) => m.kind === 'silence') && vm.some((m) => ['drop', 'return', 'section'].includes(m.kind) && Math.abs(m.t - 17) < 0.3), vm.map((m) => `${m.t.toFixed(1)} ${m.kind}`).join(', '));
  const few = A.visualMoments(score, { max: 3 });
  check('max 3 geeft 3 momenten met de zwaarste gewichten', few.length === 3 && few[0].kind === 'opening', few.map((m) => m.kind).join(', '));
}

require('fs').writeFileSync(__dirname + '/research/analysis-verification.json', JSON.stringify({
  date: new Date().toISOString(), frames: frames.count, frameRate: frames.frameRate, ms,
  tempo: score.tempo, onsets: { low: rl, high: rh }, beats: rb,
  sections: score.sections.map((s) => ({ start: s.start, end: s.end, level: s.level, tags: s.tags })),
  silences: score.silences.map((s) => [s.start, s.end]), drops: score.drops.map((d) => [d.t, d.deltaDb]), fails,
}, null, 2));
console.log(fails ? `\n${fails} controle(s) mislukt` : '\nalle controles geslaagd');
process.exit(fails ? 1 : 0);
