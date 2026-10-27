/* app.js — p5.soundline Lab: bestand laden, decoderen, analyseren, tijdlijn tekenen, tikken op gehoor,
   sketch genereren. Rekenwerk zit in soundline-analysis.js, tiklogica in soundline-taps.js,
   tekstgeneratie in soundline-codegen.js. */
(() => {
  'use strict';
  const A = window.SoundlineAnalysis, G = window.SoundlineCodegen, T = window.SoundlineTaps;
  const $ = (id) => document.getElementById(id);
  const fmt = A.fmtTime;

  const LANES = [
    { type: 'section', label: 'secties' }, { type: 'bar', label: 'maten' }, { type: 'beat', label: 'beats' },
    { type: 'low', label: 'laag' }, { type: 'mid', label: 'midden' }, { type: 'high', label: 'hoog' },
    { type: 'peak', label: 'pieken' }, { type: 'silence', label: 'stiltes' }, { type: 'drop', label: 'drops' },
  ];
  const INSTANT_TYPES = new Set(['bar', 'beat', 'low', 'mid', 'high', 'peak', 'drop']);
  const ROWS = { ruler: 20, wave: 110, spec: 150, curves: 70, lane: 18 };
  const LANE_TOP = ROWS.ruler + ROWS.wave + ROWS.spec + ROWS.curves;
  const SETTINGS_KEY = 'soundline-lab-settings-v1';
  const SETTING_IDS = ['fft-size', 'hop', 'sens-low', 'sens-mid', 'sens-high', 'onset-gap', 'bpm-min', 'bpm-max', 'bpm-prior', 'tightness', 'tempo-octave', 'meter',
    'section-kernel', 'section-min', 'section-sens', 'peak-count', 'silence-drop', 'drop-db',
    'gen-style', 'gen-names', 'gen-hold', 'gen-hold-mode', 'gen-min-strength', 'gen-curves', 'gen-hud', 'tap-latency', 'tap-snap', 'tap-snap-tol', 'tap-round', 'tap-merge', 'follow'];

  const state = {
    fileName: '', samples: null, sampleRate: 44100, duration: 0, audioUrl: null,
    frames: null, score: null, gen: null, genKeys: new Set(), analysisMs: 0,
    view: { start: 0, end: 1 }, tab: 'sketch', wavePeaks: null, specImage: null,
    include: Object.assign({}, G.DEFAULTS.include), maxPerType: Object.assign({}, G.DEFAULTS.maxPerType), holdPerType: {},
    drag: null, raf: 0,
    taps: T.normalize({ lanes: {} }), tapEvents: [], tapDown: {}, undo: [], calib: null,
    selected: null,      // { key, tap } geselecteerde tik
    activeLane: null,    // key van de lane waarvan het detailblok open staat
    tapDrag: null,       // { key, tap, mode: 'move' | 'resize', x0, t0, dur0, moved }
  };

  const audio = $('audio');
  const overview = $('overview'), timeline = $('timeline');
  const octx = overview.getContext('2d'), tctx = timeline.getContext('2d');

  // ───────────────────────── Instellingen bewaren ─────────────────────────
  function saveSettings() {
    try {
      const values = {};
      for (const id of SETTING_IDS) { const el = $(id); if (el) values[id] = el.type === 'checkbox' ? el.checked : el.value; }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ values, include: state.include, maxPerType: state.maxPerType, holdPerType: state.holdPerType }));
    } catch (e) { /* privévenster of geblokkeerde opslag: dan onthouden we niets */ }
  }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY); if (!raw) return;
      const saved = JSON.parse(raw);
      for (const id in saved.values || {}) { const el = $(id); if (!el) continue; if (el.type === 'checkbox') el.checked = !!saved.values[id]; else el.value = saved.values[id]; }
      Object.assign(state.include, saved.include || {}); Object.assign(state.maxPerType, saved.maxPerType || {}); Object.assign(state.holdPerType, saved.holdPerType || {});
    } catch (e) { /* onleesbaar: standaardwaarden */ }
  }
  function tapsKey() { return `soundline-taps:${state.fileName}:${state.duration.toFixed(2)}`; }
  function saveTaps() { try { localStorage.setItem(tapsKey(), JSON.stringify(state.taps)); } catch (e) { /* zie boven */ } }
  function loadTaps() {
    try { const raw = localStorage.getItem(tapsKey()); state.taps = T.normalize(raw ? JSON.parse(raw) : { lanes: {} }); } catch (e) { state.taps = T.normalize({ lanes: {} }); }
    state.undo = []; state.selected = null;
  }

  // ───────────────────────── Bestand laden en decoderen ─────────────────────────
  async function loadFile(file) {
    if (!file) return;
    state.fileName = file.name;
    $('file-meta').textContent = `${file.name} · ${(file.size / 1048576).toFixed(2)} MB`;
    showProgress(0, 'decoderen…');
    try {
      const buf = await file.arrayBuffer();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      ctx.close && ctx.close();
      const n = decoded.length, ch = decoded.numberOfChannels;
      const mono = new Float32Array(n);
      for (let c = 0; c < ch; c++) { const d = decoded.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
      state.samples = mono; state.sampleRate = decoded.sampleRate; state.duration = decoded.duration;
      if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
      state.audioUrl = URL.createObjectURL(file);
      audio.src = state.audioUrl;
      $('duration').textContent = fmt(state.duration);
      $('play').disabled = false; $('reanalyze').disabled = false;
      state.view = { start: 0, end: state.duration };
      state.wavePeaks = buildWavePeaks(mono, 2048);
      loadTaps();
      updateStftHint();
      await analyze();
    } catch (err) {
      hideProgress();
      $('stats').textContent = `Dit bestand kon niet gelezen worden (${err.message || err}). Probeer een mp3, wav, ogg of flac.`;
      console.error(err);
    }
  }

  function buildWavePeaks(samples, bucket) {
    const n = Math.ceil(samples.length / bucket);
    const min = new Float32Array(n), max = new Float32Array(n);
    for (let b = 0; b < n; b++) {
      let lo = 1, hi = -1;
      for (let i = b * bucket, e = Math.min(samples.length, i + bucket); i < e; i++) { const v = samples[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      min[b] = lo; max[b] = hi;
    }
    return { bucket, min, max };
  }

  // ───────────────────────── Analyse ─────────────────────────
  async function analyze() {
    if (!state.samples) return;
    const fftSize = +$('fft-size').value, hop = +$('hop').value;
    showProgress(0, 'FFT…');
    const t0 = performance.now();
    state.frames = await A.stftAsync(state.samples, state.sampleRate, { fftSize, hop }, (p) => showProgress(p, `FFT ${(p * 100) | 0}%`));
    state.analysisMs = performance.now() - t0;
    state.specImage = buildSpectrogramImage(state.frames);
    hideProgress();
    runDetect();
  }

  function detectParams() {
    return {
      onsetSensitivity: { low: +$('sens-low').value, mid: +$('sens-mid').value, high: +$('sens-high').value },
      onsetMinGapMs: +$('onset-gap').value,
      bpmMin: +$('bpm-min').value, bpmMax: +$('bpm-max').value, bpmPrior: +$('bpm-prior').value,
      beatTightness: +$('tightness').value, tempoOctave: $('tempo-octave').value, meter: +$('meter').value,
      sectionKernelSec: +$('section-kernel').value, sectionMinSec: +$('section-min').value, sectionSensitivity: +$('section-sens').value,
      peakCount: +$('peak-count').value, silenceDropDb: +$('silence-drop').value, dropMinDb: +$('drop-db').value,
    };
  }

  function runDetect() {
    if (!state.frames) return;
    const t0 = performance.now();
    state.score = A.detect(state.frames, detectParams());
    const ms = performance.now() - t0;
    const s = state.score, f = state.frames, tp = s.tempo;
    $('bpm-badge').textContent = tp.bpm ? `${tp.bpm.toFixed(1)} BPM` : '— BPM';
    const oc = tp.octave || {};
    $('tempo-hint').textContent = tp.bpm
      ? `${tp.bpm.toFixed(2)} BPM · vertrouwen ${tp.confidence.toFixed(2)} · ${s.beats.length} beats, ${s.bars.length} maten\nkandidaten ${tp.candidates.slice(0, 4).map((c) => c.bpm.toFixed(1)).join(', ')} · octaaf: ${oc.applied}${oc.applied !== 'base' ? ` (geschat ${oc.estimatedBpm.toFixed(1)})` : ''}, salience ${(oc.salience || 0).toFixed(2)}, alternatie ${(oc.alternation || 0).toFixed(2)}`
      : 'geen tempo gevonden';
    refreshTaps(false);
    const counts = {};
    for (const e of s.events) counts[e.type] = (counts[e.type] || 0) + 1;
    for (const e of state.tapEvents) counts[e.type] = (counts[e.type] || 0) + 1;
    $('stats').innerHTML =
      `<b>${esc(state.fileName)}</b> · ${fmt(state.duration)} · ${state.sampleRate} Hz · ${f.count} frames @ ${f.frameRate.toFixed(1)} fps · FFT ${state.analysisMs.toFixed(0)} ms, detectie ${ms.toFixed(0)} ms\n` +
      `niveau max ${s.levels.maxDb.toFixed(1)} dBFS · stiltevloer ${s.levels.floorDb.toFixed(1)} dBFS · ` +
      LANES.map((l) => `${l.label} <b>${counts[l.type] || 0}</b>`).join(' · ') + (state.tapEvents.length ? ` · eigen <b>${state.tapEvents.length}</b>` : '') + '\n' +
      s.sections.map((x) => `S${x.index} <b>${x.letter}</b> ${fmt(x.start)}–${fmt(x.end)} ${x.level}${x.tags.length ? ' (' + x.tags.join(', ') + ')' : ''}`).join(' · ');
    renderIncludeGrid(counts);
    regenerate();
    draw();
  }

  // ───────────────────────── Tikken op gehoor ─────────────────────────
  const tapLaneList = () => T.lanes(state.taps);
  /* Ruwe tikken → cues. Reactiecorrectie zit al in de tik; snappen gebeurt hier (niet voor handmatige). */
  function targetsFor(kind) {
    if (!state.score) return [];
    if (kind === 'onset') return Object.values(state.score.onsets).flat().map((o) => o.t);
    if (kind === 'beat') return state.score.beats.map((b) => b.t);
    return [];
  }
  function refreshTaps(redraw = true) {
    const tolSec = +$('tap-snap-tol').value / 1000;
    state.tapEvents = T.toEvents(state.taps, { snapTargets: targetsFor($('tap-snap').value), tolSec, duration: state.duration || Infinity });
    renderTapLanes();
    if (redraw) { regenerate(); draw(); }
  }
  function tapDown(key) {
    if (!state.samples || state.tapDown[key] !== undefined) return;
    const latency = +$('tap-latency').value / 1000;
    state.tapDown[key] = { start: Math.max(0, audio.currentTime - latency), wall: performance.now() };
    draw();
  }
  function tapUp(key) {
    const d = state.tapDown[key]; if (!d) return;
    delete state.tapDown[key];
    const latency = +$('tap-latency').value / 1000;
    const held = (performance.now() - d.wall) / 1000;
    const end = Math.max(d.start, audio.currentTime - latency);
    const dur = held >= T.DEFAULTS.holdThresholdSec && !audio.paused ? Math.max(0.2, end - d.start) : 0;
    const res = T.addTap(state.taps, key, { t: d.start, dur, raw: d.start + latency }, { mode: $('tap-round').value, mergeWindowMs: +$('tap-merge').value });
    state.undo.push({ key, tap: res.tap, take: res.take });
    if (res.merged) flashRound(res);
    saveTaps(); refreshTaps();
  }
  function flashRound(res) {
    const sp = T.spread(res.tap);
    $('tap-round-result').textContent = `samengevoegd met tik ${res.lane.label} @ ${fmt(res.tap.t)} · ${sp.n} takes · ±${sp.sdMs.toFixed(0)} ms`;
  }
  function undoTap() {
    const last = state.undo.pop(); if (!last) return;
    T.removeTake(state.taps, last.key, last.tap, last.take);
    if (state.selected && state.selected.tap === last.tap && !state.taps.lanes[last.key]?.taps.includes(last.tap)) state.selected = null;
    saveTaps(); refreshTaps();
  }
  function deleteSelected() {
    if (!state.selected) return;
    T.removeTap(state.taps, state.selected.key, state.selected.tap);
    state.undo = state.undo.filter((u) => u.tap !== state.selected.tap);
    state.selected = null;
    saveTaps(); refreshTaps();
  }
  function nudgeSelected(dt) {
    if (!state.selected) return;
    T.moveTap(state.selected.tap, state.selected.tap.t + dt, state.duration);
    saveTaps(); refreshTaps();
  }
  function renderTapLanes() {
    const host = $('tap-lanes');
    const lanes = tapLaneList();
    host.innerHTML = lanes.length ? '' : '<div class="hint">Nog geen tikken. Speel af en druk een letter of cijfer.</div>';
    for (const lane of lanes) {
      const st = T.laneStats(lane);
      const row = document.createElement('div'); row.className = 'tap-lane' + (state.activeLane === lane.key ? ' active' : '');
      const key = document.createElement('button'); key.type = 'button'; key.className = 'key'; key.textContent = lane.key; key.title = 'Lane-opties: hele lane verschuiven';
      key.setAttribute('aria-label', `Opties voor lane ${lane.key}: alles verschuiven`); key.setAttribute('aria-expanded', state.activeLane === lane.key ? 'true' : 'false');
      key.addEventListener('click', () => { state.activeLane = state.activeLane === lane.key ? null : lane.key; renderTapLanes(); });
      const label = document.createElement('input'); label.type = 'text'; label.value = lane.label; label.maxLength = 24; label.setAttribute('aria-label', `Naam van lane ${lane.key}; wordt de functienaam in de sketch`);
      label.addEventListener('change', () => { const old = T.laneType(lane); lane.label = label.value.trim() || lane.key; for (const map of [state.include, state.maxPerType, state.holdPerType]) if (map[old] !== undefined) { map[T.laneType(lane)] = map[old]; delete map[old]; } saveTaps(); saveSettings(); refreshTaps(); });
      const count = document.createElement('span'); count.className = 'count';
      count.textContent = st.multi ? `${st.count} · ${st.multi} met ${st.takes - st.count + st.multi} takes · ±${st.meanSdMs.toFixed(0)} ms` : `${st.count}`;
      count.title = st.multi ? 'tikken · tikken met meerdere takes · gemiddelde spreiding (standaardafwijking)' : 'tikken';
      const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Wis lane'; clear.setAttribute('aria-label', `Wis lane ${lane.key} (${lane.label})`);
      clear.addEventListener('click', () => {
        if (!confirm(`Lane ${lane.key} · ${lane.label} met ${lane.taps.length} tik${lane.taps.length === 1 ? '' : 'ken'} wissen? Dit is niet ongedaan te maken.`)) return;
        delete state.taps.lanes[lane.key]; state.undo = state.undo.filter((u) => u.key !== lane.key); if (state.selected && state.selected.key === lane.key) state.selected = null; saveTaps(); refreshTaps();
      });
      row.append(key, label, count, clear);
      host.appendChild(row);
      if (state.activeLane === lane.key) host.appendChild(renderLaneDetail(lane));
    }
    renderSelected();
  }

  /* Detailblok van een lane: alles in één keer verschuiven, met de hand of gemeten tegen onsets of beats. */
  function renderLaneDetail(lane) {
    const box = document.createElement('div'); box.className = 'tap-detail';
    const tolSec = +$('tap-snap-tol').value / 1000;
    const apply = (dt) => { if (!dt) return; T.shiftLane(lane, dt, state.duration); saveTaps(); refreshTaps(); };
    const row1 = document.createElement('div'); row1.className = 'tap-detail-row';
    const lbl = document.createElement('span'); lbl.textContent = `lane ${lane.key} · ${lane.label}: alles verschuiven`;
    const inp = document.createElement('input'); inp.type = 'number'; inp.step = 5; inp.value = 0; inp.setAttribute('aria-label', 'Verschuiving in milliseconden, negatief is vroeger');
    const go = btn('Pas toe', () => { apply((+inp.value || 0) / 1000); inp.value = 0; });
    const minus = btn('−10 ms', () => apply(-0.01)), plus = btn('+10 ms', () => apply(0.01));
    row1.append(lbl, inp, go, minus, plus);
    box.appendChild(row1);
    for (const kind of ['onset', 'beat']) {
      const targets = targetsFor(kind); if (!targets.length) continue;
      const sug = T.suggestShift(lane, targets, tolSec);
      const row = document.createElement('div'); row.className = 'tap-detail-row';
      const txt = document.createElement('span');
      txt.textContent = sug.n ? `tegen ${kind === 'onset' ? 'onsets' : 'beats'}: ${sug.n} van ${sug.total} binnen ${(tolSec * 1000).toFixed(0)} ms · mediaan ${sug.medianMs >= 0 ? '+' : ''}${sug.medianMs.toFixed(0)} ms, spreiding ±${sug.sdMs.toFixed(0)} ms` : `tegen ${kind === 'onset' ? 'onsets' : 'beats'}: geen tik binnen ${(tolSec * 1000).toFixed(0)} ms`;
      row.appendChild(txt);
      if (sug.n && Math.abs(sug.medianMs) >= 1) row.appendChild(btn(`schuif ${sug.medianMs >= 0 ? '+' : ''}${sug.medianMs.toFixed(0)} ms`, () => apply(sug.shift)));
      box.appendChild(row);
    }
    return box;
  }
  function btn(text, onClick) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', onClick); return b; }

  /* Geselecteerde tik: samenvatting plus de afzonderlijke takes, elk met een verwijderknop. */
  function renderSelected() {
    const sel = $('tap-selected');
    if (!state.selected || !state.taps.lanes[state.selected.key] || !state.taps.lanes[state.selected.key].taps.includes(state.selected.tap)) { state.selected = null; sel.hidden = true; return; }
    const tap = state.selected.tap, sp = T.spread(tap), key = state.selected.key;
    sel.hidden = false; sel.innerHTML = '';
    const head = document.createElement('div');
    head.textContent = `geselecteerd: ${state.taps.lanes[key].label} @ ${fmt(tap.t)}${tap.dur ? ` → ${fmt(tap.t + tap.dur)}` : ''}${sp.n > 1 ? ` · ${sp.n} takes, ±${sp.sdMs.toFixed(0)} ms` : ''}${tap.manual ? ' · met de hand gezet' : ''}`;
    sel.appendChild(head);
    if (sp.n > 0) {
      const list = document.createElement('div'); list.className = 'take-list';
      tap.takes.slice().sort((a, b) => a.t - b.t).forEach((take, i) => {
        const row = document.createElement('div'); row.className = 'take';
        const x = btn('×', () => { T.removeTake(state.taps, key, tap, take); state.undo = state.undo.filter((u) => u.take !== take); saveTaps(); refreshTaps(); });
        x.setAttribute('aria-label', `Verwijder take ${i + 1}`);
        const d = (take.t - (tap.manual ? sp.n > 1 ? (sp.min + sp.max) / 2 : take.t : tap.t)) * 1000;
        const txt = document.createElement('span'); txt.textContent = `take ${i + 1} · ${fmt(take.t)}${sp.n > 1 ? ` (${d >= 0 ? '+' : ''}${d.toFixed(0)} ms)` : ''}${take.dur ? ` · duur ${take.dur.toFixed(2)} s` : ''}`;
        row.append(x, txt); list.appendChild(row);
      });
      sel.appendChild(list);
    }
    const help = document.createElement('div'); help.className = 'hint'; help.textContent = 'pijltjes = 10 ms (shift 100 ms) · Delete = weg · R = terug naar gemiddelde · Esc = los';
    sel.appendChild(help);
  }

  /* Kalibratie: acht klikken op 120 BPM uit de Web Audio-klok; de speler tikt mee met een willekeurige
     letter. De mediaan van (tik − klik) wordt de reactiecorrectie. */
  async function calibrate() {
    if (state.calib) return;
    const Ctx = window.AudioContext || window.webkitAudioContext; const ctx = new Ctx();
    await ctx.resume();
    const bpm = 120, n = 8, start = ctx.currentTime + 1;
    const clicks = [];
    for (let i = 0; i < n; i++) {
      const t = start + i * 60 / bpm; clicks.push(t);
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.frequency.value = i % 4 === 0 ? 1500 : 1000; g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(g).connect(ctx.destination); osc.start(t); osc.stop(t + 0.05);
    }
    state.calib = { ctx, clicks, taps: [] };
    const btn = $('tap-calibrate'); btn.disabled = true;
    const out = $('tap-calib-result'); out.textContent = 'tik mee op elke klik…';
    const total = (n - 1) * 60 / bpm + 1.5;
    setTimeout(() => {
      const offsets = state.calib.taps.map((t) => { let best = Infinity; for (const c of clicks) if (Math.abs(t - c) < Math.abs(best)) best = t - c; return best; }).filter((d) => Math.abs(d) < 0.3).sort((a, b) => a - b);
      state.calib = null; btn.disabled = false; ctx.close();
      if (offsets.length < 3) { out.textContent = `te weinig tikken (${offsets.length}); probeer opnieuw`; return; }
      const median = offsets[Math.floor(offsets.length / 2)];
      const ms = Math.round(Math.max(0, Math.min(300, median * 1000)));
      $('tap-latency').value = ms; syncValue('tap-latency'); saveSettings();
      out.textContent = `${offsets.length} tikken · mediaan ${(median * 1000).toFixed(0)} ms (spreiding ${((offsets[offsets.length - 1] - offsets[0]) * 1000).toFixed(0)} ms) → correctie ${ms} ms`;
    }, total * 1000);
  }

  // ───────────────────────── Codegeneratie ─────────────────────────
  function genOptions(extra) {
    return Object.assign({
      fileName: state.fileName || 'track.mp3', style: $('gen-style').value, names: $('gen-names').value,
      holdSec: +$('gen-hold').value, holdMode: $('gen-hold-mode').value, holdPerType: state.holdPerType, minStrength: +$('gen-min-strength').value,
      hud: $('gen-hud').checked, embedCurves: $('gen-curves').value,
      include: state.include, maxPerType: state.maxPerType, extraEvents: state.tapEvents,
    }, extra || {});
  }
  function regenerate() {
    if (!state.score) return;
    state.gen = G.generate(state.score, genOptions());
    state.genKeys = new Set(state.gen.cues.map((c) => `${c.type}@${c.t.toFixed(4)}`));
    showTab(state.tab);
  }
  function showTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.output-tab').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    const out = $('output'), pane = $('preview-pane');
    const isPreview = tab === 'preview';
    out.hidden = isPreview; pane.hidden = !isPreview;
    if (!state.gen) { out.value = ''; $('output-meta').textContent = '—'; return; }
    const text = tab === 'sketch' ? state.gen.sketch : tab === 'html' ? state.gen.html : tab === 'json' ? state.gen.json : '';
    if (!isPreview) out.value = text;
    const c = state.gen.summary.counts;
    $('output-meta').textContent = isPreview ? `${state.gen.summary.cues} cues` : `${text.split('\n').length} regels · ${(text.length / 1024).toFixed(1)} kB · ${state.gen.summary.cues} cues (${Object.keys(c).map((k) => `${k.replace('tap:', '')} ${c[k]}`).join(', ')})`;
  }
  function renderIncludeGrid(counts) {
    const grid = $('include-grid');
    grid.innerHTML = '<span class="head"></span><span class="head">cue-type</span><span class="head">gevonden</span><span class="head">max</span><span class="head" title="duur van een slag-cue voor dit type; leeg = de algemene waarde. Bij \'tot de volgende\' is dit het maximum.">duur s</span>';
    const rows = LANES.map((l) => ({ type: l.type, label: l.label, own: false })).concat(tapLaneList().map((l) => ({ type: T.laneType(l), label: `tik ${l.key} · ${l.label}`, own: true })));
    for (const l of rows) {
      const id = 'inc-' + l.type.replace(/[^a-z0-9]+/gi, '-');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = state.include[l.type] ?? l.own;
      cb.addEventListener('change', () => { state.include[l.type] = cb.checked; saveSettings(); regenerate(); draw(); });
      const name = document.createElement('label'); name.className = 'lane-name' + (l.own ? ' own' : ''); name.htmlFor = id; name.innerHTML = `<i></i>${esc(l.label)}`;
      const count = document.createElement('span'); count.className = 'count'; count.textContent = counts[l.type] || 0;
      const max = document.createElement('input'); max.type = 'number'; max.min = 0; max.value = state.maxPerType[l.type] ?? 999; max.setAttribute('aria-label', `Maximum aantal cues voor ${l.label}`);
      max.addEventListener('change', () => { state.maxPerType[l.type] = Math.max(0, +max.value || 0); saveSettings(); regenerate(); });
      const hold = document.createElement('input'); hold.type = 'number'; hold.min = 0.05; hold.step = 0.05; hold.placeholder = $('gen-hold').value; hold.setAttribute('aria-label', `Duur in seconden van een slag-cue voor ${l.label}`);
      if (INSTANT_TYPES.has(l.type) || l.own) { hold.value = state.holdPerType[l.type] ?? ''; } else { hold.disabled = true; hold.placeholder = 'duur'; }
      hold.addEventListener('change', () => { const v = +hold.value; if (v > 0) state.holdPerType[l.type] = v; else { delete state.holdPerType[l.type]; hold.value = ''; } saveSettings(); regenerate(); });
      grid.append(cb, name, count, max, hold);
    }
  }

  // ───────────────────────── Preview ─────────────────────────
  function runPreview() {
    if (!state.score) return;
    const size = Math.max(240, Math.min(640, $('preview-frame').clientWidth - 2));
    const gen = G.generate(state.score, genOptions({ audioSrc: state.audioUrl, hud: true, canvas: [size, size] }));
    const p5Url = new URL('vendor/p5-2.3.4.min.js', location.href).href;
    const html = gen.html.replace(/<script src="[^"]*p5[^"]*"><\/script>/, `<script src="${p5Url}"></script>`)
      .replace('<script src="sketch.js"></script>', `<script>${gen.sketch.replace(/<\/script/g, '<\\/script')}</script>`)
      .replace(/<p>.*?<\/p>/s, '').replace('padding:16px', 'padding:0');
    $('preview-frame').srcdoc = html;
  }

  // ───────────────────────── Tekenen ─────────────────────────
  const allLanes = () => LANES.concat(tapLaneList().map((l) => ({ type: T.laneType(l), label: `${l.key} · ${l.label}`, own: true, key: l.key })));
  const timelineHeight = () => LANE_TOP + allLanes().length * ROWS.lane + 6;
  function fitCanvas(canvas, cssHeight) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.height = cssHeight + 'px';
    const w = canvas.clientWidth || 600;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(cssHeight * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(cssHeight * dpr); }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return w;
  }
  /* Muispositie t.o.v. het canvas uit clientX/Y: betrouwbaarder dan offsetX/Y, ook voor synthetische events. */
  const pos = (ev, el) => { const r = el.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const xOf = (t, w) => (t - state.view.start) / (state.view.end - state.view.start) * w;
  const tOf = (x, w) => state.view.start + x / w * (state.view.end - state.view.start);

  function buildSpectrogramImage(frames) {
    const bins = frames.spectrogramBins, n = frames.count;
    const c = document.createElement('canvas'); c.width = n; c.height = bins;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(n, bins);
    for (let f = 0; f < n; f++) for (let b = 0; b < bins; b++) {
      const v = frames.spectrogram[f * bins + b];
      const i = ((bins - 1 - b) * n + f) * 4;
      const g = Math.pow(v / 255, 1.4) * 255;
      img.data[i] = g; img.data[i + 1] = g; img.data[i + 2] = g; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function drawWave(ctx, x0, y0, w, h, t0, t1, color) {
    const sr = state.sampleRate, pk = state.wavePeaks, samples = state.samples;
    const mid = y0 + h / 2, amp = h / 2 - 2;
    ctx.fillStyle = color;
    const spp = (t1 - t0) * sr / w;
    for (let px = 0; px < w; px++) {
      const sA = Math.floor((t0 + px / w * (t1 - t0)) * sr), sB = Math.floor(sA + spp) + 1;
      if (sB < 0 || sA >= samples.length) continue;
      let lo = 1, hi = -1;
      if (spp >= pk.bucket * 2) {
        for (let b = Math.max(0, Math.floor(sA / pk.bucket)), e = Math.min(pk.min.length - 1, Math.floor(sB / pk.bucket)); b <= e; b++) { if (pk.min[b] < lo) lo = pk.min[b]; if (pk.max[b] > hi) hi = pk.max[b]; }
      } else {
        for (let i = Math.max(0, sA), e = Math.min(samples.length - 1, sB); i <= e; i++) { const v = samples[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      }
      if (hi < lo) continue;
      ctx.fillRect(x0 + px, mid - hi * amp, 1, Math.max(1, (hi - lo) * amp));
    }
  }

  function drawOverview() {
    const w = fitCanvas(overview, 56), h = 56;
    octx.fillStyle = '#0a0a0a'; octx.fillRect(0, 0, w, h);
    if (!state.samples) return;
    const dur = state.duration;
    if (state.score) for (const s of state.score.sections) {
      octx.fillStyle = s.level === 'loud' ? '#262626' : s.level === 'mid' ? '#1c1c1c' : '#141414';
      octx.fillRect(s.start / dur * w, 0, (s.end - s.start) / dur * w, h);
      octx.fillStyle = '#444'; octx.fillRect(s.start / dur * w, 0, 1, h);
      octx.fillStyle = '#6e6e68'; octx.font = '10px "IBM Plex Mono", monospace'; octx.textBaseline = 'top'; octx.fillText(s.letter, s.start / dur * w + 3, 2);
    }
    const saved = state.view; state.view = { start: 0, end: dur };
    drawWave(octx, 0, 4, w, h - 8, 0, dur, '#8a8a85');
    state.view = saved;
    for (const e of state.tapEvents) { octx.fillStyle = '#ff3b3b'; octx.fillRect(e.t / dur * w, h - 5, Math.max(1, e.dur / dur * w), 3); }
    octx.fillStyle = 'rgba(255,255,255,0.08)'; octx.fillRect(saved.start / dur * w, 0, Math.max(2, (saved.end - saved.start) / dur * w), h);
    octx.strokeStyle = '#777'; octx.strokeRect(saved.start / dur * w + 0.5, 0.5, Math.max(2, (saved.end - saved.start) / dur * w) - 1, h - 1);
    octx.fillStyle = '#ff0000'; octx.fillRect(audio.currentTime / dur * w - 0.5, 0, 1.5, h);
  }

  function niceStep(span, w) {
    const target = span / (w / 90);
    const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    return steps.find((s) => s >= target) || 600;
  }

  function drawTimeline() {
    const h = timelineHeight(), w = fitCanvas(timeline, h);
    tctx.fillStyle = '#0a0a0a'; tctx.fillRect(0, 0, w, h);
    if (!state.samples) {
      tctx.fillStyle = '#3a3a3a'; tctx.font = '12px "IBM Plex Mono", monospace'; tctx.textAlign = 'center';
      tctx.fillText('tijdlijn: golfvorm · spectrogram · flux en nieuwheid · cue-lanen · eigen tikken', w / 2, h / 2); return;
    }
    const { start: t0, end: t1 } = state.view; const span = t1 - t0;
    tctx.font = '10px "IBM Plex Mono", monospace'; tctx.textAlign = 'left'; tctx.textBaseline = 'middle';
    if (state.score) for (const s of state.score.sections) {
      const a = Math.max(0, xOf(s.start, w)), b = Math.min(w, xOf(s.end, w));
      if (b <= 0 || a >= w) continue;
      tctx.fillStyle = s.index % 2 ? '#0e0e0e' : '#121212'; tctx.fillRect(a, ROWS.ruler, b - a, h - ROWS.ruler);
      tctx.fillStyle = '#2c2c2c'; tctx.fillRect(a, ROWS.ruler, 1, h - ROWS.ruler);
    }
    const step = niceStep(span, w);
    tctx.fillStyle = '#6e6e68';
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
      const x = xOf(t, w); tctx.fillRect(x, 0, 1, ROWS.ruler); tctx.fillText(step < 1 ? fmt(t) : fmt(t).slice(0, 5), x + 3, 9);
    }
    drawWave(tctx, 0, ROWS.ruler, w, ROWS.wave, t0, t1, '#9a9a94');
    if (state.specImage && state.frames) {
      const fr = state.frames.frameRate, y = ROWS.ruler + ROWS.wave;
      const off = state.frames.fftSize / 2 / state.sampleRate;
      tctx.imageSmoothingEnabled = span < 20;
      tctx.drawImage(state.specImage, (t0 - off) * fr, 0, (t1 - t0) * fr, state.frames.spectrogramBins, 0, y, w, ROWS.spec);
      tctx.fillStyle = '#6e6e68';
      for (const hz of [100, 1000, 10000]) {
        const lo = state.frames.spectrogramLo, hi = Math.min(state.frames.spectrogramHi, state.sampleRate / 2);
        const u = Math.log(hz / lo) / Math.log(hi / lo); if (u < 0 || u > 1) continue;
        const yy = y + ROWS.spec * (1 - u); tctx.fillRect(0, yy, 6, 1); tctx.fillText(hz >= 1000 ? hz / 1000 + 'k' : hz, 8, yy);
      }
    }
    if (state.frames && state.score) {
      const y = ROWS.ruler + ROWS.wave + ROWS.spec, fh = ROWS.curves, fr = state.frames.frameRate, Tm = state.frames.times;
      const flux = state.frames.flux.all, scale = A.percentile(flux, 0.98) || 1;
      tctx.fillStyle = '#5a5a56';
      const fStart = Math.max(0, Math.floor(t0 * fr)), fEnd = Math.min(state.frames.count - 1, Math.ceil(t1 * fr));
      const perPx = Math.max(1, Math.floor((fEnd - fStart) / w));
      for (let f = fStart; f <= fEnd; f += perPx) {
        let m = 0; for (let k = f; k < f + perPx && k <= fEnd; k++) m = Math.max(m, flux[k]);
        const v = Math.min(1, m / scale); tctx.fillRect(xOf(Tm[f], w), y + fh - v * (fh - 4), Math.max(1, w / (fEnd - fStart) * perPx), v * (fh - 4));
      }
      const nv = state.score.novelty; tctx.strokeStyle = '#e8e8e4'; tctx.lineWidth = 1; tctx.beginPath();
      for (let i = 0; i < nv.nWin; i++) { const x = xOf((i + 0.5) * nv.windowSec, w); const yy = y + fh - nv.novelty[i] * (fh - 4); i ? tctx.lineTo(x, yy) : tctx.moveTo(x, yy); }
      tctx.stroke();
      const { maxDb, floorDb } = state.score.levels; tctx.strokeStyle = '#ff3b3b'; tctx.globalAlpha = .7; tctx.beginPath();
      for (let f = fStart; f <= fEnd; f += perPx) { const u = Math.max(0, Math.min(1, (state.frames.rmsDb[f] - floorDb) / (maxDb - floorDb))); const x = xOf(Tm[f], w), yy = y + fh - u * (fh - 4); f === fStart ? tctx.moveTo(x, yy) : tctx.lineTo(x, yy); }
      tctx.stroke(); tctx.globalAlpha = 1;
      tctx.fillStyle = '#6e6e68'; tctx.fillText('flux · nieuwheid · niveau', 4, y + 8);
    }
    if (state.score) {
      const keys = state.genKeys;
      const lanes = allLanes();
      lanes.forEach((lane, i) => {
        const y = LANE_TOP + i * ROWS.lane;
        tctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'transparent'; tctx.fillRect(0, y, w, ROWS.lane);
        const included = state.include[lane.type] ?? !!lane.own;
        tctx.fillStyle = lane.own ? '#ff3b3b' : included ? '#a8a8a2' : '#4a4a46'; tctx.fillText(lane.label, 4, y + ROWS.lane / 2);
        const source = lane.own ? state.tapEvents : state.score.events;
        for (const e of source) {
          if (e.type !== lane.type) continue;
          const x = xOf(e.t, w); if (x < -2 || x > w + 2) { if (!(e.dur > 0 && xOf(e.t + e.dur, w) > 0 && x < w)) continue; }
          const on = keys.has(`${e.type}@${e.t.toFixed(4)}`);
          const selected = lane.own && state.selected && state.selected.tap === e.tap;
          if (lane.own && e.takes > 1) {   // spreiding van de takes als dunne balk, elke take een streepje
            const sp = T.spread(e.tap);
            tctx.fillStyle = 'rgba(255,59,59,0.35)'; tctx.fillRect(xOf(sp.min, w), y + ROWS.lane - 3, Math.max(1, xOf(sp.max, w) - xOf(sp.min, w)), 2);
            tctx.fillStyle = 'rgba(255,59,59,0.7)';
            for (const k of e.tap.takes) tctx.fillRect(xOf(k.t, w), y + ROWS.lane - 5, 1, 4);
          }
          if (e.dur > 0) {
            const x2 = xOf(e.t + e.dur, w);
            tctx.fillStyle = lane.own ? (on ? 'rgba(255,59,59,0.35)' : 'rgba(255,59,59,0.12)') : on ? (lane.type === 'silence' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)') : 'rgba(255,255,255,0.06)';
            tctx.fillRect(Math.max(0, x), y + 3, Math.min(w, x2) - Math.max(0, x), ROWS.lane - 6);
            tctx.fillStyle = lane.own ? '#ff3b3b' : on ? '#e8e8e4' : '#5a5a56'; tctx.fillRect(x, y + 2, 1, ROWS.lane - 4);
            if (lane.own) tctx.fillRect(x2 - 1, y + 2, 1, ROWS.lane - 4);
            if (lane.type === 'section' && x2 - x > 60) { tctx.fillStyle = on ? '#e8e8e4' : '#5a5a56'; tctx.fillText(e.label, Math.max(0, x) + 52, y + ROWS.lane / 2); }
          } else {
            const hgt = 4 + e.strength * (ROWS.lane - 8);
            tctx.fillStyle = lane.own ? (on ? '#ff3b3b' : 'rgba(255,59,59,0.4)') : on ? (lane.type === 'drop' || lane.type === 'peak' ? '#ff3b3b' : '#e8e8e4') : '#4a4a46';
            tctx.fillRect(x - (lane.type === 'bar' || lane.own ? 1 : 0.5), y + ROWS.lane - 2 - hgt, lane.type === 'bar' || lane.own ? 2 : 1, hgt);
            if (lane.own && e.manual) { tctx.fillStyle = '#fff'; tctx.fillRect(x - 1, y + 2, 2, 2); }
          }
          if (selected) { tctx.strokeStyle = '#fff'; tctx.lineWidth = 1; tctx.strokeRect(x - 3.5, y + 1.5, (e.dur > 0 ? xOf(e.t + e.dur, w) - x : 0) + 7, ROWS.lane - 3); }
        }
      });
      for (const key in state.tapDown) {
        const lane = state.taps.lanes[key]; const idx = lane ? lanes.findIndex((l) => l.type === T.laneType(lane)) : -1;
        const y = idx >= 0 ? LANE_TOP + idx * ROWS.lane : LANE_TOP + lanes.length * ROWS.lane - ROWS.lane;
        tctx.fillStyle = 'rgba(255,0,0,0.5)'; tctx.fillRect(xOf(state.tapDown[key].start, w), y + 3, Math.max(2, xOf(audio.currentTime, w) - xOf(state.tapDown[key].start, w)), ROWS.lane - 6);
      }
    }
    const px = xOf(audio.currentTime, w);
    if (px >= 0 && px <= w) { tctx.fillStyle = '#ff0000'; tctx.fillRect(px - 0.5, 0, 1.5, h); }
  }

  function draw() { drawOverview(); drawTimeline(); $('time').textContent = fmt(audio.currentTime || 0); }

  // ───────────────────────── Interactie ─────────────────────────
  function setView(start, end) {
    const dur = state.duration || 1, minSpan = 0.05;
    let span = Math.max(minSpan, Math.min(dur, end - start));
    start = Math.max(0, Math.min(dur - span, start));
    state.view = { start, end: start + span };
    $('zoom').value = Math.log2(dur / span);
    draw();
  }
  /* Welke eigen tik ligt onder de muis? Geeft { event, mode } met mode 'move' of 'resize' (rechterrand van een duur-cue). */
  function tapAt(x, y, w) {
    if (y < LANE_TOP) return null;
    const lanes = allLanes();
    const lane = lanes[Math.floor((y - LANE_TOP) / ROWS.lane)];
    if (!lane || !lane.own) return null;
    const tol = 6 / w * (state.view.end - state.view.start), t = tOf(x, w);
    let best = null, bd = Infinity;
    for (const e of state.tapEvents) {
      if (e.type !== lane.type) continue;
      if (e.dur > 0 && Math.abs(e.t + e.dur - t) <= tol) return { event: e, mode: 'resize' };
      const d = e.dur > 0 && t >= e.t && t <= e.t + e.dur ? 0 : Math.abs(e.t - t);
      if (d <= tol && d < bd) { bd = d; best = e; }
    }
    return best ? { event: best, mode: 'move' } : null;
  }
  timeline.addEventListener('wheel', (ev) => {
    const p = pos(ev, timeline);
    if (!state.samples) return; ev.preventDefault();
    const w = timeline.clientWidth, t = tOf(p.x, w), span = state.view.end - state.view.start;
    const factor = Math.exp(ev.deltaY * 0.0015);
    const ns = span * factor, u = (t - state.view.start) / span;
    setView(t - u * ns, t - u * ns + ns);
  }, { passive: false });
  timeline.addEventListener('pointerdown', (ev) => {
    const p = pos(ev, timeline);
    const w = timeline.clientWidth;
    const hit = state.samples ? tapAt(p.x, p.y, w) : null;
    try { timeline.setPointerCapture(ev.pointerId); } catch (e) { /* synthetische events hebben geen pointer */ }
    if (hit) {
      state.selected = { key: hit.event.laneKey, tap: hit.event.tap };
      state.tapDrag = { key: hit.event.laneKey, tap: hit.event.tap, mode: hit.mode, x0: p.x, t0: hit.event.tap.t, dur0: hit.event.tap.dur, moved: false };
      renderTapLanes(); draw();
      return;
    }
    if (state.selected && p.y >= LANE_TOP) { state.selected = null; renderTapLanes(); }
    state.drag = { x: p.x, start: state.view.start, moved: false };
  });
  timeline.addEventListener('pointermove', (ev) => {
    const p = pos(ev, timeline);
    const w = timeline.clientWidth;
    if (state.tapDrag) {
      const d = state.tapDrag, dt = (p.x - d.x0) / w * (state.view.end - state.view.start);
      if (Math.abs(p.x - d.x0) > 2) d.moved = true;
      if (!d.moved) return;
      if (d.mode === 'move') T.moveTap(d.tap, d.t0 + dt, state.duration); else T.resizeTap(d.tap, d.dur0 + dt);
      refreshTapsLight(); return;
    }
    if (state.drag) {
      const dx = p.x - state.drag.x;
      if (Math.abs(dx) > 3) state.drag.moved = true;
      if (state.drag.moved) { const span = state.view.end - state.view.start; setView(state.drag.start - dx / w * span, state.drag.start - dx / w * span + span); }
      return;
    }
    const hit = state.samples ? tapAt(p.x, p.y, w) : null;
    timeline.style.cursor = hit ? (hit.mode === 'resize' ? 'ew-resize' : 'grab') : 'crosshair';
    showTooltip(ev, tOf(p.x, w), w);
  });
  timeline.addEventListener('pointerup', (ev) => {
    const p = pos(ev, timeline);
    if (state.tapDrag) { if (state.tapDrag.moved) { saveTaps(); refreshTaps(); } state.tapDrag = null; return; }
    if (state.drag && !state.drag.moved && state.samples) { audio.currentTime = Math.max(0, Math.min(state.duration, tOf(p.x, timeline.clientWidth))); draw(); }
    state.drag = null;
  });
  timeline.addEventListener('pointerleave', () => { $('tooltip').hidden = true; });
  /* Tijdens het slepen alleen de cues en de tekening verversen; de sketch volgt bij het loslaten. */
  function refreshTapsLight() {
    const snap = $('tap-snap').value, tolSec = +$('tap-snap-tol').value / 1000;
    let snapTargets = [];
    if (state.score && snap === 'onset') snapTargets = Object.values(state.score.onsets).flat().map((o) => o.t);
    if (state.score && snap === 'beat') snapTargets = state.score.beats.map((b) => b.t);
    state.tapEvents = T.toEvents(state.taps, { snapTargets, tolSec, duration: state.duration || Infinity });
    renderTapLanes(); draw();
  }
  overview.addEventListener('pointerdown', (ev) => {
    if (!state.samples) return;
    const t = pos(ev, overview).x / overview.clientWidth * state.duration, span = state.view.end - state.view.start;
    if (ev.shiftKey) { audio.currentTime = t; draw(); } else setView(t - span / 2, t + span / 2);
  });
  $('zoom').addEventListener('input', () => {
    if (!state.samples) return;
    const dur = state.duration, span = dur / Math.pow(2, +$('zoom').value);
    const center = audio.currentTime >= state.view.start && audio.currentTime <= state.view.end ? audio.currentTime : (state.view.start + state.view.end) / 2;
    setView(center - span / 2, center + span / 2);
  });
  function showTooltip(ev, t, w) {
    if (!state.score) return;
    const tip = $('tooltip');
    const tol = 6 / w * (state.view.end - state.view.start);
    const y = pos(ev, timeline).y;
    let lines = [fmt(t)];
    if (y >= LANE_TOP) {
      const lanes = allLanes();
      const lane = lanes[Math.min(lanes.length - 1, Math.floor((y - LANE_TOP) / ROWS.lane))];
      const source = lane.own ? state.tapEvents : state.score.events;
      const near = source.filter((e) => e.type === lane.type && (Math.abs(e.t - t) <= tol || (e.dur > 0 && t >= e.t && t <= e.t + e.dur))).slice(0, 3);
      for (const e of near) {
        let line = `${e.label}  @ ${fmt(e.t)}${e.dur ? ' → ' + fmt(e.t + e.dur) : ''}${e.dur || lane.own ? '' : '  sterkte ' + e.strength.toFixed(2)}`;
        if (lane.own) {
          if (e.raw != null && Math.abs(e.raw - e.t) > 0.0005) line += `  (getikt ${fmt(e.raw)})`;
          if (e.takes > 1) line += `\n   takes: ${e.tap.takes.map((k) => fmt(k.t)).join(', ')}  bereik ${e.rangeMs.toFixed(0)} ms`;
          line += '\n   sleep = verplaats · rechterrand = duur · klik = selecteer';
        }
        lines.push(line);
      }
    } else if (state.frames) {
      const f = Math.max(0, Math.min(state.frames.count - 1, Math.round(t * state.frames.frameRate)));
      lines.push(`niveau ${state.frames.rmsDb[f].toFixed(1)} dBFS · centroid ${state.frames.centroid[f].toFixed(0)} Hz · vlakheid ${state.frames.flatness[f].toFixed(2)}`);
    }
    tip.textContent = lines.join('\n'); tip.hidden = false;
    tip.style.left = Math.min(window.innerWidth - 360, ev.clientX + 14) + 'px'; tip.style.top = ev.clientY + 14 + 'px';
  }

  // Transport
  $('play').addEventListener('click', () => { if (audio.paused) audio.play(); else audio.pause(); });
  audio.addEventListener('play', () => { $('play').textContent = 'Pauze'; tick(); });
  audio.addEventListener('pause', () => { $('play').textContent = 'Afspelen'; cancelAnimationFrame(state.raf); draw(); });
  audio.addEventListener('ended', () => { $('play').textContent = 'Afspelen'; });
  function tick() {
    if ($('follow').checked) {
      const span = state.view.end - state.view.start, t = audio.currentTime;
      if (t > state.view.end - span * 0.05 || t < state.view.start) setView(t - span * 0.1, t - span * 0.1 + span);
    }
    draw();
    if (!audio.paused) state.raf = requestAnimationFrame(tick);
  }

  // Toetsen: spatie = afspelen, backspace = laatste tik weg (of de geselecteerde), pijltjes = geselecteerde
  // tik verschuiven, Delete = geselecteerde weg, R = terug naar het gemiddelde, Esc = selectie los,
  // letter/cijfer = tik in die lane
  const inField = () => ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  window.addEventListener('keydown', (ev) => {
    if (inField() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.code === 'Space') { if (state.samples) { ev.preventDefault(); $('play').click(); } return; }
    if (ev.key === 'Backspace') { ev.preventDefault(); if (state.selected) deleteSelected(); else undoTap(); return; }
    if (ev.key === 'Delete') { ev.preventDefault(); deleteSelected(); return; }
    if (ev.key === 'Escape') { state.selected = null; renderTapLanes(); draw(); return; }
    if (state.selected && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) { ev.preventDefault(); nudgeSelected((ev.key === 'ArrowLeft' ? -1 : 1) * (ev.shiftKey ? 0.1 : 0.01)); return; }
    if (state.selected && ev.key.toLowerCase() === 'r' && !ev.repeat) { T.resetTap(state.selected.tap); saveTaps(); refreshTaps(); return; }
    if (ev.repeat || !/^[a-z0-9]$/i.test(ev.key)) return;
    if (document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
    if (state.calib) { state.calib.taps.push(state.calib.ctx.currentTime); return; }
    ev.preventDefault(); tapDown(ev.key.toLowerCase());
  });
  window.addEventListener('keyup', (ev) => { if (/^[a-z0-9]$/i.test(ev.key)) tapUp(ev.key.toLowerCase()); });
  window.addEventListener('blur', () => { for (const k in state.tapDown) tapUp(k); });

  // Bestand
  $('file-input').addEventListener('change', (ev) => loadFile(ev.target.files[0]));
  const dz = $('dropzone');
  ['dragenter', 'dragover'].forEach((n) => dz.addEventListener(n, (ev) => { ev.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((n) => dz.addEventListener(n, (ev) => { ev.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (ev) => loadFile(ev.dataTransfer.files[0]));
  document.body.addEventListener('dragover', (ev) => ev.preventDefault());
  document.body.addEventListener('drop', (ev) => { ev.preventDefault(); if (ev.dataTransfer.files[0]) loadFile(ev.dataTransfer.files[0]); });
  $('load-example').addEventListener('click', async () => {
    try {
      showProgress(0, 'brunk.mp3 ophalen…');
      const r = await fetch('brunk.mp3'); if (!r.ok) throw Error(r.status + ' ' + r.statusText);
      const blob = await r.blob();
      loadFile(new File([blob], 'brunk.mp3', { type: blob.type || 'audio/mpeg' }));
    } catch (err) { hideProgress(); $('stats').textContent = `brunk.mp3 staat niet naast index.html (${err.message}). Zet het bestand in de map, of sleep een eigen mp3 in het vak links.`; }
  });

  // Parameters: STFT via knop, detectoren live (gedebounced), generator direct
  $('reanalyze').addEventListener('click', analyze);
  function updateStftHint() { const hop = +$('hop').value, sr = state.sampleRate || 44100; $('stft-hint').textContent = `Tijdresolutie: ${(hop / sr * 1000).toFixed(1)} ms per frame · ${(sr / +$('fft-size').value).toFixed(1)} Hz per bin bij ${(sr / 1000).toFixed(1)} kHz.`; }
  ['fft-size', 'hop'].forEach((id) => $(id).addEventListener('change', () => { updateStftHint(); saveSettings(); }));
  let detectTimer = 0;
  const detectIds = ['sens-low', 'sens-mid', 'sens-high', 'onset-gap', 'bpm-min', 'bpm-max', 'bpm-prior', 'tightness', 'tempo-octave', 'meter', 'section-kernel', 'section-min', 'section-sens', 'peak-count', 'silence-drop', 'drop-db'];
  for (const id of detectIds) $(id).addEventListener('input', () => { syncValue(id); saveSettings(); clearTimeout(detectTimer); detectTimer = setTimeout(runDetect, 150); });
  ['gen-style', 'gen-names', 'gen-curves', 'gen-hud', 'gen-hold-mode'].forEach((id) => $(id).addEventListener('change', () => { saveSettings(); regenerate(); }));
  ['gen-hold', 'gen-min-strength'].forEach((id) => $(id).addEventListener('input', () => { syncValue(id); saveSettings(); regenerate(); draw(); if (id === 'gen-hold') document.querySelectorAll('#include-grid input[type=number][step]').forEach((el) => { el.placeholder = $('gen-hold').value; }); }));
  ['tap-snap', 'tap-snap-tol', 'tap-latency', 'tap-round', 'tap-merge'].forEach((id) => $(id).addEventListener('input', () => { syncValue(id); saveSettings(); refreshTaps(); }));
  $('follow').addEventListener('change', saveSettings);
  $('tap-calibrate').addEventListener('click', calibrate);
  $('tap-clear').addEventListener('click', () => { if (!Object.keys(state.taps.lanes).length || confirm(`Alle eigen tikken van ${state.fileName || 'dit bestand'} wissen? Dit is niet ongedaan te maken.`)) { state.taps = T.normalize({ lanes: {} }); state.undo = []; state.selected = null; saveTaps(); refreshTaps(); } });
  $('tap-undo').addEventListener('click', undoTap);
  $('reset-settings').addEventListener('click', () => { localStorage.removeItem(SETTINGS_KEY); location.reload(); });
  function syncValue(id) { const el = document.querySelector(`.value[data-for="${id}"]`); if (!el) return; const v = +$(id).value; el.textContent = +$(id).step >= 1 ? String(v) : v.toFixed(2); }

  // Uitvoer
  document.querySelectorAll('.output-tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('copy-output').addEventListener('click', async () => { if (!state.gen || state.tab === 'preview') return; await navigator.clipboard.writeText($('output').value); flash($('copy-output'), 'Gekopieerd'); });
  const base = () => (state.fileName || 'track').replace(/\.[^.]+$/, '');
  function download(name, data, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  $('download-output').addEventListener('click', () => {
    if (!state.gen) return;
    if (state.tab === 'sketch') download('sketch.js', state.gen.sketch, 'text/javascript');
    else if (state.tab === 'html') download('index.html', state.gen.html, 'text/html');
    else if (state.tab === 'json') download(base() + '.soundline.json', state.gen.json, 'application/json');
  });
  $('download-midi').addEventListener('click', () => { if (state.gen) download(base() + '.soundline.mid', state.gen.midi, 'audio/midi'); });
  $('download-all').addEventListener('click', () => {
    if (!state.gen) return;
    download('sketch.js', state.gen.sketch, 'text/javascript');
    setTimeout(() => download('index.html', state.gen.html, 'text/html'), 300);
    setTimeout(() => download(base() + '.soundline.json', state.gen.json, 'application/json'), 600);
    setTimeout(() => download(base() + '.soundline.mid', state.gen.midi, 'audio/midi'), 900);
  });
  $('preview-run').addEventListener('click', runPreview);
  function flash(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1200); }

  // Over
  $('open-about').addEventListener('click', () => $('about-modal').showModal());

  function showProgress(p, text) {
    $('progress').hidden = false; $('progress-text').textContent = text;
    const bar = $('progress-bar');
    if (p > 0) bar.value = p; else bar.removeAttribute('value');   // zonder waarde = onbepaald (decoderen)
  }
  function hideProgress() { $('progress').hidden = true; }
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  window.addEventListener('resize', draw);
  loadSettings();
  document.querySelectorAll('input[type=range]').forEach((r) => syncValue(r.id));
  updateStftHint();
  renderIncludeGrid({});
  renderTapLanes();
  draw();
  window.soundline = state;   // handig voor onderzoek in de console
})();
