#!/usr/bin/env bash
# Обновление API на сервере: забрать код, доставить зависимости,
# перезапустить службу. Запускать от root: sudo /srv/mintly/server/deploy.sh
#
# Служба перезапускается только после успешной установки: иначе на
# полуобновлённом каталоге она поднялась бы и упала, а старая версия к
# тому моменту уже была бы остановлена.

set -euo pipefail

# Имена латиницей: кириллические переменные bash не принимает.
DIR=${DIR:-/srv/mintly}
USR=${USR:-mintly}

echo "== код =="
# Прежние файлы сборки придерживаем. У открытых приложений index.html
# лежит в кеше и продолжает просить именно их: после подмены dist такой
# файл исчезал, вместо кода приезжала страница, и приложение вставало с
# «text/html не годится в JavaScript». Складываем их рядом и возвращаем
# в новый dist — так старые вкладки доживают до перезагрузки.
KEEP="$DIR/assets.keep"
if [ -d "$DIR/dist/assets" ]; then
  sudo -u "$USR" mkdir -p "$KEEP"
  sudo -u "$USR" cp -r "$DIR/dist/assets/." "$KEEP/" || true
fi

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
  # Сборщик нужен здесь же: сайт собирается на сервере, а не приезжает
  # готовым, поэтому dev-зависимости не отбрасываем.
  sudo -u "$USR" env HOME="$DIR" npm --prefix "$DIR" ci --no-audit --no-fund --prefer-offline
  echo "$LOCK_HASH" | sudo -u "$USR" tee "$LOCK_FILE" >/dev/null
fi

echo "== сборка сайта =="
# Готовый dist из репозитория — уже собранный сайт.
# Сборка на двух ядрах занимает под две минуты, и всё это время выкладка
# висит. Если dist приехал вместе с кодом, собирать нечего: он собран
# там, где это быстро, и лежит ровно того же коммита.
if [ -f "$DIR/dist/index.html" ] && sudo -u "$USR" git -C "$DIR" ls-files --error-unmatch dist/index.html >/dev/null 2>&1; then
  # В репозиторий едут только index.html и assets: картинки и шрифты уже
  # лежат в public, и второй их копией репозиторий раздувать незачем.
  # Сборщик кладёт public в dist сам — здесь делаем то же самое.
  sudo -u "$USR" cp -r "$DIR/public/." "$DIR/dist/"
  echo "dist пришёл из репозитория — сборка не нужна"
else
  # Ключи для страниц берутся из .env: сборщик вшивает их в код, поэтому
  # без файла сайт соберётся, но не найдёт ни базу, ни вход.
  [ -f "$DIR/.env" ] || { echo "нет $DIR/.env — заполни его (см. server/README.md)"; exit 1; }
  # Собираем рядом и подменяем одним движением. Сборщик первым делом
  # очищает свой каталог, и пока он работал, сайта на диске не было
  # вовсе: главная отвечала 404, а сторож писал тревогу на живом
  # сервере. Теперь старый dist стоит до последней секунды.
  sudo -u "$USR" rm -rf "$DIR/dist.new" "$DIR/dist.old"
  sudo -u "$USR" env HOME="$DIR" npm --prefix "$DIR" run build -- --outDir dist.new --emptyOutDir
  [ -f "$DIR/dist.new/index.html" ] || { echo "сборка не дала index.html — оставляем прежний сайт"; exit 1; }
  sudo -u "$USR" cp -r "$DIR/public/." "$DIR/dist.new/"
  [ -d "$DIR/dist" ] && sudo -u "$USR" mv "$DIR/dist" "$DIR/dist.old"
  sudo -u "$USR" mv "$DIR/dist.new" "$DIR/dist"
  sudo -u "$USR" rm -rf "$DIR/dist.old"
fi
# Возвращаем прежние файлы сборки: -n не даёт затереть свежие, так что
# в dist оказываются и новые, и те, что ещё просят открытые вкладки.
if [ -d "$KEEP" ] && [ -d "$DIR/dist/assets" ]; then
  sudo -u "$USR" cp -rn "$KEEP/." "$DIR/dist/assets/" || true
  # Старьё дальше недели не держим: каталог иначе растёт без конца.
  sudo -u "$USR" find "$KEEP" -type f -mtime +7 -delete || true
fi

echo "собрано: $(ls "$DIR/dist" | wc -l) файлов в корне dist"

echo "== перезапуск =="
systemctl restart mintly-api
sleep 2
systemctl --no-pager --lines=0 status mintly-api

echo "== проверка =="
curl -fsS localhost:8080/health && echo
