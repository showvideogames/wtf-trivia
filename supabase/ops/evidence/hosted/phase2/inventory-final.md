# Hosted inventory ujhwjxjgrygchtnzwvjk — 2026-10-06T16:22:38.974Z

## tables

| table_schema | table_name |
| --- | --- |
| public | accounts |
| public | admins |
| public | game_records |
| public | games |
| public | guest_handoffs |
| public | player_stats |
| public | players |
| public | puzzle_favorite_counts |
| public | puzzle_favorites |
| public | puzzle_stats |
| storage | buckets |
| storage | buckets_analytics |
| storage | buckets_vectors |
| storage | migrations |
| storage | objects |
| storage | s3_multipart_uploads |
| storage | s3_multipart_uploads_parts |
| storage | vector_indexes |

## columns

| table_name | column_name | udt_name | is_nullable | column_default | ordinal_position |
| --- | --- | --- | --- | --- | --- |
| accounts | user_id | uuid | NO |  | 1 |
| accounts | global_user_id | text | NO |  | 2 |
| accounts | created_at | timestamptz | NO | now() | 3 |
| accounts | last_seen_at | timestamptz | NO | now() | 4 |
| admins | user_id | uuid | NO |  | 1 |
| admins | granted_at | timestamptz | NO | now() | 2 |
| game_records | id | int8 | NO |  | 1 |
| game_records | player_id | uuid | NO |  | 2 |
| game_records | game_date | text | NO |  | 3 |
| game_records | theme_title | text | YES |  | 4 |
| game_records | score | int4 | NO | 0 | 5 |
| game_records | total_questions | int4 | NO | 0 | 6 |
| game_records | answers | jsonb | NO | '[]'::jsonb | 7 |
| game_records | completed | bool | NO | false | 8 |
| game_records | started_at | timestamptz | YES | now() | 9 |
| game_records | completed_at | timestamptz | YES |  | 10 |
| game_records | puzzle_id | text | NO |  | 11 |
| games | id | text | NO |  | 1 |
| games | date | text | NO |  | 2 |
| games | theme_title | text | NO |  | 3 |
| games | category_a | text | NO |  | 4 |
| games | category_b | text | NO |  | 5 |
| games | category_a_color | text | YES |  | 6 |
| games | category_b_color | text | YES |  | 7 |
| games | category_a_image | text | YES |  | 8 |
| games | category_b_image | text | YES |  | 9 |
| games | header_image | text | YES |  | 10 |
| games | status | text | NO | 'draft'::text | 11 |
| games | questions | jsonb | NO | '[]'::jsonb | 12 |
| games | created_at | timestamptz | YES | now() | 13 |
| games | updated_at | timestamptz | YES | now() | 14 |
| games | category_a_share_name | text | YES |  | 15 |
| games | category_b_share_name | text | YES |  | 16 |
| games | tags | _text | NO | '{}'::text[] | 17 |
| games | category_a_subtitle | text | YES |  | 18 |
| games | category_b_subtitle | text | YES |  | 19 |
| games | category_a_button_name | text | YES |  | 20 |
| games | category_b_button_name | text | YES |  | 21 |
| guest_handoffs | code_hash | text | NO |  | 1 |
| guest_handoffs | guest_player_id | uuid | NO |  | 2 |
| guest_handoffs | created_at | timestamptz | NO | now() | 3 |
| guest_handoffs | expires_at | timestamptz | NO | (now() + '01:00:00'::interval) | 4 |
| player_stats | player_id | uuid | NO |  | 1 |
| player_stats | current_streak | int4 | NO | 0 | 2 |
| player_stats | longest_streak | int4 | NO | 0 | 3 |
| player_stats | last_played_date | text | YES |  | 4 |
| player_stats | total_played | int4 | NO | 0 | 5 |
| player_stats | total_correct | int4 | NO | 0 | 6 |
| player_stats | total_questions | int4 | NO | 0 | 7 |
| player_stats | best_combo | int4 | NO | 0 | 8 |
| player_stats | updated_at | timestamptz | YES | now() | 9 |
| players | id | uuid | NO |  | 1 |
| players | created_at | timestamptz | YES | now() | 2 |
| players | email | text | YES |  | 3 |
| players | is_guest | bool | NO | true | 4 |
| players | last_seen_at | timestamptz | NO | now() | 5 |
| puzzle_favorite_counts | puzzle_id | text | NO |  | 1 |
| puzzle_favorite_counts | favorite_count | int4 | NO | 0 | 2 |
| puzzle_favorite_counts | updated_at | timestamptz | NO | now() | 3 |
| puzzle_favorites | player_id | uuid | NO |  | 1 |
| puzzle_favorites | puzzle_id | text | NO |  | 2 |
| puzzle_favorites | created_at | timestamptz | NO | now() | 3 |
| puzzle_stats | total_finished | int4 | NO | 0 | 2 |
| puzzle_stats | total_score | int4 | NO | 0 | 3 |
| puzzle_stats | perfect_count | int4 | NO | 0 | 4 |
| puzzle_stats | total_questions | int4 | NO | 0 | 5 |
| puzzle_stats | question_correct_counts | jsonb | NO | '[]'::jsonb | 6 |
| puzzle_stats | question_answer_counts | jsonb | NO | '[]'::jsonb | 7 |
| puzzle_stats | score_histogram | jsonb | NO | '{}'::jsonb | 8 |
| puzzle_stats | updated_at | timestamptz | NO | now() | 9 |
| puzzle_stats | puzzle_id | text | NO |  | 10 |

