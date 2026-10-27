/* soundline-codegen.js — maakt van een analyse-score (plus eigen getikte cues) een p5.js-sketch
   met lege, tijdgecodeerde functies, een index.html, een score.json en een MIDI-bestand.
   Pure tekst- en bytegeneratie: geen DOM, geen p5. Browser: globaal `SoundlineCodegen`; Node: `module.exports`. */
(function (root) {
  'use strict';

  const TYPES = ['section', 'bar', 'beat', 'low', 'mid', 'high', 'peak', 'silence', 'drop'];
  const NAMES = {
    en: { section: 'section', bar: 'bar', beat: 'beat', low: 'low', mid: 'mid', high: 'high', peak: 'peak', silence: 'silence', drop: 'drop' },
    nl: { section: 'sectie', bar: 'maat', beat: 'beat', low: 'laag', mid: 'midden', high: 'hoog', peak: 'piek', silence: 'stilte', drop: 'drop' },
  };
  const DESCRIBE = {
    section: 'secties (duur-cues: p loopt van 0 naar 1 over de hele sectie)',
    bar: 'maatstrepen (downbeats, maatsoort aangenomen)',
    beat: 'beats uit de beat-tracker',
    low: 'lage onsets (kick, bas)',
    mid: 'midden-onsets (snare, stem, akkoorden)',
    high: 'hoge onsets (hi-hat, transiënten)',
    peak: 'luidste momenten',
    silence: 'stiltes (duur-cues)',
    drop: 'drops: plotse sprong in niveau',
  };
  // MIDI-noten per type: slagwerk op kanaal 10, duur-cues en eigen lanes op kanaal 1.
  const MIDI_NOTES = { bar: 49, beat: 37, low: 36, mid: 38, high: 42, peak: 57, drop: 55 };

  const DEFAULTS = {
    fileName: 'track.mp3',
    audioSrc: null,              // overschrijft het pad in de sketch (bv. een blob-URL voor de preview)
    style: 'timeline',           // 'timeline' = elke cue als regel in draw(); 'compact' = cuelijst + lus
    include: { section: true, bar: true, beat: false, low: true, mid: false, high: false, peak: true, silence: true, drop: true },
    maxPerType: { section: 64, bar: 400, beat: 1200, low: 400, mid: 400, high: 400, peak: 12, silence: 32, drop: 16 },
    minStrength: 0,              // slag-cues onder deze sterkte (0..1) vallen af, vóór het maximum
    holdSec: 0.25,
    holdMode: 'fixed',           // 'fixed' = holdSec; 'untilNext' = tot de volgende cue in dezelfde lane (max holdMax)
    holdMax: 4,
    holdPerType: {},             // { low: 0.5, 'tap:kick': 1 }: in 'fixed' de duur van dat type, in 'untilNext' het maximum
    names: 'en',
    hud: true,
    embedCurves: 'level',        // 'none' | 'level' | 'all'
    canvas: [800, 800],
    p5Url: 'https://cdn.jsdelivr.net/npm/p5@2.3.4/lib/p5.min.js',
    extraEvents: [],             // eigen cues, bv. getikt: { type: 'tap:kick', lane: 'kick', key: 'k', t, dur, index, strength, label }
    midiPpq: 480,
  };

  const pad = (s, n) => String(s).padStart(n, '0');
  function fmt(s) { const m = Math.floor(s / 60), r = s - m * 60; return `${pad(m, 2)}:${r.toFixed(3).padStart(6, '0')}`; }
  const num = (x, d = 3) => Number(x.toFixed(d)).toString();
  const padNum = (x, w) => num(x).padStart(w, ' ');
  const dots = (s) => { const k = Math.round(Math.max(0, Math.min(1, s)) * 4); return '●'.repeat(k) + '○'.repeat(4 - k); };
  const isTap = (type) => typeof type === 'string' && type.startsWith('tap:');
  const INSTANT = new Set(['bar', 'beat', 'low', 'mid', 'high', 'peak', 'drop']);
  function sanitizeName(s) {
    const clean = String(s || 'tap').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
    return (/^[0-9]/.test(clean) ? 'k_' + clean : clean) || 'tap';
  }

  function typeOrder(type) { const i = TYPES.indexOf(type); return i >= 0 ? i : TYPES.length; }

  /* Alle gebeurtenissen in volgorde: analyse + eigen cues. */
  function allEvents(score, o) {
    const out = score.events.concat(o.extraEvents || []);
    out.sort((a, b) => a.t - b.t || typeOrder(a.type) - typeOrder(b.type));
    return out;
  }

  /* Kiest de cues: per type aan/uit, sterktefilter, maximum (sterkste eerst), daarna chronologisch.
     Geeft kopieën terug met `holdDur`: de effectieve duur in de sketch. */
  function selectCues(score, o) {
    const perType = {};
    for (const e of allEvents(score, o)) {
      const on = o.include[e.type] ?? isTap(e.type);
      if (!on) continue;
      if (e.dur === 0 && !isTap(e.type) && e.strength < o.minStrength) continue;
      (perType[e.type] ||= []).push(e);
    }
    const out = [];
    for (const type in perType) {
      let list = perType[type];
      const cap = o.maxPerType[type] ?? Infinity;
      if (list.length > cap) list = list.slice().sort((a, b) => b.strength - a.strength).slice(0, cap);
      out.push(...list.map((e) => Object.assign({}, e)));
    }
    out.sort((a, b) => a.t - b.t || typeOrder(a.type) - typeOrder(b.type));
    const nextOfType = {};
    const holdFor = (type) => { const v = o.holdPerType && o.holdPerType[type]; return v > 0 ? v : null; };
    for (let i = out.length - 1; i >= 0; i--) {
      const e = out[i];
      if (e.dur > 0) e.holdDur = e.dur;
      else if (o.holdMode === 'untilNext') { const next = nextOfType[e.type]; const cap = holdFor(e.type) ?? o.holdMax; e.holdDur = next ? Math.min(cap, Math.max(0.05, next.t - e.t)) : Math.min(cap, holdFor(e.type) ?? o.holdSec); }
      else e.holdDur = holdFor(e.type) ?? o.holdSec;
      nextOfType[e.type] = e;
    }
    return out;
  }

  function cueName(e, o) {
    const n = NAMES[(o && o.names) || 'en'] || NAMES.en;
    if (isTap(e.type)) return `${sanitizeName(e.lane || e.type.slice(4))}_${pad(e.index, 3)}`;
    const width = INSTANT.has(e.type) && e.type !== 'peak' && e.type !== 'drop' ? 3 : 1;
    return `${n[e.type]}_${pad(e.index, width)}`;
  }
  function cueComment(e) {
    if (e.dur > 0) return `${fmt(e.t)} → ${fmt(e.t + e.dur)} · ${e.label}`;
    const extra = INSTANT.has(e.type) && e.type !== 'peak' && e.type !== 'drop' ? ` ${dots(e.strength)}` : '';
    return `${fmt(e.t)} · ${e.label}${extra}`;
  }
  function describe(type, cues) {
    if (DESCRIBE[type]) return DESCRIBE[type];
    const lane = cues.find((c) => c.type === type);
    return `eigen cues, op gehoor getikt${lane && lane.key ? ` met toets "${lane.key}"` : ''}: ${lane ? lane.lane : type.slice(4)}`;
  }

  function generate(score, options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    o.include = Object.assign({}, DEFAULTS.include, (options || {}).include || {});
    o.maxPerType = Object.assign({}, DEFAULTS.maxPerType, (options || {}).maxPerType || {});
    const cues = selectCues(score, o);
    const counts = {};
    for (const c of cues) counts[c.type] = (counts[c.type] || 0) + 1;
    const typesInOrder = TYPES.concat([...new Set(cues.map((c) => c.type).filter(isTap))]);
    const sections = score.sections.map((s) => [num(s.start), num(s.end), `${s.index} ${s.letter || ''} ${s.level}${s.tags.length ? ' ' + s.tags.join('/') : ''}`.replace(/\s+/g, ' ')]);
    const date = new Date().toISOString().slice(0, 10);
    const bpm = score.tempo.bpm || 0;
    const beatSec = bpm ? 60 / bpm : 0;
    const nameOf = (e) => cueName(e, o);
    const nameW = Math.max(8, ...cues.map((e) => nameOf(e).length));
    const tapCount = cues.filter((c) => isTap(c.type)).length;
    const octaveNote = score.tempo.octave && score.tempo.octave.applied !== 'base' ? ', octaaf ' + score.tempo.octave.applied : '';
    const header = [
      '/* ' + '─'.repeat(70),
      `   soundline · ${o.fileName}`,
      `   gegenereerd ${date} door p5.soundline`,
      `   duur ${fmt(score.duration)} · ${bpm ? bpm.toFixed(1) + ' BPM (vertrouwen ' + score.tempo.confidence.toFixed(2) + octaveNote + ')' : 'geen tempo'} · ${score.params.meter}/4 aangenomen · ${score.sections.length} secties (${score.sections.map((s) => s.letter || '?').join(' ')}) · ${cues.length} cues${tapCount ? ` waarvan ${tapCount} eigen` : ''}`,
      '',
      '   Vul de lege functies onderaan. Elke functie wordt vanuit draw() aangeroepen op het',
      '   tijdstip in de commentaarregel ernaast. Zet het geluidsbestand naast dit bestand en',
      '   klik op het canvas (of druk spatie) om te starten.',
      '   ' + '─'.repeat(70) + ' */',
    ].join('\n');

    const curves = o.embedCurves === 'none' ? null : o.embedCurves === 'all' ? score.curves : { hz: score.curves.hz, level: score.curves.level };
    const curvesSrc = curves ? `  curves: ${JSON.stringify(curves).replace(/,"(low|mid|high|centroid|level)":/g, ',\n    "$1":').replace('{"hz"', '{\n    "hz"').replace(/\}$/, '\n  }')},` : '  curves: null,';

    const config = [
      'const SOUNDLINE = {',
      `  file: ${JSON.stringify(o.audioSrc || o.fileName)},`,
      `  duration: ${num(score.duration)},`,
      `  bpm: ${num(bpm, 2)}, beat: ${num(beatSec, 4)}, meter: ${score.params.meter},`,
      `  hud: ${o.hud ? 'true' : 'false'},        // false = tijdlijn-overlay verbergen`,
      `  hold: ${num(o.holdSec)},        // seconden dat een slag-cue actief blijft (p loopt 0 → 1)${o.holdMode === 'untilNext' ? '; hier staat de duur per cue: tot de volgende in dezelfde lane' : ''}`,
      `  sections: ${JSON.stringify(sections)},`,
      curvesSrc,
      '};',
    ].join('\n');

    const explicitDur = (e) => e.dur > 0 || o.holdMode === 'untilNext' || Math.abs(e.holdDur - o.holdSec) > 1e-9;
    // meta: sterkte (getal) voor slag-cues uit de analyse; tik-info (object) voor eigen cues. Komt in e terecht.
    const tapMeta = (e) => {
      const m = { key: e.key || null, takes: e.takes || 1, spread: +(((e.spreadMs || 0) / 1000).toFixed(3)) };
      if ((e.takes || 1) > 1) m.range = +(((e.rangeMs || 0) / 1000).toFixed(3));
      if (e.manual) m.manual = true;
      return '{' + Object.keys(m).map((k) => `${k}: ${JSON.stringify(m[k])}`).join(', ') + '}';
    };
    const metaOf = (e) => isTap(e.type) ? tapMeta(e) : INSTANT.has(e.type) ? num(e.strength, 2) : null;
    const callFor = (e) => {
      const meta = metaOf(e);
      return explicitDur(e)
        ? `during(t, ${padNum(e.t, 8)}, ${padNum(e.holdDur, 8)}, ${nameOf(e)}${meta !== null ? ', null, ' + meta : ''});`
        : `hit(t, ${padNum(e.t, 8)}, ${nameOf(e)}${meta !== null ? ', ' + meta : ''});`;
    };

    // draw()
    const drawLines = [];
    drawLines.push('function draw() {');
    drawLines.push('  background(12);');
    drawLines.push('  const t = soundlineTime();        // seconden in het nummer, -1 vóór de start');
    drawLines.push('');
    if (o.style === 'compact') {
      drawLines.push('  for (const c of CUES) during(t, c[0], c[1] || SOUNDLINE.hold, c[2], c[3], c[4]);   // duur 0 = slag-cue');
    } else {
      let currentSection = -1;
      for (const e of cues) {
        const sec = score.sections.findIndex((s) => e.t >= s.start && e.t < s.end);
        if (sec !== currentSection && e.type !== 'section') {
          currentSection = sec;
          const s = score.sections[sec];
          if (s) drawLines.push(`  // ───── ${fmt(s.start)} sectie ${s.index} · ${s.letter || ''} · ${s.level}${s.tags.length ? ' · ' + s.tags.join(', ') : ''} ─────`);
        }
        if (e.type === 'section') currentSection = sec;
        drawLines.push(`  ${callFor(e).padEnd(nameW + 32)}  // ${cueComment(e)}`);
      }
    }
    drawLines.push('');
    drawLines.push('  if (SOUNDLINE.hud) soundlineHud(t);');
    drawLines.push('}');

    const cueList = o.style === 'compact'
      ? ['// Cuelijst: [start, duur, functie, label, meta]. duur 0 = slag-cue die SOUNDLINE.hold seconden actief blijft;',
        '// meta = sterkte (0..1) of, bij eigen tikken, { key, takes, spread, range, manual }.',
        'const CUES = [',
        ...cues.map((e) => `  [${padNum(e.t, 8)}, ${padNum(explicitDur(e) ? e.holdDur : 0, 8)}, ${nameOf(e).padEnd(nameW)}, ${JSON.stringify(cueComment(e))}${metaOf(e) !== null ? ', ' + metaOf(e) : ''}],`),
        '];'].join('\n')
      : null;

    const fnLines = [];
    fnLines.push('// ' + '─'.repeat(20) + ' Lege functies, in tijdsvolgorde ' + '─'.repeat(20));
    fnLines.push('// Elke functie krijgt (t, p, e):');
    fnLines.push('//   t = seconden sinds de start van de cue, p = voortgang 0..1 binnen de cue,');
    fnLines.push('//   e = { at, dur, name, label, first, strength }  (e.first is true op het eerste frame van de cue;');
    fnLines.push('//        e.strength is de onset-sterkte 0..1, 1 voor secties en eigen tikken).');
    fnLines.push('//   Eigen tikken hebben ook e.key (de toets), e.takes (aantal keer getikt), e.spread (standaardafwijking');
    fnLines.push('//   van de takes in seconden: hoe zeker de tik is), e.range (bereik in s) en e.manual (met de hand gezet).');
    fnLines.push('// soundlineLevel(t) geeft het niveau 0..1 op elk moment' + (o.embedCurves === 'all' ? "; soundlineLevel(t, 'low'|'mid'|'high'|'centroid') ook." : '.'));
    fnLines.push('');
    for (const type of typesInOrder) {
      const list = cues.filter((e) => e.type === type);
      if (!list.length) continue;
      fnLines.push(`// ${describe(type, list)} · ${list.length}`);
      for (const e of list) fnLines.push(`function ${nameOf(e)}(t, p, e) {}${' '.repeat(Math.max(1, nameW - nameOf(e).length + 1))}// ${cueComment(e)}`);
      fnLines.push('');
    }

    const runtime = `// ${'─'.repeat(20)} soundline runtime (hoeft niet aangepast) ${'─'.repeat(20)}
const _sl = { audio: null, started: false, noAudio: false, t0: 0, active: new Map() };
function soundlineSetup() {
  _sl.audio = new Audio(SOUNDLINE.file);
  _sl.audio.preload = 'auto';
  _sl.audio.addEventListener('error', () => { _sl.noAudio = true; });
  const canvas = document.querySelector('canvas');
  if (canvas) canvas.addEventListener('pointerdown', soundlineToggle);
  window.addEventListener('keydown', (ev) => { if (ev.code === 'Space') { ev.preventDefault(); soundlineToggle(); } });
}
function soundlineToggle() {
  if (!_sl.started) {
    _sl.started = true; _sl.t0 = millis();
    if (!_sl.noAudio) _sl.audio.play().catch(() => { _sl.noAudio = true; _sl.t0 = millis(); });
  } else if (_sl.noAudio) { _sl.paused = !_sl.paused; if (_sl.paused) _sl.pausedAt = millis(); else _sl.t0 += millis() - _sl.pausedAt; }
  else if (_sl.audio.paused) _sl.audio.play(); else _sl.audio.pause();
}
function soundlineTime() {
  if (!_sl.started) return -1;
  if (_sl.noAudio) return ((_sl.paused ? _sl.pausedAt : millis()) - _sl.t0) / 1000;   // geen geluid: klok op millis()
  return _sl.audio.currentTime;
}
function soundlineSeek(seconds) { if (_sl.audio && !_sl.noAudio) _sl.audio.currentTime = seconds; else _sl.t0 = millis() - seconds * 1000; }
function hit(t, at, fn, meta) { return during(t, at, SOUNDLINE.hold, fn, null, meta); }
function during(t, at, dur, fn, label, meta) {
  const name = fn.name || label || String(at);
  if (t < at || t > at + dur) { _sl.active.delete(name); return false; }
  const first = !_sl.active.has(name);
  _sl.active.set(name, t);
  const info = typeof meta === 'number' ? { strength: meta } : (meta || {});
  fn(t - at, dur > 0 ? Math.min(1, (t - at) / dur) : 1, Object.assign({ at, dur, name, label: label || name, first, strength: 1 }, info));
  return true;
}
function soundlineLevel(t, key = 'level') {
  const c = SOUNDLINE.curves; if (!c || !c[key] || t < 0) return 0;
  const x = t * c.hz, i = Math.floor(x), a = c[key][Math.min(i, c[key].length - 1)], b = c[key][Math.min(i + 1, c[key].length - 1)];
  return a + (b - a) * (x - i);
}
function soundlineHud(t) {
  push(); resetMatrix(); noStroke(); textFont('monospace'); textSize(11); textAlign(LEFT, CENTER);
  const h = 44, y = height - h, w = width - 24, x0 = 12;
  fill(0, 180); rect(0, y, width, h);
  const u = Math.max(0, Math.min(1, t / SOUNDLINE.duration));
  for (const s of SOUNDLINE.sections) {
    const a = x0 + w * s[0] / SOUNDLINE.duration, b = x0 + w * s[1] / SOUNDLINE.duration;
    fill(t >= s[0] && t < s[1] ? 255 : 110); rect(a, y + 10, Math.max(1, b - a - 1), 4);
  }
  fill(255, 0, 0); rect(x0 + w * u - 1, y + 6, 2, 12);
  const lvl = soundlineLevel(t); fill(255); rect(x0, y + 30, w * lvl, 2);
  const mm = Math.floor(Math.max(0, t) / 60), ss = (Math.max(0, t) % 60).toFixed(1).padStart(4, '0');
  const names = [..._sl.active.keys()].slice(0, 8).join('  ');
  fill(230); text(t < 0 ? 'klik op het canvas of druk spatie om te starten' : mm + ':' + ss + '  ' + SOUNDLINE.bpm.toFixed(0) + ' bpm  ' + names, x0, y + 22);
  pop();
}`;

    const sketch = [header, '', config, '', 'function setup() {', `  createCanvas(${o.canvas[0]}, ${o.canvas[1]});`, '  soundlineSetup();', '}', '',
      drawLines.join('\n'), '', cueList, cueList ? '' : null, fnLines.join('\n'), runtime, ''].filter((x) => x !== null).join('\n');

    const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>soundline · ${escapeHtml(o.fileName)}</title>
<style>html,body{margin:0;background:#000;color:#ddd;font:12px/1.4 monospace}main{display:flex;justify-content:center;padding:16px}canvas{display:block}p{max-width:800px;margin:0 auto;padding:0 16px 16px;color:#888}</style>
<script src="${o.p5Url}"></script>
</head>
<body>
<main></main>
<p>Zet <b>${escapeHtml(o.fileName)}</b> naast dit bestand en open de map via een lokale server (bv. http://localhost/...). Klik op het canvas of druk spatie om te starten. Zonder geluidsbestand loopt de klok op millis().</p>
<script src="sketch.js"></script>
</body>
</html>
`;

    const round = (x) => Number(x.toFixed(3));
    const taps = (o.extraEvents || []).filter((e) => isTap(e.type));
    const json = {
      file: o.fileName, generated: date, duration: round(score.duration),
      tempo: { bpm: round(bpm), confidence: round(score.tempo.confidence), meter: score.params.meter, octave: score.tempo.octave || null },
      sections: score.sections.map((s) => ({ index: s.index, letter: s.letter, start: round(s.start), end: round(s.end), level: s.level, tags: s.tags, energyDb: round(s.energyDb), similarity: s.similarity == null ? null : round(s.similarity) })),
      bars: score.bars.map((b) => ({ index: b.index, t: round(b.t), bar: b.bar })),
      beats: score.beats.map((b) => ({ index: b.index, t: round(b.t), bar: b.bar, beat: b.beatInBar, strength: round(b.strength) })),
      onsets: Object.fromEntries(Object.entries(score.onsets).map(([k, v]) => [k, v.map((x) => ({ index: x.index, t: round(x.t), strength: round(x.strength) }))])),
      peaks: score.peaks.map((p) => ({ index: p.index, rank: p.rank, t: round(p.t), db: round(p.db) })),
      silences: score.silences.map((s) => ({ start: round(s.start), end: round(s.end) })),
      drops: score.drops.map((d) => ({ index: d.index, t: round(d.t), deltaDb: round(d.deltaDb) })),
      taps: taps.map((e) => ({ lane: e.lane, key: e.key || null, index: e.index, t: round(e.t), dur: round(e.dur || 0), raw: e.raw == null ? null : round(e.raw), takes: e.takes || 1, spreadMs: e.spreadMs == null ? 0 : Math.round(e.spreadMs), manual: !!e.manual })),
      selected: cues.map((c) => ({ fn: cueName(c, o), type: c.type, t: round(c.t), dur: round(c.holdDur) })),
      curves: score.curves,
      params: score.params,
    };

    const midi = buildMidi(cues, bpm || 120, o);
    return { sketch, html, json: JSON.stringify(json, null, 1), midi, cues, counts, summary: { cues: cues.length, counts, bpm, sections: score.sections.length, taps: tapCount } };
  }

  /* Standaard MIDI-bestand, formaat 0. Slag-cues op kanaal 10 (slagwerk); secties, stiltes en eigen
     lanes als gehouden noten op kanaal 1. Tijden in absolute seconden, omgezet met het gevonden tempo. */
  function buildMidi(cues, bpm, options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const ppq = o.midiPpq, secPerTick = 60 / bpm / ppq;
    const tapLanes = [...new Set(cues.map((c) => c.type).filter(isTap))];
    const events = [];   // [tick, bytes]
    for (const c of cues) {
      const tick = Math.round(c.t / secPerTick);
      const vel = Math.max(1, Math.min(127, Math.round(30 + (c.strength || 1) * 97)));
      let ch, note;
      if (isTap(c.type)) { ch = 0; note = 72 + tapLanes.indexOf(c.type) % 24; }
      else if (c.type === 'section') { ch = 0; note = 48 + (((c.label.match(/· ([A-Z]) ·/) || [0, 'A'])[1].charCodeAt(0) - 65) % 12); }
      else if (c.type === 'silence') { ch = 0; note = 36; }
      else { ch = 9; note = MIDI_NOTES[c.type] || 39; }
      const len = Math.max(1, Math.round((c.dur > 0 ? c.dur : Math.min(c.holdDur || 0.1, 0.5)) / secPerTick));
      events.push([tick, [0x90 | ch, note, vel]]);
      events.push([tick + len, [0x80 | ch, note, 0]]);
    }
    events.sort((a, b) => a[0] - b[0] || (a[1][0] & 0xf0) - (b[1][0] & 0xf0));   // note-off vóór note-on op dezelfde tick
    const track = [];
    const vlq = (n) => { const out = [n & 0x7f]; n >>= 7; while (n > 0) { out.unshift((n & 0x7f) | 0x80); n >>= 7; } return out; };
    const mpqn = Math.round(60000000 / bpm);
    track.push(...vlq(0), 0xff, 0x51, 0x03, (mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff);
    track.push(...vlq(0), 0xff, 0x03, ...vlq(9), ...[...'soundline'].map((c) => c.charCodeAt(0)));
    let last = 0;
    for (const [tick, bytes] of events) { track.push(...vlq(tick - last), ...bytes); last = tick; }
    track.push(...vlq(0), 0xff, 0x2f, 0x00);
    const be32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    const bytes = [0x4d, 0x54, 0x68, 0x64, ...be32(6), 0, 0, 0, 1, (ppq >> 8) & 0xff, ppq & 0xff, 0x4d, 0x54, 0x72, 0x6b, ...be32(track.length), ...track];
    return new Uint8Array(bytes);
  }

  /* Eenvoudige sketch: één functie per visueel moment, in volgorde, met een kleine voorbeeldtekening
     per soort moment die je vervangt. Elk moment loopt tot het volgende (p van 0 naar 1). */
  const EXAMPLE_BODIES = {
    opening: `  // voorbeeld: een cirkel die opent. Vervang dit door je eigen beeld.
  noFill(); stroke(230); strokeWeight(2);
  circle(width / 2, height / 2, width * (0.05 + 0.6 * Math.min(1, t / 2)));`,
    section: `  // voorbeeld: een nieuwe sectie krijgt haar letter en een rustige band.
  noStroke(); fill(255, 30); rect(0, height * 0.4, width * p, height * 0.2);
  fill(230); textSize(width * 0.2); textAlign(CENTER, CENTER); text(e.letter || '', width / 2, height / 2);`,
    drop: `  // voorbeeld: een rode ring die naar buiten slaat; op het eerste frame een flits.
  if (e.first) background(255);
  noFill(); stroke(255, 0, 0); strokeWeight(width * 0.008 * (1 - Math.min(1, t / 1.5)));
  circle(width / 2, height / 2, width * (0.05 + 1.2 * Math.min(1, t / 1.5)));`,
    silence: `  // voorbeeld: het beeld dooft.
  noStroke(); fill(0, 220 * Math.min(1, t / 0.8)); rect(0, 0, width, height);`,
    return: `  // voorbeeld: lijnen schieten terug het beeld in.
  stroke(230); strokeWeight(1);
  for (let i = 0; i < 24; i++) { const a = i / 24 * TWO_PI, r = width * 0.75 * Math.min(1, t); line(width / 2, height / 2, width / 2 + cos(a) * r, height / 2 + sin(a) * r); }`,
    peak: `  // voorbeeld: een witte flits die uitdooft.
  noStroke(); fill(255, 255 * Math.max(0, 1 - t / 0.6)); rect(0, 0, width, height);`,
    accent: `  // voorbeeld: een rood vierkant dat opspringt en landt.
  noStroke(); fill(255, 0, 0); const s = width * (0.08 + 0.25 * Math.max(0, 1 - t / 0.4));
  rect(width / 2 - s / 2, height / 2 - s / 2, s, s);`,
  };
  function generateSimple(score, moments, options) {
    const o = Object.assign({}, DEFAULTS, { examples: true }, options || {});
    const date = new Date().toISOString().slice(0, 10);
    const KIND_WORD = { opening: 'opening', section: 'sectie', drop: 'drop', silence: 'stilte', return: 'terug', peak: 'piek', accent: 'accent' };
    const nameOf = (m) => `m${pad(m.index, 2)}_${KIND_WORD[m.kind] || sanitizeName(m.kind)}${m.kind === 'section' && m.letter ? '_' + m.letter : ''}`;
    const nameW = Math.max(10, ...moments.map((m) => nameOf(m).length));
    const level = { hz: score.curves.hz, level: score.curves.level };
    const lines = [];
    lines.push('/* ' + '─'.repeat(70));
    lines.push(`   soundline · ${o.fileName} · ${moments.length} visuele momenten`);
    lines.push(`   gegenereerd ${date} door p5.soundline (eenvoudig voorbeeld)`);
    lines.push('');
    lines.push('   Elk moment is een functie. Ze worden in volgorde vanuit draw() aangeroepen en elk moment');
    lines.push('   loopt tot het volgende begint: t = seconden sinds het moment, p = voortgang 0..1 tot het');
    lines.push('   volgende moment, e = { at, dur, kind, label, letter, first, level }. e.level is het geluidsniveau');
    lines.push('   0..1 van dit frame. De tekeningen in de functies zijn voorbeelden: vervang ze.');
    lines.push('   Zet het geluidsbestand naast dit bestand; klik op het canvas om te starten.');
    lines.push('   ' + '─'.repeat(70) + ' */');
    lines.push('');
    lines.push('const SOUNDLINE = {');
    lines.push(`  file: ${JSON.stringify(o.audioSrc || o.fileName)},`);
    lines.push(`  duration: ${num(score.duration)},`);
    lines.push(`  hud: ${o.hud ? 'true' : 'false'},`);
    lines.push(`  moments: ${JSON.stringify(moments.map((m) => [num(m.t), num(m.dur), m.label]))},`);
    lines.push(`  curves: ${JSON.stringify(level)},`);
    lines.push('};');
    lines.push('');
    lines.push('function setup() {');
    lines.push(`  createCanvas(${o.canvas[0]}, ${o.canvas[1]});`);
    lines.push('  soundlineSetup();');
    lines.push('}');
    lines.push('');
    lines.push('function draw() {');
    lines.push('  background(12);');
    lines.push('  const t = soundlineTime();        // seconden in het nummer, -1 vóór de start');
    lines.push('');
    lines.push('  // altijd: het niveau als ademende cirkel (voorbeeld)');
    lines.push('  noStroke(); fill(40); circle(width / 2, height / 2, width * (0.12 + 0.6 * soundlineLevel(t)));');
    lines.push('');
    lines.push('  // de momenten, in volgorde; elk loopt tot het volgende');
    for (const m of moments) lines.push(`  ${`moment(t, ${padNum(m.t, 8)}, ${padNum(m.dur, 8)}, ${nameOf(m)});`.padEnd(nameW + 30)}  // ${fmt(m.t)} · ${m.label}`);
    lines.push('');
    lines.push('  if (SOUNDLINE.hud) soundlineHud(t);');
    lines.push('}');
    lines.push('');
    lines.push('// ' + '─'.repeat(20) + ' De momenten ' + '─'.repeat(20));
    for (const m of moments) {
      lines.push(`// ${fmt(m.t)} → ${fmt(m.t + m.dur)} · ${m.label}`);
      lines.push(`function ${nameOf(m)}(t, p, e) {`);
      if (o.examples) lines.push(EXAMPLE_BODIES[m.kind] || EXAMPLE_BODIES.accent);
      lines.push('}');
      lines.push('');
    }
    lines.push(`// ${'─'.repeat(20)} soundline runtime (hoeft niet aangepast) ${'─'.repeat(20)}
const _sl = { audio: null, started: false, noAudio: false, t0: 0, active: new Map(), kinds: ${JSON.stringify(Object.fromEntries(moments.map((m) => [nameOf(m), { kind: m.kind, letter: m.letter || null }])))} };
function soundlineSetup() {
  _sl.audio = new Audio(SOUNDLINE.file);
  _sl.audio.preload = 'auto';
  _sl.audio.addEventListener('error', () => { _sl.noAudio = true; });
  const canvas = document.querySelector('canvas');
  if (canvas) canvas.addEventListener('pointerdown', soundlineToggle);
  window.addEventListener('keydown', (ev) => { if (ev.code === 'Space') { ev.preventDefault(); soundlineToggle(); } });
}
function soundlineToggle() {
  if (!_sl.started) {
    _sl.started = true; _sl.t0 = millis();
    if (!_sl.noAudio) _sl.audio.play().catch(() => { _sl.noAudio = true; _sl.t0 = millis(); });
  } else if (_sl.noAudio) { _sl.paused = !_sl.paused; if (_sl.paused) _sl.pausedAt = millis(); else _sl.t0 += millis() - _sl.pausedAt; }
  else if (_sl.audio.paused) _sl.audio.play(); else _sl.audio.pause();
}
function soundlineTime() {
  if (!_sl.started) return -1;
  if (_sl.noAudio) return ((_sl.paused ? _sl.pausedAt : millis()) - _sl.t0) / 1000;
  return _sl.audio.currentTime;
}
function moment(t, at, dur, fn) {
  const name = fn.name;
  if (t < at || t >= at + dur) { _sl.active.delete(name); return false; }
  const first = !_sl.active.has(name);
  _sl.active.set(name, t);
  const k = _sl.kinds[name] || {};
  push();
  fn(t - at, dur > 0 ? Math.min(1, (t - at) / dur) : 1, { at, dur, name, kind: k.kind, letter: k.letter, label: name, first, level: soundlineLevel(t) });
  pop();
  return true;
}
function soundlineLevel(t) {
  const c = SOUNDLINE.curves; if (!c || t < 0) return 0;
  const x = t * c.hz, i = Math.floor(x), a = c.level[Math.min(i, c.level.length - 1)], b = c.level[Math.min(i + 1, c.level.length - 1)];
  return a + (b - a) * (x - i);
}
function soundlineHud(t) {
  push(); resetMatrix(); noStroke(); textFont('monospace'); textSize(11); textAlign(LEFT, CENTER);
  const h = 36, y = height - h, w = width - 24, x0 = 12;
  fill(0, 180); rect(0, y, width, h);
  for (const m of SOUNDLINE.moments) { const a = x0 + w * m[0] / SOUNDLINE.duration; fill(t >= m[0] && t < m[0] + m[1] ? 255 : 110); rect(a, y + 8, 2, 8); }
  fill(255, 0, 0); rect(x0 + w * Math.max(0, Math.min(1, t / SOUNDLINE.duration)) - 1, y + 6, 2, 12);
  const mm = Math.floor(Math.max(0, t) / 60), ss = (Math.max(0, t) % 60).toFixed(1).padStart(4, '0');
  const cur = SOUNDLINE.moments.filter((m) => t >= m[0] && t < m[0] + m[1]).map((m) => m[2]).join('  ');
  fill(230); text(t < 0 ? 'klik op het canvas om te starten' : mm + ':' + ss + '  ' + cur, x0, y + 26);
  pop();
}`);
    const sketch = lines.join('\n') + '\n';
    const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>soundline · ${escapeHtml(o.fileName)}</title>
<style>html,body{margin:0;background:#000;color:#ddd;font:12px/1.4 monospace}main{display:flex;justify-content:center;padding:16px}canvas{display:block}p{max-width:800px;margin:0 auto;padding:0 16px 16px;color:#888}</style>
<script src="${o.p5Url}"></script>
</head>
<body>
<main></main>
<p>Zet <b>${escapeHtml(o.fileName)}</b> naast dit bestand en open de map via een lokale server. Klik op het canvas om te starten.</p>
<script src="sketch.js"></script>
</body>
</html>
`;
    return { sketch, html, moments, names: moments.map(nameOf) };
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  const api = { generate, generateSimple, selectCues, cueName, sanitizeName, buildMidi, isTap, DEFAULTS, TYPES, NAMES, EXAMPLE_BODIES, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SoundlineCodegen = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
