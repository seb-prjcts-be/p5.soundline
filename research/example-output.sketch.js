/* ──────────────────────────────────────────────────────────────────────
   soundline · test.mp3
   gegenereerd 2026-10-27 door p5.soundline
   duur 00:12.000 · 119.6 BPM (vertrouwen 1.00) · 4/4 aangenomen · 1 secties (A) · 80 cues

   Vul de lege functies onderaan. Elke functie wordt vanuit draw() aangeroepen op het
   tijdstip in de commentaarregel ernaast. Zet het geluidsbestand naast dit bestand en
   klik op het canvas (of druk spatie) om te starten.
   ────────────────────────────────────────────────────────────────────── */

const SOUNDLINE = {
  file: "test.mp3",
  duration: 12,
  bpm: 119.62, beat: 0.5016, meter: 4,
  hud: true,        // false = tijdlijn-overlay verbergen
  hold: 0.25,        // seconden dat een slag-cue actief blijft (p loopt 0 → 1)
  sections: [["0","12","1 A loud peak"]],
  curves: {
    "hz":21.533203125,
    "level":[0.396,0.001,0,0,0,0,0,0,0,0,0.847,0.266,0,0,0,0,0,0,0,0,0.471,0.709,0.164,0,0,0,0,0,0,0,0,0.482,0.573,0.073,0,0,0,0,0,0,0,0,0.912,0.44,0.01,0,0,0,0,0,0,0,0,0.867,0.306,0,0,0,0,0,0,0,0,0.467,0.749,0.178,0,0,0,0,0,0,0,0,0.48,0.61,0.086,0,0,0,0,0,0,0,0,0.92,0.474,0.034,0,0,0,0,0,0,0,0,0.869,0.343,0,0,0,0,0,0,0,0,0.427,0.793,0.219,0,0,0,0,0,0,0,0,0.481,0.654,0.109,0,0,0,0,0,0,0,0,0.886,0.839,0.833,0.835,0.833,0.834,0.835,0.833,0.834,0.834,0.833,0.945,0.836,0.833,0.834,0.834,0.833,0.835,0.834,0.833,0.835,0.837,0.927,0.836,0.833,0.834,0.835,0.833,0.834,0.835,0.833,0.834,0.909,0.874,0.835,0.834,0.833,0.835,0.834,0.833,0.835,0.834,0.833,0.919,0.843,0.834,0.835,0.833,0.834,0.835,0.833,0.834,0.834,0.833,0.951,0.835,0.833,0.835,0.834,0.833,0.835,0.834,0.833,0.835,0.833,0.934,0.835,0.833,0.834,0.835,0.833,0.834,0.835,0.833,0.834,0.907,0.88,0.835,0.834,0.833,0.835,0.834,0.833,0.835,0.833,0.833,0.918,0.85,0.834,0.835,0.833,0.834,0.835,0.833,0.834,0.834,0.833,0.951,0.837,0.833,0.835,0.834,0.833,0.835,0.833,0.834,0.835,0.833,0.934,0.835,0.833,0.834,0.835,0.833,0.834,0.834,0.833,0.834,0.896,0.897,0.835,0.834,0.833,0.835,0.834,0.833,0.835,0.833,0.834,0.776,0],
    "low":[0.633,0.046,0,0,0,0,0,0,0,0.694,0.948,0.506,0,0,0,0,0,0,0,0,0.877,0.88,0.382,0,0,0,0,0,0,0,0.066,0.954,0.784,0.241,0,0,0,0,0,0,0,0.269,0.977,0.668,0.083,0,0,0,0,0,0,0,0.593,0.96,0.543,0,0,0,0,0,0,0,0,0.84,0.902,0.415,0,0,0,0,0,0,0,0,0.939,0.813,0.283,0,0,0,0,0,0,0,0.26,0.974,0.703,0.126,0,0,0,0,0,0,0,0.438,0.969,0.579,0,0,0,0,0,0,0,0,0.793,0.923,0.452,0,0,0,0,0,0,0,0,0.919,0.841,0.322,0,0,0,0,0,0,0,0.197,0.97,0.736,0.172,0,0,0,0,0,0,0,0.283,0.975,0.615,0.031,0,0,0,0,0,0,0,0.734,0.94,0.487,0,0,0,0,0,0,0,0,0.893,0.867,0.353,0,0,0,0,0,0,0,0.099,0.96,0.768,0.217,0,0,0,0,0,0,0,0.276,0.977,0.65,0.058,0,0,0,0,0,0,0,0.649,0.954,0.524,0,0,0,0,0,0,0,0,0.86,0.891,0.395,0,0,0,0,0,0,0,0.043,0.947,0.799,0.261,0,0,0,0,0,0,0,0.251,0.976,0.685,0.115,0,0,0,0,0,0,0,0.529,0.965,0.561,0,0,0,0,0,0,0,0,0.818,0.913,0.432,0,0,0,0,0,0,0,0,0.407,0.26],
    "mid":[0,0,0,0,0.016,0.018,0.024,0,0,0.477,0.507,0.021,0,0.01,0,0,0.006,0.015,0.007,0.003,0.6,0.274,0,0,0,0.008,0.001,0.004,0.003,0.005,0.134,0.642,0.207,0.02,0.005,0.016,0.032,0.014,0,0,0,0.251,0.628,0.006,0,0,0.015,0,0,0.018,0,0,0.415,0.548,0,0.005,0,0,0.001,0.006,0,0.004,0.012,0.575,0.335,0.005,0.023,0,0,0,0.007,0.004,0.014,0.065,0.636,0.235,0,0,0,0,0,0.003,0,0.01,0.225,0.638,0.088,0.019,0.005,0.015,0.004,0,0.004,0.01,0.028,0.321,0.579,0,0.008,0.024,0.013,0.001,0.001,0.01,0.003,0,0.544,0.42,0.003,0.012,0.015,0.025,0.008,0,0.005,0.016,0.007,0.625,0.252,0,0,0.013,0.009,0,0.001,0.007,0.004,0.254,0.927,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.999,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.999,0.999,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.999,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.999,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.999,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.999,0.999,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.999,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.999,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.999,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.999,0.999,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.999,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.998,0.949,0.615],
    "high":[0.984,0.986,0.991,0.994,0.983,0.981,0.989,0.987,0.99,0.988,0.985,0.987,0.987,0.98,0.986,0.987,0.984,0.978,0.987,0.987,0.993,0.983,0.993,0.987,0.983,0.984,0.991,0.986,0.986,0.987,0.989,0.986,0.986,0.982,0.986,0.989,0.991,0.985,0.986,0.989,0.991,0.987,0.98,0.984,0.987,0.985,0.991,0.987,0.986,0.99,0.988,0.991,0.993,0.989,0.989,0.985,0.99,0.993,0.988,0.989,0.99,0.98,0.986,0.989,0.998,0.989,0.986,0.987,0.994,0.983,0.981,0.984,0.981,0.99,0.985,0.983,0.984,0.986,0.986,0.986,0.988,0.99,0.987,0.987,0.986,0.998,0.992,0.99,0.989,0.985,0.992,0.99,0.984,0.989,0.989,0.983,0.984,0.985,0.988,0.981,0.978,0.984,0.983,0.987,0.99,0.989,0.985,0.991,0.991,0.991,0.986,0.983,0.982,0.985,0.981,0.988,0.987,0.984,0.984,0.988,0.989,0.987,0.983,0.986,0.992,0.99,0.989,0.984,1,0.989,0.992,0.987,0.982,0.988,0.978,0.987,0.981,0.989,0.982,0.987,0.985,0.988,0.983,0.982,0.99,0.986,0.986,0.985,0.979,0.989,0.99,0.99,0.983,0.988,0.981,0.986,0.982,0.989,0.988,0.99,0.989,0.984,0.988,0.996,0.991,0.981,0.99,0.984,0.991,0.99,0.987,0.991,0.988,0.994,0.986,0.98,0.989,0.988,0.991,0.983,0.986,0.987,0.989,0.987,0.989,0.99,0.981,0.982,0.987,0.985,0.987,0.987,0.988,0.99,0.991,0.987,0.982,0.99,0.986,0.989,0.989,0.989,0.993,0.984,0.982,0.982,0.992,0.987,0.983,0.986,0.991,0.992,0.99,0.98,0.988,0.987,0.985,0.995,0.996,0.992,0.983,0.983,0.986,0.992,0.99,0.988,0.991,0.991,0.987,0.988,0.984,0.985,0.991,0.987,0.989,0.988,0.989,0.981,0.992,0.986,0.988,0.992,0.984,0.982,0.989,0.987,0.993,0.985,0.986,0.983,0.983,0.981,0.992,0.985,0.986,0.991,0.985,0.977,0.788],
    "centroid":[0.755,0.879,0.89,0.886,0.887,0.884,0.886,0.892,0.891,0.653,0.469,0.807,0.881,0.886,0.89,0.892,0.888,0.885,0.887,0.888,0.486,0.576,0.838,0.886,0.889,0.886,0.889,0.887,0.888,0.886,0.845,0.412,0.658,0.861,0.89,0.887,0.884,0.887,0.887,0.892,0.888,0.789,0.402,0.743,0.876,0.891,0.888,0.888,0.884,0.885,0.886,0.892,0.718,0.45,0.795,0.882,0.889,0.887,0.883,0.888,0.888,0.887,0.886,0.515,0.549,0.833,0.885,0.888,0.892,0.887,0.885,0.886,0.885,0.873,0.424,0.633,0.859,0.884,0.891,0.89,0.89,0.889,0.887,0.889,0.794,0.404,0.716,0.87,0.886,0.884,0.886,0.888,0.887,0.89,0.886,0.762,0.426,0.78,0.881,0.887,0.888,0.888,0.887,0.886,0.887,0.89,0.561,0.516,0.825,0.884,0.891,0.886,0.891,0.891,0.888,0.888,0.887,0.443,0.606,0.852,0.887,0.888,0.886,0.887,0.887,0.888,0.888,0.803,0.409,0.538,0.595,0.601,0.602,0.6,0.598,0.603,0.598,0.598,0.545,0.401,0.571,0.596,0.597,0.604,0.602,0.599,0.599,0.6,0.599,0.497,0.442,0.583,0.595,0.599,0.599,0.601,0.598,0.601,0.6,0.6,0.434,0.483,0.586,0.601,0.601,0.597,0.6,0.601,0.6,0.603,0.586,0.398,0.528,0.597,0.599,0.597,0.599,0.602,0.601,0.602,0.602,0.55,0.392,0.56,0.597,0.601,0.598,0.599,0.6,0.599,0.6,0.601,0.518,0.428,0.58,0.602,0.597,0.6,0.602,0.601,0.601,0.601,0.602,0.45,0.477,0.585,0.6,0.603,0.603,0.6,0.6,0.602,0.604,0.593,0.403,0.517,0.597,0.603,0.602,0.6,0.597,0.601,0.603,0.605,0.563,0.391,0.555,0.6,0.601,0.6,0.599,0.604,0.604,0.603,0.603,0.533,0.415,0.572,0.598,0.598,0.598,0.603,0.596,0.599,0.601,0.601,0.471,0.465,0.584,0.598,0.599,0.596,0.601,0.6,0.597,0.601,0.598,0.531,0.501]
  },
};