## constraints

| table_name | conname | contype | definition |
| --- | --- | --- | --- |
| accounts | accounts_global_user_id_format | c | CHECK ((global_user_id ~ '^user_[0-9A-Za-z]{10,64}$'::text)) |
| accounts | accounts_global_user_id_key | u | UNIQUE (global_user_id) |
| accounts | accounts_pkey | p | PRIMARY KEY (user_id) |
| accounts | accounts_user_id_fkey | f | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| admins | admins_pkey | p | PRIMARY KEY (user_id) |
| admins | admins_user_id_fkey | f | FOREIGN KEY (user_id) REFERENCES accounts(user_id) ON DELETE CASCADE |
| game_records | game_records_pkey | p | PRIMARY KEY (id) |
| game_records | game_records_player_id_fkey | f | FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE |
| game_records | game_records_player_puzzle_key | u | UNIQUE (player_id, puzzle_id) |
| game_records | game_records_puzzle_id_fkey | f | FOREIGN KEY (puzzle_id) REFERENCES games(id) ON DELETE RESTRICT |
| games | games_pkey | p | PRIMARY KEY (id) |
| games | games_published_date_iso | c | CHECK (((status <> 'published'::text) OR (date ~ '^\d{4}-\d{2}-\d{2}$'::text))) |
| games | games_status_check | c | CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'retired'::text]))) |
| guest_handoffs | guest_handoffs_guest_player_id_fkey | f | FOREIGN KEY (guest_player_id) REFERENCES players(id) ON DELETE CASCADE |
| guest_handoffs | guest_handoffs_pkey | p | PRIMARY KEY (code_hash) |
| player_stats | player_stats_pkey | p | PRIMARY KEY (player_id) |
| player_stats | player_stats_player_id_fkey | f | FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE |
| players | players_id_fkey | f | FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE |
| players | players_pkey | p | PRIMARY KEY (id) |
| puzzle_favorite_counts | puzzle_favorite_counts_favorite_count_check | c | CHECK ((favorite_count >= 0)) |
| puzzle_favorite_counts | puzzle_favorite_counts_pkey | p | PRIMARY KEY (puzzle_id) |
| puzzle_favorite_counts | puzzle_favorite_counts_puzzle_id_fkey | f | FOREIGN KEY (puzzle_id) REFERENCES games(id) ON DELETE CASCADE |
| puzzle_favorites | puzzle_favorites_pkey | p | PRIMARY KEY (player_id, puzzle_id) |
| puzzle_favorites | puzzle_favorites_player_id_fkey | f | FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE |
| puzzle_favorites | puzzle_favorites_puzzle_id_fkey | f | FOREIGN KEY (puzzle_id) REFERENCES games(id) ON DELETE CASCADE |
| puzzle_stats | puzzle_stats_pkey | p | PRIMARY KEY (puzzle_id) |
| puzzle_stats | puzzle_stats_puzzle_id_fkey | f | FOREIGN KEY (puzzle_id) REFERENCES games(id) ON DELETE CASCADE |

## indexes

