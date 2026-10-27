-- Лимитные заявки (api/limit-orders.js, api/_limitWorker.js).
-- Пишет только сервер (service role); человек видит свои строки.
create table if not exists public.limit_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_id uuid not null references public.tokens(id) on delete cascade,
  chain text not null default 'ton',
  side text not null check (side in ('buy', 'sell')),
  amount numeric not null check (amount > 0),
  price numeric not null check (price > 0),
  direction text not null check (direction in ('below', 'above')),
  status text not null default 'open' check (status in ('open', 'executing', 'filled', 'failed', 'cancelled')),
  error text,
  tx text,
  created_at timestamptz not null default now(),
  filled_at timestamptz
);
create index if not exists limit_orders_open on public.limit_orders (status) where status = 'open';
create index if not exists limit_orders_user on public.limit_orders (user_id, created_at desc);
alter table public.limit_orders enable row level security;
drop policy if exists "limit_orders_own_read" on public.limit_orders;
create policy "limit_orders_own_read" on public.limit_orders for select using (auth.uid() = user_id);

-- Тарифы (api/tariff.js, api/_tariff.js). Пишет только сервер.
create table if not exists public.user_tariffs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'turbo')),
  until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.user_tariffs enable row level security;
drop policy if exists "user_tariffs_own_read" on public.user_tariffs;
create policy "user_tariffs_own_read" on public.user_tariffs for select using (auth.uid() = user_id);
