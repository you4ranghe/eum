-- ═══════════════════════════════════════════════════════════════
-- RPC 함수 + 알림 스케줄러
-- ═══════════════════════════════════════════════════════════════

-- ── 방문 순서 일괄 재정렬 ────────────────────────────────────────
-- 클라이언트에서 UPDATE를 N번 보내면 그 사이 상태가 유니크 제약을 위반한다.
-- 하나의 함수(=하나의 트랜잭션) 안에서 처리하면 deferrable 제약이
-- 커밋 시점에만 검사되므로 중간 상태가 문제되지 않는다.
--
-- security invoker(기본값)를 유지하는 게 중요하다:
-- definer로 만들면 RLS를 우회해 남의 일정도 재정렬할 수 있게 된다.
create or replace function public.reorder_trip_stops(
  p_trip_day_id uuid,
  p_stop_ids    uuid[]
) returns void
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  update public.trip_stop ts
  set sort_order = arr.idx - 1          -- 배열은 1-base, sort_order는 0-base
  from unnest(p_stop_ids) with ordinality as arr(stop_id, idx)
  where ts.id = arr.stop_id
    and ts.trip_day_id = p_trip_day_id; -- 다른 날짜의 지점이 섞여 들어오는 것을 차단
end;
$fn$;

-- ── 알람 멱등 재생성 ────────────────────────────────────────────
-- 일정이 바뀌면 해당 날짜의 미발송 알람을 전부 지우고 새로 넣는다.
-- 이미 보낸 알람(sent_at is not null)은 남겨 이력을 보존한다.
create or replace function public.replace_day_alarms(
  p_trip_day_id uuid,
  p_alarms      jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  delete from public.alarm
  where trip_day_id = p_trip_day_id and sent_at is null;

  insert into public.alarm (user_id, trip_day_id, trip_stop_id, kind, title, body, fire_at)
  select
    auth.uid(),
    p_trip_day_id,
    nullif(a->>'stopId','')::uuid,
    a->>'kind',
    a->>'title',
    a->>'body',
    (a->>'fireAt')::timestamptz
  from jsonb_array_elements(p_alarms) as a
  -- 이미 지난 시각의 알람은 넣지 않는다. 넣으면 워커가 즉시 전부 발송해버린다.
  where (a->>'fireAt')::timestamptz > now();
end;
$fn$;

-- ═══════════════════════════════════════════════════════════════
-- 알림 발송 스케줄러
--
-- Vercel Hobby(무료)의 Cron은 하루 1회만 실행된다.
-- "출발 10분 전 알림"은 분 단위 정확도가 필요하므로 Vercel Cron으로는 불가능하다.
--
-- → Supabase 무료 플랜에 포함된 pg_cron + pg_net을 쓴다.
--   DB가 1분마다 스스로 깨어나 미발송 알람을 Edge Function으로 넘긴다.
--   무료 티어에서 분 단위 스케줄링을 얻는 유일한 경로다.
--
-- 아래 두 블록은 Supabase 대시보드에서 Extensions를 활성화한 뒤 실행할 것.
-- (pg_cron은 postgres 데이터베이스에만 설치 가능)
-- ═══════════════════════════════════════════════════════════════

-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'dispatch-alarms',
--   '* * * * *',
--   $cron$
--     select net.http_post(
--       url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/dispatch-alarms',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--       ),
--       body    := '{}'::jsonb
--     );
--   $cron$
-- );

-- Edge Function이 처리할 대상을 고르는 뷰.
-- 함수 쪽에서 매번 조건을 재작성하지 않도록 조회 로직을 DB에 고정한다.
create or replace view public.pending_alarms as
select a.id, a.user_id, a.title, a.body, a.fire_at
from public.alarm a
where a.sent_at is null
  and a.fire_at <= now()
  -- 5분 넘게 밀린 건은 이미 의미가 없다. 서버 장애 복구 시 알림 폭탄을 막는다.
  and a.fire_at > now() - interval '5 minutes';
