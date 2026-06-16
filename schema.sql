-- ============================================================================
-- TrendHub Schema for Supabase - Complete PostgreSQL & Storage Setup
-- ============================================================================
-- PART 1: ENABLE EXTENSIONS
-- ============================================================================
create extension if not exists "pgcrypto";

-- ============================================================================
-- PART 2: CREATE TABLES (PostgreSQL)
-- ============================================================================

-- Profiles (one per auth user)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  bio text,
  avatar_url text,
  website text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Communities
create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  category text not null,
  image_url text,
  status text not null default 'active' check (status in ('active','paused','ended')),
  rules text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Community members
create table if not exists community_members (
  community_id uuid not null references communities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (community_id, user_id)
);

-- Posts
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  community_id uuid references communities(id) on delete set null,
  content text not null,
  media_url text,
  media_type text check (media_type in ('image','video')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Likes (unique per user+post)
create table if not exists likes (
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

-- Comments
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- Follows (follower -> following)
create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);

-- Messages (direct messages)
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  receiver_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  read boolean not null default false,
  created_at timestamptz default now()
);

-- Enable realtime for the messages table (required for live chat updates)
alter publication supabase_realtime add table public.messages;

-- ============================================================================
-- PART 3: ENABLE ROW LEVEL SECURITY (RLS) ON TABLES
-- ============================================================================

-- Profiles - PUBLIC READ (for discovery), users can update own
alter table profiles enable row level security;
drop policy if exists "Public read profiles" on profiles;
drop policy if exists "Users can insert own profile" on profiles;
drop policy if exists "Users can update own profile" on profiles;
drop policy if exists "Users can delete own profile" on profiles;
create policy "Public read profiles" on profiles for select using (true);
create policy "Users can insert own profile" on profiles for insert with check (auth.role() = 'authenticated' AND id = auth.uid());
create policy "Users can update own profile" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can delete own profile" on profiles for delete using (auth.uid() = id);

-- Communities - PUBLIC READ
alter table communities enable row level security;
drop policy if exists "Public read communities" on communities;
drop policy if exists "Create community (authenticated)" on communities;
drop policy if exists "Update own community" on communities;
drop policy if exists "Delete own community" on communities;
create policy "Public read communities" on communities for select using (true);
create policy "Create community (authenticated)" on communities for insert with check (auth.role() = 'authenticated' AND creator_id = auth.uid());
create policy "Update own community" on communities for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy "Delete own community" on communities for delete using (creator_id = auth.uid());

-- Community members - PUBLIC READ
alter table community_members enable row level security;
drop policy if exists "Members: read" on community_members;
drop policy if exists "Members: join" on community_members;
drop policy if exists "Members: leave" on community_members;
create policy "Members: read" on community_members for select using (true);
create policy "Members: join" on community_members for insert with check (auth.role() = 'authenticated' AND user_id = auth.uid());
create policy "Members: leave" on community_members for delete using (user_id = auth.uid());

-- Posts - PUBLIC READ (all can see), only author can modify
alter table posts enable row level security;
drop policy if exists "Public read posts" on posts;
drop policy if exists "Create post (auth)" on posts;
drop policy if exists "Update own post" on posts;
drop policy if exists "Delete own post" on posts;
create policy "Public read posts" on posts for select using (true);
create policy "Create post (auth)" on posts for insert with check (auth.role() = 'authenticated' AND author_id = auth.uid());
create policy "Update own post" on posts for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "Delete own post" on posts for delete using (author_id = auth.uid());

-- Likes - PUBLIC READ
alter table likes enable row level security;
drop policy if exists "Read likes" on likes;
drop policy if exists "Insert like (self)" on likes;
drop policy if exists "Remove like (self)" on likes;
create policy "Read likes" on likes for select using (true);
create policy "Insert like (self)" on likes for insert with check (auth.role() = 'authenticated' AND user_id = auth.uid());
create policy "Remove like (self)" on likes for delete using (user_id = auth.uid());

-- Comments - PUBLIC READ
alter table comments enable row level security;
drop policy if exists "Read comments" on comments;
drop policy if exists "Create comment (auth)" on comments;
drop policy if exists "Update own comment" on comments;
drop policy if exists "Delete own comment" on comments;
create policy "Read comments" on comments for select using (true);
create policy "Create comment (auth)" on comments for insert with check (auth.role() = 'authenticated' AND author_id = auth.uid());
create policy "Update own comment" on comments for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "Delete own comment" on comments for delete using (author_id = auth.uid());

-- Follows - PUBLIC READ
alter table follows enable row level security;
drop policy if exists "Read follows" on follows;
drop policy if exists "Follow (self)" on follows;
drop policy if exists "Unfollow (self)" on follows;
create policy "Read follows" on follows for select using (true);
create policy "Follow (self)" on follows for insert with check (auth.role() = 'authenticated' AND follower_id = auth.uid());
create policy "Unfollow (self)" on follows for delete using (follower_id = auth.uid());