function setup() {
  createCanvas(800, 800);
  soundlineSetup();
}

function draw() {
  background(12);
  const t = soundlineTime();        // seconden in het nummer, -1 vóór de start

  during(t,        0,       12, section_1);  // 00:00.000 → 00:12.000 · sectie 1 · A · loud · peak
  hit(t,    0.488, beat_001, 1);             // 00:00.488 · beat 1 (maat 0.4) ●●●●
  hit(t,    0.488, low_001, 1);              // 00:00.488 · low onset 1 ●●●●
  hit(t,    0.488, mid_001, 0.97);           // 00:00.488 · mid onset 1 ●●●●
  hit(t,    0.975, mid_002, 1);              // 00:00.975 · mid onset 2 ●●●●
  hit(t,    0.998, bar_001, 1);              // 00:00.998 · maat 1 ●●●●
  hit(t,    0.998, beat_002, 1);             // 00:00.998 · beat 2 (maat 1.1) ●●●●
  hit(t,    0.998, low_002, 1);              // 00:00.998 · low onset 2 ●●●●
  hit(t,    1.486, beat_003, 1);             // 00:01.486 · beat 3 (maat 1.2) ●●●●
  hit(t,    1.486, low_003, 1);              // 00:01.486 · low onset 3 ●●●●
  hit(t,    1.486, mid_003, 1);              // 00:01.486 · mid onset 3 ●●●●
  hit(t,    1.974, mid_004, 1);              // 00:01.974 · mid onset 4 ●●●●
  hit(t,    1.997, beat_004, 1);             // 00:01.997 · beat 4 (maat 1.3) ●●●●
  hit(t,    1.997, low_004, 1);              // 00:01.997 · low onset 4 ●●●●
  hit(t,    2.485, beat_005, 1);             // 00:02.485 · beat 5 (maat 1.4) ●●●●
  hit(t,    2.485, low_005, 1);              // 00:02.485 · low onset 5 ●●●●
  hit(t,    2.485, mid_005, 1);              // 00:02.485 · mid onset 5 ●●●●
  hit(t,    2.972, mid_006, 1);              // 00:02.972 · mid onset 6 ●●●●
  hit(t,    2.995, bar_002, 1);              // 00:02.995 · maat 2 ●●●●
  hit(t,    2.995, beat_006, 1);             // 00:02.995 · beat 6 (maat 2.1) ●●●●
  hit(t,    2.995, low_006, 1);              // 00:02.995 · low onset 6 ●●●●
  hit(t,    3.483, beat_007, 1);             // 00:03.483 · beat 7 (maat 2.2) ●●●●
  hit(t,    3.483, low_007, 1);              // 00:03.483 · low onset 7 ●●●●
  hit(t,    3.483, mid_007, 1);              // 00:03.483 · mid onset 7 ●●●●
  hit(t,    3.971, mid_008, 1);              // 00:03.971 · mid onset 8 ●●●●
  hit(t,    3.994, beat_008, 1);             // 00:03.994 · beat 8 (maat 2.3) ●●●●
  hit(t,    3.994, low_008, 1);              // 00:03.994 · low onset 8 ●●●●
  hit(t,    4.481, beat_009, 1);             // 00:04.481 · beat 9 (maat 2.4) ●●●●
  hit(t,    4.481, low_009, 1);              // 00:04.481 · low onset 9 ●●●●
  hit(t,    4.481, mid_009, 1);              // 00:04.481 · mid onset 9 ●●●●
  hit(t,    4.969, mid_010, 1);              // 00:04.969 · mid onset 10 ●●●●
  hit(t,    4.992, bar_003, 1);              // 00:04.992 · maat 3 ●●●●
  hit(t,    4.992, beat_010, 1);             // 00:04.992 · beat 10 (maat 3.1) ●●●●
  hit(t,    4.992, low_010, 0.99);           // 00:04.992 · low onset 10 ●●●●
  hit(t,     5.48, beat_011, 1);             // 00:05.480 · beat 11 (maat 3.2) ●●●●
  hit(t,     5.48, low_011, 1);              // 00:05.480 · low onset 11 ●●●●
  hit(t,     5.48, mid_011, 1);              // 00:05.480 · mid onset 11 ●●●●
  hit(t,    5.991, beat_012, 1);             // 00:05.991 · beat 12 (maat 3.3) ●●●●
  hit(t,    5.991, low_012, 0.97);           // 00:05.991 · low onset 12 ●●●●
  hit(t,    5.991, mid_012, 1);              // 00:05.991 · mid onset 12 ●●●●
  hit(t,     6.06, drop_1, 1);               // 00:06.060 · drop 1 (+34.9 dB)
  hit(t,    6.478, beat_013, 1);             // 00:06.478 · beat 13 (maat 3.4) ●●●●
  hit(t,    6.478, low_013, 1);              // 00:06.478 · low onset 13 ●●●●
  hit(t,    6.478, mid_013, 1);              // 00:06.478 · mid onset 13 ●●●●
  hit(t,    6.989, bar_004, 1);              // 00:06.989 · maat 4 ●●●●
  hit(t,    6.989, beat_014, 1);             // 00:06.989 · beat 14 (maat 4.1) ●●●●
  hit(t,    6.989, low_014, 0.99);           // 00:06.989 · low onset 14 ●●●●
  hit(t,    6.989, mid_014, 0.94);           // 00:06.989 · mid onset 14 ●●●●
  hit(t,    7.477, beat_015, 1);             // 00:07.477 · beat 15 (maat 4.2) ●●●●
  hit(t,    7.477, mid_015, 1);              // 00:07.477 · mid onset 15 ●●●●
  hit(t,      7.5, low_015, 1);              // 00:07.500 · low onset 15 ●●●●
  hit(t,    7.988, beat_016, 1);             // 00:07.988 · beat 16 (maat 4.3) ●●●●
  hit(t,    7.988, low_016, 1);              // 00:07.988 · low onset 16 ●●●●
  hit(t,    7.988, mid_016, 0.93);           // 00:07.988 · mid onset 16 ●●●●
  hit(t,    8.475, mid_017, 1);              // 00:08.475 · mid onset 17 ●●●●
  hit(t,    8.499, beat_017, 1);             // 00:08.499 · beat 17 (maat 4.4) ●●●●
  hit(t,    8.499, low_017, 1);              // 00:08.499 · low onset 17 ●●●●
  hit(t,    8.986, bar_005, 1);              // 00:08.986 · maat 5 ●●●●
  hit(t,    8.986, beat_018, 1);             // 00:08.986 · beat 18 (maat 5.1) ●●●●
  hit(t,    8.986, low_018, 1);              // 00:08.986 · low onset 18 ●●●●
  hit(t,    8.986, mid_018, 0.93);           // 00:08.986 · mid onset 18 ●●●●
  hit(t,    9.474, mid_019, 1);              // 00:09.474 · mid onset 19 ●●●●
  hit(t,    9.497, beat_019, 1);             // 00:09.497 · beat 19 (maat 5.2) ●●●●
  hit(t,    9.497, low_019, 1);              // 00:09.497 · low onset 19 ●●●●
  hit(t,    9.985, beat_020, 1);             // 00:09.985 · beat 20 (maat 5.3) ●●●●
  hit(t,    9.985, low_020, 1);              // 00:09.985 · low onset 20 ●●●●
  hit(t,    9.985, mid_020, 0.96);           // 00:09.985 · mid onset 20 ●●●●
  hit(t,   10.495, beat_021, 1);             // 00:10.495 · beat 21 (maat 5.4) ●●●●
  hit(t,   10.495, low_021, 1);              // 00:10.495 · low onset 21 ●●●●
  hit(t,   10.495, mid_021, 0.99);           // 00:10.495 · mid onset 21 ●●●●
  hit(t,   10.983, bar_006, 1);              // 00:10.983 · maat 6 ●●●●
  hit(t,   10.983, beat_022, 1);             // 00:10.983 · beat 22 (maat 6.1) ●●●●
  hit(t,   10.983, low_022, 1);              // 00:10.983 · low onset 22 ●●●●
  hit(t,   10.983, mid_022, 0.98);           // 00:10.983 · mid onset 22 ●●●●
  hit(t,   11.006, peak_1, 1);               // 00:11.006 · piek 1 (#1, -16.3 dB)
  hit(t,   11.494, beat_023, 1);             // 00:11.494 · beat 23 (maat 6.2) ●●●●
  hit(t,   11.494, low_023, 1);              // 00:11.494 · low onset 23 ●●●●
  hit(t,   11.494, mid_023, 0.99);           // 00:11.494 · mid onset 23 ●●●●
  hit(t,   11.981, mid_024, 1);              // 00:11.981 · mid onset 24 ●●●●
  hit(t,   12.005, beat_024, 0.08);          // 00:12.005 · beat 24 (maat 6.3) ○○○○

  if (SOUNDLINE.hud) soundlineHud(t);
}

