-- Подтверждённый аккаунт в X.
--
-- Ссылку на X в профиле можно вписать любую, и это ничего не доказывает.
-- Здесь лежит результат проверки: имя аккаунта, автор которого опубликовал
-- пост с нашим одноразовым кодом (см. api/twitter.js).
--
-- x_code / x_code_at — сам код и время его выдачи; живёт полчаса и
-- стирается сразу после удачной проверки.

alter table public.profiles add column if not exists x_handle text;
alter table public.profiles add column if not exists x_verified_at timestamptz;
alter table public.profiles add column if not exists x_code text;
alter table public.profiles add column if not exists x_code_at timestamptz;

-- Один аккаунт X — один профиль: иначе достаточно было бы раз
-- опубликовать пост и раздать ссылку на него всем желающим.
create unique index if not exists profiles_x_handle_uniq
  on public.profiles (lower(x_handle))
  where x_handle is not null;
