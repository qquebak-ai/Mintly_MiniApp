-- Адресная книга кошелька.
--
-- Поле адреса на экране «Отправить» теперь всегда пустое: подставленный
-- прошлый адрес — это перевод не туда, если сеть или получатель
-- поменялись. Взамен человек складывает проверенные адреса сюда и
-- выбирает их одним нажатием.
--
-- Книга своя у каждого и отдельная на каждую сеть: адрес Solana в списке
-- GRAM — верный путь потерять деньги.

create table if not exists public.address_book (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  chain text not null check (chain in ('sol', 'ton')),
  address text not null,
  label text,
  created_at timestamptz not null default now()
);

-- Один и тот же адрес дважды в книге — только путаница.
create unique index if not exists address_book_uniq
  on public.address_book (owner_id, chain, address);
create index if not exists address_book_owner
  on public.address_book (owner_id, chain, created_at desc);

alter table public.address_book enable row level security;

-- Чужая книга — это список, куда человек носит деньги. Видит её только он.
drop policy if exists "своя книга видна" on public.address_book;
create policy "своя книга видна" on public.address_book
  for select using (auth.uid() = owner_id);

drop policy if exists "пишет в свою книгу" on public.address_book;
create policy "пишет в свою книгу" on public.address_book
  for insert with check (auth.uid() = owner_id);

drop policy if exists "правит свою книгу" on public.address_book;
create policy "правит свою книгу" on public.address_book
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "убирает из своей книги" on public.address_book;
create policy "убирает из своей книги" on public.address_book
  for delete using (auth.uid() = owner_id);

grant select, insert, update, delete on public.address_book to authenticated;
