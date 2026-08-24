import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { DayRoute, LatLng, RouteLeg, TravelMode } from '@/lib/domain/types';
import { naverDirections } from '@/lib/providers/naver';
import { googleDirections } from '@/lib/providers/google';
import type { DirectionsProvider, RouteLegResult } from '@/lib/providers/types';
import { createAdminSupabase } from '@/lib/supabase/server';
import { estimateDurationSeconds, haversine } from '@/lib/routing/geo';

interface Body {
  dayId: string;
  waypoints: Array<{ stopId: string; location: LatLng }>;
  travelMode: TravelMode;
  departAt?: string;
}

/**
 * POST /api/routes/calculate
 * 순서가 확정된 경유지들의 구간별 거리/시간/폴리라인을 계산한다.
 *
 * ── 무료 티어에서 이 엔드포인트가 가장 위험한 지점인 이유 ──
 * Directions 호출은 구간 수에 비례해 늘고, 사용자가 순서를 만질 때마다 재계산된다.
 * 하루 8곳 일정을 10번 만지면 70콜이다. 무료 쿼터가 며칠이면 소진된다.
 *
 * 방어 3단:
 * 1) route_leg_cache — 좌표쌍+이동수단 해시로 DB 캐시. 같은 구간은 영원히 재사용.
 *    (도로는 자주 바뀌지 않으므로 캐시 수명을 길게 가져가도 된다)
 * 2) 제공자 폴백 — 네이버 쿼터가 막히면 구글로, 둘 다 막히면 직선 추정으로.
 *    "경로를 못 그림"보다 "대략적인 시간이라도 보여줌"이 언제나 낫다.
 * 3) 병렬 호출 — 구간들은 서로 독립이므로 순차 대기할 이유가 없다.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const { dayId, waypoints, travelMode, departAt } = body;

  if (!waypoints || waypoints.length < 2) {
    return NextResponse.json(
      { dayId, legs: [], totalDistanceMeters: 0, totalDurationSeconds: 0 } satisfies DayRoute,
    );
  }

  const pairs = waypoints.slice(0, -1).map((from, i) => ({ from, to: waypoints[i + 1] }));

  const legs = await Promise.all(
    pairs.map(async ({ from, to }): Promise<RouteLeg> => {
      const result = await resolveLeg(from.location, to.location, travelMode, departAt);
      return {
        fromStopId: from.stopId,
        toStopId: to.stopId,
        travelMode,
        distanceMeters: result.distanceMeters,
        durationSeconds: result.durationSeconds,
        path: result.path,
      };
    }),
  );

  const route: DayRoute = {
    dayId,
    legs,
    totalDistanceMeters: legs.reduce((s, l) => s + l.distanceMeters, 0),
    totalDurationSeconds: legs.reduce((s, l) => s + l.durationSeconds, 0),
  };

  return NextResponse.json(route);
}

/** 캐시 → 제공자 → 직선 추정 순으로 내려가는 단일 구간 해결기. */
async function resolveLeg(
  origin: LatLng,
  destination: LatLng,
  mode: TravelMode,
  departAt?: string,
): Promise<RouteLegResult> {
  const key = cacheKey(origin, destination, mode);
  const db = createAdminSupabase();

  const { data: cached } = await db
    .from('route_leg_cache')
    .select('distance_m,duration_s,path')
    .eq('cache_key', key)
    .maybeSingle();

  if (cached) {
    return {
      distanceMeters: cached.distance_m,
      durationSeconds: cached.duration_s,
      path: (cached.path ?? []) as LatLng[],
    };
  }

  // 국내 자동차는 네이버가 실시간 교통 반영이 좋고, 그 외는 구글만 가능하다.
  const providers: DirectionsProvider[] =
    mode === 'driving' ? [naverDirections, googleDirections] : [googleDirections];

  for (const provider of providers) {
    if (!provider.supports(mode)) continue;
    try {
      const result = await provider.route({ origin, destination, mode, departAt });
      // 캐시 쓰기 실패가 응답을 막으면 안 된다 — 성공 경로를 우선한다.
      void db
        .from('route_leg_cache')
        .upsert(
          {
            cache_key: key,
            from_lat: origin.lat,
            from_lng: origin.lng,
            to_lat: destination.lat,
            to_lng: destination.lng,
            mode,
            distance_m: result.distanceMeters,
            duration_s: result.durationSeconds,
            path: result.path,
            provider: provider.id,
          },
          { onConflict: 'cache_key' },
        )
        .then(() => undefined);
      return result;
    } catch {
      continue; // 다음 제공자로
    }
  }

  // 최종 폴백: 직선 + 우회 계수. 정확하진 않지만 일정 감각은 유지된다.
  return {
    distanceMeters: Math.round(haversine(origin, destination) * 1.35),
    durationSeconds: estimateDurationSeconds(origin, destination, mode),
    path: [origin, destination],
  };
}

/**
 * 좌표를 소수점 5자리(약 1m)로 반올림해 해싱한다.
 * 반올림하지 않으면 부동소수점 마지막 자리 차이로 캐시가 거의 안 맞는다.
 */
function cacheKey(a: LatLng, b: LatLng, mode: string): string {
  const r = (n: number) => n.toFixed(5);
  return createHash('sha1')
    .update(`${r(a.lat)},${r(a.lng)}|${r(b.lat)},${r(b.lng)}|${mode}`)
    .digest('hex');
}
