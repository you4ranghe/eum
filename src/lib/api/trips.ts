'use client';

import { createClient } from '@/lib/supabase/client';
import { toPlace, type PlaceRow } from '@/lib/supabase/mappers';
import { eachDateString } from '@/lib/time/dates';
import type { Place, Trip, TripDay, TripStop } from '@/lib/domain/types';

/**
 * ─────────────────────────────────────────────────────────────
 * 여행 데이터 접근 계층.
 *
 * Route Handler를 거치지 않고 Supabase를 직접 부르는 이유:
 * 1) RLS가 이미 "본인 데이터만"을 강제하므로 서버에서 다시 검사할 게 없다.
 *    래퍼를 하나 더 두면 코드만 늘고 보안은 그대로다.
 * 2) Vercel Hobby의 실질 한도는 함수 호출 수와 대역폭이다.
 *    일정 편집처럼 자주 일어나는 쓰기를 전부 함수로 태우면 한도를 빨리 태운다.
 *    → Supabase로 직행하면 Vercel 함수 호출이 0이다.
 *
 * 반대로 외부 API 키가 필요한 작업(검색/경로)만 Route Handler에 남겼다.
 * "비밀이 필요한가?"가 서버 경유 여부의 유일한 기준이다.
 * ─────────────────────────────────────────────────────────────
 */

/** 중첩 select로 여행/날짜/지점/장소를 한 번에 가져온다 (N+1 방지). */
const TRIP_SELECT = `
  id, title, region_code, timezone, start_date, end_date,
  trip_day (
    id, day_number, date, title,
    trip_stop (
      id, sort_order, planned_arrival, stay_minutes, travel_mode, memo,
      place ( * )
    )
  )
`;

export async function getTrip(tripId: string): Promise<Trip> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('trip')
    .select(TRIP_SELECT)
    .eq('id', tripId)
    .single();

  if (error) throw error;
  return toTrip(data as unknown as TripRow);
}

export async function listTrips(): Promise<Trip[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('trip')
    .select(TRIP_SELECT)
    .order('start_date', { ascending: false });

  if (error) throw error;
  return (data as unknown as TripRow[]).map(toTrip);
}

/**
 * 여행 생성 시 날짜 행을 미리 만들어 둔다.
 * "2박 3일이면 탭이 3개"라는 UI 전제를 DB가 보장하게 하는 편이,
 * 화면에서 매번 날짜를 계산하는 것보다 안전하다.
 */
