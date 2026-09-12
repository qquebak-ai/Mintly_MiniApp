-- Казначейство площадки: кошельки, из которых идёт обмен между сетями.
-- Выполнить в Supabase → SQL Editor. Файл идемпотентный.
--
-- Зачем отдельная таблица, а не app_wallets. Там первичный ключ — user_id
-- со ссылкой на auth.users: у казначейства владельца нет, и вписать его
-- туда нельзя, не ломая связь. Здесь ключ — сама сеть: один кошелёк на
-- цепочку, больше и не нужно.
--
-- Что лежит. Адрес и ключ, зашифрованный ключом площадки (APP_WALLET_KEY,
-- в базе его нет) — тем же способом, что и у кошельков людей. Баланс не
-- хранится: он читается из сети и разойтись с действительностью не может.
--
-- Кто читает. Только обработчик со service_role. Для браузера таблица
-- закрыта целиком: в ней лежит ключ, которому там делать нечего.

create table if not exists public.treasury_wallets (
  chain       text primary key,            -- 'ton' | 'solana'
  network     text not null,               -- 'testnet' | 'devnet' | 'mainnet'
  address     text not null,
  secret_enc  text not null,
  key_id      text,
  created_at  timestamptz not null default now()
);

alter table public.treasury_wallets enable row level security;
-- Ни одной политики: таблица недоступна никому, кроме service_role,
-- который политики обходит.

-- Обмены через казначейство. Нужна не ради отчётности, а ради двух
-- вещей: не выполнить один и тот же запрос дважды (request_key) и знать,
-- какая нога обмена прошла, если вторая упала на полпути.
create table if not exists public.treasury_swaps (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  request_key   text,
  from_chain    text not null,
  to_chain      text not null,
  amount_in     numeric not null,
  amount_out    numeric,
  rate          numeric,
  fee_bps       integer,
  in_signature  text,                       -- нога «человек → казна»
  out_signature text,                       -- нога «казна → человек»
  status        text not null default 'started',   -- started | paid | done | failed
  detail        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists treasury_swaps_request_idx
  on public.treasury_swaps (user_id, request_key)
  where request_key is not null;

create index if not exists treasury_swaps_user_idx
  on public.treasury_swaps (user_id, created_at desc);

alter table public.treasury_swaps enable row level security;

-- Свои обмены человек видеть может: это его история, а ключей здесь нет.
drop policy if exists "treasury swaps own" on public.treasury_swaps;
create policy "treasury swaps own" on public.treasury_swaps
  for select using (auth.uid() = user_id);
