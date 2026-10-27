/* Controle voor soundline-taps.js: samenvoegen in een tweede ronde, spreiding, ongedaan maken,
   verplaatsen en snappen. Draai: node taps.test.js */
'use strict';
const T = require('./soundline-taps.js');
let fails = 0;
const check = (name, ok, d) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${d ? '  — ' + d : ''}`); if (!ok) fails++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// Oude opslag zonder takes wordt gemigreerd.
const old = { lanes: { k: { key: 'k', label: 'kick', taps: [{ t: 1.0, dur: 0, raw: 1.1 }] } } };
T.normalize(old);
check('migratie geeft elke tik één take', old.lanes.k.taps[0].takes.length === 1 && old.lanes.k.taps[0].takes[0].raw === 1.1);

// Eerste ronde: nieuwe tikken. Tweede ronde: samenvoegen binnen het venster.
const store = T.normalize({ lanes: {} });
const r1 = T.addTap(store, 'k', { t: 1.00, dur: 0, raw: 1.1 }, { mode: 'new' });
T.addTap(store, 'k', { t: 2.00, dur: 0, raw: 2.1 }, { mode: 'new' });
const r2 = T.addTap(store, 'k', { t: 1.04, dur: 0, raw: 1.14 }, { mode: 'merge', mergeWindowMs: 150 });
const r3 = T.addTap(store, 'k', { t: 0.98, dur: 0, raw: 1.08 }, { mode: 'merge', mergeWindowMs: 150 });
const r4 = T.addTap(store, 'k', { t: 1.50, dur: 0, raw: 1.6 }, { mode: 'merge', mergeWindowMs: 150 });
check('tweede ronde voegt samen binnen 150 ms', r2.merged && r3.merged && r2.tap === r1.tap && r1.tap.takes.length === 3);
check('buiten het venster wordt het een nieuwe tik', !r4.merged && store.lanes.k.taps.length === 3);
check('samengevoegde tik ligt op het gemiddelde van de takes', near(r1.tap.t, (1.00 + 1.04 + 0.98) / 3), r1.tap.t.toFixed(4));
const sp = T.spread(r1.tap);
check('spreiding: 3 takes, bereik 60 ms', sp.n === 3 && near(sp.rangeMs, 60, 1e-6) && sp.sdMs > 20 && sp.sdMs < 30, `sd ${sp.sdMs.toFixed(1)} ms`);
const stats = T.laneStats(store.lanes.k);
check('lane-statistiek telt tikken en takes', stats.count === 3 && stats.takes === 5 && stats.multi === 1);

// Ongedaan maken van een samengevoegde take laat de tik staan; van de laatste take verdwijnt de tik.
T.removeTake(store, 'k', r1.tap, r3.take);
check('take verwijderen herrekent het gemiddelde', r1.tap.takes.length === 2 && near(r1.tap.t, 1.02), r1.tap.t.toFixed(4));
T.removeTake(store, 'k', r4.tap, r4.take);
check('laatste take verwijderen verwijdert de tik', store.lanes.k.taps.length === 2);

// Duur-cues middelen hun duur; korte gemiddelden worden slag-cues.
T.addTap(store, 's', { t: 5.0, dur: 1.0, raw: 5.1 }, { mode: 'new' });
const rs = T.addTap(store, 's', { t: 5.05, dur: 0.8, raw: 5.15 }, { mode: 'merge' });
check('duur wordt gemiddeld', rs.merged && near(rs.tap.dur, 0.9), rs.tap.dur.toFixed(3));

// Verplaatsen zet manual; snappen slaat handmatige tikken over.
T.moveTap(r1.tap, 1.30, 100);
const evs = T.toEvents(store, { snapTargets: [1.33, 2.02, 5.0], tolSec: 0.06, duration: 100 });
const e1 = evs.find((e) => e.tap === r1.tap), e2 = evs.find((e) => e.t > 1.9 && e.t < 2.1);
check('handmatig verplaatste tik snapt niet', e1 && near(e1.t, 1.30) && e1.manual && /\(hand\)/.test(e1.label), e1 && e1.label);
check('andere tik snapt wel naar 2.02', e2 && near(e2.t, 2.02), e2 && e2.t);
check('label toont spreiding bij meerdere takes', /±\d+ ms \(2×\)/.test(e1.label), e1.label);
T.resetTap(r1.tap);
check('terugzetten herstelt het gemiddelde', !r1.tap.manual && near(r1.tap.t, 1.02));
check('cues zijn chronologisch en dragen hun tik mee', evs.every((e, i, a) => (i === 0 || a[i - 1].t <= e.t) && e.tap && e.laneKey));
T.resizeTap(rs.tap, 0.02);
check('te korte duur wordt slag-cue', rs.tap.dur === 0 && rs.tap.manual);

// Hele lane verschuiven: tikken, takes en ruwe tijden schuiven mee; voorstel uit de onsets is de mediaan.
{
  const st = T.normalize({ lanes: {} });
  T.addTap(st, 'h', { t: 1.03, dur: 0, raw: 1.13 });
  T.addTap(st, 'h', { t: 2.04, dur: 0, raw: 2.14 });
  T.addTap(st, 'h', { t: 3.02, dur: 0, raw: 3.12 });
  T.addTap(st, 'h', { t: 3.06, dur: 0, raw: 3.16 }, { mode: 'merge' });
  T.addTap(st, 'h', { t: 7.00, dur: 0, raw: 7.1 });           // geen onset in de buurt
  const sug = T.suggestShift(st.lanes.h, [1.0, 2.0, 3.0, 5.0], 0.1);
  check('voorstel: 3 van 4 tikken gematcht, mediaan −40 ms', sug.n === 3 && sug.total === 4 && Math.abs(sug.medianMs - (-40)) < 1e-6, `n ${sug.n}, mediaan ${sug.medianMs.toFixed(1)} ms, gemiddeld ${sug.meanMs.toFixed(1)} ms`);
  T.shiftLane(st.lanes.h, sug.shift, 100);
  const first = st.lanes.h.taps[0], merged = st.lanes.h.taps[2];
  check('verschuiven: tik, takes en raw schuiven mee', near(first.t, 0.99) && near(first.raw, 1.09) && near(merged.takes[0].t, 2.98) && near(merged.t, 3.00), `${first.t.toFixed(3)} / ${merged.t.toFixed(3)}`);
  const ev = T.toEvents(st, { duration: 100 }).find((e) => e.tap === merged);
  check('event draagt meta met key, takes en spread in seconden', ev.meta.key === 'h' && ev.meta.takes === 2 && near(ev.meta.spread, 0.02) && near(ev.meta.range, 0.04), JSON.stringify(ev.meta));
}

console.log(fails ? `\n${fails} controle(s) mislukt` : '\nalle controles geslaagd');
process.exit(fails ? 1 : 0);
