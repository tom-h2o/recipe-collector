-- Recipe sharing between users

create table public.recipe_shares (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,              -- original recipe (no FK so deleting recipe doesn't break inbox)
  recipe_title text not null,           -- snapshot for inbox display
  recipe_description text,
  recipe_image_url text,
  sender_id uuid references auth.users(id) on delete cascade not null,
  sender_email text not null,
  recipient_email text not null,        -- looked up by auth.email() in RLS
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz default now()
);

alter table public.recipe_shares enable row level security;

-- Sender can see and delete their own sent shares
create policy "shares_sender_select"
  on public.recipe_shares for select
  using (auth.uid() = sender_id);

create policy "shares_sender_delete"
  on public.recipe_shares for delete
  using (auth.uid() = sender_id);

-- Recipient can see and update (accept/reject) shares sent to their email
create policy "shares_recipient_select"
  on public.recipe_shares for select
  using (auth.email() = recipient_email);

create policy "shares_recipient_update"
  on public.recipe_shares for update
  using (auth.email() = recipient_email);

-- Known contacts per user (for email autocomplete when sending)
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  contact_email text not null,
  created_at timestamptz default now(),
  unique (user_id, contact_email)
);

alter table public.contacts enable row level security;

create policy "contacts_owner"
  on public.contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