-- Messages - PRIVATE (only participants)
alter table messages enable row level security;
drop policy if exists "Users can see own messages" on messages;
drop policy if exists "Send message (auth)" on messages;
drop policy if exists "Mark read (receiver)" on messages;
drop policy if exists "Delete message (sender or receiver)" on messages;
create policy "Users can see own messages" on messages for select using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy "Send message (auth)" on messages for insert with check (auth.role() = 'authenticated' AND sender_id = auth.uid());
create policy "Mark read (receiver)" on messages for update using (receiver_id = auth.uid()) with check (receiver_id = auth.uid());
create policy "Delete message (sender or receiver)" on messages for delete using (sender_id = auth.uid() or receiver_id = auth.uid());

-- ============================================================================
-- PART 4: CREATE STORAGE BUCKETS (via SQL)
-- ============================================================================
-- Insert storage buckets directly
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  ('post-media', 'post-media', true, 52428800, array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']),
  ('community-images', 'community-images', true, 52428800, array['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

-- ============================================================================
-- PART 5: ENABLE RLS ON STORAGE BUCKETS
-- ============================================================================

-- Avatars bucket - public read, authenticated can upload own, only owner can delete
drop policy if exists "Public read avatars" on storage.objects;
drop policy if exists "Users can upload own avatar" on storage.objects;
drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Public read avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "Users can upload own avatar" on storage.objects for insert with check (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Users can delete own avatar" on storage.objects for delete using (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Post media bucket - public read, authenticated can upload, only author can delete
drop policy if exists "Public read post-media" on storage.objects;
drop policy if exists "Users can upload post-media" on storage.objects;
drop policy if exists "Users can delete own post-media" on storage.objects;
create policy "Public read post-media" on storage.objects for select using (bucket_id = 'post-media');
create policy "Users can upload post-media" on storage.objects for insert with check (
  bucket_id = 'post-media'
  AND auth.role() = 'authenticated'
);
create policy "Users can delete own post-media" on storage.objects for delete using (
  bucket_id = 'post-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Community images bucket - public read, authenticated community creators can upload
drop policy if exists "Public read community-images" on storage.objects;
drop policy if exists "Users can upload community images" on storage.objects;
drop policy if exists "Community creators can delete community images" on storage.objects;
create policy "Public read community-images" on storage.objects for select using (bucket_id = 'community-images');
create policy "Users can upload community images" on storage.objects for insert with check (
  bucket_id = 'community-images'
  AND auth.role() = 'authenticated'
);
create policy "Community creators can delete community images" on storage.objects for delete using (
  bucket_id = 'community-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- PART 6: OPTIONAL - AUTO-CREATE PROFILE TRIGGER
-- ============================================================================
-- Remove any existing auth.users trigger before proceeding.
-- This avoids signup failures caused by problematic trigger behavior.

drop trigger if exists handle_new_user_trigger on auth.users;
drop function if exists public.handle_new_user;

-- The auth.users trigger can cause signup failures in Supabase depending on
-- permissions and auth configuration. We recommend creating profiles from the
-- frontend after signup instead of using a database trigger.
--
-- If you want to enable this behavior manually, uncomment the block below
-- and ensure your Supabase permissions allow inserts into `profiles` from the
-- trigger's executing role.
--
-- create or replace function public.handle_new_user()
-- returns trigger language plpgsql security definer as $$
-- declare
--   new_username text;
--   base_username text;
--   counter int := 0;
-- begin
--   -- Extract username from email (before @)
--   base_username := lower(split_part(new.email, '@', 1));
--   new_username := base_username;
--   
--   -- Try to ensure unique username
--   while exists(select 1 from profiles where username = new_username) and counter < 100 loop
--     counter := counter + 1;
--     new_username := base_username || counter::text;
--   end loop;
--   
--   insert into profiles (id, username, display_name, created_at, updated_at)
--   values (new.id, new_username, new_username, now(), now())
--   on conflict (id) do update set
--     updated_at = now()
--   where profiles.id = new.id;
--   
--   return new;
-- end;
-- $$;
--
-- drop trigger if exists handle_new_user_trigger on auth.users;
--
-- create trigger handle_new_user_trigger
-- after insert on auth.users
-- for each row execute function public.handle_new_user();
--
-- ============================================================================
-- PART 7: BACKFILL PROFILES FOR EXISTING USERS
-- ============================================================================
-- Create profiles for any existing auth users who don't have one yet
insert into profiles (id, username, display_name, created_at, updated_at)
select 
  u.id, 
  lower(split_part(u.email, '@', 1)) || '_' || substring(u.id::text, 1, 8),
  lower(split_part(u.email, '@', 1)) || '_' || substring(u.id::text, 1, 8),
  u.created_at,
  u.created_at
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id)
on conflict (id) do nothing;
