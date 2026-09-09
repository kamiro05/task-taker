// Тесты фильтров отказа. Гоняют НАСТОЯЩИЙ код из engine-core, а не его копию:
// расхождение теста с кодом однажды уже стоило нам «проверка пройдена» при
// сломанном захвате.
//
// Запуск: node test/filters.test.js

require("../src/shared/platform-config.js");
require("../src/shared/engine-core.js");

const { findBlockedWord, findBlockedCompany } = FCT.EngineCore;

// Комментарии и названия сняты с живой таблицы платформы.
const C1 = "DRIVER NEED STOP Last PickUp: 4.0mi NW from Raytown, MO - Tue Sep 08, 12:57:43 AM";
const C2 = "Sep 08, 11:38:09 AM 18.3 mi S from Portland, IN note pick up, and open from here " +
  "new shift, needs 3 h drive total complete profile BOL tg";
const C3 = "PU in 8th at 1pm.";

const cases = [
  // ── стоп-слова в комментарии: совпадение по ЦЕЛОМУ слову ──
  ["слово", C1, ["stop"], "stop", "верхний регистр в тексте"],
  ["слово", C1, ["nonstop"], "", "другое слово не срабатывает"],
  ["слово", C2, ["bol"], "bol", "аббревиатура целым словом"],
  ["слово", C2, ["pick up"], "pick up", "фраза из двух слов"],
  ["слово", C2, ["  PICK   UP  "], "  PICK   UP  ", "регистр и лишние пробелы не важны"],
  ["слово", C2, ["ne"], "", "«ne» НЕ ловится внутри need/new/note"],
  ["слово", C3, ["pu"], "pu", "короткое слово отдельным токеном ловится"],
  ["слово", C2, ["pu"], "", "«pu» НЕ ловится внутри «pick up»"],
  ["слово", C1, ["profile"], "", "слова нет в этом комментарии"],
  ["слово", "", ["stop"], "", "пустой комментарий"],
  ["слово", C1, [], "", "пустой список"],
  ["слово", C2, ["3 h drive"], "3 h drive", "фраза с цифрой"],
  ["слово", C1, ["12:57:43"], "12:57:43", "спецсимволы регэкспа экранируются"],
  ["слово", C1, ["mo"], "mo", "штат отдельным токеном"],
  ["слово", C2, ["shift", "bol"], "shift", "возвращается первая сработавшая запись"],

  // ── компании: совпадение по ПОДСТРОКЕ ──
  ["компания", "ROGUE CARRIER INC", ["rogue"], "rogue", "часть названия"],
  ["компания", "Rogue Carrier Inc", ["ROGUE"], "ROGUE", "регистр не важен"],
  ["компания", "BARD TRANSPORT INC", ["  Bard   Transport  "], "  Bard   Transport  ", "лишние пробелы"],
  ["компания", "ATA TRANSPORTATION", ["rogue"], "", "нет совпадения"],
  ["компания", "", ["rogue"], "", "пустая ячейка"],
  ["компания", "RISE & GRIND FREIGHT", ["rise & grind"], "rise & grind", "амперсанд в названии"]
];

let failed = 0;
for (const [kind, text, list, want, why] of cases) {
  const got = kind === "слово" ? findBlockedWord(text, list) : findBlockedCompany(text, list);
  const ok = got === want;
  if (!ok) failed++;
  const mark = ok ? "  ok  " : " FAIL ";
  console.log(mark + kind.padEnd(9) + JSON.stringify(list[0] || "").padEnd(24) +
    "-> " + JSON.stringify(got).padEnd(24) + why);
}

console.log(failed ? "\n" + failed + " провал(ов) из " + cases.length
  : "\nвсе " + cases.length + " проверок пройдены");
process.exit(failed ? 1 : 0);
