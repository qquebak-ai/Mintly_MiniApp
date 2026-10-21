-- Галочка «проверенное лицо» у X-аккаунта и заявки на неё.
alter table public.profiles add column if not exists mail_2fa boolean not null default false;
alter table public.profiles add column if not exists x_person_verified boolean not null default false;
alter table public.profiles add column if not exists x_person_verified_at timestamptz;

create table if not exists public.x_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  handle text not null,
  full_name text not null,
  proof_url text not null,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);
-- Анкета: сколько читателей и чем человек занимается.
alter table public.x_verification_requests add column if not exists audience bigint;
alter table public.x_verification_requests add column if not exists activity text;
create index if not exists x_verification_requests_user on public.x_verification_requests(user_id, created_at desc);
-- Пишет и читает только сервер (service_role): из браузера таблица закрыта.
alter table public.x_verification_requests enable row level security;

-- Браузер не может выдать галочку сам себе: колонки держит триггер.
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
  new.x_person_verified := old.x_person_verified;
  new.x_person_verified_at := old.x_person_verified_at;
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
