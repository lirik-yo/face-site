/*
 * Игровая логика слот-машины. Не зависит от интерфейса и картинок.
 * Работает и в браузере (window.SlotLogic), и в Node.js (require) — для тестов.
 */
(function (root) {
  "use strict";

  var SPIN_COST = 10;

  // Идентификаторы символов
  var PAW = "PAW";         // Щенок
  var CATS = "CATS";       // Котик
  var PIG = "PIG";         // Свинка
  var TRACTOR = "TRACTOR"; // Трактор
  var BUG = "BUG";         // Жучок

  // Барабаны: 5 × 5 × 4 = 100 равновероятных комбинаций
  var REELS = [
    [PAW, CATS, PIG, TRACTOR, BUG],
    [PAW, CATS, PIG, TRACTOR, BUG],
    [PAW, CATS, PIG, BUG]
  ];

  var PAYOUT_LEVELS = [0, 5, 10, 20, 50, 200];

  /**
   * Выплата по комбинации. Правила проверяются сверху вниз (ТЗ, п. 6 и 23).
   */
  function calculatePayout(a, b, c) {
    if (a === PAW && b === PAW && c === PAW) return 200;
    if (a === PAW && b !== PAW && c === PAW) return 50;
    if (a === PAW && (c === CATS || c === BUG)) return 20;
    if (a === BUG && c !== PAW) return 10;
    if (a === PAW && c === PIG) return 5;
    if (a === CATS) return 5;
    if (a === BUG && c === PAW) return 5;
    return 0;
  }

  /**
   * Какие барабаны «участвуют» в выигрыше — только для подсветки в интерфейсе.
   */
  function winningReels(a, b, c) {
    var payout = calculatePayout(a, b, c);
    if (payout === 200) return [0, 1, 2];
    if (payout === 50 || payout === 20) return [0, 2];
    if (payout === 10) return [0];
    if (payout === 5) return a === CATS ? [0] : [0, 2];
    return [];
  }

  /**
   * Равномерное случайное целое от 0 до n-1.
   * Используется криптографический генератор (если есть) с отбрасыванием,
   * чтобы не было даже крошечного перекоса вероятностей.
   */
  function randomIndex(n) {
    var cryptoObj = (typeof globalThis !== "undefined" && globalThis.crypto) || null;
    if (cryptoObj && cryptoObj.getRandomValues) {
      var buf = new Uint32Array(1);
      var limit = Math.floor(0x100000000 / n) * n;
      do {
        cryptoObj.getRandomValues(buf);
      } while (buf[0] >= limit);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  /**
   * Одно вращение: каждый барабан выбирается независимо, и только потом
   * по полученной комбинации определяется выплата. Никакой подстройки
   * под баланс, серии проигрышей и т.п. нет (ТЗ, п. 26).
   */
  function spinReels() {
    return [
      REELS[0][randomIndex(REELS[0].length)],
      REELS[1][randomIndex(REELS[1].length)],
      REELS[2][randomIndex(REELS[2].length)]
    ];
  }

  /** Все 100 комбинаций — для тестов и таблицы. */
  function allCombinations() {
    var list = [];
    REELS[0].forEach(function (a) {
      REELS[1].forEach(function (b) {
        REELS[2].forEach(function (c) {
          list.push([a, b, c]);
        });
      });
    });
    return list;
  }

  /** Распределение выплат по всем комбинациям: { 0: 40, 5: 30, ... } */
  function payoutDistribution() {
    var dist = {};
    PAYOUT_LEVELS.forEach(function (p) { dist[p] = 0; });
    allCombinations().forEach(function (combo) {
      var p = calculatePayout(combo[0], combo[1], combo[2]);
      dist[p] = (dist[p] || 0) + 1;
    });
    return dist;
  }

  /** Пустая статистика игры (ТЗ, п. 15). */
  function createStats(initialBalance) {
    var payoutCounts = {};
    PAYOUT_LEVELS.forEach(function (p) { payoutCounts[p] = 0; });
    return {
      initialBalance: initialBalance,
      currentBalance: initialBalance,
      spins: 0,
      totalBet: 0,
      totalPaid: 0,
      payoutCounts: payoutCounts,
      visualWins: 0,      // выплата > 0 — автомат сказал «ВЫИГРЫШ!»
      profitableSpins: 0, // выплата > 10 — реально в плюс
      noLossSpins: 0,     // выплата >= 10 — хотя бы не в минус
      balanceHistory: [initialBalance]
    };
  }

  /** Учесть ставку (до вращения). */
  function applyBet(stats) {
    stats.currentBalance -= SPIN_COST;
    stats.totalBet += SPIN_COST;
  }

  /** Учесть выплату (после вращения). */
  function applyPayout(stats, payout) {
    stats.currentBalance += payout;
    stats.totalPaid += payout;
    stats.spins += 1;
    stats.payoutCounts[payout] = (stats.payoutCounts[payout] || 0) + 1;
    if (payout > 0) stats.visualWins += 1;
    if (payout > SPIN_COST) stats.profitableSpins += 1;
    if (payout >= SPIN_COST) stats.noLossSpins += 1;
    stats.balanceHistory.push(stats.currentBalance);
  }

  /** Быстрая симуляция без анимации (для debug-режима). */
  function simulate(spinCount) {
    var dist = {};
    PAYOUT_LEVELS.forEach(function (p) { dist[p] = 0; });
    var totalPaid = 0;
    for (var i = 0; i < spinCount; i++) {
      var r = spinReels();
      var p = calculatePayout(r[0], r[1], r[2]);
      dist[p] += 1;
      totalPaid += p;
    }
    var totalBet = spinCount * SPIN_COST;
    return {
      spins: spinCount,
      totalBet: totalBet,
      totalPaid: totalPaid,
      rtp: totalBet ? totalPaid / totalBet : 0,
      distribution: dist
    };
  }

  var SlotLogic = {
    SPIN_COST: SPIN_COST,
    SYMBOLS: { PAW: PAW, CATS: CATS, PIG: PIG, TRACTOR: TRACTOR, BUG: BUG },
    REELS: REELS,
    PAYOUT_LEVELS: PAYOUT_LEVELS,
    calculatePayout: calculatePayout,
    winningReels: winningReels,
    randomIndex: randomIndex,
    spinReels: spinReels,
    allCombinations: allCombinations,
    payoutDistribution: payoutDistribution,
    createStats: createStats,
    applyBet: applyBet,
    applyPayout: applyPayout,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SlotLogic;
  } else {
    root.SlotLogic = SlotLogic;
  }
})(this);
