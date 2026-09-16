-- Дата рождения.
--
-- Аккаунт теперь заводится по почте, и при создании человек один раз
-- указывает дату рождения: младше восемнадцати в Mintly нельзя — здесь
-- торгуют на настоящие деньги. Проверяет её сервер
-- (api/telegram-auth.js, действие profile), а не форма в браузере.
--
-- Отдельной таблицей, а не колонкой в profiles: профили читают все —
-- ник, аватарку и токены чужого человека видно с его страницы, — а дата
-- рождения чужих глаз не касается. Здесь же видно, что возраст вообще
-- подтверждён: у аккаунтов, заведённых до этой правки, строки нет.

create table if not exists public.profile_birth (
  id uuid primary key references auth.users(id) on delete cascade,
  birth_date date not null,
  created_at timestamptz not null default now()
);

alter table public.profile_birth enable row level security;

-- Своё — читает, чужое — нет. Пишет только сервер service_role ключом:
-- иначе дату можно было бы переписать из браузера и обойти проверку.
drop policy if exists "своя дата видна" on public.profile_birth;
create policy "своя дата видна" on public.profile_birth
  for select using (auth.uid() = id);

grant select on public.profile_birth to authenticated;
