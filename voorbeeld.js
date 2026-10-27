/* voorbeeld.js — het eenvoudige voorbeeld: bestand → analyse met standaardinstellingen →
   hoogstens tien visuele momenten → één sketch met voorbeeldtekeningen → preview. Eén keuze: het aantal. */
(() => {
  'use strict';
  const A = window.SoundlineAnalysis, G = window.SoundlineCodegen;
  const $ = (id) => document.getElementById(id);
  const fmt = A.fmtTime;
  const state = { fileName: '', samples: null, sampleRate: 44100, duration: 0, audioUrl: null, frames: null, score: null, moments: [], gen: null, peaks: null, raf: 0 };
  const audio = $('audio'), line = $('line'), ctx = line.getContext('2d');

  async function loadFile(file) {
    if (!file) return;
    state.fileName = file.name;
    progress(0, 'decoderen…');
    try {
      const buf = await file.arrayBuffer();
      const Ctx = window.AudioContext || window.webkitAudioContext; const ac = new Ctx();
      const decoded = await ac.decodeAudioData(buf.slice(0)); ac.close && ac.close();
      const n = decoded.length, ch = decoded.numberOfChannels, mono = new Float32Array(n);
      for (let c = 0; c < ch; c++) { const d = decoded.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
      state.samples = mono; state.sampleRate = decoded.sampleRate; state.duration = decoded.duration;
      if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
      state.audioUrl = URL.createObjectURL(file); audio.src = state.audioUrl;
      $('duration').textContent = fmt(state.duration);
      state.peaks = wavePeaks(mono, 1024);
      state.frames = await A.stftAsync(mono, state.sampleRate, {}, (p) => progress(p, `luisteren… ${(p * 100) | 0}%`));
      state.score = A.detect(state.frames, {});
      progress(1, ''); $('progress').hidden = true;
      $('result').hidden = false; $('output').hidden = false;
      update();
      requestAnimationFrame(runPreview);   // na de eerste lay-out, zodat de preview de echte breedte kent
    } catch (err) { $('progress').hidden = true; $('status').textContent = `Dit bestand kon niet gelezen worden (${err.message || err}). Probeer een mp3, wav, ogg of flac.`; console.error(err); }
  }

  function update() {
    if (!state.score) return;
    const max = +$('moments').value;
    state.moments = A.visualMoments(state.score, { max });
    state.gen = G.generateSimple(state.score, state.moments, { fileName: state.fileName });
    $('code').value = state.gen.sketch;
    const s = state.score;
    $('meta').textContent = `${state.fileName} · ${fmt(state.duration)} · ${s.sections.length} secties (${s.sections.map((x) => x.letter).join(' ')})${s.tempo.bpm && s.tempo.confidence > 0.3 ? ` · ${s.tempo.bpm.toFixed(0)} BPM` : ''} · ${state.moments.length} momenten`;
    const list = $('moment-list'); list.innerHTML = '';
    state.moments.forEach((m, i) => {
      const li = document.createElement('li'); li.dataset.index = i;
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = `<span class="n">${i + 1}</span><span class="t">${fmt(m.t)}</span><span>${esc(m.label)}</span><span class="hint">${m.dur.toFixed(1)} s</span><span class="fn">${esc(state.gen.names[i])}</span>`;
      b.setAttribute('aria-label', `Spring naar moment ${i + 1}, ${m.label}, op ${fmt(m.t)}`);
      b.addEventListener('click', () => { audio.currentTime = m.t; draw(); });
      li.appendChild(b); list.appendChild(li);
    });
    draw();
  }

  function wavePeaks(samples, bucket) {
    const n = Math.ceil(samples.length / bucket), min = new Float32Array(n), max = new Float32Array(n);
    for (let b = 0; b < n; b++) { let lo = 1, hi = -1; for (let i = b * bucket, e = Math.min(samples.length, i + bucket); i < e; i++) { const v = samples[i]; if (v < lo) lo = v; if (v > hi) hi = v; } min[b] = lo; max[b] = hi; }
    return { bucket, min, max };
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1, w = line.clientWidth || 800, h = 140;
    if (line.width !== Math.round(w * dpr)) { line.width = Math.round(w * dpr); line.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, w, h);
    if (!state.samples) return;
    const dur = state.duration, t = audio.currentTime;
    // fasen als afwisselende banden
    state.moments.forEach((m, i) => {
      const a = m.t / dur * w, b = (m.t + m.dur) / dur * w;
      ctx.fillStyle = t >= m.t && t < m.t + m.dur ? '#1e1e1e' : i % 2 ? '#111' : '#0d0d0d'; ctx.fillRect(a, 0, b - a, h);
    });
    // golfvorm
    const pk = state.peaks, mid = h * 0.55, amp = h * 0.3, per = pk.min.length / w;
    ctx.fillStyle = '#7a7a76';
    for (let px = 0; px < w; px++) {
      let lo = 1, hi = -1;
      for (let b = Math.floor(px * per), e = Math.min(pk.min.length - 1, Math.floor((px + 1) * per)); b <= e; b++) { if (pk.min[b] < lo) lo = pk.min[b]; if (pk.max[b] > hi) hi = pk.max[b]; }
      if (hi >= lo) ctx.fillRect(px, mid - hi * amp, 1, Math.max(1, (hi - lo) * amp));
    }
    // momenten
    ctx.font = '11px "IBM Plex Mono", monospace'; ctx.textBaseline = 'top';
    state.moments.forEach((m, i) => {
      const x = m.t / dur * w;
      ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x, 0, 2, h);
      ctx.fillStyle = '#e8e8e4'; ctx.fillText(`${i + 1} ${m.label.split('·')[0].trim()}`, x + 5, 6 + (i % 2) * 14);
    });
    ctx.fillStyle = '#ff0000'; ctx.fillRect(t / dur * w - 0.5, 0, 1.5, h);
    $('time').textContent = fmt(t);
    document.querySelectorAll('#moment-list li').forEach((li, i) => { const m = state.moments[i]; li.classList.toggle('now', t >= m.t && t < m.t + m.dur); });
  }

  function runPreview() {
    if (!state.gen) return;
    const frame = $('preview');
    const size = Math.max(240, Math.min(640, (frame.clientWidth || frame.parentElement.clientWidth || 480) - 2));
    const gen = G.generateSimple(state.score, state.moments, { fileName: state.fileName, audioSrc: state.audioUrl, canvas: [size, size] });
    const p5Url = new URL('vendor/p5-2.3.4.min.js', location.href).href;
    const html = gen.html.replace(/<script src="[^"]*p5[^"]*"><\/script>/, `<script src="${p5Url}"></script>`)
      .replace('<script src="sketch.js"></script>', `<script>${gen.sketch.replace(/<\/script/g, '<\\/script')}</script>`)
      .replace(/<p>.*?<\/p>/s, '').replace('padding:16px', 'padding:0');
    $('preview').srcdoc = html;
  }

  // Bediening
  $('file-input').addEventListener('change', (ev) => loadFile(ev.target.files[0]));
  const dz = $('dropzone');
  ['dragenter', 'dragover'].forEach((n) => dz.addEventListener(n, (ev) => { ev.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((n) => dz.addEventListener(n, (ev) => { ev.preventDefault(); dz.classList.remove('over'); }));
  document.body.addEventListener('dragover', (ev) => ev.preventDefault());
  document.body.addEventListener('drop', (ev) => { ev.preventDefault(); if (ev.dataTransfer.files[0]) loadFile(ev.dataTransfer.files[0]); });
  $('load-example').addEventListener('click', async () => {
    try { progress(0, 'brunk.mp3 ophalen…'); const r = await fetch('brunk.mp3'); if (!r.ok) throw Error(r.status); const blob = await r.blob(); loadFile(new File([blob], 'brunk.mp3', { type: blob.type || 'audio/mpeg' })); }
    catch (err) { $('progress').hidden = true; $('status').textContent = `brunk.mp3 staat niet naast voorbeeld.html (${err.message}). Zet het bestand in de map, of sleep een eigen mp3 in het vak.`; }
  });
  $('moments').addEventListener('input', () => { $('moments-value').textContent = $('moments').value; update(); });
  $('moments').addEventListener('change', runPreview);
  $('play').addEventListener('click', () => { if (audio.paused) audio.play(); else audio.pause(); });
  audio.addEventListener('play', () => { $('play').textContent = 'Pauze'; tick(); });
  audio.addEventListener('pause', () => { $('play').textContent = 'Afspelen'; cancelAnimationFrame(state.raf); draw(); });
  function tick() { draw(); if (!audio.paused) state.raf = requestAnimationFrame(tick); }
  line.addEventListener('click', (ev) => { if (!state.samples) return; const r = line.getBoundingClientRect(); audio.currentTime = (ev.clientX - r.left) / r.width * state.duration; draw(); });
  $('copy').addEventListener('click', async () => { if (!state.gen) return; await navigator.clipboard.writeText(state.gen.sketch); const b = $('copy'); b.textContent = 'Gekopieerd'; setTimeout(() => { b.textContent = 'Kopieer'; }, 1200); });
  $('download').addEventListener('click', () => {
    if (!state.gen) return;
    const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
    dl('sketch.js', state.gen.sketch, 'text/javascript'); setTimeout(() => dl('index.html', state.gen.html, 'text/html'), 300);
  });
  $('rerun').addEventListener('click', runPreview);
  window.addEventListener('keydown', (ev) => { if (ev.code === 'Space' && state.samples && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName)) { ev.preventDefault(); $('play').click(); } });
  window.addEventListener('resize', draw);

  function progress(p, text) { $('progress').hidden = false; $('progress-text').textContent = text; const bar = $('progress-bar'); if (p > 0) bar.value = p; else bar.removeAttribute('value'); }
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  window.soundlineSimple = state;
})();
