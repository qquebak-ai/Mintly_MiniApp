-- Окрасы Минти в магазине (kind = 'mintie'). Выполнить один раз в Supabase → SQL Editor.
alter table public.cosmetics drop constraint if exists cosmetics_kind_check;
alter table public.cosmetics add constraint cosmetics_kind_check check (kind in ('frame', 'card', 'wallet', 'mintie'));
insert into public.cosmetics (kind, id, price) values
  ('mintie', 'mint', 0), ('mintie', 'leucistic', 150), ('mintie', 'albino', 180), ('mintie', 'wild', 200),
  ('mintie', 'gold', 260), ('mintie', 'ice', 260), ('mintie', 'violet', 300), ('mintie', 'fire', 320), ('mintie', 'neon', 400)
on conflict (kind, id) do update set price = excluded.price;
