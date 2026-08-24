'use client';

import { create } from 'zustand';
import type { DayRoute, Place, Trip, TripStop, TravelMode } from '@/lib/domain/types';
import { fromMinutes, toMinutes } from '@/lib/time/openingHours';

/**
 * 일정 상태 저장소.
 *
 * 핵심 설계: 서버가 진실의 원천(source of truth)이지만,
 * 순서 변경/시간 조정은 드래그마다 서버 왕복을 하면 UX가 죽는다.
 * → 로컬에서 즉시 반영(optimistic)하고, 별도 debounce로 저장한다.
 *   그래서 스토어는 "일정 편집 연산"을 도메인 메서드로 노출한다.
 */
interface TripState {
  trip: Trip | null;
  /** 현재 선택된 날짜 탭 */
  selectedDayId: string | null;
  /** dayId → 계산된 동선 (서버 Directions 결과 캐시) */
  routes: Record<string, DayRoute>;
  isDirty: boolean;

  setTrip: (trip: Trip) => void;
  selectDay: (dayId: string) => void;
  setRoute: (dayId: string, route: DayRoute) => void;

  addStop: (dayId: string, place: Place, opts?: Partial<TripStop>) => void;
  removeStop: (dayId: string, stopId: string) => void;
  reorderStops: (dayId: string, fromIndex: number, toIndex: number) => void;
  updateStop: (dayId: string, stopId: string, patch: Partial<TripStop>) => void;
  setTravelMode: (dayId: string, stopId: string, mode: TravelMode) => void;
  markSaved: () => void;
}

export const useTripStore = create<TripState>()((set, get) => ({
  trip: null,
  selectedDayId: null,
  routes: {},
  isDirty: false,

  setTrip: (trip) =>
    set({
      trip,
      selectedDayId: trip.days[0]?.id ?? null,
      routes: {},
      isDirty: false,
    }),

  selectDay: (selectedDayId) => set({ selectedDayId }),
  setRoute: (dayId, route) => set((s) => ({ routes: { ...s.routes, [dayId]: route } })),

  addStop: (dayId, place, opts) =>
    set((s) =>
      mutateDay(s, dayId, (stops) => [
        ...stops,
        {
          id: `stop_${crypto.randomUUID()}`,
          placeId: place.id,
          place,
          order: stops.length,
          stayMinutes: opts?.stayMinutes ?? defaultStayMinutes(place),
          travelMode: opts?.travelMode ?? 'driving',
          plannedArrival: opts?.plannedArrival,
          memo: opts?.memo,
        },
      ]),
    ),

  removeStop: (dayId, stopId) =>
    set((s) => mutateDay(s, dayId, (stops) => stops.filter((st) => st.id !== stopId))),

  reorderStops: (dayId, fromIndex, toIndex) =>
    set((s) =>
      mutateDay(s, dayId, (stops) => {
        const next = [...stops];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      }),
    ),

  updateStop: (dayId, stopId, patch) =>
    set((s) =>
      mutateDay(s, dayId, (stops) =>
        stops.map((st) => (st.id === stopId ? { ...st, ...patch } : st)),
      ),
    ),

  setTravelMode: (dayId, stopId, mode) => get().updateStop(dayId, stopId, { travelMode: mode }),

  markSaved: () => set({ isDirty: false }),
}));

/**
 * 날짜 하나의 stops를 변환하고 order를 재정규화하는 공통 헬퍼.
 * order를 배열 인덱스에서 파생시켜, 추가/삭제/재정렬 후에도
 * "order는 항상 0..n-1 연속"이라는 불변식이 깨지지 않게 한다.
 */
function mutateDay(
  state: TripState,
  dayId: string,
  fn: (stops: TripStop[]) => TripStop[],
): Partial<TripState> {
  if (!state.trip) return {};
  const days = state.trip.days.map((day) =>
    day.id === dayId
      ? { ...day, stops: fn(day.stops).map((st, i) => ({ ...st, order: i })) }
      : day,
  );
  // 순서가 바뀌면 기존 동선 계산은 무효 → 해당 날짜 캐시만 폐기
  const { [dayId]: _dropped, ...restRoutes } = state.routes;
  return { trip: { ...state.trip, days }, routes: restRoutes, isDirty: true };
}

/** 카테고리별 기본 체류시간. 사용자가 매번 입력하지 않아도 되게 하는 기본값. */
function defaultStayMinutes(place: Place): number {
  switch (place.category) {
    case 'restaurant': return 60;
    case 'cafe': return 40;
    case 'attraction': return 90;
    case 'shopping': return 60;
    case 'accommodation': return 0;
    default: return 45;
  }
}

/**
 * 도착 예정 시각 자동 계산.
 * 사용자가 첫 지점 시간만 정하면 나머지는 (체류시간 + 이동시간)으로 파생된다.
 * 명시적으로 plannedArrival을 지정한 지점은 그 값을 기준점으로 다시 잡는다.
 */
export function computeSchedule(
  stops: TripStop[],
  route: DayRoute | undefined,
  startTime = '09:00',
): Array<{ stopId: string; arrival: string; departure: string; isFixed: boolean }> {
  const legBySeq = new Map(route?.legs.map((l) => [`${l.fromStopId}>${l.toStopId}`, l]) ?? []);
  const result: Array<{ stopId: string; arrival: string; departure: string; isFixed: boolean }> = [];

  let cursor = toMinutes(stops[0]?.plannedArrival ?? startTime);

  stops.forEach((stop, i) => {
    if (stop.plannedArrival) cursor = toMinutes(stop.plannedArrival);
    const arrival = cursor;
    const departure = arrival + stop.stayMinutes;
    result.push({
      stopId: stop.id,
      arrival: fromMinutes(arrival),
      departure: fromMinutes(departure),
      isFixed: Boolean(stop.plannedArrival),
    });

    const next = stops[i + 1];
    if (next) {
      const leg = legBySeq.get(`${stop.id}>${next.id}`);
      const travelMin = leg ? Math.round(leg.durationSeconds / 60) : 0;
      cursor = departure + travelMin;
    }
  });

  return result;
}
