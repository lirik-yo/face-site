/*
 * Автоматический тест таблицы выплат (ТЗ, п. 24).
 * Запуск:  node tests/payout.test.js
 * Также можно открыть tests/test.html в браузере.
 */
(function (root) {
  "use strict";

  function runPayoutTests(SlotLogic) {
    var results = [];
    function check(name, actual, expected) {
      var ok = Math.abs(actual - expected) < 1e-9;
      results.push({ name: name, actual: actual, expected: expected, ok: ok });
    }

    var combos = SlotLogic.allCombinations();
    var dist = {};
    var totalPaid = 0;
    var seen = {};

    combos.forEach(function (c) {
      var p = SlotLogic.calculatePayout(c[0], c[1], c[2]);
      dist[p] = (dist[p] || 0) + 1;
      totalPaid += p;
      seen[c.join("|")] = true;
    });

    check("0 монет = 40 комбинаций", dist[0] || 0, 40);
    check("5 монет = 30 комбинаций", dist[5] || 0, 30);
    check("10 монет = 15 комбинаций", dist[10] || 0, 15);
    check("20 монет = 10 комбинаций", dist[20] || 0, 10);
    check("50 монет = 4 комбинации", dist[50] || 0, 4);
    check("200 монет = 1 комбинация", dist[200] || 0, 1);

    var unexpected = Object.keys(dist).filter(function (k) {
      return SlotLogic.PAYOUT_LEVELS.indexOf(Number(k)) === -1;
    }).length;
    check("нет неожиданных размеров выплат", unexpected, 0);

    check("общее количество комбинаций = 100", combos.length, 100);
    check("все комбинации различны", Object.keys(seen).length, 100);
    check("суммарная выплата = 900", totalPaid, 900);
    check("средняя выплата = 9", totalPaid / combos.length, 9);
    check("ставка = 10", SlotLogic.SPIN_COST, 10);
    check("RTP = 90%", Math.round((totalPaid / (combos.length * SlotLogic.SPIN_COST)) * 10000) / 100, 90);

    // Конкретные правила из п. 6
    var S = SlotLogic.SYMBOLS;
    check("🐶🐶🐶 = 200", SlotLogic.calculatePayout(S.PAW, S.PAW, S.PAW), 200);
    check("🐶🐱🐶 = 50", SlotLogic.calculatePayout(S.PAW, S.CATS, S.PAW), 50);
    check("🐶🐶🐱 = 20", SlotLogic.calculatePayout(S.PAW, S.PAW, S.CATS), 20);
    check("🐶🚜🐞 = 20", SlotLogic.calculatePayout(S.PAW, S.TRACTOR, S.BUG), 20);
    check("🐞🐶🐷 = 10", SlotLogic.calculatePayout(S.BUG, S.PAW, S.PIG), 10);
    check("🐶🐞🐷 = 5", SlotLogic.calculatePayout(S.PAW, S.BUG, S.PIG), 5);
    check("🐱🐶🐶 = 5", SlotLogic.calculatePayout(S.CATS, S.PAW, S.PAW), 5);
    check("🐞🐞🐶 = 5", SlotLogic.calculatePayout(S.BUG, S.BUG, S.PAW), 5);
    check("🐷🐶🐶 = 0", SlotLogic.calculatePayout(S.PIG, S.PAW, S.PAW), 0);
    check("🚜🐶🐶 = 0", SlotLogic.calculatePayout(S.TRACTOR, S.PAW, S.PAW), 0);

    // Каждый символ барабана выпадает с равной вероятностью
    var N = 200000;
    var counts = [{}, {}, {}];
    for (var i = 0; i < N; i++) {
      var r = SlotLogic.spinReels();
      for (var k = 0; k < 3; k++) counts[k][r[k]] = (counts[k][r[k]] || 0) + 1;
    }
    var maxDeviation = 0;
    SlotLogic.REELS.forEach(function (reel, k) {
      reel.forEach(function (sym) {
        var share = (counts[k][sym] || 0) / N;
        maxDeviation = Math.max(maxDeviation, Math.abs(share - 1 / reel.length));
      });
    });
    check("равномерность барабанов (отклонение < 1%)", maxDeviation < 0.01 ? 1 : 0, 1);

    return results;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = runPayoutTests;
    if (require.main === module) {
      var SlotLogic = require("../js/logic.js");
      var results = runPayoutTests(SlotLogic);
      var failed = 0;
      results.forEach(function (r) {
        if (!r.ok) failed++;
        console.log((r.ok ? "  ✓ " : "  ✗ ") + r.name + (r.ok ? "" : "  (получено " + r.actual + ", ожидалось " + r.expected + ")"));
      });
      console.log("");
      if (failed) {
        console.error("ОШИБКА: не пройдено тестов — " + failed + " из " + results.length);
        process.exit(1);
      }
      console.log("Все тесты пройдены: " + results.length + " из " + results.length + ". RTP = 90%.");
    }
  } else {
    root.runPayoutTests = runPayoutTests;
  }
})(this);
