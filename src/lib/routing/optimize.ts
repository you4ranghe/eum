import type { LatLng } from '@/lib/domain/types';
import { estimateDurationSeconds } from '@/lib/routing/geo';

export interface OptimizeInput {
  /** 방문 지점들 (현재 순서) */
  points: Array<{ id: string; location: LatLng }>;
  mode: string;
  /** 첫 지점 고정 (보통 숙소/공항 출발) */
  fixFirst?: boolean;
  /** 마지막 지점 고정 (보통 숙소 복귀) */
  fixLast?: boolean;
}

/**
 * ═══════════════════════════════════════════════════════════════
 * 방문 순서 최적화 — Nearest Neighbor + 2-opt
 *
 * 이 문제는 TSP(외판원 문제)다. 정확해는 지수 시간이라 실무에선 근사한다.
 *
 * 왜 이 조합인가:
 * - Nearest Neighbor: O(N²)로 "그럴듯한" 초기 해를 즉시 만든다.
 *   단독으로는 최적해 대비 25% 정도 나쁘지만, 시작점으로는 충분하다.
 * - 2-opt: 경로에서 교차하는 두 구간을 뒤집어 개선한다.
 *   NN 결과에 적용하면 보통 최적해의 5% 이내로 수렴한다.
 *
 * 하루 일정의 방문지는 현실적으로 3~12개다.
 * 이 규모에서 2-opt는 브라우저에서도 수 밀리초로 끝나므로,
 * 무료 티어에서 서버 시간을 쓰지 않고 클라이언트에서 돌려도 된다.
 * (그래서 이 파일은 서버/클라이언트 양쪽에서 import 가능한 순수 함수다)
 *
 * fixFirst/fixLast를 지원하는 이유:
 * 실제 여행은 "숙소에서 출발해 숙소로 돌아온다"가 기본이다.
 * 양 끝을 고정하지 않으면 알고리즘이 숙소를 한가운데로 옮겨버린다.
 * ═══════════════════════════════════════════════════════════════
 */
export function optimizeOrder(input: OptimizeInput): string[] {
  const { points, mode, fixFirst = true, fixLast = false } = input;
  if (points.length <= 3) return points.map((p) => p.id);

  // 비용 행렬을 한 번만 만든다 — 2-opt가 같은 쌍을 수천 번 조회하므로
  // 매번 haversine을 계산하면 그게 병목이 된다.
  const n = points.length;
  const cost: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = estimateDurationSeconds(points[i].location, points[j].location, mode);
      cost[i][j] = d;
      cost[j][i] = d;
    }
  }

  // 고정 구간을 제외한 "움직일 수 있는" 인덱스 범위
  const head = fixFirst ? [0] : [];
  const tail = fixLast ? [n - 1] : [];
  const movable = points
    .map((_, i) => i)
    .filter((i) => !head.includes(i) && !tail.includes(i));

  // ── 1) Nearest Neighbor로 초기 순서 구성 ──
  let tour = [...head];
  const remaining = new Set(movable);
  let current = head.length ? head[0] : movable[0];
  if (!head.length) {
    tour.push(current);
    remaining.delete(current);
  }

  while (remaining.size > 0) {
    let best = -1;
    let bestCost = Infinity;
    for (const cand of remaining) {
      if (cost[current][cand] < bestCost) {
        bestCost = cost[current][cand];
        best = cand;
      }
    }
    tour.push(best);
    remaining.delete(best);
    current = best;
  }
  tour = [...tour, ...tail];

  // ── 2) 2-opt 개선 ──
  // 고정된 양 끝은 뒤집기 대상에서 제외한다.
  const lo = fixFirst ? 1 : 0;
  const hi = fixLast ? tour.length - 2 : tour.length - 1;

  const tourCost = (t: number[]) =>
    t.slice(0, -1).reduce((sum, v, i) => sum + cost[v][t[i + 1]], 0);

  let improved = true;
  let guard = 0;
  // guard: 부동소수점 미세 진동으로 무한 루프에 빠지지 않도록 상한을 둔다.
  while (improved && guard++ < 100) {
    improved = false;
    for (let i = lo; i < hi; i++) {
      for (let k = i + 1; k <= hi; k++) {
        // [i..k] 구간을 뒤집었을 때의 변화량만 계산 (전체 재계산 불필요)
        const a = tour[i - 1];
        const b = tour[i];
        const c = tour[k];
        const d = tour[k + 1];
        if (a === undefined || d === undefined) continue;

        const delta = cost[a][c] + cost[b][d] - (cost[a][b] + cost[c][d]);
        if (delta < -1) {
          const reversed = tour.slice(i, k + 1).reverse();
          tour = [...tour.slice(0, i), ...reversed, ...tour.slice(k + 1)];
          improved = true;
        }
      }
    }
  }

  void tourCost; // 디버깅/테스트에서 개선폭 측정용으로 남겨둔다
  return tour.map((i) => points[i].id);
}
