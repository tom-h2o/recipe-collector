-- Security review of 2026-11-26: the database half of the fixes.
--
-- Each section names the finding it closes (B = blocker, S = should, N = nice
-- to have). supabase/tests/security_review.test.sql tries every one of these
-- as a signed-in user or as anon, which is the only way to see a policy work:
-- the service key bypasses all of it.

-- ── B1: account links can no longer be forged ───────────────────────────────
-- The policies only asked "are you a party to this row?", so anyone could
-- insert a row that was already `accepted` with any addressee_id, or turn their
-- own invitation into one, and read that person's whole vault. Now:
--   * an invitation can only be created pending, unaddressed, from your own
--     address, to somebody else's;
--   * an update can only touch the two label columns (column privileges), and
--     each side only its own label (trigger);
--   * accepting happens only in accept_account_link(), which checks that the
--     invitation was addressed to the caller's confirmed email address.

drop policy if exists "account_links_insert" on public.account_links;
create policy "account_links_insert"
  on public.account_links for insert
  to authenticated
  with check (
    auth.uid() = requester_id
    and status = 'pending'
    and addressee_id is null
    and accepted_at is null
    and addressee_label is null
    and lower(requester_email) = lower(auth.email())
    and lower(addressee_email) <> lower(auth.email())
  );

-- Row-level: still any party. Column-level: labels only. Status, ids, emails
-- and accepted_at are out of reach of the browser altogether.
revoke update on public.account_links from anon, authenticated;
grant update (requester_label, addressee_label) on public.account_links to authenticated;

-- Each side names the other; neither may rename itself in the other's list.
create or replace function public.account_links_guard_labels()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- No signed-in user: the service key or a migration. Nothing to guard.
  if auth.uid() is null then
    return new;
  end if;
  if new.requester_label is distinct from old.requester_label
     and auth.uid() is distinct from old.requester_id then
    raise exception 'Only the person who sent the invitation can change that name'
      using errcode = '42501';
  end if;
  if new.addressee_label is distinct from old.addressee_label
     and auth.uid() = old.requester_id then
    raise exception 'Only the person who was invited can change that name'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists account_links_guard_labels on public.account_links;
create trigger account_links_guard_labels
  before update on public.account_links
  for each row execute function public.account_links_guard_labels();

-- Accepting an invitation. SECURITY DEFINER because the caller can no longer
-- write status or addressee_id; everything it may do is checked here.
create or replace function public.accept_account_link(link_id uuid)
returns public.account_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  link public.account_links;
begin
  if caller is null then
    raise exception 'Sign in to accept an invitation' using errcode = '42501';
  end if;

  -- From auth.users rather than the token, so a confirmed address is required:
  -- invitations are addressed by email, and an unconfirmed one proves nothing.
  select u.email into caller_email
    from auth.users u
   where u.id = caller
     and u.email_confirmed_at is not null;
  if caller_email is null then
    raise exception 'Confirm your email address before accepting an invitation'
      using errcode = '42501';
  end if;

  update public.account_links l
     set addressee_id = caller,
         status = 'accepted',
         accepted_at = timezone('utc', now())
   where l.id = link_id
     and l.status = 'pending'
     and lower(l.addressee_email) = lower(caller_email)
     and l.requester_id <> caller
  returning * into link;

  if link.id is null then
    raise exception 'This invitation does not exist, was not sent to you, or was already answered'
      using errcode = 'P0002';
  end if;
  return link;
end;
$$;

revoke all on function public.accept_account_link(uuid) from public, anon;
grant execute on function public.accept_account_link(uuid) to authenticated;

-- ── N4: the invitee can decline ─────────────────────────────────────────────
-- Declining deletes the row, but the delete policy only knew the ids, and a
-- pending invitee has no addressee_id yet: "Decline" matched nothing and
-- reported success.
drop policy if exists "account_links_delete" on public.account_links;
create policy "account_links_delete"
  on public.account_links for delete
  to authenticated
  using (
    auth.uid() = requester_id
    or auth.uid() = addressee_id
    or (status = 'pending' and lower(addressee_email) = lower(auth.email()))
  );

-- ── S6: linked_user_ids() answers for the caller only ───────────────────────
-- linked_user_ids(for_user) told anyone who any user was linked with, and
-- Supabase's default privileges left it executable by anon. The policies only
-- ever asked about auth.uid(), so the parameter goes.
create or replace function public.linked_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when l.requester_id = auth.uid() then l.addressee_id
              else l.requester_id end
    from public.account_links l
   where l.status = 'accepted'
     and l.addressee_id is not null
     and (l.requester_id = auth.uid() or l.addressee_id = auth.uid())
$$;

revoke all on function public.linked_user_ids() from public, anon;
grant execute on function public.linked_user_ids() to authenticated;

