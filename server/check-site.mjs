/* Всё ли, что просит страница, лежит на месте: node server/check-site.mjs <каталог>
 *
 * Идём от index.html по ссылкам: страница просит куски кода, куски —
 * другие куски, которые грузятся позже. Проверяем ровно то, до чего
 * так можно дойти. Посторонние файлы в каталоге (старые сборки, чужая
 * ручная сборка) не в счёт: на них никто не ссылается, а их ссылки на
 * давно удалённое ничего не ломают — раньше проверка спотыкалась ровно
 * о них и не пускала годную сборку. */
import fs from "node:fs";
import path from "node:path";

const корень = process.argv[2];
const очередь = ["index.html"];
const видели = new Set(очередь);
const нет = [];
while (очередь.length) {
  const файл = очередь.shift();
  let текст;
  try { текст = fs.readFileSync(path.join(корень, файл), "utf8"); } catch { нет.push(файл); continue; }
  for (const м of текст.matchAll(/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g)) {
    const ссылка = м[0];
    if (видели.has(ссылка)) continue;
    видели.add(ссылка);
    if (!fs.existsSync(path.join(корень, ссылка))) нет.push(ссылка);
    else if (ссылка.endsWith(".js")) очередь.push(ссылка);
  }
}
if (нет.length) {
  console.error(`нет файлов: ${нет.join(", ")}`);
  process.exit(1);
}
console.log(`на месте все ${видели.size - 1} файлов, которые просит страница`);
