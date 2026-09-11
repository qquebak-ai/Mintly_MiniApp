-- Чат токена.
-- Выполнить один раз в Supabase → SQL Editor.
--
-- Раньше под позицией жил «тезис» — личная заметка, которую видел только
-- её автор. Пользы от неё не было никакой: человек и так помнит, зачем
-- купил, а место занимала строка на самом видном месте. Вместо неё —
-- живой чат тех, кто в токене.
--
-- Кто может писать и читать, решает создатель: 'all' — кто угодно,
-- 'holders' — только те, у кого токен на руках. Проверить владение может
-- только сервер (баланс лежит в цепочке, а не в базе), поэтому таблица
-- закрыта целиком: и читает, и пишет в неё api/token-chat.js служебным
-- ключом.

alter table public.tokens
  add column if not exists chat_mode text not null default 'all';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tokens_chat_mode_chk'
  ) then
    alter table public.tokens
      add constraint tokens_chat_mode_chk check (chat_mode in ('all', 'holders'));
  end if;
end $$;

create table if not exists public.token_chat (
  id bigserial primary key,
  token_id uuid not null references public.tokens (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 400),
  created_at timestamptz not null default now()
);

create index if not exists token_chat_token_idx
  on public.token_chat (token_id, created_at desc);

alter table public.token_chat enable row level security;

-- Политик нет намеренно: с ключом браузера в эту таблицу нельзя ни
-- заглянуть, ни написать. Право читать и писать выдаёт сервер, и только
-- он знает, держит ли человек токен.
