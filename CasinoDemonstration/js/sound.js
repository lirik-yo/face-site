/*
 * Звуки синтезируются прямо в браузере (Web Audio API) — никаких файлов не нужно.
 * Звук не обязателен для понимания интерфейса: всё дублируется на экране.
 */
(function (root) {
  "use strict";

  var ctx = null;
  var master = null;
  var muted = false;

  try { muted = localStorage.getItem("slot-muted") === "1"; } catch (e) { /* хранилище недоступно */ }

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Одна нота с мягкой огибающей
  function tone(freq, start, dur, type, vol, freqEnd) {
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (start || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || "triangle";
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Короткий шумовой щелчок
  function click(start, vol, dur) {
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (start || 0);
    var len = Math.floor(c.sampleRate * (dur || 0.03));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource();
    var g = c.createGain();
    var f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 2200;
    src.buffer = buf;
    g.gain.value = vol || 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  var N = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77,
            C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, C7: 2093, G4: 392, C4: 261.63, E4: 329.63 };

  function arpeggio(notes, step, dur, type, vol, offset) {
    notes.forEach(function (f, i) { tone(f, (offset || 0) + i * step, dur, type, vol); });
  }

  var Sound = {
    isMuted: function () { return muted; },
    setMuted: function (value) {
      muted = !!value;
      try { localStorage.setItem("slot-muted", muted ? "1" : "0"); } catch (e) { /* ничего */ }
      if (muted && ctx) ctx.suspend();
      if (!muted) ensure();
    },
    unlock: function () { ensure(); },

    spinStart: function () {
      tone(220, 0, 0.3, "square", 0.06, 880);
      for (var i = 0; i < 5; i++) click(i * 0.045, 0.25, 0.025);
    },
    tick: function () { click(0, 0.08, 0.015); },
    reelStop: function (i) {
      tone(200 - i * 25, 0, 0.14, "triangle", 0.35, 80);
      click(0, 0.35, 0.04);
    },
    lose: function () {
      tone(N.E4, 0, 0.18, "sine", 0.12);
      tone(N.C4, 0.14, 0.25, "sine", 0.1);
    },
    coinTick: function () { tone(N.E6 + Math.random() * 200, 0, 0.06, "square", 0.04); },

    win5: function () {
      arpeggio([N.C6, N.E6], 0.08, 0.18, "triangle", 0.18);
    },
    win10: function () {
      arpeggio([N.C6, N.E6, N.G6], 0.08, 0.22, "triangle", 0.18);
      tone(N.C7, 0.26, 0.2, "sine", 0.08);
    },
    win20: function () {
      arpeggio([N.C5, N.E5, N.G5, N.C6, N.E6, N.G6], 0.07, 0.25, "triangle", 0.18);
      arpeggio([N.C6, N.G6, N.C7], 0.06, 0.2, "sine", 0.07, 0.45);
    },
    win50: function () {
      arpeggio([N.C5, N.E5, N.G5, N.C6], 0.08, 0.22, "square", 0.08);
      arpeggio([N.D5, N.F5, N.A5, N.D6], 0.08, 0.22, "square", 0.08, 0.35);
      arpeggio([N.E5, N.G5, N.B5, N.E6], 0.08, 0.22, "square", 0.08, 0.7);
      [N.C5, N.E5, N.G5, N.C6].forEach(function (f) { tone(f, 1.05, 0.9, "triangle", 0.1); });
      arpeggio([N.C7, N.G6, N.C7, N.G6, N.C7], 0.07, 0.12, "sine", 0.06, 1.1);
    },
    jackpot: function () {
      // Фанфары
      var melody = [
        [N.G4, 0.0, 0.18], [N.C5, 0.18, 0.18], [N.E5, 0.36, 0.18], [N.G5, 0.54, 0.4],
        [N.E5, 0.98, 0.18], [N.G5, 1.16, 0.9]
      ];
      melody.forEach(function (m) {
        tone(m[0], m[1], m[2], "square", 0.09);
        tone(m[0] * 2, m[1], m[2], "triangle", 0.06);
      });
      [N.C5, N.E5, N.G5, N.C6, N.E6].forEach(function (f) { tone(f, 2.1, 1.6, "triangle", 0.08); });
      for (var i = 0; i < 24; i++) tone(N.C7 + Math.random() * 600, 2.1 + i * 0.07, 0.08, "sine", 0.05);
      arpeggio([N.C5, N.E5, N.G5, N.C6, N.E6, N.G6, N.C7], 0.06, 0.25, "triangle", 0.1, 3.0);
    }
  };

  root.Sound = Sound;
})(this);