| tablename | indexname | indexdef |
| --- | --- | --- |
| accounts | accounts_global_user_id_key | CREATE UNIQUE INDEX accounts_global_user_id_key ON public.accounts USING btree (global_user_id) |
| accounts | accounts_pkey | CREATE UNIQUE INDEX accounts_pkey ON public.accounts USING btree (user_id) |
| admins | admins_pkey | CREATE UNIQUE INDEX admins_pkey ON public.admins USING btree (user_id) |
| game_records | game_records_pkey | CREATE UNIQUE INDEX game_records_pkey ON public.game_records USING btree (id) |
| game_records | game_records_player_puzzle_key | CREATE UNIQUE INDEX game_records_player_puzzle_key ON public.game_records USING btree (player_id, puzzle_id) |
| game_records | game_records_puzzle_completed_idx | CREATE INDEX game_records_puzzle_completed_idx ON public.game_records USING btree (puzzle_id) WHERE completed |
| games | games_one_published_per_date | CREATE UNIQUE INDEX games_one_published_per_date ON public.games USING btree (date) WHERE (status = 'published'::text) |
| games | games_pkey | CREATE UNIQUE INDEX games_pkey ON public.games USING btree (id) |
| guest_handoffs | guest_handoffs_pkey | CREATE UNIQUE INDEX guest_handoffs_pkey ON public.guest_handoffs USING btree (code_hash) |
| player_stats | player_stats_pkey | CREATE UNIQUE INDEX player_stats_pkey ON public.player_stats USING btree (player_id) |
| players | players_pkey | CREATE UNIQUE INDEX players_pkey ON public.players USING btree (id) |
| puzzle_favorite_counts | puzzle_favorite_counts_pkey | CREATE UNIQUE INDEX puzzle_favorite_counts_pkey ON public.puzzle_favorite_counts USING btree (puzzle_id) |
| puzzle_favorites | puzzle_favorites_pkey | CREATE UNIQUE INDEX puzzle_favorites_pkey ON public.puzzle_favorites USING btree (player_id, puzzle_id) |
| puzzle_favorites | puzzle_favorites_puzzle_idx | CREATE INDEX puzzle_favorites_puzzle_idx ON public.puzzle_favorites USING btree (puzzle_id) |
| puzzle_stats | puzzle_stats_pkey | CREATE UNIQUE INDEX puzzle_stats_pkey ON public.puzzle_stats USING btree (puzzle_id) |

## functions

