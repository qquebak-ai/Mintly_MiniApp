/* Сжатие сайта заранее: node server/compress.mjs <каталог>
 *
 * Раньше каждый ответ сжимал nginx на лету, на первом уровне gzip —
 * иначе он не успевал бы. Главный файл кода при этом весил 610 КБ.
 * Сжатый заранее brotli на высшем уровне — 400 КБ: на треть меньше
 * качать, а серверу на каждый запрос не нужно ничего считать.
 *
 * Рядом с файлом кладутся .br и .gz: brotli понимают все современные
 * браузеры и Telegram, gzip — запас для остальных. Отдаёт их сервер
 * (server/index.mjs) или nginx (gzip_static, brotli_static).
 *
 * Пересжимается только то, что изменилось: у копии то же время, что у
 * исходника, и если оно совпадает — файл уже сжат. Отсюда же и чистка
 * старых файлов сборки по возрасту (server/deploy.sh): копия стареет
 * вместе с исходником.
 *
 * В assets сжимается только нынешняя сборка — то, до чего можно дойти
 * по ссылкам от index.html. Там же лежат прежние сборки за неделю, для
 * открытых вкладок: их сотни, brotli на высшем уровне считал бы их
 * полчаса, а просят их редко — обойдутся сжатием nginx на лету. */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const корень = process.argv[2];
if (!корень || !fs.existsSync(корень)) {
  console.error("укажи каталог сайта: node server/compress.mjs <каталог>");
  process.exit(1);
}

// Картинки и шрифты уже сжаты своим форматом — второй раз они не худеют.
const ПОДХОДЯТ = /\.(js|mjs|css|html|svg|json|txt|webmanifest|xml|ico|map)$/i;
let сжато = 0, уже = 0;

// Время файловая система хранит с округлением, поэтому «то же время» —
// с точностью до нескольких миллисекунд.
function совпадает(копия, ст) {
  try { return Math.abs(fs.statSync(копия).mtimeMs - ст.mtimeMs) < 5; } catch { return false; }
}

function сжать(файл, ст) {
  const br = файл + ".br", gz = файл + ".gz";
  if (совпадает(br, ст) && совпадает(gz, ст)) { уже++; return; }
  const данные = fs.readFileSync(файл);
  fs.writeFileSync(br, zlib.brotliCompressSync(данные, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: данные.length,
    },
  }));
  fs.writeFileSync(gz, zlib.gzipSync(данные, { level: 9 }));
  fs.utimesSync(br, ст.atime, ст.mtime);
  fs.utimesSync(gz, ст.atime, ст.mtime);
  сжато++;
}

// Нынешняя сборка: от страницы по ссылкам кусков друг на друга.
const нынешние = new Set();
const очередь = ["index.html"];
while (очередь.length) {
  let текст;
  try { текст = fs.readFileSync(path.join(корень, очередь.shift()), "utf8"); } catch { continue; }
  for (const м of текст.matchAll(/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g)) {
    if (нынешние.has(м[0])) continue;
    нынешние.add(м[0]);
    if (м[0].endsWith(".js")) очередь.push(м[0]);
  }
}

function обойти(каталог) {
  for (const имя of fs.readdirSync(каталог)) {
    const файл = path.join(каталог, имя);
    const свой = path.relative(корень, файл).split(path.sep).join("/");
    const ст = fs.statSync(файл);
    if (ст.isDirectory()) обойти(файл);
    // Мелочь меньше килобайта сжатие не окупает: заголовки дороже.
    else if (ПОДХОДЯТ.test(имя) && ст.size >= 1024 && (!свой.startsWith("assets/") || нынешние.has(свой))) сжать(файл, ст);
  }
}

обойти(корень);
console.log(`сжато ${сжато}, уже было ${уже}`);
