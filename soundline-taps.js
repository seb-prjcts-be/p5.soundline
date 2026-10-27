/* soundline-taps.js — het tiksysteem als pure module: lanes per toets, tikken met meerdere takes
   (tweede ronde), spreiding per tik, verplaatsen met de hand, en omzetting naar cues.
   Geen DOM. Browser: globaal `SoundlineTaps`; Node: `module.exports`.

   Datamodel
     store = { lanes: { [key]: { key, label, taps: [tap] } } }
     tap   = { t, dur, raw, takes: [{ t, dur, raw }], manual }
       t, dur  = wat geëxporteerd wordt: gemiddelde van de takes, of de handmatig gezette waarde
       raw     = laatst getikte tijd zonder reactiecorrectie (ter informatie)
       takes   = elke ronde één take; de spreiding ertussen zegt hoe stabiel de tik is
       manual  = true zodra de tik met de muis of de pijltjes is verplaatst: dan niet meer middelen of snappen */
(function (root) {
  'use strict';

  const DEFAULTS = { mergeWindowMs: 150, holdThresholdSec: 0.2 };
  const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;

  /* Oude opslag (tikken zonder takes) wordt in place bijgewerkt. */
  function normalize(store) {
    if (!store || typeof store !== 'object') store = { lanes: {} };
    if (!store.lanes) store.lanes = {};
    for (const key in store.lanes) {
      const lane = store.lanes[key];
      lane.key = lane.key || key; lane.label = lane.label || key; lane.taps = lane.taps || [];
      for (const tap of lane.taps) {
        if (!Array.isArray(tap.takes) || !tap.takes.length) tap.takes = [{ t: tap.t, dur: tap.dur || 0, raw: tap.raw == null ? tap.t : tap.raw }];
        tap.dur = tap.dur || 0; tap.manual = !!tap.manual;
      }
    }
    return store;
  }

  function lane(store, key, label) {
    if (!store.lanes[key]) store.lanes[key] = { key, label: label || key, taps: [] };
    return store.lanes[key];
  }

  function recompute(tap) {
    if (tap.manual) return tap;
    tap.t = mean(tap.takes.map((k) => k.t));
    tap.dur = mean(tap.takes.map((k) => k.dur || 0));
    if (tap.dur < 0.05) tap.dur = 0;
    return tap;
  }

  /* Voegt een tik toe. mode 'new': altijd een nieuwe tik. mode 'merge' (tweede ronde): binnen
     mergeWindowMs van een bestaande tik in dezelfde lane wordt het een extra take van die tik. */
  function addTap(store, key, take, options) {
    const o = Object.assign({}, DEFAULTS, { mode: 'new' }, options || {});
    const ln = lane(store, key);
    take = { t: take.t, dur: take.dur || 0, raw: take.raw == null ? take.t : take.raw };
    if (o.mode === 'merge') {
      let best = null, bd = o.mergeWindowMs / 1000;
      for (const tap of ln.taps) { const d = Math.abs(tap.t - take.t); if (d <= bd) { bd = d; best = tap; } }
      if (best) { best.takes.push(take); best.raw = take.raw; recompute(best); return { lane: ln, tap: best, take, merged: true }; }
    }
    const tap = { t: take.t, dur: take.dur, raw: take.raw, takes: [take], manual: false };
    ln.taps.push(tap);
    return { lane: ln, tap, take, merged: false };
  }

  /* Maakt een toevoeging ongedaan: de take gaat eruit; was het de laatste, dan de hele tik. */
  function removeTake(store, key, tap, take) {
    const ln = store.lanes[key]; if (!ln) return false;
    const i = tap.takes.indexOf(take);
    if (i >= 0) tap.takes.splice(i, 1);
    if (!tap.takes.length) return removeTap(store, key, tap);
    recompute(tap);
    return true;
  }
  function removeTap(store, key, tap) {
    const ln = store.lanes[key]; if (!ln) return false;
    const i = ln.taps.indexOf(tap); if (i < 0) return false;
    ln.taps.splice(i, 1);
    if (!ln.taps.length) delete store.lanes[key];
    return true;
  }
  function moveTap(tap, t, duration) { tap.t = Math.max(0, Math.min(duration == null ? Infinity : duration, t)); tap.manual = true; return tap; }
  function resizeTap(tap, dur) { tap.dur = Math.max(0, dur); if (tap.dur < 0.05) tap.dur = 0; tap.manual = true; return tap; }
  function resetTap(tap) { tap.manual = false; return recompute(tap); }

  /* Spreiding van de takes: aantal, bereik en standaardafwijking in ms. */
  function spread(tap) {
    const ts = tap.takes.map((k) => k.t);
    if (ts.length < 2) return { n: ts.length, rangeMs: 0, sdMs: 0, min: tap.t, max: tap.t };
    const m = mean(ts), sd = Math.sqrt(mean(ts.map((x) => (x - m) * (x - m))));
    return { n: ts.length, rangeMs: (Math.max(...ts) - Math.min(...ts)) * 1000, sdMs: sd * 1000, min: Math.min(...ts), max: Math.max(...ts) };
  }
  function laneStats(ln) {
    const multi = ln.taps.filter((t) => t.takes.length > 1);
    return { count: ln.taps.length, takes: ln.taps.reduce((s, t) => s + t.takes.length, 0), multi: multi.length, meanSdMs: multi.length ? mean(multi.map((t) => spread(t).sdMs)) : 0, meanRangeMs: multi.length ? mean(multi.map((t) => spread(t).rangeMs)) : 0 };
  }

  const laneType = (ln) => 'tap:' + (ln.label || ln.key);
  const lanes = (store) => Object.values(store.lanes).sort((a, b) => a.key.localeCompare(b.key));

  /* Cues voor de generator en de tijdlijn. Snappen (naar onsets of beats) geldt niet voor handmatig
     verplaatste tikken. Elke cue houdt een verwijzing naar zijn tik (`tap`) voor selectie en slepen. */
  function toEvents(store, options) {
    const o = Object.assign({ snapTargets: [], tolSec: 0.06, duration: Infinity }, options || {});
    const targets = o.snapTargets.slice().sort((a, b) => a - b);
    const snapTo = (t) => {
      if (!targets.length) return t;
      let best = t, d = o.tolSec + 1;
      for (const x of targets) { const dd = Math.abs(x - t); if (dd < d) { d = dd; best = x; } if (x > t + o.tolSec) break; }
      return d <= o.tolSec ? best : t;
    };
    const events = [];
    for (const ln of lanes(store)) {
      const sorted = ln.taps.slice().sort((a, b) => a.t - b.t);
      sorted.forEach((tap, i) => {
        const t = Math.max(0, Math.min(o.duration, tap.manual ? tap.t : snapTo(tap.t)));
        const sp = spread(tap);
        const info = sp.n > 1 ? ` ±${sp.sdMs.toFixed(0)} ms (${sp.n}×)` : '';
        events.push({
          type: laneType(ln), lane: ln.label || ln.key, key: ln.key, t, dur: tap.dur || 0, index: i + 1, strength: 1,
          raw: tap.raw, takes: sp.n, spreadMs: sp.sdMs, rangeMs: sp.rangeMs, manual: tap.manual, tap, laneKey: ln.key,
          label: `tik ${ln.key} · ${ln.label || ln.key} ${i + 1}${tap.dur ? ' (duur)' : ''}${tap.manual ? ' (hand)' : ''}${info}`,
        });
      });
    }
    events.sort((a, b) => a.t - b.t);
    return events;
  }

  const api = { DEFAULTS, normalize, lane, addTap, removeTake, removeTap, moveTap, resizeTap, resetTap, spread, laneStats, laneType, lanes, toEvents };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SoundlineTaps = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
