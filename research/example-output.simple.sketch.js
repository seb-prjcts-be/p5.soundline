/* ──────────────────────────────────────────────────────────────────────
   soundline · test.mp3 · 3 visuele momenten
   gegenereerd 2026-10-27 door p5.soundline (eenvoudig voorbeeld)

   Elk moment is een functie. Ze worden in volgorde vanuit draw() aangeroepen en elk moment
   loopt tot het volgende begint: t = seconden sinds het moment, p = voortgang 0..1 tot het
   volgende moment, e = { at, dur, kind, label, letter, first, level }. e.level is het geluidsniveau
   0..1 van dit frame. De tekeningen in de functies zijn voorbeelden: vervang ze.
   Zet het geluidsbestand naast dit bestand; klik op het canvas om te starten.
   ────────────────────────────────────────────────────────────────────── */

const SOUNDLINE = {
  file: "test.mp3",
  duration: 12,
  hud: true,
  moments: [["0","6.06","opening"],["6.06","4.946","drop +35 dB"],["11.006","0.994","piek 1"]],
  curves: {"hz":21.533203125,"level":[0.396,0.001,0,0,0,0,0,0,0,0,0.847,0.266,0,0,0,0,0,0,0,0,0.471,0.709,0.164,0,0,0,0,0,0,0,0,0.482,0.573,0.073,0,0,0,0,0,0,0,0,0.912,0.44,0.01,0,0,0,0,0,0,0,0,0.867,0.306,0,0,0,0,0,0,0,0,0.467,0.749,0.178,0,0,0,0,0,0,0,0,0.48,0.61,0.086,0,0,0,0,0,0,0,0,0.92,0.474,0.034,0,0,0,0,0,0,0,0,0.869,0.343,0,0,0,0,0,0,0,0,0.427,0.793,0.219,0,0,0,0,0,0,0,0,0.481,0.654,0.109,0,0,0,0,0,0,0,0,0.886,0.839,0.833,0.835,0.833,0.834,0.835,0.833,0.834,0.834,0.833,0.945,0.836,0.833,0.834,0.834,0.833,0.835,0.834,0.833,0.835,0.837,0.927,0.836,0.833,0.834,0.835,0.833,0.834,0.835,0.833,0.834,0.909,0.874,0.835,0.834,0.833,0.835,0.834,0.833,0.835,0.834,0.833,0.919,0.843,0.834,0.835,0.833,0.834,0.835,0.833,0.834,0.834,0.833,0.951,0.835,0.833,0.835,0.834,0.833,0.835,0.834,0.833,0.835,0.833,0.934,0.835,0.833,0.834,0.835,0.833,0.834,0.835,0.833,0.834,0.907,0.88,0.835,0.834,0.833,0.835,0.834,0.833,0.835,0.833,0.833,0.918,0.85,0.834,0.835,0.833,0.834,0.835,0.833,0.834,0.834,0.833,0.951,0.837,0.833,0.835,0.834,0.833,0.835,0.833,0.834,0.835,0.833,0.934,0.835,0.833,0.834,0.835,0.833,0.834,0.834,0.833,0.834,0.896,0.897,0.835,0.834,0.833,0.835,0.834,0.833,0.835,0.833,0.834,0.776,0]},
};

function setup() {
  createCanvas(800, 800);
  soundlineSetup();
}

function draw() {
  background(12);
  const t = soundlineTime();        // seconden in het nummer, -1 vóór de start

  // altijd: het niveau als ademende cirkel (voorbeeld)
  noStroke(); fill(40); circle(width / 2, height / 2, width * (0.12 + 0.6 * soundlineLevel(t)));

  // de momenten, in volgorde; elk loopt tot het volgende
  moment(t,        0,     6.06, m01_opening);  // 00:00.000 · opening
  moment(t,     6.06,    4.946, m02_drop);   // 00:06.060 · drop +35 dB
  moment(t,   11.006,    0.994, m03_piek);   // 00:11.006 · piek 1

  if (SOUNDLINE.hud) soundlineHud(t);
}

// ──────────────────── De momenten ────────────────────
// 00:00.000 → 00:06.060 · opening
function m01_opening(t, p, e) {
  // voorbeeld: een cirkel die opent. Vervang dit door je eigen beeld.
  noFill(); stroke(230); strokeWeight(2);
  circle(width / 2, height / 2, width * (0.05 + 0.6 * Math.min(1, t / 2)));
}

// 00:06.060 → 00:11.006 · drop +35 dB
function m02_drop(t, p, e) {
  // voorbeeld: een rode ring die naar buiten slaat; op het eerste frame een flits.
  if (e.first) background(255);
  noFill(); stroke(255, 0, 0); strokeWeight(width * 0.008 * (1 - Math.min(1, t / 1.5)));
  circle(width / 2, height / 2, width * (0.05 + 1.2 * Math.min(1, t / 1.5)));
}

// 00:11.006 → 00:12.000 · piek 1
function m03_piek(t, p, e) {
  // voorbeeld: een witte flits die uitdooft.
  noStroke(); fill(255, 255 * Math.max(0, 1 - t / 0.6)); rect(0, 0, width, height);
}

// ──────────────────── soundline runtime (hoeft niet aangepast) ────────────────────
const _sl = { audio: null, started: false, noAudio: false, t0: 0, active: new Map(), kinds: {"m01_opening":{"kind":"opening","letter":null},"m02_drop":{"kind":"drop","letter":null},"m03_piek":{"kind":"peak","letter":null}} };
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
}
