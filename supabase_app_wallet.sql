-- Внутренний кошелёк приложения.
-- Выполнить в Supabase → SQL Editor (не в консоли сервера).
-- Файл идемпотентный: повторный запуск ничего не ломает.
--
-- Зачем. Каждая сделка сейчас требует подписи в кошельке: приложение
-- собирает транзакцию, человек уходит в Phantom, подтверждает, ждёт
-- возврата. На спокойном рынке это терпимо, на быстром — сделка успевает
-- устареть. Внутренний кошелёк убирает этот шаг: деньги лежат на адресе,
-- которым управляет приложение, и покупка уходит в сеть сразу.
--
-- Что здесь хранится. Адрес и его ключ — зашифрованный ключом площадки
-- (APP_WALLET_KEY), которого в базе нет. Баланс не хранится нигде: он
-- читается из сети по адресу и разойтись с действительностью не может.
--
-- Кто читает. Никто, кроме обработчика со service_role. Приложение
-- спрашивает состояние кошелька через него же, поэтому прямой доступ из
-- браузера к этой таблице закрыт целиком — вместе с зашифрованным
-- ключом, которому в браузере делать нечего.

create table if not exists public.app_wallets (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  chain       text not null default 'solana',
  address     text not null unique,
  secret_enc  text not null,          -- ключ, зашифрованный ключом площадки
  created_at  timestamptz not null default now()
);

-- Метка ключа, которым закрыт secret_enc: по ней ключ площадки можно
-- сменить, не потеряв доступ к уже заведённым кошелькам.
alter table public.app_wallets add column if not exists key_id text;

-- Адрес вывода. Единственный, куда кошелёк умеет отправлять монеты:
-- владение им доказано подписью, а смена ждёт сутки (payout_pending),
-- чтобы хозяин успел увидеть письмо от бота и отменить чужую попытку.
alter table public.app_wallets add column if not exists payout_address text;
alter table public.app_wallets add column if not exists payout_pending text;
alter table public.app_wallets add column if not exists payout_pending_at timestamptz;
-- Одноразовая строка, которую подписывает кошелёк при привязке.
alter table public.app_wallets add column if not exists payout_nonce text;
alter table public.app_wallets add column if not exists payout_nonce_at timestamptz;
-- Порог автовывода: всё, что выше, уходит на свой адрес по расписанию.
alter table public.app_wallets add column if not exists sweep_above numeric;

create index if not exists app_wallets_address_idx on public.app_wallets (address);
create index if not exists app_wallets_sweep_idx on public.app_wallets (sweep_above)
  where sweep_above is not null;

alter table public.app_wallets enable row level security;

-- Прямого доступа из браузера нет ни у кого: политика убрана, права
-- отозваны. Раньше своя строка была видна владельцу целиком — включая
-- зашифрованный ключ, отдавать который наружу незачем.
drop policy if exists "свой кошелёк виден владельцу" on public.app_wallets;
revoke all on public.app_wallets from anon, authenticated;

-- Журнал операций кошелька.
--
-- Одна таблица закрывает три задачи: повтор нажатия не превращается во
-- вторую сделку (request_key уникален), частоту и суточный потолок
-- вывода есть по чему считать, и остаётся история — кто, куда и сколько
-- отправил. Пишет и читает её только обработчик своим service_role.
create table if not exists public.wallet_ops (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,          -- launch | trade | swap | withdraw | sweep | payout_bind
  amount      numeric not null default 0,
  address     text,
  signature   text,
  ip          text,
  request_key text,
  created_at  timestamptz not null default now()
);

create index if not exists wallet_ops_user_idx on public.wallet_ops (user_id, created_at desc);
create unique index if not exists wallet_ops_key_idx on public.wallet_ops (user_id, request_key)
  where request_key is not null;

alter table public.wallet_ops enable row level security;
revoke all on public.wallet_ops from anon, authenticated;

-- Проверить:
--   select user_id, address, payout_address, payout_pending, sweep_above
--     from public.app_wallets limit 5;
--   select kind, amount, address, created_at
--     from public.wallet_ops order by id desc limit 20;

-- ------------------------------------------------------------------
-- Два кошелька на человека: по одному на сеть.
--
-- Раньше ключом строки был сам человек — значит, кошелёк мог быть
-- только один, и второй (в TON) просто не вставлялся. Ключ теперь
-- составной: человек и сеть.
alter table public.app_wallets drop constraint if exists app_wallets_pkey;
alter table public.app_wallets add primary key (user_id, chain);

-- Сеть операции: тот же журнал обслуживает обе.
alter table public.wallet_ops add column if not exists chain text not null default 'solana';
create index if not exists wallet_ops_chain_idx on public.wallet_ops (user_id, chain, created_at desc);
