-- Состояние подключения X по OAuth — на несколько минут между «Подключить»
-- и возвратом с сайта X. Человек, начавший подключение, к колбэку
-- приходит уже без своего токена (это переход по ссылке, а не запрос из
-- приложения), поэтому кто есть кто узнаём по state, а не по входу.
--
-- Доступа приложению сюда нет — ни на чтение, ни на запись: строку
-- пишет и стирает только сервер своим service_role ключом (см.
-- api/twitter.js, действия start/callback).

create table if not exists public.x_oauth_state (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_verifier text not null,
  created_at timestamptz not null default now()
);

alter table public.x_oauth_state enable row level security;

create index if not exists x_oauth_state_created_idx on public.x_oauth_state (created_at);
