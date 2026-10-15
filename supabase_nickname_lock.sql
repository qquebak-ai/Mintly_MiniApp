-- Никнейм неизменяем. Выполнить один раз в Supabase → SQL Editor.
--
-- Имя выбирается один раз, при создании аккаунта, и дальше не меняется:
-- под ним человека знают в ленте покупок, в чужих профилях и в ссылках
-- приглашений, и подмена имени задним числом ломает всё это разом.
--
-- Приложение поле ника больше не показывает и в update его не кладёт, но
-- этого мало: запрос в базу уходит из браузера, и составить его руками
-- может кто угодно, у кого есть своя сессия. Поэтому запрет стоит здесь,
-- где обойти его нельзя.
--
-- Триггер стоит только на изменение. Создание строки он не трогает: там
-- ник как раз и появляется — из формы, через серверный обработчик.

create or replace function public.lock_nickname()
returns trigger
language plpgsql
as $$
begin
  -- Пустой ник заполнить можно: строку профиля база заводит сама, ещё до
  -- того как человек выбрал имя, и без этого исключения такой аккаунт
  -- навсегда остался бы безымянным.
  if coalesce(old.nickname, '') <> '' and new.nickname is distinct from old.nickname then
    raise exception 'nickname is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_nickname on public.profiles;
create trigger lock_nickname
  before update on public.profiles
  for each row
  execute function public.lock_nickname();

-- Если ник всё-таки нужно поправить руками (скажем, оскорбительное имя),
-- это делается в SQL Editor с временно снятым триггером:
--
--   alter table public.profiles disable trigger lock_nickname;
--   update public.profiles set nickname = 'new_name' where id = '<uuid>';
--   alter table public.profiles enable trigger lock_nickname;
