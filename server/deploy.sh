#!/usr/bin/env bash
# Обновление на сервере: забрать код, доставить зависимости, разложить
# сайт, перезапустить службу. Запускать от root: sudo /srv/mintly/server/deploy.sh
#
# Служба перезапускается только после успешной установки: иначе на
# полуобновлённом каталоге она поднялась бы и упала, а старая версия к
# тому моменту уже была бы остановлена.
#
# Сайт отдаётся из www, а не прямо из dist. dist — рабочая копия git, и
# git пишет в неё по файлу: стоило ему споткнуться посередине, и на диске
# оказывался новый index.html, который просит код, которого нет, — сайт
# стоял пустым. www собирается рядом, проверяется целиком и только потом
# подменяет прежний. Не собрался — люди продолжают видеть старый.

set -euo pipefail

# Имена латиницей: кириллические переменные bash не принимает.
DIR=${DIR:-/srv/mintly}
USR=${USR:-mintly}
LIVE="$DIR/www"
NEW="$DIR/www.new"

echo "== права =="
# Хватает одной команды, набранной от root (git pull, npm run build), и
# часть файлов становится чужой: git дальше не может класть новые файлы
# сборки, выкладка обрывается на полпути. Каждый раз возвращаем всё
# пользователю службы — это дёшево, если менять нечего.
if [ -n "$(find "$DIR" -xdev \! -user "$USR" -print -quit 2>/dev/null)" ]; then
  chown -R "$USR:$USR" "$DIR"
  echo "вернул файлы пользователю $USR"
else
  echo "в порядке"
fi

echo "== код =="
sudo -u "$USR" git -C "$DIR" fetch --quiet origin main
sudo -u "$USR" git -C "$DIR" reset --hard --quiet origin/main
sudo -u "$USR" git -C "$DIR" log -1 --oneline

echo "== зависимости =="
# Ставим их, только когда список правда изменился.
# npm ci сносит node_modules и качает полтысячи пакетов заново — минута
# на каждую выкладку, хотя в девяти случаях из десяти меняется только
# код. Сверяем отпечаток package-lock.json с прошлым разом.
LOCK_HASH=$(sha1sum "$DIR/package-lock.json" | cut -d" " -f1)
LOCK_FILE="$DIR/.deps-hash"
if [ -d "$DIR/node_modules" ] && [ -f "$LOCK_FILE" ] && [ "$(cat "$LOCK_FILE")" = "$LOCK_HASH" ]; then
  echo "список не менялся — пропускаем"
else
  # Сборщик нужен здесь же: сайт может собираться на сервере, поэтому
  # dev-зависимости не отбрасываем.
  sudo -u "$USR" env HOME="$DIR" npm --prefix "$DIR" ci --no-audit --no-fund --prefer-offline
  echo "$LOCK_HASH" | sudo -u "$USR" tee "$LOCK_FILE" >/dev/null
fi

echo "== сборка сайта =="
# Готовый dist из репозитория — уже собранный сайт: собирать на двух
# ядрах под две минуты незачем, он собран там, где это быстро, и лежит
# ровно того же коммита.
if [ -f "$DIR/dist/index.html" ] && sudo -u "$USR" git -C "$DIR" ls-files --error-unmatch dist/index.html >/dev/null 2>&1; then
  echo "dist пришёл из репозитория — сборка не нужна"
else
  # Ключи для страниц берутся из .env: сборщик вшивает их в код, поэтому
  # без файла сайт соберётся, но не найдёт ни базу, ни вход.
  [ -f "$DIR/.env" ] || { echo "нет $DIR/.env — заполни его (см. server/README.md)"; exit 1; }
  sudo -u "$USR" rm -rf "$DIR/dist.new"
  sudo -u "$USR" env HOME="$DIR" npm --prefix "$DIR" run build -- --outDir dist.new --emptyOutDir
  [ -f "$DIR/dist.new/index.html" ] || { echo "сборка не дала index.html — оставляем прежний сайт"; exit 1; }
  sudo -u "$USR" rm -rf "$DIR/dist"
  sudo -u "$USR" mv "$DIR/dist.new" "$DIR/dist"
fi

echo "== раскладка =="
sudo -u "$USR" rm -rf "$NEW"
sudo -u "$USR" mkdir -p "$NEW"
# Сначала public, поверх — сборка: index.html и код берутся из неё.
sudo -u "$USR" cp -r "$DIR/public/." "$NEW/"
sudo -u "$USR" cp -r "$DIR/dist/." "$NEW/"

# Всё, на что ссылаются страница и сам код (куски, которые грузятся
# позже), должно лежать на месте. Чего-то нет — не подменяем.
MISSING=0
for REF in $(grep -ohE 'assets/[A-Za-z0-9_.-]+\.(js|css)' "$NEW/index.html" "$NEW"/assets/*.js | sort -u); do
  if [ ! -f "$NEW/$REF" ]; then echo "нет файла $REF"; MISSING=1; fi
done
[ "$MISSING" = 0 ] || { echo "сборка неполная — оставляю прежний сайт"; exit 1; }

# Прежние файлы сборки оставляем рядом с новыми: у открытых вкладок
# index.html старый и просит именно их. Время у них старое (-p), у новых
# — сегодняшнее, поэтому по возрасту чистится только то, что неделю как
# никому не нужно.
for OLD in "$LIVE/assets" "$DIR/assets.keep"; do
  [ -d "$OLD" ] && sudo -u "$USR" cp -rnp "$OLD/." "$NEW/assets/" || true
done
sudo -u "$USR" find "$NEW/assets" -type f -mtime +7 -delete || true
sudo -u "$USR" rm -rf "$DIR/assets.keep"

# Сжатие заранее: brotli и gzip на высшем уровне, только изменившееся.
sudo -u "$USR" node "$DIR/server/compress.mjs" "$NEW"

# Подмена — двумя переименованиями, без копирования поверх живого.
sudo -u "$USR" rm -rf "$DIR/www.old"
[ -d "$LIVE" ] && sudo -u "$USR" mv "$LIVE" "$DIR/www.old"
sudo -u "$USR" mv "$NEW" "$LIVE"
sudo -u "$USR" rm -rf "$DIR/www.old"
echo "сайт: $(ls "$LIVE" | wc -l) файлов в корне, $(ls "$LIVE/assets" | wc -l) в assets"

echo "== перезапуск =="
systemctl restart mintly-api
sleep 2
systemctl --no-pager --lines=0 status mintly-api

echo "== проверка =="
curl -fsS localhost:8080/health && echo
