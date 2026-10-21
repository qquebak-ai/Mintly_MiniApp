# Сайт и API на своём сервере

Здесь живёт всё: обработчики `api/*.js` с их кешем, обход биржевых лент и
сам сайт. Выкладка — это `git pull` и сборка на месте, без чужой очереди:
именно из-за неё коммиты часами не доезжали до людей.

Что это даёт против текущего Vercel:

| | было | стало |
|---|---|---|
| холодный старт | 1,3 с | нет |
| свечи из кеша | 0,3 с | 20–40 мс |
| обход ленты | раз в минуту, чужим планировщиком | свой цикл, каждая сеть раз в минуту |
| число обработчиков | 12 (лимит тарифа) | сколько нужно |

---

## Установка одной командой

Ubuntu 22.04/24.04, 2 ядра, 2–4 ГБ.

```bash
curl -fsSL https://raw.githubusercontent.com/qquebak-ai/Facet_MiniApp/main/server/setup.sh | sudo bash
```

Скрипт ставит node, nginx и git, заводит пользователя, забирает код,
кладёт службу и вход nginx. Первый запуск заканчивается просьбой
заполнить ключи; заполнив, запусти его ещё раз — он поднимет службу.
Повторный запуск безопасен: скрипт доводит до нужного состояния, а не
делает всё заново.

Ниже — то же самое по шагам, если хочется руками.

## Что нужно на сервере

Node 22, nginx, git.

```bash
sudo apt update
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v            # должно быть v22.x
```

## Учётная запись и код

Каталог создаётся пустым намеренно: `useradd -m` положил бы в него свои
файлы, а `git clone` в непустой каталог не идёт.

```bash
sudo useradd -r -s /bin/bash -d /srv/mintly mintly
sudo mkdir -p /srv/mintly && sudo chown mintly:mintly /srv/mintly
sudo -u mintly git clone https://github.com/qquebak-ai/Facet_MiniApp.git /tmp/mintly-код
sudo -u mintly bash -c 'shopt -s dotglob; mv /tmp/mintly-код/* /srv/mintly/'
# HOME задаём явно: иначе npm ищет кеш в /home/mintly, которого нет.
sudo -u mintly env HOME=/srv/mintly npm --prefix /srv/mintly ci --omit=dev
```

## Переменные окружения

Файл `/srv/mintly/.env.server`, права `600` — в нём служебный ключ базы и
токен бота.

```bash
sudo -u mintly tee /srv/mintly/.env.server >/dev/null <<'КОНЕЦ'
PORT=8080
SUPABASE_URL=https://rinxzaakkhxdbhjghtwa.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role из Supabase → Project Settings → API>
CRON_SECRET=<то же значение, что в переменных Vercel>
APP_URL=https://mintly.company
ALLOW_ORIGINS=https://mintly.company,https://www.mintly.company
FEED_INTERVAL_MS=30000
TELEGRAM_BOT_TOKEN=<токен бота>
TELEGRAM_WEBHOOK_SECRET=<секрет вебхука>
TONCENTER_API_KEY=
TONAPI_KEY=
SOLANA_RPC=
FEE_ADDRESS=
КОНЕЦ
sudo chmod 600 /srv/mintly/.env.server
sudo chown mintly:mintly /srv/mintly/.env.server
```

Остальные переменные (кошелёк приложения, подписант Solana, поддержка)
переносятся из Vercel → Settings → Environment Variables как есть.
Полный список имён — `grep -rho "process\.env\.[A-Z_0-9]*" api/ | sort -u`.

## Служба

```bash
sudo cp /srv/mintly/server/mintly-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mintly-api
systemctl status mintly-api --no-pager
curl -s localhost:8080/health          # {"ok":true,...}
journalctl -u mintly-api -f            # живой журнал
```

## Домен и сертификат

В DNS (там же, где сейчас `mintly.company`) добавить запись:

```
A   api   <IP сервера>
```

Потом:

```bash
sudo cp /srv/mintly/server/nginx.conf /etc/nginx/sites-available/mintly-api
sudo ln -sf /etc/nginx/sites-available/mintly-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.mintly.company
```

Certbot сам допишет блок 443 и продление.

## Ключи для страниц

Сайт собирается на сервере, и сборщику нужны переменные с префиксом
`VITE_` — он вшивает их прямо в код страниц. Файл `/srv/mintly/.env`
(не путать с `.env.server`, который читает служба):

```bash
sudo -u mintly tee /srv/mintly/.env >/dev/null <<'КОНЕЦ'
VITE_SUPABASE_URL=https://rinxzaakkhxdbhjghtwa.supabase.co
VITE_SUPABASE_ANON_KEY=<anon из Supabase → Project Settings → API>
VITE_TG_BOT=MintlyAppbot
VITE_TG_APP=app
КОНЕЦ
```

`VITE_API_BASE` здесь не нужен вовсе: сайт и API на одном домене, и
запросы идут к соседнему пути.

## Домен сайта

В DNS: `A  @  <IP сервера>` и `A  www  <IP сервера>`, потом сертификат на
оба имени сразу:

```bash
sudo certbot --nginx -d mintly.company -d www.mintly.company -d api.mintly.company
```

Пока записи ведут на старую площадку, сервер уже можно проверить по IP:
`curl -H "Host: mintly.company" http://<IP>/` должен отдать страницу.

## Обновление

```bash
sudo /srv/mintly/server/deploy.sh
```

Скрипт забирает код, ставит зависимости, раскладывает сайт в `www` и
перезапускает службу. Это и есть выкладка целиком — примерно минута.

Сайт отдаётся из `/srv/mintly/www`: выкладка собирает его рядом,
проверяет, что на месте всё, что просит страница, сжимает brotli и gzip
и только потом подменяет прежний. Не собрался — остаётся старый.

`git pull` и `npm run build` руками от root не набирать: файлы
становятся чужими для службы, и следующая выкладка обрывается на
полпути. Скрипт теперь возвращает права сам, но обновлять сайт надо
только им.

### Выкладка по запросу

Чтобы не ходить на сервер руками, тот же скрипт запускается маршрутом
`/api/deploy` — с секретом из `.env.server`:

```bash
curl -X POST https://mintly.company/api/deploy -H "authorization: Bearer $DEPLOY_SECRET"
curl https://mintly.company/api/deploy -H "authorization: Bearer $DEPLOY_SECRET"   # чем кончилось
```

Ответ приходит сразу, сборка идёт дальше сама. Без `DEPLOY_SECRET`
маршрут выключен целиком — открытым его оставлять нельзя, он выполняет
команды на машине.

Службе нужно право запускать скрипт от root без пароля:

```bash
echo 'mintly ALL=(root) NOPASSWD: /srv/mintly/server/deploy.sh' | sudo tee /etc/sudoers.d/mintly-deploy
sudo chmod 440 /etc/sudoers.d/mintly-deploy
```

## Когда переедет

Оба расписания в GitHub Actions — «Обход ленты» и «Уведомления» — можно
выключить: сервер делает и то и другое своими циклами. Два обходчика
только зря выбирают лимит источника, а уведомления через GitHub ещё и
падали, когда секрет в репозитории расходился с секретом на площадке.

Шаги циклов задаются переменными: `FEED_INTERVAL_MS` (по умолчанию 30 с)
и `NOTIFY_INTERVAL_MS` (10 мин). Выключаются `FEED_LOOP=0` и
`NOTIFY_LOOP=0` — это удобно, если сервер поднимают вторым, рядом с
работающим Vercel.

Уведомлениям нужен `TELEGRAM_BOT_TOKEN` в `.env.server`: без него цикл
просто не запускается.