// ──────────────────── Lege functies, in tijdsvolgorde ────────────────────
// Elke functie krijgt (t, p, e):
//   t = seconden sinds de start van de cue, p = voortgang 0..1 binnen de cue,
//   e = { at, dur, name, label, first, strength }  (e.first is true op het eerste frame van de cue;
//        e.strength is de onset-sterkte 0..1, 1 voor secties en eigen tikken).
//   Eigen tikken hebben ook e.key (de toets), e.takes (aantal keer getikt), e.spread (standaardafwijking
//   van de takes in seconden: hoe zeker de tik is), e.range (bereik in s) en e.manual (met de hand gezet).
// soundlineLevel(t) geeft het niveau 0..1 op elk moment; soundlineLevel(t, 'low'|'mid'|'high'|'centroid') ook.

// secties (duur-cues: p loopt van 0 naar 1 over de hele sectie) · 1
function section_1(t, p, e) {} // 00:00.000 → 00:12.000 · sectie 1 · A · loud · peak

// maatstrepen (downbeats, maatsoort aangenomen) · 6
function bar_001(t, p, e) {}   // 00:00.998 · maat 1 ●●●●
function bar_002(t, p, e) {}   // 00:02.995 · maat 2 ●●●●
function bar_003(t, p, e) {}   // 00:04.992 · maat 3 ●●●●
function bar_004(t, p, e) {}   // 00:06.989 · maat 4 ●●●●
function bar_005(t, p, e) {}   // 00:08.986 · maat 5 ●●●●
function bar_006(t, p, e) {}   // 00:10.983 · maat 6 ●●●●

