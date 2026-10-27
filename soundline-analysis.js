/* soundline-analysis.js — offline audio-analyse voor p5.soundline.
   Pure rekenkern: geen DOM, geen p5, geen Web Audio. Werkt in de browser (globaal
   `SoundlineAnalysis`) en in Node (`module.exports`) zodat de detectoren testbaar zijn.

   Pijplijn
     1. stft(samples, sampleRate, opts)  → frames   (zwaar: FFT per frame, één keer per bestand)
     2. detect(frames, opts)             → score    (licht: drempels, peak-picking, tempo, secties)
   De UI bewaart `frames` en roept alleen `detect` opnieuw aan als een schuif verandert.

   Alle tijden zijn in seconden, alle niveaus in dBFS tenzij anders vermeld. */
(function (root) {
  'use strict';

  // ───────────────────────── FFT (radix-2, in place) ─────────────────────────
  const fftCache = new Map();
  function makeFFT(n) {
    if (fftCache.has(n)) return fftCache.get(n);
    if (n < 2 || (n & (n - 1)) !== 0) throw Error('fftSize moet een macht van twee zijn');
    const levels = Math.log2(n) | 0;
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0, x = i;
      for (let l = 0; l < levels; l++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
    const fft = function (re, im) {
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
      }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = i, k = 0; j < i + half; j++, k += step) {
            const l = j + half;
            const tre = re[l] * cos[k] + im[l] * sin[k];
            const tim = -re[l] * sin[k] + im[l] * cos[k];
            re[l] = re[j] - tre; im[l] = im[j] - tim;
            re[j] += tre; im[j] += tim;
          }
        }
      }
    };
    fftCache.set(n, fft);
    return fft;
  }

  // ───────────────────────── Hulpfuncties ─────────────────────────
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const db = (p) => 10 * Math.log10(Math.max(p, 1e-12));
  function percentile(arr, q) {
    const a = Array.from(arr).filter(Number.isFinite).sort((x, y) => x - y);
    if (!a.length) return 0;
    const i = clamp(Math.round(q * (a.length - 1)), 0, a.length - 1);
    return a[i];
  }
  function mean(arr, from = 0, to = arr.length) {
    from = Math.max(0, from); to = Math.min(arr.length, to);
    if (to <= from) return 0;
    let s = 0; for (let i = from; i < to; i++) s += arr[i];
    return s / (to - from);
  }
  function movingAverage(arr, radius) {
    const n = arr.length, out = new Float32Array(n);
    if (radius <= 0) { out.set(arr); return out; }
    let sum = 0, count = 0;
    for (let i = 0; i < Math.min(n, radius + 1); i++) { sum += arr[i]; count++; }
    for (let i = 0; i < n; i++) {
      out[i] = sum / count;
      const add = i + radius + 1, rem = i - radius;
      if (add < n) { sum += arr[add]; count++; }
      if (rem >= 0) { sum -= arr[rem]; count--; }
    }
    return out;
  }
  function logSpacedEdges(count, fLo, fHi) {
    const edges = new Float64Array(count + 1);
    for (let i = 0; i <= count; i++) edges[i] = fLo * Math.pow(fHi / fLo, i / count);
    return edges;
  }
  const fmtTime = (s) => {
    const m = Math.floor(s / 60), r = s - m * 60;
    return `${String(m).padStart(2, '0')}:${r.toFixed(3).padStart(6, '0')}`;
  };

  // ───────────────────────── 1. STFT en frame-features ─────────────────────────
  const STFT_DEFAULTS = {
    fftSize: 2048,
    hop: 512,
    logCompression: 20,     // λ in log(1 + λ·|X|): maakt flux gevoeliger voor zachte onsets
    spectrogramBins: 96,    // log-verdeelde bins voor weergave en sectie-analyse
    spectrogramLo: 30,
    spectrogramHi: 16000,
    lanes: { low: [20, 150], mid: [150, 2000], high: [2000, 16000] },
    bands: [[20, 60], [60, 150], [150, 400], [400, 1200], [1200, 3500], [3500, 9000], [9000, 16000]],
    bandNames: ['sub', 'bass', 'lowmid', 'mid', 'himid', 'high', 'air'],
  };

  /* Verdeelt de FFT-bins over frequentiebanden; elke band krijgt minstens één bin. */
  function binRanges(edgesHz, sampleRate, fftSize) {
    const binHz = sampleRate / fftSize, half = fftSize / 2;
    const ranges = [];
    for (let i = 0; i < edgesHz.length - 1; i++) {
      let lo = Math.floor(edgesHz[i] / binHz), hi = Math.floor(edgesHz[i + 1] / binHz);
      lo = clamp(lo, 1, half - 1); hi = clamp(hi, lo + 1, half);
      ranges.push([lo, hi]);
    }
    return ranges;
  }

  /* Rekent frame f uit en schrijft de features weg. Gedeeld door de sync en de async variant. */
  function makeFrameProcessor(samples, sampleRate, opts, frames) {
    const n = opts.fftSize, hop = opts.hop, half = n >> 1;
    const fft = makeFFT(n);
    const re = new Float64Array(n), im = new Float64Array(n);
    const win = new Float64Array(n);
    for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    const binHz = sampleRate / n;
    const specEdges = binRanges(logSpacedEdges(opts.spectrogramBins, opts.spectrogramLo, Math.min(opts.spectrogramHi, sampleRate / 2 - binHz)), sampleRate, n);
    const laneNames = Object.keys(opts.lanes);
    const laneRanges = laneNames.map((k) => binRanges(opts.lanes[k], sampleRate, n)[0]);
    const bandRanges = opts.bands.map((b) => binRanges(b, sampleRate, n)[0]);
    const prevLog = new Float32Array(half), curLog = new Float32Array(half);
    const mag = new Float32Array(half);
    const total = samples.length;
    const specBins = opts.spectrogramBins;

    return function processFrame(f) {
      const start = f * hop;
      let sumSq = 0;
      for (let i = 0; i < n; i++) {
        const idx = start + i;
        const s = idx < total ? samples[idx] : 0;
        if (i >= (n - hop) / 2 && i < (n + hop) / 2) sumSq += s * s;   // RMS over het hop-centrum
        re[i] = s * win[i]; im[i] = 0;
      }
      fft(re, im);
      let magSum = 0, centroidNum = 0, logSum = 0, powSum = 0;
      for (let k = 0; k < half; k++) {
        const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / (n / 4);  // ~genormaliseerd op Hann
        mag[k] = m;
        const p = m * m;
        magSum += m; centroidNum += m * k * binHz;
        if (k > 0) { logSum += Math.log(p + 1e-12); powSum += p; }
        curLog[k] = Math.log1p(opts.logCompression * m);
      }
      frames.rms[f] = Math.sqrt(sumSq / hop);
      frames.rmsDb[f] = db(frames.rms[f] * frames.rms[f]);
      frames.centroid[f] = magSum > 1e-9 ? centroidNum / magSum : 0;
      const gm = Math.exp(logSum / (half - 1)), am = powSum / (half - 1);
      frames.flatness[f] = am > 1e-12 ? clamp(gm / am, 0, 1) : 0;
      // Spectrale flux per lane: halfgolf-gelijkgericht verschil van log-magnitudes.
      let fluxAll = 0;
      for (let l = 0; l < laneRanges.length; l++) {
        const [lo, hi] = laneRanges[l];
        let s = 0;
        for (let k = lo; k < hi; k++) { const d = curLog[k] - prevLog[k]; if (d > 0) s += d; }
        s /= (hi - lo);
        frames.flux[laneNames[l]][f] = f === 0 ? 0 : s;
        fluxAll += f === 0 ? 0 : s;
      }
      frames.flux.all[f] = fluxAll / laneRanges.length;
      for (let b = 0; b < bandRanges.length; b++) {
        const [lo, hi] = bandRanges[b];
        let p = 0; for (let k = lo; k < hi; k++) p += mag[k] * mag[k];
        frames.bands[b][f] = db(p);
      }
      const row = f * specBins;
      for (let b = 0; b < specBins; b++) {
        const [lo, hi] = specEdges[b];
        let p = 0; for (let k = lo; k < hi; k++) p += mag[k] * mag[k];
        p /= (hi - lo);
        frames.spectrogram[row + b] = clamp(Math.round((db(p) + 90) / 90 * 255), 0, 255);
      }
      prevLog.set(curLog);
    };
  }

  function allocFrames(samples, sampleRate, opts) {
    const nFrames = Math.max(1, Math.ceil(samples.length / opts.hop));
    const laneNames = Object.keys(opts.lanes);
    const frames = {
      sampleRate, fftSize: opts.fftSize, hop: opts.hop, count: nFrames,
      frameRate: sampleRate / opts.hop,
      duration: samples.length / sampleRate,
      times: new Float32Array(nFrames),
      rms: new Float32Array(nFrames), rmsDb: new Float32Array(nFrames),
      centroid: new Float32Array(nFrames), flatness: new Float32Array(nFrames),
      flux: { all: new Float32Array(nFrames) },
      laneNames,
      bands: opts.bands.map(() => new Float32Array(nFrames)),
      bandNames: opts.bandNames.slice(),
      bandEdges: opts.bands.map((b) => b.slice()),
      spectrogramBins: opts.spectrogramBins,
      spectrogramLo: opts.spectrogramLo, spectrogramHi: opts.spectrogramHi,
      spectrogram: new Uint8Array(nFrames * opts.spectrogramBins),
    };
    for (const k of laneNames) frames.flux[k] = new Float32Array(nFrames);
    // Het frame is gecentreerd op start + fftSize/2; de tijd die we rapporteren is het hop-centrum.
    for (let f = 0; f < nFrames; f++) frames.times[f] = (f * opts.hop + opts.fftSize / 2) / sampleRate;
    return frames;
  }

  function stft(samples, sampleRate, options) {
    const opts = Object.assign({}, STFT_DEFAULTS, options || {});
    const frames = allocFrames(samples, sampleRate, opts);
    const process = makeFrameProcessor(samples, sampleRate, opts, frames);
    for (let f = 0; f < frames.count; f++) process(f);
    return frames;
  }

  /* Zelfde als stft, maar geeft de hoofdthread regelmatig terug en meldt voortgang (0..1). */
  async function stftAsync(samples, sampleRate, options, onProgress) {
    const opts = Object.assign({}, STFT_DEFAULTS, options || {});
    const frames = allocFrames(samples, sampleRate, opts);
    const process = makeFrameProcessor(samples, sampleRate, opts, frames);
    const chunk = 256;
    for (let f = 0; f < frames.count; f++) {
      process(f);
      if (f % chunk === chunk - 1) {
        if (onProgress) onProgress(f / frames.count);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (onProgress) onProgress(1);
    return frames;
  }

  // ───────────────────────── 2. Detectoren ─────────────────────────
  const DETECT_DEFAULTS = {
    onsetSensitivity: { low: 0.5, mid: 0.5, high: 0.5 },   // 0 = alleen de sterkste, 1 = bijna alles
    onsetMinGapMs: 80,
    onsetPreMaxMs: 30, onsetPostMaxMs: 30,
    onsetPreMeanMs: 100, onsetPostMeanMs: 70,
    bpmMin: 55, bpmMax: 210, bpmPrior: 120, bpmPriorOctaves: 1.0,
    beatTightness: 300,
    tempoOctave: 'auto',    // 'auto' | 'half' | 'base' | 'double': octaafkeuze na de schatting
    meter: 4,
    sectionWindowSec: 0.5, sectionKernelSec: 10, sectionMinSec: 6, sectionSensitivity: 0.5, sectionRepeatSim: 0.6,
    peakCount: 5, peakMinGapSec: 6, peakWindowSec: 0.5,
    silenceDropDb: 45, silenceFloorDb: -60, silenceMinMs: 400,
    dropMinDb: 8, dropLookbackSec: 2, dropMinGapSec: 10,
    curveHz: 20,
  };

  /* Peak-picking op een onset-envelop (Böck/Krebs/Widmer-stijl: lokaal maximum,
     boven lokaal gemiddelde + δ, minimale afstand). Geeft frame-indices en sterktes. */
  function pickOnsets(env, frameRate, sensitivity, p) {
    const n = env.length;
    const toF = (ms) => Math.max(1, Math.round(ms / 1000 * frameRate));
    const preMax = toF(p.onsetPreMaxMs), postMax = toF(p.onsetPostMaxMs);
    const preMean = toF(p.onsetPreMeanMs), postMean = toF(p.onsetPostMeanMs);
    const minGap = toF(p.onsetMinGapMs);
    const sm = movingAverage(env, 1);
    const scale = percentile(sm, 0.95) || 1e-6;
    const delta = scale * (0.04 + 0.9 * Math.pow(1 - clamp(sensitivity, 0, 1), 2));
    const out = [];
    let last = -Infinity;
    for (let i = 1; i < n - 1; i++) {
      const v = sm[i];
      if (v <= 0) continue;
      let isMax = true;
      for (let j = Math.max(0, i - preMax); j <= Math.min(n - 1, i + postMax); j++) {
        if (sm[j] > v) { isMax = false; break; }
      }
      if (!isMax) continue;
      const m = mean(sm, i - preMean, i + postMean + 1);
      if (v < m + delta) continue;
      if (i - last < minGap) {
        // Bij twee pieken binnen de minimale afstand houden we de sterkste.
        if (out.length && out[out.length - 1].value < v) { out.pop(); } else continue;
      }
      out.push({ frame: i, value: v });
      last = i;
    }
    for (const o of out) o.strength = clamp(o.value / scale, 0, 1);
    return out;
  }

  /* Tempo via autocorrelatie van de gecombineerde onset-envelop, gewogen met een
     log-normale voorkeur rond bpmPrior (Ellis 2007). */
  function estimateTempo(env, frameRate, p) {
    const n = env.length;
    const base = movingAverage(env, Math.round(frameRate * 0.5));
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = Math.max(0, env[i] - base[i]);
    const minLag = Math.max(2, Math.floor(60 / p.bpmMax * frameRate));
    const maxLag = Math.min(n - 2, Math.ceil(60 / p.bpmMin * frameRate));
    if (maxLag <= minLag + 2) return { bpm: 0, confidence: 0, period: 0, candidates: [] };
    const acf = new Float64Array(maxLag + 1);
    let norm = 0; for (let i = 0; i < n; i++) norm += o[i] * o[i];
    norm = norm || 1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0; for (let i = 0; i + lag < n; i++) s += o[i] * o[i + lag];
      acf[lag] = s / norm;
    }
    const score = new Float64Array(maxLag + 1);
    const candidates = [];
    for (let lag = minLag; lag <= maxLag; lag++) {
      const bpm = 60 * frameRate / lag;
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / p.bpmPrior) / p.bpmPriorOctaves, 2));
      // Harmonische ondersteuning: een echt tempo heeft ook energie op 2× en ½× de periode.
      const h2 = lag * 2 <= maxLag ? acf[lag * 2] : 0;
      const h05 = lag % 2 === 0 && lag / 2 >= minLag ? acf[lag / 2] : 0;
      score[lag] = (acf[lag] + 0.5 * h2 + 0.25 * h05) * prior;
    }
    let bestLag = minLag;
    for (let lag = minLag; lag <= maxLag; lag++) if (score[lag] > score[bestLag]) bestLag = lag;
    // Lokale maxima verzamelen voor de kandidatenlijst.
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (score[lag] > score[lag - 1] && score[lag] >= score[lag + 1]) candidates.push({ lag, score: score[lag] });
    }
    candidates.sort((a, b) => b.score - a.score);
    // Parabolische verfijning van de beste lag.
    let lagRef = bestLag;
    if (bestLag > minLag && bestLag < maxLag) {
      const a = score[bestLag - 1], b = score[bestLag], c = score[bestLag + 1];
      const denom = a - 2 * b + c;
      if (Math.abs(denom) > 1e-12) lagRef = bestLag + 0.5 * (a - c) / denom;
    }
    const meanScore = mean(score, minLag, maxLag + 1) || 1e-9;
    const confidence = clamp((score[bestLag] / meanScore - 1) / 6, 0, 1);
    return {
      bpm: 60 * frameRate / lagRef,
      period: lagRef / frameRate,
      periodFrames: lagRef,
      confidence,
      candidates: candidates.slice(0, 6).map((c) => ({ bpm: 60 * frameRate / c.lag, score: c.score / score[bestLag] })),
    };
  }

  /* Beat-tracking met dynamisch programmeren (Ellis 2007): elke beat ligt bij voorkeur
     één periode na de vorige; afwijkingen kosten tightness·log²(τ/period). */
  function trackBeats(env, frameRate, periodFrames, tightness) {
    const n = env.length;
    if (!(periodFrames > 1) || n < periodFrames * 2) return [];
    const scale = percentile(env, 0.95) || 1e-6;
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = env[i] / scale;
    const cum = new Float64Array(n), back = new Int32Array(n).fill(-1);
    const lo = Math.max(1, Math.round(periodFrames / 2)), hi = Math.round(periodFrames * 2);
    const penalty = new Float64Array(hi + 1);
    for (let d = lo; d <= hi; d++) penalty[d] = -tightness * Math.pow(Math.log(d / periodFrames), 2);
    for (let i = 0; i < n; i++) {
      let best = 0, bestJ = -1;
      for (let d = lo; d <= hi && i - d >= 0; d++) {
        const v = cum[i - d] + penalty[d];
        if (v > best) { best = v; bestJ = i - d; }
      }
      cum[i] = o[i] + best; back[i] = bestJ;
    }
    // Start de terugloop bij het beste punt in de laatste periode.
    let end = n - 1;
    for (let i = Math.max(0, n - Math.round(periodFrames)); i < n; i++) if (cum[i] > cum[end]) end = i;
    const beats = [];
    for (let i = end; i >= 0; i = back[i]) { beats.push(i); if (back[i] < 0) break; }
    beats.reverse();
    return beats.map((f) => ({ frame: f, strength: clamp(o[f], 0, 1) }));
  }

  /* Nieuwheidscurve uit een zelfgelijkenismatrix met dambord-kernel (Foote 2000). */
  function sectionNovelty(frames, p) {
    const fr = frames.frameRate;
    const win = Math.max(1, Math.round(p.sectionWindowSec * fr));
    const nWin = Math.max(1, Math.floor(frames.count / win));
    const specBins = frames.spectrogramBins, groups = 24, per = Math.floor(specBins / groups);
    // Per venster: 24 gemiddelde log-bandenergieën + genormaliseerd rms, als eenheidsvector.
    const feats = [];
    for (let w = 0; w < nWin; w++) {
      const v = new Float64Array(groups + 1);
      for (let f = w * win; f < (w + 1) * win; f++) {
        const row = f * specBins;
        for (let g = 0; g < groups; g++) {
          let s = 0; for (let b = 0; b < per; b++) s += frames.spectrogram[row + g * per + b];
          v[g] += s / per / 255;
        }
        v[groups] += clamp((frames.rmsDb[f] + 60) / 60, 0, 1);
      }
      let norm = 0; for (let i = 0; i <= groups; i++) { v[i] /= win; norm += v[i] * v[i]; }
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i <= groups; i++) v[i] /= norm;
      feats.push(v);
    }
    const L = Math.max(2, Math.round(p.sectionKernelSec / p.sectionWindowSec / 2));  // halve kernel
    const kernel = [];
    for (let a = -L; a < L; a++) {
      const row = [];
      for (let b = -L; b < L; b++) {
        const sign = (a < 0) === (b < 0) ? 1 : -1;
        const g = Math.exp(-((a + 0.5) * (a + 0.5) + (b + 0.5) * (b + 0.5)) / (2 * (L * 0.5) * (L * 0.5)));
        row.push(sign * g);
      }
      kernel.push(row);
    }
    const sim = (i, j) => { const a = feats[i], b = feats[j]; let s = 0; for (let k = 0; k < a.length; k++) s += a[k] * b[k]; return s; };
    const novelty = new Float32Array(nWin);
    for (let w = L; w < nWin - L; w++) {
      let s = 0;
      for (let a = -L; a < L; a++) for (let b = -L; b < L; b++) s += kernel[a + L][b + L] * sim(w + a, w + b);
      novelty[w] = Math.max(0, s);
    }
    const mx = Math.max(1e-9, ...novelty);
    for (let w = 0; w < nWin; w++) novelty[w] /= mx;
    return { novelty, windowSec: p.sectionWindowSec, nWin, win, feats };
  }

  function detect(frames, options) {
    const p = Object.assign({}, DETECT_DEFAULTS, options || {});
    p.onsetSensitivity = Object.assign({}, DETECT_DEFAULTS.onsetSensitivity, (options || {}).onsetSensitivity || {});
    const fr = frames.frameRate, n = frames.count, T = frames.times;
    const t = (f) => T[clamp(f, 0, n - 1)];

    // Niveau-statistiek
    const maxDb = percentile(frames.rmsDb, 0.995);
    const floorDb = Math.max(p.silenceFloorDb, maxDb - p.silenceDropDb);
    const rmsSmooth = movingAverage(frames.rmsDb, Math.round(fr * 0.125));

    // Stiltes
    const silences = [];
    {
      const minFrames = Math.round(p.silenceMinMs / 1000 * fr);
      let start = -1;
      for (let f = 0; f <= n; f++) {
        const quiet = f < n && rmsSmooth[f] < floorDb;
        if (quiet && start < 0) start = f;
        if (!quiet && start >= 0) {
          if (f - start >= minFrames) silences.push({ start: t(start), end: t(f), startFrame: start, endFrame: f });
          start = -1;
        }
      }
    }
    const inSilence = (f) => silences.some((s) => f >= s.startFrame && f < s.endFrame);

    // Onsets per lane
    const onsets = {};
    for (const lane of frames.laneNames) {
      onsets[lane] = pickOnsets(frames.flux[lane], fr, p.onsetSensitivity[lane] ?? 0.5, p)
        .map((o, i) => ({ index: i + 1, t: t(o.frame), frame: o.frame, strength: o.strength }));
    }

    // Tempo en beats
    const tempo = estimateTempo(frames.flux.all, fr, p);
    let beats = tempo.periodFrames ? trackBeats(frames.flux.all, fr, tempo.periodFrames, p.beatTightness) : [];
    // Octaafcontrole. Salience: energie op de beats t.o.v. de tussenbeats (laag = er zit evenveel tussen,
    // dus het dubbele tempo is plausibel). Alternatie: even t.o.v. oneven beats (laag = om de andere beat
    // is leeg, dus het halve tempo is plausibel).
    if (beats.length >= 8) {
      const env = frames.flux.all;
      let on = 0, off = 0, even = 0, odd = 0;
      for (let i = 0; i < beats.length - 1; i++) {
        const a = beats[i].frame, b = beats[i + 1].frame;
        on += env[a]; off += env[Math.round((a + b) / 2)];
        if (i % 2) odd += env[a]; else even += env[a];
      }
      const salience = on / (off + 1e-9);
      const alternation = Math.min(even, odd) / (Math.max(even, odd) + 1e-9);
      let auto = 'base';
      if (salience < 1.25 && tempo.bpm * 2 <= p.bpmMax) auto = 'double';
      else if (alternation < 0.45 && tempo.bpm / 2 >= p.bpmMin) auto = 'half';
      const choice = p.tempoOctave === 'auto' ? auto : p.tempoOctave;
      const factor = choice === 'double' ? 0.5 : choice === 'half' ? 2 : 1;
      tempo.octave = { salience, alternation, auto, applied: choice, estimatedBpm: tempo.bpm };
      if (factor !== 1) {
        tempo.periodFrames *= factor; tempo.period *= factor; tempo.bpm /= factor;
        beats = trackBeats(env, fr, tempo.periodFrames, p.beatTightness);
      }
    } else tempo.octave = { salience: 0, alternation: 1, auto: 'base', applied: 'base', estimatedBpm: tempo.bpm };
    beats = beats.filter((b) => !inSilence(b.frame));
    // Downbeat: de fase (0..meter-1) met de meeste lage energie/flux op de beats.
    let downbeatOffset = 0;
    if (beats.length >= p.meter * 2) {
      let best = -Infinity;
      for (let off = 0; off < p.meter; off++) {
        let s = 0;
        for (let i = off; i < beats.length; i += p.meter) s += frames.flux.low[beats[i].frame] + 0.5 * frames.flux.all[beats[i].frame];
        if (s > best) { best = s; downbeatOffset = off; }
      }
    }
    beats = beats.map((b, i) => {
      const rel = i - downbeatOffset;
      const bar = Math.floor(rel / p.meter) + 1;
      const beatInBar = ((rel % p.meter) + p.meter) % p.meter + 1;
      return { index: i + 1, t: t(b.frame), frame: b.frame, strength: b.strength, bar, beatInBar };
    });
    const bars = beats.filter((b) => b.beatInBar === 1 && b.bar >= 1).map((b, i) => ({ index: i + 1, t: b.t, frame: b.frame, bar: b.bar, strength: b.strength }));

    // Secties
    const nov = sectionNovelty(frames, p);
    const sections = [];
    {
      const minWin = Math.max(1, Math.round(p.sectionMinSec / nov.windowSec));
      // Drempelstatistiek zonder de top 2 %: één dominante grens (bv. een outro) mag de rest niet onzichtbaar maken.
      const trimmed = Array.from(nov.novelty).filter((x) => x <= percentile(nov.novelty, 0.98));
      const nvMean = mean(trimmed), nvStd = Math.sqrt(mean(trimmed.map((x) => (x - nvMean) * (x - nvMean))));
      const thr = nvMean + nvStd * (0.3 + 2.2 * (1 - clamp(p.sectionSensitivity, 0, 1)));
      const boundaries = [];
      // Lange stiltes zijn altijd grenzen (begin en einde) en gaan vóór de nieuwheidspieken.
      for (const s of silences) {
        if (s.end - s.start >= 1.5) {
          for (const f of [s.startFrame, s.endFrame]) {
            if (f / fr < 1 || (n - f) / fr < 1) continue;
            boundaries.push({ frame: f, novelty: 1, fromSilence: true });
          }
        }
      }
      // Nieuwheidspieken: lokale maxima boven de drempel, sterkste eerst, met minimale onderlinge afstand.
      const cand = [];
      for (let w = 2; w < nov.nWin - 2; w++) {
        const v = nov.novelty[w];
        if (v < thr) continue;
        if (v < nov.novelty[w - 1] || v < nov.novelty[w + 1] || v < nov.novelty[w - 2] || v < nov.novelty[w + 2]) continue;
        const frame = w * nov.win;
        if (frame / fr < p.sectionMinSec || (n - frame) / fr < p.sectionMinSec) continue;
        cand.push({ frame, novelty: v });
      }
      cand.sort((a, b) => b.novelty - a.novelty);
      for (const c of cand) {
        if (boundaries.some((b) => Math.abs(b.frame - c.frame) / fr < p.sectionMinSec)) continue;
        boundaries.push(c);
      }
      boundaries.sort((a, b) => a.frame - b.frame);
      // Snap een grens naar de dichtstbijzijnde maatstreep (binnen een halve kernel) als er beats zijn.
      const snapped = boundaries.map((b) => {
        if (b.fromSilence || !bars.length) return b;
        let best = null;
        for (const bar of bars) {
          const d = Math.abs(bar.frame - b.frame) / fr;
          if (d <= 2 && (!best || d < best.d)) best = { d, frame: bar.frame };
        }
        return best ? Object.assign({}, b, { frame: best.frame, snappedToBar: true }) : b;
      });
      const edges = [0, ...snapped.map((b) => b.frame), n];
      for (let i = 0; i < edges.length - 1; i++) {
        const a = edges[i], b = edges[i + 1];
        if (b <= a) continue;
        const e = mean(frames.rmsDb, a, b);
        const low = mean(frames.flux.low, a, b), all = mean(frames.flux.all, a, b);
        sections.push({ index: sections.length + 1, start: a === 0 ? 0 : t(a), end: b === n ? frames.duration : t(b), startFrame: a, endFrame: b, energyDb: e, novelty: snapped[i - 1]?.novelty ?? 0, lowShare: all > 0 ? low / all : 0 });
      }
      const topDb = Math.max(...sections.map((s) => s.energyDb));
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        const rel = s.energyDb - topDb;
        s.level = rel >= -3 ? 'loud' : rel <= -12 ? 'quiet' : 'mid';
        const tags = [];
        if (i === 0 && sections.length > 1 && s.level !== 'loud') tags.push('intro');
        if (i === sections.length - 1 && sections.length > 1 && s.level !== 'loud') tags.push('outro');
        if (i > 0 && s.energyDb - sections[i - 1].energyDb >= 6) tags.push('lift');
        if (i > 0 && sections[i - 1].energyDb - s.energyDb >= 6) tags.push('breakdown');
        if (s.level === 'loud' && !tags.length) tags.push('peak');
        s.tags = tags;
      }
      // Letters: een sectie die lijkt op een eerdere (cosinus van de gecentreerde gemiddelde kenmerken)
      // krijgt dezelfde letter. A B A' wordt zo zichtbaar zonder vormanalyse.
      const F = nov.feats, dim = F.length ? F[0].length : 0;
      const gmean = new Float64Array(dim);
      for (const v of F) for (let k = 0; k < dim; k++) gmean[k] += v[k] / F.length;
      const secVec = sections.map((s) => {
        const a = Math.floor(s.startFrame / nov.win), b = Math.max(a + 1, Math.floor(s.endFrame / nov.win));
        const v = new Float64Array(dim); let cnt = 0;
        for (let w = a; w < b && w < F.length; w++) { for (let k = 0; k < dim; k++) v[k] += F[w][k] - gmean[k]; cnt++; }
        for (let k = 0; k < dim; k++) v[k] /= cnt || 1;
        return v;
      });
      const cos = (x, y) => { let d = 0, nx = 0, ny = 0; for (let k = 0; k < x.length; k++) { d += x[k] * y[k]; nx += x[k] * x[k]; ny += y[k] * y[k]; } return nx && ny ? d / Math.sqrt(nx * ny) : 0; };
      let nextLetter = 0;
      sections.forEach((s, i) => {
        let best = -1, bi = -1;
        for (let j = 0; j < i; j++) { const c = cos(secVec[i], secVec[j]); if (c > best) { best = c; bi = j; } }
        s.similarity = bi >= 0 ? best : null;
        s.letter = bi >= 0 && best >= p.sectionRepeatSim ? sections[bi].letter : String.fromCharCode(65 + (nextLetter++ % 26));
      });
    }

    // Pieken (luidste momenten)
    const peaks = [];
    {
      const sm = movingAverage(frames.rmsDb, Math.round(fr * p.peakWindowSec));
      const gap = Math.round(p.peakMinGapSec * fr);
      const cand = [];
      const minPeakDb = mean(frames.rmsDb.filter((v) => v > floorDb));   // een piek is minstens zo luid als het gemiddelde
      for (let f = 1; f < n - 1; f++) if (sm[f] >= sm[f - 1] && sm[f] > sm[f + 1] && sm[f] >= minPeakDb && !inSilence(f)) cand.push({ frame: f, db: sm[f] });
      cand.sort((a, b) => b.db - a.db);
      for (const c of cand) {
        if (peaks.length >= p.peakCount) break;
        if (peaks.some((q) => Math.abs(q.frame - c.frame) < gap)) continue;
        peaks.push(c);
      }
      peaks.forEach((q, i) => { q.rank = i + 1; });
      peaks.sort((a, b) => a.frame - b.frame);
      peaks.forEach((q, i) => { q.index = i + 1; q.t = t(q.frame); });
    }

    // Drops: plotse sprong in niveau na een rustiger aanloop
    const drops = [];
    {
      const fast = movingAverage(frames.rmsDb, Math.round(fr * 0.05));
      const look = Math.round(p.dropLookbackSec * fr);
      const trackMean = mean(frames.rmsDb.filter((v) => v > floorDb));
      const gap = Math.round(p.dropMinGapSec * fr);
      for (let f = look; f < n; f++) {
        const before = mean(fast, f - look, f - Math.round(fr * 0.1));
        const delta = fast[f] - before;
        if (delta >= p.dropMinDb && before < trackMean && fast[f] >= trackMean - 1) {
          if (drops.length && f - drops[drops.length - 1].frame < gap) {
            if (delta > drops[drops.length - 1].deltaDb) drops[drops.length - 1] = { frame: f, deltaDb: delta };
            continue;
          }
          drops.push({ frame: f, deltaDb: delta });
        }
      }
      drops.forEach((d, i) => { d.index = i + 1; d.t = t(d.frame); });
    }

    // Curves voor export (gedownsampled)
    const curves = (() => {
      const step = Math.max(1, Math.round(fr / p.curveHz));
      const hz = fr / step;
      const count = Math.ceil(n / step);
      const lin = (dbv) => clamp((dbv - floorDb) / (maxDb - floorDb || 1), 0, 1);
      const out = { hz, level: [], low: [], mid: [], high: [], centroid: [] };
      const bandIdx = { low: [0, 1], mid: [2, 3], high: [4, 5, 6] };
      const bandMax = {};
      for (const k in bandIdx) bandMax[k] = percentile(frames.bands[bandIdx[k][0]].map((_, f) => Math.max(...bandIdx[k].map((b) => frames.bands[b][f]))), 0.995);
      for (let c = 0; c < count; c++) {
        const a = c * step, b = Math.min(n, a + step);
        out.level.push(+lin(mean(frames.rmsDb, a, b)).toFixed(3));
        for (const k in bandIdx) {
          const v = mean(Float32Array.from({ length: b - a }, (_, i) => Math.max(...bandIdx[k].map((bi) => frames.bands[bi][a + i]))));
          out[k].push(+clamp((v - (bandMax[k] - 50)) / 50, 0, 1).toFixed(3));
        }
        const ce = mean(frames.centroid, a, b);
        out.centroid.push(+clamp(Math.log2(Math.max(ce, 50) / 50) / Math.log2(10000 / 50), 0, 1).toFixed(3));
      }
      return out;
    })();

    // Eén chronologische gebeurtenislijst
    const events = [];
    for (const s of sections) events.push({ type: 'section', t: s.start, dur: s.end - s.start, index: s.index, strength: 1, label: `sectie ${s.index} · ${s.letter} · ${s.level}${s.tags.length ? ' · ' + s.tags.join(', ') : ''}` });
    for (const b of bars) events.push({ type: 'bar', t: b.t, dur: 0, index: b.index, strength: b.strength, label: `maat ${b.bar}` });
    for (const b of beats) events.push({ type: 'beat', t: b.t, dur: 0, index: b.index, strength: b.strength, label: `beat ${b.index} (maat ${b.bar}.${b.beatInBar})` });
    for (const lane of frames.laneNames) for (const o of onsets[lane]) events.push({ type: lane, t: o.t, dur: 0, index: o.index, strength: o.strength, label: `${lane} onset ${o.index}` });
    for (const q of peaks) events.push({ type: 'peak', t: q.t, dur: 0, index: q.index, strength: 1, label: `piek ${q.index} (#${q.rank}, ${q.db.toFixed(1)} dB)` });
    for (const s of silences) events.push({ type: 'silence', t: s.start, dur: s.end - s.start, index: silences.indexOf(s) + 1, strength: 1, label: `stilte ${silences.indexOf(s) + 1}` });
    for (const d of drops) events.push({ type: 'drop', t: d.t, dur: 0, index: d.index, strength: clamp(d.deltaDb / 20, 0, 1), label: `drop ${d.index} (+${d.deltaDb.toFixed(1)} dB)` });
    events.sort((a, b) => a.t - b.t || a.type.localeCompare(b.type));

    return {
      duration: frames.duration, frameRate: fr, params: p,
      levels: { maxDb, floorDb },
      onsets, tempo, beats, bars, downbeatOffset, sections, peaks, silences, drops,
      novelty: nov, curves, events,
    };
  }

  const api = { makeFFT, stft, stftAsync, detect, pickOnsets, estimateTempo, trackBeats, STFT_DEFAULTS, DETECT_DEFAULTS, fmtTime, movingAverage, percentile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SoundlineAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