drop policy if exists "recipes_select" on public.recipes;
create policy "recipes_select"
  on public.recipes for select
  to authenticated
  using (
    auth.uid() = user_id
    or user_id in (select public.linked_user_ids())
  );

drop policy if exists "recipe_images_select" on public.recipe_images;
create policy "recipe_images_select"
  on public.recipe_images for select
  to authenticated
  using (
    auth.uid() = user_id
    or user_id in (select public.linked_user_ids())
  );

drop policy if exists "translations_select" on public.recipe_translations;
create policy "translations_select"
  on public.recipe_translations for select
  to authenticated
  using (
    exists (
      select 1
        from public.recipes r
       where r.id = recipe_translations.recipe_id
         and (r.user_id = auth.uid() or r.user_id in (select public.linked_user_ids()))
    )
  );

drop policy if exists "recipe_ratings_select" on public.recipe_ratings;
create policy "recipe_ratings_select"
  on public.recipe_ratings for select
  to authenticated
  using (
    user_id = auth.uid()
    or user_id in (select public.linked_user_ids())
  );

-- ── N6: match_recipes works, and only the server may call it ────────────────
-- It declared `title varchar` over a `text` column, which Postgres refuses on
-- every call ("structure of query does not match function result type"), so
-- Suggest has always fallen back to string matching. The server calls it with
-- the service key, which bypasses RLS, so the link check is written out here
-- rather than borrowed from linked_user_ids(). Return type changes need a drop.
drop function if exists public.match_recipes(vector, double precision, integer, uuid);
create function public.match_recipes(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_user_id uuid
)
returns table (
  id uuid,
  title text,
  description text,
  ingredients jsonb,
  similarity float
)
language sql
stable
-- `vector` and its <=> operator live in public here; extensions is listed in
-- case a project installed pgvector there instead.
set search_path = public, extensions
as $$
  select r.id, r.title, r.description, r.ingredients,
         1 - (r.embedding <=> query_embedding) as similarity
    from public.recipes r
   where r.embedding is not null
     and (
       r.user_id = filter_user_id
       or r.user_id in (
         select case when l.requester_id = filter_user_id then l.addressee_id else l.requester_id end
           from public.account_links l
          where l.status = 'accepted'
            and (l.requester_id = filter_user_id or l.addressee_id = filter_user_id)
       )
     )
     and 1 - (r.embedding <=> query_embedding) > match_threshold
   order by r.embedding <=> query_embedding
   limit match_count
$$;

revoke all on function public.match_recipes(vector, double precision, integer, uuid) from public, anon, authenticated;
grant execute on function public.match_recipes(vector, double precision, integer, uuid) to service_role;

-- Every policy that called the old function now calls the one above.
drop function if exists public.linked_user_ids(uuid);

-- ── B2: a received share cannot be repointed ────────────────────────────────
-- The recipient could update any column of their share row, change recipe_id
-- to any recipe, then accept: the server copied whatever it pointed at with the
-- service key. Accepting and declining go through /api/share, which uses the
-- service key, so the browser needs no update right at all.
drop policy if exists "shares_recipient_update" on public.recipe_shares;

-- ── S1: the photo bucket cannot be listed ───────────────────────────────────
-- `to public` let anyone, signed in or not, list every file in the bucket and
-- so find photos of private recipes. The bucket stays public, so a photo's
-- address keeps working for whoever has it; listing and the API's own reads
-- are left to the owner, which deleting one's own upload still needs.
drop policy if exists "recipe_images_select" on storage.objects;
create policy "recipe_images_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'recipe-images' and owner = auth.uid());

-- ── S2: gallery rows only on your own recipes ───────────────────────────────
-- Insert and update checked only that the image row was yours, not that the
-- recipe was, so anyone could hang pictures on someone else's recipe, including
-- on its public page.
drop policy if exists "recipe_images_insert" on public.recipe_images;
create policy "recipe_images_insert"
  on public.recipe_images for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
  );

drop policy if exists "recipe_images_update" on public.recipe_images;
create policy "recipe_images_update"
  on public.recipe_images for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
  );

drop policy if exists "recipe_images_delete" on public.recipe_images;
create policy "recipe_images_delete"
  on public.recipe_images for delete
  to authenticated
  using (auth.uid() = user_id);

