-- Next Up waitlist — Phase 2 schema for Supabase.
-- Safe to run more than once (SQL editor or `supabase db query`).
--
-- Public (anon key) can only: read `ideas`, call list_waitlist(), call join_waitlist().
-- `votes` has RLS on and no policies, so voter ids are never readable from the browser.
-- Only the anon / publishable key goes in the frontend — never the service_role / secret key.
-- Anti-spam: join_waitlist() rate-limits per client IP (Cloudflare cf-connecting-ip, which
-- clients cannot forge). IPs are stored only as a salted SHA-256 hash.

-- ============ TABLES ============
create table if not exists public.ideas (
  id          text primary key check (id ~ '^[a-z0-9-]{1,64}$'),
  title       text not null,
  type        text,
  price       text,
  description text,
  status      text not null default 'voting'
              check (status in ('voting', 'in_production', 'done')),
  seed        integer not null default 0 check (seed >= 0),
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.votes (
  idea_id    text not null references public.ideas (id) on delete cascade,
  voter_id   uuid not null,
  created_at timestamptz not null default now(),
  primary key (idea_id, voter_id)   -- one vote per browser per idea
);

-- salted hash of the voter's IP, only used for rate limiting
alter table public.votes add column if not exists ip_hash text;
create index if not exists votes_ip_hash_created_idx on public.votes (ip_hash, created_at);

-- ============ PRIVATE (not exposed by the API) ============
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.config (
  key   text primary key,
  value text not null
);
revoke all on private.config from public, anon, authenticated;
-- random per-project salt, so stored hashes cannot be reversed by trying every IPv4
insert into private.config (key, value)
values ('ip_salt', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- ============ ROW LEVEL SECURITY ============
alter table public.ideas enable row level security;
alter table public.votes enable row level security;

drop policy if exists "ideas are public" on public.ideas;
create policy "ideas are public" on public.ideas
  for select to anon, authenticated using (true);

revoke all on public.votes from anon, authenticated;
revoke insert, update, delete, truncate on public.ideas from anon, authenticated;
grant select on public.ideas to anon, authenticated;

-- ============ RPC: list ============
-- joined = this voter already has a vote on the idea (server is the source of truth).
drop function if exists public.list_waitlist();  -- first draft had no argument
create or replace function public.list_waitlist(voter_id uuid default null)
returns table (
  id text, title text, type text, price text, description text,
  status text, sort integer, count integer, joined boolean
)
language sql stable security definer
set search_path = ''
as $$
  select i.id, i.title, i.type, i.price, i.description, i.status, i.sort,
         (i.seed + (select count(*) from public.votes v where v.idea_id = i.id))::integer,
         exists (select 1 from public.votes v
                 where v.idea_id = i.id and v.voter_id = list_waitlist.voter_id)
  from public.ideas i
  order by i.sort, i.created_at;
$$;

-- ============ RPC: join ============
-- Returns the idea's new count; joined = false when this voter was already on the list.
-- Raises 'rate-limited' when one IP adds too many votes (limits below).
create or replace function public.join_waitlist(idea_id text, voter_id uuid)
returns table (id text, count integer, joined boolean)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  -- rate limits per IP (many Indonesian mobile users share one IP via CGNAT — keep it loose)
  c_per_idea  constant integer  := 5;                    -- votes on one idea ...
  c_idea_win  constant interval := interval '24 hours';  -- ... within this window
  c_per_ip    constant integer  := 10;                   -- votes across all ideas ...
  c_ip_win    constant interval := interval '1 hour';    -- ... within this window
  v_status   text;
  v_ip       text;
  v_ip_hash  text;
  v_inserted integer;
begin
  select i.status into v_status
  from public.ideas i
  where i.id = join_waitlist.idea_id;

  if v_status is null then
    raise exception 'unknown-idea';
  elsif v_status <> 'voting' then
    raise exception 'closed';
  end if;

  -- set by Cloudflare in front of Supabase; absent outside HTTP (SQL editor) → no limit
  v_ip := nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip';
  if v_ip is not null then
    select encode(sha256(convert_to(c.value || '|' || v_ip, 'UTF8')), 'hex') into v_ip_hash
    from private.config c
    where c.key = 'ip_salt';

    -- a repeat vote from the same browser is a no-op, so only new votes count
    if not exists (select 1 from public.votes v
                   where v.idea_id = join_waitlist.idea_id and v.voter_id = join_waitlist.voter_id)
       and ((select count(*) from public.votes v
             where v.ip_hash = v_ip_hash and v.idea_id = join_waitlist.idea_id
               and v.created_at > now() - c_idea_win) >= c_per_idea
         or (select count(*) from public.votes v
             where v.ip_hash = v_ip_hash and v.created_at > now() - c_ip_win) >= c_per_ip)
    then
      raise exception 'rate-limited';
    end if;
  end if;

  insert into public.votes (idea_id, voter_id, ip_hash)
  values (join_waitlist.idea_id, join_waitlist.voter_id, v_ip_hash)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  return query
    select i.id,
           (i.seed + (select count(*) from public.votes v where v.idea_id = i.id))::integer,
           v_inserted = 1
    from public.ideas i
    where i.id = join_waitlist.idea_id;
end;
$$;

revoke all on function public.list_waitlist(uuid) from public;
revoke all on function public.join_waitlist(text, uuid) from public;
grant execute on function public.list_waitlist(uuid) to anon, authenticated;
grant execute on function public.join_waitlist(text, uuid) to anon, authenticated;

-- ============ SEED (same ideas as js/waitlist-data.js) ============
insert into public.ideas (id, title, type, price, description, status, seed, sort) values
  ('claude-motion-workflow', 'Motion Design Workflow with Claude', 'Web App · BYOK', 'FREE',
   'A web-based motion design workflow powered by Claude — bring your own API key.', 'voting', 0, 1),
  ('solo-streamer-kit', 'Solo Streamer Kit', 'Bundle', 'BUNDLE',
   'Everything a solo streamer needs to look like a full production team.', 'voting', 0, 2),
  ('ae-animated-caption', 'Animated Caption', 'After Effects Plugin', 'FREE',
   'Free After Effects plugin for animated, styled captions in a few clicks.', 'voting', 0, 3)
on conflict (id) do nothing;
