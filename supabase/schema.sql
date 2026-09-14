-- Palestra — schema Postgres per Supabase (step: sincronizzazione cloud).
-- Rispecchia gli store IndexedDB. Ogni riga appartiene a un utente (auth.uid()).
-- Esegui in Supabase → SQL Editor. RLS attiva: ognuno vede solo i propri dati.

-- ---------- Pianificato (scheda) ----------
create table if not exists programs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  weekday_plan jsonb not null default '{}',   -- { "0": day_id, "1": null, ... } Lun=0
  created_at   timestamptz not null default now()
);

create table if not exists days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  name       text not null,
  muscles    text
);

create table if not exists planned_exercises (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  day_id              uuid not null references days(id) on delete cascade,
  name                text not null,
  muscle              text,
  kind                text not null default 'strength',  -- 'strength' | 'cardio'
  target_sets         int,
  target_reps         int,
  target_weight       numeric,
  rest_sec            int,
  target_duration_sec int,
  ord                 int not null default 0
);

-- ---------- Registrato (diario) ----------
create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  program_id   uuid references programs(id) on delete set null,
  day_id       uuid references days(id) on delete set null,
  day_name     text,
  date         date not null,
  status       text not null default 'planned',  -- planned | active | done | skipped
  started_at   timestamptz,
  ended_at     timestamptz,
  duration_sec int not null default 0,
  note         text default ''
);
create index if not exists sessions_user_date on sessions(user_id, date);

create table if not exists logged_exercises (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  session_id          uuid not null references sessions(id) on delete cascade,
  planned_id          uuid references planned_exercises(id) on delete set null,
  name                text not null,
  muscle              text,
  kind                text not null default 'strength',
  note                text default '',
  ord                 int not null default 0,
  rest_sec            int,
  target_sets         int,
  target_reps         int,
  target_weight       numeric,
  target_duration_sec int
);

create table if not exists logged_sets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  log_exercise_id uuid not null references logged_exercises(id) on delete cascade,
  idx             int not null,
  kind            text not null default 'strength',
  weight          numeric,
  reps            int,
  rpe             int,
  rest_sec        int,
  duration_sec    int,
  distance        numeric,
  done            boolean not null default false
);

create table if not exists bodyweight (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date    date not null,
  kg      numeric not null,
  note    text default '',
  unique (user_id, date)
);

-- ---------- Row Level Security ----------
do $$
declare t text;
begin
  foreach t in array array['programs','days','planned_exercises','sessions',
                           'logged_exercises','logged_sets','bodyweight']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format($f$
      create policy %1$s_owner on %1$I
        using (user_id = auth.uid())
        with check (user_id = auth.uid());
    $f$, t);
  end loop;
end $$;