| proname | args | result | security_definer | definition |
| --- | --- | --- | --- | --- |
| account_email | _user_id uuid | text | true | CREATE OR REPLACE FUNCTION public.account_email(_user_id uuid)  RETURNS text  LANGUAGE sql  STABLE SECURITY DEFINER  SET search_path TO 'public' AS $function$   select coalesce(     (select nullif(btrim(i.identity_data ->> 'email'), '')        from auth.identities i       where i.user_id = _user_id  |
| best_combo | _answers jsonb | integer | false | CREATE OR REPLACE FUNCTION public.best_combo(_answers jsonb)  RETURNS integer  LANGUAGE plpgsql  IMMUTABLE AS $function$ declare   _best integer := 0;   _cur integer := 0;   _el jsonb; begin   if _answers is null or jsonb_typeof(_answers) <> 'array' then     return 0;   end if;   for _el in select * |
| bump_jsonb_array_value | source jsonb, array_index integer, bump_by integer | jsonb | false | CREATE OR REPLACE FUNCTION public.bump_jsonb_array_value(source jsonb, array_index integer, bump_by integer DEFAULT 1)  RETURNS jsonb  LANGUAGE plpgsql AS $function$ declare   working jsonb := coalesce(source, '[]'::jsonb);   current_length integer := coalesce(jsonb_array_length(working), 0);    |
| bump_jsonb_object_count | source jsonb, bucket text, bump_by integer | jsonb | false | CREATE OR REPLACE FUNCTION public.bump_jsonb_object_count(source jsonb, bucket text, bump_by integer DEFAULT 1)  RETURNS jsonb  LANGUAGE sql AS $function$   select jsonb_set(     coalesce(source, '{}'::jsonb),     array[bucket],     to_jsonb(coalesce((coalesce(source, '{}'::jsonb) ->> bucket)::i |
| decline_guest_history | _code text | TABLE(outcome text) | true | CREATE OR REPLACE FUNCTION public.decline_guest_history(_code text)  RETURNS TABLE(outcome text)  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public', 'extensions' AS $function$ declare   _uid uuid := public.wtf_uid();   _rows integer; begin   if _uid is null then     return query select |
| delete_local_account | _user_id uuid | void | true | CREATE OR REPLACE FUNCTION public.delete_local_account(_user_id uuid)  RETURNS void  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ declare   _puzzles text[];   _pid text; begin   if _user_id is null then     return;   end if;   perform set_config('wtf.defer_stats', 'o |
| delete_my_account |  | boolean | true | CREATE OR REPLACE FUNCTION public.delete_my_account()  RETURNS boolean  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ declare   _uid uuid := public.wtf_uid(); begin   if _uid is null then     return false;   end if;   perform public.delete_local_account(_uid);   retur |
| ensure_account |  | TABLE(outcome text, user_id uuid, global_user_id text, email text, created_at timestamp with time zone) | true | CREATE OR REPLACE FUNCTION public.ensure_account()  RETURNS TABLE(outcome text, user_id uuid, global_user_id text, email text, created_at timestamp with time zone)  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ #variable_conflict use_column declare   _uid uuid := auth |
| game_records_assign_puzzle |  | trigger | true | CREATE OR REPLACE FUNCTION public.game_records_assign_puzzle()  RETURNS trigger  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ begin   if tg_op = 'UPDATE' then     -- A play never moves to another puzzle.     new.puzzle_id := old.puzzle_id;     return new;   end |
| guest_history_summary | _player_id uuid | TABLE(plays integer, finished integer, current_streak integer, longest_streak integer, favorites integer) | true | CREATE OR REPLACE FUNCTION public.guest_history_summary(_player_id uuid)  RETURNS TABLE(plays integer, finished integer, current_streak integer, longest_streak integer, favorites integer)  LANGUAGE sql  STABLE SECURITY DEFINER  SET search_path TO 'public' AS $function$   select (select count(*)::int |
| handle_completed_game_record |  | trigger | true | CREATE OR REPLACE FUNCTION public.handle_completed_game_record()  RETURNS trigger  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ begin   if coalesce(current_setting('wtf.defer_stats', true), '') = 'on' then     return null;   end if;    if tg_op = 'DELETE' then |
| import_guest_history | _code text | TABLE(outcome text, plays_moved integer, plays_dropped integer, favorites_moved integer) | true | CREATE OR REPLACE FUNCTION public.import_guest_history(_code text)  RETURNS TABLE(outcome text, plays_moved integer, plays_dropped integer, favorites_moved integer)  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public', 'extensions' AS $function$ #variable_conflict use_column declare   _u |
| is_wtf_admin |  | boolean | true | CREATE OR REPLACE FUNCTION public.is_wtf_admin()  RETURNS boolean  LANGUAGE sql  STABLE SECURITY DEFINER  SET search_path TO 'public' AS $function$   select exists (select 1 from public.admins ad where ad.user_id = public.wtf_uid()) $function$  |
| my_account |  | TABLE(user_id uuid, global_user_id text, email text, created_at timestamp with time zone) | true | CREATE OR REPLACE FUNCTION public.my_account()  RETURNS TABLE(user_id uuid, global_user_id text, email text, created_at timestamp with time zone)  LANGUAGE sql  STABLE SECURITY DEFINER  SET search_path TO 'public' AS $function$   select a.user_id, a.global_user_id, public.account_email(a.user_id), a |
| offer_guest_history |  | TABLE(outcome text, code text, plays integer, finished integer, current_streak integer, longest_streak integer, favorites integer) | true | CREATE OR REPLACE FUNCTION public.offer_guest_history()  RETURNS TABLE(outcome text, code text, plays integer, finished integer, current_streak integer, longest_streak integer, favorites integer)  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public', 'extensions' AS $function$ #variable_c |
| ping |  | boolean | false | CREATE OR REPLACE FUNCTION public.ping()  RETURNS boolean  LANGUAGE sql  STABLE  SET search_path TO 'public' AS $function$ select true $function$  |
| puzzle_favorites_count |  | trigger | true | CREATE OR REPLACE FUNCTION public.puzzle_favorites_count()  RETURNS trigger  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ begin   if tg_op = 'INSERT' then     insert into public.puzzle_favorite_counts as c (puzzle_id, favorite_count, updated_at)     values (new.p |
| rebuild_puzzle_stats |  | void | true | CREATE OR REPLACE FUNCTION public.rebuild_puzzle_stats()  RETURNS void  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ declare   pid text; begin   delete from public.puzzle_stats ps    where not exists (select 1 from public.game_records r                       wh |
| rebuild_puzzle_stats_for | target_puzzle_id text | void | true | CREATE OR REPLACE FUNCTION public.rebuild_puzzle_stats_for(target_puzzle_id text)  RETURNS void  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ begin   if target_puzzle_id is null then     return;   end if;    -- One rebuild of a puzzle at a time (simultaneous-fi |
| recompute_player_stats | _player_id uuid | void | true | CREATE OR REPLACE FUNCTION public.recompute_player_stats(_player_id uuid)  RETURNS void  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ declare   _played integer;   _correct integer;   _asked integer;   _combo integer;   _last text;   _dates date[];   _longest integer  |
| resolve_guest_handoff | _code text | TABLE(outcome text, plays integer, finished integer, current_streak integer, longest_streak integer, favorites integer, account_has_history boolean) | true | CREATE OR REPLACE FUNCTION public.resolve_guest_handoff(_code text)  RETURNS TABLE(outcome text, plays integer, finished integer, current_streak integer, longest_streak integer, favorites integer, account_has_history boolean)  LANGUAGE plpgsql  STABLE SECURITY DEFINER  SET search_path TO 'public', ' |
| set_puzzle_favorite | target_puzzle_id text, favorite boolean | integer | false | CREATE OR REPLACE FUNCTION public.set_puzzle_favorite(target_puzzle_id text, favorite boolean)  RETURNS integer  LANGUAGE plpgsql  SET search_path TO 'public' AS $function$ declare   me uuid := auth.uid();   total integer; begin   if me is null then     raise exception 'Sign in (or play as a g |
| set_updated_at |  | trigger | false | CREATE OR REPLACE FUNCTION public.set_updated_at()  RETURNS trigger  LANGUAGE plpgsql AS $function$ begin   new.updated_at = now();   return new; end; $function$  |
| wtf_uid |  | uuid | true | CREATE OR REPLACE FUNCTION public.wtf_uid()  RETURNS uuid  LANGUAGE sql  STABLE SECURITY DEFINER  SET search_path TO 'public' AS $function$   select a.user_id     from public.accounts a    where a.user_id = auth.uid() $function$  |

## function_privs

| proname | anon_exec | authenticated_exec |
| --- | --- | --- |
| account_email | false | false |
| best_combo | false | false |
| bump_jsonb_array_value | true | true |
| bump_jsonb_object_count | true | true |
| decline_guest_history | false | true |
| delete_local_account | false | false |
| delete_my_account | false | true |
| ensure_account | false | true |
| game_records_assign_puzzle | false | false |
| guest_history_summary | false | false |
| handle_completed_game_record | false | false |
| import_guest_history | false | true |
| is_wtf_admin | true | true |
| my_account | false | true |
| offer_guest_history | false | true |
| ping | true | true |
| puzzle_favorites_count | false | false |
| rebuild_puzzle_stats | false | false |
| rebuild_puzzle_stats_for | false | false |
| recompute_player_stats | false | false |
| resolve_guest_handoff | false | true |
| set_puzzle_favorite | false | true |
| set_updated_at | true | true |
| wtf_uid | true | true |

## triggers

| table_name | tgname | def |
| --- | --- | --- |
| game_records | game_records_assign_puzzle | CREATE TRIGGER game_records_assign_puzzle BEFORE INSERT OR UPDATE ON public.game_records FOR EACH ROW EXECUTE FUNCTION game_records_assign_puzzle() |
| game_records | game_records_completed_stats | CREATE TRIGGER game_records_completed_stats AFTER INSERT OR DELETE OR UPDATE ON public.game_records FOR EACH ROW EXECUTE FUNCTION handle_completed_game_record() |
| games | games_set_updated_at | CREATE TRIGGER games_set_updated_at BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| player_stats | player_stats_set_updated_at | CREATE TRIGGER player_stats_set_updated_at BEFORE UPDATE ON public.player_stats FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| puzzle_favorites | puzzle_favorites_count | CREATE TRIGGER puzzle_favorites_count AFTER INSERT OR DELETE ON public.puzzle_favorites FOR EACH ROW EXECUTE FUNCTION puzzle_favorites_count() |
| puzzle_stats | puzzle_stats_set_updated_at | CREATE TRIGGER puzzle_stats_set_updated_at BEFORE UPDATE ON public.puzzle_stats FOR EACH ROW EXECUTE FUNCTION set_updated_at() |

## policies

| tablename | policyname | permissive | roles | cmd | qual | with_check |
| --- | --- | --- | --- | --- | --- | --- |
| game_records | game records insert own rows | PERMISSIVE | authenticated | INSERT |  | (auth.uid() = player_id) |
| game_records | game records own rows | PERMISSIVE | authenticated | SELECT | (auth.uid() = player_id) |  |
| game_records | game records update own rows | PERMISSIVE | authenticated | UPDATE | (auth.uid() = player_id) | (auth.uid() = player_id) |
| games | games_admin_delete | PERMISSIVE | authenticated | DELETE | is_wtf_admin() |  |
| games | games_admin_insert | PERMISSIVE | authenticated | INSERT |  | is_wtf_admin() |
| games | games_admin_update | PERMISSIVE | authenticated | UPDATE | is_wtf_admin() | is_wtf_admin() |
| games | games_read_all | PERMISSIVE | anon,authenticated | SELECT | true |  |
| player_stats | player stats insert own rows | PERMISSIVE | authenticated | INSERT |  | (auth.uid() = player_id) |
| player_stats | player stats own rows | PERMISSIVE | authenticated | SELECT | (auth.uid() = player_id) |  |
| player_stats | player stats update own rows | PERMISSIVE | authenticated | UPDATE | (auth.uid() = player_id) | (auth.uid() = player_id) |
| players | players create profile | PERMISSIVE | authenticated | INSERT |  | (auth.uid() = id) |
| players | players own profile | PERMISSIVE | authenticated | SELECT | (auth.uid() = id) |  |
| players | players update profile | PERMISSIVE | authenticated | UPDATE | (auth.uid() = id) | (auth.uid() = id) |
| puzzle_favorite_counts | puzzle favorite counts are readable | PERMISSIVE | anon,authenticated | SELECT | true |  |
| puzzle_favorites | puzzle favorites delete own rows | PERMISSIVE | authenticated | DELETE | (auth.uid() = player_id) |  |
| puzzle_favorites | puzzle favorites insert own rows | PERMISSIVE | authenticated | INSERT |  | (auth.uid() = player_id) |
| puzzle_favorites | puzzle favorites own rows | PERMISSIVE | authenticated | SELECT | (auth.uid() = player_id) |  |
| puzzle_stats | puzzle stats are readable | PERMISSIVE | anon,authenticated | SELECT | true |  |

## storage_policies

| policyname | roles | cmd | qual | with_check |
| --- | --- | --- | --- | --- |
| Admins can delete images | authenticated | DELETE | ((bucket_id = 'wtf-images'::text) AND is_wtf_admin()) |  |
| Admins can upload images | authenticated | INSERT |  | ((bucket_id = 'wtf-images'::text) AND is_wtf_admin()) |
| Anyone can read images | public | SELECT | (bucket_id = 'wtf-images'::text) |  |

## rls

| table_name | rls_enabled |
| --- | --- |
| accounts | true |
| admins | true |
| game_records | true |
| games | true |
| guest_handoffs | true |
| player_stats | true |
| players | true |
| puzzle_favorite_counts | true |
| puzzle_favorites | true |
| puzzle_stats | true |

## table_acl

| relname | relacl |
| --- | --- |
| accounts | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres} |
| admins | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres} |
| game_records | {postgres=arwdDxtm/postgres,authenticated=arwm/postgres,service_role=arwdDxtm/postgres} |
| game_records_id_seq | {postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres} |
| games | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,anon=r/postgres,authenticated=arwd/postgres} |
| guest_handoffs | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres} |
| player_stats | {postgres=arwdDxtm/postgres,authenticated=arwm/postgres,service_role=arwdDxtm/postgres} |
| players | {postgres=arwdDxtm/postgres,authenticated=arwm/postgres,service_role=arwdDxtm/postgres} |
| puzzle_favorite_counts | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres} |
| puzzle_favorites | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=ard/postgres} |
| puzzle_stats | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres} |

## extensions

| extname | extversion |
| --- | --- |
| pg_stat_statements | 1.11 |
| pgcrypto | 1.3 |
| plpgsql | 1.0 |
| supabase_vault | 0.3.1 |
| uuid-ossp | 1.1 |

## migration_ledger

| version | name |
| --- | --- |
| 0001 | wtf_baseline |
| 0002 | wtf_player_lockdown |
| 0003 | wtf_admin_gate |

## auth_counts

| users | anonymous_users | users_with_email | identities_by_provider |
| --- | --- | --- | --- |
| 206 | 154 | 52 | email x1, custom:platform x1 |

## player_counts

| players | plays | finished_plays | player_stats | puzzle_stats | favorites |
| --- | --- | --- | --- | --- | --- |
| 205 | 769 | 757 | 7 | 17 | 1 |

## account_counts

| accounts | admins |
| --- | --- |
| 1 | 1 |

## storage

| id | public | objects |
| --- | --- | --- |
| wtf-images | true | 410 |