// beats uit de beat-tracker · 24
function beat_001(t, p, e) {}  // 00:00.488 · beat 1 (maat 0.4) ●●●●
function beat_002(t, p, e) {}  // 00:00.998 · beat 2 (maat 1.1) ●●●●
function beat_003(t, p, e) {}  // 00:01.486 · beat 3 (maat 1.2) ●●●●
function beat_004(t, p, e) {}  // 00:01.997 · beat 4 (maat 1.3) ●●●●
function beat_005(t, p, e) {}  // 00:02.485 · beat 5 (maat 1.4) ●●●●
function beat_006(t, p, e) {}  // 00:02.995 · beat 6 (maat 2.1) ●●●●
function beat_007(t, p, e) {}  // 00:03.483 · beat 7 (maat 2.2) ●●●●
function beat_008(t, p, e) {}  // 00:03.994 · beat 8 (maat 2.3) ●●●●
function beat_009(t, p, e) {}  // 00:04.481 · beat 9 (maat 2.4) ●●●●
function beat_010(t, p, e) {}  // 00:04.992 · beat 10 (maat 3.1) ●●●●
function beat_011(t, p, e) {}  // 00:05.480 · beat 11 (maat 3.2) ●●●●
function beat_012(t, p, e) {}  // 00:05.991 · beat 12 (maat 3.3) ●●●●
function beat_013(t, p, e) {}  // 00:06.478 · beat 13 (maat 3.4) ●●●●
function beat_014(t, p, e) {}  // 00:06.989 · beat 14 (maat 4.1) ●●●●
function beat_015(t, p, e) {}  // 00:07.477 · beat 15 (maat 4.2) ●●●●
function beat_016(t, p, e) {}  // 00:07.988 · beat 16 (maat 4.3) ●●●●
function beat_017(t, p, e) {}  // 00:08.499 · beat 17 (maat 4.4) ●●●●
function beat_018(t, p, e) {}  // 00:08.986 · beat 18 (maat 5.1) ●●●●
function beat_019(t, p, e) {}  // 00:09.497 · beat 19 (maat 5.2) ●●●●
function beat_020(t, p, e) {}  // 00:09.985 · beat 20 (maat 5.3) ●●●●
function beat_021(t, p, e) {}  // 00:10.495 · beat 21 (maat 5.4) ●●●●
function beat_022(t, p, e) {}  // 00:10.983 · beat 22 (maat 6.1) ●●●●
function beat_023(t, p, e) {}  // 00:11.494 · beat 23 (maat 6.2) ●●●●
function beat_024(t, p, e) {}  // 00:12.005 · beat 24 (maat 6.3) ○○○○

