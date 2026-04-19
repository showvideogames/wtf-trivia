create or replace function public.rebuild_single_puzzle_stats(target_game_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.puzzle_stats
  where game_date = target_game_date;

  insert into public.puzzle_stats (
    game_date,
    total_finished,
    total_score,
    perfect_count,
    total_questions,
    question_correct_counts,
    question_answer_counts,
    score_histogram,
    updated_at
  )
  with completed_records as (
    select *
    from public.game_records
    where completed = true
      and game_date::date = target_game_date
  ),
  base as (
    select
      target_game_date::date as game_date,
      count(*)::int as total_finished,
      coalesce(sum(score), 0)::int as total_score,
      count(*) filter (
        where total_questions > 0 and score = total_questions
      )::int as perfect_count,
      coalesce(max(total_questions), 0)::int as total_questions
    from completed_records
  ),
  idxs as (
    select generate_series(
      0,
      greatest((select total_questions from base) - 1, 0)
    ) as idx
  ),
  question_rollup as (
    select
      i.idx,
      count(a.elem)::int as answered_count,
      count(*) filter (
        where coalesce((a.elem ->> 'correct')::boolean, false)
      )::int as correct_count
    from idxs i
    left join completed_records cr on true
    left join lateral (
      select elem
      from jsonb_array_elements(cr.answers) with ordinality arr(elem, ord)
      where ord = i.idx + 1
    ) a on true
    group by i.idx
    order by i.idx
  ),
  score_rollup as (
    select score::text as bucket, count(*)::int as count_value
    from completed_records
    group by score
    order by score
  )
  select
    b.game_date,
    b.total_finished,
    b.total_score,
    b.perfect_count,
    b.total_questions,
    case
      when b.total_questions > 0 then (
        select jsonb_agg(q.correct_count order by q.idx)
        from question_rollup q
      )
      else '[]'::jsonb
    end as question_correct_counts,
    case
      when b.total_questions > 0 then (
        select jsonb_agg(q.answered_count order by q.idx)
        from question_rollup q
      )
      else '[]'::jsonb
    end as question_answer_counts,
    coalesce(
      (select jsonb_object_agg(s.bucket, s.count_value) from score_rollup s),
      '{}'::jsonb
    ) as score_histogram,
    now()
  from base b
  where b.total_finished > 0;
end;
$$;

create or replace function public.handle_completed_game_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completed and (
    tg_op = 'insert'
    or not coalesce(old.completed, false)
    or old.score is distinct from new.score
    or old.answers is distinct from new.answers
    or old.total_questions is distinct from new.total_questions
  ) then
    perform public.rebuild_single_puzzle_stats(new.game_date::date);
  end if;
  return new;
end;
$$;

create or replace function public.rebuild_puzzle_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d date;
begin
  truncate table public.puzzle_stats;

  for d in
    select distinct game_date
    from public.game_records
    where completed = true
    order by game_date
  loop
    perform public.rebuild_single_puzzle_stats(d::date);
  end loop;
end;
$$;

drop trigger if exists game_records_completed_stats on public.game_records;
create trigger game_records_completed_stats
after insert or update on public.game_records
for each row
execute function public.handle_completed_game_record();

select public.rebuild_puzzle_stats();