-- And the public page shows only the owner's pictures, whatever is in the table.
create or replace function public.get_shared_recipe_images(p_token uuid)
returns table (
  url text,
  source text,
  sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.url, i.source, i.sort_order
    from public.recipe_images i
    join public.recipes r on r.id = i.recipe_id
   where r.public_share_token = p_token
     and p_token is not null
     and i.user_id = r.user_id
   order by i.sort_order, i.created_at;
$$;

-- ── N1: the public page does not hand out the recipe id ─────────────────────
-- Neither the page nor the preview uses it, and an id was what B2 needed. Same
-- function as 0061 otherwise; a changed return type needs a drop.
drop function if exists public.get_shared_recipe(uuid);
create function public.get_shared_recipe(p_token uuid)
returns table (
  title text,
  description text,
  ingredients jsonb,
  instructions text,
  image_url text,
  servings integer,
  tags text[],
  nutrition jsonb,
  prep_time_mins integer,
  cook_time_mins integer,
  source_url text,
  source_name text,
  original_servings integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.title,
    r.description,
    r.ingredients,
    r.instructions,
    r.image_url,
    r.servings,
    r.tags,
    r.nutrition,
    r.prep_time_mins,
    r.cook_time_mins,
    r.source_url,
    r.source_name,
    r.original_servings,
    r.created_at
  from public.recipes r
  where r.public_share_token = p_token
    and p_token is not null
  limit 1;
$$;

revoke all on function public.get_shared_recipe(uuid) from public;
grant execute on function public.get_shared_recipe(uuid) to anon, authenticated;

-- ── S3: the daily AI allowance is counted before the call, atomically ───────
-- It was counted from gemini_logs rows, and a row is written only once the
-- answer is in, up to two minutes later, so parallel requests all saw the same
-- count and all went through. Now each call takes one unit from today's row
-- here first; the row lock makes concurrent calls queue, so the limit holds.
-- gemini_logs stays the record of what ran.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The UTC day, like the reset the app announces ("resets at midnight UTC").
  day date not null,
  -- 'ai' for the AI allowance; an endpoint with a budget of its own uses its
  -- name ('find-image').
  bucket text not null,
  used integer not null default 0,
  primary key (user_id, day, bucket)
);

alter table public.ai_usage enable row level security;

-- Read your own, for the meter in Settings. Only consume_ai_call writes.
create policy "ai_usage_select"
  on public.ai_usage for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.consume_ai_call(
  p_user_id uuid,
  p_bucket text,
  p_limit integer,
  -- Endpoints that never counted against the 'ai' bucket (shared/usage.ts),
  -- for seeding today's row from the log on the day this ships.
  p_excluded text[] default '{}'
)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  today date := (now() at time zone 'utc')::date;
  taken integer;
begin
  -- The first call of the day starts from what the log already holds, so the
  -- switch from counting rows does not hand out a fresh hundred mid-day.
  if not exists (
    select 1 from public.ai_usage u
     where u.user_id = p_user_id and u.day = today and u.bucket = p_bucket
  ) then
    insert into public.ai_usage (user_id, day, bucket, used)
    select p_user_id, today, p_bucket, count(*)::integer
      from public.gemini_logs g
     where g.user_id = p_user_id
       and g.created_at >= (today::timestamp at time zone 'utc')
       and case when p_bucket = 'ai' then not (g.endpoint = any (p_excluded))
                else g.endpoint = p_bucket end
    on conflict do nothing;
  end if;

  update public.ai_usage u
     set used = u.used + 1
   where u.user_id = p_user_id and u.day = today and u.bucket = p_bucket
     and u.used < p_limit
  returning u.used into taken;

  if taken is null then
    return query
      select false, u.used from public.ai_usage u
       where u.user_id = p_user_id and u.day = today and u.bucket = p_bucket;
  else
    return query select true, taken;
  end if;
end;
$$;

revoke all on function public.consume_ai_call(uuid, text, integer, text[]) from public, anon, authenticated;
grant execute on function public.consume_ai_call(uuid, text, integer, text[]) to service_role;

-- ── N7: pantry items can be edited, and functions have a fixed search_path ──
drop policy if exists "pantry_update" on public.pantry_items;
create policy "pantry_update"
  on public.pantry_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Both bodies name their tables with the schema already.
alter function public.cleanup_old_gemini_logs() set search_path = '';
alter function public.cleanup_gemini_logs_trigger() set search_path = '';

-- ── N5: every recipe, plan entry and list item has an owner ─────────────────
-- 0040 already refused to run while any row had none, and every write path
-- sets one, so this only writes down what is true. Guarded all the same: a
-- stray row should cost this one constraint, not the security fixes above.
do $$
begin
  if exists (select 1 from public.recipes where user_id is null) then
    raise notice 'recipes has rows without user_id; NOT NULL not set';
  else
    alter table public.recipes alter column user_id set not null;
  end if;
  if exists (select 1 from public.meal_plan where user_id is null) then
    raise notice 'meal_plan has rows without user_id; NOT NULL not set';
  else
    alter table public.meal_plan alter column user_id set not null;
  end if;
  if exists (select 1 from public.shopping_list where user_id is null) then
    raise notice 'shopping_list has rows without user_id; NOT NULL not set';
  else
    alter table public.shopping_list alter column user_id set not null;
  end if;
end $$;