// lage onsets (kick, bas) · 23
function low_001(t, p, e) {}   // 00:00.488 · low onset 1 ●●●●
function low_002(t, p, e) {}   // 00:00.998 · low onset 2 ●●●●
function low_003(t, p, e) {}   // 00:01.486 · low onset 3 ●●●●
function low_004(t, p, e) {}   // 00:01.997 · low onset 4 ●●●●
function low_005(t, p, e) {}   // 00:02.485 · low onset 5 ●●●●
function low_006(t, p, e) {}   // 00:02.995 · low onset 6 ●●●●
function low_007(t, p, e) {}   // 00:03.483 · low onset 7 ●●●●
function low_008(t, p, e) {}   // 00:03.994 · low onset 8 ●●●●
function low_009(t, p, e) {}   // 00:04.481 · low onset 9 ●●●●
function low_010(t, p, e) {}   // 00:04.992 · low onset 10 ●●●●
function low_011(t, p, e) {}   // 00:05.480 · low onset 11 ●●●●
function low_012(t, p, e) {}   // 00:05.991 · low onset 12 ●●●●
function low_013(t, p, e) {}   // 00:06.478 · low onset 13 ●●●●
function low_014(t, p, e) {}   // 00:06.989 · low onset 14 ●●●●
function low_015(t, p, e) {}   // 00:07.500 · low onset 15 ●●●●
function low_016(t, p, e) {}   // 00:07.988 · low onset 16 ●●●●
function low_017(t, p, e) {}   // 00:08.499 · low onset 17 ●●●●
function low_018(t, p, e) {}   // 00:08.986 · low onset 18 ●●●●
function low_019(t, p, e) {}   // 00:09.497 · low onset 19 ●●●●
function low_020(t, p, e) {}   // 00:09.985 · low onset 20 ●●●●
function low_021(t, p, e) {}   // 00:10.495 · low onset 21 ●●●●
function low_022(t, p, e) {}   // 00:10.983 · low onset 22 ●●●●
function low_023(t, p, e) {}   // 00:11.494 · low onset 23 ●●●●

