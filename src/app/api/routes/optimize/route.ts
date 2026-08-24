import { NextResponse } from 'next/server';
import type { LatLng, TravelMode } from '@/lib/domain/types';
import { optimizeOrder } from '@/lib/routing/optimize';

interface Body {
  dayId: string;
  waypoints: Array<{ stopId: string; location: LatLng }>;
  travelMode: TravelMode;
  fixFirst?: boolean;
  fixLast?: boolean;
}

/**
 * POST /api/routes/optimize
 * 방문 순서만 최적화해 돌려준다. 실제 경로 계산은 하지 않는다.
 *
 * 왜 계산과 분리했는가:
 * 최적화는 근사 비용 행렬만 있으면 되므로 외부 API 호출이 0회다.
 * 여기서 경로까지 같이 계산해버리면, 사용자가 최적화 결과를 되돌릴 때
 * 이미 태운 API 쿼터를 회수할 수 없다.
 * → "순서 제안 → 사용자 확인 → 그때 경로 계산"이 쿼터와 UX 양쪽에 유리하다.
 *
 * 참고: optimizeOrder는 순수 함수라 클라이언트에서도 실행 가능하다.
 * 지점이 12개 이하라면 이 엔드포인트를 부르지 말고 브라우저에서 돌리는 편이
 * Vercel 함수 호출 수를 아낀다. 이 라우트는 서버 렌더링/공유 링크 등
 * 클라이언트 실행이 불가능한 경로를 위한 것이다.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const { waypoints, travelMode, fixFirst = true, fixLast = false } = body;

  if (!waypoints || waypoints.length < 3) {
    return NextResponse.json({
      orderedStopIds: (waypoints ?? []).map((w) => w.stopId),
    });
  }

  const orderedStopIds = optimizeOrder({
    points: waypoints.map((w) => ({ id: w.stopId, location: w.location })),
    mode: travelMode,
    fixFirst,
    fixLast,
  });

  return NextResponse.json({ orderedStopIds });
}
