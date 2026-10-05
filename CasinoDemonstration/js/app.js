/*
 * Интерфейс слот-машины: анимации, эффекты, статистика, итоговый экран.
 * Вся математика — в js/logic.js, оформление символов — в js/symbols-config.js.
 */
(function () {
  "use strict";

  const L = window.SlotLogic;
  const CFG = window.SYMBOLS_CONFIG;
  const Sound = window.Sound;
  const S = L.SYMBOLS;
  const COST = L.SPIN_COST;

  const $ = (id) => document.getElementById(id);

  const el = {
    machine: $("machine"),
    balance: $("balance"),
    balanceUnit: $("balanceUnit"),
    balanceDelta: $("balanceDelta"),
    balanceBoard: document.querySelector(".balance-board"),
    reelsFrame: $("reelsFrame"),
    winBoard: $("winBoard"),
    winTitle: $("winTitle"),
    winSub: $("winSub"),
    winMath: $("winMath"),
    spinBtn: $("spinBtn"),
    endBtn: $("endBtn"),
    lever: $("lever"),
    historyBody: $("historyBody"),
    fx: $("fxLayer"),
    startOverlay: $("startOverlay"),
    startForm: $("startForm"),
    startInput: $("startInput"),
    startError: $("startError"),
    resultOverlay: $("resultOverlay"),
    resultDialog: $("resultDialog"),
    muteBtn: $("muteBtn"),
    debugPanel: $("debugPanel")
  };

  const state = {
    started: false,
    finished: false,
    busy: false,          // идёт вращение (повторный запуск заблокирован)
    initialBalance: 0,
    stats: null,
    history: [],
    forced: null,         // только для debug-режима
    shownBalance: 0
  };

  let effectTimer = null;

  /* ================= Вспомогательное ================= */

  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }
  const COINS = ["монетка", "монетки", "монеток"];
  const TIMES = ["раз", "раза", "раз"];
  const SPINS = ["вращение", "вращения", "вращений"];

  const fmt = (n) => Number(n).toLocaleString("ru-RU");
  const signed = (n) => (n > 0 ? "+" + fmt(n) : n < 0 ? "−" + fmt(-n) : "0");
  const signClass = (n) => (n > 0 ? "plus" : n < 0 ? "minus" : "zero");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function renderSymbol(id, size) {
    const cfg = CFG[id];
    const div = document.createElement("div");
    div.className = "sym" + (size ? " " + size : "");
    div.style.setProperty("--c", cfg.color);
    div.title = cfg.name;
    if (cfg.image) {
      const img = document.createElement("img");
      img.src = cfg.image;
      img.alt = cfg.name;
      div.appendChild(img);
    } else {
      const e = document.createElement("span");
      e.className = "sym-emoji";
      e.textContent = cfg.emoji;
      div.appendChild(e);
    }
    const name = document.createElement("span");
    name.className = "sym-name";
    name.textContent = cfg.name;
    div.appendChild(name);
    return div;
  }

  function starCell() {
    const s = document.createElement("span");
    s.className = "mini-star";
    s.textContent = "★";
    s.title = "любой символ";
    return s;
  }

  /* ================= Лампочки ================= */

  document.querySelectorAll(".bulbs").forEach((row) => {
    const n = Number(row.dataset.count);
    for (let i = 0; i < n; i++) {
      const b = document.createElement("span");
      b.className = "bulb";
      row.appendChild(b);
    }
  });

  /* ================= Таблица призов ================= */

  const PAYTABLE = [
    { prize: 200, name: "ДЖЕКПОТ", jackpot: true, combos: [[S.PAW, S.PAW, S.PAW]] },
    { prize: 50, name: "БОЛЬШОЙ ПРИЗ", combos: [[S.PAW, "*", S.PAW]], note: "в середине — любой, кроме " + CFG.PAW.emoji },
    { prize: 20, name: "ПРИЗ", combos: [[S.PAW, "*", [S.CATS, S.BUG]]] },
    { prize: 10, name: "ПРИЗ", combos: [[S.BUG, "*", [S.CATS, S.PIG, S.BUG]]] },
    { prize: 5, name: "ПРИЗ", combos: [[S.PAW, "*", S.PIG], [S.CATS, "*", "*"], [S.BUG, "*", S.PAW]] }
  ];

  function renderPaytable() {
    const root = $("paytableRows");
    PAYTABLE.forEach((row) => {
      const r = document.createElement("div");
      r.className = "pay-row" + (row.jackpot ? " jackpot" : "");
      const combos = document.createElement("div");
      combos.className = "pay-combos";
      row.combos.forEach((combo) => {
        const c = document.createElement("div");
        c.className = "pay-combo";
        combo.forEach((cell) => {
          if (cell === "*") c.appendChild(starCell());
          else if (Array.isArray(cell)) {
            const g = document.createElement("span");
            g.className = "alt-group";
            cell.forEach((id) => g.appendChild(renderSymbol(id, "tiny")));
            c.appendChild(g);
          } else c.appendChild(renderSymbol(cell, "mini"));
        });
        combos.appendChild(c);
      });
      if (row.note) {
        const n = document.createElement("div");
        n.className = "pay-combo-note";
        n.textContent = row.note;
        combos.appendChild(n);
      }
      const prize = document.createElement("div");
      prize.className = "pay-prize";
      prize.innerHTML = `<div class="prize-name">${row.name}</div><div class="prize-value">${row.prize}</div>`;
      r.appendChild(combos);
      r.appendChild(prize);
      root.appendChild(r);
    });
  }

  /* ================= Барабаны ================= */

  const reels = Array.from(document.querySelectorAll(".reel")).map((reelEl, i) => ({
    i,
    el: reelEl,
    strip: reelEl.querySelector(".reel-strip"),
    symbols: L.REELS[i],
    spinning: false,
    offset: 0
  }));

  function neighbours(reel, id) {
    const list = reel.symbols;
    const k = list.indexOf(id);
    return [list[(k + 1) % list.length], id, list[(k - 1 + list.length) % list.length]];
  }

  function setStrip(reel, ids) {
    reel.strip.innerHTML = "";
    ids.forEach((id) => reel.strip.appendChild(renderSymbol(id)));
  }

  function randomSymbolOf(reel) {
    return reel.symbols[Math.floor(Math.random() * reel.symbols.length)]; // только для мелькания картинок
  }

  let stepPx = 120;
  let speed = 1;
  let lastFrame = null;

  function frame(t) {
    const dt = lastFrame == null ? 16 : Math.min(50, t - lastFrame);
    lastFrame = t;
    let any = false;
    reels.forEach((r) => {
      if (!r.spinning) return;
      any = true;
      r.offset += dt * speed;
      while (r.offset >= stepPx) {
        r.offset -= stepPx;
        r.strip.lastElementChild.remove();
        r.strip.insertBefore(renderSymbol(randomSymbolOf(r)), r.strip.firstElementChild);
      }
      r.strip.style.transform = `translateY(${r.offset}px)`;
    });
    if (any) requestAnimationFrame(frame);
    else lastFrame = null;
  }

  function stopReel(reel, id) {
    reel.spinning = false;
    reel.strip.style.transform = "";
    setStrip(reel, neighbours(reel, id));
    reel.el.classList.remove("spinning");
    void reel.el.offsetWidth;
    reel.el.classList.add("stopped");
    Sound.reelStop(reel.i);
  }

  function animateReels(symbols) {
    const first = reels[0].strip.firstElementChild;
    stepPx = first.offsetHeight + 8;
    speed = stepPx / 62; // пикселей в миллисекунду
    reels.forEach((r) => {
      r.el.classList.remove("stopped", "win");
      r.el.classList.add("spinning");
      r.spinning = true;
      r.offset = 0;
    });
    requestAnimationFrame(frame);

    const ticker = setInterval(() => Sound.tick(), 95);
    const stops = [650, 1000, 1350];
    return new Promise((resolve) => {
      stops.forEach((ms, i) => {
        setTimeout(() => {
          stopReel(reels[i], symbols[i]);
          if (i === stops.length - 1) {
            clearInterval(ticker);
            setTimeout(resolve, 260);
          }
        }, ms);
      });
    });
  }

  /* ================= Баланс ================= */

  function setBalanceNow(v) {
    state.shownBalance = v;
    el.balance.textContent = fmt(v);
    el.balanceUnit.textContent = plural(v, COINS);
  }

  function showDelta(n) {
    const d = el.balanceDelta;
    d.textContent = signed(n);
    d.className = "balance-delta " + (n < 0 ? "minus" : "plus");
    void d.offsetWidth;
    d.classList.add("show");
  }

  // Плавное увеличение баланса после выплаты (ТЗ, п. 21)
  function countBalanceTo(target, duration, onProgress) {
    const from = state.shownBalance;
    const diff = target - from;
    if (diff === 0 || duration <= 0) {
      setBalanceNow(target);
      if (onProgress) onProgress(diff);
      return Promise.resolve();
    }
    el.balanceBoard.classList.add("counting");
    return new Promise((resolve) => {
      const t0 = performance.now();
      let lastShown = from;
      let lastTick = 0;
      function step(now) {
        const k = Math.min(1, (now - t0) / duration);
        const v = Math.round(from + diff * k);
        if (v !== lastShown) {
          setBalanceNow(v);
          if (onProgress) onProgress(v - from);
          lastShown = v;
          if (now - lastTick > 55) { Sound.coinTick(); lastTick = now; }
        }
        if (k < 1) requestAnimationFrame(step);
        else {
          el.balanceBoard.classList.remove("counting");
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  /* ================= Эффекты ================= */

  const CONFETTI_COLORS = ["#f43f5e", "#facc15", "#22c55e", "#3b82f6", "#a855f7", "#fb923c", "#22d3ee", "#ffffff"];
  const rnd = (a, b) => a + Math.random() * (b - a);

  function spawn(node) {
    node.addEventListener("animationend", () => node.remove(), { once: true });
    el.fx.appendChild(node);
  }

  function sparkles(target, count) {
    const r = target.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const s = document.createElement("span");
      s.className = "sparkle";
      s.textContent = Math.random() < 0.5 ? "✦" : "✧";
      s.style.left = rnd(r.left, r.right) + "px";
      s.style.top = rnd(r.top, r.bottom) + "px";
      s.style.fontSize = rnd(14, 30) + "px";
      s.style.setProperty("--dx", rnd(-90, 90) + "px");
      s.style.setProperty("--dy", rnd(-90, 40) + "px");
      s.style.animationDelay = rnd(0, 0.35) + "s";
      spawn(s);
    }
  }

  function confetti(count, area, spread) {
    const r = area ? area.getBoundingClientRect() : { left: 0, right: window.innerWidth, top: -20 };
    const fall = window.innerHeight - r.top + 40;
    for (let i = 0; i < count; i++) {
      const c = document.createElement("span");
      c.className = "confetti";
      c.style.left = rnd(r.left, r.right) + "px";
      c.style.top = r.top + "px";
      c.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      c.style.width = rnd(7, 12) + "px";
      c.style.height = rnd(10, 18) + "px";
      c.style.setProperty("--dx", rnd(-140, 140) + "px");
      c.style.setProperty("--fall", fall + "px");
      c.style.setProperty("--rot", rnd(-900, 900) + "deg");
      c.style.setProperty("--dur", rnd(1.8, 3.4) + "s");
      c.style.animationDelay = rnd(0, spread || 0.5) + "s";
      spawn(c);
    }
  }

  function coins(count, area, spread) {
    const r = area ? area.getBoundingClientRect() : { left: 0, right: window.innerWidth };
    for (let i = 0; i < count; i++) {
      const c = document.createElement("span");
      c.className = "coin";
      c.textContent = "★";
      c.style.left = rnd(r.left, r.right - 38) + "px";
      const size = rnd(28, 46);
      c.style.width = c.style.height = size + "px";
      c.style.fontSize = size * 0.45 + "px";
      c.style.setProperty("--fall", window.innerHeight + 120 + "px");
      c.style.setProperty("--dur", rnd(1.4, 2.6) + "s");
      c.style.animationDelay = rnd(0, spread || 1) + "s";
      spawn(c);
    }
  }

  function clearEffects() {
    clearTimeout(effectTimer);
    el.machine.classList.remove("party", "blink-frame", "jackpot-mode");
    el.reelsFrame.classList.remove("glow", "glow-bright");
    el.winBoard.classList.remove("pulse", "flash");
    reels.forEach((r) => r.el.classList.remove("win"));
  }

  function highlightReels(symbols) {
    L.winningReels(symbols[0], symbols[1], symbols[2]).forEach((i) => reels[i].el.classList.add("win"));
  }

  /* ================= Табло результата ================= */

  function mathPills(payout) {
    const net = payout - COST;
    return (
      `<span class="math-pill minus">Ставка <b>−${COST}</b></span>` +
      `<span class="math-pill ${payout > 0 ? "plus" : "zero"}">Выплата <b>${payout > 0 ? "+" + payout : "0"}</b></span>` +
      `<span class="math-pill ${signClass(net)}">Изменение баланса <b>${signed(net)}</b></span>`
    );
  }

  // Показывает результат и праздничные эффекты. Промис завершается, когда баланс досчитан.
  function showResult(symbols, payout) {
    const b = el.winBoard;
    b.className = "win-board";
    void b.offsetWidth;
    el.winSub.textContent = "";
    el.winMath.innerHTML = mathPills(payout);

    let countMs = 0;
    let effectMs = 0;
    let onProgress = null;

    switch (payout) {
      case 0:
        b.classList.add("lose");
        el.winTitle.textContent = "Попробуй ещё!";
        Sound.lose();
        break;

      case 5:
        b.classList.add("win", "flash");
        el.winTitle.textContent = "ВЫИГРЫШ! +5";
        sparkles(b, 10);
        Sound.win5();
        countMs = 350;
        effectMs = 800;
        break;

      case 10:
        b.classList.add("win", "flash");
        el.winTitle.textContent = "ВЫИГРЫШ! +10";
        el.reelsFrame.classList.add("glow");
        el.machine.classList.add("party");
        sparkles(el.reelsFrame, 18);
        sparkles(b, 8);
        Sound.win10();
        countMs = 550;
        effectMs = 1400;
        break;

      case 20:
        b.classList.add("win", "flash", "big");
        el.winTitle.textContent = "СУПЕР! +20";
        el.reelsFrame.classList.add("glow-bright");
        el.machine.classList.add("party");
        highlightReels(symbols);
        confetti(45, el.machine, 0.3);
        sparkles(el.reelsFrame, 20);
        Sound.win20();
        countMs = 800;
        effectMs = 2200;
        break;

      case 50:
        b.classList.add("win", "flash", "big", "pulse");
        el.winTitle.textContent = "БОЛЬШОЙ ВЫИГРЫШ!";
        el.winSub.textContent = "+0";
        el.machine.classList.add("party", "blink-frame");
        el.reelsFrame.classList.add("glow-bright");
        highlightReels(symbols);
        confetti(130, null, 0.8);
        coins(26, el.machine, 1.2);
        sparkles(el.reelsFrame, 26);
        Sound.win50();
        countMs = 1500;
        effectMs = 3200;
        onProgress = (d) => { el.winSub.textContent = "+" + d; };
        break;

      case 200:
        b.classList.add("win", "flash", "jackpot", "pulse");
        el.winTitle.textContent = "ДЖЕКПОТ!";
        el.winSub.textContent = "+0 МОНЕТОК";
        el.machine.classList.add("party", "jackpot-mode");
        el.reelsFrame.classList.add("glow-bright");
        highlightReels(symbols);
        confetti(160, null, 0.6);
        coins(60, null, 2.5);
        sparkles(el.reelsFrame, 40);
        setTimeout(() => confetti(140, null, 0.8), 1600);
        setTimeout(() => coins(40, null, 1.5), 2400);
        setTimeout(() => sparkles(b, 30), 900);
        Sound.jackpot();
        countMs = 2800;
        effectMs = 5600;
        onProgress = (d) => { el.winSub.textContent = "+" + d + " МОНЕТОК"; };
        break;
    }

    if (payout > 0) showDelta(payout);
    if (effectMs) effectTimer = setTimeout(clearEffects, effectMs);
    return countBalanceTo(state.stats.currentBalance, countMs, onProgress);
  }

  /* ================= История ================= */

  function renderHistory(animateFirst) {
    const body = el.historyBody;
    body.innerHTML = "";
    if (!state.history.length) {
      body.innerHTML = `<tr class="history-empty"><td colspan="3">Здесь появятся последние 10 вращений</td></tr>`;
      return;
    }
    state.history.forEach((h, idx) => {
      const tr = document.createElement("tr");
      if (idx === 0 && animateFirst) tr.className = "new";
      const td1 = document.createElement("td");
      const combo = document.createElement("div");
      combo.className = "history-combo";
      h.symbols.forEach((id) => combo.appendChild(renderSymbol(id, "tiny")));
      td1.appendChild(combo);
      const net = h.payout - COST;
      tr.appendChild(td1);
      tr.insertAdjacentHTML(
        "beforeend",
        `<td class="${h.payout > 0 ? "val-payout" : "val-zero"}">${h.payout > 0 ? "+" + h.payout : "0"}</td>` +
          `<td class="val-${signClass(net)}">${signed(net)}</td>`
      );
      body.appendChild(tr);
    });
  }

  /* ================= Игровой процесс ================= */

  function setControls(enabled) {
    el.spinBtn.disabled = !enabled;
    el.lever.classList.toggle("disabled", !enabled);
    el.endBtn.disabled = !(state.started && !state.finished && !state.busy);
  }

  function pullLever() {
    el.lever.classList.remove("pull");
    void el.lever.offsetWidth;
    el.lever.classList.add("pull");
    setTimeout(() => el.lever.classList.remove("pull"), 800);
  }

  // Нажатие на ручку или кнопку КРУТИТЬ
  function trigger() {
    if (!state.started || state.finished || state.busy) return;
    Sound.unlock();
    if (state.stats.currentBalance < COST) {
      finishGame();
      return;
    }
    state.busy = true;
    setControls(false);
    pullLever();
    setTimeout(spin, 290);
  }

  async function spin() {
    clearEffects();
    const stats = state.stats;

    // 1. Сначала автомат забирает ставку
    L.applyBet(stats);
    setBalanceNow(stats.currentBalance);
    showDelta(-COST);

    el.winBoard.className = "win-board";
    el.winTitle.textContent = "Крутим…";
    el.winSub.textContent = "";
    el.winMath.innerHTML = `<span class="math-pill minus">Ставка <b>−${COST}</b></span>`;

    // 2. Три независимых случайных символа (или заданные в debug-режиме)
    const symbols = state.forced || L.spinReels();
    state.forced = null;
    updateDebugForced();

    Sound.spinStart();
    await animateReels(symbols);

    // 3. Выплата определяется только по выпавшей комбинации
    const payout = L.calculatePayout(symbols[0], symbols[1], symbols[2]);
    L.applyPayout(stats, payout);

    state.history.unshift({ symbols, payout });
    if (state.history.length > 10) state.history.pop();
    renderHistory(true);

    await showResult(symbols, payout);

    if (stats.currentBalance < COST) {
      await wait(payout > 0 ? 1200 : 900);
      el.winBoard.className = "win-board lose";
      el.winTitle.textContent = "Монетки закончились!";
      el.winSub.textContent = "";
      el.winMath.innerHTML = `<span class="math-pill zero">Осталось <b>${fmt(stats.currentBalance)}</b> — на попытку не хватает</span>`;
      await wait(1800);
      state.busy = false;
      finishGame();
    } else {
      state.busy = false;
      setControls(true);
    }
  }

  function startGame(initialBalance) {
    state.initialBalance = initialBalance; // после старта не меняется
    state.stats = L.createStats(initialBalance);
    state.started = true;
    state.finished = false;
    state.busy = false;
    state.history = [];
    renderHistory(false);
    clearEffects();
    setBalanceNow(initialBalance);
    el.winBoard.className = "win-board";
    el.winTitle.textContent = "Дёрни ручку!";
    el.winSub.textContent = "";
    el.winMath.innerHTML = `<span class="math-pill">Одна попытка — <b>${COST}</b> монеток</span>`;
    el.startOverlay.classList.add("hidden");
    setControls(true);
    Sound.unlock();
    el.spinBtn.focus();
  }

  function finishGame() {
    if (state.finished) return;
    state.finished = true;
    setControls(false);
    renderResults();
    el.resultOverlay.classList.remove("hidden");
    el.resultOverlay.scrollTop = 0;
    requestAnimationFrame(redrawChart);
  }

  function resetGame() {
    el.resultOverlay.classList.add("hidden");
    state.started = false;
    state.finished = false;
    clearEffects();
    setControls(false);
    el.startInput.value = state.initialBalance || 1000;
    el.startError.textContent = "";
    el.startOverlay.classList.remove("hidden");
    el.startInput.focus();
    el.startInput.select();
  }

  /* ================= Стартовое окно ================= */

  el.startForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = el.startInput.value.trim();
    if (!/^\d+$/.test(raw)) {
      el.startError.textContent = "Нужно целое число монеток, например 1000.";
      return;
    }
    const n = parseInt(raw, 10);
    if (n < COST) {
      el.startError.textContent = "Минимум — 10 монеток: столько стоит одна попытка.";
      return;
    }
    if (n > 1000000) {
      el.startError.textContent = "Многовато! Максимум — 1 000 000 монеток.";
      return;
    }
    el.startError.textContent = "";
    startGame(n);
  });

  document.querySelectorAll(".presets button").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.startInput.value = btn.dataset.value;
      el.startError.textContent = "";
      el.startInput.focus();
    });
  });

  /* ================= Итоговое окно ================= */

  const SAID = {
    200: "«ДЖЕКПОТ! +200»",
    50: "«БОЛЬШОЙ ВЫИГРЫШ! +50»",
    20: "«СУПЕР! +20»",
    10: "«ВЫИГРЫШ! +10»",
    5: "«ВЫИГРЫШ! +5»",
    0: "«Попробуй ещё!»"
  };

  function renderResults() {
    const st = state.stats;
    const change = st.currentBalance - st.initialBalance;
    const pctRaw = st.initialBalance ? (change / st.initialBalance) * 100 : 0;
    const pct = Math.round(pctRaw * 10) / 10;
    const pctText = (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct).toLocaleString("ru-RU") + "%";
    const changeCls = change < 0 ? "neg" : change > 0 ? "pos" : "";

    let realText;
    let realBig;
    if (change < 0) {
      realText = "Но монеток стало";
      realBig = `на ${fmt(-change)} меньше`;
    } else if (change > 0) {
      realText = "И монеток стало";
      realBig = `на ${fmt(change)} больше`;
    } else {
      realText = "А монеток осталось";
      realBig = "столько же";
    }

    const rows = [200, 50, 20, 10, 5, 0]
      .map((p) => {
        const n = st.payoutCounts[p] || 0;
        const net = p - COST;
        let real;
        if (net > 0) real = `<span class="r-pos">${signed(net)}</span> — правда в плюс`;
        else if (net === 0) real = `<span class="r-zero">0</span> — просто вернул ставку`;
        else if (p > 0) real = `<span class="r-neg">${signed(net)}</span> — на самом деле минус!`;
        else real = `<span class="r-neg">${signed(net)}</span>`;
        const total = n * net;
        return `<tr>
          <td class="said ${p > 0 ? "win" : ""}">${SAID[p]}</td>
          <td class="num">${fmt(n)}</td>
          <td>${real}</td>
          <td class="num"><span class="${total > 0 ? "r-pos" : total < 0 ? "r-neg" : "r-zero"}">${signed(total)}</span></td>
        </tr>`;
      })
      .join("");

    let moral =
      "Автомат часто показывал тебе «Выигрыш!», но каждый раз брал 10 монеток за попытку. " +
      "Поэтому важно смотреть не на количество выигрышей, а на общий баланс.";
    if (change > 0) {
      moral += " В этот раз повезло — но чем дольше играешь, тем вернее автомат забирает своё.";
    }

    el.resultDialog.innerHTML = `
      <h2>Результат игры</h2>

      <div class="money-flow">
        <div class="money-box">
          <div class="label">Было в начале</div>
          <div class="value">${fmt(st.initialBalance)}</div>
          <div class="unit">${plural(st.initialBalance, COINS)}</div>
        </div>
        <div class="money-arrow">→</div>
        <div class="money-box">
          <div class="label">Осталось</div>
          <div class="value">${fmt(st.currentBalance)}</div>
          <div class="unit">${plural(st.currentBalance, COINS)}</div>
        </div>
        <div class="money-arrow">=</div>
        <div class="money-box change ${changeCls}">
          <div class="label">Изменение</div>
          <div class="value">${signed(change)}</div>
          <div class="unit">${plural(change, COINS)} · ${pctText}</div>
        </div>
      </div>

      <div class="contrast">
        <div class="contrast-card happy">
          <div class="cap">🎉 Автомат сказал «ВЫИГРЫШ!»</div>
          <div class="big">${fmt(st.visualWins)}</div>
          <div class="cap">${plural(st.visualWins, TIMES)}</div>
        </div>
        <div class="contrast-but">${change < 0 ? "НО" : "И"}</div>
        <div class="contrast-card real">
          <div class="cap">${realText}</div>
          <div class="big ${changeCls}">${realBig}</div>
          <div class="cap">${fmt(st.initialBalance)} → ${fmt(st.currentBalance)}</div>
        </div>
      </div>

      <h3>Как менялись монетки</h3>
      <div class="chart-box"><canvas id="balanceChart"></canvas></div>

      <h3>Подробности</h3>
      <div class="stats-grid">
        <div class="stat"><div class="label">Вращений</div><div class="value">${fmt(st.spins)}</div></div>
        <div class="stat"><div class="label">Всего поставлено</div><div class="value">${fmt(st.totalBet)}</div></div>
        <div class="stat"><div class="label">Всего получено</div><div class="value">${fmt(st.totalPaid)}</div></div>
        <div class="stat accent"><div class="label">Автомат сказал «ВЫИГРЫШ!»</div><div class="value">${fmt(st.visualWins)} ${plural(st.visualWins, TIMES)}</div></div>
        <div class="stat accent-real"><div class="label">Реально принесли прибыль</div><div class="value">${fmt(st.profitableSpins)} ${plural(st.profitableSpins, SPINS)}</div></div>
        <div class="stat"><div class="label">Без убытка (выплата ≥ 10)</div><div class="value">${fmt(st.noLossSpins)} ${plural(st.noLossSpins, SPINS)}</div></div>
      </div>

      <h3>Что показывал автомат — и что было на самом деле</h3>
      <table class="breakdown">
        <thead>
          <tr><th>Автомат показал</th><th class="num">Сколько раз</th><th>На самом деле за одно вращение</th><th class="num">Итого</th></tr>
        </thead>
        <tbody>
          ${rows}
          <tr>
            <td><b>Всего</b></td>
            <td class="num"><b>${fmt(st.spins)}</b></td>
            <td></td>
            <td class="num"><span class="${change > 0 ? "r-pos" : change < 0 ? "r-neg" : "r-zero"}">${signed(change)}</span></td>
          </tr>
        </tbody>
      </table>

      <div class="expect">
        Из каждых 10 монеток, которые попадают в этот автомат, обратно в среднем возвращается только 9.
        Значит, за ${fmt(st.spins)} ${plural(st.spins, SPINS)} автомат в среднем забирает около
        <b>${fmt(st.spins)} ${plural(st.spins, COINS)}</b>. У тебя получилось: <b>${signed(change)}</b>.
      </div>

      <p class="moral">${moral}</p>

      <div class="result-actions">
        <button class="big-btn" type="button" id="againBtn">СЫГРАТЬ ЕЩЁ РАЗ</button>
      </div>
    `;
    $("againBtn").addEventListener("click", resetGame);
  }

  /* ================= График баланса ================= */

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  function redrawChart() {
    const canvas = $("balanceChart");
    if (!canvas || el.resultOverlay.classList.contains("hidden")) return;
    drawChart(canvas, state.stats.balanceHistory, state.stats.initialBalance);
  }

  // Реальные значения после каждого вращения, без сглаживания (ТЗ, п. 18)
  function drawChart(canvas, data, initial) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pad = { l: 60, r: 70, t: 16, b: 36 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const n = data.length;

    let min = initial;
    let max = initial;
    for (const v of data) { if (v < min) min = v; if (v > max) max = v; }
    if (max - min < 20) { min -= 10; max += 10; }
    const step = niceStep((max - min) / 4);
    min = Math.max(0, Math.floor(min / step) * step);
    max = Math.ceil(max / step) * step;
    if (max === min) max = min + step;

    const X = (i) => pad.l + (n > 1 ? (i / (n - 1)) * pw : pw / 2);
    const Y = (v) => pad.t + (1 - (v - min) / (max - min)) * ph;

    ctx.font = "600 12px Nunito, Segoe UI, sans-serif";
    ctx.textBaseline = "middle";

    // Сетка и подписи по Y
    ctx.strokeStyle = "#ede9fe";
    ctx.fillStyle = "#7c6a99";
    ctx.lineWidth = 1;
    ctx.textAlign = "right";
    for (let v = min; v <= max + 1e-9; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + pw, y);
      ctx.stroke();
      ctx.fillText(fmt(v), pad.l - 8, y);
    }

    // Подписи по X
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const spins = n - 1;
    const xStep = spins > 0 ? niceStep(Math.max(1, spins / 6)) : 1;
    for (let i = 0; i <= spins; i += xStep) {
      ctx.fillText(String(i), X(i), pad.t + ph + 8);
    }
    ctx.fillStyle = "#a78bfa";
    ctx.textAlign = "right";
    ctx.fillText("номер вращения →", pad.l + pw, pad.t + ph + 22);

    // Линия старта
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 1.5;
    const ys = Math.round(Y(initial)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.l, ys);
    ctx.lineTo(pad.l + pw, ys);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#7c3aed";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("старт", pad.l + pw + 8, ys);

    // Заливка под графиком
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ph);
    grad.addColorStop(0, "rgba(124, 58, 237, 0.22)");
    grad.addColorStop(1, "rgba(124, 58, 237, 0.02)");
    ctx.beginPath();
    ctx.moveTo(X(0), pad.t + ph);
    for (let i = 0; i < n; i++) ctx.lineTo(X(i), Y(data[i]));
    ctx.lineTo(X(n - 1), pad.t + ph);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Сама линия — прямые отрезки между реальными точками
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(X(i), Y(data[i]));
      else ctx.lineTo(X(i), Y(data[i]));
    }
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = n > 300 ? 1.5 : 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Точки, если их немного
    if (n <= 80) {
      for (let i = 1; i < n; i++) {
        ctx.beginPath();
        ctx.arc(X(i), Y(data[i]), 2.6, 0, Math.PI * 2);
        ctx.fillStyle = data[i] > data[i - 1] ? "#16a34a" : data[i] < data[i - 1] ? "#e11d48" : "#6b7280";
        ctx.fill();
      }
    }

    // Начальная и конечная точки
    const last = data[n - 1];
    ctx.beginPath();
    ctx.arc(X(0), Y(data[0]), 5, 0, Math.PI * 2);
    ctx.fillStyle = "#7c3aed";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(X(n - 1), Y(last), 6, 0, Math.PI * 2);
    ctx.fillStyle = last < initial ? "#e11d48" : last > initial ? "#16a34a" : "#7c3aed";
    ctx.fill();
    ctx.font = "800 14px Nunito, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    const ly = Math.min(pad.t + ph - 8, Math.max(pad.t + 8, Y(last) + (Math.abs(Y(last) - ys) < 16 ? 16 : 0)));
    ctx.fillText(fmt(last), X(n - 1) + 10, ly);
  }

  window.addEventListener("resize", redrawChart);

  /* ================= Управление ================= */

  el.spinBtn.addEventListener("click", trigger);
  el.lever.addEventListener("click", trigger);
  el.lever.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      trigger();
    }
  });
  el.endBtn.addEventListener("click", () => {
    if (state.started && !state.finished && !state.busy) finishGame();
  });

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "BUTTON" || e.target === el.lever) return;
    if (!state.started || state.finished) return;
    e.preventDefault();
    trigger();
  });

  function updateMuteBtn() {
    el.muteBtn.textContent = Sound.isMuted() ? "🔇" : "🔊";
    el.muteBtn.title = Sound.isMuted() ? "Включить звук" : "Выключить звук";
  }
  el.muteBtn.addEventListener("click", () => {
    Sound.setMuted(!Sound.isMuted());
    updateMuteBtn();
  });

  /* ================= Debug-режим ================= */
  // Открыть: index.html?debug  или  Ctrl+Shift+D

  const DEBUG_PRESETS = {
    0: [S.PIG, S.PAW, S.PAW],
    5: [S.CATS, S.PIG, S.PIG],
    10: [S.BUG, S.CATS, S.CATS],
    20: [S.PAW, S.CATS, S.CATS],
    50: [S.PAW, S.BUG, S.PAW],
    200: [S.PAW, S.PAW, S.PAW]
  };

  function comboText(symbols) {
    return symbols.map((id) => CFG[id].emoji).join(" ");
  }

  function buildDebug() {
    const p = el.debugPanel;
    const selects = L.REELS.map(
      (reel, i) =>
        `<select data-reel="${i}">${reel.map((id) => `<option value="${id}">${CFG[id].emoji} ${CFG[id].name}</option>`).join("")}</select>`
    ).join("<br>");

    const dist = L.payoutDistribution();
    const total = L.PAYOUT_LEVELS.reduce((s, lvl) => s + lvl * dist[lvl], 0);
    const combos = L.allCombinations().length;

    p.innerHTML = `
      <h4>🛠 Debug-режим <button id="dbgClose" style="float:right">✕</button></h4>
      <div class="dbg-section">
        <div>Следующее вращение:</div>
        ${selects}<br>
        <button id="dbgSet">Задать комбинацию</button>
        <div>Уровни: ${L.PAYOUT_LEVELS.map((lvl) => `<button data-preset="${lvl}">${lvl}</button>`).join("")}</div>
        <div id="dbgForced" class="dbg-forced"></div>
      </div>
      <div class="dbg-section">
        <div>Симуляция без анимации (на игру не влияет):</div>
        <button data-sim="1000">1 000</button><button data-sim="10000">10 000</button><button data-sim="100000">100 000</button>
        <div id="dbgSim"></div>
      </div>
      <div class="dbg-section">
        Перебор всех комбинаций: ${combos}, сумма выплат ${total},
        RTP ${((total / (combos * COST)) * 100).toFixed(2)}%
      </div>
    `;

    $("dbgClose").addEventListener("click", () => p.classList.add("hidden"));
    $("dbgSet").addEventListener("click", () => {
      state.forced = Array.from(p.querySelectorAll("select[data-reel]")).map((s) => s.value);
      updateDebugForced();
    });
    p.querySelectorAll("[data-preset]").forEach((b) =>
      b.addEventListener("click", () => {
        state.forced = DEBUG_PRESETS[b.dataset.preset].slice();
        updateDebugForced();
      })
    );
    p.querySelectorAll("[data-sim]").forEach((b) =>
      b.addEventListener("click", () => {
        const out = $("dbgSim");
        out.textContent = "Считаю…";
        setTimeout(() => {
          const count = Number(b.dataset.sim);
          const res = L.simulate(count);
          const theory = L.payoutDistribution();
          out.innerHTML =
            `<div>Вращений: ${fmt(res.spins)}<br>Поставлено: ${fmt(res.totalBet)}<br>Выплачено: ${fmt(res.totalPaid)}<br>` +
            `<b>RTP: ${(res.rtp * 100).toFixed(2)}%</b> (теория 90%)</div>` +
            `<table><tr><th>Выплата</th><th>Раз</th><th>Факт</th><th>Теория</th></tr>` +
            L.PAYOUT_LEVELS.map(
              (lvl) =>
                `<tr><td>${lvl}</td><td>${fmt(res.distribution[lvl])}</td>` +
                `<td>${((res.distribution[lvl] / res.spins) * 100).toFixed(2)}%</td><td>${theory[lvl]}%</td></tr>`
            ).join("") +
            `</table>`;
        }, 20);
      })
    );
    updateDebugForced();
  }

  function updateDebugForced() {
    const f = $("dbgForced");
    if (!f) return;
    f.textContent = state.forced
      ? `Задано: ${comboText(state.forced)} → ${L.calculatePayout(state.forced[0], state.forced[1], state.forced[2])}`
      : "Следующее вращение: случайное";
  }

  function toggleDebug(show) {
    if (!el.debugPanel.innerHTML) buildDebug();
    el.debugPanel.classList.toggle("hidden", !show);
  }

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === "KeyD") {
      e.preventDefault();
      toggleDebug(el.debugPanel.classList.contains("hidden"));
    }
  });

  /* ================= Старт ================= */

  renderPaytable();
  setStrip(reels[0], neighbours(reels[0], S.PAW));
  setStrip(reels[1], neighbours(reels[1], S.CATS));
  setStrip(reels[2], neighbours(reels[2], S.BUG));
  setBalanceNow(0);
  setControls(false);
  updateMuteBtn();
  if (/(^|[?&#])debug/.test(location.search + location.hash)) toggleDebug(true);
  el.startInput.focus();
  el.startInput.select();
})();