// midden-onsets (snare, stem, akkoorden) · 24
function mid_001(t, p, e) {}   // 00:00.488 · mid onset 1 ●●●●
function mid_002(t, p, e) {}   // 00:00.975 · mid onset 2 ●●●●
function mid_003(t, p, e) {}   // 00:01.486 · mid onset 3 ●●●●
function mid_004(t, p, e) {}   // 00:01.974 · mid onset 4 ●●●●
function mid_005(t, p, e) {}   // 00:02.485 · mid onset 5 ●●●●
function mid_006(t, p, e) {}   // 00:02.972 · mid onset 6 ●●●●
function mid_007(t, p, e) {}   // 00:03.483 · mid onset 7 ●●●●
function mid_008(t, p, e) {}   // 00:03.971 · mid onset 8 ●●●●
function mid_009(t, p, e) {}   // 00:04.481 · mid onset 9 ●●●●
function mid_010(t, p, e) {}   // 00:04.969 · mid onset 10 ●●●●
function mid_011(t, p, e) {}   // 00:05.480 · mid onset 11 ●●●●
function mid_012(t, p, e) {}   // 00:05.991 · mid onset 12 ●●●●
function mid_013(t, p, e) {}   // 00:06.478 · mid onset 13 ●●●●
function mid_014(t, p, e) {}   // 00:06.989 · mid onset 14 ●●●●
function mid_015(t, p, e) {}   // 00:07.477 · mid onset 15 ●●●●
function mid_016(t, p, e) {}   // 00:07.988 · mid onset 16 ●●●●
function mid_017(t, p, e) {}   // 00:08.475 · mid onset 17 ●●●●
function mid_018(t, p, e) {}   // 00:08.986 · mid onset 18 ●●●●
function mid_019(t, p, e) {}   // 00:09.474 · mid onset 19 ●●●●
function mid_020(t, p, e) {}   // 00:09.985 · mid onset 20 ●●●●
function mid_021(t, p, e) {}   // 00:10.495 · mid onset 21 ●●●●
function mid_022(t, p, e) {}   // 00:10.983 · mid onset 22 ●●●●
function mid_023(t, p, e) {}   // 00:11.494 · mid onset 23 ●●●●
function mid_024(t, p, e) {}   // 00:11.981 · mid onset 24 ●●●●

// luidste momenten · 1
function peak_1(t, p, e) {}    // 00:11.006 · piek 1 (#1, -16.3 dB)

// drops: plotse sprong in niveau · 1
function drop_1(t, p, e) {}    // 00:06.060 · drop 1 (+34.9 dB)

// ──────────────────── soundline runtime (hoeft niet aangepast) ────────────────────
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
}
