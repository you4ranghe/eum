import type { LatLng } from '@/lib/domain/types';

const EARTH_RADIUS_M = 6_371_000;

/** 두 좌표의 대권거리(m). 외부 API 없이 즉시 계산되는 하한값. */
export function haversine(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * 직선거리 → 예상 소요시간(초) 추정.
 *
 * 왜 이런 게 필요한가:
 * 최적화 알고리즘은 N개 지점에 대해 N² 쌍의 비용을 알아야 하는데,
 * 이걸 전부 Directions API로 부르면 10개 지점만 돼도 90콜이다.
 * 무료 쿼터를 그 자리에서 태우고, 응답도 몇 초씩 걸린다.
 *
 * → 순서 탐색은 이 근사값으로 하고, 확정된 순서의 N-1개 구간만
 *   실제 API로 정밀 계산한다. 콜 수가 O(N²)에서 O(N)으로 떨어진다.
 *
 * detourFactor: 실제 도로는 직선보다 길다. 지역/이동수단별 경험적 보정값.
 */
const PROFILE: Record<string, { speedKmh: number; detour: number }> = {
  driving: { speedKmh: 45, detour: 1.35 },
  walking: { speedKmh: 4.5, detour: 1.25 },
  transit: { speedKmh: 25, detour: 1.5 },
};

export function estimateDurationSeconds(
  a: LatLng,
  b: LatLng,
  mode: keyof typeof PROFILE | string = 'driving',
): number {
  const p = PROFILE[mode] ?? PROFILE.driving;
  const meters = haversine(a, b) * p.detour;
  return Math.round((meters / ((p.speedKmh * 1000) / 3600)));
}
