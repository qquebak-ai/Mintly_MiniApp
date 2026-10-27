-- Наценка за скорость монетами приложения (api/_speed.js).
-- Сервер списывает монеты после того, как сделка прошла. Вызывать может
-- только сервер (service_role): из приложения списать себе или другому
-- нельзя, а проверить остаток сервер может той же coins_balance.
create or replace function public.speed_coins_charge(p_user uuid, p_amount integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or p_amount is null or p_amount <= 0 or p_amount > 1000 then
    return json_build_object('ok', false, 'error', 'bad_request');
  end if;
  perform set_config('app.shop_txn', 'on', true);
  update public.profiles set coins_spent = coins_spent + p_amount where id = p_user;
  perform set_config('app.shop_txn', 'off', true);
  return json_build_object('ok', true, 'balance', public.coins_balance(p_user));
end;
$$;

revoke all on function public.speed_coins_charge(uuid, integer) from public, anon, authenticated;
grant execute on function public.speed_coins_charge(uuid, integer) to service_role;
grant execute on function public.coins_balance(uuid) to service_role;
