/*
 * Конфигурация внешнего вида символов.
 *
 * Здесь задаётся ТОЛЬКО оформление: название, эмодзи, цвет карточки и
 * (необязательно) путь к картинке. Игровая логика (js/logic.js) использует
 * лишь идентификаторы символов, поэтому картинки можно менять, не трогая логику.
 *
 * Чтобы заменить эмодзи на картинку, положите файл, например, в папку images/
 * и укажите путь в поле image:  image: "images/paw.png"
 *
 * ВНИМАНИЕ: если приложение будет опубликовано, не вставляйте настоящие
 * изображения персонажей мультфильмов без проверки прав на их использование.
 */
(function (root) {
  var SYMBOLS_CONFIG = {
    PAW: { name: "Щенок", emoji: "🐶", color: "#3b82f6", image: null },
    CATS: { name: "Котик", emoji: "🐱", color: "#f59e0b", image: null },
    PIG: { name: "Свинка", emoji: "🐷", color: "#ec4899", image: null },
    TRACTOR: { name: "Трактор", emoji: "🚜", color: "#0ea5e9", image: null },
    BUG: { name: "Жучок", emoji: "🐞", color: "#ef4444", image: null }
  };
  
  if (typeof module !== "undefined" && module.exports) {
    module.exports = SYMBOLS_CONFIG;
  } else {
    root.SYMBOLS_CONFIG = SYMBOLS_CONFIG;
  }
})(this);
