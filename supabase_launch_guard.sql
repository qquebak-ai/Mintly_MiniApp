-- Защита профиля к запуску.
--
-- Строку профиля человек правит сам (описание, аватарка), и браузер мог
-- переписать в ней и то, что править ему нельзя:
--   • x_handle — выдать себя за чужой аккаунт X: его видят в ленте;
--   • invited_by, telegram_id — подкрутить приглашения и привязку;
--   • mail_2fa — выключить подтверждение вывода почтой, имея только
--     чужую сессию, и тут же вывести деньги.
-- Триггер возвращает старые значения этих полей, если правит не сервер.
-- Выключить 2ФА можно, только если сессия подтверждена кодом с почты
-- не раньше чем пятнадцать минут назад.

alter table public.profiles add column if not exists mail_2fa boolean not null default false;

create or replace function public.guard_profile_columns()
returns trigger
language plpgsql
as $$
declare
  свежий boolean := false;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  new.x_handle := old.x_handle;
  new.x_verified_at := old.x_verified_at;
  new.invited_by := old.invited_by;
  new.telegram_id := old.telegram_id;
  if coalesce(old.mail_2fa, false) and not coalesce(new.mail_2fa, false) then
    select exists (
      select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) з
       where з ->> 'method' = 'otp'
         and (extract(epoch from now()) - coalesce((з ->> 'timestamp')::bigint, 0)) <= 900
    ) into свежий;
    if not свежий then new.mail_2fa := old.mail_2fa; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_columns on public.profiles;
create trigger guard_profile_columns
  before update on public.profiles
  for each row
  execute function public.guard_profile_columns();

-- Смена ника: цена задаётся здесь, а не браузером. Раньше её присылало
-- приложение, и вызов с p_price = 100 менял ник в пять раз дешевле.
create or replace function public.change_nickname(p_name text, p_price integer default 500)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  have integer;
  clean text := trim(p_name);
  цена constant integer := 500;
begin
  if uid is null then return json_build_object('ok', false, 'error', 'no_auth'); end if;
  if clean !~ '^[A-Za-z][A-Za-z0-9_.]{1,19}$' then
    return json_build_object('ok', false, 'error', 'bad_name');
  end if;
  if exists (select 1 from public.profiles where id = uid and lower(nickname) = lower(clean)) then
    return json_build_object('ok', true, 'nickname', clean, 'balance', public.coins_balance(uid));
  end if;
  if exists (select 1 from public.profiles where lower(nickname) = lower(clean)) then
    return json_build_object('ok', false, 'error', 'taken');
  end if;
  have := public.coins_balance(uid);
  if have < цена then
    return json_build_object('ok', false, 'error', 'not_enough', 'need', цена - have);
  end if;
  perform set_config('app.shop_txn', 'on', true);
  update public.profiles set nickname = clean, coins_spent = coins_spent + цена where id = uid;
  perform set_config('app.shop_txn', 'off', true);
  return json_build_object('ok', true, 'nickname', clean, 'balance', public.coins_balance(uid));
end;
$$;

-- Сундук — так же: цена одна, браузер её не выбирает.
create or replace function public.shop_open_chest(p_price integer default 140)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  have integer;
  pick record;
  owned_key text;
begin
  if uid is null then return json_build_object('ok', false, 'error', 'no_auth'); end if;
  -- Цена фиксированная: присланное браузером число не учитывается.
  p_price := 140;

  have := public.coins_balance(uid);
  if have < p_price then
    return json_build_object('ok', false, 'error', 'not_enough', 'need', p_price - have);
  end if;

  select c.kind, c.id into pick
    from public.cosmetics c
   where c.price > 0
     and not ((c.kind || ':' || c.id) = any (
       coalesce((select owned_cosmetics from public.profiles where id = uid), '{}')))
   order by random()
   limit 1;

  if pick is null then return json_build_object('ok', false, 'error', 'empty'); end if;
  owned_key := pick.kind || ':' || pick.id;

  perform set_config('app.shop_txn', 'on', true);
  update public.profiles
     set coins_spent = coins_spent + p_price,
         owned_cosmetics = array_append(coalesce(owned_cosmetics, '{}'), owned_key)
   where id = uid;
  perform set_config('app.shop_txn', 'off', true);

  return json_build_object('ok', true, 'kind', pick.kind, 'id', pick.id, 'balance', public.coins_balance(uid));
end;
$$;