export async function createTrip(input: {
  title: string;
  regionCode: string;
  timezone: string;
  startDate: string;
  endDate: string;
}): Promise<Trip> {
  const supabase = createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('로그인이 필요합니다');

  const { data: trip, error } = await supabase
    .from('trip')
    .insert({
      owner_id: user.user.id,
      title: input.title,
      region_code: input.regionCode,
      timezone: input.timezone,
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .select('id')
    .single();

  if (error) throw error;

  const days = eachDateString(input.startDate, input.endDate).map((date, i) => ({
    trip_id: trip.id,
    day_number: i + 1,
    date,
  }));
  const { error: dayError } = await supabase.from('trip_day').insert(days);
  if (dayError) throw dayError;

  return getTrip(trip.id);
}

/**
 * 지점 추가. 장소가 아직 DB에 없으면 먼저 place를 upsert한다.
 *
 * upsert를 쓰는 이유: 같은 장소를 두 사용자가 동시에 담으면 insert는 유니크 충돌로 죽는다.
 * (provider, provider_id) 기준 upsert면 경합이 있어도 한 행으로 수렴한다.
 */
export async function addStop(
  tripDayId: string,
  place: Place,
  sortOrder: number,
  stayMinutes: number,
): Promise<void> {
  const supabase = createClient();
  const placeId = await ensurePlace(place);

  const { error } = await supabase.from('trip_stop').insert({
    trip_day_id: tripDayId,
    place_id: placeId,
    sort_order: sortOrder,
    stay_minutes: stayMinutes,
  });
  if (error) throw error;
}

async function ensurePlace(place: Place): Promise<string> {
  const supabase = createClient();
  // 이미 우리 DB의 UUID라면 그대로 사용 (tmp_ 접두사는 외부 검색 결과)
  if (!place.id.startsWith('tmp_')) return place.id;

  const provider = place.externalRefs?.naverPlaceId ? 'naver' : 'google';
  const providerId =
    place.externalRefs?.naverPlaceId ??
    place.externalRefs?.googlePlaceId ??
    place.id.replace(/^tmp_[a-z]+_/, '');

  const { data, error } = await supabase
    .from('place')
    .upsert(
      {
        provider,
        provider_id: providerId,
        name: place.name,
        address: place.address,
        road_address: place.roadAddress ?? null,
        lat: place.location.lat,
        lng: place.location.lng,
        category: place.category,
        phone: place.phone ?? null,
        rating: place.rating ?? null,
        region_code: place.regionCode,
        timezone: place.timezone,
        always_open: place.alwaysOpen ?? false,
        opening_periods: place.openingPeriods ?? [],
      },
      { onConflict: 'provider,provider_id' },
    )
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * 순서 일괄 갱신.
 * sort_order 유니크 제약을 deferrable로 걸어둔 덕분에,
 * 트랜잭션 안에서 임시 음수값 우회 없이 그대로 스왑할 수 있다.
 */
export async function reorderStops(
  tripDayId: string,
  orderedStopIds: string[],
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc('reorder_trip_stops', {
    p_trip_day_id: tripDayId,
    p_stop_ids: orderedStopIds,
  });
  if (error) throw error;
}

export async function updateStop(
  stopId: string,
  patch: Partial<Pick<TripStop, 'plannedArrival' | 'stayMinutes' | 'travelMode' | 'memo'>>,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('trip_stop')
    .update({
      ...(patch.plannedArrival !== undefined ? { planned_arrival: patch.plannedArrival } : {}),
      ...(patch.stayMinutes !== undefined ? { stay_minutes: patch.stayMinutes } : {}),
      ...(patch.travelMode !== undefined ? { travel_mode: patch.travelMode } : {}),
      ...(patch.memo !== undefined ? { memo: patch.memo } : {}),
    })
    .eq('id', stopId);
  if (error) throw error;
}

export async function removeStop(stopId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('trip_stop').delete().eq('id', stopId);
  if (error) throw error;
}

// ── 행 → 도메인 변환 ──────────────────────────────────────────

interface TripRow {
  id: string;
  title: string;
  region_code: string;
  timezone: string;
  start_date: string;
  end_date: string;
  trip_day: Array<{
    id: string;
    day_number: number;
    date: string;
    title: string | null;
    trip_stop: Array<{
      id: string;
      sort_order: number;
      planned_arrival: string | null;
      stay_minutes: number;
      travel_mode: TripStop['travelMode'];
      memo: string | null;
      place: PlaceRow;
    }>;
  }>;
}

function toTrip(row: TripRow): Trip {
  const days: TripDay[] = [...row.trip_day]
    .sort((a, b) => a.day_number - b.day_number)
    .map((d) => ({
      id: d.id,
      date: d.date,
      dayNumber: d.day_number,
      title: d.title ?? undefined,
      stops: [...d.trip_stop]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({
          id: s.id,
          placeId: s.place.id,
          place: toPlace(s.place),
          order: s.sort_order,
          plannedArrival: s.planned_arrival?.slice(0, 5), // "09:00:00" → "09:00"
          stayMinutes: s.stay_minutes,
          travelMode: s.travel_mode,
          memo: s.memo ?? undefined,
        })),
    }));

  return {
    id: row.id,
    title: row.title,
    regionCode: row.region_code,
    timezone: row.timezone,
    startDate: row.start_date,
    endDate: row.end_date,
    days,
  };
}

// 날짜 계산은 lib/time/dates.ts 로 일원화했다.
// 여기저기 흩어지면 UTC/로컬 혼용 버그가 반드시 재발한다.
