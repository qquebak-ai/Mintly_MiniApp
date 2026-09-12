-- Общая фраза кошельков.
--
-- Одна запись из двадцати четырёх слов на человека: из неё выводятся
-- ключи обеих сетей — Solana по пути m/44'/501'/0'/0' (тот же, что у
-- Phantom) и TON по m/44'/607'/0'. Адреса разные, восстанавливаются
-- вместе.
--
-- Фраза лежит зашифрованной: AES-256-GCM ключом площадки
-- (APP_WALLET_KEY), владелец подмешан как связанные данные — строка,
-- переставленная на другого человека, просто не расшифруется.
--
-- Таблица закрыта целиком: ни anon, ни authenticated к ней не подходят,
-- читает и пишет её только сервер своим service_role.
create table if not exists public.app_seeds (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  seed_enc   text not null,
  key_id     text,
  created_at timestamptz not null default now()
);

alter table public.app_seeds enable row level security;
revoke all on public.app_seeds from anon, authenticated;

-- Проверить:
--   select user_id, key_id, created_at from public.app_seeds limit 5;
