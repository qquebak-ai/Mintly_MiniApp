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
# Ключи для страниц берутся из .env: сборщик вшивает их в код, поэтому
# без файла сайт соберётся, но не найдёт ни базу, ни вход.
[ -f "$DIR/.env" ] || { echo "нет $DIR/.env — заполни его (см. server/README.md)"; exit 1; }
sudo -u "$USR" env HOME="$DIR" npm --prefix "$DIR" run build
echo "собрано: $(ls "$DIR/dist" | wc -l) файлов в корне dist"

echo "== перезапуск =="
systemctl restart mintly-api
sleep 2
systemctl --no-pager --lines=0 status mintly-api

echo "== проверка =="
curl -fsS localhost:8080/health && echo
