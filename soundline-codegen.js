/* soundline-codegen.js — maakt van een analyse-score een p5.js-sketch met lege,
   tijdgecodeerde functies. Pure tekstgeneratie: geen DOM, geen p5. Werkt in de
   browser (globaal `SoundlineCodegen`) en in Node (`module.exports`). */
(function (root) {
  'use strict';

  const TYPES = ['section', 'bar', 'beat', 'low', 'mid', 'high', 'peak', 'silence', 'drop'];
  const NAMES = {
    en: { section: 'section', bar: 'bar', beat: 'beat', low: 'low', mid: 'mid', high: 'high', peak: 'peak', silence: 'silence', drop: 'drop' },
    nl: { section: 'sectie', bar: 'maat', beat: 'beat', low: 'laag', mid: 'midden', high: 'hoog', peak: 'piek', silence: 'stilte', drop: 'drop' },
  };
  const DESCRIBE = {
    section: 'secties (duur-cues: p loopt van 0 naar 1 over de hele sectie)',
    bar: 'maatstrepen (downbeats, 4/4 aangenomen)',
    beat: 'beats uit de beat-tracker',
    low: 'lage onsets (kick, bas)',
    mid: 'midden-onsets (snare, stem, akkoorden)',
    high: 'hoge onsets (hi-hat, transiënten)',
    peak: 'luidste momenten',
    silence: 'stiltes (duur-cues)',
    drop: 'drops: plotse sprong in niveau',
  };

  const DEFAULTS = {
    fileName: 'track.mp3',
    audioSrc: null,              // overschrijft het pad in de sketch (bv. een blob-URL voor de preview)
    style: 'timeline',           // 'timeline' = elke cue als regel in draw(); 'compact' = cuelijst + lus
    include: { section: true, bar: true, beat: false, low: true, mid: false, high: false, peak: true, silence: true, drop: true },
    maxPerType: { section: 64, bar: 400, beat: 1200, low: 400, mid: 400, high: 400, peak: 12, silence: 32, drop: 16 },
    holdSec: 0.25,
    names: 'en',
    hud: true,
    embedCurves: 'level',        // 'none' | 'level' | 'all'
    canvas: [800, 800],
    p5Url: 'https://cdn.jsdelivr.net/npm/p5@2.3.4/lib/p5.min.js',
  };

  const pad = (s, n) => String(s).padStart(n, '0');
  function fmt(s) { const m = Math.floor(s / 60), r = s - m * 60; return `${pad(m, 2)}:${r.toFixed(3).padStart(6, '0')}`; }
  const num = (x, d = 3) => Number(x.toFixed(d)).toString();
  const padNum = (x, w) => num(x).padStart(w, ' ');
  const dots = (s) => { const k = Math.round(Math.max(0, Math.min(1, s)) * 4); return '●'.repeat(k) + '○'.repeat(4 - k); };

  /* Kiest de cues: per type aan/uit en een maximum (sterkste eerst), daarna chronologisch. */
  function selectCues(score, o) {
    const perType = {};
    for (const e of score.events) {
      if (!o.include[e.type]) continue;
      (perType[e.type] ||= []).push(e);
    }
    const out = [];
    for (const type in perType) {
      let list = perType[type];
      const cap = o.maxPerType[type] ?? Infinity;
      if (list.length > cap) list = list.slice().sort((a, b) => b.strength - a.strength).slice(0, cap);
      out.push(...list);
    }
    out.sort((a, b) => a.t - b.t || TYPES.indexOf(a.type) - TYPES.indexOf(b.type));
    return out;
  }

  function cueName(e, o) {
    const n = NAMES[o.names] || NAMES.en;
    const width = e.type === 'beat' || e.type === 'bar' || ['low', 'mid', 'high'].includes(e.type) ? 3 : 1;
    return `${n[e.type]}_${pad(e.index, width)}`;
  }
  function cueComment(e) {
    if (e.dur > 0) return `${fmt(e.t)} → ${fmt(e.t + e.dur)} · ${e.label}`;
    const extra = ['low', 'mid', 'high', 'beat', 'bar'].includes(e.type) ? ` ${dots(e.strength)}` : '';
    return `${fmt(e.t)} · ${e.label}${extra}`;
  }

  function generate(score, options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    o.include = Object.assign({}, DEFAULTS.include, (options || {}).include || {});
    o.maxPerType = Object.assign({}, DEFAULTS.maxPerType, (options || {}).maxPerType || {});
    const cues = selectCues(score, o);
    const counts = {};
    for (const c of cues) counts[c.type] = (counts[c.type] || 0) + 1;
    const sections = score.sections.map((s) => [num(s.start), num(s.end), `${s.index} ${s.level}${s.tags.length ? ' ' + s.tags.join('/') : ''}`]);
    const date = new Date().toISOString().slice(0, 10);
    const bpm = score.tempo.bpm || 0;
    const beatSec = bpm ? 60 / bpm : 0;
    const nameOf = (e) => cueName(e, o);
    const nameW = Math.max(8, ...cues.map((e) => nameOf(e).length));
    const header = [
      '/* ' + '─'.repeat(70),
      `   soundline · ${o.fileName}`,
      `   gegenereerd ${date} door p5.soundline`,
      `   duur ${fmt(score.duration)} · ${bpm ? bpm.toFixed(1) + ' BPM (vertrouwen ' + score.tempo.confidence.toFixed(2) + ')' : 'geen tempo'} · ${score.params.meter}/4 aangenomen · ${score.sections.length} secties · ${cues.length} cues`,
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
      `  hold: ${num(o.holdSec)},        // seconden dat een slag-cue actief blijft (p loopt 0 → 1)`,
      `  sections: ${JSON.stringify(sections)},`,
      curvesSrc,
      '};',
    ].join('\n');

    // draw()
    const drawLines = [];
    drawLines.push('function draw() {');
    drawLines.push('  background(12);');
    drawLines.push('  const t = soundlineTime();        // seconden in het nummer, -1 vóór de start');
    drawLines.push('');
    if (o.style === 'compact') {
      drawLines.push('  for (const c of CUES) during(t, c[0], c[1] || SOUNDLINE.hold, c[2], c[3]);   // duur 0 = slag-cue');
    } else {
      let currentSection = -1;
      for (const e of cues) {
        const sec = score.sections.findIndex((s) => e.t >= s.start && e.t < s.end);
        if (sec !== currentSection && e.type !== 'section') {
          currentSection = sec;
          const s = score.sections[sec];
          if (s) drawLines.push(`  // ───── ${fmt(s.start)} sectie ${s.index} · ${s.level}${s.tags.length ? ' · ' + s.tags.join(', ') : ''} ─────`);
        }
        if (e.type === 'section') currentSection = sec;
        const call = e.dur > 0
          ? `during(t, ${padNum(e.t, 8)}, ${padNum(e.dur, 8)}, ${nameOf(e)});`
          : `hit(t, ${padNum(e.t, 8)}, ${nameOf(e)});`;
        drawLines.push(`  ${call.padEnd(nameW + 32)}  // ${cueComment(e)}`);
      }
    }
    drawLines.push('');
    drawLines.push('  if (SOUNDLINE.hud) soundlineHud(t);');
    drawLines.push('}');

    const cueList = o.style === 'compact'
      ? ['// Cuelijst: [start, duur, functie, label]. duur 0 = slag-cue die SOUNDLINE.hold seconden actief blijft.',
        'const CUES = [',
        ...cues.map((e) => `  [${padNum(e.t, 8)}, ${padNum(e.dur, 8)}, ${nameOf(e).padEnd(nameW)}, ${JSON.stringify(cueComment(e))}],`),
        '];'].join('\n')
      : null;

    const fnLines = [];
    fnLines.push('// ' + '─'.repeat(20) + ' Lege functies, in tijdsvolgorde ' + '─'.repeat(20));
    fnLines.push('// Elke functie krijgt (t, p, e):');
    fnLines.push('//   t = seconden sinds de start van de cue, p = voortgang 0..1 binnen de cue,');
    fnLines.push('//   e = { at, dur, name, label, first }  (e.first is true op het eerste frame van de cue).');
    fnLines.push('// soundlineLevel(t) geeft het niveau 0..1 op elk moment' + (o.embedCurves === 'all' ? "; soundlineLevel(t, 'low'|'mid'|'high'|'centroid') ook." : '.'));
    fnLines.push('');
    for (const type of TYPES) {
      const list = cues.filter((e) => e.type === type);
      if (!list.length) continue;
      fnLines.push(`// ${DESCRIBE[type]} · ${list.length}`);
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
function hit(t, at, fn, label) { return during(t, at, SOUNDLINE.hold, fn, label); }
function during(t, at, dur, fn, label) {
  const name = fn.name || label || String(at);
  if (t < at || t > at + dur) { _sl.active.delete(name); return false; }
  const first = !_sl.active.has(name);
  _sl.active.set(name, t);
  fn(t - at, dur > 0 ? Math.min(1, (t - at) / dur) : 1, { at, dur, name, label: label || name, first });
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
    const json = {
      file: o.fileName, generated: date, duration: round(score.duration),
      tempo: { bpm: round(bpm), confidence: round(score.tempo.confidence), meter: score.params.meter },
      sections: score.sections.map((s) => ({ index: s.index, start: round(s.start), end: round(s.end), level: s.level, tags: s.tags, energyDb: round(s.energyDb) })),
      bars: score.bars.map((b) => ({ index: b.index, t: round(b.t), bar: b.bar })),
      beats: score.beats.map((b) => ({ index: b.index, t: round(b.t), bar: b.bar, beat: b.beatInBar, strength: round(b.strength) })),
      onsets: Object.fromEntries(Object.entries(score.onsets).map(([k, v]) => [k, v.map((x) => ({ index: x.index, t: round(x.t), strength: round(x.strength) }))])),
      peaks: score.peaks.map((p) => ({ index: p.index, rank: p.rank, t: round(p.t), db: round(p.db) })),
      silences: score.silences.map((s) => ({ start: round(s.start), end: round(s.end) })),
      drops: score.drops.map((d) => ({ index: d.index, t: round(d.t), deltaDb: round(d.deltaDb) })),
      curves: score.curves,
      params: score.params,
    };

    return { sketch, html, json: JSON.stringify(json, null, 1), cues, counts, summary: { cues: cues.length, counts, bpm, sections: score.sections.length } };
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  const api = { generate, selectCues, cueName, DEFAULTS, TYPES, NAMES, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SoundlineCodegen = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
