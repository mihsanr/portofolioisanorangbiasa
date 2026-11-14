-- Pemburu Kaset leaderboard — schema for Supabase.
-- Safe to run more than once (SQL editor or `supabase db query`). Independent of waitlist.sql,
-- but shares private.config (the IP salt) with it.
--
-- Public (anon key) can only call:
--   game_start_run()                      when the stopwatch starts
--   game_finish_run(run)                  the moment the last cassette is collected
--   game_submit_run(run, name, ms, ...)   when the player sends a name
--   game_top_scores(limit)                to read the board
-- Both tables have RLS on and no policies, so rows are never readable or writable from the browser.
--
-- What this does and does not protect against. A browser game cannot be made cheat-proof:
-- the client reports its own time. The server therefore keeps its own clock for every run and
-- only accepts a time that agrees with it. A forged request still has to wait out the real
-- duration between start and finish, cannot beat the level minimum, cannot reuse a run, and is
-- rate-limited per IP. That keeps casual tampering off the board; it is not tournament-grade.

-- ============ TABLES ============
create table if not exists public.game_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  used        boolean not null default false,
  ip_hash     text
);
create index if not exists game_runs_ip_started_idx on public.game_runs (ip_hash, started_at);
create index if not exists game_runs_started_idx on public.game_runs (started_at);

create table if not exists public.game_scores (
  id         bigint generated always as identity primary key,
  name       text not null check (name ~ '^[A-Z0-9 _.-]{1,12}$'),
  time_ms    integer not null check (time_ms between 20000 and 3600000),
  falls      integer not null default 0 check (falls between 0 and 500),
  created_at timestamptz not null default now(),
  ip_hash    text
);
create index if not exists game_scores_time_idx on public.game_scores (time_ms, created_at);
create index if not exists game_scores_ip_created_idx on public.game_scores (ip_hash, created_at);

-- ============ PRIVATE (not exposed by the API) ============
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.config (
  key   text primary key,
  value text not null
);
revoke all on private.config from public, anon, authenticated;
insert into private.config (key, value)
values ('ip_salt', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Salted hash of the caller's IP (Cloudflare header, which clients cannot forge).
-- Null outside HTTP (SQL editor), which disables the rate limits there.
create or replace function private.game_ip_hash()
returns text
language sql stable security definer
set search_path = ''
as $$
  select encode(sha256(convert_to(c.value || '|' || h.ip, 'UTF8')), 'hex')
  from private.config c,
       (select nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip' as ip) h
  where c.key = 'ip_salt' and h.ip is not null;
$$;
revoke all on function private.game_ip_hash() from public, anon, authenticated;

-- ============ ROW LEVEL SECURITY ============
alter table public.game_runs enable row level security;
alter table public.game_scores enable row level security;
revoke all on public.game_runs from anon, authenticated;
revoke all on public.game_scores from anon, authenticated;

-- ============ RPC: start ============
create or replace function public.game_start_run()
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  c_per_ip constant integer  := 60;                  -- runs per IP (shared mobile IPs: keep it loose) ...
  c_win    constant interval := interval '1 hour';   -- ... within this window
  v_hash text;
  v_id   uuid;
begin
  v_hash := private.game_ip_hash();
  if v_hash is not null
     and (select count(*) from public.game_runs r
          where r.ip_hash = v_hash and r.started_at > now() - c_win) >= c_per_ip then
    raise exception 'rate-limited';
  end if;
  delete from public.game_runs r where r.started_at < now() - interval '1 day';   -- housekeeping
  insert into public.game_runs (ip_hash) values (v_hash) returning id into v_id;
  return v_id;
end;
$$;

-- ============ RPC: finish ============
-- Stamps the server's own finish time, once. Returns false for an unknown or already finished run.
create or replace function public.game_finish_run(p_run uuid)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.game_runs r set finished_at = now()
  where r.id = p_run and r.finished_at is null and r.used = false;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- ============ RPC: submit ============
-- p_ms is the player's stopwatch time including penalties (2000 ms per fall).
-- Raises: unknown-run, incomplete, implausible, rate-limited.
create or replace function public.game_submit_run(p_run uuid, p_name text, p_ms integer, p_tapes integer, p_falls integer default 0)
returns table (rank integer, time_ms integer)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  c_tapes    constant integer  := 20;       -- cassettes in the level
  c_min_ms   constant integer  := 25000;    -- nobody finishes the loop faster than this
  c_penalty  constant integer  := 2000;     -- per fall, added by the client stopwatch
  c_late_ms  constant integer  := 2500;     -- stopwatch may run ahead of the server by network jitter
  c_pause_ms constant integer  := 6000;     -- stopwatch may run behind (tab hidden briefly, latency)
  c_per_ip   constant integer  := 8;        -- scores per IP ...
  c_win      constant interval := interval '1 hour';   -- ... within this window
  v_started  timestamptz;
  v_finished timestamptz;
  v_used     boolean;
  v_elapsed  integer;
  v_play     integer;
  v_name     text;
  v_hash     text;
begin
  select r.started_at, r.finished_at, r.used into v_started, v_finished, v_used
  from public.game_runs r where r.id = p_run for update;
  if v_started is null or v_finished is null or v_used then
    raise exception 'unknown-run';
  end if;
  if p_tapes is distinct from c_tapes then
    raise exception 'incomplete';
  end if;
  if p_ms is null or p_falls is null or p_falls < 0 or p_falls > 500 then
    raise exception 'implausible';
  end if;

  v_elapsed := (extract(epoch from (v_finished - v_started)) * 1000)::integer;
  v_play := p_ms - p_falls * c_penalty;          -- time actually spent playing
  if v_play < c_min_ms or v_play > v_elapsed + c_late_ms or v_play < v_elapsed - c_pause_ms then
    raise exception 'implausible';
  end if;

  v_name := left(upper(btrim(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9 _.-]', '', 'g'))), 12);
  v_name := btrim(v_name);
  if v_name = ''
     or v_name ~* '(anjing|anjg|bangsat|kontol|memek|ngentot|jancok|jancuk|goblok|tolol|pepek|fuck|shit|bitch|nigg|penis|vagina)' then
    v_name := 'PEMAIN';
  end if;

  v_hash := private.game_ip_hash();
  if v_hash is not null
     and (select count(*) from public.game_scores s
          where s.ip_hash = v_hash and s.created_at > now() - c_win) >= c_per_ip then
    raise exception 'rate-limited';
  end if;

  update public.game_runs r set used = true where r.id = p_run;
  insert into public.game_scores (name, time_ms, falls, ip_hash) values (v_name, p_ms, p_falls, v_hash);

  return query
    select ((select count(*) from public.game_scores s where s.time_ms < p_ms) + 1)::integer, p_ms;
end;
$$;

-- ============ RPC: board ============
create or replace function public.game_top_scores(p_limit integer default 10)
returns table (name text, time_ms integer, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select s.name, s.time_ms, s.created_at
  from public.game_scores s
  order by s.time_ms, s.created_at
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- ============ GRANTS ============
revoke all on function public.game_start_run() from public;
revoke all on function public.game_finish_run(uuid) from public;
revoke all on function public.game_submit_run(uuid, text, integer, integer, integer) from public;
revoke all on function public.game_top_scores(integer) from public;
grant execute on function public.game_start_run() to anon, authenticated;
grant execute on function public.game_finish_run(uuid) to anon, authenticated;
grant execute on function public.game_submit_run(uuid, text, integer, integer, integer) to anon, authenticated;
grant execute on function public.game_top_scores(integer) to anon, authenticated;
