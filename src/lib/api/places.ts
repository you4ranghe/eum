import { api } from '@/lib/api/client';
import type { DayRoute, LatLng, Place, TravelMode } from '@/lib/domain/types';
import { optimizeOrder } from '@/lib/routing/optimize';

/**
 * 외부 API 키가 필요한 작업만 Route Handler를 경유한다.
 * (여행 CRUD는 lib/api/trips.ts에서 Supabase로 직행 — 서버 함수 호출 0회)
 */

export interface PlaceSearchParams {
  query: string;
  regionCode: string;
  /** 지도 중심 — 사용자가 보고 있는 곳 근처를 먼저 보여준다 */
  near?: LatLng;
}

export function searchPlaces(params: PlaceSearchParams): Promise<Place[]> {
  const qs = new URLSearchParams({
    query: params.query,
    regionCode: params.regionCode,
    ...(params.near
      ? { lat: String(params.near.lat), lng: String(params.near.lng) }
      : {}),
  });
  return api.get<Place[]>(`/places/search?${qs}`);
}

export interface RouteRequest {
  dayId: string;
  waypoints: Array<{ stopId: string; location: LatLng }>;
  travelMode: TravelMode;
  /** 출발 시각 (ISO). 대중교통/실시간 교통 반영에 필요 */
  departAt?: string;
}

/** 순서가 확정된 경유지들의 구간별 거리·시간·폴리라인 계산 */
export function calculateRoute(body: RouteRequest): Promise<DayRoute> {
  return api.post<DayRoute>('/routes/calculate', body);
}

/**
 * 방문 순서 최적화.
 *
 * 지점이 적으면 서버를 부르지 않고 브라우저에서 바로 계산한다.
 * 알고리즘이 순수 함수(외부 API 0회)이므로 서버에서 돌릴 이유가 없고,
 * Vercel 무료 티어의 함수 호출 수를 그만큼 아낀다.
 * 지점이 많아지면 계산량이 커져 메인 스레드를 막으므로 서버로 넘긴다.
 */
const CLIENT_SIDE_LIMIT = 12;

export async function optimizeStopOrder(
  body: RouteRequest & { fixFirst?: boolean; fixLast?: boolean },
): Promise<string[]> {
  if (body.waypoints.length <= CLIENT_SIDE_LIMIT) {
    return optimizeOrder({
      points: body.waypoints.map((w) => ({ id: w.stopId, location: w.location })),
      mode: body.travelMode,
      fixFirst: body.fixFirst ?? true,
      fixLast: body.fixLast ?? false,
    });
  }
  const res = await api.post<{ orderedStopIds: string[] }>('/routes/optimize', body);
  return res.orderedStopIds;
}
