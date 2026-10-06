-- LOCAL DEVELOPMENT ONLY. `supabase db reset` runs this after the migrations;
-- the hosted project never does. Three published sample puzzles ending today
-- (server date) plus one draft, each with a few questions, so the daily game,
-- Archive, Studio and the database tests have content. Accounts, admins,
-- players and plays start empty, exactly like a blank project.

insert into public.games (id, date, theme_title, category_a, category_b, category_a_color, category_b_color, status, tags, questions)
select 'g-seed-' || d, to_char(current_date - d, 'YYYY-MM-DD'), t.title, t.a, t.b, '#FF9A3C', '#B98CFF', 'published', '{music}',
  jsonb_build_array(
    jsonb_build_object('id', 'q1', 'itemText', t.q1, 'correctCategory', 'A', 'flavorCopy', '', 'explanationCopy', '', 'imageUrl', '', 'imageAlt', '', 'imageSource', ''),
    jsonb_build_object('id', 'q2', 'itemText', t.q2, 'correctCategory', 'B', 'flavorCopy', '', 'explanationCopy', '', 'imageUrl', '', 'imageAlt', '', 'imageSource', ''),
    jsonb_build_object('id', 'q3', 'itemText', t.q3, 'correctCategory', 'A', 'flavorCopy', '', 'explanationCopy', '', 'imageUrl', '', 'imageAlt', '', 'imageSource', ''),
    jsonb_build_object('id', 'q4', 'itemText', t.q4, 'correctCategory', 'B', 'flavorCopy', '', 'explanationCopy', '', 'imageUrl', '', 'imageAlt', '', 'imageSource', '')
  )
from (values
  (0, 'Led Zeppelin OR My Little Pony Song?', 'Led Zeppelin', 'My Little Pony', 'Kashmir', 'Smile Song', 'Black Dog', 'Winter Wrap Up'),
  (1, 'Board Game OR Nicolas Cage Movie?', 'Board Game', 'Nicolas Cage Movie', 'Catan', 'Mandy', 'Carcassonne', 'Pig'),
  (2, 'Pokémon OR Dinosaur?', 'Pokémon', 'Dinosaur', 'Aerodactyl', 'Troodon', 'Tyrunt', 'Suchomimus')
) as t(d, title, a, b, q1, q2, q3, q4)
on conflict (id) do nothing;

insert into public.games (id, date, theme_title, category_a, category_b, status, questions)
values ('g-seed-draft', '', 'Muppet OR Rapper?', 'Muppet', 'Rapper', 'draft', '[]'::jsonb)
on conflict (id) do nothing;
