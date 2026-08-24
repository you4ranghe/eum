-- ═══════════════════════════════════════════════════════════════
-- 이음(Eum) 초기 스키마
--
-- 설계 원칙
-- 1) place는 "전역 캐시", trip_stop은 "사용자 소유". 둘을 분리한 이유:
--    같은 성산일출봉을 1000명이 담아도 좌표/영업시간은 한 행이면 된다.
--    외부 API 호출 횟수와 저장 용량(무료 500MB)을 동시에 아낀다.
-- 2) 권한은 애플리케이션이 아니라 RLS로 강제한다.
--    anon 키가 브라우저에 노출되는 구조이므로, DB가 최후의 방어선이어야 한다.
-- 3) 지역 확장은 스키마 변경 없이 region_code/timezone 컬럼 값으로 처리한다.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- 열거형: 도메인 값을 DB 레벨에서 고정해 오타성 데이터를 차단한다.
create type place_category as enum
  ('attraction','restaurant','cafe','accommodation','transport','shopping','etc');

create type travel_mode as enum ('driving','walking','transit');

-- ═══════════════════ 장소 (전역 캐시) ═══════════════════
create table public.place (
  id            uuid primary key default gen_random_uuid(),
  -- 외부 제공자 ID. 같은 장소를 중복 저장하지 않기 위한 자연키.
  provider      text not null check (provider in ('naver','google','manual')),
  provider_id   text not null,
  name          text not null,
  address       text not null,
  road_address  text,
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  category      place_category not null default 'etc',
  phone         text,
  rating        numeric(2,1) check (rating between 0 and 5),
  region_code   text not null,
  timezone      text not null default 'Asia/Seoul',
  always_open   boolean not null default false,
  -- 영업시간은 요일 배열 구조라 정규화 테이블로 쪼개면 조인 비용만 커진다.
  -- 항상 통째로 읽고 통째로 쓰므로 jsonb가 적합하다.
  opening_periods jsonb not null default '[]'::jsonb,
  fetched_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (provider, provider_id)
);

-- 지도 영역 검색용. PostGIS 없이도 bounding box 질의를 커버한다.
-- (PostGIS도 무료 티어에서 쓸 수 있지만, 확장 없이 시작하는 편이 이식성이 좋다)
create index place_region_idx on public.place (region_code);
create index place_bbox_idx   on public.place (lat, lng);
create index place_name_idx   on public.place using gin (to_tsvector('simple', name));

-- ═══════════════════ 여행 ═══════════════════
create table public.trip (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  region_code text not null default 'jeju',
  timezone    text not null default 'Asia/Seoul',
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index trip_owner_idx on public.trip (owner_id, start_date desc);

-- ═══════════════════ 날짜 ═══════════════════
create table public.trip_day (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trip(id) on delete cascade,
  day_number int  not null check (day_number > 0),
  date       date not null,
  title      text,
  unique (trip_id, day_number)
);
create index trip_day_trip_idx on public.trip_day (trip_id, day_number);

-- ═══════════════════ 방문 지점 ═══════════════════
create table public.trip_stop (
  id               uuid primary key default gen_random_uuid(),
  trip_day_id      uuid not null references public.trip_day(id) on delete cascade,
  place_id         uuid not null references public.place(id) on delete restrict,
  -- 같은 날짜 안에서의 방문 순서. 0부터 연속. 재정렬 시 일괄 갱신된다.
  sort_order       int  not null check (sort_order >= 0),
  planned_arrival  time,
  stay_minutes     int  not null default 60 check (stay_minutes >= 0),
  travel_mode      travel_mode not null default 'driving',
  memo             text,
  created_at       timestamptz not null default now(),
  -- 재정렬 중 일시적 중복을 허용해야 하므로 deferrable로 둔다.
  -- 즉시 검사하면 1번과 2번을 맞바꾸는 단순 연산조차 임시값 우회가 필요해진다.
  constraint trip_stop_order_uniq unique (trip_day_id, sort_order) deferrable initially deferred
);
create index trip_stop_day_idx on public.trip_stop (trip_day_id, sort_order);

-- ═══════════════════ 구간 경로 캐시 ═══════════════════
-- Directions API는 호출당 과금되고 무료 쿼터가 빠듯하다.
-- 좌표쌍과 이동수단을 키로 캐시해 같은 구간의 재계산을 막는다.
create table public.route_leg_cache (
  id          uuid primary key default gen_random_uuid(),
  cache_key   text not null unique,   -- sha1(from,to,mode) — 애플리케이션이 생성
  from_lat    double precision not null,
  from_lng    double precision not null,
  to_lat      double precision not null,
  to_lng      double precision not null,
  mode        travel_mode not null,
  distance_m  int not null,
  duration_s  int not null,
  path        jsonb not null default '[]'::jsonb,
  provider    text not null,
  created_at  timestamptz not null default now()
);
create index route_leg_cache_created_idx on public.route_leg_cache (created_at);

-- ═══════════════════ 알림 ═══════════════════
-- 브라우저가 닫혀도 알림이 가야 하므로 예약을 서버(DB)에 둔다.
-- pg_cron이 1분마다 미발송 건을 골라 Edge Function으로 Web Push를 보낸다.
create table public.push_subscription (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create table public.alarm (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  trip_day_id  uuid not null references public.trip_day(id) on delete cascade,
  trip_stop_id uuid references public.trip_stop(id) on delete cascade,
  kind         text not null check (kind in ('depart_soon','arrive_soon','closing_soon')),
  title        text not null,
  body         text not null,
  fire_at      timestamptz not null,
  sent_at      timestamptz,
  -- 일정이 수정되면 해당 날짜의 알람을 통째로 지우고 다시 넣는다(멱등 재생성).
  -- 부분 갱신 로직을 두면 고아 알람이 반드시 생긴다.
  created_at   timestamptz not null default now()
);
-- 미발송 건만 스캔하는 부분 인덱스 — 발송 완료 건이 쌓여도 조회가 느려지지 않는다.
create index alarm_pending_idx on public.alarm (fire_at) where sent_at is null;

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════
alter table public.trip              enable row level security;
alter table public.trip_day          enable row level security;
alter table public.trip_stop         enable row level security;
alter table public.place             enable row level security;
alter table public.route_leg_cache   enable row level security;
alter table public.alarm             enable row level security;
alter table public.push_subscription enable row level security;

-- 여행: 소유자만 전권
create policy trip_owner_all on public.trip
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 날짜와 지점은 부모 여행의 소유권을 따라간다.
-- EXISTS 서브쿼리는 인덱스를 타므로 조인 정책보다 실행 계획이 안정적이다.
create policy trip_day_owner_all on public.trip_day
  for all using (exists (
    select 1 from public.trip t where t.id = trip_id and t.owner_id = auth.uid()
  ));

create policy trip_stop_owner_all on public.trip_stop
  for all using (exists (
    select 1 from public.trip_day d
    join public.trip t on t.id = d.trip_id
    where d.id = trip_day_id and t.owner_id = auth.uid()
  ));

-- 장소와 경로 캐시는 공용 자산이므로 읽기는 전체 허용, 쓰기는 서버만.
-- service_role 키는 RLS를 우회하므로 쓰기 정책을 따로 두지 않는다.
create policy place_read_all on public.place for select using (true);
create policy route_cache_read_all on public.route_leg_cache for select using (true);

-- 알림: 본인 것만
create policy alarm_owner_all on public.alarm
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_sub_owner_all on public.push_subscription
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ═══════════════════ 유틸 트리거 ═══════════════════
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end $fn$;

create trigger trip_touch before update on public.trip
  for each row execute function public.touch_updated_at();
